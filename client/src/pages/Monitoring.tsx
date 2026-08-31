import { useEffect, useMemo, useState } from "react";
import { Activity, FileUp, Gauge, Save, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { trpc } from "@/lib/trpc";

const blankForm = {
  wallName: "",
  zone: "",
  status: "Active",
  riskLevel: "Low",
  rmr: "",
  gsi: "",
  qSystem: "",
  wallAssessmentScore: "",
  blastAssessmentScore: "",
  ucs: "",
  cohesion: "",
  frictionAngle: "",
  density: "",
  dominantStructures: "",
  currentFs: "",
  notes: "",
};

type MonitoringForm = typeof blankForm;

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell.trim()); cell = "";
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function parseRadarCsv(text: string) {
  const lines = text.split(/\\r?\\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("CSV must contain a header and at least one reading");
  const headers = parseCsvLine(lines[0]).map(header => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const find = (...names: string[]) => names.map(name => headers.indexOf(name)).find(index => index >= 0) ?? -1;
  const pointIndex = find("radarpointid", "pointid", "point", "id");
  const timeIndex = find("measuredat", "timestamp", "datetime", "date", "time");
  const displacementIndex = find("displacementmm", "displacement", "deformationmm", "deformation");
  const velocityIndex = find("velocitymmperday", "velocity", "velocitymmd", "rate");
  const accelerationIndex = find("accelerationmmperday2", "acceleration", "accelerationrate");
  if (timeIndex < 0 || displacementIndex < 0) throw new Error("CSV needs measuredAt/timestamp and displacementMm columns");
  const parseTime = (value: string) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid radar timestamp: ${value}`);
    return parsed;
  };
  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const displacementMm = Number(cells[displacementIndex]);
    if (!Number.isFinite(displacementMm)) throw new Error(`Invalid displacement on CSV row ${rowIndex + 2}`);
    const optional = (index: number) => index >= 0 && cells[index] ? Number(cells[index]) : undefined;
    return {
      radarPointId: pointIndex >= 0 && cells[pointIndex] ? cells[pointIndex] : "RADAR-POINT-01",
      measuredAt: parseTime(cells[timeIndex]),
      displacementMm,
      velocityMmPerDay: optional(velocityIndex),
      accelerationMmPerDay2: optional(accelerationIndex),
    };
  });
}

function riskClass(risk: string) {
  if (risk === "Critical") return "bg-black text-white";
  if (risk === "High") return "bg-[#d71920] text-white";
  if (risk === "Medium") return "bg-[#f2b134] text-black";
  return "bg-[#dcefdc] text-[#164b2a]";
}

function statusClass(status: string) {
  if (status === "Remediated") return "bg-[#e7e7e7] text-foreground";
  if (status === "Closed") return "bg-black text-white";
  if (status === "Monitored") return "bg-[#e8f0ff] text-[#204b91]";
  return "bg-[#fff1f1] text-[#a30f16]";
}

export default function Monitoring() {
  const [form, setForm] = useState<MonitoringForm>(blankForm);
  const [selectedWallId, setSelectedWallId] = useState<number | null>(null);
  const [selectedPointId, setSelectedPointId] = useState("");
  const records = trpc.monitoring.list.useQuery();
  const radarReadings = trpc.monitoring.radarReadings.useQuery(
    { monitoringRecordId: selectedWallId ?? 0 },
    { enabled: selectedWallId !== null },
  );
  const radarAnalysis = trpc.monitoring.analyzeRadar.useQuery(
    { monitoringRecordId: selectedWallId ?? 0, radarPointId: selectedPointId || undefined },
    { enabled: selectedWallId !== null && Boolean(selectedPointId) && (radarReadings.data?.length ?? 0) > 0 },
  );
  const utils = trpc.useUtils();
  const createRecord = trpc.monitoring.create.useMutation({
    onSuccess: async () => {
      await utils.monitoring.list.invalidate();
      setForm(blankForm);
      toast.success("Monitoring record saved");
    },
    onError: error => toast.error(error.message),
  });
  const deleteRecord = trpc.monitoring.delete.useMutation({
    onSuccess: async () => {
      await utils.monitoring.list.invalidate();
      if (selectedWallId !== null) setSelectedWallId(null);
      toast.success("Monitoring record removed");
    },
    onError: error => toast.error(error.message),
  });
  const importRadar = trpc.monitoring.importRadar.useMutation({
    onSuccess: async result => {
      await utils.monitoring.radarReadings.invalidate();
      toast.success(`${result.count} radar readings imported`);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    const point = radarReadings.data?.[0]?.radarPointId;
    if (point && !radarReadings.data?.some(reading => reading.radarPointId === selectedPointId)) setSelectedPointId(point);
  }, [radarReadings.data, selectedPointId]);

  const summary = useMemo(() => {
    const rows = records.data ?? [];
    const active = rows.filter(row => row.status === "Active" || row.status === "Monitored").length;
    const alerts = rows.filter(row => row.riskLevel === "High" || row.riskLevel === "Critical").length;
    const fsValues = rows.map(row => row.currentFs).filter((value): value is number => value !== null);
    const averageFs = fsValues.length ? fsValues.reduce((sum, value) => sum + value, 0) / fsValues.length : null;
    return { total: rows.length, active, alerts, averageFs };
  }, [records.data]);

  const setField = (field: keyof MonitoringForm, value: string) => {
    setForm(previous => ({ ...previous, [field]: value }));
  };

  const handleRadarFile = async (file?: File) => {
    if (!file || selectedWallId === null) return;
    try {
      const readings = parseRadarCsv(await file.text());
      importRadar.mutate({ monitoringRecordId: selectedWallId, source: file.name, readings });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read radar CSV");
    }
  };

  const submit = () => {
    if (!form.wallName.trim()) {
      toast.error("Wall name is required");
      return;
    }

    createRecord.mutate({
      wallName: form.wallName.trim(),
      zone: form.zone.trim() || undefined,
      status: form.status as "Active" | "Monitored" | "Remediated" | "Closed",
      riskLevel: form.riskLevel as "Low" | "Medium" | "High" | "Critical",
      rmr: optionalNumber(form.rmr),
      gsi: optionalNumber(form.gsi),
      qSystem: optionalNumber(form.qSystem),
      wallAssessmentScore: optionalNumber(form.wallAssessmentScore),
      blastAssessmentScore: optionalNumber(form.blastAssessmentScore),
      ucs: optionalNumber(form.ucs),
      cohesion: optionalNumber(form.cohesion),
      frictionAngle: optionalNumber(form.frictionAngle),
      density: optionalNumber(form.density),
      dominantStructures: form.dominantStructures.trim() || undefined,
      currentFs: optionalNumber(form.currentFs),
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <div className="container py-10">
      <ModuleHeader
        index="09"
        title="Monitoring"
        description="Standalone surveillance register for exposed open-pit walls and slopes. Record the geotechnical baseline, risk level and current monitoring status for each wall."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mt-8 mb-10">
        {[
          { label: "Registered walls", value: summary.total, icon: Activity },
          { label: "Active monitoring", value: summary.active, icon: Gauge },
          { label: "High / critical risk", value: summary.alerts, icon: ShieldAlert },
          { label: "Average current FS", value: summary.averageFs === null ? "—" : summary.averageFs.toFixed(2), icon: Gauge },
        ].map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="border border-foreground p-4 min-h-[96px]">
              <Icon className="h-4 w-4 text-primary mb-4" />
              <div className="text-2xl font-bold leading-none">{item.value}</div>
              <div className="swiss-label text-[10px] mt-2">{item.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-8 items-start">
        <section className="border-t-2 border-foreground pt-4">
          <SectionLabel>Register exposed wall</SectionLabel>
          <div className="grid grid-cols-2 gap-4 mt-5">
            <div className="col-span-2">
              <Label className="swiss-label text-[11px]">Wall / slope name *</Label>
              <Input className="rounded-none border-foreground mt-1" placeholder="Fekola East Wall 90-80 RL" value={form.wallName} onChange={event => setField("wallName", event.target.value)} />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Zone / RL range</Label>
              <Input className="rounded-none border-foreground mt-1" placeholder="East pit · 90–80 RL" value={form.zone} onChange={event => setField("zone", event.target.value)} />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Monitoring status</Label>
              <Select value={form.status} onValueChange={value => setField("status", value)}>
                <SelectTrigger className="rounded-none border-foreground mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Monitored">Monitored</SelectItem>
                  <SelectItem value="Remediated">Remediated</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Risk level</Label>
              <Select value={form.riskLevel} onValueChange={value => setField("riskLevel", value)}>
                <SelectTrigger className="rounded-none border-foreground mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-8">
            <SectionLabel>Rock mass and assessment baseline</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-5">
              {([
                ["rmr", "RMR", "0–100"],
                ["gsi", "GSI", "0–100"],
                ["qSystem", "Q-system", "index"],
                ["wallAssessmentScore", "Wall assessment score", "0–100"],
                ["blastAssessmentScore", "Blast assessment score", "0–100"],
                ["currentFs", "Current FS", "factor"],
                ["ucs", "UCS (MPa)", "MPa"],
                ["cohesion", "Cohesion (kPa)", "kPa"],
                ["frictionAngle", "Friction angle (°)", "degrees"],
                ["density", "Density (t/m³)", "t/m³"],
              ] as [keyof MonitoringForm, string, string][]).map(([field, label, placeholder]) => (
                <div key={field}>
                  <Label className="swiss-label text-[10px]">{label}</Label>
                  <Input type="number" className="rounded-none border-foreground mt-1" placeholder={placeholder} value={form[field]} onChange={event => setField(field, event.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <SectionLabel>Structures and field notes</SectionLabel>
            <div className="mt-5 space-y-4">
              <div>
                <Label className="swiss-label text-[11px]">Dominant structures</Label>
                <Textarea className="rounded-none border-foreground mt-1" rows={3} placeholder="Joints, faults, dip / dip direction, infill and roughness..." value={form.dominantStructures} onChange={event => setField("dominantStructures", event.target.value)} />
              </div>
              <div>
                <Label className="swiss-label text-[11px]">Monitoring notes / action required</Label>
                <Textarea className="rounded-none border-foreground mt-1" rows={3} placeholder="Prism trend, radar observations, drainage, berm condition, follow-up action..." value={form.notes} onChange={event => setField("notes", event.target.value)} />
              </div>
            </div>
          </div>

          <Button className="w-full rounded-none mt-6 font-bold uppercase tracking-wider" disabled={createRecord.isPending} onClick={submit}>
            <Save className="h-4 w-4 mr-2" /> {createRecord.isPending ? "Saving..." : "Save monitoring record"}
          </Button>
        </section>

        <section className="border-t-2 border-foreground pt-4 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <SectionLabel>Wall monitoring register</SectionLabel>
            <span className="font-mono text-xs text-muted-foreground">{summary.total} RECORDS</span>
          </div>
          <div className="border border-foreground mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-foreground bg-muted/40">
                <tr className="text-left">
                  <th className="p-3 swiss-label text-[10px]">Wall / zone</th>
                  <th className="p-3 swiss-label text-[10px]">Risk</th>
                  <th className="p-3 swiss-label text-[10px]">Status</th>
                  <th className="p-3 swiss-label text-[10px]">FS</th>
                  <th className="p-3 swiss-label text-[10px]">RMR / GSI</th>
                  <th className="p-3 swiss-label text-[10px]">Recorded</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(records.data ?? []).map(record => (
                  <tr key={record.id} className="align-top">
                    <td className="p-3">
                      <div className="font-bold">{record.wallName}</div>
                      <div className="text-xs text-muted-foreground mt-1">{record.zone || "Zone not specified"}</div>
                    </td>
                    <td className="p-3"><span className={`inline-flex px-2 py-1 text-[10px] font-bold uppercase ${riskClass(record.riskLevel)}`}>{record.riskLevel}</span></td>
                    <td className="p-3"><span className={`inline-flex px-2 py-1 text-[10px] font-bold uppercase ${statusClass(record.status)}`}>{record.status}</span></td>
                    <td className="p-3 font-mono">{record.currentFs === null ? "—" : record.currentFs.toFixed(2)}</td>
                    <td className="p-3 font-mono text-xs">{record.rmr ?? "—"} / {record.gsi ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(record.createdAt).toLocaleDateString()}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" className="rounded-none text-destructive" aria-label={`Delete ${record.wallName}`} onClick={() => deleteRecord.mutate({ id: record.id })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {(records.data ?? []).length === 0 && (
                  <tr><td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">No wall records yet. Add the first exposed wall on the left.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="border border-foreground p-4">
              <div className="swiss-label text-[10px] mb-3">Monitoring scope</div>
              <p className="text-sm text-muted-foreground">This section is independent from the Database archive. Use it as the active register for exposed walls and slopes under surveillance.</p>
            </div>
            <div className="border border-foreground p-4">
              <div className="swiss-label text-[10px] mb-3">Risk convention</div>
              <p className="text-sm text-muted-foreground">Critical and High records are highlighted for review. Confirm thresholds and response actions against your site ground control management plan.</p>
            </div>
          </div>

          <section className="border-t-2 border-foreground pt-4 mt-10">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <SectionLabel>Radar monitoring and trend warning</SectionLabel>
              <label className={`inline-flex items-center gap-2 border border-foreground px-3 py-2 text-xs font-bold uppercase cursor-pointer ${selectedWallId === null ? "opacity-40 pointer-events-none" : ""}`}>
                <FileUp className="h-4 w-4" /> Import radar CSV
                <input type="file" accept=".csv,text/csv" className="hidden" disabled={selectedWallId === null || importRadar.isPending} onChange={event => { void handleRadarFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 mt-5 items-end">
              <div>
                <Label className="swiss-label text-[11px]">Select wall</Label>
                <Select value={selectedWallId ? String(selectedWallId) : ""} onValueChange={value => { setSelectedWallId(Number(value)); setSelectedPointId(""); }}>
                  <SelectTrigger className="rounded-none border-foreground mt-1"><SelectValue placeholder="Choose a registered wall" /></SelectTrigger>
                  <SelectContent>{(records.data ?? []).map(record => <SelectItem key={record.id} value={String(record.id)}>{record.wallName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="swiss-label text-[11px]">Radar point</Label>
                <Select value={selectedPointId} onValueChange={setSelectedPointId} disabled={!selectedWallId || !radarReadings.data?.length}>
                  <SelectTrigger className="rounded-none border-foreground mt-1"><SelectValue placeholder="Import readings first" /></SelectTrigger>
                  <SelectContent>{Array.from(new Set((radarReadings.data ?? []).map(reading => reading.radarPointId))).map(point => <SelectItem key={point} value={point}>{point}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground pb-2">CSV: radarPointId, measuredAt, displacementMm, velocityMmPerDay, accelerationMmPerDay2</div>
            </div>

            {radarAnalysis.data && (
              <div className="mt-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    ["Risk indication", radarAnalysis.data.risk],
                    ["Samples", radarAnalysis.data.sampleCount],
                    ["Displacement change", `${radarAnalysis.data.displacementChangeMm} mm`],
                    ["Latest velocity", radarAnalysis.data.latestVelocityMmPerDay === null ? "—" : `${radarAnalysis.data.latestVelocityMmPerDay} mm/day`],
                    ["Latest acceleration", radarAnalysis.data.latestAccelerationMmPerDay2 === null ? "—" : `${radarAnalysis.data.latestAccelerationMmPerDay2} mm/day²`],
                  ].map(([label, value]) => <div key={String(label)} className="border border-foreground p-3"><div className="swiss-label text-[10px] mb-2">{label}</div><div className={`font-bold ${label === "Risk indication" ? riskClass(String(value)) + " inline-flex px-2 py-1" : ""}`}>{value}</div></div>)}
                </div>
                <div className="border-l-4 border-primary bg-muted/30 p-4 mt-4 text-sm"><strong>{radarAnalysis.data.alert}</strong><div className="text-xs text-muted-foreground mt-2">Trend warning only — verify radar quality, prisms, visual inspections and the site Trigger Action Response Plan before taking operational action.</div></div>
                <div className="border border-foreground mt-5 p-4">
                  <div className="swiss-label text-[10px] mb-3">Displacement trend — {radarAnalysis.data.pointId}</div>
                  <div className="h-[220px] w-full overflow-hidden">
                    <svg viewBox="0 0 760 220" className="w-full h-full" role="img" aria-label="Radar displacement trend">
                      <line x1="40" y1="190" x2="740" y2="190" stroke="currentColor" strokeWidth="1" />
                      <line x1="40" y1="20" x2="40" y2="190" stroke="currentColor" strokeWidth="1" />
                      {(() => {
                        const points = radarAnalysis.data.points;
                        const minTime = points[0]?.measuredAt ?? 0;
                        const maxTime = points[points.length - 1]?.measuredAt ?? minTime + 1;
                        const values = points.map(point => point.displacementMm);
                        const minValue = Math.min(...values);
                        const maxValue = Math.max(...values, minValue + 1);
                        const coords = points.map(point => `${40 + ((point.measuredAt - minTime) / Math.max(1, maxTime - minTime)) * 700},${190 - ((point.displacementMm - minValue) / Math.max(1, maxValue - minValue)) * 165}`).join(" ");
                        return <><polyline points={coords} fill="none" stroke="#d71920" strokeWidth="3" />{points.map((point, index) => <circle key={`${point.measuredAt}-${index}`} cx={40 + ((point.measuredAt - minTime) / Math.max(1, maxTime - minTime)) * 700} cy={190 - ((point.displacementMm - minValue) / Math.max(1, maxValue - minValue)) * 165} r="4" fill="#d71920" />)}</>;
                      })()}
                    </svg>
                  </div>
                </div>
              </div>
            )}
            {radarReadings.data && radarReadings.data.length > 0 && (
              <div className="border border-foreground mt-5 overflow-x-auto">
                <div className="p-4 border-b border-foreground"><div className="swiss-label text-[10px]">Imported radar measurements</div><div className="text-xs text-muted-foreground mt-1">{radarReadings.data.filter(reading => !selectedPointId || reading.radarPointId === selectedPointId).length} readings shown for the selected point.</div></div>
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="border-b border-foreground bg-muted/40"><tr className="text-left"><th className="p-3 swiss-label text-[10px]">Point</th><th className="p-3 swiss-label text-[10px]">Measured UTC</th><th className="p-3 swiss-label text-[10px]">Displacement (mm)</th><th className="p-3 swiss-label text-[10px]">Velocity (mm/day)</th><th className="p-3 swiss-label text-[10px]">Acceleration (mm/day²)</th><th className="p-3 swiss-label text-[10px]">Source</th></tr></thead>
                  <tbody className="divide-y divide-border">{radarReadings.data.filter(reading => !selectedPointId || reading.radarPointId === selectedPointId).map(reading => <tr key={reading.id}><td className="p-3 font-mono">{reading.radarPointId}</td><td className="p-3 text-xs whitespace-nowrap">{new Date(reading.measuredAt).toLocaleString()}</td><td className="p-3 font-mono">{reading.displacementMm.toFixed(2)}</td><td className="p-3 font-mono">{reading.velocityMmPerDay === null ? "—" : reading.velocityMmPerDay.toFixed(3)}</td><td className="p-3 font-mono">{reading.accelerationMmPerDay2 === null ? "—" : reading.accelerationMmPerDay2.toFixed(3)}</td><td className="p-3 text-xs text-muted-foreground">{reading.source || "—"}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {selectedWallId !== null && !radarReadings.data?.length && <p className="text-sm text-muted-foreground mt-5">No radar readings for this wall. Import a CSV to activate the trend analysis.</p>}
          </section>
        </section>
      </div>
    </div>
  );
}
