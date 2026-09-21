import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { exportRecordAsPdf, markdownToHtml } from "@/lib/exportPdf";

export default function DailyInspections({ embedded = false }: { embedded?: boolean }) {
  const [form, setForm] = useState({
    title: "",
    inspectionDate: new Date().toISOString().slice(0, 10),
    inspector: "",
    zones: "",
    weather: "",
    observations: "",
    anomalies: "",
    actions: "",
  });
  const [report, setReport] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.inspection.create.useMutation({
    onSuccess: d => {
      setReport(d.generatedReport);
      utils.inspection.list.invalidate();
      toast.success("Inspection report generated");
    },
    onError: e => toast.error(e.message),
  });

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.title.trim()) return toast.error("Please provide a report title");
    if (!form.zones.trim()) return toast.error("Please list the inspected zones");
    if (!form.weather.trim()) return toast.error("Please describe weather conditions");
    if (!form.observations.trim()) return toast.error("Please enter field observations");
    create.mutate({
      title: form.title.trim(),
      inspectionDate: form.inspectionDate,
      inspector: form.inspector.trim() || undefined,
      zones: form.zones.trim(),
      weather: form.weather.trim(),
      observations: form.observations.trim(),
      anomalies: form.anomalies.trim() || undefined,
      actions: form.actions.trim() || undefined,
    });
  };

  return (
    <div className={embedded ? "" : "max-w-6xl mx-auto px-4 py-8"}>
      {!embedded && <ModuleHeader
        index="03"
        title="Daily Inspections"
        description="Enter field data — observations, anomalies, weather, inspected zones — to produce a structured, professionally worded daily geotechnical inspection report."
      />}
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-5 space-y-4">
          <SectionLabel>Field Data</SectionLabel>
          <div>
            <Label className="swiss-label mb-1.5 block">Report title *</Label>
            <Input value={form.title} onChange={set("title")} placeholder="e.g. Daily inspection — East pit" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="swiss-label mb-1.5 block">Date *</Label>
              <Input type="date" value={form.inspectionDate} onChange={set("inspectionDate")} />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">Inspector</Label>
              <Input value={form.inspector} onChange={set("inspector")} placeholder="Name" />
            </div>
          </div>
          <div>
            <Label className="swiss-label mb-1.5 block">Inspected zones *</Label>
            <Input value={form.zones} onChange={set("zones")} placeholder="e.g. East wall benches 1230–1260, ramp 4" />
          </div>
          <div>
            <Label className="swiss-label mb-1.5 block">Weather conditions *</Label>
            <Input value={form.weather} onChange={set("weather")} placeholder="e.g. Light rain overnight, 12 °C, overcast" />
          </div>
          <div>
            <Label className="swiss-label mb-1.5 block">Observations *</Label>
            <Textarea rows={5} value={form.observations} onChange={set("observations")} placeholder="Raw field notes: face conditions, seepage, cracks, rockfall, berm state…" />
          </div>
          <div>
            <Label className="swiss-label mb-1.5 block">Anomalies</Label>
            <Textarea rows={3} value={form.anomalies} onChange={set("anomalies")} placeholder="e.g. New tension crack 15 m behind crest of bench 1250…" />
          </div>
          <div>
            <Label className="swiss-label mb-1.5 block">Recommended actions</Label>
            <Textarea rows={3} value={form.actions} onChange={set("actions")} placeholder="e.g. Install prisms, restrict access below bench 1250…" />
          </div>
          <Button className="w-full font-bold uppercase tracking-wider" disabled={create.isPending} onClick={submit}>
            {create.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating report…
              </>
            ) : (
              "Generate report"
            )}
          </Button>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Generated Report</SectionLabel>
            {report && (
              <Button
                variant="outline"
                size="sm"
                className="font-bold uppercase tracking-wider text-xs"
                onClick={() => exportRecordAsPdf(form.title || "Inspection report", markdownToHtml(report))}
              >
                <FileDown className="h-3.5 w-3.5" /> Export PDF
              </Button>
            )}
          </div>
          {!report && !create.isPending && (
            <div className="border border-dashed border-muted-foreground/40 p-10 text-center text-sm text-muted-foreground">
              The structured report will appear here after generation. All
              reports are saved to the archive.
            </div>
          )}
          {create.isPending && (
            <div className="border border-foreground p-10 flex items-center justify-center gap-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Writing the report…
            </div>
          )}
          {report && !create.isPending && (
            <div className="border border-foreground p-6 prose prose-sm max-w-none">
              <Streamdown>{report}</Streamdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
