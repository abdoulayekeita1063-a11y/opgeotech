import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Upload, Download, Table2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { MonitoringPowerBIReport } from "@/components/MonitoringPowerBIReport";
import { trpc } from "@/lib/trpc";
import { parseRadarWorkbook, RadarSummaryRow } from "@/lib/radarWorkbook";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function downloadTemplate() {
  const rows = [
    [
      "Date",
      "Pit",
      "Window",
      "displacement",
      "",
      "",
      "Velocity",
      "",
      "",
      "Observations",
    ],
    ["", "", "", "Max", "min", "average", "Max", "min", "average", ""],
    ["24-Apr-25", "Fekola", "East", 1.47, 0.015, 0.74, 0.077, 0, 0.039, "NF"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Radar Monitoring");
  XLSX.writeFile(workbook, "OPGeotech_Radar_Monitoring_Template.xlsx");
}

export default function Monitoring() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: "",
    site: "",
    description: "",
  });
  const [importMode, setImportMode] = useState<"replace" | "append">("replace");
  const [activeTab, setActiveTab] = useState(() =>
    window.location.hash === "#report" ? "report" : "data"
  );
  const projects = trpc.monitoring.projects.useQuery();
  const rowsQuery = trpc.monitoring.projectSummaryRows.useQuery(
    { projectId: projectId ?? 0 },
    { enabled: projectId !== null }
  );
  const utils = trpc.useUtils();
  const createProject = trpc.monitoring.createProject.useMutation({
    onSuccess: async result => {
      await utils.monitoring.projects.invalidate();
      setProjectId(result.id);
      setProjectForm({ name: "", site: "", description: "" });
      setProjectDialogOpen(false);
      toast.success("Monitoring project created");
    },
    onError: error => toast.error(error.message),
  });
  const importSummary = trpc.monitoring.importProjectRadarSummary.useMutation({
    onSuccess: async result => {
      await utils.monitoring.projectSummaryRows.invalidate();
      toast.success(
        `${result.count} Excel monitoring rows imported${result.mode === "replace" ? " — previous data replaced" : " — previous data kept"}`
      );
    },
    onError: error => toast.error(error.message),
  });

  const rows = rowsQuery.data ?? [];
  const summary = useMemo(() => {
    const displacement = rows
      .map(row => row.displacementMaxMm)
      .filter((value): value is number => value !== null);
    const velocity = rows
      .map(row => row.velocityMaxMmPerDay)
      .filter((value): value is number => value !== null);
    return {
      records: rows.length,
      windows: new Set(rows.map(row => row.window)).size,
      maxDisplacement: displacement.length ? Math.max(...displacement) : null,
      maxVelocity: velocity.length ? Math.max(...velocity.map(Math.abs)) : null,
    };
  }, [rows]);

  const handleImport = async (file?: File) => {
    if (!file || projectId === null) return;
    try {
      const imported = parseRadarWorkbook(await file.arrayBuffer());
      importSummary.mutate({
        projectId,
        source: file.name,
        importMode,
        rows: imported,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to read the Excel workbook"
      );
    }
  };

  return (
    <div className="container py-10">
      <ModuleHeader
        index="10"
        title="Monitoring"
        description="Import daily radar summaries, review the source table, and build an interactive Power BI-style analysis from displacement, velocity and observation data."
        module="Monitoring"
      />
      <Tabs
        value={activeTab}
        onValueChange={value => {
          setActiveTab(value);
          window.history.replaceState(
            null,
            "",
            value === "report" ? "#report" : window.location.pathname
          );
        }}
        className="mt-7"
      >
        <TabsList className="rounded-none border border-foreground bg-background h-auto p-0 print:hidden">
          <TabsTrigger
            value="data"
            className="rounded-none px-6 py-3 data-[state=active]:bg-black data-[state=active]:text-white"
          >
            Data
          </TabsTrigger>
          <TabsTrigger
            value="report"
            className="rounded-none px-6 py-3 data-[state=active]:bg-[#d71920] data-[state=active]:text-white"
          >
            Report
          </TabsTrigger>
        </TabsList>
        <TabsContent value="data" className="mt-0">
          <div className="flex flex-wrap items-end gap-3 mt-7">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={downloadTemplate}
            >
              <Download className="h-4 w-4 mr-2" /> Download Excel template
            </Button>
            <div className="min-w-64">
              <Label className="swiss-label text-[10px]">
                When importing a new file
              </Label>
              <Select
                value={importMode}
                onValueChange={value =>
                  setImportMode(value as "replace" | "append")
                }
              >
                <SelectTrigger className="mt-1 rounded-none border-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Replace existing data</SelectItem>
                  <SelectItem value="append">
                    Keep existing data and add
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="inline-flex">
              <input
                className="sr-only"
                type="file"
                accept=".xlsx,.xls"
                disabled={projectId === null || importSummary.isPending}
                onChange={event => {
                  void handleImport(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <span
                className={`inline-flex items-center justify-center rounded-none bg-primary px-4 py-2 text-sm font-bold text-primary-foreground cursor-pointer ${projectId === null ? "opacity-50 pointer-events-none" : ""}`}
              >
                <Upload className="h-4 w-4 mr-2" />{" "}
                {importSummary.isPending
                  ? "Importing..."
                  : "Import Excel workbook"}
              </span>
            </label>
          </div>
          <p className="mt-2 max-w-3xl border-l-4 border-primary bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            Replace removes all radar rows currently stored in the selected
            project before saving the new workbook. Keep existing data adds the
            new rows without deleting the previous import.
          </p>
          <div className="border-t-2 border-foreground mt-8 pt-4 max-w-3xl">
            <SectionLabel>Monitoring dataset</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
              <div>
                <Label className="swiss-label text-[11px]">Project</Label>
                <div className="flex gap-2 mt-1">
                  <Select
                    value={projectId ? String(projectId) : ""}
                    onValueChange={value => setProjectId(Number(value))}
                  >
                    <SelectTrigger className="rounded-none border-foreground">
                      <SelectValue placeholder="Choose a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {(projects.data ?? []).map(project => (
                        <SelectItem key={project.id} value={String(project.id)}>
                          {project.name}
                          {project.site ? ` · ${project.site}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none shrink-0"
                    onClick={() => setProjectDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Add Project
                  </Button>
                </div>
              </div>
              <div className="border border-foreground p-4 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4 text-primary mb-2" />
                <p>
                  Create or select a project, then import the two-row Excel
                  template. Radar data and reports remain separated by project.
                </p>
              </div>
            </div>
          </div>
          {projectId !== null && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
                {[
                  ["Rows", summary.records],
                  ["Windows", summary.windows],
                  [
                    "Max displacement",
                    summary.maxDisplacement === null
                      ? "—"
                      : `${summary.maxDisplacement} mm`,
                  ],
                  [
                    "Max velocity",
                    summary.maxVelocity === null
                      ? "—"
                      : `${summary.maxVelocity} mm/day`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="border border-foreground p-4"
                  >
                    <div className="swiss-label text-[10px] mb-2">{label}</div>
                    <div className="text-xl font-bold">{value}</div>
                  </div>
                ))}
              </div>
              <div className="border border-foreground mt-8 overflow-x-auto">
                <div className="p-4 border-b border-foreground flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-primary" />
                  <div>
                    <div className="swiss-label text-[10px]">
                      Imported radar summary rows
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {rows.length} rows · displacement and velocity only
                    </div>
                  </div>
                </div>
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="border-b border-foreground bg-muted/40">
                    <tr className="text-left">
                      {[
                        "Date",
                        "Pit",
                        "Window",
                        "Disp. max",
                        "Disp. min",
                        "Disp. avg",
                        "Vel. max",
                        "Vel. min",
                        "Vel. avg",
                        "Observations",
                      ].map(label => (
                        <th key={label} className="p-3 swiss-label text-[10px]">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map(row => (
                      <tr key={row.id}>
                        <td className="p-3 whitespace-nowrap">
                          {formatDate(row.measuredAt)}
                        </td>
                        <td className="p-3">{row.pit}</td>
                        <td className="p-3">{row.window}</td>
                        <td className="p-3 font-mono">
                          {row.displacementMaxMm ?? "—"}
                        </td>
                        <td className="p-3 font-mono">
                          {row.displacementMinMm ?? "—"}
                        </td>
                        <td className="p-3 font-mono">
                          {row.displacementAverageMm ?? "—"}
                        </td>
                        <td className="p-3 font-mono">
                          {row.velocityMaxMmPerDay ?? "—"}
                        </td>
                        <td className="p-3 font-mono">
                          {row.velocityMinMmPerDay ?? "—"}
                        </td>
                        <td className="p-3 font-mono">
                          {row.velocityAverageMmPerDay ?? "—"}
                        </td>
                        <td className="p-3 text-xs">
                          {row.observations || "—"}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={10}
                          className="p-12 text-center text-muted-foreground"
                        >
                          No Excel radar rows imported for this project yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="report" className="mt-7">
          <MonitoringPowerBIReport projectId={projectId} />
        </TabsContent>
      </Tabs>
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="rounded-none border-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="uppercase">
              Add Monitoring Project
            </DialogTitle>
            <DialogDescription>
              Create a separate workspace for radar imports, dashboards and
              reports.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 mt-2"
            onSubmit={event => {
              event.preventDefault();
              createProject.mutate({
                name: projectForm.name.trim(),
                site: projectForm.site.trim() || undefined,
                description: projectForm.description.trim() || undefined,
              });
            }}
          >
            <div>
              <Label className="swiss-label text-[10px]">Project name *</Label>
              <Input
                required
                className="rounded-none border-foreground mt-1"
                value={projectForm.name}
                onChange={event =>
                  setProjectForm(previous => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                placeholder="Fekola Radar Monitoring 2026"
              />
            </div>
            <div>
              <Label className="swiss-label text-[10px]">Site</Label>
              <Input
                className="rounded-none border-foreground mt-1"
                value={projectForm.site}
                onChange={event =>
                  setProjectForm(previous => ({
                    ...previous,
                    site: event.target.value,
                  }))
                }
                placeholder="Fekola Mine"
              />
            </div>
            <div>
              <Label className="swiss-label text-[10px]">Description</Label>
              <Textarea
                className="rounded-none border-foreground mt-1"
                value={projectForm.description}
                onChange={event =>
                  setProjectForm(previous => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
                placeholder="Monitoring period, radar coverage and project objective"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-none"
                onClick={() => setProjectDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-none"
                disabled={!projectForm.name.trim() || createProject.isPending}
              >
                {createProject.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
