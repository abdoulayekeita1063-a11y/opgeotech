# OPGeotech Desktop read-only Cloud -> Windows synchronizer
# The installer stores configuration in C:\ProgramData\OPGeotech\config.json.
[CmdletBinding()]
param([switch]$RunOnce)

$ErrorActionPreference = "Stop"
$configPath = "C:\ProgramData\OPGeotech\config.json"
if (-not (Test-Path $configPath)) { throw "OPGeotech is not configured. Run the installer first." }
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$baseUrl = ([string]$config.appUrl).TrimEnd('/')
$token = [string]$config.syncToken
$localRoot = [string]$config.localRoot
if ([string]::IsNullOrWhiteSpace($baseUrl) -or [string]::IsNullOrWhiteSpace($token)) { throw "The OPGeotech app URL or sync token is missing." }

$headers = @{ Authorization = "Bearer $token" }
$projectRoot = $null

function Sync-Project {
  $manifest = Invoke-RestMethod -Uri "$baseUrl/api/project-sync/$token/manifest" -Headers $headers
  $safeName = [regex]::Replace([string]$manifest.project.name, '[^a-zA-Z0-9._-]', '-').Trim('-')
  if ([string]::IsNullOrWhiteSpace($safeName)) { $safeName = "project" }
  $script:projectRoot = Join-Path $localRoot "$safeName-$($manifest.project.id)"
  New-Item -ItemType Directory -Force -Path $projectRoot | Out-Null
  $statePath = Join-Path $projectRoot ".opgeotech-sync-state.json"
  $state = @{}
  if (Test-Path $statePath) {
    $saved = Get-Content $statePath -Raw
    if ($saved.Trim()) {
      $parsed = $saved | ConvertFrom-Json
      $parsed.PSObject.Properties | ForEach-Object { $state[$_.Name] = [string]$_.Value }
    }
  }

  foreach ($entry in $manifest.files) {
    $relative = ([string]$entry.relativePath).Replace('/', [IO.Path]::DirectorySeparatorChar)
    $localPath = Join-Path $projectRoot $relative
    New-Item -ItemType Directory -Force -Path (Split-Path $localPath -Parent) | Out-Null
    if ($relative -eq '.keep' -or $relative.EndsWith('\.keep')) { continue }
    $fingerprint = "$($entry.etag)|$($entry.size)|$($entry.updatedAt)"
    if ($state.ContainsKey($entry.relativePath) -and $state[$entry.relativePath] -eq $fingerprint -and (Test-Path $localPath)) { continue }
    $temporaryPath = "$localPath.opgeotech-tmp"
    Invoke-WebRequest -Uri "$baseUrl/api/project-sync/$token/file?path=$([uri]::EscapeDataString([string]$entry.path))" -Headers $headers -OutFile $temporaryPath
    Move-Item -Force $temporaryPath $localPath
    $state[$entry.relativePath] = $fingerprint
    Write-Host "Synced $($entry.relativePath)"
  }
  $state | ConvertTo-Json | Set-Content -Encoding UTF8 $statePath
}

try {
  Sync-Project
  if (-not $RunOnce) { Write-Host "OPGeotech synchronization completed." }
} catch {
  $logPath = "C:\ProgramData\OPGeotech\sync-error.log"
  $_ | Out-String | Set-Content -Encoding UTF8 $logPath
  Write-Error $_
  exit 1
}
