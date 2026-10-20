const path = require('node:path').win32
const { existsSync } = require('node:fs')
const appId = 'ThreadDeck'
const quote = value => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`

function taskbarDetails(directory, port, options = {}) {
  const launcher = path.resolve(directory, '..', 'launch.vbs')
  const installed = (options.exists ?? existsSync)(launcher)
  const command = installed
    ? `${quote(path.join(options.windowsDirectory ?? process.env.WINDIR ?? 'C:\\Windows', 'System32', 'wscript.exe'))} ${quote(launcher)}`
    : `${quote(options.executable ?? process.execPath)} ${quote(path.join(directory, 'main.cjs'))} --dashboard-port=${port}`
  return { appId, appIconPath: path.join(directory, 'ThreadDeck.ico'), appIconIndex: 0, relaunchCommand: command, relaunchDisplayName: 'ThreadDeck' }
}

module.exports = { appId, taskbarDetails }
