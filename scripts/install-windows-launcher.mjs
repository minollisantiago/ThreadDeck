import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { windowsRuntime } from './desktop.mjs'
import { launcherScript } from './windows-launcher.mjs'

if (process.platform !== 'linux' || !process.env.WSL_DISTRO_NAME) throw new Error('Install the Windows launcher from WSL with Windows interop enabled.')
const root = fileURLToPath(new URL('..', import.meta.url))
const powershell = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const quote = value => `'${value.replaceAll("'", "''")}'`
const win = value => execFileSync('wslpath', ['-w', value], { encoding: 'utf8' }).trim()
const runtime = await windowsRuntime()
const directory = path.dirname(path.dirname(runtime.executable))
const script = path.join(directory, 'launch.vbs')
const log = path.join(directory, 'launcher.log')
await writeFile(script, launcherScript({
  distro: process.env.WSL_DISTRO_NAME, root, node: process.execPath,
  // A shortcut does not read interactive fish/bash/nvm startup files.
  nodePath: [path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin', `${process.env.HOME}/.kimaki/bin`].join(':'),
  log,
}))
const windowsScript = win(script)
const install = `
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$arguments = '"' + ${quote(windowsScript)} + '"'
$locations = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
foreach ($folder in $locations) {
  if (!$folder) { throw 'Windows shortcut folder is unavailable' }
  $file = Join-Path $folder 'ThreadDeck.lnk'
  if (Test-Path -LiteralPath $file) {
    $existing = $shell.CreateShortcut($file)
    if ($existing.Arguments -ne $arguments) { throw "Refusing to overwrite an unrelated shortcut: $file" }
  }
}
foreach ($folder in $locations) {
  $file = Join-Path $folder 'ThreadDeck.lnk'
  $link = $shell.CreateShortcut($file)
  $link.TargetPath = Join-Path $env:WINDIR 'System32\\wscript.exe'
  $link.Arguments = $arguments
  $link.WorkingDirectory = ${quote(win(directory))}
  $link.Description = 'Start Kimaki, the WSL dashboard and the Windows ThreadDeck app'
  $link.IconLocation = ${quote(win(path.join(path.dirname(runtime.executable), 'ThreadDeck.ico')))} + ',0'
  $link.Save()
  Write-Output $file
}
`
console.log(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', install], { encoding: 'utf8' }).trim())
console.log('Installed. Setup did not start or restart Kimaki, OpenCode or ThreadDeck.')
