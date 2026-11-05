import { useRef, useState } from "react";
import {
  FolderOpen,
  HardDriveUpload,
  Loader2,
  Download,
  RefreshCw,
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
  const files = trpc.projectStorage.list.useQuery({ teamId, projectId });
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
      </CardHeader>
      <CardContent className="space-y-4">
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
