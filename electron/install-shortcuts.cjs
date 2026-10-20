const { app, shell } = require('electron')
const { readFileSync, existsSync } = require('node:fs')
const { appId } = require('./taskbar.cjs')

// Run by setup as a native Windows process, without creating a window or bot.
app.whenReady().then(() => {
  const config = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  for (const file of config.shortcuts) {
    if (existsSync(file)) {
      const existing = shell.readShortcutLink(file)
      if (existing.args !== config.details.args && existing.appUserModelId !== appId && existing.args !== config.legacyArgs) {
        throw new Error(`Refusing to overwrite an unrelated shortcut: ${file}`)
      }
    }
  }
  for (const file of config.shortcuts) {
    if (!shell.writeShortcutLink(file, { ...config.details, appUserModelId: appId })) throw new Error(`Could not write ${file}`)
    if (shell.readShortcutLink(file).appUserModelId !== appId) throw new Error(`Taskbar identity was not saved: ${file}`)
    console.log(file)
  }
  app.exit(0)
}).catch(error => { console.error(error.message); app.exit(1) })
