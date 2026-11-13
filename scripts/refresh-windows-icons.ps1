param([Parameter(Mandatory=$true)][string]$RuntimeDirectory, [Parameter(Mandatory=$true)][string]$Icon)
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $Icon)) { throw 'ThreadDeck icon file does not exist' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ThreadDeckShellRefresh {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] public static extern void SHChangeNotify(uint change, uint flags, string first, string second);
}
'@
# Refresh the running app's relaunch icon without stopping its window or services.
$processes = Get-Process ThreadDeck,electron -ErrorAction SilentlyContinue
foreach ($process in $processes) {
  if ($process.Path -and $process.MainWindowHandle -ne 0 -and (Split-Path $process.Path) -eq $RuntimeDirectory) {
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PSScriptRoot\windows-taskbar-probe.ps1" -WindowHandle $process.MainWindowHandle.ToInt64() -IconPath $Icon -RequireThreadDeck
    if ($LASTEXITCODE -ne 0) { throw 'Could not refresh the running ThreadDeck taskbar icon' }
  }
}
$shell = New-Object -ComObject WScript.Shell
$folders = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'), (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'))
foreach ($folder in $folders) {
  if (!(Test-Path -LiteralPath $folder)) { continue }
  Get-ChildItem -LiteralPath $folder -Filter *.lnk | ForEach-Object {
    $shortcut = $shell.CreateShortcut($_.FullName)
    if ($shortcut.TargetPath -and (Split-Path $shortcut.TargetPath) -eq $RuntimeDirectory) {
      [ThreadDeckShellRefresh]::SHChangeNotify(0x2000, 0x1005, $_.FullName, $null)
    }
  }
}
# Notify Explorer normally; do not delete its cache or restart it.
[ThreadDeckShellRefresh]::SHChangeNotify(0x08000000, 0x1000, $null, $null)
Write-Output 'Refreshed ThreadDeck shortcut and taskbar icons without restarting any app.'
