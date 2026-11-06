$ErrorActionPreference = "Stop"
$wix = Get-Command wix -ErrorAction SilentlyContinue
if (-not $wix) {
  throw "WiX Toolset 4 was not found. Install it with: dotnet tool install --global wix"
}
$source = Join-Path $PSScriptRoot "OPGeotech-Desktop.wxs"
$output = Join-Path $PSScriptRoot "OPGeotech-Desktop.msi"
Push-Location $PSScriptRoot
try {
  & $wix.Source build $source -o $output
  if ($LASTEXITCODE -ne 0) { throw "WiX compilation failed with exit code $LASTEXITCODE." }
  Write-Host "Created $output"
} finally {
  Pop-Location
}
