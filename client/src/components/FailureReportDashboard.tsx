import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileDown, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FailureRow = {
  id: number; incidentDate: number; pit: string; phase: string | null; wall: string | null; bench: string | null;
  lithology: string | null; failureType: string | null; actionTaken: string | null; comments: string | null;
};

const COLORS = ["#123f5a", "#3594bf", "#d4b51d", "#6a7680", "#9ec9dc", "#7f5b3e"];
const clean = (value: string | null | undefined, fallback = "Unspecified") => value?.trim() || fallback;

function counts(rows: FailureRow[], key: (row: FailureRow) => string) {
  const map = new Map<string, number>();
  rows.forEach(row => map.set(key(row), (map.get(key(row)) ?? 0) + 1));
  return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export default function FailureReportDashboard({ rows }: { rows: FailureRow[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pit, setPit] = useState("all");
  const [wall, setWall] = useState("all");
  const [presenting, setPresenting] = useState(false);
  const options = useMemo(() => ({
    pits: Array.from(new Set(rows.map(row => row.pit))).sort(),
    walls: Array.from(new Set(rows.map(row => clean(row.wall)))).sort(),
  }), [rows]);
  const filtered = useMemo(() => rows.filter(row => {
    const day = new Date(row.incidentDate).toISOString().slice(0, 10);
    return (!from || day >= from) && (!to || day <= to) && (pit === "all" || row.pit === pit) && (wall === "all" || clean(row.wall) === wall);
  }), [rows, from, to, pit, wall]);
  const report = useMemo(() => {
    const byPhase = counts(filtered, row => clean(row.phase));
    const byWall = counts(filtered, row => clean(row.wall));
    const byLithology = counts(filtered, row => clean(row.lithology));
    const byType = counts(filtered, row => clean(row.failureType));
    const byYear = counts(filtered, row => String(new Date(row.incidentDate).getUTCFullYear())).sort((a, b) => Number(a.name) - Number(b.name));
    const first = filtered.length ? Math.min(...filtered.map(row => row.incidentDate)) : null;
    const last = filtered.length ? Math.max(...filtered.map(row => row.incidentDate)) : null;
    return { byPhase, byWall, byLithology, byType, byYear, first, last };
  }, [filtered]);
  if (!rows.length) return <div className="border border-dashed border-muted-foreground/40 p-12 text-center text-muted-foreground">Import or add Failure Records to generate this report.</div>;
  const topWall = report.byWall[0]; const topPhase = report.byPhase[0]; const topLithology = report.byLithology[0]; const peakYear = [...report.byYear].sort((a, b) => b.value - a.value)[0];
  const share = (value?: number) => filtered.length && value ? Math.round(value / filtered.length * 100) : 0;
  return <div className={`failure-report space-y-6 ${presenting ? "fixed inset-0 z-50 overflow-auto bg-white p-8" : ""}`}>
    <div className="no-print flex flex-wrap items-center justify-between gap-3"><div><div className="swiss-label text-[#3594bf]">Dynamic incident analysis</div><p className="text-sm text-muted-foreground mt-1">Filters update every KPI, chart and conclusion below.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setPresenting(value => !value)}><Presentation className="h-4 w-4" /> {presenting ? "Exit presentation" : "Presentation mode"}</Button><Button onClick={() => window.print()}><FileDown className="h-4 w-4" /> Print / Save PDF</Button></div></div>
    <div className="failure-report-title border border-[#123f5a] p-8"><div className="h-1 bg-[#d4b51d] mb-7" /><h2 className="text-4xl md:text-5xl font-extrabold text-[#123f5a] max-w-4xl">Fall of Ground Incidents:<br />Trend Analysis & Risk Assessment</h2><div className="text-xl text-[#3594bf] font-semibold mt-6">{pit === "all" ? "All mine operations" : pit} | {report.first ? new Date(report.first).getUTCFullYear() : "—"}–{report.last ? new Date(report.last).getUTCFullYear() : "—"}</div></div>
    <div className="no-print grid grid-cols-1 md:grid-cols-4 gap-4 border border-foreground p-4"><div><Label className="swiss-label mb-1.5 block">From</Label><Input type="date" value={from} onChange={event => setFrom(event.target.value)} /></div><div><Label className="swiss-label mb-1.5 block">To</Label><Input type="date" value={to} onChange={event => setTo(event.target.value)} /></div><div><Label className="swiss-label mb-1.5 block">Pit</Label><Select value={pit} onValueChange={setPit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All pits</SelectItem>{options.pits.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div><Label className="swiss-label mb-1.5 block">Wall</Label><Select value={wall} onValueChange={setWall}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All walls</SelectItem>{options.walls.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div></div>
    <section><div className="failure-section-title">Key Findings: {filtered.length} Incidents Reveal Critical Patterns</div><div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-5">{[
      ["Total incidents", `${filtered.length} Events`, "Documented fall-of-ground records in the selected period."],
      ["Primary risk zone", topWall ? `${topWall.name} (${share(topWall.value)}%)` : "—", topWall ? `${topWall.value} incidents make this the principal concentration.` : "No data."],
      ["Most affected phase", topPhase?.name ?? "—", topPhase ? `${topPhase.value} incidents recorded in this phase.` : "No data."],
      ["Peak activity", peakYear ? `Year ${peakYear.name}` : "—", peakYear ? `${peakYear.value} incidents, the highest annual total.` : "No data."],
      ["Dominant lithology", topLithology ? `${topLithology.name} (${share(topLithology.value)}%)` : "—", topLithology ? `${topLithology.value} incidents involve this material.` : "No data."],
    ].map(([label, value, note]) => <div key={label} className="border border-[#123f5a] p-5 min-h-44"><div className="text-xs font-bold uppercase tracking-wider text-[#3594bf]">{label}</div><div className="text-xl font-extrabold text-[#123f5a] mt-6">{value}</div><p className="text-xs text-muted-foreground mt-3 leading-relaxed">{note}</p></div>)}</div></section>
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6"><div className="failure-panel"><h3>Incident Distribution by Phase</h3><ResponsiveContainer width="100%" height={310}><BarChart data={report.byPhase}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#123f5a" /></BarChart></ResponsiveContainer><p>{topPhase ? `${topPhase.name} is the most affected phase with ${topPhase.value} recorded incidents.` : "No phase information is available."}</p></div><div className="failure-panel"><h3>Incident Timeline</h3><ResponsiveContainer width="100%" height={310}><LineChart data={report.byYear}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="value" stroke="#123f5a" strokeWidth={3} dot={{ fill: "#d4b51d", stroke: "#123f5a", r: 5 }} /></LineChart></ResponsiveContainer><p>{peakYear ? `${peakYear.name} is the peak activity year. Recent values should be reviewed alongside changes in exposure, mining activity and reporting completeness.` : "No timeline is available."}</p></div></section>
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6"><div className="failure-panel"><h3>Incident Distribution by Wall</h3><ResponsiveContainer width="100%" height={310}><PieChart><Pie data={report.byWall} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} label>{report.byWall.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><p>{topWall ? `${topWall.name} accounts for ${share(topWall.value)}% of selected incidents and is the primary concentration zone.` : "No wall information is available."}</p></div><div className="failure-panel"><h3>Lithology Distribution</h3><ResponsiveContainer width="100%" height={310}><PieChart><Pie data={report.byLithology} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} label>{report.byLithology.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><p>{topLithology ? `${topLithology.name} is the dominant recorded lithology with ${topLithology.value} incidents.` : "No lithology information is available."}</p></div></section>
    <section><div className="failure-section-title">Failure Mechanisms & Recommended Focus</div><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5"><div className="failure-insight"><strong>Leading failure type</strong><span>{report.byType[0]?.name ?? "Unspecified"}</span><p>{report.byType[0] ? `${report.byType[0].value} incidents (${share(report.byType[0].value)}%) are classified under this mechanism.` : "Improve failure-type completion for stronger trend analysis."}</p></div><div className="failure-insight"><strong>Concentration control</strong><span>{topWall?.name ?? "No dominant wall"}</span><p>Prioritize inspections, scaling controls, berm condition reviews and exposure management in the highest-frequency areas.</p></div><div className="failure-insight"><strong>Data quality note</strong><span>{filtered.filter(row => !row.failureType || !row.wall || !row.lithology).length} incomplete records</span><p>Complete missing mechanism, wall and lithology fields before using distributions for formal risk decisions.</p></div></div></section>
    <div className="border-t-2 border-[#d4b51d] pt-4 text-xs text-muted-foreground">This report summarizes recorded incident frequency and concentration. It does not replace a site-specific geotechnical risk assessment, ground control plan or Trigger Action Response Plan.</div>
  </div>;
}
