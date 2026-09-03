import { useMemo, useState } from "react";
import { FileText, Printer, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { trpc } from "@/lib/trpc";

type InverseVelocityChartPoint = {
  timeDays: number;
  date: number;
  displacement: number | null;
  velocity: number | null;
  inverseVelocity: number | null;
  fittedInverseVelocity: number | null;
};

function InverseVelocityTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: InverseVelocityChartPoint }> }) {
  if (!active || !payload?.length || !payload[0]?.payload) return null;
  const point = payload[0].payload;
  const format = (value: number | null, unit: string) => value === null ? "—" : `${value.toFixed(3)} ${unit}`;
  return <div className="border border-foreground bg-background p-3 shadow-sm text-xs"><div className="font-bold uppercase mb-2">{new Date(point.date).toLocaleDateString()}</div><div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1"><span className="text-muted-foreground">Displacement</span><span className="font-mono">{format(point.displacement, "mm")}</span><span className="text-muted-foreground">Velocity</span><span className="font-mono">{format(point.velocity, "mm/day")}</span><span className="text-muted-foreground">Inverse velocity</span><span className="font-mono">{format(point.inverseVelocity, "day/mm")}</span>{point.fittedInverseVelocity !== null && <><span className="text-muted-foreground">Fitted trend</span><span className="font-mono text-primary">{format(point.fittedInverseVelocity, "day/mm")}</span></>}</div></div>;
}

function riskClass(risk: string) {
  if (risk === "Critical") return "bg-black text-white";
  if (risk === "High") return "bg-[#d71920] text-white";
  if (risk === "Moderate") return "bg-[#f2b134] text-black";
  return "bg-[#dcefdc] text-[#164b2a]";
}

