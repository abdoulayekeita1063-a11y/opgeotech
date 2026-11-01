import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SlopeBenchFields from "@/components/SlopeBenchFields";
import {
  buildBenchStabilityInput,
  defaultBench,
  type BenchForm,
} from "@/lib/stabilityForm";
import type { StabilityResult } from "../../../server/geotech/stability";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Result = StabilityResult & { id: number };
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
const waterLabels = {
  dry: "Dry",
  partial: "Partially saturated",
  saturated: "Saturated",
};

export default function SlopeStability() {
  const [form, setForm] = useState({ title: "", zone: "" });
  const [benches, setBenches] = useState<BenchForm[]>([defaultBench()]);
  const [result, setResult] = useState<Result | null>(null);
  const compute = trpc.stability.compute.useMutation({
    onSuccess: data => {
      setResult(data as Result);
      toast.success("Stability analysis completed");
    },
    onError: error => toast.error(error.message),
  });
  const changeBench = (
    index: number,
    field: keyof BenchForm,
    value: string
  ) => {
    setBenches(current =>
      current.map((bench, rowIndex) =>
        rowIndex === index ? { ...bench, [field]: value } : bench
      )
    );
    setResult(null);
  };
  const submit = () => {
    if (!form.title.trim())
      return toast.error("Please provide a title for this analysis");
    try {
      const input = buildBenchStabilityInput(benches);
      setResult(null);
      compute.mutate({
        title: form.title.trim(),
        zone: form.zone.trim() || undefined,
        ...input,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Please check the bench parameters"
      );
    }
  };
  const previewBenches = benches.map(bench => ({
    height: Math.max(0.1, Number(bench.height) || 15),
    angle: Math.max(10, Math.min(85, Number(bench.angle) || 45)),
    bermWidth: Math.max(0, Number(bench.bermWidth) || 0),
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ModuleHeader
        index="02"
        title="Slope Stability"
        description="Limit-equilibrium factor of safety for single or multi-bench slopes using Fellenius and simplified Bishop methods, with per-bench Mohr–Coulomb or Hoek–Brown strength."
      />
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-5">
          <SectionLabel>Input Parameters</SectionLabel>
          <div className="space-y-4">
            <div>
              <Label
                htmlFor="stability-title"
                className="swiss-label mb-1.5 block"
              >
                Analysis title *
              </Label>
              <Input
                id="stability-title"
                value={form.title}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="e.g. East wall — Bench 1240"
                disabled={compute.isPending}
              />
            </div>
            <div>
              <Label
                htmlFor="stability-zone"
                className="swiss-label mb-1.5 block"
              >
                Zone / sector
              </Label>
              <Input
                id="stability-zone"
                value={form.zone}
                onChange={event =>
                  setForm(current => ({ ...current, zone: event.target.value }))
                }
                placeholder="e.g. Phase 2 East"
                disabled={compute.isPending}
              />
            </div>
            <div className="border border-foreground p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Slope benches</SectionLabel>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none text-xs"
                  disabled={compute.isPending || benches.length >= 50}
                  onClick={() => {
                    setBenches(current => [
                      ...current,
                      defaultBench({ height: "10", bermWidth: "8" }),
                    ]);
                    setResult(null);
                  }}
                >
                  Add bench
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Define the bench sequence from toe to crest. Enter geometry,
                unit weight and groundwater separately for each bench, then
                select its strength model.
              </p>
              {benches.map((bench, index) => (
                <div
                  key={index}
                  className="border-t border-muted-foreground/40 pt-3 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="swiss-label">
                      Bench {String(index + 1).padStart(2, "0")}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 px-2"
                      disabled={benches.length === 1 || compute.isPending}
                      onClick={() => {
                        setBenches(current =>
                          current.filter((_, rowIndex) => rowIndex !== index)
                        );
                        setResult(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                  <SlopeBenchFields
                    bench={bench}
                    index={index}
                    onChange={(field, value) =>
                      changeBench(index, field, value)
                    }
                    disabled={compute.isPending}
                  />
                </div>
              ))}
            </div>
            <Button
              onClick={submit}
              disabled={compute.isPending}
              className="w-full font-bold uppercase tracking-wider mt-2"
            >
              {compute.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Computing…
                </>
              ) : (
                "Compute Factor of Safety"
              )}
            </Button>
          </div>
          <div className="mt-8 border border-foreground p-4">
            <SectionLabel>Geometry Schematic</SectionLabel>
            <SlopeSchematic
              benches={previewBenches}
              circle={result?.criticalCircle ?? null}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Groundwater is represented by a simplified pore-pressure ratio (ru)
            for each bench. Material properties are assigned to the existing
            vertical bench domains; this is not a full stratigraphic groundwater
            model. Confirm design decisions with site-specific engineering
            assessment.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <SectionLabel>Results</SectionLabel>
          {!result && !compute.isPending && (
            <div className="border border-dashed border-muted-foreground/40 p-10 text-center text-sm text-muted-foreground">
              Enter the parameters for each bench and run the computation to
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
                  <div className="swiss-label mb-2">
                    FS — Bishop (simplified)
                  </div>
                  <div className="swiss-number text-5xl font-bold">
                    {result.fsBishop.toFixed(2)}
                  </div>
                </div>
                <div className="bg-background p-6">
                  <div className="swiss-label mb-2">
                    FS — Fellenius (ordinary)
                  </div>
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
              <div className="grid grid-cols-2 gap-px bg-foreground border border-foreground">
                <div className="bg-background p-4">
                  <div className="swiss-label mb-1">Strength model</div>
                  <div className="font-bold">{result.strengthModel}</div>
                </div>
                <div className="bg-background p-4">
                  <div className="swiss-label mb-1">Bench count</div>
                  <div className="font-bold">{result.profile.benchCount}</div>
                </div>
                <div className="bg-background p-4">
                  <div className="swiss-label mb-1">
                    Mean bench equivalent cohesion
                  </div>
                  <div className="swiss-number">
                    {result.equivalentCohesion.toFixed(2)} kPa
                  </div>
                </div>
                <div className="bg-background p-4">
                  <div className="swiss-label mb-1">
                    Mean bench equivalent friction angle
                  </div>
                  <div className="swiss-number">
                    {result.equivalentFrictionAngle.toFixed(2)}°
                  </div>
                </div>
              </div>
              <div className="border border-foreground">
                <div className="px-4 py-3 border-b border-foreground swiss-label">
                  Per-bench material and groundwater summary
                </div>
                <div className="divide-y divide-foreground/30">
                  {result.benchStrengths.map((bench, index) => (
                    <div key={index} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="swiss-label">Bench {index + 1}</span>
                        <span className="font-bold">{bench.model}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
                        <span>c′ {bench.cohesion.toFixed(2)} kPa</span>
                        <span>φ′ {bench.frictionAngle.toFixed(2)}°</span>
                        <span>γ {bench.unitWeight.toFixed(2)} kN/m³</span>
                        <span>
                          {waterLabels[bench.waterCondition]} · ru {bench.ru}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-l-4 border-primary pl-4 text-sm leading-relaxed">
                {result.interpretation}
              </div>
              <div className="border border-foreground">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-foreground">
                      <td className="px-4 py-2 swiss-label">
                        Critical circle center
                      </td>
                      <td className="px-4 py-2 swiss-number text-right">
                        ({result.criticalCircle.xc}, {result.criticalCircle.yc})
                        m
                      </td>
                    </tr>
                    <tr className="border-b border-foreground">
                      <td className="px-4 py-2 swiss-label">Critical radius</td>
                      <td className="px-4 py-2 swiss-number text-right">
                        {result.criticalCircle.radius} m
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 swiss-label">
                        Effective pore pressure ratio ru
                      </td>
                      <td className="px-4 py-2 swiss-number text-right">
                        {result.ru}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                {result.id < 0
                  ? "Saved locally for offline use."
                  : "Saved to archive."}{" "}
                Acceptance criteria: FS ≥ 1.30 for permanent slopes (typical
                open-pit guideline); 1.00–1.30 marginal; &lt; 1.00 unstable. The
                effective ru is weight-averaged over the critical surface
                slices.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlopeSchematic({
  benches,
  circle,
}: {
  benches: Array<{ height: number; angle: number; bermWidth: number }>;
  circle: { xc: number; yc: number; radius: number } | null;
}) {
  const profile = [{ x: 0, y: 0 }];
  let px = 0;
  let py = 0;
  for (const bench of benches) {
    px +=
      bench.height /
      Math.tan((Math.max(10, Math.min(85, bench.angle)) * Math.PI) / 180);
    py += bench.height;
    profile.push({ x: px, y: py });
    px += Math.max(0, bench.bermWidth);
    profile.push({ x: px, y: py });
  }
  const H = Math.max(1, py);
  const L = Math.max(1, px);
  const pad = Math.max(H, L) * 0.5;
  const xMin = -pad;
  const xMax = L + pad;
  const yMax = H + pad * 0.8;
  const W = 400;
  const Hpx = 240;
  const s = Math.min(W / (xMax - xMin), Hpx / yMax);
  const X = (x: number) => (x - xMin) * s;
  const Y = (y: number) => Hpx - y * s;
  return (
    <svg
      viewBox={`0 0 ${W} ${Hpx}`}
      className="w-full"
      role="img"
      aria-label="Slope geometry from the bench inputs"
    >
      <polyline
        points={`${X(xMin)},${Y(0)} ${profile.map(point => `${X(point.x)},${Y(point.y)}`).join(" ")} ${X(xMax)},${Y(H)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <polygon
        points={`${X(xMin)},${Y(0)} ${profile.map(point => `${X(point.x)},${Y(point.y)}`).join(" ")} ${X(xMax)},${Y(H)} ${X(xMax)},${Hpx} ${X(xMin)},${Hpx}`}
        fill="currentColor"
        opacity="0.06"
      />
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
      <text
        x={X(L) + 6}
        y={Y(H / 2)}
        fontSize="11"
        fontFamily="monospace"
        fill="currentColor"
      >
        H = {Number(py.toFixed(2))} m
      </text>
      <text
        x={X(L / 2) - 20}
        y={Y(0) + 16}
        fontSize="11"
        fontFamily="monospace"
        fill="currentColor"
      >
        {benches.length > 1
          ? `${benches.length} benches`
          : `β = ${benches[0]?.angle ?? 45}°`}
      </text>
    </svg>
  );
}
