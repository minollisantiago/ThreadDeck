import { describe, expect, it } from 'vitest'
import { launchCommands, supervise } from './kimaki.mjs'

const node = code => [process.execPath, '-e', code]
const idle = node('setInterval(() => {}, 1000)')

describe('shared launcher', () => {
  it('keeps browser mode unchanged and forwards Kimaki flags', () => {
    const commands = launchCommands(['--no-analytics'])
    expect(commands).toHaveLength(2)
    expect(commands[1]).toEqual(['npx', '--yes', 'kimaki@latest', '--gateway', '--if-not-running', '--no-analytics'])
  })

  it('adds desktop mode without forwarding its internal switch to Kimaki', () => {
    const commands = launchCommands(['--desktop', '--no-analytics'])
    expect(commands).toHaveLength(3)
    expect(commands[1]).toEqual([process.execPath, 'scripts/desktop.mjs'])
    expect(commands[2]).toEqual(['npx', '--yes', 'kimaki@latest', '--gateway', '--if-not-running', '--no-analytics'])
  })

  it('stops its sibling and preserves a failed child exit code', async () => {
    const group = supervise([idle, node('process.exit(7)')], { graceMs: 100 })
    expect(await group.done).toBe(7)
  })

  it('stops the app when Kimaki exits normally', async () => {
    const group = supervise([idle, node('process.exit(0)')], { graceMs: 100 })
    expect(await group.done).toBe(0)
  })

  it('supports explicit shutdown', async () => {
    const group = supervise([idle, idle], { graceMs: 100 })
    group.stop(130)
    expect(await group.done).toBe(130)
  })

  it('cleans up when a command cannot start', async () => {
    const group = supervise([idle, ['/nonexistent/threaddeck-test-command']], { graceMs: 100 })
    expect(await group.done).toBe(1)
  })
})
