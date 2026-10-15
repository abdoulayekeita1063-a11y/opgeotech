import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Droplets,
  FileDown,
  Gauge,
  ImagePlus,
  Layers3,
  MapPinned,
  Save,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  Upload,
  Waves,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { trpc } from "@/lib/trpc";
import { escapeHtml, exportRecordAsPdf } from "@/lib/exportPdf";

const blankForm = {
  wallName: "", pitPhase: "", area: "", operation: "", inspectorName: "", startBench: "", endBench: "", inspectionDate: new Date().toISOString().slice(0, 10), zone: "", status: "Active",
  bermWidth: "", slopeHeight: "", slopeAngle: "", monthToDateRainfall: "", faceMoistureCondition: "", ponding: "", drainage: "",
  rockMassRating: "", jointSets: "", jointContinuity: "", rockType: "", structuralType: "", infilling: "", rockMassCharacterization: "",
  mappingDensity: "", irsData: "", geotechDrillingProgram: "", geotechnicalAnalysis: "", potentialFailureMechanism: "", factorOfSafety: "", failureHistory: "", probabilityOfFailure: "", orientation: "",
  faceCleaningMethod: "", bermCondition: "", rockFaceDescription: "", looseMaterials: "", limitBlastingMethod: "", wallDamage: "", presplitBarrelsVisible: "", crestBackbreak: "", hardToe: "", structuralPlanesVisible: "",
  monitoringMethod: "", monitoringFrequency: "", cumulativeDisplacement: "", analysis: "", velocity: "", notes: "",
};

type FormState = typeof blankForm;
type FieldName = keyof FormState;
type Rating = { overallScore: number; riskLevel: string; riskClass: string; riskColour: string; actionPriority: string; recommendations: string[]; dataCompleteness: number; categoryScores: Array<{ category: string; score: number; weight: number; contribution: number; basis: string[] }>; method: string };
type WallPhoto = { name: string; dataUrl: string };

const ratingRows = [
  ["0–<2", "Very low risk", "Cyan", "Notify people in working area and treat ASAP."],
  ["2–<3", "Low risk", "Blue", "Notify people in working area, treat ASAP and adhere to stand-offs."],
  ["3–<4", "Medium risk", "Green", "Demarcate highwall stand-off, monitor and treat ASAP."],
  ["4–<6", "High risk", "Brown", "Demarcate, monitor, treat ASAP and refer to Special Areas Committee."],
  ["6–<8", "Very high risk", "Orange", "Demarcate with SSR, treat ASAP and operate by permission only."],
  ["8–10", "Extremely high risk", "Red", "No entry. Cease all operations until rectified."],
] as const;

function colourClass(colour?: string | null) {
  return ({ Cyan: "bg-cyan-50 text-cyan-950 border-cyan-200", Blue: "bg-blue-50 text-blue-950 border-blue-200", Green: "bg-emerald-50 text-emerald-950 border-emerald-200", Brown: "bg-amber-50 text-amber-950 border-amber-200", Orange: "bg-orange-50 text-orange-950 border-orange-200", Red: "bg-red-50 text-red-950 border-red-200" } as Record<string, string>)[colour || ""] || "bg-slate-50 text-slate-900 border-slate-200";
}

function toNumber(value: string) {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) ? number : undefined;
}

type FieldRisk = "favorable" | "watch" | "critical" | "neutral";

