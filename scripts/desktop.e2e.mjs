import { createServer } from 'node:http'
import { readFile, mkdir, copyFile } from 'node:fs/promises'
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
const server = createServer(async (req, res) => {
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
try {
  // Playwright's driver must run on Windows too: WSL cannot attach to a Windows
  // loopback inspector. Electron's Node mode avoids requiring Windows Node.js.
  const directory = path.dirname(runtime.executable)
  await copyFile('scripts/desktop.windows-test.cjs', path.join(directory, 'desktop.windows-test.cjs'))
  const windowsPath = value => execFileSync('wslpath', ['-w', path.resolve(value)], { encoding: 'utf8' }).trim()
  const code = await new Promise((resolve, reject) => {
    const child = spawn(runtime.executable, [windowsPath(path.join(directory, 'desktop.windows-test.cjs')), windowsPath('node_modules/playwright-core'), String(server.address().port)], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WSLENV: `${process.env.WSLENV ?? ''}:ELECTRON_RUN_AS_NODE` },
    })
    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)
    child.once('error', reject)
    child.once('exit', resolve)
  })
  if (code !== 0) throw new Error(`Windows desktop checks exited ${code}`)
  await mkdir('artifacts', { recursive: true })
  for (const name of ['narrow-dark', 'maximized', 'narrow-light']) await copyFile(path.join(directory, `electron-windows-${name}.png`), `artifacts/electron-windows-${name}.png`)
  console.log('Native Windows screenshots saved in artifacts/.')
} finally {
  await new Promise(resolve => server.close(resolve))
}
