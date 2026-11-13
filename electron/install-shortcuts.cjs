const { app, shell } = require('electron')
const { readFileSync, existsSync, readdirSync } = require('node:fs')
const path = require('node:path')
const { appId } = require('./taskbar.cjs')
const { registerNotificationIdentity } = require('./notification-identity.cjs')
const { ownedPinnedShortcut } = require('./shortcut-ownership.cjs')

// Run by setup as a native Windows process, without creating a window or bot.
app.whenReady().then(async () => {
  const config = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  for (const file of config.shortcuts) {
    if (existsSync(file)) {
      const existing = shell.readShortcutLink(file)
      if (existing.args !== config.details.args && existing.appUserModelId !== appId && existing.args !== config.legacyArgs) {
        throw new Error(`Refusing to overwrite an unrelated shortcut: ${file}`)
      }
    }
  }
  const pinnedDirectory = path.join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar')
  const pins = existsSync(pinnedDirectory) ? readdirSync(pinnedDirectory).filter(name => name.toLowerCase().endsWith('.lnk')).map(name => path.join(pinnedDirectory, name)).filter(file => ownedPinnedShortcut(shell.readShortcutLink(file), path.dirname(config.details.target))) : []
  for (const file of [...config.shortcuts, ...pins]) {
    if (!shell.writeShortcutLink(file, { ...config.details, appUserModelId: appId })) throw new Error(`Could not write ${file}`)
    if (shell.readShortcutLink(file).appUserModelId !== appId) throw new Error(`Taskbar identity was not saved: ${file}`)
    console.log(file)
  }
  await registerNotificationIdentity(__dirname)
  app.exit(0)
}).catch(error => { console.error(error.message); app.exit(1) })
