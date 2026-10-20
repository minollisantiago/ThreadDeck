// CommandLineToArgvW-compatible quoting, followed by VBScript string quoting.
export const windowsQuote = value => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
const vbsString = value => `"${value.replaceAll('"', '""')}"`

export function launcherScript({ executable, entry, config }) {
  for (const value of [executable, entry, config]) {
    if (!value || /[\r\n\0]/.test(value)) throw new Error('Invalid Windows launcher configuration')
  }
  // Compatibility entry for existing pinned shortcuts. Native Electron opens
  // first; it starts WSL only after its local branded window has rendered.
  const run = [executable, entry, `--launch-services=${config}`].map(windowsQuote).join(' ')
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
