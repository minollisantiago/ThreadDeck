import path from 'node:path'

const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`
// CommandLineToArgvW-compatible quoting, followed by VBScript string quoting.
export const windowsQuote = value => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
const vbsString = value => `"${value.replaceAll('"', '""')}"`

export function launcherScript({ distro, root, node, nodePath, log }) {
  for (const value of [distro, root, node, nodePath, log]) {
    if (!value || /[\r\n\0]/.test(value)) throw new Error('Invalid Windows launcher configuration')
  }
  const command = `export PATH=${shellQuote(nodePath)}; exec ${shellQuote(node)} ${shellQuote(path.posix.join(root, 'scripts/kimaki.mjs'))} --desktop --reuse-existing >>${shellQuote(log)} 2>&1`
  const args = ['wsl.exe', '--distribution', distro, '--cd', root, '--exec', '/bin/sh', '-c', command]
  // wsl.exe parses switches itself; quoting a switch such as "--distribution"
  // can make it treat the remaining arguments as a Linux shell command.
  const run = args.map(value => /^[\w./:\\-]+$/.test(value) ? value : windowsQuote(value)).join(' ')
  return [
    "' ThreadDeck: starts the WSL backend, Kimaki and native Windows Electron.",
    'Option Explicit',
    'Dim shell, code',
    'Set shell = CreateObject("WScript.Shell")',
    `code = shell.Run(${vbsString(run)}, 0, True)`,
    'If code <> 0 Then',
    '  MsgBox "ThreadDeck could not start or stopped unexpectedly. See %LOCALAPPDATA%\\ThreadDeck\\launcher.log for details. Existing services were not replaced.", 16, "ThreadDeck"',
    'End If',
    'WScript.Quit code',
    '',
  ].join('\r\n')
}
