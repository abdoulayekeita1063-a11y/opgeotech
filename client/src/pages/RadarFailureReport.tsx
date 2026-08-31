import { useEffect, useMemo, useState } from "react";
import { FileText, Printer, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { trpc } from "@/lib/trpc";

function riskClass(risk: string) {
  if (risk === "Critical") return "bg-black text-white";
  if (risk === "High") return "bg-[#d71920] text-white";
  if (risk === "Moderate") return "bg-[#f2b134] text-black";
  return "bg-[#dcefdc] text-[#164b2a]";
}

export default function RadarFailureReport() {
  const [wallId, setWallId] = useState<number | null>(null);
  const [pointId, setPointId] = useState("");
  const [thresholds, setThresholds] = useState({ moderateVelocityMmPerDay: 1, highVelocityMmPerDay: 5, criticalVelocityMmPerDay: 10 });
  const records = trpc.monitoring.list.useQuery();
  const readings = trpc.monitoring.radarReadings.useQuery({ monitoringRecordId: wallId ?? 0 }, { enabled: wallId !== null });
  const points = useMemo(() => Array.from(new Set((readings.data ?? []).map(reading => reading.radarPointId))), [readings.data]);
  const reportInput = useMemo(() => ({ monitoringRecordId: wallId ?? 0, radarPointId: pointId || undefined, ...thresholds }), [wallId, pointId, thresholds]);
  const analysis = trpc.monitoring.analyzeRadar.useQuery(reportInput, { enabled: wallId !== null && Boolean(pointId) && (readings.data?.length ?? 0) > 0 });
  const selectedWall = (records.data ?? []).find(record => record.id === wallId);

  useEffect(() => {
    if (points.length && !points.includes(pointId)) setPointId(points[0]);
  }, [points, pointId]);

  const forecast = analysis.data?.failureForecast;
  const reportDate = new Date().toLocaleString();

  return (
    <div className="container py-10">
      <ModuleHeader index="10" title="Radar Failure Report" description="Generate a structured failure-risk report from radar displacement velocity trends and inverse-velocity analysis." />

      <div className="border-t-2 border-foreground pt-4 mt-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <div><Label className="swiss-label text-[11px]">Wall / slope</Label><Select value={wallId ? String(wallId) : ""} onValueChange={value => { setWallId(Number(value)); setPointId(""); }}><SelectTrigger className="rounded-none border-foreground mt-1"><SelectValue placeholder="Choose a registered wall" /></SelectTrigger><SelectContent>{(records.data ?? []).map(record => <SelectItem key={record.id} value={String(record.id)}>{record.wallName}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="swiss-label text-[11px]">Radar point</Label><Select value={pointId} onValueChange={setPointId} disabled={!points.length}><SelectTrigger className="rounded-none border-foreground mt-1"><SelectValue placeholder="Import radar readings first" /></SelectTrigger><SelectContent>{points.map(point => <SelectItem key={point} value={point}>{point}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="border border-foreground bg-muted/30 p-4 mt-5 max-w-4xl"><div className="swiss-label text-[10px]">Report velocity thresholds</div><div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">{(["moderateVelocityMmPerDay", "highVelocityMmPerDay", "criticalVelocityMmPerDay"] as const).map(field => { const label = field.startsWith("moderate") ? "Moderate" : field.startsWith("high") ? "High" : "Critical"; return <div key={field}><Label className="text-[10px] uppercase">{label} velocity</Label><Input type="number" min="0.001" step="0.001" className="rounded-none border-foreground mt-1" value={thresholds[field]} onChange={event => setThresholds(previous => ({ ...previous, [field]: Math.max(0.001, Number(event.target.value) || 0.001) }))} /><div className="text-[10px] text-muted-foreground mt-1">mm/day</div></div>; })}</div></div>
      </div>

      {analysis.data && selectedWall && forecast && (
        <article className="mt-10 max-w-5xl print:max-w-none" id="radar-report">
          <div className="flex items-start justify-between gap-4 border-t-2 border-foreground pt-4"><div><SectionLabel>Failure risk report</SectionLabel><h2 className="text-3xl font-extrabold uppercase mt-3">{selectedWall.wallName}</h2><p className="text-sm text-muted-foreground mt-1">Radar point {analysis.data.pointId} · Generated {reportDate}</p></div><Button variant="outline" className="rounded-none print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Print / Save PDF</Button></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">{[["Current risk", analysis.data.risk], ["Latest velocity", analysis.data.latestVelocityMmPerDay === null ? "—" : `${analysis.data.latestVelocityMmPerDay} mm/day`], ["Forecast confidence", forecast.confidence]].map(([label, value]) => <div key={String(label)} className="border border-foreground p-4"><div className="swiss-label text-[10px] mb-2">{label}</div><div className={`font-bold ${label === "Current risk" ? `${riskClass(String(value))} inline-flex px-2 py-1` : ""}`}>{value}</div></div>)}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5"><div className="border border-foreground p-5"><div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" /><div className="swiss-label text-[10px]">Risk assessment</div></div><p className="font-bold text-lg mt-4">{analysis.data.alert}</p><p className="text-sm text-muted-foreground mt-3">The risk level is derived from the configured radar velocity thresholds. Confirm the signal quality and site response plan before operational action.</p></div><div className="border border-foreground p-5"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><div className="swiss-label text-[10px]">Inverse-velocity forecast</div></div><p className="font-bold text-lg mt-4">{forecast.predictedFailureAt ? new Date(forecast.predictedFailureAt).toLocaleString() : "No reliable failure date"}</p><p className="text-sm mt-3">{forecast.message}</p><p className="text-xs text-muted-foreground mt-3">Method: {forecast.method}; fit samples: {forecast.fitSampleCount}; R²: {forecast.rSquared === null ? "—" : forecast.rSquared.toFixed(2)}.</p></div></div>
          <div className="border border-foreground mt-5 p-5"><div className="swiss-label text-[10px]">Engineering interpretation</div><p className="text-sm leading-relaxed mt-4">This report identifies a movement trend from the supplied radar time series. A forecast date is displayed only when the inverse velocity decreases consistently and the linear fit is sufficiently strong. It is not a probability of failure, and it must not replace geotechnical review, visual inspection, prism/inclinometer confirmation, or the site's Trigger Action Response Plan.</p></div>
        </article>
      )}
      {wallId !== null && !analysis.data && <div className="border border-foreground p-8 mt-10 max-w-3xl text-sm text-muted-foreground">Select a radar point with imported readings to generate the failure-risk report.</div>}
    </div>
  );
}
