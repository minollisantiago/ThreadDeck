// Use Chromium's completion event, not the download link click: a cancelled or
// interrupted save must never be reported as successful.
function installDownloadNotifications({ window, origin, Notification, shell, icon, preferences = () => ({}) }) {
  const session = window.webContents.session, pending = new Map(), notifications = new Set()
  function download(_event, item, contents) {
    if (contents !== window.webContents) return
    try { if (new URL(item.getURL()).origin !== origin) return } catch { return }
    const done = (_event, state) => {
      pending.delete(item)
      const settings = preferences() ?? {}
      if (state !== 'completed' || settings.paused || !Notification.isSupported()) return
      const file = item.getSavePath()
      const notification = new Notification({ title: 'Download complete', body: item.getFilename(), icon, silent: settings.sounds === false })
      notifications.add(notification)
      notification.on('click', () => shell.showItemInFolder(file))
      notification.on('close', () => notifications.delete(notification))
      notification.on('failed', (_event, error) => { notifications.delete(notification); console.error('Download notification failed:', error) })
      notification.show()
    }
    pending.set(item, done)
    item.once('done', done)
  }
  session.on('will-download', download)
  window.once('closed', () => {
    session.removeListener('will-download', download)
    for (const [item, done] of pending) item.removeListener('done', done)
    pending.clear()
    for (const notification of notifications) notification.close()
    notifications.clear()
  })
}
module.exports = { installDownloadNotifications }
