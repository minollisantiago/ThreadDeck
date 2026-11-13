const path = require('node:path').win32
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { appId } = require('./taskbar.cjs')
const { appIcon } = require('./app-icon.cjs')

const quote = value => `'${value.replaceAll("'", "''")}'`

// Windows owns the toast's sender header; Notification.icon only brands its body.
// Register per-user metadata explicitly because we run an unpackaged executable.
async function registerNotificationIdentity(directory, options = {}) {
  if ((options.platform ?? process.platform) !== 'win32') return
  const key = `HKCU:\\Software\\Classes\\AppUserModelId\\${appId}`
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$key = ${quote(key)}`,
    'New-Item -Path $key -Force | Out-Null',
    `New-ItemProperty -LiteralPath $key -Name DisplayName -Value 'ThreadDeck' -PropertyType String -Force | Out-Null`,
    `New-ItemProperty -LiteralPath $key -Name IconUri -Value ${quote(options.iconPath ?? appIcon(directory))} -PropertyType String -Force | Out-Null`,
  ].join('; ')
  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  await (options.run ?? promisify(execFile))(powershell,
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 15_000 })
}

module.exports = { registerNotificationIdentity }
