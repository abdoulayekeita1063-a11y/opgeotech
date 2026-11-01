import { useMemo, useState } from "react";
import { Download, Plus, Trash2, Waves, LineChart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { trpc } from "@/lib/trpc";

type FormState = {
  name: string;
  easting: string;
  northing: string;
  elevation: string;
  depth: string;
  waterLevel: string;
};

const emptyForm: FormState = { name: "", easting: "", northing: "", elevation: "", depth: "", waterLevel: "" };
const numberValue = (value: string) => Number(value);
const formatNumber = (value: number) => Number.isFinite(value) ? value.toFixed(2) : "—";

function dxfNumber(value: number) {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "0";
}

function exportPiezometricDxf(rows: Array<{ name: string; easting: number; northing: number; piezometricElevation: number }>) {
  if (rows.length < 2) {
    toast.error("Add at least two piezometers before exporting the piezometric line");
    return;
  }
  const ordered = [...rows].sort((a, b) => a.easting - b.easting || a.northing - b.northing);
  const lines = [
    "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES", "0", "POLYLINE", "8", "PIEZOMETRIC_LINE", "66", "1", "70", "8",
  ];
  ordered.forEach(point => lines.push("0", "VERTEX", "8", "PIEZOMETRIC_LINE", "10", dxfNumber(point.easting), "20", dxfNumber(point.northing), "30", dxfNumber(point.piezometricElevation)));
  lines.push("0", "SEQEND", "0", "ENDSEC", "0", "EOF", "");
  const blob = new Blob([lines.join("\n")], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "OPGeotech_Piezometric_Line.dxf";
  anchor.click();
  URL.revokeObjectURL(url);
  toast.success("Piezometric line exported as DXF");
}

function ProfileChart({ rows }: { rows: Array<{ name: string; easting: number; northing: number; piezometricElevation: number }> }) {
  const ordered = useMemo(() => [...rows].sort((a, b) => a.easting - b.easting || a.northing - b.northing), [rows]);
  if (!ordered.length) return <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">Add all readings, then click “Draw piezometric line”.</div>;
  const width = 900;
  const height = 330;
  const pad = { left: 64, right: 28, top: 28, bottom: 54 };
  const minX = Math.min(...ordered.map(point => point.easting));
  const maxX = Math.max(...ordered.map(point => point.easting));
  const minY = Math.min(...ordered.map(point => point.piezometricElevation));
  const maxY = Math.max(...ordered.map(point => point.piezometricElevation));
  const xRange = Math.max(maxX - minX, 1);
  const yRange = Math.max(maxY - minY, 1);
  const x = (value: number) => pad.left + ((value - minX) / xRange) * (width - pad.left - pad.right);
  const y = (value: number) => height - pad.bottom - ((value - minY) / yRange) * (height - pad.top - pad.bottom);
  const points = ordered.map(point => `${x(point.easting)},${y(point.piezometricElevation)}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[720px] w-full" role="img" aria-label="Piezometric line profile">
        <rect x="0" y="0" width={width} height={height} fill="white" />
        {[0, 0.5, 1].map(fraction => <line key={fraction} x1={pad.left} x2={width - pad.right} y1={pad.top + fraction * (height - pad.top - pad.bottom)} y2={pad.top + fraction * (height - pad.top - pad.bottom)} stroke="#e2e8f0" strokeDasharray="4 4" />)}
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={height - pad.bottom} stroke="#0f172a" />
        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="#0f172a" />
        {ordered.length > 1 && <polyline points={points} fill="none" stroke="#0f766e" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />}
        {ordered.map(point => <g key={point.name}><circle cx={x(point.easting)} cy={y(point.piezometricElevation)} r="6" fill="#d71920" stroke="white" strokeWidth="2" /><text x={x(point.easting)} y={y(point.piezometricElevation) - 12} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f172a">{point.name}</text></g>)}
        <text x="18" y={pad.top + 6} fontSize="12" fill="#475569">RL {formatNumber(maxY)}</text>
        <text x="18" y={height - pad.bottom} fontSize="12" fill="#475569">RL {formatNumber(minY)}</text>
        <text x={width / 2} y={height - 14} textAnchor="middle" fontSize="12" fill="#475569">Easting profile order (m)</text>
        <text x="16" y={height / 2} textAnchor="middle" transform={`rotate(-90 16 ${height / 2})`} fontSize="12" fill="#475569">Piezometric elevation (m RL)</text>
      </svg>
    </div>
  );
}

export default function Piezometer() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [lineDrawn, setLineDrawn] = useState(false);
  const rowsQuery = trpc.piezometer.list.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.piezometer.create.useMutation({
    onSuccess: async () => { await utils.piezometer.list.invalidate(); setForm(emptyForm); setLineDrawn(false); toast.success("Piezometer reading saved. Add the remaining points, then draw the line."); },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.piezometer.delete.useMutation({
    onSuccess: async () => { await utils.piezometer.list.invalidate(); setLineDrawn(false); toast.success("Piezometer reading deleted. Draw the line again when all points are ready."); },
    onError: error => toast.error(error.message),
  });
  const rows = rowsQuery.data ?? [];
  const chartRows = rows.map(row => ({ name: row.name, easting: row.easting, northing: row.northing, piezometricElevation: row.piezometricElevation }));
  const plottedRows = lineDrawn ? chartRows : [];
  const setField = (field: keyof FormState, value: string) => setForm(previous => ({ ...previous, [field]: value }));
  const save = () => {
    const numeric = { easting: numberValue(form.easting), northing: numberValue(form.northing), elevation: numberValue(form.elevation), depth: numberValue(form.depth), waterLevel: numberValue(form.waterLevel) };
    if (!form.name.trim() || Object.values(numeric).some(value => !Number.isFinite(value))) return toast.error("Complete all Piezometer fields with valid numbers");
    if (numeric.waterLevel > numeric.depth) return toast.error("Water level depth cannot exceed the installed piezometer depth");
    create.mutate({ name: form.name.trim(), ...numeric });
  };

  return (
    <div className="container py-10">
      <ModuleHeader index="11" title="Piezometer" description="Record piezometer coordinates and groundwater readings, derive piezometric elevation, and export the interpreted line as a 3D DXF polyline." />
      <div className="mt-7 grid gap-6 xl:grid-cols-[390px_1fr]">
        <section id="piezometer-entry-form" className="border border-foreground bg-background p-5">
          <SectionLabel>Add piezometer reading</SectionLabel>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Water level is entered as depth below the piezometer collar. Piezometric elevation is calculated as Elevation − Water level depth.</p>
          <div className="mt-5 grid gap-3">
            {([ ["name", "Piezometer ID", "PZ-01"], ["easting", "Easting (m)", "654321.00"], ["northing", "Northing (m)", "1456789.00"], ["elevation", "Collar elevation (m RL)", "250.00"], ["depth", "Installed depth (m)", "30.00"], ["waterLevel", "Water level depth (m)", "12.50"] ] as const).map(([field, label, placeholder]) => <div key={field}><Label className="swiss-label text-[10px]">{label}</Label><Input className="mt-1 rounded-none border-foreground" type={field === "name" ? "text" : "number"} step={field === "name" ? undefined : "any"} value={form[field]} onChange={event => setField(field, event.target.value)} placeholder={placeholder} /></div>)}
            <Button className="mt-2 rounded-none" onClick={save} disabled={create.isPending}><Plus className="mr-2 h-4 w-4" />{create.isPending ? "Saving..." : "Add reading"}</Button>
          </div>
        </section>
        <section className="border border-foreground bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><SectionLabel>Piezometric line</SectionLabel><p className="mt-2 text-xs text-muted-foreground">Add all piezometers and their water levels first. Then draw one line through the complete dataset in Easting order.</p></div><div className="flex flex-wrap gap-2"><Button className="rounded-none" onClick={() => { setLineDrawn(true); toast.success(`Piezometric line drawn through ${rows.length} piezometers`); }} disabled={rows.length < 2}><LineChart className="mr-2 h-4 w-4" />{lineDrawn ? "Redraw line" : "Draw piezometric line"}</Button><Button variant="outline" className="rounded-none border-foreground" onClick={() => exportPiezometricDxf(chartRows)} disabled={!lineDrawn || rows.length < 2}><Download className="mr-2 h-4 w-4" />Export line DXF</Button></div></div>
          <div className="mt-5 border border-slate-200 bg-slate-50/40 p-2"><ProfileChart rows={plottedRows} /></div>
        </section>
      </div>
      <section className="mt-6 border border-foreground bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground p-4"><div><SectionLabel>Recorded piezometers</SectionLabel><p className="mt-1 text-xs text-muted-foreground">{rows.length} reading{rows.length === 1 ? "" : "s"} · calculated groundwater head · add as many piezometers as required</p></div><div className="flex items-center gap-3"><Button variant="outline" className="rounded-none border-foreground" onClick={() => document.getElementById("piezometer-entry-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Plus className="mr-2 h-4 w-4" />Add another piezometer</Button><Waves className="h-5 w-5 text-primary" /></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="border-b border-foreground bg-muted/40"><tr className="text-left">{["Piezometer", "Easting", "Northing", "Elevation RL", "Depth", "Water level depth", "Piezometric RL", ""].map(label => <th key={label} className="p-3 swiss-label text-[10px]">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map(row => <tr key={row.id}><td className="p-3 font-semibold">{row.name}</td><td className="p-3 font-mono">{formatNumber(row.easting)}</td><td className="p-3 font-mono">{formatNumber(row.northing)}</td><td className="p-3 font-mono">{formatNumber(row.elevation)}</td><td className="p-3 font-mono">{formatNumber(row.depth)}</td><td className="p-3 font-mono">{formatNumber(row.waterLevel)}</td><td className="p-3 font-mono font-bold text-teal-700">{formatNumber(row.piezometricElevation)}</td><td className="p-3 text-right"><Button variant="ghost" size="icon" className="rounded-none text-destructive" onClick={() => remove.mutate({ id: row.id })}><Trash2 className="h-4 w-4" /></Button></td></tr>)}{rows.length === 0 && <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">No piezometer readings recorded yet.</td></tr>}</tbody></table></div>
      </section>
      <p className="mt-4 text-xs text-muted-foreground">Engineering note: the exported DXF is a 3D POLYLINE through the measured piezometric elevations. Use surveyed geometry and additional monitoring points where a true 3D groundwater surface is required.</p>
    </div>
  );
}
