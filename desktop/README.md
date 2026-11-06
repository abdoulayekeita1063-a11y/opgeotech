# OPGeotech Desktop for Windows

This folder contains the Windows installer source for OPGeotech Desktop.

## Build the EXE

Install [Inno Setup 6](https://jrsoftware.org/isinfo.php) on a Windows build machine, then open PowerShell in this folder and run:

```powershell
.\build-installer.ps1
```

The output is:

```text
OPGeotech-Desktop-Setup.exe
```

The installer creates:

```text
C:\OPGeotech\
C:\OPGeotech\Projects\
C:\ProgramData\OPGeotech\
C:\Program Files\OPGeotech\
```

It also creates an OPGeotech Desktop shortcut and a Windows Task Scheduler task named `OPGeotech Cloud Sync`.

## First-run configuration

After installation, the setup asks for:

1. The OPGeotech web address.
2. A project-specific read-only Windows sync token generated from Team Workspace → Project Data Room.
3. The local project folder, defaulting to `C:\OPGeotech\Projects`.

The first synchronization runs immediately. Later synchronizations run every 15 minutes, even when the browser is closed.

The sync agent only downloads files from Supabase to Windows. It does not delete local files and does not upload local changes. Revoke the token in OPGeotech if the computer is lost or the configuration is no longer trusted.
