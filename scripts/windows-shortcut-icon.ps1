param([Parameter(Mandatory=$true)][string]$Shortcut, [Parameter(Mandatory=$true)][string]$Icon, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ThreadDeckShellIcon {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct Info {
    public IntPtr icon; public int index; public uint attributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string displayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=80)] public string typeName;
  }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SHGetFileInfo(string path, uint attributes, out Info info, uint size, uint flags);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
}
'@
$info = New-Object ThreadDeckShellIcon+Info
$result = [ThreadDeckShellIcon]::SHGetFileInfo($Shortcut, 0, [ref]$info, [Runtime.InteropServices.Marshal]::SizeOf($info), 0x100)
if ($result -eq [IntPtr]::Zero -or $info.icon -eq [IntPtr]::Zero) { throw "Windows could not resolve shortcut icon: $Shortcut" }
$actual = [Drawing.Icon]::FromHandle($info.icon).ToBitmap()
$stem = Join-Path ([IO.Path]::GetTempPath()) ('ThreadDeck-icon-probe-' + [Guid]::NewGuid().ToString('N'))
$reference = "$stem.lnk"
$referenceIcon = "$stem.ico"
$expected = $null
$referenceInfo = New-Object ThreadDeckShellIcon+Info
try {
  # Compare through the same shell path, including Windows' shortcut-arrow overlay.
  # A unique copy prevents the expected icon itself from coming from a stale cache.
  Copy-Item -LiteralPath $Icon -Destination $referenceIcon
  $link = (New-Object -ComObject WScript.Shell).CreateShortcut($reference)
  $link.TargetPath = $Icon
  $link.IconLocation = "$referenceIcon,0"
  $link.Save()
  $result = [ThreadDeckShellIcon]::SHGetFileInfo($reference, 0, [ref]$referenceInfo, [Runtime.InteropServices.Marshal]::SizeOf($referenceInfo), 0x100)
  if ($result -eq [IntPtr]::Zero -or $referenceInfo.icon -eq [IntPtr]::Zero) { throw 'Could not render the reference shortcut icon' }
  $expected = [Drawing.Icon]::FromHandle($referenceInfo.icon).ToBitmap()
  if ($OutputDirectory) {
    $actual.Save((Join-Path $OutputDirectory 'shortcut-shell-icon.png'))
    $expected.Save((Join-Path $OutputDirectory 'expected-shortcut-icon.png'))
  }
  if ($actual.Size -ne $expected.Size) { throw 'Shortcut shell icon has a different size' }
  $different = 0
  for ($y = 0; $y -lt $actual.Height; $y++) {
    for ($x = 0; $x -lt $actual.Width; $x++) {
      if ($actual.GetPixel($x, $y).ToArgb() -ne $expected.GetPixel($x, $y).ToArgb()) { $different++ }
    }
  }
  if ($different) { throw "Shortcut shell icon differs from the current ThreadDeck logo ($different pixels): $Shortcut" }
  Write-Output "Shortcut shell icon matches the current ThreadDeck logo: $Shortcut"
} finally {
  $actual.Dispose()
  if ($expected) { $expected.Dispose() }
  [ThreadDeckShellIcon]::DestroyIcon($info.icon) | Out-Null
  if ($referenceInfo.icon -ne [IntPtr]::Zero) { [ThreadDeckShellIcon]::DestroyIcon($referenceInfo.icon) | Out-Null }
  Remove-Item -LiteralPath $reference, $referenceIcon -ErrorAction SilentlyContinue
}
