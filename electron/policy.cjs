function externalLink(value) {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' && url.hostname === 'discord.com' && url.pathname.startsWith('/channels/')) ||
      (url.protocol === 'discord:' && url.hostname === '-' && url.pathname.startsWith('/channels/'))
  } catch { return false }
}
function mobileBounds(area) {
  return { x: area.x, y: area.y, width: Math.min(430, area.width), height: area.height }
}
module.exports = { externalLink, mobileBounds }