function fieldRisk(field: FieldName, value: string): FieldRisk {
  if (!value.trim()) return "neutral";
  const numeric = Number(value);
  if (field === "slopeAngle" && Number.isFinite(numeric)) return numeric > 45 ? "critical" : numeric > 35 ? "watch" : "favorable";
  if (field === "factorOfSafety" && Number.isFinite(numeric)) return numeric < 1 ? "critical" : numeric < 1.3 ? "watch" : "favorable";
  if (field === "probabilityOfFailure" && Number.isFinite(numeric)) return numeric > 20 ? "critical" : numeric > 10 ? "watch" : "favorable";
  const criticalValues: Partial<Record<FieldName, string[]>> = {
    faceMoistureCondition: ["Flow", "Saturated"], ponding: ["Water present", "Severe ponding"], drainage: ["Poor", "Blocked", "None"],
    potentialFailureMechanism: ["Planar", "Wedge", "Toppling", "Circular", "Multiple mechanisms"], failureHistory: ["Recent", "Active"], orientation: ["Daylight / unfavourable"],
    looseMaterials: ["Yes", "Hanging block"], wallDamage: ["Yes", "Severe"], crestBackbreak: ["Yes", "Severe"], hardToe: ["Yes", "Severe"], structuralPlanesVisible: ["Yes"], analysis: ["Accelerating", "Critical"], bermCondition: ["Poor", "No berm"],
  };
  const watchValues: Partial<Record<FieldName, string[]>> = {
    faceMoistureCondition: ["Wet"], ponding: ["Minor ponding"], drainage: ["Partial"], potentialFailureMechanism: ["No failure"], failureHistory: ["Old", "Minor"], orientation: ["Neutral"],
    looseMaterials: ["Minor"], wallDamage: ["Minor"], crestBackbreak: ["Minor"], hardToe: ["Minor"], structuralPlanesVisible: ["Minor"], analysis: ["Increasing"], bermCondition: ["Fair", "Adequate"],
  };
  if (criticalValues[field]?.includes(value)) return "critical";
  if (watchValues[field]?.includes(value)) return "watch";
  if (["Dry", "Damp", "No water", "Good", "No failure", "Favourable / stable", "No", "Stable / normal", "Scaled", "Complete / high", "Available / complete"].includes(value)) return "favorable";
  return "neutral";
}

function riskClasses(risk: FieldRisk) {
  return ({
    favorable: "border-emerald-300 bg-emerald-50/60 focus:border-emerald-500 focus:ring-emerald-500/20",
    watch: "border-amber-300 bg-amber-50/70 focus:border-amber-500 focus:ring-amber-500/20",
    critical: "border-red-300 bg-red-50/70 focus:border-red-600 focus:ring-red-600/20",
    neutral: "border-slate-200 bg-slate-50/70 focus:border-[#d71920] focus:ring-[#d71920]/20",
  })[risk];
}

function RiskTag({ risk }: { risk: FieldRisk }) {
  if (risk === "neutral") return null;
  const labels = { favorable: "Favorable", watch: "Watch", critical: "Critical" } as const;
  const colors = { favorable: "text-emerald-700", watch: "text-amber-700", critical: "text-red-700" } as const;
  return <span className={`ml-auto text-[9px] font-bold uppercase tracking-[0.1em] ${colors[risk]}`}>{labels[risk]}</span>;
}

function Field({ form, field, label, numeric, setField, className = "" }: { form: FormState; field: FieldName; label: string; numeric?: boolean; setField: (field: FieldName, value: string) => void; className?: string }) {
  const risk = fieldRisk(field, form[field]);
  return <div className={className}>
    <Label className="flex text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}<RiskTag risk={risk} /></Label>
    <Input type={numeric ? "number" : "text"} className={`mt-1.5 h-10 rounded-lg text-sm shadow-none transition-colors ${riskClasses(risk)}`} value={form[field]} onChange={event => setField(field, event.target.value)} />
  </div>;
}

function SelectField({ form, field, label, options, setField, className = "" }: { form: FormState; field: FieldName; label: string; options: string[]; setField: (field: FieldName, value: string) => void; className?: string }) {
  const risk = fieldRisk(field, form[field]);
  return <div className={className}>
    <Label className="flex text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}<RiskTag risk={risk} /></Label>
    <select className={`mt-1.5 flex h-10 w-full rounded-lg border px-3 text-sm shadow-none transition-colors focus:bg-white focus:outline-none focus:ring-2 ${riskClasses(risk)}`} value={form[field]} onChange={event => setField(field, event.target.value)}>
      <option value="">Select…</option>
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select>
  </div>;
}

