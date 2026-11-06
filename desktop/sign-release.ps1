[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$CertificateThumbprint,
  [string]$TimestampUrl = "http://timestamp.digicert.com",
  [string]$ReleaseDirectory = $PSScriptRoot
)

$ErrorActionPreference = "Stop"
$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) { throw "Windows SDK signtool.exe was not found." }
$certificate = Get-ChildItem Cert:\CurrentUser\My\$CertificateThumbprint, Cert:\LocalMachine\My\$CertificateThumbprint -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $certificate) { throw "The Authenticode certificate was not found for thumbprint $CertificateThumbprint." }

$artifacts = Get-ChildItem $ReleaseDirectory -File | Where-Object { $_.Extension -in ".exe", ".msi" }
if (-not $artifacts) { throw "No EXE or MSI release artifacts were found." }
foreach ($artifact in $artifacts) {
  & $signtool.Source sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $artifact.FullName
  if ($LASTEXITCODE -ne 0) { throw "Signing failed for $($artifact.Name)." }
  & $signtool.Source verify /pa /all $artifact.FullName
  if ($LASTEXITCODE -ne 0) { throw "Signature verification failed for $($artifact.Name)." }
  Write-Host "Signed and verified $($artifact.Name)"
}
