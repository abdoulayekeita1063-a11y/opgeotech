import { useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, Expand, FileDown, Gauge, MapPinned } from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionLabel } from "@/components/ModuleHeader";
import { classifyMonitoringRisk, classifyMonitoringRiskFromVelocities, validateMonitoringThresholds } from "@/lib/monitoringRisk";
import { trpc } from "@/lib/trpc";

type SummaryRow = {
  id: number;
  measuredAt: number;
  pit: string;
  window: string;
  displacementMaxMm: number | null;
  displacementMinMm: number | null;
  displacementAverageMm: number | null;
  velocityMaxMmPerDay: number | null;
  velocityMinMmPerDay: number | null;
  velocityAverageMmPerDay: number | null;
  observations: string | null;
};

type InversePoint = {
  measuredAt: number;
  dateLabel: string;
  inverseVelocity: number | null;
  fittedInverseVelocity: number | null;
  velocity: number | null;
  displacement: number | null;
  timeDays: number;
};

const COLORS = ["#111111", "#d71920", "#dcae1d", "#6b7280"];
const DAY = 86_400_000;

function average(values: Array<number | null | undefined>) {
  const finite = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function standardDeviation(values: number[]) {
  if (!values.length) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function riskTone(risk: string) {
  if (risk === "Critical") return "bg-black text-white";
  if (risk === "High") return "bg-[#d71920] text-white";
  if (risk === "Moderate") return "bg-[#dcae1d] text-black";
  if (risk === "Low") return "bg-[#dcefdc] text-[#164b2a]";
  return "bg-muted text-muted-foreground";
}

function inverseVelocityModel(rows: SummaryRow[]) {
  const ordered = [...rows].sort((a, b) => a.measuredAt - b.measuredAt);
  if (!ordered.length) return { points: [] as InversePoint[], forecastAt: null as number | null, rSquared: null as number | null, status: "Insufficient data" };
  const first = ordered[0].measuredAt;
  const base = ordered.map(row => {
    const velocity = row.velocityAverageMmPerDay ?? row.velocityMaxMmPerDay;
    return {
      measuredAt: row.measuredAt,
      dateLabel: new Date(row.measuredAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
      inverseVelocity: velocity === null || Math.abs(velocity) < 1e-9 ? null : 1 / Math.abs(velocity),
      fittedInverseVelocity: null,
      velocity: velocity === null ? null : Math.abs(velocity),
      displacement: row.displacementAverageMm ?? row.displacementMaxMm,
      timeDays: (row.measuredAt - first) / DAY,
    } satisfies InversePoint;
  });
  const fit = base.filter(point => point.inverseVelocity !== null);
  if (fit.length < 3) return { points: base, forecastAt: null, rSquared: null, status: "Insufficient data" };
  const n = fit.length;
  const sumX = fit.reduce((sum, point) => sum + point.timeDays, 0);
  const sumY = fit.reduce((sum, point) => sum + (point.inverseVelocity as number), 0);
  const sumXX = fit.reduce((sum, point) => sum + point.timeDays ** 2, 0);
  const sumXY = fit.reduce((sum, point) => sum + point.timeDays * (point.inverseVelocity as number), 0);
  const denominator = n * sumXX - sumX ** 2;
  if (denominator <= 0) return { points: base, forecastAt: null, rSquared: null, status: "No reliable forecast" };
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const total = fit.reduce((sum, point) => sum + ((point.inverseVelocity as number) - meanY) ** 2, 0);
  const residual = fit.reduce((sum, point) => sum + ((point.inverseVelocity as number) - (intercept + slope * point.timeDays)) ** 2, 0);
  const rSquared = total === 0 ? 1 : Math.max(0, 1 - residual / total);
  const forecastTime = slope < 0 ? -intercept / slope : null;
  const lastTime = base[base.length - 1].timeDays;
  const reliable = forecastTime !== null && forecastTime > lastTime && rSquared >= 0.5;
  const points = base.map(point => ({ ...point, fittedInverseVelocity: Math.max(0, intercept + slope * point.timeDays) }));
  if (reliable && forecastTime !== null) points.push({ measuredAt: first + forecastTime * DAY, dateLabel: new Date(first + forecastTime * DAY).toLocaleDateString(undefined, { day: "2-digit", month: "short" }), inverseVelocity: null, fittedInverseVelocity: 0, velocity: null, displacement: null, timeDays: forecastTime });
  return {
    points,
    forecastAt: reliable && forecastTime !== null ? first + forecastTime * DAY : null,
    rSquared,
    status: reliable ? "Forecast available" : "No reliable forecast",
  };
}

function PowerTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="border border-foreground bg-background p-4 shadow-lg text-sm"><div className="font-bold uppercase mb-2">{label}</div>{payload.map((item, index) => <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-6 py-1"><span style={{ color: item.color }}>{item.name}</span><span className="font-mono">{typeof item.value === "number" ? item.value.toFixed(3) : "—"}</span></div>)}</div>;
}

export function MonitoringPowerBIReport({ projectId }: { projectId: number | null }) {
  const [pit, setPit] = useState("all");
  const [windowName, setWindowName] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [thresholds, setThresholds] = useState({ moderate: 1, high: 5, critical: 10 });
  const thresholdError = validateMonitoringThresholds(thresholds);
  const projects = trpc.monitoring.projects.useQuery();
  const rowsQuery = trpc.monitoring.projectSummaryRows.useQuery({ projectId: projectId ?? 0 }, { enabled: projectId !== null });
  const selectedProject = (projects.data ?? []).find(project => project.id === projectId);
  const allRows = (rowsQuery.data ?? []) as SummaryRow[];
  const pits = Array.from(new Set(allRows.map(row => row.pit))).sort();
  const windows = Array.from(new Set(allRows.filter(row => pit === "all" || row.pit === pit).map(row => row.window))).sort();
  const filteredRows = useMemo(() => allRows.filter(row => {
    if (pit !== "all" && row.pit !== pit) return false;
    if (windowName !== "all" && row.window !== windowName) return false;
    if (fromDate && row.measuredAt < new Date(`${fromDate}T00:00:00`).getTime()) return false;
    if (toDate && row.measuredAt > new Date(`${toDate}T23:59:59`).getTime()) return false;
    return true;
  }), [allRows, pit, windowName, fromDate, toDate]);

  const report = useMemo(() => {
    const ordered = [...filteredRows].sort((a, b) => a.measuredAt - b.measuredAt);
    const displacementValues = ordered.flatMap(row => [row.displacementMaxMm, row.displacementMinMm, row.displacementAverageMm]).filter((value): value is number => value !== null);
    const signedVelocityValues = ordered.flatMap(row => [row.velocityMaxMmPerDay, row.velocityMinMmPerDay, row.velocityAverageMmPerDay]).filter((value): value is number => value !== null);
    const velocityValues = signedVelocityValues.map(Math.abs);
    const stableRows = ordered.filter(row => !row.observations || /^(NF|no fall|stable)$/i.test(row.observations.trim()));
    const maxDisplacement = displacementValues.length ? Math.max(...displacementValues.map(Math.abs)) : null;
    const riskResult = classifyMonitoringRiskFromVelocities(velocityValues, thresholds);
    const maxVelocity = velocityValues.length ? riskResult.maxVelocity : null;
    const riskVelocity = riskResult.maxVelocity;
    const risk = thresholdError ? "Invalid thresholds" : riskResult.risk;
    const monthlyMap = new Map<string, { label: string; displacementMax: number[]; displacementAverage: number[]; velocityMax: number[]; velocityAverage: number[] }>();
    const dailyMap = new Map<number, SummaryRow[]>();
    const windowMap = new Map<string, SummaryRow[]>();
    ordered.forEach(row => {
      const date = new Date(row.measuredAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const month = monthlyMap.get(key) ?? { label: date.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), displacementMax: [], displacementAverage: [], velocityMax: [], velocityAverage: [] };
      if (row.displacementMaxMm !== null) month.displacementMax.push(Math.abs(row.displacementMaxMm));
      if (row.displacementAverageMm !== null) month.displacementAverage.push(Math.abs(row.displacementAverageMm));
      if (row.velocityMaxMmPerDay !== null) month.velocityMax.push(Math.abs(row.velocityMaxMmPerDay));
      if (row.velocityAverageMmPerDay !== null) month.velocityAverage.push(Math.abs(row.velocityAverageMmPerDay));
      monthlyMap.set(key, month);
      const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      dailyMap.set(day, [...(dailyMap.get(day) ?? []), row]);
      const windowKey = `${row.pit} · ${row.window}`;
      windowMap.set(windowKey, [...(windowMap.get(windowKey) ?? []), row]);
    });
    const monthly = Array.from(monthlyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, month]) => ({
      month: month.label,
      maxDisplacement: month.displacementMax.length ? Math.max(...month.displacementMax) : 0,
      avgDisplacement: average(month.displacementAverage) ?? 0,
      maxVelocity: month.velocityMax.length ? Math.max(...month.velocityMax) : 0,
      avgVelocity: average(month.velocityAverage) ?? 0,
    }));
    const daily = Array.from(dailyMap.entries()).sort(([a], [b]) => a - b).map(([date, dayRows]) => ({
      date,
      label: new Date(date).toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
      displacement: average(dayRows.map(row => row.displacementAverageMm ?? row.displacementMaxMm)) ?? 0,
      velocity: average(dayRows.map(row => row.velocityAverageMmPerDay ?? row.velocityMaxMmPerDay).map(value => value === null ? null : Math.abs(value))) ?? 0,
    }));
    const windowComparison = Array.from(windowMap.entries()).map(([name, windowRows]) => {
      const displacement = windowRows.map(row => row.displacementMaxMm ?? row.displacementAverageMm ?? 0).map(Math.abs);
      const velocity = windowRows.map(row => row.velocityMaxMmPerDay ?? row.velocityAverageMmPerDay ?? 0).map(Math.abs);
      const peakVelocity = velocity.length ? Math.max(...velocity) : 0;
      return { name, displacement: displacement.length ? Math.max(...displacement) : 0, velocity: peakVelocity, risk: thresholdError ? "Invalid thresholds" : classifyMonitoringRisk(peakVelocity, thresholds), records: windowRows.length };
    }).sort((a, b) => b.velocity - a.velocity);
    const observationMap = new Map<string, number>();
    ordered.forEach(row => {
      const raw = row.observations?.trim() || "NF";
      const label = /^(NF|no fall|stable)$/i.test(raw) ? "No Fall / Stable" : raw;
      observationMap.set(label, (observationMap.get(label) ?? 0) + 1);
    });
    const observations = Array.from(observationMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const inverse = inverseVelocityModel(ordered);
    const peakWindow = windowComparison[0] ?? null;
    const peakMonth = monthly.length ? [...monthly].sort((a, b) => b.maxDisplacement - a.maxDisplacement)[0] : null;
    const peakDisplacementRow = [...ordered].sort((a, b) => Math.abs(b.displacementMaxMm ?? b.displacementAverageMm ?? 0) - Math.abs(a.displacementMaxMm ?? a.displacementAverageMm ?? 0))[0] ?? null;
    const peakVelocityRow = [...ordered].sort((a, b) => Math.abs(b.velocityMaxMmPerDay ?? b.velocityAverageMmPerDay ?? 0) - Math.abs(a.velocityMaxMmPerDay ?? a.velocityAverageMmPerDay ?? 0))[0] ?? null;
    const completeRows = ordered.filter(row => (row.displacementAverageMm ?? row.displacementMaxMm) !== null && (row.velocityAverageMmPerDay ?? row.velocityMaxMmPerDay) !== null).length;
    return {
      ordered,
      maxDisplacement,
      maxVelocity,
      averageDisplacement: average(ordered.map(row => row.displacementAverageMm)),
      averageVelocity: average(ordered.map(row => row.velocityAverageMmPerDay).map(value => value === null ? null : Math.abs(value))),
      displacementStdDev: standardDeviation(displacementValues),
      velocityStdDev: standardDeviation(velocityValues),
      minDisplacement: displacementValues.length ? Math.min(...displacementValues) : null,
      minVelocity: signedVelocityValues.length ? Math.min(...signedVelocityValues) : null,
      riskVelocity,
      dataCompleteness: ordered.length ? completeRows / ordered.length * 100 : null,
      incidentCount: ordered.length - stableRows.length,
      peakDisplacementLocation: peakDisplacementRow ? `${peakDisplacementRow.pit} · ${peakDisplacementRow.window}` : "—",
      peakVelocityLocation: peakVelocityRow ? `${peakVelocityRow.pit} · ${peakVelocityRow.window}` : "—",
      stablePercent: ordered.length ? stableRows.length / ordered.length * 100 : null,
      risk,
      monthly,
      daily,
      windowComparison,
      observations,
      inverse,
      peakWindow,
      peakMonth,
    };
  }, [filteredRows, thresholds, thresholdError]);

  if (projectId === null) return <div className="border border-foreground p-10 text-sm text-muted-foreground">Select or add a project in the Data tab to build the Monitoring Report.</div>;
  if (!filteredRows.length) return <div className="border border-foreground p-10 text-sm text-muted-foreground">No radar monitoring rows match the current filters. Import an Excel workbook or adjust the report scope.</div>;

  const firstDate = report.ordered[0]?.measuredAt;
  const lastDate = report.ordered.at(-1)?.measuredAt;
  const printReport = () => window.print();
  const presentReport = async () => {
    const reportElement = document.getElementById("monitoring-powerbi-report");
    if (reportElement?.requestFullscreen) await reportElement.requestFullscreen();
  };

  return <section id="monitoring-powerbi-report" className="monitoring-report-readable bg-background text-foreground p-1 print:p-0">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-foreground pb-5">
      <div><div className="swiss-label text-primary">Power BI-style presentation</div><h2 className="text-4xl md:text-5xl font-extrabold uppercase mt-2">Radar Monitoring Analysis</h2><p className="text-base text-muted-foreground mt-2">{selectedProject?.name ?? "Selected project"}{selectedProject?.site ? ` · ${selectedProject.site}` : ""} · interactive operational summary</p></div>
      <div className="flex gap-2 print:hidden"><Button variant="outline" className="rounded-none" onClick={presentReport}><Expand className="h-4 w-4 mr-2" /> Present</Button><Button className="rounded-none" onClick={printReport}><FileDown className="h-4 w-4 mr-2" /> Print / Save PDF</Button></div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3 mt-6 print:hidden">
      <div><Label className="swiss-label text-[10px]">Pit</Label><Select value={pit} onValueChange={value => { setPit(value); setWindowName("all"); }}><SelectTrigger className="rounded-none border-foreground mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All pits</SelectItem>{pits.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div><Label className="swiss-label text-[10px]">Window</Label><Select value={windowName} onValueChange={setWindowName}><SelectTrigger className="rounded-none border-foreground mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All windows</SelectItem>{windows.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div><Label className="swiss-label text-[10px]">From</Label><Input type="date" className="rounded-none border-foreground mt-1" value={fromDate} onChange={event => setFromDate(event.target.value)} /></div>
      <div><Label className="swiss-label text-[10px]">To</Label><Input type="date" className="rounded-none border-foreground mt-1" value={toDate} onChange={event => setToDate(event.target.value)} /></div>
      <div><Label className="swiss-label text-[10px]">Moderate velocity</Label><Input type="number" min="0" step="0.001" className="rounded-none border-foreground mt-1" value={thresholds.moderate} onChange={event => setThresholds(previous => ({ ...previous, moderate: Math.max(0, Number(event.target.value) || 0) }))} /></div>
      <div><Label className="swiss-label text-[10px]">High velocity</Label><Input type="number" min="0" step="0.001" className="rounded-none border-foreground mt-1" value={thresholds.high} onChange={event => setThresholds(previous => ({ ...previous, high: Math.max(0, Number(event.target.value) || 0) }))} /></div>
      <div><Label className="swiss-label text-[10px]">Critical velocity</Label><Input type="number" min="0" step="0.001" className="rounded-none border-foreground mt-1" value={thresholds.critical} onChange={event => setThresholds(previous => ({ ...previous, critical: Math.max(0, Number(event.target.value) || 0) }))} /></div>
    </div>
    {thresholdError && <div role="alert" className="border border-[#d71920] bg-[#fff1f1] px-4 py-3 mt-3 text-sm font-bold text-[#9f1016] print:hidden">{thresholdError} Risk classification is paused until the values are corrected.</div>}

    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-7">
      {[
        ["Max displacement", report.maxDisplacement === null ? "—" : `${report.maxDisplacement.toFixed(2)} mm`],
        ["Max velocity", report.maxVelocity === null ? "—" : `${report.maxVelocity.toFixed(3)} mm/day`],
        ["Stability rating", report.stablePercent === null ? "—" : `${report.stablePercent.toFixed(1)}%`],
        ["Records", report.ordered.length.toLocaleString()],
        ["Current risk", thresholdError ? "Paused" : report.risk],
      ].map(([label, value], index) => <div key={String(label)} className={`border border-foreground p-5 min-h-32 ${index === 4 ? riskTone(String(value)) : index < 3 ? "bg-black text-white" : ""}`}><div className={`swiss-label ${index < 3 ? "text-white/60" : ""}`}>{label}</div><div className={`text-3xl font-extrabold mt-5 ${index < 3 ? "text-[#f04b42]" : ""}`}>{value}</div></div>)}
    </div>
    <div className="border border-foreground border-t-0 px-5 py-4 text-sm leading-relaxed">{thresholdError ? <><strong>Independent Monitoring Risk:</strong> classification paused until the threshold order is valid.</> : <><strong>Independent Monitoring Risk:</strong> maximum filtered velocity {report.riskVelocity.toFixed(3)} mm/day compared with Moderate ≥ {thresholds.moderate}, High ≥ {thresholds.high}, and Critical ≥ {thresholds.critical} mm/day. Wall Risk Classification data is not used.</>}</div>

    <div className="border border-foreground mt-5"><div className="bg-black text-white px-5 py-3"><div className="swiss-label text-[10px] text-white">Comprehensive monitoring metrics summary</div></div><div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border"><div className="p-5"><div className="font-bold text-sm uppercase mb-4">Overall statistics</div><dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm"><dt>Total records</dt><dd className="font-mono">{report.ordered.length}</dd><dt>Monitoring period</dt><dd className="text-right">{firstDate ? new Date(firstDate).toLocaleDateString() : "—"} – {lastDate ? new Date(lastDate).toLocaleDateString() : "—"}</dd><dt>Pit locations</dt><dd className="font-mono">{new Set(report.ordered.map(row => row.pit)).size}</dd><dt>Monitoring windows</dt><dd className="font-mono">{new Set(report.ordered.map(row => `${row.pit}-${row.window}`)).size}</dd><dt>Data completeness</dt><dd className="font-mono text-primary">{report.dataCompleteness === null ? "—" : `${report.dataCompleteness.toFixed(1)}%`}</dd><dt>Incident observations</dt><dd className="font-mono">{report.incidentCount}</dd></dl></div><div className="p-5"><div className="font-bold text-sm uppercase mb-4">Displacement (mm)</div><dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm"><dt>Maximum</dt><dd className="font-mono text-primary">{report.maxDisplacement?.toFixed(2) ?? "—"}</dd><dt>Minimum</dt><dd className="font-mono">{report.minDisplacement?.toFixed(2) ?? "—"}</dd><dt>Average</dt><dd className="font-mono">{report.averageDisplacement?.toFixed(2) ?? "—"}</dd><dt>Std deviation</dt><dd className="font-mono">{report.displacementStdDev?.toFixed(2) ?? "—"}</dd><dt>Peak location</dt><dd className="text-right">{report.peakDisplacementLocation}</dd></dl></div><div className="p-5"><div className="font-bold text-sm uppercase mb-4">Velocity (mm/day)</div><dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm"><dt>Maximum</dt><dd className="font-mono text-primary">{report.maxVelocity?.toFixed(3) ?? "—"}</dd><dt>Minimum</dt><dd className="font-mono">{report.minVelocity?.toFixed(3) ?? "—"}</dd><dt>Average</dt><dd className="font-mono">{report.averageVelocity?.toFixed(3) ?? "—"}</dd><dt>Std deviation</dt><dd className="font-mono">{report.velocityStdDev?.toFixed(3) ?? "—"}</dd><dt>Peak location</dt><dd className="text-right">{report.peakVelocityLocation}</dd></dl></div></div></div>

    <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-5 mt-5">
      <div className="border border-foreground bg-[#111] text-white p-7"><Gauge className="h-6 w-6 text-[#f04b42]" /><div className="swiss-label text-white/60 mt-5">Executive summary</div><p className="text-lg leading-relaxed mt-4">From {firstDate ? new Date(firstDate).toLocaleDateString() : "—"} to {lastDate ? new Date(lastDate).toLocaleDateString() : "—"}, {report.ordered.length} radar summary records were assessed across {new Set(report.ordered.map(row => row.pit)).size} pit location(s) and {new Set(report.ordered.map(row => row.window)).size} monitoring window(s). {thresholdError ? "Risk classification is paused until Moderate, High and Critical thresholds are in ascending order." : <>The maximum-velocity risk is <strong className="text-[#f04b42]">{report.risk}</strong>. </>} {report.peakWindow ? `${report.peakWindow.name} is the leading hotspot with a peak velocity of ${report.peakWindow.velocity.toFixed(3)} mm/day.` : "No hotspot is available."}</p></div>
      <div className="border border-foreground p-5"><SectionLabel>Observation distribution</SectionLabel><div className="h-64 mt-3"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={report.observations} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={54} outerRadius={88} paddingAngle={2}>{report.observations.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip content={<PowerTooltip />} /><Legend verticalAlign="bottom" height={30} /></PieChart></ResponsiveContainer></div></div>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-5">
      <div className="border border-foreground p-5"><SectionLabel>Monitoring trend</SectionLabel><p className="text-xs text-muted-foreground mt-2">Average displacement and velocity by monitoring date.</p><div className="h-72 mt-4"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={report.daily}><CartesianGrid strokeDasharray="3 3" stroke="#ddd" /><XAxis dataKey="label" minTickGap={28} tick={{ fontSize: 10 }} /><YAxis yAxisId="left" tick={{ fontSize: 10 }} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} /><Tooltip content={<PowerTooltip />} /><Legend /><Area yAxisId="left" type="monotone" dataKey="displacement" name="Displacement (mm)" stroke="#111" fill="#111" fillOpacity={0.12} /><Line yAxisId="right" type="monotone" dataKey="velocity" name="Velocity (mm/day)" stroke="#d71920" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div></div>
      <div className="border border-foreground p-5"><SectionLabel>Monthly trend analysis</SectionLabel><p className="text-xs text-muted-foreground mt-2">Monthly maximum displacement and maximum velocity.</p><div className="h-72 mt-4"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={report.monthly}><CartesianGrid strokeDasharray="3 3" stroke="#ddd" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis yAxisId="left" tick={{ fontSize: 10 }} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} /><Tooltip content={<PowerTooltip />} /><Legend /><Bar yAxisId="left" dataKey="maxDisplacement" name="Max displacement (mm)" fill="#f04b42" /><Line yAxisId="right" type="monotone" dataKey="maxVelocity" name="Max velocity (mm/day)" stroke="#111" strokeWidth={2} /></ComposedChart></ResponsiveContainer></div></div>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5 mt-5">
      <div className="border border-foreground p-5"><SectionLabel>Pit / window comparison</SectionLabel><div className="h-80 mt-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.windowComparison.slice(0, 10)} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" stroke="#ddd" /><XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} /><Tooltip content={<PowerTooltip />} /><Legend /><Bar dataKey="displacement" name="Peak displacement (mm)" fill="#111" /><Bar dataKey="velocity" name="Peak velocity (mm/day)" fill="#d71920" /></BarChart></ResponsiveContainer></div></div>
      <div className="border border-foreground p-5"><SectionLabel>Window risk ranking</SectionLabel>{thresholdError ? <div className="bg-muted p-4 mt-4 text-sm text-muted-foreground">Thresholds invalid — window risk classification is paused.</div> : <div className="space-y-3 mt-4">{report.windowComparison.slice(0, 6).map((item, index) => <div key={item.name} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-border pb-3"><div className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</div><div><div className="font-bold text-sm">{item.name}</div><div className="text-xs text-muted-foreground mt-1">{item.records} records · {item.displacement.toFixed(2)} mm peak displacement</div></div><div className={`px-2 py-1 text-[10px] font-bold uppercase ${riskTone(item.risk)}`}>{item.risk}</div></div>)}</div>}</div>
    </div>

    <div className="border border-foreground p-5 mt-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><SectionLabel>Inverse Velocity analysis</SectionLabel><p className="text-xs text-muted-foreground mt-2">Observed 1 / |velocity| and fitted linear trend for the selected monitoring scope.</p></div><div className={`px-3 py-2 text-xs font-bold uppercase ${report.inverse.status === "Forecast available" ? "bg-[#d71920] text-white" : "bg-muted"}`}>{report.inverse.status}</div></div><div className="h-80 mt-4"><ResponsiveContainer width="100%" height="100%"><LineChart data={report.inverse.points}><CartesianGrid strokeDasharray="3 3" stroke="#ddd" /><XAxis dataKey="dateLabel" minTickGap={30} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} label={{ value: "Inverse velocity (day/mm)", angle: -90, position: "insideLeft", fontSize: 10 }} /><Tooltip content={<PowerTooltip />} /><Line type="monotone" dataKey="inverseVelocity" name="Observed inverse velocity" stroke="#111" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} /><Line type="linear" dataKey="fittedInverseVelocity" name="Fitted trend" stroke="#d71920" strokeWidth={2} dot={false} connectNulls />{report.inverse.forecastAt && <ReferenceLine x={new Date(report.inverse.forecastAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" })} stroke="#d71920" strokeDasharray="5 5" label={{ value: "Estimated failure", fill: "#d71920", fontSize: 10 }} />}</LineChart></ResponsiveContainer></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4"><div className="bg-muted/40 p-4"><div className="swiss-label text-[10px]">Forecast date</div><div className="font-bold mt-2">{report.inverse.forecastAt ? new Date(report.inverse.forecastAt).toLocaleString() : "No reliable date"}</div></div><div className="bg-muted/40 p-4"><div className="swiss-label text-[10px]">R²</div><div className="font-mono mt-2">{report.inverse.rSquared === null ? "—" : report.inverse.rSquared.toFixed(2)}</div></div><div className="bg-muted/40 p-4"><div className="swiss-label text-[10px]">Engineering use</div><div className="text-xs mt-2">Trend warning only; verify against the site TARP.</div></div></div></div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
      <div className="border border-foreground p-5"><CalendarRange className="h-5 w-5 text-primary" /><div className="swiss-label text-[10px] mt-4">Monthly interpretation</div><p className="text-sm leading-relaxed mt-3">{report.peakMonth ? `${report.peakMonth.month} recorded the highest monthly displacement at ${report.peakMonth.maxDisplacement.toFixed(2)} mm. Review seasonal, drainage and operational conditions for that period.` : "Monthly interpretation is unavailable."}</p></div>
      <div className="border border-foreground p-5"><MapPinned className="h-5 w-5 text-primary" /><div className="swiss-label text-[10px] mt-4">Primary hotspot</div><p className="text-sm leading-relaxed mt-3">{report.peakWindow ? `${report.peakWindow.name} ranks first by peak velocity. Prioritize data-quality checks, field inspection and comparison with site trigger levels.` : "No hotspot was identified."}</p></div>
      <div className="border border-foreground p-5"><AlertTriangle className="h-5 w-5 text-primary" /><div className="swiss-label text-[10px] mt-4">Mitigation prompt</div><p className="text-sm leading-relaxed mt-3">Maintain radar coverage, verify anomalous observations, review drainage and increase inspection frequency whenever the configured velocity thresholds are exceeded.</p></div>
    </div>

    <div className="border-t-2 border-foreground mt-7 pt-4 text-sm leading-relaxed text-muted-foreground">This dashboard is a decision-support report generated from imported radar summaries. It does not replace the site Trigger Action Response Plan, radar validation, field inspection or geotechnical engineering judgement.</div>
  </section>;
}
