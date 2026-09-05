import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Result = {
  id: number;
  fsFellenius: number;
  fsBishop: number;
  criticalCircle: { xc: number; yc: number; radius: number };
  ru: number;
  interpretation: string;
  status: "stable" | "marginal" | "unstable";
};

const statusStyle: Record<Result["status"], string> = {
  stable: "bg-foreground text-background",
  marginal: "bg-secondary text-foreground border border-foreground",
  unstable: "bg-primary text-primary-foreground",
};

const statusText: Record<Result["status"], string> = {
  stable: "Stable",
  marginal: "Marginal",
  unstable: "Unstable",
};

export default function SlopeStability() {
  const [form, setForm] = useState({
    title: "",
    zone: "",
    cohesion: "25",
    frictionAngle: "30",
    unitWeight: "20",
    slopeHeight: "15",
    slopeAngle: "45",
    waterCondition: "dry" as "dry" | "partial" | "saturated",
  });
  const [result, setResult] = useState<Result | null>(null);

  const compute = trpc.stability.compute.useMutation({
    onSuccess: data => {
      setResult(data as Result);
      toast.success("Stability analysis completed");
    },
    onError: e => toast.error(e.message),
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.title.trim()) {
      toast.error("Please provide a title for this analysis");
      return;
    }
    compute.mutate({
      title: form.title.trim(),
      zone: form.zone.trim() || undefined,
      cohesion: Number(form.cohesion),
      frictionAngle: Number(form.frictionAngle),
      unitWeight: Number(form.unitWeight),
      slopeHeight: Number(form.slopeHeight),
      slopeAngle: Number(form.slopeAngle),
      waterCondition: form.waterCondition,
    });
  };

  const num =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k)(e.target.value);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ModuleHeader
        index="02"
        title="Slope Stability"
        description="Limit-equilibrium factor of safety using the Fellenius (ordinary) and simplified Bishop methods of slices, with automatic critical circle search on a homogeneous slope."
      />

      <div className="grid grid-cols-12 gap-8">
        {/* Input form */}
        <div className="col-span-12 lg:col-span-5">
          <SectionLabel>Input Parameters</SectionLabel>
          <div className="space-y-4">
            <div>
              <Label className="swiss-label mb-1.5 block">Analysis title *</Label>
              <Input
                value={form.title}
                onChange={num("title")}
                placeholder="e.g. East wall — Bench 1240"
              />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">Zone / sector</Label>
              <Input
                value={form.zone}
                onChange={num("zone")}
                placeholder="e.g. Phase 2 East"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="swiss-label mb-1.5 block">Cohesion c′ (kPa)</Label>
                <Input type="number" value={form.cohesion} onChange={num("cohesion")} />
              </div>
              <div>
                <Label className="swiss-label mb-1.5 block">Friction angle φ′ (°)</Label>
                <Input type="number" value={form.frictionAngle} onChange={num("frictionAngle")} />
              </div>
              <div>
                <Label className="swiss-label mb-1.5 block">Unit weight γ (kN/m³)</Label>
                <Input type="number" value={form.unitWeight} onChange={num("unitWeight")} />
              </div>
              <div>
                <Label className="swiss-label mb-1.5 block">Slope height H (m)</Label>
                <Input type="number" value={form.slopeHeight} onChange={num("slopeHeight")} />
              </div>
              <div>
                <Label className="swiss-label mb-1.5 block">Slope angle β (°)</Label>
                <Input type="number" value={form.slopeAngle} onChange={num("slopeAngle")} />
              </div>
              <div>
                <Label className="swiss-label mb-1.5 block">Groundwater</Label>
                <Select
                  value={form.waterCondition}
                  onValueChange={v => set("waterCondition")(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dry">Dry (ru = 0)</SelectItem>
                    <SelectItem value="partial">Partially saturated (ru = 0.25)</SelectItem>
                    <SelectItem value="saturated">Saturated (ru = 0.5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              onClick={submit}
              disabled={compute.isPending}
              className="w-full font-bold uppercase tracking-wider mt-2"
            >
              {compute.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Computing…
                </>
              ) : (
                "Compute Factor of Safety"
              )}
            </Button>
          </div>

          {/* Slope schematic */}
          <div className="mt-8 border border-foreground p-4">
            <SectionLabel>Geometry Schematic</SectionLabel>
            <SlopeSchematic
              height={Number(form.slopeHeight) || 15}
              angle={Number(form.slopeAngle) || 45}
              circle={result?.criticalCircle ?? null}
            />
          </div>
        </div>

        {/* Results */}
        <div className="col-span-12 lg:col-span-7">
          <SectionLabel>Results</SectionLabel>
          {!result && !compute.isPending && (
            <div className="border border-dashed border-muted-foreground/40 p-10 text-center text-sm text-muted-foreground">
              Enter the geotechnical parameters and run the computation to
              obtain the factors of safety.
            </div>
          )}
          {compute.isPending && (
            <div className="border border-foreground p-10 flex items-center justify-center gap-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching critical failure surface…
            </div>
          )}
          {result && !compute.isPending && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-px bg-foreground border border-foreground">
                <div className="bg-background p-6">
                  <div className="swiss-label mb-2">FS — Bishop (simplified)</div>
                  <div className="swiss-number text-5xl font-bold">
                    {result.fsBishop.toFixed(2)}
                  </div>
                </div>
                <div className="bg-background p-6">
                  <div className="swiss-label mb-2">FS — Fellenius (ordinary)</div>
                  <div className="swiss-number text-5xl font-bold">
                    {result.fsFellenius.toFixed(2)}
                  </div>
                </div>
              </div>
              <div
                className={`px-4 py-3 font-bold uppercase tracking-wider text-sm ${statusStyle[result.status]}`}
              >
                Assessment: {statusText[result.status]}
              </div>
              <div className="border-l-4 border-primary pl-4 text-sm leading-relaxed">
                {result.interpretation}
              </div>
              <div className="border border-foreground">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-foreground">
                      <td className="px-4 py-2 swiss-label">Critical circle center</td>
                      <td className="px-4 py-2 swiss-number text-right">
                        ({result.criticalCircle.xc}, {result.criticalCircle.yc}) m
                      </td>
                    </tr>
                    <tr className="border-b border-foreground">
                      <td className="px-4 py-2 swiss-label">Critical radius</td>
                      <td className="px-4 py-2 swiss-number text-right">
                        {result.criticalCircle.radius} m
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 swiss-label">Pore pressure ratio ru</td>
                      <td className="px-4 py-2 swiss-number text-right">{result.ru}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Saved to archive. Acceptance criteria: FS ≥ 1.30 for permanent
                slopes (typical open-pit guideline); 1.00–1.30 marginal; &lt;
                1.00 unstable.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlopeSchematic({
  height,
  angle,
  circle,
}: {
  height: number;
  angle: number;
  circle: { xc: number; yc: number; radius: number } | null;
}) {
  // World coordinates: toe at (0,0), crest at (L,H)
  const H = Math.max(1, height);
  const L = H / Math.tan((Math.max(10, Math.min(85, angle)) * Math.PI) / 180);
  const pad = Math.max(H, L) * 0.5;
  const xMin = -pad;
  const xMax = L + pad;
  const yMax = H + pad * 0.8;
  const W = 400;
  const Hpx = 240;
  const sx = W / (xMax - xMin);
  const sy = Hpx / yMax;
  const s = Math.min(sx, sy);
  const X = (x: number) => (x - xMin) * s;
  const Y = (y: number) => Hpx - y * s;

  return (
    <svg viewBox={`0 0 ${W} ${Hpx}`} className="w-full">
      {/* ground */}
      <polyline
        points={`${X(xMin)},${Y(0)} ${X(0)},${Y(0)} ${X(L)},${Y(H)} ${X(xMax)},${Y(H)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* fill under slope */}
      <polygon
        points={`${X(xMin)},${Y(0)} ${X(0)},${Y(0)} ${X(L)},${Y(H)} ${X(xMax)},${Y(H)} ${X(xMax)},${Hpx} ${X(xMin)},${Hpx}`}
        fill="currentColor"
        opacity="0.06"
      />
      {/* critical circle */}
      {circle && (
        <circle
          cx={X(circle.xc)}
          cy={Y(circle.yc)}
          r={circle.radius * s}
          fill="none"
          stroke="#d32f2f"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
      )}
      {/* dimensions */}
      <text x={X(L) + 6} y={Y(H / 2)} fontSize="11" fontFamily="monospace" fill="currentColor">
        H = {height} m
      </text>
      <text x={X(L / 2) - 20} y={Y(0) + 16} fontSize="11" fontFamily="monospace" fill="currentColor">
        β = {angle}°
      </text>
    </svg>
  );
}
