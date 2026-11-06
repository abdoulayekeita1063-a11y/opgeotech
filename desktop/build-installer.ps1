$ErrorActionPreference = "Stop"
$iss = Join-Path $PSScriptRoot "OPGeotech-Desktop.iss"
$candidates = @(
  "$env:ProgramFiles(x86)\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
)
$iscc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
  throw "Inno Setup 6 was not found. Install it from https://jrsoftware.org/isinfo.php and run this script again."
}
& $iscc $iss
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed with exit code $LASTEXITCODE." }
Write-Host "Created $PSScriptRoot\OPGeotech-Desktop-Setup.exe"
