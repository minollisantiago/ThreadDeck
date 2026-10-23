import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { Service } from '@opencode/client/service'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenCodeService, openCodeCommand } from './opencode-service.mjs'
import { supervise } from './kimaki.mjs'

const idle = [process.execPath, '-e', 'setInterval(() => {}, 1000)']
const endpoint = { url: 'http://127.0.0.1:12345' }
const services = []
const sentinels = []
afterEach(async () => {
  await Promise.all(services.splice(0).map(s => s.stop()))
  await Promise.all(sentinels.splice(0).map(async child => { const exited = once(child, 'exit'); child.kill(); await exited }))
})
function setup(options = {}) {
  const service = new OpenCodeService({ env: { ...process.env, KIMAKI_OPENCODE_SERVICE_FILE: '' },
    command: async () => idle, discover: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValue(endpoint),
    startupMs: 500, graceMs: 100, ...options })
  services.push(service)
  return service
}

describe('owned OpenCode lifecycle', () => {
  it('leaves an already-running service alive and never resolves or spawns a new binary', async () => {
    const sentinel = spawn(idle[0], idle.slice(1), { stdio: 'ignore' })
    sentinels.push(sentinel)
    const command = vi.fn()
    const service = setup({ discover: async () => endpoint, command })
    expect(await service.start()).toBe('reused')
    await service.stop()
    expect(command).not.toHaveBeenCalled()
    expect(service.child).toBeNull()
    expect(sentinel.exitCode).toBeNull()
    expect(sentinel.signalCode).toBeNull()
  })

  it('stops its actual child after the owned application processes finish', async () => {
    const service = setup()
    expect(await service.start()).toBe('started')
    const child = service.child
    const app = supervise([idle, idle], { graceMs: 100 })
    app.stop()
    await app.done
    expect(child.exitCode).toBeNull()
    await service.stop()
    expect(child.signalCode).toBe('SIGTERM')
    await service.stop() // cleanup is idempotent
  })

  it('never adopts or stops a replacement service', async () => {
    const discover = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValue(endpoint)
    const service = setup({ discover })
    await service.start()
    const replacement = spawn(idle[0], idle.slice(1), { stdio: 'ignore' })
    sentinels.push(replacement)
    discover.mockResolvedValue({ url: 'http://127.0.0.1:54321' })
    await service.stop()
    expect(replacement.exitCode).toBeNull()
    expect(replacement.signalCode).toBeNull()
    expect(discover).toHaveBeenCalledTimes(2)
  })

  it('cleans up a spawned service when startup times out', async () => {
    const service = setup({ discover: async () => undefined, startupMs: 20 })
    await expect(service.start()).rejects.toThrow('Timed out')
    expect(service.child.signalCode).toBe('SIGTERM')
  })

  it('cancels startup and cleans up a service already spawned', async () => {
    const controller = new AbortController()
    const service = setup({ discover: vi.fn().mockResolvedValueOnce(undefined).mockImplementation(async () => { controller.abort(); return undefined }) })
    await expect(service.start(controller.signal)).rejects.toThrow()
    expect(service.child.signalCode).toBe('SIGTERM')
  })

  it('does not start anything when startup was already cancelled', async () => {
    const service = setup()
    await expect(service.start(AbortSignal.abort())).rejects.toThrow()
    expect(service.child).toBeNull()
  })

  it('does not replace externally configured, unavailable services', async () => {
    const service = setup({ env: { KIMAKI_OPENCODE_SERVICE_FILE: '/external/service.json' }, discover: async () => undefined })
    await expect(service.start()).rejects.toThrow('left untouched')
    expect(service.child).toBeNull()
  })

  it('reports a missing executable without hanging cleanup', async () => {
    const service = setup({ command: async () => ['/nonexistent/threaddeck-opencode'] })
    // Wait until the spawn error is observed rather than pretending discovery succeeded.
    service.discover = async () => undefined
    await expect(service.start()).rejects.toThrow('ENOENT')
    await service.stop()
  })

  it('respects OPENCODE_PATH and never launches a V1 binary', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: 'opencode 2.0.29' })
    expect(await openCodeCommand({ OPENCODE_PATH: '/custom/opencode' }, run)).toEqual(['/custom/opencode', 'serve', '--service', '--hostname', '127.0.0.1'])
    expect(run).toHaveBeenCalledTimes(1)
    run.mockResolvedValue({ stdout: '1.2.3' })
    await expect(openCodeCommand({ OPENCODE_PATH: '/custom/opencode' }, run)).rejects.toThrow('V2 was not found')
  })

  it.each([false, true])('uses real discovery, preserves borrowers, and shuts down only its synthetic daemon (force=%s)', async force => {
    const directory = await mkdtemp(path.join(tmpdir(), 'threaddeck-service-test-'))
    const file = path.join(directory, 'service.json')
    const stopped = path.join(directory, 'stopped')
    const script = `
      const http = require('node:http'), fs = require('node:fs');
      const server = http.createServer((req, res) => res.end(JSON.stringify({ version: '2.0.29', pid: process.pid })));
      process.on('SIGTERM', () => {
        if (process.env.TEST_FORCE === 'true') return;
        fs.writeFileSync(process.env.TEST_STOPPED, 'stopped');
        server.close(() => process.exit(0));
      });
      server.listen(0, '127.0.0.1', () => {
        fs.writeFileSync(process.env.TEST_FILE, JSON.stringify({
          url: 'http://127.0.0.1:' + server.address().port, version: '2.0.29',
          pid: process.pid, inheritedAgent: process.env.SSH_AUTH_SOCK,
        }));
      });`
    const env = { ...process.env, KIMAKI_OPENCODE_SERVICE_FILE: '', TEST_FILE: file, TEST_STOPPED: stopped,
      TEST_FORCE: String(force), SSH_AUTH_SOCK: 'threaddeck-test-agent' }
    const discover = () => Service.discover({ file })
    const owner = setup({ env, discover, command: async () => [process.execPath, '-e', script], startupMs: 3000 })
    try {
      expect(await owner.start()).toBe('started')
      expect(JSON.parse(await readFile(file, 'utf8')).inheritedAgent).toBe('threaddeck-test-agent')
      const command = vi.fn()
      const borrower = setup({ env, discover, command })
      expect(await borrower.start()).toBe('reused')
      await borrower.stop()
      expect(await discover()).toBeTruthy()
      expect(command).not.toHaveBeenCalled()
      await owner.stop()
      expect(owner.child.exitCode ?? owner.child.signalCode).toBe(force ? 'SIGKILL' : 0)
      expect(await discover()).toBeUndefined()
      if (!force) expect(await readFile(stopped, 'utf8')).toBe('stopped')
    } finally { await owner.stop(); await rm(directory, { recursive: true, force: true }) }
  })
})
