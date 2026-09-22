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
  strengthModel: "Mohr–Coulomb" | "Hoek–Brown" | "Mixed";
  equivalentCohesion: number;
  equivalentFrictionAngle: number;
  profile: { totalHeight: number; totalWidth: number; benchCount: number };
  benchStrengths: Array<{ materialLayer?: string; model: "Mohr–Coulomb" | "Hoek–Brown"; cohesion: number; frictionAngle: number }>;
};

type Bench = {
  height: string;
  angle: string;
  bermWidth: string;
  strengthModel: "mohr-coulomb" | "hoek-brown";
  sigmaCi: string;
  gsi: string;
  mi: string;
  disturbanceFactor: string;
  materialLayer: string;
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
  const [benches, setBenches] = useState<Bench[]>([{ height: "15", angle: "45", bermWidth: "0", strengthModel: "mohr-coulomb", sigmaCi: "100", gsi: "60", mi: "10", disturbanceFactor: "0.7", materialLayer: "" }]);
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
      benches: benches.map(bench => ({
        height: Number(bench.height),
        angle: Number(bench.angle),
        bermWidth: Number(bench.bermWidth),
        materialLayer: bench.materialLayer || undefined,
        strengthModel: bench.strengthModel === "hoek-brown"
          ? { type: "hoek-brown" as const, sigmaCi: Number(bench.sigmaCi), gsi: Number(bench.gsi), mi: Number(bench.mi), disturbanceFactor: Number(bench.disturbanceFactor) }
          : { type: "mohr-coulomb" as const },
      })),
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
        description="Limit-equilibrium factor of safety for single or multi-bench slopes using Fellenius and simplified Bishop methods, with optional Hoek–Brown rock-mass strength."
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
            <div className="border border-foreground p-4 space-y-3">
              <div className="flex items-center justify-between">
                <SectionLabel>Slope benches</SectionLabel>
                <Button type="button" variant="outline" className="rounded-none text-xs" onClick={() => setBenches(current => [...current, { height: "10", angle: "45", bermWidth: "8", strengthModel: "mohr-coulomb", sigmaCi: "100", gsi: "60", mi: "10", disturbanceFactor: "0.7", materialLayer: "" }])}>
                  Add bench
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Define the bench sequence from toe to crest. Each bench can use its own Hoek–Brown rock-mass properties.</p>
              {benches.map((bench, index) => (
                <div key={index} className="border-t border-muted-foreground/40 pt-3 space-y-2">
                  <div className="flex items-center justify-between"><span className="swiss-label">Bench {String(index + 1).padStart(2, "0")}</span><Button type="button" variant="ghost" className="h-7 px-2" disabled={benches.length === 1} onClick={() => setBenches(current => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label className="swiss-label text-[10px]">Height (m)</Label><Input type="number" min="0.1" value={bench.height} onChange={e => setBenches(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, height: e.target.value } : row))} /></div>
                    <div><Label className="swiss-label text-[10px]">Face angle (°)</Label><Input type="number" min="10" max="85" value={bench.angle} onChange={e => setBenches(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, angle: e.target.value } : row))} /></div>
                    <div><Label className="swiss-label text-[10px]">Berm width (m)</Label><Input type="number" min="0" value={bench.bermWidth} onChange={e => setBenches(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, bermWidth: e.target.value } : row))} /></div>
                  </div>
                  <div><Label className="swiss-label text-[10px]">Strength model</Label><Select value={bench.strengthModel} onValueChange={value => setBenches(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, strengthModel: value as Bench["strengthModel"] } : row))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mohr-coulomb">Mohr–Coulomb</SelectItem><SelectItem value="hoek-brown">Hoek–Brown</SelectItem></SelectContent></Select></div>
                  {bench.strengthModel === "hoek-brown" && <div className="grid grid-cols-2 gap-2"><div><Label className="swiss-label text-[10px]">UCS σci (MPa)</Label><Input type="number" min="0.1" value={bench.sigmaCi} onChange={e => setBenches(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, sigmaCi: e.target.value } : row))} /></div><div><Label className="swiss-label text-[10px]">GSI</Label><Input type="number" min="0" max="100" value={bench.gsi} onChange={e => setBenches(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, gsi: e.target.value } : row))} /></div><div><Label className="swiss-label text-[10px]">mi</Label><Input type="number" min="1" max="50" value={bench.mi} onChange={e => setBenches(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, mi: e.target.value } : row))} /></div><div><Label className="swiss-label text-[10px]">Disturbance D</Label><Input type="number" min="0" max="1" step="0.1" value={bench.disturbanceFactor} onChange={e => setBenches(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, disturbanceFactor: e.target.value } : row))} /></div></div>}
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
              benches={benches.map(bench => ({ height: Number(bench.height) || 1, angle: Number(bench.angle) || 45, bermWidth: Number(bench.bermWidth) || 0 }))}
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
              <div className="grid grid-cols-2 gap-px bg-foreground border border-foreground">
                <div className="bg-background p-4"><div className="swiss-label mb-1">Strength model</div><div className="font-bold">{result.strengthModel}</div></div>
                <div className="bg-background p-4"><div className="swiss-label mb-1">Bench count</div><div className="font-bold">{result.profile.benchCount}</div></div>
                <div className="bg-background p-4"><div className="swiss-label mb-1">Equivalent cohesion</div><div className="swiss-number">{result.equivalentCohesion.toFixed(2)} kPa</div></div>
                <div className="bg-background p-4"><div className="swiss-label mb-1">Equivalent friction angle</div><div className="swiss-number">{result.equivalentFrictionAngle.toFixed(2)}°</div></div>
              </div>
              <div className="border border-foreground">
                <div className="px-4 py-3 border-b border-foreground swiss-label">Per-bench rock strength summary</div>
                <div className="divide-y divide-foreground/30">
                  {result.benchStrengths.map((bench, index) => (
                    <div key={index} className="grid grid-cols-4 gap-3 px-4 py-2 text-sm"><span className="swiss-label">Bench {index + 1}</span><span className="font-bold">{bench.materialLayer || "Unassigned layer"}</span><span>{bench.model}</span><span className="swiss-number text-right">c′ {bench.cohesion.toFixed(2)} kPa · φ′ {bench.frictionAngle.toFixed(2)}°</span></div>
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
  benches,
  circle,
}: {
  height: number;
  angle: number;
  benches: Array<{ height: number; angle: number; bermWidth: number }>;
  circle: { xc: number; yc: number; radius: number } | null;
}) {
  const profile = [{ x: 0, y: 0 }];
  let px = 0;
  let py = 0;
  for (const bench of benches.length ? benches : [{ height, angle, bermWidth: 0 }]) {
    px += bench.height / Math.tan((Math.max(10, Math.min(85, bench.angle)) * Math.PI) / 180);
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
  const sx = W / (xMax - xMin);
  const sy = Hpx / yMax;
  const s = Math.min(sx, sy);
  const X = (x: number) => (x - xMin) * s;
  const Y = (y: number) => Hpx - y * s;

  return (
    <svg viewBox={`0 0 ${W} ${Hpx}`} className="w-full">
      {/* ground */}
      <polyline
        points={`${X(xMin)},${Y(0)} ${profile.map(point => `${X(point.x)},${Y(point.y)}`).join(" ")} ${X(xMax)},${Y(H)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* fill under slope */}
      <polygon
        points={`${X(xMin)},${Y(0)} ${profile.map(point => `${X(point.x)},${Y(point.y)}`).join(" ")} ${X(xMax)},${Y(H)} ${X(xMax)},${Hpx} ${X(xMin)},${Hpx}`}
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
        {benches.length > 1 ? `${benches.length} benches` : `β = ${angle}°`}
      </text>
    </svg>
  );
}
