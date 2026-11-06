# OPGeotech Desktop bootstrap installer
# Run elevated once from the extracted installer directory.
[CmdletBinding()]
param(
  [string]$AppUrl,
  [string]$SyncToken,
  [string]$LocalRoot = "C:\OPGeotech\Projects",
  [string]$PairingFile,
  [switch]$ConfigureOnly
)

$ErrorActionPreference = "Stop"
$root = "C:\OPGeotech"
$programDir = Join-Path ${env:ProgramFiles} "OPGeotech"
$configDir = "C:\ProgramData\OPGeotech"
$syncSource = Join-Path $PSScriptRoot "opgeotech-sync.ps1"
$syncScript = Join-Path $programDir "opgeotech-sync.ps1"
$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "OPGeotech Desktop.lnk"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Please run this installer as Administrator."
}

if ([string]::IsNullOrWhiteSpace($PairingFile)) {
  $downloadPairing = Get-ChildItem -Path (Join-Path $env:USERPROFILE "Downloads") -Filter "OPGeotech-Desktop-Pairing-*.json" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($downloadPairing) { $PairingFile = $downloadPairing.FullName }
}
if (-not [string]::IsNullOrWhiteSpace($PairingFile) -and (Test-Path $PairingFile)) {
  $pairing = Get-Content $PairingFile -Raw | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace($AppUrl)) { $AppUrl = [string]$pairing.appUrl }
  if ([string]::IsNullOrWhiteSpace($SyncToken)) { $SyncToken = [string]$pairing.syncToken }
  if ($LocalRoot -eq "C:\OPGeotech\Projects" -and -not [string]::IsNullOrWhiteSpace([string]$pairing.localRoot)) {
    $LocalRoot = [string]$pairing.localRoot
  }
  $pairingMode = [string]$pairing.mode
} else {
  $pairingMode = "download_only"
}

if ([string]::IsNullOrWhiteSpace($AppUrl)) { $AppUrl = Read-Host "OPGeotech web address (for example https://your-opgeotech-domain)" }
if ([string]::IsNullOrWhiteSpace($SyncToken)) { $SyncToken = Read-Host "Project Windows sync token" }
if ([string]::IsNullOrWhiteSpace($AppUrl) -or [string]::IsNullOrWhiteSpace($SyncToken)) { throw "An OPGeotech URL and a project sync token are required." }

New-Item -ItemType Directory -Force -Path $root, $LocalRoot, $programDir, $configDir | Out-Null
Copy-Item -Force $syncSource $syncScript
$config = [ordered]@{ appUrl = $AppUrl.TrimEnd('/'); syncToken = $SyncToken.Trim(); mode = $pairingMode; localRoot = $LocalRoot }
$configPath = Join-Path $configDir "config.json"
$config | ConvertTo-Json | Set-Content -Encoding UTF8 $configPath

# Protect the token configuration from standard users.
icacls $configPath /inheritance:r /grant:r "SYSTEM:(R)" "Administrators:(F)" | Out-Null

$browser = $null
foreach ($candidate in @(
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
)) {
  if (Test-Path $candidate) { $browser = $candidate; break }
}
if (-not $browser) { $browser = "explorer.exe" }

$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $browser
if ($browser -eq "explorer.exe") { $shortcut.Arguments = $AppUrl } else { $shortcut.Arguments = "--app=$AppUrl" }
$shortcut.WorkingDirectory = $root
$shortcut.Description = "OPGeotech Desktop"
$shortcut.Save()

$taskName = "OPGeotech Cloud Sync"
$quote = [char]34
$taskArgs = "-NoProfile -ExecutionPolicy Bypass -File $quote$syncScript$quote -RunOnce"
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument $taskArgs
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -User "SYSTEM" -Force | Out-Null

# Run an initial sync so the folder is populated immediately.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -RunOnce
Write-Host "OPGeotech Desktop is installed."
Write-Host "Project files are synchronized to: $LocalRoot"
Write-Host "The task '$taskName' runs every 15 minutes."
