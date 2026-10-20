import { describe, expect, it } from 'vitest'
import { launcherScript, windowsQuote } from './windows-launcher.mjs'

const config = { distro: 'Ubuntu-24.04', root: '/home/user/Thread Deck', node: '/home/user/.nvm/node', nodePath: '/home/user/.nvm:/usr/bin:/bin', log: '/mnt/c/Users/Some User/ThreadDeck/launcher.log' }

describe('Windows all-in-one shortcut', () => {
  it('launches the existing full desktop supervisor, hidden and with logging', () => {
    const script = launcherScript(config)
    expect(script).toContain('wsl.exe --distribution Ubuntu-24.04 --cd')
    expect(script).toContain('Ubuntu-24.04')
    expect(script).toContain("'/home/user/Thread Deck/scripts/kimaki.mjs' --desktop")
    expect(script).toContain("export PATH='/home/user/.nvm:/usr/bin:/bin'")
    expect(script).toContain("'/mnt/c/Users/Some User/ThreadDeck/launcher.log' 2>&1")
    expect(script).toContain(', 0, True)')
    expect(script).toContain('If code <> 0 Then')
    expect(script).not.toContain('--gateway') // Owned by the tested shared supervisor.
  })

  it('quotes Windows paths and shell apostrophes without interpolation', () => {
    expect(windowsQuote('C:\\Some Folder\\')).toBe('"C:\\Some Folder\\\\"')
    expect(windowsQuote('a"b')).toBe('"a\\"b"')
    expect(launcherScript({ ...config, root: "/home/O'Brien/Deck" })).toContain("'/home/O'\\''Brien/Deck/scripts/kimaki.mjs'")
  })

  it('rejects configuration that could inject VBScript lines', () => {
    expect(() => launcherScript({ ...config, distro: 'Ubuntu\nMsgBox' })).toThrow('Invalid')
    expect(() => launcherScript({ ...config, node: '' })).toThrow('Invalid')
  })
})
