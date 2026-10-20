import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { windowsRuntime } from './desktop.mjs'
import { launcherScript, windowsQuote } from './windows-launcher.mjs'

if (process.platform !== 'linux' || !process.env.WSL_DISTRO_NAME) throw new Error('Install the Windows launcher from WSL with Windows interop enabled.')
const root = fileURLToPath(new URL('..', import.meta.url))
const powershell = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const win = value => execFileSync('wslpath', ['-w', value], { encoding: 'utf8' }).trim()
const runtime = await windowsRuntime()
const directory = path.dirname(path.dirname(runtime.executable))
const script = path.join(directory, 'launch.vbs')
const log = path.join(directory, 'launcher.log')
const startup = path.join(directory, 'startup.json')
await writeFile(startup, JSON.stringify({
  distro: process.env.WSL_DISTRO_NAME, root, node: process.execPath, port: Number(process.env.PORT ?? 43127),
  // A shortcut does not read interactive fish/bash/nvm startup files.
  nodePath: [path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin', `${process.env.HOME}/.kimaki/bin`].join(':'),
  windowsDirectory: win(directory), wslDirectory: directory, logPath: win(log),
}))
await writeFile(script, launcherScript({ executable: win(runtime.executable), entry: runtime.args[0], config: win(startup) }))
const windowsScript = win(script)
const folders = JSON.parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command',
  "@{ desktop=[Environment]::GetFolderPath('Desktop'); programs=[Environment]::GetFolderPath('Programs'); windows=$env:WINDIR } | ConvertTo-Json -Compress"], { encoding: 'utf8' }))
if (!folders.desktop || !folders.programs || !folders.windows) throw new Error('Windows shortcut folders are unavailable')
const config = path.join(directory, 'shortcuts.json')
await writeFile(config, JSON.stringify({
  shortcuts: [folders.desktop, folders.programs].map(folder => path.win32.join(folder, 'ThreadDeck.lnk')),
  legacyArgs: `"${windowsScript}"`,
  details: {
    target: win(runtime.executable), args: [runtime.args[0], `--launch-services=${win(startup)}`].map(windowsQuote).join(' '),
    cwd: win(directory), description: 'Start Kimaki, the WSL dashboard and the Windows ThreadDeck app',
    icon: win(path.join(path.dirname(runtime.executable), 'ThreadDeck.ico')), iconIndex: 0,
  },
}))
// Native Electron writes the Windows AppUserModelID, which WScript.Shell cannot.
const { stdout } = await promisify(execFile)(runtime.executable,
  [win(path.join(path.dirname(runtime.executable), 'install-shortcuts.cjs')), win(config)],
  { cwd: path.dirname(runtime.executable), timeout: 30_000 })
console.log(stdout.trim())
console.log('Installed. Setup did not start or restart Kimaki, OpenCode or ThreadDeck.')
