import { describe, expect, it } from 'vitest'
import { launcherScript, windowsQuote } from './windows-launcher.mjs'

const config = { executable: 'C:\\Thread Deck\\electron.exe', entry: 'C:\\Thread Deck\\main.cjs', config: 'C:\\Thread Deck\\startup.json' }

describe('Windows all-in-one shortcut', () => {
  it('opens the native client before WSL instead of waiting for services', () => {
    const script = launcherScript(config)
    expect(script).toContain('electron.exe')
    expect(script).toContain('main.cjs')
    expect(script).toContain('--launch-services=')
    expect(script).not.toContain('wsl.exe')
    expect(script).toContain(', 0, True)')
    expect(script).toContain('If code <> 0 Then')
    expect(script).not.toContain('--gateway') // Owned by the tested shared supervisor.
  })

  it('quotes Windows paths and shell apostrophes without interpolation', () => {
    expect(windowsQuote('C:\\Some Folder\\')).toBe('"C:\\Some Folder\\\\"')
    expect(windowsQuote('a"b')).toBe('"a\\"b"')
    expect(launcherScript({ ...config, entry: "C:\\O'Brien\\main.cjs" })).toContain("O'Brien")
  })

  it('rejects configuration that could inject VBScript lines', () => {
    expect(() => launcherScript({ ...config, entry: 'App\nMsgBox' })).toThrow('Invalid')
    expect(() => launcherScript({ ...config, executable: '' })).toThrow('Invalid')
  })
})
