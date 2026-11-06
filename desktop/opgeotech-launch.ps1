$configPath = "C:\ProgramData\OPGeotech\config.json"
if (-not (Test-Path $configPath)) { Start-Process "https://geotechai-lczirdg5.manus.space"; exit }
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$appUrl = [string]$config.appUrl
$browser = $null
foreach ($candidate in @(
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
)) {
  if (Test-Path $candidate) { $browser = $candidate; break }
}
if ($browser) { Start-Process $browser -ArgumentList "--app=$appUrl" } else { Start-Process $appUrl }