function SheetSection({ title, children, score, icon: Icon }: { title: string; children: ReactNode; score?: number; icon?: typeof Activity }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#d71920]/10 text-[#b3131a]"><Icon className="h-3.5 w-3.5" /></span>}
        <h2 className="truncate text-sm font-bold text-slate-900">{title}</h2>
      </div>
      {score !== undefined && <span className="shrink-0 rounded-full bg-white px-2.5 py-1 font-mono text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{score.toFixed(2)} / 10</span>}
    </div>
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">{children}</div>
  </section>;
}

function GroupHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-3 flex items-start gap-3">
    <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white"><ClipboardCheck className="h-4 w-4" /></span>
    <div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b3131a]">{eyebrow}</div><h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{description}</p></div>
  </div>;
}

function RatingBadge({ rating }: { rating: Rating | null }) {
  if (!rating) return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm text-slate-500"><div className="flex items-center gap-2 font-semibold text-slate-700"><Gauge className="h-4 w-4 text-[#d71920]" />Awaiting inspection score</div><p className="mt-2 text-xs leading-relaxed">Complete the key observations and save the inspection to calculate the overall wall risk.</p></div>;
  return <div className={`overflow-hidden rounded-xl border ${colourClass(rating.riskColour)}`}>
    <div className="flex items-start justify-between gap-4 p-5"><div><div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">Overall risk score</div><div className="mt-1 text-4xl font-black tracking-tight">{rating.overallScore.toFixed(2)}<span className="ml-1 text-base font-bold opacity-60">/ 10</span></div><div className="mt-1 text-sm font-bold">{rating.riskClass}</div></div><ShieldAlert className="h-7 w-7 opacity-75" /></div>
    <div className="border-t border-current/15 bg-white/45 px-5 py-3"><div className="text-xs font-bold leading-relaxed">{rating.actionPriority}</div><div className="mt-2 text-[11px] opacity-75">Data completeness: {rating.dataCompleteness}%</div></div>
  </div>;
}

function MetricCard({ label, value, detail, icon: Icon, tone = "slate" }: { label: string; value: string; detail: string; icon: typeof Activity; tone?: "slate" | "red" | "amber" }) {
  const toneClass = tone === "red" ? "bg-red-50 text-red-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700";
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"><div className="flex items-center justify-between"><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}><Icon className="h-4 w-4" /></span><span className="text-2xl font-black tracking-tight text-slate-900">{value}</span></div><div className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{label}</div><div className="mt-1 text-xs text-slate-400">{detail}</div></div>;
}

function exportWallRiskPdf(form: FormState, rating: Rating, photo: WallPhoto | null) {
  const valueRows: Array<[string, string]> = [
    ["Pit / wall", form.wallName], ["Phase", form.pitPhase], ["Area", form.area], ["Operation", form.operation], ["Inspector", form.inspectorName], ["Start bench", form.startBench], ["End bench", form.endBench], ["Date", form.inspectionDate],
    ["Berm width", form.bermWidth], ["Slope height", form.slopeHeight], ["Slope angle", form.slopeAngle], ["Month-to-date rainfall", form.monthToDateRainfall], ["Face moisture", form.faceMoistureCondition], ["Ponding", form.ponding], ["Drainage", form.drainage],
    ["Rock mass rating", form.rockMassRating], ["Rock type", form.rockType], ["Joint sets", form.jointSets], ["Structural type", form.structuralType], ["Joint continuity", form.jointContinuity], ["Infill", form.infilling], ["Rock mass characterization", form.rockMassCharacterization],
    ["Mapping density", form.mappingDensity], ["IRS data", form.irsData], ["Geotech drilling program", form.geotechDrillingProgram], ["Geotechnical analysis", form.geotechnicalAnalysis], ["Potential failure mechanism", form.potentialFailureMechanism], ["Factor of safety", form.factorOfSafety], ["Failure history", form.failureHistory], ["Probability of failure", form.probabilityOfFailure], ["Orientation", form.orientation],
    ["Face cleaning method", form.faceCleaningMethod], ["Berm condition", form.bermCondition], ["Rock face description", form.rockFaceDescription], ["Loose materials / hanging block", form.looseMaterials], ["Limit blasting method", form.limitBlastingMethod], ["Wall damage", form.wallDamage], ["Presplit barrels visible", form.presplitBarrelsVisible], ["Crest backbreak", form.crestBackbreak], ["Hard toe", form.hardToe], ["Structural planes visible", form.structuralPlanesVisible],
    ["Monitoring method", form.monitoringMethod], ["Monitoring frequency", form.monitoringFrequency], ["Analysis", form.analysis], ["Cumulative displacement", form.cumulativeDisplacement], ["Velocity", form.velocity], ["Inspector comments", form.notes],
  ];
  const table = (headers: string[], rows: unknown[][]) => `<table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(String(value ?? "—"))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const completedRows = valueRows.filter(([, value]) => value.trim()).map(([label, value]) => [label, value]);
  const categoryRows = rating.categoryScores.map(item => [item.category, item.score.toFixed(2), `${Math.round(item.weight * 100)}%`, item.contribution.toFixed(2), item.basis.join("; ")]);
  const photoHtml = photo ? `<h2>Slope photograph</h2><figure><img src="${photo.dataUrl}" alt="${escapeHtml(photo.name)}" /><figcaption>${escapeHtml(photo.name)}</figcaption></figure>` : "";
  const body = `<h1>Wall Risk Classification — Inspection Sheet</h1>${photoHtml}<h2>Inspection details and observations</h2>${table(["Field", "Recorded value"], completedRows)}<h2>Category ratings</h2>${table(["Category", "Rating / 10", "Weight", "Contribution", "Basis"], categoryRows)}<h2>Overall Risk Rating</h2>${table(["Score", "Class", "Colour", "Action"], [[rating.overallScore.toFixed(2), rating.riskClass, rating.riskColour, rating.actionPriority]])}<h2>Recommendations</h2><ul>${rating.recommendations.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p><strong>Data completeness:</strong> ${rating.dataCompleteness}%</p><p><strong>Method:</strong> ${escapeHtml(rating.method)}</p>`;
  exportRecordAsPdf(`${form.wallName || "Wall"} — Risk Inspection`, body);
}

export default function WallRiskClassification() {
  const [form, setForm] = useState<FormState>(blankForm);
  const [rating, setRating] = useState<Rating | null>(null);
  const [wallPhoto, setWallPhoto] = useState<WallPhoto | null>(null);
  const records = trpc.monitoring.list.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.monitoring.create.useMutation({ onSuccess: response => { setRating(response.risk as Rating); utils.monitoring.list.invalidate(); toast.success("Wall rating saved"); }, onError: error => toast.error(error.message) });
  const remove = trpc.monitoring.delete.useMutation({ onSuccess: () => utils.monitoring.list.invalidate(), onError: error => toast.error(error.message) });
  const setField = (field: FieldName, value: string) => setForm(previous => ({ ...previous, [field]: value }));
  const handleWallPhoto = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast.error("Please select a JPEG, PNG or WebP slope photo");
    if (file.size > 12 * 1024 * 1024) return toast.error("Slope photo must be smaller than 12 MB");
    const reader = new FileReader();
    reader.onload = () => setWallPhoto({ name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => toast.error("Could not read the slope photo");
    reader.readAsDataURL(file);
  };
  const score = (category: string) => rating?.categoryScores.find(item => item.category === category)?.score;
  const summary = useMemo(() => { const rows = records.data ?? []; return { total: rows.length, alerts: rows.filter(row => ["High", "Critical"].includes(row.riskLevel)).length }; }, [records.data]);
  const save = () => {
    if (!form.wallName.trim()) return toast.error("Pit / wall name is required");
    const numericFields = ["bermWidth", "slopeHeight", "slopeAngle", "monthToDateRainfall", "rockMassRating", "jointSets", "factorOfSafety", "probabilityOfFailure", "cumulativeDisplacement", "velocity"] as const;
    const numeric = Object.fromEntries(numericFields.map(field => [field, toNumber(form[field])]));
    create.mutate({ ...form, ...numeric, zone: form.zone || undefined, status: form.status as "Active" | "Monitored" | "Remediated" | "Closed", pitPhase: form.pitPhase || undefined, area: form.area || undefined, operation: form.operation || undefined, inspectorName: form.inspectorName || undefined, startBench: form.startBench || undefined, endBench: form.endBench || undefined, inspectionDate: form.inspectionDate || undefined, notes: form.notes || undefined } as unknown as Parameters<typeof create.mutate>[0]);
  };

  return <div className="container max-w-[1500px] py-8">
    <ModuleHeader index="09" title="Wall Risk Classification" description="A structured field workflow for recording wall conditions, reviewing controls and classifying the overall geotechnical risk from 0 to 10." />

    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
      <div className="h-1.5 bg-gradient-to-r from-[#d71920] via-[#ef4444] to-[#111827]" />
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b3131a]">Inspection setup</div><h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Wall inspection profile</h2><p className="mt-1 text-xs text-slate-500">Identify the wall and define the inspection context before rating conditions.</p></div>
        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600"><CalendarDays className="h-4 w-4 text-[#d71920]" /> Field record · {form.inspectionDate || "No date"}</div>
      </div>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 xl:p-6">
        <Field form={form} field="wallName" label="Pit / wall" setField={setField} className="xl:col-span-2" />
        <Field form={form} field="pitPhase" label="Phase" setField={setField} />
        <Field form={form} field="area" label="Area" setField={setField} />
        <Field form={form} field="inspectorName" label="Inspector" setField={setField} className="xl:col-span-2" />
        <Field form={form} field="inspectionDate" label="Date" setField={setField} />
        <Field form={form} field="operation" label="Operation" setField={setField} className="sm:col-span-2 xl:col-span-2" />
        <Field form={form} field="startBench" label="Start bench" setField={setField} />
        <Field form={form} field="endBench" label="End bench" setField={setField} />
        <SelectField form={form} field="status" label="Record status" options={["Active", "Monitored", "Remediated", "Closed"]} setField={setField} className="sm:col-span-2 xl:col-span-3" />
      </div>
      <div className="border-t border-slate-100 bg-slate-50/45 px-5 py-4 xl:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#d71920]/10 text-[#b3131a]"><ImagePlus className="h-4 w-4" /></span><div><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b3131a]">Slope photograph</div><p className="mt-1 text-xs text-slate-500">Attach one site photo to support the inspection record and PDF export.</p></div></div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-[#d71920] hover:text-[#b3131a]"><Upload className="mr-2 h-3.5 w-3.5" />{wallPhoto ? "Replace photo" : "Add slope photo"}<Input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { handleWallPhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
        </div>
        {wallPhoto && <div className="relative mt-4 max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-slate-900"><img src={wallPhoto.dataUrl} alt={wallPhoto.name} className="max-h-72 w-full object-contain" /><div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-slate-950/75 px-3 py-2 text-xs text-white"><span className="truncate">{wallPhoto.name}</span><button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-semibold text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setWallPhoto(null)}><X className="h-3.5 w-3.5" />Remove</button></div></div>}
      </div>
    </section>

    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Saved inspections" value={String(summary.total)} detail="Historical wall records" icon={ClipboardCheck} />
      <MetricCard label="High / critical" value={String(summary.alerts)} detail="Records requiring attention" icon={TriangleAlert} tone={summary.alerts ? "red" : "slate"} />
      <MetricCard label="Current workflow" value={rating ? "Scored" : "Draft"} detail={rating ? `${rating.riskClass} · ${rating.overallScore.toFixed(2)} / 10` : "Complete fields and rate the wall"} icon={Activity} tone={rating ? "amber" : "slate"} />
      <MetricCard label="Risk scale" value="0–10" detail="Weighted category assessment" icon={Gauge} />
    </div>

    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
      <span className="mr-1 text-slate-700">Field condition guide</span>
      <span className="flex items-center gap-1.5 text-emerald-700"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Favorable</span>
      <span className="flex items-center gap-1.5 text-amber-700"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Watch</span>
      <span className="flex items-center gap-1.5 text-red-700"><span className="h-2.5 w-2.5 rounded-full bg-red-600" />Critical</span>
      <span className="ml-auto font-normal normal-case tracking-normal text-slate-400">Colors update as values are entered.</span>
    </div>

    <div className="mt-8 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
      <div className="space-y-7">
        <div><GroupHeader eyebrow="01 · Geotechnical context" title="Technical parameters" description="Capture slope geometry, water conditions and rock mass behaviour." />
          <div className="space-y-4">
            <SheetSection title="Slope design aspects" score={score("Technical")} icon={Layers3}><Field form={form} field="bermWidth" label="Berm width" numeric setField={setField} /><Field form={form} field="slopeHeight" label="Slope height" numeric setField={setField} /><Field form={form} field="slopeAngle" label="Slope angle" numeric setField={setField} /></SheetSection>
            <SheetSection title="Water management" score={score("Water")} icon={Droplets}><Field form={form} field="monthToDateRainfall" label="Month-to-date rainfall" numeric setField={setField} /><SelectField form={form} field="faceMoistureCondition" label="Face moisture condition" options={["Dry", "Damp", "Wet", "Flow", "Saturated"]} setField={setField} /><SelectField form={form} field="ponding" label="Ponding" options={["No water", "Minor ponding", "Water present", "Severe ponding"]} setField={setField} /><SelectField form={form} field="drainage" label="Drainage" options={["Good", "Adequate", "Partial", "Poor", "Blocked", "None"]} setField={setField} /></SheetSection>
            <SheetSection title="Rock mass description" score={score("Rock Mass")} icon={Layers3}><Field form={form} field="rockMassRating" label="Rock mass rating" numeric setField={setField} /><Field form={form} field="rockType" label="Rock type" setField={setField} /><Field form={form} field="jointSets" label="Joint sets" numeric setField={setField} /><Field form={form} field="structuralType" label="Structural type" setField={setField} /><Field form={form} field="jointContinuity" label="Joint continuity" setField={setField} /><Field form={form} field="infilling" label="Infill" setField={setField} /><div className="sm:col-span-2"><Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Rock mass characterization</Label><Textarea className="mt-1.5 rounded-lg border-slate-200 bg-slate-50/70 text-sm shadow-none focus:border-[#d71920] focus:ring-[#d71920]/20" rows={3} value={form.rockMassCharacterization} onChange={event => setField("rockMassCharacterization", event.target.value)} /></div></SheetSection>
          </div>
        </div>

        <div><GroupHeader eyebrow="02 · Assessment basis" title="Geotechnical interpretation" description="Document the available data and identify the likely failure mechanism." />
          <div className="space-y-4">
            <SheetSection title="Geotechnical data" score={score("Geotechnical")} icon={MapPinned}><SelectField form={form} field="mappingDensity" label="Mapping density" options={["Complete / high", "Moderate", "Low", "None"]} setField={setField} /><SelectField form={form} field="irsData" label="IRS data" options={["Available / complete", "Partial", "Missing", "None"]} setField={setField} /><SelectField form={form} field="geotechDrillingProgram" label="Geotech drilling program" options={["Complete", "Active", "Planned", "Partial", "None"]} setField={setField} /><Field form={form} field="factorOfSafety" label="Factor of safety" numeric setField={setField} /><div className="sm:col-span-2"><Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Geotechnical analysis</Label><Textarea className="mt-1.5 rounded-lg border-slate-200 bg-slate-50/70 text-sm shadow-none focus:border-[#d71920] focus:ring-[#d71920]/20" rows={3} value={form.geotechnicalAnalysis} onChange={event => setField("geotechnicalAnalysis", event.target.value)} /></div></SheetSection>
            <SheetSection title="Failure potential" score={score("Failure Potential")} icon={TriangleAlert}><SelectField form={form} field="potentialFailureMechanism" label="Potential failure mechanism" options={["No failure", "Planar", "Wedge", "Toppling", "Circular", "Multiple mechanisms"]} setField={setField} /><SelectField form={form} field="failureHistory" label="Failure history" options={["No failure", "Old", "Minor", "Recent", "Active"]} setField={setField} /><Field form={form} field="probabilityOfFailure" label="Probability of failure (%)" numeric setField={setField} /><SelectField form={form} field="orientation" label="Orientation" options={["Favourable / stable", "Neutral", "Dip of critical set > slope", "Daylight / unfavourable"]} setField={setField} /></SheetSection>
          </div>
        </div>
      </div>

      <div className="space-y-7 xl:sticky xl:top-6">
        <div><GroupHeader eyebrow="03 · Operational controls" title="Field observations" description="Record ground condition, blast quality and monitoring coverage." />
          <div className="space-y-4">
            <SheetSection title="Fall of ground potential" score={score("Fall of Ground")} icon={TriangleAlert}><SelectField form={form} field="faceCleaningMethod" label="Face cleaning method" options={["Scale with shovel & scaling rig/backhoe", "Scaled", "Partial", "None"]} setField={setField} /><SelectField form={form} field="bermCondition" label="Berm condition" options={["Good", "Adequate", "Fair", "Poor", "No berm"]} setField={setField} /><SelectField form={form} field="rockFaceDescription" label="Rock face description" options={["Massive", "Competent", "Blocky", "Fractured", "Loose", "Unstable"]} setField={setField} /><SelectField form={form} field="looseMaterials" label="Loose materials / hanging block" options={["No", "Minor", "Yes", "Hanging block"]} setField={setField} /><div className="sm:col-span-2"><Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Inspector comments</Label><Textarea className="mt-1.5 rounded-lg border-slate-200 bg-slate-50/70 text-sm shadow-none focus:border-[#d71920] focus:ring-[#d71920]/20" rows={3} value={form.notes} onChange={event => setField("notes", event.target.value)} /></div></SheetSection>
            <SheetSection title="Blasting performance" score={score("Blasting")} icon={Waves}><SelectField form={form} field="limitBlastingMethod" label="Limit blasting method" options={["Presplit", "Trim", "Buffer", "Controlled", "Production", "None"]} setField={setField} /><SelectField form={form} field="wallDamage" label="Wall damage" options={["No", "Minor", "Yes", "Severe"]} setField={setField} /><SelectField form={form} field="presplitBarrelsVisible" label="Presplit barrels visible" options={["70–80% visible", "Partial", "No"]} setField={setField} /><SelectField form={form} field="crestBackbreak" label="Crest backbreak" options={["No", "Minor", "Yes", "Severe"]} setField={setField} /><SelectField form={form} field="hardToe" label="Hard toe" options={["No", "Minor", "Yes", "Severe"]} setField={setField} /><SelectField form={form} field="structuralPlanesVisible" label="Structural planes visible" options={["No", "Minor", "Yes"]} setField={setField} /></SheetSection>
            <SheetSection title="Monitoring" score={score("Monitoring")} icon={Activity}><SelectField form={form} field="monitoringMethod" label="Monitoring method" options={["IDS Radar", "Prism", "Survey", "Visual", "None"]} setField={setField} /><SelectField form={form} field="monitoringFrequency" label="Monitoring frequency" options={["24h/24h", "Daily", "Weekly", "Monthly", "None"]} setField={setField} /><SelectField form={form} field="analysis" label="Analysis" options={["Stable / normal", "Increasing", "Accelerating", "Critical"]} setField={setField} /><Field form={form} field="cumulativeDisplacement" label="Cumulative displacement" numeric setField={setField} /><Field form={form} field="velocity" label="Velocity" numeric setField={setField} /></SheetSection>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]"><div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#d71920]/10 text-[#b3131a]"><ShieldAlert className="h-4 w-4" /></span><div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b3131a]">Decision support</div><h2 className="mt-0.5 text-base font-bold text-slate-900">Overall risk rating</h2></div></div><div className="space-y-4 p-5"><RatingBadge rating={rating} />{rating && <Button variant="outline" className="h-10 w-full rounded-lg border-slate-300 text-sm font-semibold hover:border-slate-900 hover:bg-slate-50" onClick={() => exportWallRiskPdf(form, rating, wallPhoto)}><FileDown className="mr-2 h-4 w-4" />Export completed inspection PDF</Button>}<div><Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recommendation</Label><Textarea className="mt-1.5 rounded-lg border-slate-200 bg-slate-50/70 text-sm shadow-none focus:border-[#d71920] focus:ring-[#d71920]/20" rows={4} readOnly value={rating ? `${rating.actionPriority}\n${rating.recommendations.join(" ")}` : ""} placeholder="The recommended action will appear after scoring." /></div><Button className="h-12 w-full rounded-lg bg-[#d71920] text-sm font-bold uppercase tracking-[0.08em] text-white shadow-lg shadow-red-900/10 transition-all hover:bg-[#b3131a] hover:shadow-red-900/20 active:scale-[0.98]" disabled={create.isPending} onClick={save}><Save className="mr-2 h-4 w-4" />{create.isPending ? "Rating…" : "Rate and save wall inspection"}</Button></div></section>
      </div>
    </div>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]"><div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><SectionLabel>Risk rating scale</SectionLabel><span className="font-mono text-[11px] text-slate-500">{summary.total} saved · {summary.alerts} high/critical</span></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-xs"><thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500"><th className="px-5 py-3">Rating</th><th className="px-5 py-3">Class</th><th className="px-5 py-3">Colour</th><th className="px-5 py-3">Required action</th></tr></thead><tbody>{ratingRows.map(row => <tr key={row[1]} className={`border-b border-slate-100 ${colourClass(row[2])}`}><td className="px-5 py-3 font-mono font-semibold">{row[0]}</td><td className="px-5 py-3 font-bold">{row[1]}</td><td className="px-5 py-3">{row[2]}</td><td className="px-5 py-3">{row[3]}</td></tr>)}</tbody></table></div></section>

    <section className="mt-8"><div className="flex items-center justify-between"><SectionLabel>Saved wall inspection ratings</SectionLabel><span className="text-xs text-slate-400">Latest records</span></div><div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead className="border-b border-slate-200 bg-slate-50/80"><tr className="text-left text-[10px] uppercase tracking-[0.12em] text-slate-500"><th className="px-5 py-3">Wall</th><th className="px-5 py-3">Rating</th><th className="px-5 py-3">Colour</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Date</th><th className="px-5 py-3" /></tr></thead><tbody>{(records.data ?? []).map(record => <tr key={record.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/70"><td className="px-5 py-4 font-bold text-slate-900">{record.wallName}<div className="mt-0.5 text-slate-400">{record.area || record.zone || "—"}</div></td><td className="px-5 py-4"><span className="font-semibold text-slate-800">{record.riskClass || record.riskLevel}</span><div className="mt-0.5 font-mono text-slate-400">{record.riskScore?.toFixed(2) ?? "—"}/10</div></td><td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${colourClass(record.riskColour)}`}>{record.riskColour || "—"}</span></td><td className="max-w-[360px] px-5 py-4 text-slate-600">{record.actionPriority || "—"}</td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{record.inspectionDate || new Date(record.createdAt).toLocaleDateString()}</td><td className="px-5 py-4 text-right"><Button variant="ghost" size="sm" className="rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700" onClick={() => remove.mutate({ id: record.id })}><Trash2 className="h-4 w-4" /></Button></td></tr>)}{!(records.data ?? []).length && <tr><td colSpan={6} className="p-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-slate-300" /><div className="mt-3 font-semibold text-slate-600">No wall inspections saved</div><div className="mt-1 text-xs text-slate-400">Completed ratings will appear here.</div></td></tr>}</tbody></table></div></div></section>
  </div>;
}
