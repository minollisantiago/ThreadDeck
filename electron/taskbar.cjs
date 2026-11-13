const path = require('node:path').win32
const { existsSync } = require('node:fs')
const { appIcon } = require('./app-icon.cjs')
const appId = 'ThreadDeck'
const quote = value => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`

function taskbarDetails(directory, port, options = {}) {
  const launcher = path.resolve(directory, '..', 'launch.vbs')
  const installed = (options.exists ?? existsSync)(launcher)
  const command = installed
    ? `${quote(path.join(options.windowsDirectory ?? process.env.WINDIR ?? 'C:\\Windows', 'System32', 'wscript.exe'))} ${quote(launcher)}`
    : `${quote(options.executable ?? process.execPath)} ${quote(path.join(directory, 'main.cjs'))} --dashboard-port=${port}`
  return { appId, appIconPath: options.iconPath ?? appIcon(directory), appIconIndex: 0, relaunchCommand: command, relaunchDisplayName: 'ThreadDeck' }
}

module.exports = { appId, taskbarDetails }
