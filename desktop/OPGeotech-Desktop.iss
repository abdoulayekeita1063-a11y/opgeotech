; OPGeotech Desktop Windows installer
; Compile this file with Inno Setup on Windows to produce OPGeotech-Desktop-Setup.exe.
#define AppName "OPGeotech Desktop"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define Publisher "OPGeotech"
#define AppExeName "OPGeotech-Desktop-Setup"

[Setup]
AppId={{A7E0B6D1-0B4D-4C9D-9D4C-202611060001}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={autopf}\OPGeotech
DefaultGroupName={#AppName}
OutputDir=.
OutputBaseFilename={#AppExeName}
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
UninstallDisplayName={#AppName}

[Files]
Source: "install-opgeotech.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "opgeotech-sync.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "opgeotech-launch.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "C:\OPGeotech"
Name: "C:\OPGeotech\Projects"
Name: "C:\ProgramData\OPGeotech"

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-opgeotech.ps1"""; WorkingDir: "{app}"; Description: "Configure OPGeotech Desktop and project synchronization"; Flags: postinstall waituntilterminated

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Unregister-ScheduledTask -TaskName 'OPGeotech Cloud Sync' -Confirm:$false -ErrorAction SilentlyContinue"""; Flags: runhidden waituntilterminated

[Icons]
Name: "{group}\OPGeotech Desktop"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\opgeotech-launch.ps1"""; WorkingDir: "{app}"
Name: "{group}\OPGeotech Project Files"; Filename: "C:\OPGeotech\Projects"
Name: "{commondesktop}\OPGeotech Desktop"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\opgeotech-launch.ps1"""; WorkingDir: "{app}"
