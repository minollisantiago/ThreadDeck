param([Parameter(Mandatory=$true)][string]$Executable, [Parameter(Mandatory=$true)][string]$Icon, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$actualIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($Executable)
# Let Windows decode both files; System.Drawing.Icon.ToBitmap misreads PNG-backed ICOs.
$expectedIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($Icon)
$actual = $actualIcon.ToBitmap()
$expected = $expectedIcon.ToBitmap()
try {
  if ($OutputDirectory) {
    $actual.Save((Join-Path $OutputDirectory 'executable-icon.png'))
    $expected.Save((Join-Path $OutputDirectory 'expected-icon.png'))
  }
  if ($actual.Width -ne $expected.Width -or $actual.Height -ne $expected.Height) { throw 'Executable still has a different shell icon size' }
  $different = 0
  for ($y = 0; $y -lt $actual.Height; $y++) {
    for ($x = 0; $x -lt $actual.Width; $x++) {
      if ($actual.GetPixel($x, $y).ToArgb() -ne $expected.GetPixel($x, $y).ToArgb()) { $different++ }
    }
  }
  if ($different) { throw "Executable shell icon differs from ThreadDeck.ico ($different pixels). Taskbar can fall back to Electron branding." }
  Write-Output 'Executable shell icon matches ThreadDeck.ico.'
} finally { $actual.Dispose(); $expected.Dispose(); $actualIcon.Dispose(); $expectedIcon.Dispose() }
