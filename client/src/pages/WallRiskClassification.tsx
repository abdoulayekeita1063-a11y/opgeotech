import { useMemo, useState } from "react";
import { Activity, Gauge, Save, ShieldAlert, Trash2 } from "lucide-react";
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
  wallAssessmentScore: "",
  blastAssessmentScore: "",
  ucs: "",
  cohesion: "",
  frictionAngle: "",
  density: "",
  dominantStructures: "",
  notes: "",
};

type MonitoringForm = typeof blankForm;

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

export default function WallRiskClassification() {
  const [form, setForm] = useState<MonitoringForm>(blankForm);
  const records = trpc.monitoring.list.useQuery();
  const utils = trpc.useUtils();
  const createRecord = trpc.monitoring.create.useMutation({
    onSuccess: async () => {
      await utils.monitoring.list.invalidate();
      setForm(blankForm);
      toast.success("Wall risk classification saved");
    },
    onError: error => toast.error(error.message),
  });
  const deleteRecord = trpc.monitoring.delete.useMutation({
    onSuccess: async () => {
      await utils.monitoring.list.invalidate();
      toast.success("Wall risk classification removed");
    },
    onError: error => toast.error(error.message),
  });

  const summary = useMemo(() => {
    const rows = records.data ?? [];
    const active = rows.filter(row => row.status === "Active" || row.status === "Monitored").length;
    const alerts = rows.filter(row => row.riskLevel === "High" || row.riskLevel === "Critical").length;
    return { total: rows.length, active, alerts };
  }, [records.data]);

  const setField = (field: keyof MonitoringForm, value: string) => {
    setForm(previous => ({ ...previous, [field]: value }));
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
      wallAssessmentScore: optionalNumber(form.wallAssessmentScore),
      blastAssessmentScore: optionalNumber(form.blastAssessmentScore),
      ucs: optionalNumber(form.ucs),
      cohesion: optionalNumber(form.cohesion),
      frictionAngle: optionalNumber(form.frictionAngle),
      density: optionalNumber(form.density),
      dominantStructures: form.dominantStructures.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <div className="container py-10">
      <ModuleHeader
        index="09"
        title="Wall Risk Classification"
        description="Classify exposed open-pit walls by geotechnical baseline, risk level, wall assessment and field observations."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mt-8 mb-10">
        {[
          { label: "Registered walls", value: summary.total, icon: Activity },
          { label: "Active monitoring", value: summary.active, icon: Gauge },
          { label: "High / critical risk", value: summary.alerts, icon: ShieldAlert },
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
                ["wallAssessmentScore", "Wall assessment score", "0–100"],
                ["blastAssessmentScore", "Blast assessment score", "0–100"],
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
                  <tr><td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">No wall records yet. Add the first exposed wall on the left.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="border border-foreground p-4">
              <div className="swiss-label text-[10px] mb-3">Classification scope</div>
              <p className="text-sm text-muted-foreground">Use this register to classify exposed walls and slopes. Radar data entry and analysis are handled independently in Monitoring and its embedded Report workspace.</p>
            </div>
            <div className="border border-foreground p-4">
              <div className="swiss-label text-[10px] mb-3">Risk convention</div>
              <p className="text-sm text-muted-foreground">Critical and High records are highlighted for review. Confirm thresholds and response actions against your site ground control management plan.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
