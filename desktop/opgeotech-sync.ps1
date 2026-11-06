# OPGeotech Desktop synchronizer: Cloud -> Windows or bidirectional
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
$allowedFolders = @(
  "01_Project", "02_Drillholes", "03_Structural_Mapping", "04_Rock_Mass_Classification",
  "05_Kinematic_Analysis", "06_Slope_Stability", "07_Blast_Assessment", "08_Wall_Assessment",
  "09_Berm_Monitoring", "10_Piezometers", "11_Radar_Monitoring", "12_Reports", "13_Exports"
)

function Get-LocalHash([string]$path) {
  if (-not (Test-Path $path)) { return "" }
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
}

function Load-State([string]$path) {
  $result = @{}
  if (-not (Test-Path $path)) { return $result }
  $parsed = Get-Content $path -Raw | ConvertFrom-Json
  foreach ($property in $parsed.PSObject.Properties) {
    if ($property.Value -is [string]) {
      # Backward compatibility with the original download-only state format.
      $result[$property.Name] = [ordered]@{ cloudFingerprint = [string]$property.Value; localHash = "" }
    } else {
      $result[$property.Name] = [ordered]@{
        cloudFingerprint = [string]$property.Value.cloudFingerprint
        localHash = [string]$property.Value.localHash
      }
    }
  }
  return $result
}

function Save-Conflict([string]$path) {
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
  $conflictPath = "$path.conflict-$stamp"
  Copy-Item -LiteralPath $path -Destination $conflictPath -Force
  Write-Warning "Conflict preserved locally as $conflictPath"
}

function Upload-File([string]$projectFolder, [string]$relativePath, [string]$localPath) {
  $encodedPath = [uri]::EscapeDataString("$projectFolder/$relativePath")
  Invoke-WebRequest -Method Post -Uri "$baseUrl/api/project-sync/$token/file?path=$encodedPath" -Headers $headers -ContentType "application/octet-stream" -InFile $localPath | Out-Null
  Write-Host "Uploaded $relativePath"
}

function Download-File($entry, [string]$projectRoot, [string]$localPath) {
  $parent = Split-Path $localPath -Parent
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $temporaryPath = "$localPath.opgeotech-tmp"
  Invoke-WebRequest -Uri "$baseUrl/api/project-sync/$token/file?path=$([uri]::EscapeDataString([string]$entry.path))" -Headers $headers -OutFile $temporaryPath
  Move-Item -Force $temporaryPath $localPath
  Write-Host "Downloaded $($entry.relativePath)"
}

function Sync-Project {
  $manifest = Invoke-RestMethod -Uri "$baseUrl/api/project-sync/$token/manifest" -Headers $headers
  $safeName = [regex]::Replace([string]$manifest.project.name, '[^a-zA-Z0-9._-]', '-').Trim('-')
  if ([string]::IsNullOrWhiteSpace($safeName)) { $safeName = "project" }
  $projectFolder = [string]$manifest.project.folder
  $projectRoot = Join-Path $localRoot "$safeName-$($manifest.project.id)"
  New-Item -ItemType Directory -Force -Path $projectRoot | Out-Null
  $statePath = Join-Path $projectRoot ".opgeotech-sync-state.json"
  $state = Load-State $statePath
  $known = @{}

  foreach ($entry in $manifest.files) {
    $relative = [string]$entry.relativePath
    $known[$relative] = $true
    $localPath = Join-Path $projectRoot (($relative).Replace('/', [IO.Path]::DirectorySeparatorChar))
    $cloudFingerprint = "$($entry.etag)|$($entry.size)|$($entry.updatedAt)"
    $old = $state[$relative]
    $exists = Test-Path $localPath
    $currentLocalHash = if ($exists) { Get-LocalHash $localPath } else { "" }
    $localChanged = $null -ne $old -and $old.localHash -ne "" -and $currentLocalHash -ne $old.localHash
    $cloudChanged = $null -ne $old -and $old.cloudFingerprint -ne "" -and $cloudFingerprint -ne $old.cloudFingerprint

    if ([string]$manifest.mode -eq "bidirectional" -and $localChanged -and $cloudChanged) {
      Save-Conflict $localPath
      Download-File $entry $projectRoot $localPath
      $currentLocalHash = Get-LocalHash $localPath
    } elseif ([string]$manifest.mode -eq "bidirectional" -and $localChanged -and -not $cloudChanged) {
      Upload-File $projectFolder $relative $localPath
      $state[$relative] = [ordered]@{ cloudFingerprint = $cloudFingerprint; localHash = $currentLocalHash }
      continue
    } elseif (-not $exists -or $null -eq $old -or $cloudChanged) {
      if ($relative -ne ".keep" -and -not $relative.EndsWith('/.keep')) {
        Download-File $entry $projectRoot $localPath
        $currentLocalHash = Get-LocalHash $localPath
      }
    }
    $state[$relative] = [ordered]@{ cloudFingerprint = $cloudFingerprint; localHash = $currentLocalHash }
  }

  # Upload new files created locally inside a standard project folder.
  if ([string]$manifest.mode -eq "bidirectional") {
    Get-ChildItem -LiteralPath $projectRoot -File -Recurse | Where-Object {
      $_.FullName -notlike "$projectRoot\.opgeotech-sync-state.json" -and
      $_.Name -notlike "*.opgeotech-tmp" -and $_.Name -notlike "*.conflict-*"
    } | ForEach-Object {
      $relative = $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
      $folder = $relative.Split('/')[0]
      if ($allowedFolders -contains $folder -and -not $known.ContainsKey($relative)) {
        Upload-File $projectFolder $relative $_.FullName
        $state[$relative] = [ordered]@{ cloudFingerprint = ""; localHash = Get-LocalHash $_.FullName }
      }
    }
  }

  $state | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $statePath
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
