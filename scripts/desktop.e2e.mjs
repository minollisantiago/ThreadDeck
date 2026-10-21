import { createServer } from 'node:http'
import { readFile, mkdir, copyFile, mkdtemp, writeFile, rm, unlink } from 'node:fs/promises'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { windowsRuntime } from './desktop.mjs'

// This server contains synthetic sessions only. Never launch or restart Kimaki.
const now = Date.now()
const session = (id, title, status, responseAt = null) => ({ id, title, status, responseAt, projectId: 'demo', guildId: '1526236793048141935', threadId: '1562126778531582112', agentCount: status === 'working' ? 1 : 0, updatedAt: now - 30_000 })
const snapshot = { health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null,
  projects: [
    { id: 'threaddeck', name: 'ThreadDeck', directory: '/demo/threaddeck', sessions: [session('desktop', 'Native Windows desktop wrapper', 'working'), session('style', 'Polish the title bar and window controls', 'idle', now - 1000)] },
    { id: 'weektrace', name: 'WeekTrace', directory: '/demo/weektrace', sessions: [session('report', 'Weekly activity report', 'working'), session('review', 'Review the new timeline', 'permission')] },
    { id: 'naturalgas', name: 'naturalgas', directory: '/demo/naturalgas', sessions: [session('results', 'Compare saved backtesting results', 'working')] },
  ] }
let preferenceRequests = 0
const server = createServer(async (req, res) => {
  if (req.url?.startsWith('/__threaddeck_appearance_')) preferenceRequests++
  if (req.url === '/api/snapshot') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ...snapshot, checkedAt: Date.now(), lastSuccessAt: Date.now() })); return }
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const filename = pathname.startsWith('/assets/') || pathname.startsWith('/fonts/') ? pathname.slice(1) : 'index.html'
    const file = path.resolve('dist', filename)
    if (!file.startsWith(path.resolve('dist') + path.sep)) { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html')
    res.end(await readFile(file))
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const runtime = await windowsRuntime()
let startupRoot
let startupConfig
try {
  // Playwright's driver must run on Windows too: WSL cannot attach to a Windows
  // loopback inspector. Electron's Node mode avoids requiring Windows Node.js.
  const directory = path.dirname(runtime.executable)
  await copyFile('scripts/desktop.windows-test.cjs', path.join(directory, 'desktop.windows-test.cjs'))
  await copyFile('scripts/windows-taskbar-probe.ps1', path.join(directory, 'windows-taskbar-probe.ps1'))
  const windowsPath = value => execFileSync('wslpath', ['-w', path.resolve(value)], { encoding: 'utf8' }).trim()
  if (process.argv.includes('--startup')) {
    startupRoot = await mkdtemp("/tmp/opencode/ThreadDeck startup's test-")
    await mkdir(path.join(startupRoot, 'scripts'))
    await writeFile(path.join(startupRoot, 'scripts/services.mjs'), `
import { existsSync, writeFileSync, statSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const attempted = new URL('../attempted', import.meta.url);
const emit = (phase,state,detail) => console.log('THREADDECK_STARTUP '+JSON.stringify({phase,state,detail}));
let ready=false;
setInterval(()=>{try{if(Date.now()-statSync(process.env.THREADDECK_STARTUP_LEASE).mtimeMs<10000)return}catch{}writeFileSync(new URL(ready?'../stopped':'../cancelled',import.meta.url),'');process.exit(0)},250);
emit('wsl','ready','Linux is ready');
if (!existsSync(attempted)) { writeFileSync(attempted,''); await sleep(600); console.error('Synthetic startup failure'); process.exit(7); }
emit('backend','working','Building your dashboard'); emit('kimaki','working','Starting Kimaki');
await sleep(3500); emit('backend','ready','Dashboard backend is ready');
await sleep(1500); ready=true; emit('kimaki','ready','Kimaki is ready');
`)
    startupConfig = path.join(directory, 'startup-test.json')
    await writeFile(startupConfig, JSON.stringify({ distro: process.env.WSL_DISTRO_NAME, root: startupRoot, node: process.execPath,
      nodePath: `${path.dirname(process.execPath)}:/usr/bin:/bin`, windowsDirectory: windowsPath(directory), wslDirectory: directory,
      logPath: windowsPath(path.join(directory, 'startup-test.log')), port: server.address().port }))
  }
  const code = await new Promise((resolve, reject) => {
    const child = spawn(runtime.executable, [windowsPath(path.join(directory, 'desktop.windows-test.cjs')), windowsPath('node_modules/playwright-core'), String(server.address().port), ...(startupConfig ? [windowsPath(startupConfig)] : [])], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WSLENV: `${process.env.WSLENV ?? ''}:ELECTRON_RUN_AS_NODE` },
    })
    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)
    child.once('error', reject)
    child.once('exit', resolve)
  })
  if (code !== 0) throw new Error(`Windows desktop checks exited ${code}`)
  if (preferenceRequests !== 0) throw new Error('Startup preferences must be read locally, not fetched from the backend')
  await mkdir('artifacts', { recursive: true })
  for (const name of ['narrow-dark', 'maximized', 'narrow-light']) await copyFile(path.join(directory, `electron-windows-${name}.png`), `artifacts/electron-windows-${name}.png`)
  if (startupConfig) {
    for (const name of ['startup', 'startup-error', 'startup-light', 'startup-dark', 'startup-wide']) await copyFile(path.join(directory, `electron-windows-${name}.png`), `artifacts/electron-windows-${name}.png`)
    await readFile(path.join(startupRoot, 'stopped'))
    await readFile(path.join(startupRoot, 'cancelled'))
    console.log('Client-first startup, scanner animation, retry, handoff and owned-service cleanup passed.')
  }
  console.log('Native Windows screenshots saved in artifacts/.')
} finally {
  await new Promise(resolve => server.close(resolve))
  if (startupConfig) await unlink(startupConfig).catch(() => {})
  if (startupRoot) await rm(startupRoot, { recursive: true, force: true })
}
