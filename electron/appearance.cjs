const { randomUUID } = require('node:crypto')
const colors = { dark: '#101014', light: '#f4f3f6' }
function parseAppearance(value, fallback) {
  try { const mode = JSON.parse(value); return mode === 'light' || mode === 'dark' ? mode : fallback } catch { return fallback }
}

// Read the dashboard's existing localStorage without contacting its backend.
// This private, locally-served document has the same origin as the dashboard.
// The window stays hidden, and the temporary HTTP handler is removed afterwards.
async function savedAppearance(window, origin, fallback, net) {
  const protocol = window.webContents.session.protocol
  const url = `${origin}/__threaddeck_appearance_${randomUUID()}`
  let registered = false
  let timeout
  try {
    protocol.handle('http', request => request.url === url
      ? new Response('<!doctype html><title>ThreadDeck preferences</title>', { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'none'" } })
      : net.fetch(request, { bypassCustomProtocolHandlers: true }))
    registered = true
    await Promise.race([window.loadURL(url), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Preference read timed out')), 3000) })])
    return parseAppearance(await window.webContents.executeJavaScript("localStorage.getItem('threaddeck:appearance')"), fallback)
  } catch { return fallback }
  finally {
    clearTimeout(timeout)
    if (registered) protocol.unhandle('http')
    if (!window.isDestroyed()) window.webContents.stop()
  }
}
module.exports = { colors, parseAppearance, savedAppearance }
