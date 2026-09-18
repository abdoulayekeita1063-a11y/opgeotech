import { useMemo, useState, type ReactNode } from "react";
import { FileText, Save, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { trpc } from "@/lib/trpc";

const blankForm = {
  wallName: "", pitPhase: "", area: "", operation: "", inspectorName: "", startBench: "", endBench: "", inspectionDate: new Date().toISOString().slice(0, 10), zone: "", status: "Active",
  bermWidth: "", slopeHeight: "", slopeAngle: "", monthToDateRainfall: "", faceMoistureCondition: "", ponding: "", drainage: "",
  rockMassRating: "", jointSets: "", jointContinuity: "", rockType: "", structuralType: "", infilling: "", rockMassCharacterization: "",
  mappingDensity: "", irsData: "", geotechDrillingProgram: "", geotechnicalAnalysis: "", potentialFailureMechanism: "", factorOfSafety: "", failureHistory: "", probabilityOfFailure: "", orientation: "",
  faceCleaningMethod: "", bermCondition: "", rockFaceDescription: "", looseMaterials: "",
  limitBlastingMethod: "", wallDamage: "", presplitBarrelsVisible: "", crestBackbreak: "", hardToe: "", structuralPlanesVisible: "",
  monitoringMethod: "", monitoringFrequency: "", cumulativeDisplacement: "", analysis: "", velocity: "", notes: "",
};

type FormState = typeof blankForm;
type FieldName = keyof FormState;

type RiskResult = { overallScore: number; riskLevel: string; actionPriority: string; recommendations: string[]; dataCompleteness: number; categoryScores: Array<{ category: string; score: number; weight: number; contribution: number; basis: string[] }>; method: string };

function riskClass(level: string) {
  if (level === "Critical") return "bg-black text-white";
  if (level === "High") return "bg-[#d71920] text-white";
  if (level === "Moderate") return "bg-[#16803c] text-white";
  return "bg-[#e8f0ff] text-[#204b91]";
}

function toNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function RiskBadge({ level }: { level: string }) {
  return <span className={`inline-flex px-2 py-1 text-[10px] font-bold uppercase ${riskClass(level)}`}>{level}</span>;
}

function TextField({ form, field, label, numeric, placeholder, setField }: { form: FormState; field: FieldName; label: string; numeric?: boolean; placeholder?: string; setField: (field: FieldName, value: string) => void }) {
  return <div><Label className="swiss-label text-[10px]">{label}</Label><Input type={numeric ? "number" : "text"} className="rounded-none border-foreground mt-1" placeholder={placeholder} value={form[field]} onChange={event => setField(field, event.target.value)} /></div>;
}

function SelectField({ form, field, label, options, setField }: { form: FormState; field: FieldName; label: string; options: string[]; setField: (field: FieldName, value: string) => void }) {
  return <div><Label className="swiss-label text-[10px]">{label}</Label><select className="flex h-10 w-full rounded-none border border-foreground bg-background px-3 py-2 text-sm mt-1" value={form[field]} onChange={event => setField(field, event.target.value)}><option value="">Select…</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></div>;
}

function Category({ title, children, score }: { title: string; children: ReactNode; score?: number }) {
  return <section className="border-t-2 border-foreground pt-3"><div className="flex items-center justify-between gap-3"><SectionLabel>{title}</SectionLabel>{score !== undefined && <span className="font-mono text-xs font-bold">{score.toFixed(2)} / 10</span>}</div><div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">{children}</div></section>;
}

export default function WallRiskClassification() {
  const [form, setForm] = useState<FormState>(blankForm);
  const [result, setResult] = useState<RiskResult | null>(null);
  const records = trpc.monitoring.list.useQuery();
  const utils = trpc.useUtils();
  const createRecord = trpc.monitoring.create.useMutation({
    onSuccess: async response => { setResult(response.risk as RiskResult); await utils.monitoring.list.invalidate(); setForm({ ...blankForm, inspectionDate: new Date().toISOString().slice(0, 10) }); toast.success("Wall inspection and risk classification saved"); },
    onError: error => toast.error(error.message),
  });
  const deleteRecord = trpc.monitoring.delete.useMutation({ onSuccess: () => utils.monitoring.list.invalidate(), onError: error => toast.error(error.message) });

  const setField = (field: FieldName, value: string) => setForm(previous => ({ ...previous, [field]: value }));
  const summary = useMemo(() => { const rows = records.data ?? []; return { total: rows.length, active: rows.filter(row => row.status === "Active" || row.status === "Monitored").length, alerts: rows.filter(row => row.riskLevel === "High" || row.riskLevel === "Critical").length }; }, [records.data]);

  const submit = () => {
    if (!form.wallName.trim()) return toast.error("Wall name is required");
    createRecord.mutate({
      wallName: form.wallName.trim(), zone: form.zone.trim() || undefined, status: form.status as "Active" | "Monitored" | "Remediated" | "Closed",
      pitPhase: form.pitPhase || undefined, area: form.area || undefined, operation: form.operation || undefined, inspectorName: form.inspectorName || undefined, startBench: form.startBench || undefined, endBench: form.endBench || undefined, inspectionDate: form.inspectionDate || undefined,
      bermWidth: toNumber(form.bermWidth), slopeHeight: toNumber(form.slopeHeight), slopeAngle: toNumber(form.slopeAngle), monthToDateRainfall: toNumber(form.monthToDateRainfall), faceMoistureCondition: form.faceMoistureCondition || undefined, ponding: form.ponding || undefined, drainage: form.drainage || undefined,
      rockMassRating: toNumber(form.rockMassRating), jointSets: toNumber(form.jointSets), jointContinuity: form.jointContinuity || undefined, rockType: form.rockType || undefined, structuralType: form.structuralType || undefined, infilling: form.infilling || undefined, rockMassCharacterization: form.rockMassCharacterization || undefined,
      mappingDensity: form.mappingDensity || undefined, irsData: form.irsData || undefined, geotechDrillingProgram: form.geotechDrillingProgram || undefined, geotechnicalAnalysis: form.geotechnicalAnalysis || undefined, potentialFailureMechanism: form.potentialFailureMechanism || undefined, factorOfSafety: toNumber(form.factorOfSafety), failureHistory: form.failureHistory || undefined, probabilityOfFailure: toNumber(form.probabilityOfFailure), orientation: form.orientation || undefined,
      faceCleaningMethod: form.faceCleaningMethod || undefined, bermCondition: form.bermCondition || undefined, rockFaceDescription: form.rockFaceDescription || undefined, looseMaterials: form.looseMaterials || undefined,
      limitBlastingMethod: form.limitBlastingMethod || undefined, wallDamage: form.wallDamage || undefined, presplitBarrelsVisible: form.presplitBarrelsVisible || undefined, crestBackbreak: form.crestBackbreak || undefined, hardToe: form.hardToe || undefined, structuralPlanesVisible: form.structuralPlanesVisible || undefined,
      monitoringMethod: form.monitoringMethod || undefined, monitoringFrequency: form.monitoringFrequency || undefined, cumulativeDisplacement: toNumber(form.cumulativeDisplacement), analysis: form.analysis || undefined, velocity: toNumber(form.velocity), notes: form.notes.trim() || undefined,
    });
  };

  return <div className="container py-10">
    <ModuleHeader index="09" title="Wall Risk Classification" description="Open-pit wall inspection based on the supplied template: eight operational categories, transparent weighted scoring and actionable risk controls." />
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-8 mb-10">{[{ label: "Inspection records", value: summary.total }, { label: "Active / monitored", value: summary.active }, { label: "High / critical", value: summary.alerts }].map(item => <div key={item.label} className="border border-foreground p-4 min-h-[90px]"><ShieldAlert className="h-4 w-4 text-primary mb-4" /><div className="text-2xl font-bold">{item.value}</div><div className="swiss-label text-[10px] mt-2">{item.label}</div></div>)}</div>

    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)] gap-8 items-start">
      <section className="space-y-8">
        <Category title="Operational identifiers"><TextField form={form} field="wallName" label="Wall / slope name *" placeholder="Fekola East Wall 90-80 RL" setField={setField} /><TextField form={form} field="pitPhase" label="Pit phase" setField={setField} /><TextField form={form} field="area" label="Area" setField={setField} /><TextField form={form} field="operation" label="Operation" setField={setField} /><TextField form={form} field="inspectorName" label="Inspector" setField={setField} /><TextField form={form} field="startBench" label="Start bench" setField={setField} /><TextField form={form} field="endBench" label="End bench" setField={setField} /><TextField form={form} field="inspectionDate" label="Date" setField={setField} /><SelectField form={form} field="status" label="Inspection status" options={["Active", "Monitored", "Remediated", "Closed"]} setField={setField} /></Category>

        <Category title="Technical parameters — slope design"><TextField form={form} field="bermWidth" label="Berm width / achievement" numeric placeholder="m or %" setField={setField} /><TextField form={form} field="slopeHeight" label="Slope height" numeric placeholder="m" setField={setField} /><TextField form={form} field="slopeAngle" label="Slope angle" numeric placeholder="degrees" setField={setField} /></Category>
        <Category title="Water management"><TextField form={form} field="monthToDateRainfall" label="Month-to-date rainfall" numeric placeholder="mm" setField={setField} /><SelectField form={form} field="faceMoistureCondition" label="Face moisture condition" options={["Dry", "Damp", "Wet", "Flow", "Saturated"]} setField={setField} /><SelectField form={form} field="ponding" label="Ponding" options={["No water", "Minor ponding", "Water present", "Severe ponding"]} setField={setField} /><SelectField form={form} field="drainage" label="Drainage" options={["Good", "Adequate", "Partial", "Poor", "Blocked", "None"]} setField={setField} /></Category>
        <Category title="Rock mass description"><TextField form={form} field="rockMassRating" label="Rock mass rating" numeric placeholder="0–100" setField={setField} /><TextField form={form} field="jointSets" label="Joint sets" numeric setField={setField} /><TextField form={form} field="jointContinuity" label="Joint continuity" setField={setField} /><TextField form={form} field="rockType" label="Rock type" placeholder="CHP, fresh rock…" setField={setField} /><TextField form={form} field="structuralType" label="Structural type" placeholder="Joint / fault" setField={setField} /><TextField form={form} field="infilling" label="Infilling" placeholder="Clay / clean" setField={setField} /><div className="col-span-2 md:col-span-3"><Label className="swiss-label text-[10px]">Rock mass characterization</Label><Textarea className="rounded-none border-foreground mt-1" rows={2} value={form.rockMassCharacterization} onChange={event => setField("rockMassCharacterization", event.target.value)} /></div></Category>
        <Category title="Geotechnical data"><SelectField form={form} field="mappingDensity" label="Mapping density" options={["Complete / high", "Moderate", "Low", "None"]} setField={setField} /><SelectField form={form} field="irsData" label="IRS data" options={["Available / complete", "Partial", "Missing", "None"]} setField={setField} /><SelectField form={form} field="geotechDrillingProgram" label="Geotech drilling program" options={["Complete", "Active", "Planned", "Partial", "None"]} setField={setField} /><TextField form={form} field="factorOfSafety" label="Factor of safety" numeric placeholder="FS" setField={setField} /><div className="col-span-2 md:col-span-3"><Label className="swiss-label text-[10px]">Geotechnical analysis</Label><Textarea className="rounded-none border-foreground mt-1" rows={2} value={form.geotechnicalAnalysis} onChange={event => setField("geotechnicalAnalysis", event.target.value)} /></div></Category>
        <Category title="Failure potential"><SelectField form={form} field="potentialFailureMechanism" label="Potential failure mechanism" options={["No failure", "Planar", "Wedge", "Toppling", "Circular", "Multiple mechanisms"]} setField={setField} /><SelectField form={form} field="failureHistory" label="Failure history" options={["No failure", "Old", "Minor", "Recent", "Active"]} setField={setField} /><TextField form={form} field="probabilityOfFailure" label="Probability of failure" numeric placeholder="%" setField={setField} /><SelectField form={form} field="orientation" label="Structure orientation" options={["Favourable / stable", "Neutral", "Daylight / unfavourable"]} setField={setField} /></Category>
        <Category title="Fall of ground potential"><SelectField form={form} field="faceCleaningMethod" label="Face cleaning method" options={["Scaled with washing", "Scaled", "Partial", "None"]} setField={setField} /><SelectField form={form} field="bermCondition" label="Berm condition" options={["Good", "Adequate", "Fair", "Poor", "No berm"]} setField={setField} /><SelectField form={form} field="rockFaceDescription" label="Rock face description" options={["Massive / competent", "Blocky", "Fractured", "Loose", "Unstable"]} setField={setField} /><SelectField form={form} field="looseMaterials" label="Loose materials / hanging block" options={["No", "Minor", "Yes", "Hanging block"]} setField={setField} /></Category>
        <Category title="Blasting performance"><SelectField form={form} field="limitBlastingMethod" label="Limit blasting method" options={["Presplit", "Trim", "Buffer", "Controlled", "Production", "None"]} setField={setField} /><SelectField form={form} field="wallDamage" label="Wall damage" options={["No", "Minor", "Yes", "Severe"]} setField={setField} /><SelectField form={form} field="presplitBarrelsVisible" label="Presplit barrels visible" options={["70–80% visible", "Partial", "No"]} setField={setField} /><SelectField form={form} field="crestBackbreak" label="Crest backbreak" options={["No", "Minor", "Yes", "Severe"]} setField={setField} /><SelectField form={form} field="hardToe" label="Hard toe" options={["No", "Minor", "Yes", "Severe"]} setField={setField} /><SelectField form={form} field="structuralPlanesVisible" label="Structural planes visible" options={["No", "Minor", "Yes"]} setField={setField} /></Category>
        <Category title="Monitoring"><SelectField form={form} field="monitoringMethod" label="Monitoring method" options={["IDS Radar", "Prism", "Survey", "Visual", "None"]} setField={setField} /><SelectField form={form} field="monitoringFrequency" label="Monitoring frequency" options={["24h/24h", "Daily", "Weekly", "Monthly", "None"]} setField={setField} /><TextField form={form} field="cumulativeDisplacement" label="Cumulative displacement" numeric placeholder="mm" setField={setField} /><TextField form={form} field="velocity" label="Velocity" numeric placeholder="mm/day" setField={setField} /><SelectField form={form} field="analysis" label="Analysis" options={["Stable / normal", "Increasing", "Accelerating", "Critical"]} setField={setField} /></Category>
        <div><Label className="swiss-label text-[10px]">Comments / recommendations from inspector</Label><Textarea className="rounded-none border-foreground mt-1" rows={4} value={form.notes} onChange={event => setField("notes", event.target.value)} /></div>
        <Button className="w-full rounded-none font-bold uppercase tracking-wider" disabled={createRecord.isPending} onClick={submit}><Save className="h-4 w-4 mr-2" />{createRecord.isPending ? "Scoring and saving…" : "Score and save inspection"}</Button>
      </section>

      <aside className="xl:sticky xl:top-6 space-y-6">
        <section className="border-2 border-foreground p-5"><SectionLabel>Risk output</SectionLabel>{result ? <div className="mt-5 space-y-5"><div className="flex items-end justify-between gap-4"><div><div className="text-5xl font-black leading-none">{result.overallScore.toFixed(2)}</div><div className="swiss-label text-[10px] mt-2">Weighted score / 10</div></div><RiskBadge level={result.riskLevel} /></div><div className="text-sm font-bold">{result.actionPriority}</div><div className="text-xs text-muted-foreground">{result.dataCompleteness}% of inspection inputs completed</div><div className="space-y-2">{result.categoryScores.map(item => <div key={item.category}><div className="flex justify-between text-xs font-mono"><span>{item.category}</span><span>{item.score.toFixed(2)} · {Math.round(item.weight * 100)}%</span></div><div className="h-2 bg-muted mt-1"><div className="h-2 bg-primary" style={{ width: `${item.score * 10}%` }} /></div></div>)}</div><div><div className="swiss-label text-[10px] mb-2">Recommended actions</div><ul className="list-disc pl-5 text-sm space-y-1">{result.recommendations.map(item => <li key={item}>{item}</li>)}</ul></div><p className="text-[11px] text-muted-foreground border-t border-border pt-3">{result.method} Engineering screening only; confirm all actions with the ground control management plan and competent-person review.</p></div> : <div className="mt-5 text-sm text-muted-foreground">Complete the inspection and select <strong>Score and save inspection</strong> to generate the category breakdown and operational risk output.</div>}</section>
        <section className="border border-foreground p-5"><div className="flex items-center justify-between"><SectionLabel>Risk scale</SectionLabel><FileText className="h-4 w-4" /></div><div className="mt-4 space-y-2 text-xs font-mono"><div>0.00–2.49 · <b className="text-blue-700">LOW</b> · routine controls</div><div>2.50–4.99 · <b className="text-green-700">MODERATE</b> · monitor and treat</div><div>5.00–7.49 · <b className="text-amber-800">HIGH</b> · restrict and control</div><div>7.50–10.00 · <b className="text-red-700">CRITICAL</b> · stop and make safe</div></div></section>
      </aside>
    </div>

    <section className="border-t-2 border-foreground pt-4 mt-12"><div className="flex items-center justify-between"><SectionLabel>Saved inspection register</SectionLabel><span className="font-mono text-xs text-muted-foreground">{summary.total} RECORDS</span></div><div className="border border-foreground mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b border-foreground bg-muted/40"><tr className="text-left"><th className="p-3 swiss-label text-[10px]">Wall / zone</th><th className="p-3 swiss-label text-[10px]">Risk score</th><th className="p-3 swiss-label text-[10px]">Action</th><th className="p-3 swiss-label text-[10px]">Inspector / date</th><th className="p-3" /></tr></thead><tbody className="divide-y divide-border">{(records.data ?? []).map(record => <tr key={record.id} className="align-top"><td className="p-3"><div className="font-bold">{record.wallName}</div><div className="text-xs text-muted-foreground">{record.area || record.zone || "Area not specified"}</div></td><td className="p-3"><RiskBadge level={record.riskLevel} /><div className="font-mono text-xs mt-1">{record.riskScore?.toFixed(2) ?? "—"} / 10</div></td><td className="p-3 text-xs max-w-[360px]">{record.actionPriority || "—"}</td><td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{record.inspectorName || "—"}<br />{record.inspectionDate || new Date(record.createdAt).toLocaleDateString()}</td><td className="p-3 text-right"><Button variant="ghost" size="sm" className="rounded-none text-destructive" aria-label={`Delete ${record.wallName}`} onClick={() => deleteRecord.mutate({ id: record.id })}><Trash2 className="h-4 w-4" /></Button></td></tr>)}{(records.data ?? []).length === 0 && <tr><td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">No pit inspection records yet.</td></tr>}</tbody></table></div></section>
  </div>;
}
