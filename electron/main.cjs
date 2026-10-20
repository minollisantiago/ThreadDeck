const { app, BrowserWindow, ipcMain, screen, shell, dialog } = require('electron')
const path = require('node:path')
const { externalLink, mobileBounds } = require('./policy.cjs')

const port = Number(process.argv.find(arg => arg.startsWith('--dashboard-port='))?.split('=')[1] ?? 43127)
if (!Number.isInteger(port) || port < 1024 || port > 65535) app.exit(1)
const origin = `http://127.0.0.1:${port}`
let window
let quitting = false
app.setName('ThreadDeck')
app.setAppUserModelId('ThreadDeck')
app.on('before-quit', () => { quitting = true })
const lease = process.argv.find(arg => arg.startsWith('--supervisor-lease='))?.slice('--supervisor-lease='.length)
if (lease) {
  const checkLease = () => {
    try { if (Date.now() - require('node:fs').statSync(lease).mtimeMs < 10_000) return } catch { /* launcher exited */ }
    app.quit()
  }
  const heartbeat = setInterval(checkLease, 500)
  app.on('before-quit', () => clearInterval(heartbeat))
}

async function waitForDashboard() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline && !quitting) {
    try {
      const response = await fetch(`${origin}/api/snapshot`, { signal: AbortSignal.timeout(1500) })
      if (response.ok) return
    } catch { /* backend may still be starting */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Cannot reach the WSL dashboard at ${origin}. Start the backend and check Windows-to-WSL localhost forwarding.`)
}

app.whenReady().then(async () => {
  await waitForDashboard()
  if (quitting) return
  window = new BrowserWindow({
    ...mobileBounds(screen.getPrimaryDisplay().workArea), minWidth: 320, minHeight: 400,
    frame: false, show: false, backgroundColor: '#101014', title: 'ThreadDeck',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  window.setMenu(null)
  const openExternal = url => { if (externalLink(url)) void shell.openExternal(url).catch(console.error) }
  ipcMain.on('open-discord', (event, url) => {
    if (event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && typeof url === 'string') openExternal(url)
  })
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' } })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== `${origin}/` && url !== origin) { event.preventDefault(); openExternal(url) }
  })
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.session.setPermissionCheckHandler(() => false)
  ipcMain.on('window-control', (event, action) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return
    if (action === 'minimize') window.minimize()
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize()
    if (action === 'close') window.close()
  })
  const notify = () => window.webContents.send('window-maximized', window.isMaximized())
  window.on('maximize', notify)
  window.on('unmaximize', () => {
    window.setBounds(mobileBounds(screen.getDisplayMatching(window.getBounds()).workArea))
    notify()
  })
  window.once('ready-to-show', () => window.show())
  await window.loadURL(origin)
}).catch(error => { if (!quitting) dialog.showErrorBox('ThreadDeck could not start', error.message); app.exit(1) })
app.on('window-all-closed', () => app.quit())
