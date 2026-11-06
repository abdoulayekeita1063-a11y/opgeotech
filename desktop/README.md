# OPGeotech Desktop for Windows

This folder contains the Windows installer sources for OPGeotech Desktop.

## EXE installer

Install [Inno Setup 6](https://jrsoftware.org/isinfo.php) on a Windows build machine, then run:

```powershell
.\build-installer.ps1
```

The output is `OPGeotech-Desktop-Setup.exe`.

## MSI installer

Install WiX Toolset 4:

```powershell
dotnet tool install --global wix
```

Then run:

```powershell
.\build-msi.ps1
```

The output is `OPGeotech-Desktop.msi`.

## Digital signing

Install the Windows SDK and use an organization-issued Authenticode certificate:

```powershell
.\sign-release.ps1 -CertificateThumbprint YOUR_CERTIFICATE_THUMBPRINT
```

The script signs and verifies every EXE and MSI in the release directory. A real organization certificate is required; the project does not include a private signing key.

## First-run pairing without manual token entry

1. In Team Workspace → Project Data Room, choose `Cloud -> Windows only` or `Bidirectional with conflicts`.
2. Click `Download pairing file`.
3. Keep the pairing JSON in the Windows Downloads folder.
4. Run `OPGeotech-Desktop-Setup.exe`.

The installer automatically detects the latest `OPGeotech-Desktop-Pairing-*.json` file, configures the application, and does not ask the user to type a token. If no pairing file is found, it asks for the OPGeotech URL and token as a fallback.

## Local folders and synchronization

The installer creates:

```text
C:\OPGeotech\
C:\OPGeotech\Projects\
C:\ProgramData\OPGeotech\
C:\Program Files\OPGeotech\
```

The scheduled task `OPGeotech Cloud Sync` runs every 15 minutes. Download-only mode never uploads local changes. Bidirectional mode uploads changes to existing project files and new files placed inside the standard project folders.

When the same file changes locally and in Supabase between sync cycles, the local copy is preserved as:

```text
filename.ext.conflict-YYYYMMDD-HHMMSS
```

The current cloud version remains in the normal path. No local file is silently deleted or overwritten during a detected conflict.
