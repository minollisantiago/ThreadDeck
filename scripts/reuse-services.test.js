import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { existingServices, kimakiStatus, launchCommands } from './kimaki.mjs'

describe('Windows launcher with existing services', () => {
  it('recognizes the CLI offline exit code so cold startup still starts Kimaki', async () => {
    const offline = Object.assign(new Error('not running'), { code: 1, stdout: '{"running":false}' })
    await expect(kimakiStatus({}, async () => { throw offline })).resolves.toEqual({ running: false })
    await expect(kimakiStatus({}, async () => { throw new Error('missing CLI') })).rejects.toThrow('missing CLI')
  })

  it('starts all services when the dashboard port and bot are both offline', async () => {
    const server = createServer()
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    await new Promise(resolve => server.close(resolve))
    const state = await existingServices(port, async () => ({ running: false }))
    expect(state).toEqual({ backend: false, kimaki: false })
    expect(launchCommands(['--desktop', '--reuse-existing'], state)).toHaveLength(3)
  })
  it('reuses a running dashboard and Kimaki instead of binding the occupied port', async () => {
    const server = createServer((_request, response) => response.end(JSON.stringify({ health: 'connected', checkedAt: Date.now(), projects: [] })))
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const state = await existingServices(server.address().port, async () => ({ running: true }))
      expect(state).toEqual({ backend: true, kimaki: true })
      expect(launchCommands(['--desktop', '--reuse-existing'], state)).toEqual([[process.execPath, 'scripts/desktop.mjs']])
    } finally { await new Promise(resolve => server.close(resolve)) }
  })

  it('starts only missing services and strips internal shortcut flags', () => {
    const commands = launchCommands(['--desktop', '--reuse-existing', '--no-analytics'], { backend: false, kimaki: true })
    expect(commands).toHaveLength(2)
    expect(commands[0]).toContain('server/index.ts')
    expect(commands.flat()).not.toContain('npx')
    const cold = launchCommands(['--desktop', '--reuse-existing', '--no-analytics'], { backend: false, kimaki: false })
    expect(cold).toHaveLength(3)
    expect(cold[2]).toEqual(['npx', '--yes', 'kimaki@latest', '--gateway', '--if-not-running', '--no-analytics'])
  })

  it('does not mistake an unrelated HTTP service for ThreadDeck', async () => {
    const server = createServer((_request, response) => response.end('{"other":"service"}'))
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      await expect(existingServices(server.address().port, async () => ({ running: true }))).rejects.toThrow('not a ThreadDeck dashboard')
    } finally { await new Promise(resolve => server.close(resolve)) }
  })
})
