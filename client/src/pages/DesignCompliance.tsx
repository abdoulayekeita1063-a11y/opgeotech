import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Item = {
  parameter: string;
  design: number;
  actual: number;
  deviation: number;
  tolerance: number;
  compliant: boolean;
  unit: string;
  severity: "compliant" | "minor" | "major";
};

type Result = {
  compliant: boolean;
  compliancePct: number;
  items: Item[];
  interpretation: string;
};

export default function DesignCompliance() {
  const [form, setForm] = useState({
    title: "",
    zone: "",
    designBenchHeight: "10",
    actualBenchHeight: "10.2",
    designBermWidth: "8",
    actualBermWidth: "7.5",
    designBatterAngle: "70",
    actualBatterAngle: "72",
    toleranceHeight: "0.5",
    toleranceBerm: "1",
    toleranceAngle: "2",
  });
  const [result, setResult] = useState<Result | null>(null);

  const compute = trpc.compliance.compute.useMutation({
    onSuccess: d => {
      setResult(d as Result);
      toast.success("Compliance check completed");
    },
    onError: e => toast.error(e.message),
  });

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.title.trim()) return toast.error("Please provide a check title");
    compute.mutate({
      title: form.title.trim(),
      zone: form.zone.trim() || undefined,
      designBenchHeight: Number(form.designBenchHeight),
      actualBenchHeight: Number(form.actualBenchHeight),
      designBermWidth: Number(form.designBermWidth),
      actualBermWidth: Number(form.actualBermWidth),
      designBatterAngle: Number(form.designBatterAngle),
      actualBatterAngle: Number(form.actualBatterAngle),
      toleranceHeight: Number(form.toleranceHeight),
      toleranceBerm: Number(form.toleranceBerm),
      toleranceAngle: Number(form.toleranceAngle),
    });
  };

  const rows: Array<{ label: string; design: keyof typeof form; actual: keyof typeof form; tol: keyof typeof form }> = [
    { label: "Bench height (m)", design: "designBenchHeight", actual: "actualBenchHeight", tol: "toleranceHeight" },
    { label: "Berm width (m)", design: "designBermWidth", actual: "actualBermWidth", tol: "toleranceBerm" },
    { label: "Batter angle (°)", design: "designBatterAngle", actual: "actualBatterAngle", tol: "toleranceAngle" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ModuleHeader
        index="05"
        title="Design Compliance"
        description="Verify as-built geometry against the mine design: bench height, berm width and batter angle are compared to design values within defined tolerances, producing a compliance verdict."
      />
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-5 space-y-4">
          <SectionLabel>As-Built vs Design</SectionLabel>
          <div>
            <Label className="swiss-label mb-1.5 block">Check title *</Label>
            <Input value={form.title} onChange={set("title")} placeholder="e.g. Bench 1240 — East wall QA" />
          </div>
          <div>
            <Label className="swiss-label mb-1.5 block">Zone / sector</Label>
            <Input value={form.zone} onChange={set("zone")} placeholder="e.g. Phase 2 East" />
          </div>
          <div className="border border-foreground">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground bg-secondary">
                  <th className="px-3 py-2 text-left swiss-label">Parameter</th>
                  <th className="px-3 py-2 swiss-label">Design</th>
                  <th className="px-3 py-2 swiss-label">As-built</th>
                  <th className="px-3 py-2 swiss-label">Tol. ±</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.label} className="border-b border-foreground last:border-b-0">
                    <td className="px-3 py-2 text-xs font-medium">{r.label}</td>
                    <td className="px-2 py-1.5">
                      <Input type="number" step="0.1" className="h-8 swiss-number" value={form[r.design]} onChange={set(r.design)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="number" step="0.1" className="h-8 swiss-number" value={form[r.actual]} onChange={set(r.actual)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="number" step="0.1" className="h-8 swiss-number" value={form[r.tol]} onChange={set(r.tol)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button className="w-full font-bold uppercase tracking-wider" disabled={compute.isPending} onClick={submit}>
            {compute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify Compliance"}
          </Button>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <SectionLabel>Verdict</SectionLabel>
          {!result && (
            <div className="border border-dashed border-muted-foreground/40 p-10 text-center text-sm text-muted-foreground">
              Enter design and as-built values, then run the verification.
            </div>
          )}
          {result && (
            <div className="space-y-6">
              <div
                className={`px-4 py-4 font-bold uppercase tracking-wider ${
                  result.compliant
                    ? "bg-foreground text-background"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {result.compliant ? "Compliant" : "Non-compliant"} — {result.compliancePct}% of
                parameters within tolerance
              </div>
              <div className="border border-foreground overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-foreground bg-secondary">
                      <th className="px-3 py-2 text-left swiss-label">Parameter</th>
                      <th className="px-3 py-2 text-right swiss-label">Design</th>
                      <th className="px-3 py-2 text-right swiss-label">As-built</th>
                      <th className="px-3 py-2 text-right swiss-label">Deviation</th>
                      <th className="px-3 py-2 text-right swiss-label">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map(i => (
                      <tr key={i.parameter} className="border-b border-foreground last:border-b-0">
                        <td className="px-3 py-2">{i.parameter}</td>
                        <td className="px-3 py-2 text-right swiss-number">
                          {i.design} {i.unit}
                        </td>
                        <td className="px-3 py-2 text-right swiss-number">
                          {i.actual} {i.unit}
                        </td>
                        <td className="px-3 py-2 text-right swiss-number">
                          {i.deviation > 0 ? "+" : ""}
                          {i.deviation} {i.unit}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-bold uppercase ${
                              i.severity === "compliant"
                                ? "bg-foreground text-background"
                                : i.severity === "minor"
                                  ? "border border-foreground"
                                  : "bg-primary text-primary-foreground"
                            }`}
                          >
                            {i.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-l-4 border-primary pl-4 text-sm leading-relaxed">
                {result.interpretation}
              </div>
              <p className="text-xs text-muted-foreground">Saved to archive.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
