import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Upload, Download, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { trpc } from "@/lib/trpc";
import { parseRadarWorkbook, RadarSummaryRow } from "@/lib/radarWorkbook";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function downloadTemplate() {
  const rows = [
    ["Date", "Pit", "Window", "displacement", "", "", "Velocity", "", "", "Observations"],
    ["", "", "", "Max", "min", "average", "Max", "min", "average", ""],
    ["24-Apr-25", "Fekola", "East", 1.47, 0.015, 0.74, 0.077, 0, 0.039, "NF"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Radar Monitoring");
  XLSX.writeFile(workbook, "OPGeotech_Radar_Monitoring_Template.xlsx");
}

export default function Monitoring() {
  const [wallId, setWallId] = useState<number | null>(null);
  const records = trpc.monitoring.list.useQuery();
  const rowsQuery = trpc.monitoring.summaryRows.useQuery({ monitoringRecordId: wallId ?? 0 }, { enabled: wallId !== null });
  const utils = trpc.useUtils();
  const importSummary = trpc.monitoring.importRadarSummary.useMutation({
    onSuccess: async result => {
      await utils.monitoring.summaryRows.invalidate();
      toast.success(`${result.count} Excel monitoring rows imported`);
    },
    onError: error => toast.error(error.message),
  });

  const rows = rowsQuery.data ?? [];
  const summary = useMemo(() => {
    const displacement = rows.map(row => row.displacementMaxMm).filter((value): value is number => value !== null);
    const velocity = rows.map(row => row.velocityMaxMmPerDay).filter((value): value is number => value !== null);
    return {
      records: rows.length,
      windows: new Set(rows.map(row => row.window)).size,
      maxDisplacement: displacement.length ? Math.max(...displacement) : null,
      maxVelocity: velocity.length ? Math.max(...velocity.map(Math.abs)) : null,
    };
  }, [rows]);

  const handleImport = async (file?: File) => {
    if (!file || wallId === null) return;
    try {
      const imported = parseRadarWorkbook(await file.arrayBuffer());
      importSummary.mutate({ monitoringRecordId: wallId, source: file.name, rows: imported });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read the Excel workbook");
    }
  };

  return (
    <div className="container py-10">
      <ModuleHeader index="10" title="Monitoring" description="Import daily radar summaries using the OPGeotech Excel structure: Date, Pit, Window, displacement statistics, velocity statistics and observations." />
      <div className="flex flex-wrap gap-3 mt-7">
        <Button variant="outline" className="rounded-none" onClick={downloadTemplate}><Download className="h-4 w-4 mr-2" /> Download Excel template</Button>
        <label className="inline-flex"><input className="sr-only" type="file" accept=".xlsx,.xls" disabled={wallId === null || importSummary.isPending} onChange={event => { void handleImport(event.target.files?.[0]); event.currentTarget.value = ""; }} /><span className={`inline-flex items-center justify-center rounded-none bg-primary px-4 py-2 text-sm font-bold text-primary-foreground cursor-pointer ${wallId === null ? "opacity-50 pointer-events-none" : ""}`}><Upload className="h-4 w-4 mr-2" /> {importSummary.isPending ? "Importing..." : "Import Excel workbook"}</span></label>
      </div>
      <div className="border-t-2 border-foreground mt-8 pt-4 max-w-3xl">
        <SectionLabel>Monitoring dataset</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <div><Label className="swiss-label text-[11px]">Wall / slope register</Label><Select value={wallId ? String(wallId) : ""} onValueChange={value => setWallId(Number(value))}><SelectTrigger className="rounded-none border-foreground mt-1"><SelectValue placeholder="Choose a registered wall" /></SelectTrigger><SelectContent>{(records.data ?? []).map(record => <SelectItem key={record.id} value={String(record.id)}>{record.wallName}</SelectItem>)}</SelectContent></Select></div>
          <div className="border border-foreground p-4 text-sm text-muted-foreground"><FileSpreadsheet className="h-4 w-4 text-primary mb-2" /><p>Use the two-row header layout from the template. The imported rows are stored against the selected wall and used by Radar Report.</p></div>
        </div>
      </div>
      {wallId !== null && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
            {[["Rows", summary.records], ["Windows", summary.windows], ["Max displacement", summary.maxDisplacement === null ? "—" : `${summary.maxDisplacement} mm`], ["Max velocity", summary.maxVelocity === null ? "—" : `${summary.maxVelocity} mm/day`]].map(([label, value]) => <div key={String(label)} className="border border-foreground p-4"><div className="swiss-label text-[10px] mb-2">{label}</div><div className="text-xl font-bold">{value}</div></div>)}
          </div>
          <div className="border border-foreground mt-8 overflow-x-auto"><div className="p-4 border-b border-foreground flex items-center gap-2"><Table2 className="h-4 w-4 text-primary" /><div><div className="swiss-label text-[10px]">Imported radar summary rows</div><div className="text-xs text-muted-foreground mt-1">{rows.length} rows · displacement and velocity only</div></div></div><table className="w-full min-w-[1100px] text-sm"><thead className="border-b border-foreground bg-muted/40"><tr className="text-left">{["Date", "Pit", "Window", "Disp. max", "Disp. min", "Disp. avg", "Vel. max", "Vel. min", "Vel. avg", "Observations"].map(label => <th key={label} className="p-3 swiss-label text-[10px]">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map(row => <tr key={row.id}><td className="p-3 whitespace-nowrap">{formatDate(row.measuredAt)}</td><td className="p-3">{row.pit}</td><td className="p-3">{row.window}</td><td className="p-3 font-mono">{row.displacementMaxMm ?? "—"}</td><td className="p-3 font-mono">{row.displacementMinMm ?? "—"}</td><td className="p-3 font-mono">{row.displacementAverageMm ?? "—"}</td><td className="p-3 font-mono">{row.velocityMaxMmPerDay ?? "—"}</td><td className="p-3 font-mono">{row.velocityMinMmPerDay ?? "—"}</td><td className="p-3 font-mono">{row.velocityAverageMmPerDay ?? "—"}</td><td className="p-3 text-xs">{row.observations || "—"}</td></tr>)}{rows.length === 0 && <tr><td colSpan={10} className="p-12 text-center text-muted-foreground">No Excel radar rows imported for this wall yet.</td></tr>}</tbody></table></div>
        </>
      )}
    </div>
  );
}
