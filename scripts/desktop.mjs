import { spawn, execFileSync } from 'node:child_process'
import { mkdir, copyFile, access, readFile, writeFile, unlink, utimes } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadArtifact } from '@electron/get'

const root = fileURLToPath(new URL('..', import.meta.url))
const powershell = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim()
const quote = value => `'${value.replaceAll("'", "''")}'`

// Keep the native app on Windows, not a UNC path into the WSL checkout.
export async function windowsRuntime() {
  const local = run(powershell, ['-NoProfile', '-NonInteractive', '-Command', '[Environment]::GetFolderPath("LocalApplicationData")'])
  const version = JSON.parse(await readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version
  const arch = run(powershell, ['-NoProfile', '-NonInteractive', '-Command', '[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture']).toLowerCase() === 'arm64' ? 'arm64' : 'x64'
  const windowsDir = `${local}\\ThreadDeck\\electron-${version}-${arch}`
  const directory = run('wslpath', ['-u', windowsDir])
  await mkdir(directory, { recursive: true })
  try { await access(path.join(directory, 'ready')) }
  catch {
    console.log('Downloading native Windows Electron (first launch only)…')
    const zip = await downloadArtifact({ version, artifactName: 'electron', platform: 'win32', arch })
    const archive = path.join(directory, 'electron.zip')
    await copyFile(zip, archive)
    run(powershell, ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${quote(`${windowsDir}\\electron.zip`)} -DestinationPath ${quote(windowsDir)} -Force; if (!$?) { exit 1 }; New-Item -ItemType File -Path ${quote(`${windowsDir}\\ready`)} -Force | Out-Null`])
  }
  for (const file of ['main.cjs', 'preload.cjs', 'policy.cjs', 'taskbar.cjs', 'install-shortcuts.cjs', 'appearance.cjs', 'startup-theme.js', 'startup.cjs', 'startup.html', 'startup.css', 'startup-ui.js', 'ThreadDeck.ico']) await copyFile(path.join(root, 'electron', file), path.join(directory, file))
  await copyFile(path.join(root, 'public/fonts/JetBrainsMono-Regular.woff2'), path.join(directory, 'JetBrainsMono-Regular.woff2'))
  return { executable: path.join(directory, 'electron.exe'), args: [`${windowsDir}\\main.cjs`] }
}

async function main() {
  if (process.platform !== 'linux' || !process.env.WSL_DISTRO_NAME) throw new Error('Run npm run desktop from WSL with Windows interop enabled.')
  const runtime = await windowsRuntime()
  const port = Number(process.env.PORT ?? 43127)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PORT')
  // Windows GUI Electron sees stdin as EOF even with a live pipe. A renewable
  // local lease works across WSL/Windows and also expires if the launcher dies.
  const lease = path.join(path.dirname(runtime.executable), `supervisor-${randomUUID()}.lease`)
  await writeFile(lease, '')
  const windowsLease = run('wslpath', ['-w', lease])
  const child = spawn(runtime.executable, [...runtime.args, `--dashboard-port=${port}`, `--supervisor-lease=${windowsLease}`], { cwd: path.dirname(runtime.executable), stdio: 'inherit' })
  const heartbeat = setInterval(() => { const now = new Date(); void utimes(lease, now, now).catch(() => {}) }, 1000)
  const stop = () => { clearInterval(heartbeat); void unlink(lease).catch(() => {}) }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', code => resolve(code ?? 1))
    })
  } finally {
    stop()
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
