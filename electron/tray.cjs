const { Tray, Menu, Notification, nativeImage } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const { agentStatus } = require('./agent-status.cjs')

function trayController({ app, window, origin, openSession }) {
  const settingsFile = path.join(app.getPath('userData'), 'tray-settings.json')
  let settings = { closeToTray: false, paused: false }
  try {
    const saved = JSON.parse(readFileSync(settingsFile, 'utf8'))
    for (const key of Object.keys(settings)) if (typeof saved[key] === 'boolean') settings[key] = saved[key]
  } catch { /* First launch or unavailable preferences. */ }
  const model = agentStatus(), icon = path.join(__dirname, 'ThreadDeck.ico')
  const tray = new Tray(icon)
  let stopped = false, timer, request, activeSession = null, latestIcon = '', disconnected = false
  const notifications = new Set()
  const show = () => { if (window.isMinimized()) window.restore(); window.show(); window.focus() }
  const open = id => { show(); openSession(id) }
  const save = () => {
    try { writeFileSync(settingsFile, JSON.stringify(settings)) }
    catch (error) { console.error('Could not save tray settings:', error.message) }
    render()
  }
  // Shape + color distinguish attention (!), unread (square), and working (circle).
  function statusIcon(kind) {
    if (kind === 'idle') return nativeImage.createFromPath(icon)
    const size = 32, pixels = Buffer.alloc(size * size * 4)
    const color = kind === 'attention' ? [40, 180, 255] : kind === 'unread' ? [100, 220, 100] : [255, 180, 80]
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const visible = kind === 'attention' ? x >= 13 && x <= 18 && (y >= 4 && y <= 20 || y >= 25 && y <= 29)
        : kind === 'unread' ? x >= 5 && x <= 26 && y >= 5 && y <= 26 : (x - 16) ** 2 + (y - 16) ** 2 <= 12 ** 2
      if (visible) { const i = (y * size + x) * 4; pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255 }
    }
    return nativeImage.createFromBitmap(pixels, { width: size, height: size })
  }
  function render() {
    if (stopped) return
    const { health, attention, unread, working } = model.summary()
    const kind = attention.length ? 'attention' : unread.length ? 'unread' : working ? 'working' : 'idle'
    if (kind !== latestIcon) { tray.setImage(statusIcon(kind)); latestIcon = kind }
    tray.setToolTip(`ThreadDeck · ${working} working · ${attention.length} need you · ${unread.length} unread${health !== 'connected' ? ' · disconnected' : ''}`)
    const items = new Map([...attention, ...unread].map(session => [session.id, session]))
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open ThreadDeck', click: show },
      { label: health === 'connected' ? `${working} working · ${attention.length} need you · ${unread.length} unread` : 'Local source unavailable — reconnecting…', enabled: false },
      ...[...items.values()].slice(0, 12).map(session => ({ label: `${attention.some(s => s.id === session.id) ? 'Attention' : 'Unread'}: ${session.projectName} — ${session.title}`.replaceAll('&', '&&'), click: () => open(session.id) })),
      { type: 'separator' },
      { label: 'Pause notifications', type: 'checkbox', checked: settings.paused, click: item => { settings.paused = item.checked; save() } },
      { label: 'Close to tray (keep agents connected)', type: 'checkbox', checked: settings.closeToTray, click: item => { settings.closeToTray = item.checked; save() } },
      { type: 'separator' },
      { label: 'Quit ThreadDeck', click: () => app.quit() },
    ]))
  }
  function notify(title, body, id) {
    if (settings.paused || !Notification.isSupported()) return
    const notification = new Notification({ title, body, icon })
    notifications.add(notification)
    notification.on('click', () => id ? open(id) : show())
    notification.on('close', () => notifications.delete(notification))
    notification.on('failed', (_event, error) => { notifications.delete(notification); console.error('Notification failed:', error) })
    notification.show()
  }
  async function poll() {
    request = new AbortController()
    const timeout = setTimeout(() => request?.abort(), 5000)
    try {
      const response = await fetch(`${origin}/api/snapshot`, { signal: request.signal })
      if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`)
      const snapshot = await response.json()
      if (stopped) return
      const events = model.update(snapshot, window.isFocused() && window.isVisible() ? activeSession : null)
      if (snapshot.health !== 'connected') {
        if (!disconnected && snapshot.lastSuccessAt !== null) notify('ThreadDeck disconnected', 'Local source unavailable. Reconnecting automatically.')
        disconnected = true
      } else disconnected = false
      if (events.length > 1) {
        // Open the highest-priority item; the tray retains the complete list.
        const first = events.find(event => event.kind !== 'response') ?? events[0]
        notify(`${events.length} agents have updates`, 'Open ThreadDeck to review agent responses and requests.', first.session.id)
      } else if (events.length) {
        const { kind, session } = events[0]
        const labels = { input: 'Needs your input', permission: 'Needs approval', error: 'Agent failed', response: 'Finished responding' }
        notify(`${session.projectName} · ${labels[kind]}`, session.title, session.id)
      }
      render()
    } catch {
      if (!stopped) {
        model.update({ health: 'disconnected' })
        if (!disconnected) notify('ThreadDeck disconnected', 'Local source unavailable. Reconnecting automatically.')
        disconnected = true; render()
      }
    } finally {
      clearTimeout(timeout)
      if (!stopped) timer = setTimeout(poll, 3000)
    }
  }
  tray.on('click', show)
  render()
  void poll()
  return {
    closeToTray: () => settings.closeToTray,
    hide: () => window.hide(),
    viewing: id => { activeSession = typeof id === 'string' ? id : null },
    receipts: value => { model.receipts(value); render() },
    stop: () => { stopped = true; clearTimeout(timer); request?.abort(); for (const notification of notifications) notification.close(); tray.destroy() },
  }
}
module.exports = { trayController }
