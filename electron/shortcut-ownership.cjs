const path = require('node:path').win32

// Only migrate pins targeting this exact runtime, never another Electron app.
function ownedPinnedShortcut(shortcut, runtime) {
  const target = path.normalize(shortcut.target).toLowerCase()
  return ['electron.exe', 'ThreadDeck.exe'].some(name => target === path.join(runtime, name).toLowerCase())
}

module.exports = { ownedPinnedShortcut }
