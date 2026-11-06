import { useRef, useState } from "react";
import {
  Archive,
  FolderOpen,
  HardDriveUpload,
  Loader2,
  Download,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const folderLabels: Record<string, string> = {
  "01_Project": "01 Project",
  "02_Drillholes/DXF": "02 Drillholes / DXF",
  "02_Drillholes/CSV": "02 Drillholes / CSV",
  "02_Drillholes/Excel": "02 Drillholes / Excel",
  "03_Structural_Mapping": "03 Structural Mapping",
  "04_Rock_Mass_Classification": "04 Rock Mass Classification",
  "05_Kinematic_Analysis": "05 Kinematic Analysis",
  "06_Slope_Stability": "06 Slope Stability",
  "07_Blast_Assessment": "07 Blast Assessment",
  "08_Wall_Assessment": "08 Wall Assessment",
  "09_Berm_Monitoring": "09 Berm Monitoring",
  "10_Piezometers": "10 Piezometers",
  "11_Radar_Monitoring": "11 Radar Monitoring",
  "12_Reports": "12 Reports",
  "13_Exports": "13 Exports",
};

function createWindowsSyncScript(token: string) {
  const baseUrl = window.location.origin;
  return `# OPGeotech Cloud -> Windows project synchronizer
# This token is read-only and scoped to one OPGeotech project. Keep this file private.
# Revoke the token from Team Workspace if this file is lost.

param(
  [switch]$RunOnce,
  [switch]$Install,
  [string]$LocalRoot = "C:\\OPGeotech\\Projects"
)

$BaseUrl = "${baseUrl}"
$Token = "${token}"
$IntervalSeconds = 900
$Headers = @{ Authorization = "Bearer $Token" }

function Sync-Project {
  $manifest = Invoke-RestMethod -Uri "$BaseUrl/api/project-sync/$Token/manifest" -Headers $Headers
  $safeName = [regex]::Replace([string]$manifest.project.name, '[^a-zA-Z0-9._-]', '-').Trim('-')
  if ([string]::IsNullOrWhiteSpace($safeName)) { $safeName = "project" }
  $projectRoot = Join-Path $LocalRoot "$safeName-$($manifest.project.id)"
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
    $parent = Split-Path $localPath -Parent
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    if ($relative -eq '.keep' -or $relative.EndsWith('\\.keep')) { continue }
    $fingerprint = "$($entry.etag)|$($entry.size)|$($entry.updatedAt)"
    if ($state.ContainsKey($entry.relativePath) -and $state[$entry.relativePath] -eq $fingerprint -and (Test-Path $localPath)) { continue }
    $temporaryPath = "$localPath.opgeotech-tmp"
    Invoke-WebRequest -Uri "$BaseUrl/api/project-sync/$Token/file?path=$([uri]::EscapeDataString([string]$entry.path))" -Headers $Headers -OutFile $temporaryPath
    Move-Item -Force $temporaryPath $localPath
    $state[$entry.relativePath] = $fingerprint
    Write-Host "Synced $($entry.relativePath)"
  }
  $state | ConvertTo-Json | Set-Content -Encoding UTF8 $statePath
}

if ($Install) {
  $scriptPath = $MyInvocation.MyCommand.Path
  $taskName = "OPGeotech Cloud Sync $($Token.Substring($Token.Length - 8))"
  $quote = [char]34
  $argument = "-NoProfile -ExecutionPolicy Bypass -File $quote$scriptPath$quote -RunOnce -LocalRoot $quote$LocalRoot$quote"
  $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument $argument
  $trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration ([TimeSpan]::MaxValue)
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) -Force | Out-Null
  Write-Host "Installed $taskName. Cloud -> Windows sync runs every 15 minutes."
  exit 0
}

try { Sync-Project } catch { Write-Warning $_.Exception.Message; exit 1 }
`;
}

function downloadTextFile(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createDesktopPairingFile(
  token: string,
  mode: "download_only" | "bidirectional"
) {
  return JSON.stringify(
    {
      version: 1,
      appUrl: window.location.origin,
      syncToken: token,
      mode,
      localRoot: "C:\\OPGeotech\\Projects",
      createdAt: new Date().toISOString(),
    },
    null,
    2
  );
}

export function ProjectDataRoom({
  teamId,
  projectId,
}: {
  teamId: number;
  projectId: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState("01_Project");
  const [initializing, setInitializing] = useState(false);
  const [syncMode, setSyncMode] = useState<"download_only" | "bidirectional">(
    "download_only"
  );
  const files = trpc.projectStorage.list.useQuery({ teamId, projectId });
  const syncTokens = trpc.collaboration.listSyncTokens.useQuery({
    teamId,
    projectId,
  });
  const initialize = trpc.projectStorage.initialize.useMutation({
    onSuccess: result => {
      setInitializing(false);
      void files.refetch();
      toast.success(
        `${result.folders.length} project folders are ready in Supabase Storage.`
      );
    },
    onError: error => {
      setInitializing(false);
      toast.error(error.message);
    },
  });
  const upload = trpc.projectStorage.upload.useMutation({
    onSuccess: () => {
      void files.refetch();
      toast.success("File uploaded to the project data room.");
    },
    onError: error => toast.error(error.message),
  });
  const download = trpc.projectStorage.download.useMutation({
    onSuccess: result =>
      window.open(result.url, "_blank", "noopener,noreferrer"),
    onError: error => toast.error(error.message),
  });
  const exportZip = trpc.projectStorage.exportZip.useMutation({
    onSuccess: result => {
      const binary = atob(result.dataBase64);
      const bytes = Uint8Array.from(binary, character =>
        character.charCodeAt(0)
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/zip" })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Complete project ZIP downloaded.");
    },
    onError: error => toast.error(error.message),
  });
  const createSyncToken = trpc.collaboration.createSyncToken.useMutation({
    onSuccess: result => {
      downloadTextFile(
        `OPGeotech-Desktop-Pairing-${projectId}.json`,
        createDesktopPairingFile(result.token, syncMode)
      );
      void syncTokens.refetch();
      toast.success(
        "Desktop pairing file downloaded. The Windows installer can configure the project without manual token entry."
      );
    },
    onError: error => toast.error(error.message),
  });
  const revokeSyncToken = trpc.collaboration.revokeSyncToken.useMutation({
    onSuccess: () => {
      void syncTokens.refetch();
      toast.success("Windows sync token revoked.");
    },
    onError: error => toast.error(error.message),
  });

  async function handleFile(file?: File) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Files must be 50 MB or smaller.");
      return;
    }
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () =>
        reject(new Error("Could not read the selected file."));
      reader.readAsDataURL(file);
    });
    upload.mutate({
      teamId,
      projectId,
      folder: folder as Parameters<typeof upload.mutate>[0]["folder"],
      fileName: file.name,
      mimeType: file.type,
      dataBase64,
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  const folderList = files.data?.folders ?? [];
  const fileList = files.data?.files ?? [];

  return (
    <Card className="mt-6 border-slate-300 bg-slate-50/60">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FolderOpen className="h-5 w-5 text-red-600" /> Project Data Room
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Supabase Storage folders for the complete OPGeotech project record.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exportZip.isPending || !files.data}
            onClick={() => exportZip.mutate({ teamId, projectId })}
          >
            {exportZip.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Archive className="mr-2 h-4 w-4" />
            )}
            Export complete project to ZIP
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={initializing}
            onClick={() => {
              setInitializing(true);
              initialize.mutate({ teamId, projectId });
            }}
          >
            {initializing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}{" "}
            Initialize folders
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded border border-red-200 bg-red-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4 text-red-600" /> Windows cloud
                sync
              </p>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Generate a secure pairing file for the Windows installer. The
                desktop agent checks Supabase every 15 minutes. Bidirectional
                mode uploads local changes and preserves conflicts as separate
                local files.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Select
                value={syncMode}
                onValueChange={value =>
                  setSyncMode(value as "download_only" | "bidirectional")
                }
              >
                <SelectTrigger className="w-[190px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="download_only">
                    Cloud → Windows only
                  </SelectItem>
                  <SelectItem value="bidirectional">
                    Bidirectional with conflicts
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={createSyncToken.isPending}
                onClick={() =>
                  createSyncToken.mutate({
                    teamId,
                    projectId,
                    mode: syncMode,
                    label:
                      syncMode === "bidirectional"
                        ? "Windows bidirectional sync every 15 minutes"
                        : "Windows download sync every 15 minutes",
                  })
                }
              >
                {createSyncToken.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download pairing file
              </Button>
            </div>
          </div>
          {(syncTokens.data?.length ?? 0) > 0 && (
            <div className="mt-3 space-y-2 border-t border-red-200 pt-3 text-xs">
              <p className="font-medium">Active sync tokens</p>
              {syncTokens.data?.map(token => (
                <div
                  className="flex flex-wrap items-center justify-between gap-2"
                  key={token.id}
                >
                  <span>
                    {token.label} ·{" "}
                    {token.mode === "bidirectional"
                      ? "bidirectional"
                      : "read-only"}{" "}
                    · created {new Date(token.createdAt).toLocaleString()}
                    {token.revokedAt ? " · revoked" : ""}
                  </span>
                  {!token.revokedAt && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={revokeSyncToken.isPending}
                      onClick={() =>
                        revokeSyncToken.mutate({ teamId, id: token.id })
                      }
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Select value={folder} onValueChange={setFolder}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a project folder" />
            </SelectTrigger>
            <SelectContent>
              {folderList.map(item => (
                <SelectItem key={item} value={item}>
                  {folderLabels[item] ?? item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div>
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              onChange={event => void handleFile(event.target.files?.[0])}
            />
            <Button
              disabled={upload.isPending || folderList.length === 0}
              onClick={() => fileRef.current?.click()}
            >
              {upload.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <HardDriveUpload className="mr-2 h-4 w-4" />
              )}{" "}
              Upload file
            </Button>
          </div>
        </div>
        {fileList.length === 0 ? (
          <p className="rounded border border-dashed p-5 text-sm text-muted-foreground">
            Initialize the folders, then upload DXF, Excel, CSV, photos, radar
            files or reports.
          </p>
        ) : (
          <div className="divide-y rounded border bg-white">
            {fileList.map(file => {
              const path = `${files.data?.projectFolder}/${file.name}`;
              return (
                <div
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                  key={path}
                >
                  <span className="min-w-0 truncate">{file.name}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => download.mutate({ teamId, projectId, path })}
                  >
                    <Download className="mr-2 h-4 w-4" /> Download
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
