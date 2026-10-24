import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { preparedFork, probeKimaki, spawnKimaki, startPreferredKimaki } from './kimaki-launcher.mjs'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
function fixture(scenarios = [], initial = { running: false }) {
  const events = [], commands = [], order = [], children = []
  let state = initial, clock = 0, index = 0
  const controller = new AbortController()
  const options = { signal: controller.signal, progress: event => events.push(event), args: ['--no-analytics'],
    probe: vi.fn(async () => state), prepare: vi.fn(async () => '/prepared/cli.js'), now: () => clock,
    wait: vi.fn(async ms => { clock += ms; controller.signal.throwIfAborted() }), startupMs: 500, regularStartupMs: 500,
    launch: (command) => {
      const scenario = scenarios[index++] || {}, mode = command[0] === 'npx' ? 'regular' : 'fork', pid = index
      commands.push(command); order.push(`start:${pid}`)
      let finish
      const child = { done: new Promise(resolve => { finish = resolve }), result: scenario.crash ? { code: 1 } : undefined,
        permanentFailure: Boolean(scenario.permanent), owns: vi.fn(async id => id === pid),
        stop: vi.fn(async () => { order.push(`stop:${pid}`); if (!scenario.leak && state.pid === pid) state = { running: false }; finish({ code: 0 }) }),
      }
      state = scenario.external || { running: true, ready: Boolean(scenario.ready), mode: scenario.mode || mode, pid }
      children.push(child)
      return child
    },
  }
  return { options, controller, commands, order, events, children, setState: value => { state = value } }
}

describe('fork-first Kimaki startup', () => {
  it('launches the prepared fork first and requires bridge readiness', async () => {
    const f = fixture([{ ready: true }])
    const running = await startPreferredKimaki(f.options)
    expect(running.mode).toBe('fork'); expect(running.reused).toBe(false)
    expect(f.commands).toEqual([[process.execPath, '/prepared/cli.js', '--gateway', '--if-not-running', '--no-analytics']])
    expect(f.events.at(-1)).toMatchObject({ state: 'ready', mode: 'fork' })
    await running.stop()
  })
  it('does not mistake a running process without the fork bridge for success', async () => {
    const f = fixture([{ ready: true, mode: 'regular' }, { ready: true }])
    const running = await startPreferredKimaki(f.options)
    expect(f.order).toEqual(['start:1', 'stop:1', 'start:2'])
    expect(running.mode).toBe('fork'); await running.stop()
  })
  it('retries exactly three times with backoff, cleans each attempt, then falls back once', async () => {
    const f = fixture([{ crash: true }, { crash: true }, { crash: true }, { ready: true }])
    const running = await startPreferredKimaki(f.options)
    expect(f.commands).toHaveLength(4)
    expect(f.order).toEqual(['start:1', 'stop:1', 'start:2', 'stop:2', 'start:3', 'stop:3', 'start:4'])
    expect(f.options.wait.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000])
    expect(f.commands[3]).toEqual(['npx', '--yes', 'kimaki@latest', '--gateway', '--if-not-running', '--no-analytics'])
    expect(f.events.at(-1)).toMatchObject({ state: 'ready', mode: 'regular', detail: 'Running regular Kimaki—desktop chat unavailable' })
    await running.stop()
  })
  it('skips retries when the prepared fork is absent', async () => {
    const f = fixture([{ ready: true }]); f.options.prepare.mockResolvedValue(null)
    const running = await startPreferredKimaki(f.options)
    expect(f.commands).toHaveLength(1); expect(f.commands[0][0]).toBe('npx')
    await running.stop()
  })
  it('skips repeated fork authentication failures and tries regular only once', async () => {
    const f = fixture([{ crash: true, permanent: true }, { ready: true }])
    const running = await startPreferredKimaki(f.options)
    expect(f.commands.map(c => c[0])).toEqual([process.execPath, 'npx'])
    expect(f.options.wait).not.toHaveBeenCalled(); await running.stop()
  })
  it.each(['fork', 'regular'])('reuses an existing healthy %s bot and never stops it', async mode => {
    const f = fixture([], { running: true, ready: true, mode, pid: 99 })
    const running = await startPreferredKimaki(f.options)
    expect(running.reused).toBe(true); expect(f.commands).toEqual([])
    await running.stop(); expect(f.children).toHaveLength(0)
  })
  it('does not replace an unready external bot', async () => {
    const f = fixture([], { running: true, ready: false, mode: 'regular', pid: 99 })
    await expect(startPreferredKimaki(f.options)).rejects.toThrow('left untouched')
    expect(f.commands).toHaveLength(0)
  })
  it('reuses a race winner rather than killing or adopting the external bot', async () => {
    const f = fixture([{ external: { running: true, ready: true, mode: 'regular', pid: 99 } }])
    const running = await startPreferredKimaki(f.options)
    expect(running.reused).toBe(true); expect(f.children[0].stop).toHaveBeenCalled()
    await running.stop(); expect(f.commands).toHaveLength(1)
  })
  it('fails closed if an owned bot does not release the lock after cleanup', async () => {
    const f = fixture([{ crash: true, leak: true }])
    await expect(startPreferredKimaki(f.options)).rejects.toThrow('Refusing to start a second bot')
    expect(f.commands).toHaveLength(1)
  })
  it('aborts backoff without launching a fallback bot', async () => {
    const f = fixture([{ crash: true }])
    f.options.wait = async () => { f.controller.abort(); f.controller.signal.throwIfAborted() }
    await expect(startPreferredKimaki(f.options)).rejects.toThrow()
    expect(f.commands).toHaveLength(1); expect(f.children[0].stop).toHaveBeenCalled()
  })
  it('stops an owned process if the window closes during readiness checks', async () => {
    const f = fixture([{}])
    f.options.wait = async () => { f.controller.abort(); f.controller.signal.throwIfAborted() }
    await expect(startPreferredKimaki(f.options)).rejects.toThrow()
    expect(f.commands).toHaveLength(1); expect(f.children[0].stop).toHaveBeenCalled()
  })
  it('reports a regular-bot startup failure without infinite retries', async () => {
    const f = fixture([{ crash: true }, { crash: true }, { crash: true }, { crash: true }])
    await expect(startPreferredKimaki(f.options)).rejects.toThrow('Regular Kimaki also failed')
    expect(f.commands).toHaveLength(4)
  })
  it('retries a transient owned-process readiness error only after cleanup', async () => {
    const f = fixture([{}, { ready: true }])
    const probe = f.options.probe
    f.options.probe = vi.fn(async (...args) => { if (f.commands.length === 1 && !f.children[0].stop.mock.calls.length) throw new Error('temporary transport error'); return probe(...args) })
    const running = await startPreferredKimaki(f.options)
    expect(f.order).toEqual(['start:1', 'stop:1', 'start:2']); await running.stop()
  })
})