export default function RadarReport() {
  const [wallId, setWallId] = useState<number | null>(null);
  const [windowName, setWindowName] = useState("all");
  const [thresholds, setThresholds] = useState({ moderateVelocityMmPerDay: 1, highVelocityMmPerDay: 5, criticalVelocityMmPerDay: 10 });
  const records = trpc.monitoring.list.useQuery();
  const rowsQuery = trpc.monitoring.summaryRows.useQuery({ monitoringRecordId: wallId ?? 0 }, { enabled: wallId !== null });
  const analysisInput = useMemo(() => ({ monitoringRecordId: wallId ?? 0, window: windowName === "all" ? undefined : windowName, ...thresholds }), [wallId, windowName, thresholds]);
  const analysis = trpc.monitoring.analyzeRadarSummary.useQuery(analysisInput, { enabled: wallId !== null && (rowsQuery.data?.length ?? 0) > 0 });
  const rows = (rowsQuery.data ?? []).filter(row => windowName === "all" || row.window === windowName);
  const windows = Array.from(new Set((rowsQuery.data ?? []).map(row => row.window)));
  const selectedWall = (records.data ?? []).find(record => record.id === wallId);
  const chartData = useMemo(() => {
    if (!analysis.data) return [];
    const first = analysis.data.firstMeasuredAt;
    const slope = analysis.data.failureForecast.inverseVelocitySlopePerDay;
    const forecastAt = analysis.data.failureForecast.predictedFailureAt;
    const forecastTimeDays = forecastAt ? (forecastAt - first) / 86_400_000 : null;
    const intercept = slope !== null && forecastTimeDays !== null ? -slope * forecastTimeDays : null;
    const observed: InverseVelocityChartPoint[] = analysis.data.points.map(point => {
      const velocity = point.calculatedVelocityMmPerDay;
      const timeDays = (point.measuredAt - first) / 86_400_000;
      return {
        timeDays,
        date: point.measuredAt,
        displacement: point.displacementMm,
        velocity: velocity === null ? null : Math.abs(velocity),
        inverseVelocity: velocity === null || Math.abs(velocity) === 0 ? null : 1 / Math.abs(velocity),
        fittedInverseVelocity: intercept === null || slope === null ? null : intercept + slope * timeDays,
      };
    });
    if (forecastTimeDays !== null) observed.push({ timeDays: forecastTimeDays, date: forecastAt as number, displacement: null, velocity: null, inverseVelocity: null, fittedInverseVelocity: 0 });
    return observed;
  }, [analysis.data]);

  const stats = useMemo(() => {
    const displacement = rows.flatMap(row => [row.displacementMaxMm, row.displacementMinMm, row.displacementAverageMm]).filter((value): value is number => value !== null);
    const velocity = rows.flatMap(row => [row.velocityMaxMmPerDay, row.velocityMinMmPerDay, row.velocityAverageMmPerDay]).filter((value): value is number => value !== null);
    const stable = rows.filter(row => !row.observations || /^(NF|no fall|stable)$/i.test(row.observations.trim())).length;
    return { maxDisplacement: displacement.length ? Math.max(...displacement.map(Math.abs)) : null, maxVelocity: velocity.length ? Math.max(...velocity.map(Math.abs)) : null, stablePercent: rows.length ? (stable / rows.length) * 100 : null };
  }, [rows]);

  return (
    <div className="container py-10">
      <ModuleHeader index="11" title="Radar Report" description="Generate a structured radar monitoring analysis report from the Excel-style daily displacement and velocity dataset." />
      <div className="flex justify-end mt-6 print:hidden"><Button variant="outline" className="rounded-none" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Print / Save PDF</Button></div>
      <div className="border-t-2 border-foreground mt-5 pt-4 max-w-5xl print:hidden"><SectionLabel>Report scope</SectionLabel><div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-5"><div><Label className="swiss-label text-[10px]">Wall / slope</Label><Select value={wallId ? String(wallId) : ""} onValueChange={value => { setWallId(Number(value)); setWindowName("all"); }}><SelectTrigger className="rounded-none border-foreground mt-1"><SelectValue placeholder="Choose a wall" /></SelectTrigger><SelectContent>{(records.data ?? []).map(record => <SelectItem key={record.id} value={String(record.id)}>{record.wallName}</SelectItem>)}</SelectContent></Select></div><div><Label className="swiss-label text-[10px]">Window</Label><Select value={windowName} onValueChange={setWindowName} disabled={!windows.length}><SelectTrigger className="rounded-none border-foreground mt-1"><SelectValue placeholder="All windows" /></SelectTrigger><SelectContent><SelectItem value="all">All windows</SelectItem>{windows.map(window => <SelectItem key={window} value={window}>{window}</SelectItem>)}</SelectContent></Select></div>{(["moderateVelocityMmPerDay", "highVelocityMmPerDay", "criticalVelocityMmPerDay"] as const).map(field => { const label = field.startsWith("moderate") ? "Moderate" : field.startsWith("high") ? "High" : "Critical"; return <div key={field}><Label className="swiss-label text-[10px]">{label} velocity (mm/day)</Label><Input type="number" min="0.001" step="0.001" className="rounded-none border-foreground mt-1" value={thresholds[field]} onChange={event => setThresholds(previous => ({ ...previous, [field]: Math.max(0.001, Number(event.target.value) || 0.001) }))} /></div>; })}</div></div>
      {selectedWall && analysis.data && (
        <article className="mt-10 max-w-6xl print:max-w-none" id="radar-report">
          <div className="border-t-2 border-foreground pt-5"><SectionLabel>Radar monitoring analysis report</SectionLabel><h2 className="text-4xl font-extrabold uppercase mt-4">{selectedWall.wallName}</h2><p className="text-sm text-muted-foreground mt-2">{windowName === "all" ? "All windows" : windowName} · {new Date(analysis.data.firstMeasuredAt).toLocaleDateString()} — {new Date(analysis.data.lastMeasuredAt).toLocaleDateString()}</p></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-7">{[["Max displacement", stats.maxDisplacement === null ? "—" : `${stats.maxDisplacement.toFixed(2)} mm`], ["Max velocity", stats.maxVelocity === null ? "—" : `${stats.maxVelocity.toFixed(3)} mm/day`], ["Stable observations", stats.stablePercent === null ? "—" : `${stats.stablePercent.toFixed(1)}%`], ["Current risk", analysis.data.risk]].map(([label, value]) => <div key={String(label)} className={`border border-foreground p-4 ${label === "Current risk" ? riskClass(String(value)) : ""}`}><div className="swiss-label text-[10px] mb-3">{label}</div><div className="text-2xl font-bold">{value}</div></div>)}</div>
          <div className="border border-foreground mt-8 p-5"><div className="flex items-center justify-between gap-4 flex-wrap"><div><SectionLabel>Interactive inverse-velocity analysis</SectionLabel><p className="text-xs text-muted-foreground mt-2">Hover the timeline to inspect date, displacement, velocity and inverse velocity. The red line is the fitted trend when the forecast is available.</p></div><div className="swiss-label text-[10px]">1 / |velocity| · day/mm</div></div><div className="h-[320px] mt-5"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 12, right: 20, left: 8, bottom: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#d7d7d7" /><XAxis type="number" dataKey="timeDays" tickFormatter={value => `${Number(value).toFixed(0)}d`} stroke="#111" tick={{ fontSize: 11 }} /><YAxis stroke="#111" tick={{ fontSize: 11 }} tickFormatter={value => Number(value).toFixed(1)} label={{ value: "Inverse velocity (day/mm)", angle: -90, position: "insideLeft", fontSize: 11 }} /><Tooltip content={<InverseVelocityTooltip />} /><Line type="monotone" dataKey="inverseVelocity" stroke="#111111" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} name="inverseVelocity" /><Line type="linear" dataKey="fittedInverseVelocity" stroke="#d71920" strokeWidth={2} dot={false} connectNulls name="fittedInverseVelocity" />{analysis.data.failureForecast.predictedFailureAt && <ReferenceLine x={(analysis.data.failureForecast.predictedFailureAt - analysis.data.firstMeasuredAt) / 86_400_000} stroke="#d71920" strokeDasharray="5 5" label={{ value: "Estimated failure", fill: "#d71920", fontSize: 11 }} />}</LineChart></ResponsiveContainer></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4"><div className="bg-muted/40 p-3"><div className="swiss-label text-[10px]">Fit sample count</div><div className="font-mono text-sm mt-2">{analysis.data.failureForecast.fitSampleCount}</div></div><div className="bg-muted/40 p-3"><div className="swiss-label text-[10px]">R²</div><div className="font-mono text-sm mt-2">{analysis.data.failureForecast.rSquared === null ? "—" : analysis.data.failureForecast.rSquared.toFixed(2)}</div></div><div className="bg-muted/40 p-3"><div className="swiss-label text-[10px]">Forecast status</div><div className="font-bold text-sm mt-2">{analysis.data.failureForecast.status}</div></div></div></div>
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6 mt-8"><div className="border border-foreground p-6"><div className="swiss-label text-[10px]">Executive summary</div><p className="text-base leading-relaxed mt-4">The monitoring dataset for {selectedWall.wallName} contains {rows.length} daily/window records across {windows.length} monitoring window{windows.length === 1 ? "" : "s"}. The maximum recorded displacement is {stats.maxDisplacement === null ? "not available" : `${stats.maxDisplacement.toFixed(2)} mm`} and the maximum recorded velocity is {stats.maxVelocity === null ? "not available" : `${stats.maxVelocity.toFixed(3)} mm/day`}. The current velocity-based classification is <strong>{analysis.data.risk}</strong>. {stats.stablePercent !== null ? `${stats.stablePercent.toFixed(1)}% of rows are marked NF/stable by the supplied observations.` : "Observation labels were not supplied."}</p></div><div className="border border-foreground bg-black text-white p-6"><TrendingUp className="h-5 w-5 text-[#d71920]" /><div className="swiss-label text-[10px] mt-4 text-white/70">Failure forecast</div><div className="text-2xl font-bold mt-3">{analysis.data.failureForecast.predictedFailureAt ? new Date(analysis.data.failureForecast.predictedFailureAt).toLocaleString() : "No reliable date"}</div><p className="text-sm text-white/70 mt-3">{analysis.data.failureForecast.message}</p><div className="text-xs text-white/60 mt-4">Confidence: {analysis.data.failureForecast.confidence} · R²: {analysis.data.failureForecast.rSquared === null ? "—" : analysis.data.failureForecast.rSquared.toFixed(2)}</div></div></div>
          <div className="border border-foreground mt-8 overflow-x-auto"><div className="p-4 border-b border-foreground"><SectionLabel>Comprehensive monitoring metrics</SectionLabel></div><table className="w-full min-w-[820px] text-sm"><thead className="border-b border-foreground bg-muted/40"><tr className="text-left">{["Date", "Pit", "Window", "Disp. max", "Disp. min", "Disp. avg", "Vel. max", "Vel. min", "Vel. avg", "Obs."].map(label => <th key={label} className="p-3 swiss-label text-[10px]">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.slice(-100).map(row => <tr key={row.id}><td className="p-3 whitespace-nowrap">{new Date(row.measuredAt).toLocaleDateString()}</td><td className="p-3">{row.pit}</td><td className="p-3">{row.window}</td><td className="p-3 font-mono">{row.displacementMaxMm ?? "—"}</td><td className="p-3 font-mono">{row.displacementMinMm ?? "—"}</td><td className="p-3 font-mono">{row.displacementAverageMm ?? "—"}</td><td className="p-3 font-mono">{row.velocityMaxMmPerDay ?? "—"}</td><td className="p-3 font-mono">{row.velocityMinMmPerDay ?? "—"}</td><td className="p-3 font-mono">{row.velocityAverageMmPerDay ?? "—"}</td><td className="p-3">{row.observations || "—"}</td></tr>)}</tbody></table></div>
          <div className="border border-foreground mt-8 p-6"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><div className="swiss-label text-[10px]">Window analysis and engineering interpretation</div></div><div className="grid md:grid-cols-2 gap-4 mt-5">{windows.map(window => { const windowRows = rows.filter(row => row.window === window); const maxVelocity = Math.max(...windowRows.map(row => Math.abs(row.velocityMaxMmPerDay ?? row.velocityAverageMmPerDay ?? 0))); return <div key={window} className="border border-foreground p-4"><div className="font-bold uppercase">{window} window</div><p className="text-sm text-muted-foreground mt-2">{windowRows.length} records; peak velocity {maxVelocity.toFixed(3)} mm/day. Compare this result with site trigger levels, visual inspections and the operational response plan.</p></div>; })}</div><p className="text-xs text-muted-foreground mt-6">This report is a trend-based decision-support product. The Inverse Velocity estimate is not a deterministic failure time or a probability of failure. Verify radar data quality, corroborate with prisms and field observations, and follow the site Trigger Action Response Plan.</p></div>
        </article>
      )}
      {wallId !== null && !analysis.data && <div className="border border-foreground p-10 mt-10 text-sm text-muted-foreground">Import an Excel monitoring workbook in the Monitoring module, then return here to generate the report.</div>}
    </div>
  );
}
