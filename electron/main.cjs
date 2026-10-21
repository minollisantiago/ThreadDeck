const { app, BrowserWindow, ipcMain, screen, shell, dialog, nativeTheme, net } = require('electron')
const path = require('node:path')
const { externalLink, mobileBounds } = require('./policy.cjs')
const { appId, taskbarDetails } = require('./taskbar.cjs')
const { startupController } = require('./startup.cjs')
const { readFileSync } = require('node:fs')
const { colors, savedAppearance } = require('./appearance.cjs')

const configFile = process.argv.find(arg => arg.startsWith('--launch-services='))?.slice('--launch-services='.length)
let config
let configError
try { if (configFile) config = JSON.parse(readFileSync(configFile, 'utf8')) } catch (error) { configError = error.message }
let port = Number(process.argv.find(arg => arg.startsWith('--dashboard-port='))?.split('=')[1] ?? config?.port ?? 43127)
if (!Number.isInteger(port) || port < 1024 || port > 65535) { configError = 'Invalid dashboard port. Reinstall the Windows launcher.'; port = 43127 }
const origin = `http://127.0.0.1:${port}`
let window
let quitting = false
let controller
let attempt = 0
let startupState
let appearance
const loadSplash = () => window.loadFile(path.join(__dirname, 'startup.html'), { query: { appearance } })
const initialState = () => ({ stages: {
  wsl: { state: 'working', detail: 'Starting Windows Subsystem for Linux', hidden: !configFile },
  backend: { state: configFile ? 'pending' : 'working', detail: configFile ? 'Waiting for Linux' : 'Connecting to your dashboard' },
  kimaki: { state: 'pending', detail: 'Waiting for Linux', hidden: !configFile },
}, error: null, connecting: false })
const notifyStartup = () => { if (window && !window.isDestroyed()) window.webContents.send('startup-progress', startupState) }
app.setName('ThreadDeck')
app.setAppUserModelId(appId)
app.on('before-quit', () => { quitting = true; attempt++; void controller?.stop() })
const lease = process.argv.find(arg => arg.startsWith('--supervisor-lease='))?.slice('--supervisor-lease='.length)
if (lease) {
  const checkLease = () => {
    try { if (Date.now() - require('node:fs').statSync(lease).mtimeMs < 10_000) return } catch { /* launcher exited */ }
    app.quit()
  }
  const heartbeat = setInterval(checkLease, 500)
  app.on('before-quit', () => clearInterval(heartbeat))
}

async function beginStartup() {
  const id = ++attempt
  startupState = initialState()
  notifyStartup()
  if (configError) { startupState.error = configError; notifyStartup(); return }
  if (controller) await controller.start()
  const deadline = Date.now() + (configFile ? 180_000 : 30_000)
  while (Date.now() < deadline && !quitting && id === attempt && !startupState.error) {
    if (!configFile || Object.values(startupState.stages).every(stage => stage.state === 'ready')) {
      if (!startupState.connecting) { startupState.connecting = true; notifyStartup() }
      try {
        const response = await fetch(`${origin}/api/snapshot`, { signal: AbortSignal.timeout(1500) })
        if (response.ok) {
          await window.loadURL(origin)
          controller?.ready()
          return
        }
      } catch {
        // A failed navigation must not leave Chromium's blank error document.
        if (!quitting && id === attempt && !window.webContents.getURL().startsWith('file:')) {
          await loadSplash()
          notifyStartup()
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!quitting && id === attempt && !startupState.error) {
    startupState.error = `Cannot connect to the dashboard at ${origin}. Check the startup log and Windows-to-WSL localhost forwarding.`
    notifyStartup()
    void controller?.stop()
  }
}

app.whenReady().then(async () => {
  if (quitting) return
  startupState = initialState()
  appearance = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  const initialBounds = mobileBounds(screen.getPrimaryDisplay().workArea)
  window = new BrowserWindow({
    ...initialBounds, minWidth: initialBounds.width, minHeight: 400,
    frame: false, show: false, backgroundColor: colors[appearance], title: 'ThreadDeck',
    icon: path.join(__dirname, 'ThreadDeck.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  appearance = await savedAppearance(window, origin, appearance, net)
  if (quitting || window.isDestroyed()) return
  window.setBackgroundColor(colors[appearance])
  if (process.platform === 'win32') window.setAppDetails(taskbarDetails(__dirname, port))
  if (config) controller = startupController({ ...config, port }, event => {
    if (event.error) {
      startupState.error = event.error
      if (!quitting && !window.isDestroyed() && !window.webContents.getURL().startsWith('file:')) {
        void loadSplash().then(notifyStartup).catch(() => {})
      }
    }
    else startupState.stages[event.phase] = { state: event.state, detail: String(event.detail ?? '') }
    notifyStartup()
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
  ipcMain.on('appearance-changed', (event, mode) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || !event.senderFrame.url.startsWith(`${origin}/`) || !['dark', 'light'].includes(mode)) return
    appearance = mode
    window.setBackgroundColor(colors[appearance])
  })
  const isSplash = event => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url.startsWith('file:')
  ipcMain.handle('startup-state', event => isSplash(event) ? startupState : null)
  ipcMain.on('startup-action', (event, action) => {
    if (!isSplash(event)) return
    if (action === 'retry' && startupState.error) void beginStartup()
    if (action === 'logs') void shell.openPath(config?.logPath ?? path.resolve(__dirname, '..', 'launcher.log'))
  })
  const notify = () => window.webContents.send('window-maximized', window.isMaximized())
  window.on('maximize', notify)
  window.on('unmaximize', () => {
    window.setBounds(mobileBounds(screen.getDisplayMatching(window.getBounds()).workArea))
    notify()
  })
  window.webContents.on('did-finish-load', notify)
  window.on('closed', () => { quitting = true; attempt++; void controller?.stop() })
  await loadSplash()
  if (quitting || window.isDestroyed()) return
  window.show()
  void beginStartup()
}).catch(error => { if (!quitting) dialog.showErrorBox('ThreadDeck could not start', error.message); app.exit(1) })
app.on('window-all-closed', () => app.quit())