describe('prepared fork and live probe (fake HTTP only)', () => {
  async function directory() {
    const root = await mkdtemp(path.join(tmpdir(), 'threaddeck-launcher-'))
    cleanups.push(() => rm(root, { recursive: true, force: true })); return root
  }
  it('requires a compatible prepared manifest and an existing executable', async () => {
    const root = await directory(), env = { THREADDECK_DATA_DIR: root }
    expect(await preparedFork(env)).toBeNull()
    const cli = path.join(root, 'cli.js'); await writeFile(cli, '// synthetic')
    await writeFile(path.join(root, 'kimaki-fork.json'), JSON.stringify({ protocol: 1, upstreamVersion: '1.4.0', cli }))
    expect(await preparedFork(env)).toBe(cli)
    await writeFile(path.join(root, 'kimaki-fork.json'), JSON.stringify({ protocol: 99, upstreamVersion: '1.4.0', cli }))
    expect(await preparedFork(env)).toBeNull()
  })
  it('distinguishes fork, regular, and not-yet-ready using authenticated probes', async () => {
    const root = await directory(); await writeFile(path.join(root, 'lock-token'), 'a'.repeat(64))
    let mode = 'fork', ready = true
    const server = createServer((request, response) => {
      if (request.url === '/health') return response.end(JSON.stringify({ status: 'ok', pid: 123 }))
      if (request.headers.authorization !== `Bearer ${'a'.repeat(64)}`) return response.writeHead(401).end()
      if (request.url === '/kimaki/status') return response.end(JSON.stringify({ pid: 123, opencode: { connected: ready }, guilds: ready ? [{}] : [] }))
      if (mode === 'regular') return response.writeHead(400).end('{}')
      response.end(JSON.stringify({ ok: true, value: { protocol: 1, ready, capabilities: ['history', 'changes', 'prompt', 'queue', 'files', 'catalog', 'abort'] } }))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => new Promise(resolve => server.close(resolve)))
    const env = { KIMAKI_DATA_DIR: root, KIMAKI_LOCK_PORT: String(server.address().port) }
    expect(await probeKimaki(env)).toMatchObject({ ready: true, mode: 'fork' })
    ready = false; expect(await probeKimaki(env)).toMatchObject({ running: true, ready: false })
    ready = true; mode = 'regular'; expect(await probeKimaki(env)).toMatchObject({ ready: true, mode: 'regular' })
  })
  it('stops only the synthetic child it started and detects permanent failures', async () => {
    const child = spawnKimaki([process.execPath, '-e', 'console.error("Invalid bot token"); setInterval(() => {}, 1000)'], { graceMs: 300 })
    cleanups.push(() => child.stop())
    await vi.waitFor(() => expect(child.permanentFailure).toBe(true))
    await child.stop()
    expect((await child.done).code).not.toBeUndefined()
  })
  it('starts and cleans up a fake fork process through the actual lock/bridge probe', async () => {
    const root = await directory(), cli = path.join(root, 'fake-kimaki.mjs')
    const reservation = createServer()
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
    const port = reservation.address().port
    await new Promise(resolve => reservation.close(resolve))
    await writeFile(path.join(root, 'lock-token'), 'b'.repeat(64))
    await writeFile(cli, `
      import {createServer} from 'node:http';
      const server = createServer((req,res)=>{
        if(req.url==='/health') return res.end(JSON.stringify({status:'ok',pid:process.pid}));
        if(req.headers.authorization!=='Bearer '+ 'b'.repeat(64)) return res.writeHead(401).end();
        if(req.url==='/kimaki/status') return res.end(JSON.stringify({pid:process.pid,opencode:{connected:true},guilds:[{}]}));
        res.end(JSON.stringify({ok:true,value:{protocol:1,ready:true,capabilities:['history','changes','prompt','queue','files','catalog','abort']}}));
      });
      server.listen(Number(process.env.KIMAKI_LOCK_PORT),'127.0.0.1');
      process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
    `)
    const env = { ...process.env, KIMAKI_DATA_DIR: root, KIMAKI_LOCK_PORT: String(port) }
    const running = await startPreferredKimaki({ env, prepare: async () => cli, startupMs: 3000,
      launch: (command, options) => {
        if (command[0] === 'npx') throw new Error('Synthetic test must never start real Kimaki')
        const child = spawnKimaki(command, options); cleanups.push(() => child.stop()); return child
      },
    })
    expect(running.mode).toBe('fork'); expect(running.reused).toBe(false)
    await running.stop()
    expect(await probeKimaki(env)).toEqual({ running: false })
  })
})
