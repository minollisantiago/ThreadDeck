const { externalLink } = require('./policy.cjs')

// Browsers use HTTPS directly; the desktop shell can check for an installed
// protocol handler without speculative redirects or opening two windows.
async function openDiscordLink(url, { app, shell }) {
  if (!externalLink(url)) return
  const browser = url.startsWith('discord://-/') ? url.replace('discord://-/', 'https://discord.com/') : url
  if (browser.startsWith('https://discord.com/channels/')) {
    const desktop = browser.replace('https://discord.com/', 'discord://-/')
    try {
      if (app.getApplicationNameForProtocol(desktop)) {
        await shell.openExternal(desktop)
        return
      }
    } catch { /* Missing or broken protocol handler: continue in the browser. */ }
  }
  await shell.openExternal(browser)
}

module.exports = { openDiscordLink }
