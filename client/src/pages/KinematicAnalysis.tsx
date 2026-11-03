import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, FileDown, Loader2, Play } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { feasibleCases } from "@/lib/kinematicResults";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { escapeHtml, exportRecordAsPdf } from "@/lib/exportPdf";

const MAX_KINEMATIC_STRUCTURES = 100;

interface Strength {
  normalStressKpa: number;
  peakFrictionAngle: number;
  instantaneousCohesionKpa: number;
  instantaneousFrictionAngle: number;
}
interface PlanarRes {
  structureId: string;
  dip: number;
  dipDirection: number;
  feasible: boolean;
  reasons: string[];
  persistence?: number;
  effectiveHeightM?: number;
  blockWeightKn?: number;
  strength?: Strength;
  factorOfSafety?: number;
  status?: string;
}
interface WedgeRes {
  pair: [string, string];
  lineOfIntersection: { trend: number; plunge: number };
  feasible: boolean;
  reasons: string[];
  persistence?: number;
  coordinateSpanM?: number;
  effectiveHeightM?: number;
  blockWeightKn?: number;
  strength?: Strength;
  factorOfSafety?: number;
  status?: string;
}
interface TopplingRes {
  structureId: string;
  dip: number;
  dipDirection: number;
  feasible: boolean;
  mode: string;
  reasons: string[];
  persistence?: number;
  effectiveHeightM?: number;
  blockWeightKn?: number;
  strength?: Strength;
  factorOfSafety?: number;
  status?: string;
}
interface KinResult {
  planar: PlanarRes[];
  wedge: WedgeRes[];
  toppling: TopplingRes[];
  summary: {
    planarCount: number;
    planarTotal: number;
    planarPercentage: number;
    planarCritical: number;
    wedgeCount: number;
    wedgeTotal: number;
    wedgePercentage: number;
    wedgeCritical: number;
    topplingCount: number;
    topplingTotal: number;
    topplingPercentage: number;
    topplingCritical: number;
    criticalFs: number | null;
    overallAssessment: string;
  };
}

const DEG = Math.PI / 180;

type StereonetPoint = {
  x: number;
  y: number;
  trend: number;
  plunge: number;
  label: string;
  feasible: boolean;
  kind: string;
};

function stereonetPoint(
  trend: number,
  plunge: number,
  cx: number,
  cy: number,
  radius: number
) {
  const r =
    Math.min(
      1,
      Math.max(
        0,
        Math.tan(((90 - Math.max(0, Math.min(90, plunge))) / 2) * DEG)
      )
    ) * radius;
  const t = ((trend % 360) + 360) % 360;
  return { x: cx + Math.sin(t * DEG) * r, y: cy - Math.cos(t * DEG) * r };
}

function dangerSector(
  centerTrend: number,
  halfWidth: number,
  cx: number,
  cy: number,
  radius: number
) {
  const points = Array.from({ length: 25 }, (_, i) => {
    const offset = -halfWidth + (2 * halfWidth * i) / 24;
    return stereonetPoint(centerTrend + offset, 0, cx, cy, radius);
  });
  return `M ${cx},${cy} L ${points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")} Z`;
}

function Stereonet({
  result,
  slopeDip,
  slopeDipDirection,
  frictionAngle,
  lateralLimit,
}: {
  result: KinResult;
  slopeDip: number;
  slopeDipDirection: number;
  frictionAngle: number;
  lateralLimit: number;
}) {
  const [hover, setHover] = useState<StereonetPoint | null>(null);
  const cx = 260,
    cy = 270,
    radius = 214;
  const poles: StereonetPoint[] = result.planar.map(item => {
    const point = stereonetPoint(
      item.dipDirection + 180,
      90 - item.dip,
      cx,
      cy,
      radius
    );
    return {
      ...point,
      trend: item.dipDirection + 180,
      plunge: 90 - item.dip,
      label: item.structureId,
      feasible: item.feasible,
      kind: "Pole",
    };
  });
  const wedges: StereonetPoint[] = result.wedge
    .filter(item => item.feasible)
    .map(item => {
      const point = stereonetPoint(
        item.lineOfIntersection.trend,
        item.lineOfIntersection.plunge,
        cx,
        cy,
        radius
      );
      return {
        ...point,
        trend: item.lineOfIntersection.trend,
        plunge: item.lineOfIntersection.plunge,
        label: item.pair.join(" × "),
        feasible: true,
        kind: "Wedge intersection",
      };
    });
  const ringScales = [0.25, 0.5, 0.75, 1];
  const planarZone = dangerSector(
    slopeDipDirection + 180,
    Math.max(5, lateralLimit),
    cx,
    cy,
    radius
  );
  const topplingZone = dangerSector(
    slopeDipDirection,
    Math.max(8, lateralLimit + 10),
    cx,
    cy,
    radius
  );
  return (
    <section className="border-2 border-foreground p-4 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <SectionLabel>Stereonet — lower hemisphere</SectionLabel>
          <p className="text-xs text-muted-foreground mt-1">
            Pole vectors, wedge intersections and kinematic danger envelopes.
          </p>
        </div>
        <div className="font-mono text-[10px] text-right text-muted-foreground">
          <div>
            Slope {slopeDip}° / {slopeDipDirection}°
          </div>
          <div>
            φb {frictionAngle}° · ±{lateralLimit}°
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_210px] gap-4 items-center">
        <div className="relative min-w-0">
          <svg
            viewBox="0 0 520 540"
            className="w-full max-w-[620px] mx-auto"
            role="img"
            aria-label="Kinematic stereonet showing red danger zone"
          >
            <defs>
              <radialGradient id="stereonet-red-zone">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.38" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.12" />
              </radialGradient>
            </defs>
            <rect width="520" height="540" fill="#fff" />
            <g stroke="#a1a1aa" fill="none" strokeWidth="1">
              {ringScales.map(scale => (
                <circle
                  key={scale}
                  cx={cx}
                  cy={cy}
                  r={radius * scale}
                  strokeDasharray={scale === 1 ? undefined : "3 4"}
                />
              ))}
              {[0, 30, 60, 90, 120, 150].map(angle => {
                const a = angle * DEG;
                return (
                  <line
                    key={angle}
                    x1={cx - radius * Math.sin(a)}
                    y1={cy - radius * Math.cos(a)}
                    x2={cx + radius * Math.sin(a)}
                    y2={cy + radius * Math.cos(a)}
                  />
                );
              })}
            </g>
            <path
              d={planarZone}
              fill="url(#stereonet-red-zone)"
              stroke="#dc2626"
              strokeWidth="1.5"
            />
            <path
              d={topplingZone}
              fill="#f59e0b"
              fillOpacity="0.12"
              stroke="#d97706"
              strokeDasharray="5 4"
              strokeWidth="1.2"
            />
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="#111"
              strokeWidth="2"
            />
            <g
              fill="#111"
              fontSize="13"
              fontFamily="IBM Plex Mono, monospace"
              fontWeight="700"
            >
              <text x={cx} y={cy - radius - 12} textAnchor="middle">
                N
              </text>
              <text x={cx + radius + 16} y={cy + 4} textAnchor="middle">
                E
              </text>
              <text x={cx} y={cy + radius + 24} textAnchor="middle">
                S
              </text>
              <text x={cx - radius - 16} y={cy + 4} textAnchor="middle">
                W
              </text>
            </g>
            <line
              x1={cx}
              y1={cy}
              x2={stereonetPoint(slopeDipDirection, 0, cx, cy, radius).x}
              y2={stereonetPoint(slopeDipDirection, 0, cx, cy, radius).y}
              stroke="#ea580c"
              strokeWidth="2"
              opacity="0.8"
            />
            {poles.map(point => (
              <g
                key={`pole-${point.label}`}
                onMouseEnter={() => setHover(point)}
                onMouseLeave={() => setHover(null)}
                className="cursor-help"
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.feasible ? 7 : 5}
                  fill={point.feasible ? "#dc2626" : "#111827"}
                  stroke="#fff"
                  strokeWidth="2"
                />
                <text
                  x={point.x + 8}
                  y={point.y - 7}
                  fontSize="9"
                  fontFamily="IBM Plex Mono, monospace"
                  fill="#111"
                >
                  {point.label}
                </text>
              </g>
            ))}
            {wedges.map(point => (
              <g
                key={`wedge-${point.label}`}
                onMouseEnter={() => setHover(point)}
                onMouseLeave={() => setHover(null)}
                className="cursor-help"
              >
                <rect
                  x={point.x - 5}
                  y={point.y - 5}
                  width="10"
                  height="10"
                  fill="#7c3aed"
                  stroke="#fff"
                  strokeWidth="2"
                  transform={`rotate(45 ${point.x} ${point.y})`}
                />
                <text
                  x={point.x + 8}
                  y={point.y + 4}
                  fontSize="9"
                  fontFamily="IBM Plex Mono, monospace"
                  fill="#5b21b6"
                >
                  W
                </text>
              </g>
            ))}
            {hover && (
              <g>
                <rect
                  x={hover.x + 12}
                  y={hover.y - 34}
                  width="150"
                  height="32"
                  fill="#111"
                  rx="2"
                />
                <text
                  x={hover.x + 18}
                  y={hover.y - 20}
                  fill="#fff"
                  fontSize="9"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {hover.kind}: {hover.label}
                </text>
                <text
                  x={hover.x + 18}
                  y={hover.y - 8}
                  fill="#fff"
                  fontSize="9"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {hover.trend.toFixed(1)}° / {hover.plunge.toFixed(1)}°
                </text>
              </g>
            )}
          </svg>
        </div>
        <div className="border border-foreground p-3 font-mono text-[10px] space-y-3">
          <div className="font-bold uppercase tracking-wider border-b border-foreground pb-2">
            Legend
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-600 border border-white shadow" />{" "}
            Feasible / critical pole
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-slate-900 border border-white shadow" />{" "}
            Non-critical pole
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rotate-45 bg-violet-700 border border-white shadow" />{" "}
            Feasible wedge intersection
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 bg-red-500/35 border border-red-600" />{" "}
            Planar danger zone
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 bg-amber-500/20 border border-amber-600 border-dashed" />{" "}
            Toppling envelope
          </div>
          <div className="pt-2 border-t border-border text-muted-foreground leading-relaxed">
            Red zone highlights poles aligned with the slope direction, within
            the lateral limit and above the friction threshold. Screening plot
            only.
          </div>
        </div>
      </div>
    </section>
  );
}

function statusColor(s?: string) {
  return s === "Unstable"
    ? "text-destructive font-bold"
    : s === "Marginal"
      ? "text-amber-600 font-bold"
      : "text-emerald-700 font-bold";
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadKinematicCsv(result: KinResult, analysisTitle: string) {
  const rows: unknown[][] = [
    ["Kinematic Analysis", analysisTitle || "Untitled"],
    ["Mechanism", "Critical", "Total", "Percentage"],
    [
      "Planar Sliding",
      result.summary.planarCritical,
      result.summary.planarTotal,
      `${result.summary.planarPercentage.toFixed(2)}%`,
    ],
    [
      "Wedge Sliding",
      result.summary.wedgeCritical,
      result.summary.wedgeTotal,
      `${result.summary.wedgePercentage.toFixed(2)}%`,
    ],
    [
      "Flexural Toppling (All)",
      result.summary.topplingCritical,
      result.summary.topplingTotal,
      `${result.summary.topplingPercentage.toFixed(2)}%`,
    ],
    [],
    ["Detailed Results"],
    [
      "Mode",
      "Identifier",
      "Feasible",
      "Persistence Length (m)",
      "Coordinate Span (m)",
      "Effective Height (m)",
      "Dip",
      "Dip Direction",
      "Trend",
      "Plunge",
      "Block Weight (kN)",
      "Cohesion (kPa)",
      "Friction Angle (°)",
      "Factor of Safety",
      "Status",
      "Reasons",
    ],
  ];

  result.planar.forEach(item =>
    rows.push([
      "Planar",
      item.structureId,
      item.feasible ? "Yes" : "No",
      item.persistence,
      item.effectiveHeightM,
      item.dip,
      item.dipDirection,
      "",
      "",
      item.blockWeightKn,
      item.strength?.instantaneousCohesionKpa,
      item.strength?.instantaneousFrictionAngle,
      item.factorOfSafety,
      item.status,
      item.reasons.join(" | "),
    ])
  );
  result.wedge.forEach(item =>
    rows.push([
      "Wedge",
      item.pair.join(" × "),
      item.feasible ? "Yes" : "No",
      item.persistence,
      item.coordinateSpanM,
      item.effectiveHeightM,
      "",
      "",
      item.lineOfIntersection.trend,
      item.lineOfIntersection.plunge,
      item.blockWeightKn,
      item.strength?.instantaneousCohesionKpa,
      item.strength?.instantaneousFrictionAngle,
      item.factorOfSafety,
      item.status,
      item.reasons.join(" | "),
    ])
  );
  result.toppling.forEach(item =>
    rows.push([
      "Toppling",
      item.structureId,
      item.feasible ? "Yes" : "No",
      item.persistence,
      item.effectiveHeightM,
      item.dip,
      item.dipDirection,
      "",
      "",
      item.blockWeightKn,
      item.strength?.instantaneousCohesionKpa,
      item.strength?.instantaneousFrictionAngle,
      item.factorOfSafety,
      item.status,
      item.reasons.join(" | "),
    ])
  );

  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${
    (analysisTitle || "kinematic-analysis")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "kinematic-analysis"
  }.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
  toast.success("Kinematic results exported to CSV");
}

function exportKinematicPdf(result: KinResult, analysisTitle: string) {
  const summaryRows = [
    [
      "Planar Sliding",
      result.summary.planarCritical,
      result.summary.planarTotal,
      `${result.summary.planarPercentage.toFixed(2)}%`,
    ],
    [
      "Wedge Sliding",
      result.summary.wedgeCritical,
      result.summary.wedgeTotal,
      `${result.summary.wedgePercentage.toFixed(2)}%`,
    ],
    [
      "Flexural Toppling (All)",
      result.summary.topplingCritical,
      result.summary.topplingTotal,
      `${result.summary.topplingPercentage.toFixed(2)}%`,
    ],
  ];
  const detailRows = [
    ...result.planar.map(item => [
      "Planar",
      item.structureId,
      item.feasible ? "Yes" : "No",
      item.persistence == null ? "Not specified" : `${item.persistence} m`,
      `${item.effectiveHeightM ?? "—"} m`,
      item.factorOfSafety ?? "—",
      item.status ?? "—",
      item.reasons.join(" | "),
    ]),
    ...result.wedge.map(item => [
      "Wedge",
      item.pair.join(" × "),
      item.feasible ? "Yes" : "No",
      item.persistence == null ? "Not specified" : `${item.persistence} m`,
      `${item.effectiveHeightM ?? "—"} m`,
      item.factorOfSafety ?? "—",
      item.status ?? "—",
      item.reasons.join(" | "),
    ]),
    ...result.toppling.map(item => [
      "Toppling",
      item.structureId,
      item.feasible ? "Yes" : "No",
      item.persistence == null ? "Not specified" : `${item.persistence} m`,
      `${item.effectiveHeightM ?? "—"} m`,
      item.factorOfSafety ?? "—",
      item.status ?? "—",
      item.reasons.join(" | "),
    ]),
  ];
  const table = (headers: string[], rows: unknown[][]) =>
    `<table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(String(value ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const body = `<h1>Kinematic Analysis</h1><p><strong>Analysis:</strong> ${escapeHtml(analysisTitle || "Untitled")}</p><h2>Mechanism Summary</h2>${table(["Mechanism", "Critical", "Total", "%"], summaryRows)}<p><strong>Critical FS:</strong> ${result.summary.criticalFs == null ? "—" : result.summary.criticalFs.toFixed(2)}</p><h2>Detailed Results</h2>${table(["Mode", "Identifier", "Feasible", "Persistence length", "Effective height", "FS", "Status", "Assessment"], detailRows)}`;
  exportRecordAsPdf(analysisTitle || "Kinematic Analysis", body);
}

export default function KinematicAnalysis() {
  const utils = trpc.useUtils();
  const structures = trpc.mapping.list.useQuery();

  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [slopeDip, setSlopeDip] = useState("60");
  const [slopeDipDirection, setSlopeDipDirection] = useState("90");
  const [slopeHeight, setSlopeHeight] = useState("30");
  const [unitWeight, setUnitWeight] = useState("26");
  const [phiB, setPhiB] = useState("30");
  const [jcs, setJcs] = useState("50");
  const [lateralLimit, setLateralLimit] = useState("20");
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<KinResult | null>(null);

  const run = trpc.kinematics.run.useMutation({
    onSuccess: r => {
      setResult(r.result as KinResult);
      utils.kinematics.list.invalidate();
      toast.success("Kinematic analysis completed");
    },
    onError: e => toast.error(e.message),
  });

  const toggle = (id: number) => {
    if (!selected.includes(id) && selected.length >= MAX_KINEMATIC_STRUCTURES) {
      toast.error(
        `Kinematic Analysis supports up to ${MAX_KINEMATIC_STRUCTURES} structures per run`
      );
      return;
    }
    setSelected(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    const all = (structures.data ?? [])
      .slice(0, MAX_KINEMATIC_STRUCTURES)
      .map(s => s.id);
    setSelected(prev => (prev.length === all.length ? [] : all));
  };

  const submit = () => {
    if (!title.trim()) return toast.error("Analysis title is required");
    if (!selected.length) return toast.error("Select at least one structure");
    run.mutate({
      title: title.trim(),
      zone: zone || undefined,
      slopeDip: parseFloat(slopeDip),
      slopeDipDirection: parseFloat(slopeDipDirection),
      slopeHeight: parseFloat(slopeHeight),
      unitWeight: parseFloat(unitWeight),
      basicFrictionAngle: parseFloat(phiB),
      jcs: parseFloat(jcs),
      lateralLimit: parseFloat(lateralLimit),
      structureIds: selected,
    });
  };

  const feasiblePlanar = feasibleCases(result?.planar ?? []);
  const feasibleWedge = feasibleCases(result?.wedge ?? []);
  const feasibleToppling = feasibleCases(result?.toppling ?? []);

  return (
    <div>
      <ModuleHeader
        index="08"
        title="Kinematic Analysis"
        module="Kinematic Analysis"
        description="Screen planar, wedge and toppling failure modes against the slope face; shear strength on each structure follows the Barton-Bandis criterion, giving block weight and factor of safety."
      />

      <div className="grid grid-cols-12 gap-8">
        {/* inputs */}
        <div className="kinematic-inputs col-span-12 lg:col-span-4">
          <SectionLabel>Slope & rock parameters</SectionLabel>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="col-span-2">
              <Label className="swiss-label text-[11px]">
                Analysis title *
              </Label>
              <Input
                className="rounded-none border-foreground mt-1"
                placeholder="e.g. East wall — Stage 3 kinematics"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label className="swiss-label text-[11px]">Zone / sector</Label>
              <Input
                className="rounded-none border-foreground mt-1"
                value={zone}
                onChange={e => setZone(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Slope dip (°)</Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={slopeDip}
                onChange={e => setSlopeDip(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">
                Slope dip direction (°)
              </Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={slopeDipDirection}
                onChange={e => setSlopeDipDirection(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">
                Slope height (m)
              </Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={slopeHeight}
                onChange={e => setSlopeHeight(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">
                Unit weight (kN/m³)
              </Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={unitWeight}
                onChange={e => setUnitWeight(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">
                Basic friction φb (°)
              </Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={phiB}
                onChange={e => setPhiB(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">JCS (MPa)</Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={jcs}
                onChange={e => setJcs(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label className="swiss-label text-[11px]">
                Lateral limit (± °)
              </Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={lateralLimit}
                onChange={e => setLateralLimit(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <SectionLabel>
                Structures ({selected.length}/{MAX_KINEMATIC_STRUCTURES}{" "}
                selected)
              </SectionLabel>
              <button
                className="text-xs underline font-mono"
                onClick={selectAll}
              >
                {selected.length === (structures.data ?? []).length
                  ? "Clear all"
                  : "Select all"}
              </button>
            </div>
            <div className="border border-foreground max-h-[260px] overflow-y-auto divide-y divide-border">
              {(structures.data ?? []).length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">
                  No structures available. Record them in Structural Mapping
                  first.
                </p>
              )}
              {(structures.data ?? []).map(s => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono cursor-pointer hover:bg-secondary"
                >
                  <Checkbox
                    checked={selected.includes(s.id)}
                    onCheckedChange={() => toggle(s.id)}
                  />
                  <span className="font-bold">
                    {s.structureId || `#${s.id}`}
                  </span>
                  <span>{s.structureType}</span>
                  <span className="text-muted-foreground">
                    {s.dip}°/{s.dipDirection}° · persistence length{" "}
                    {s.persistence == null
                      ? "not specified"
                      : `${s.persistence} m`}{" "}
                    · JRC {s.jrc ?? "—"}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Select up to {MAX_KINEMATIC_STRUCTURES} structures per analysis.
              Select all uses the first {MAX_KINEMATIC_STRUCTURES}.
            </p>
          </div>

          <Button
            className="w-full rounded-none mt-4 font-bold uppercase tracking-wide"
            disabled={run.isPending}
            onClick={submit}
          >
            {run.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run Kinematic Analysis
          </Button>
        </div>

        {/* results */}
        <div className="kinematic-results col-span-12 lg:col-span-8">
          <SectionLabel>Results</SectionLabel>
          {!result ? (
            <div className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Configure the slope, select mapped structures and run the analysis
              to evaluate planar, wedge and toppling mechanisms.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="no-print flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  className="rounded-none"
                  onClick={() => downloadKinematicCsv(result, title)}
                >
                  <Download className="h-4 w-4 mr-2" /> Export CSV
                </Button>
                <Button
                  className="rounded-none"
                  onClick={() => exportKinematicPdf(result, title)}
                >
                  <FileDown className="h-4 w-4 mr-2" /> Export PDF
                </Button>
              </div>
              {/* summary */}
              <div className="border-2 border-foreground p-4">
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-center mb-4">
                  <div className="border border-foreground p-3">
                    <div className="text-3xl font-extrabold text-primary">
                      {result.summary.planarPercentage.toFixed(2)}%
                    </div>
                    <div className="swiss-label text-[11px] mt-1">
                      Planar — Critical / Total / %
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {result.summary.planarCritical} /{" "}
                      {result.summary.planarTotal} structures
                    </div>
                  </div>
                  <div className="border border-foreground p-3">
                    <div className="text-3xl font-extrabold text-primary">
                      {result.summary.wedgePercentage.toFixed(2)}%
                    </div>
                    <div className="swiss-label text-[11px] mt-1">
                      Wedge — Critical / Total / %
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {result.summary.wedgeCritical} /{" "}
                      {result.summary.wedgeTotal} pairs
                    </div>
                  </div>
                  <div className="border border-foreground p-3">
                    <div className="text-3xl font-extrabold text-primary">
                      {result.summary.topplingPercentage.toFixed(2)}%
                    </div>
                    <div className="swiss-label text-[11px] mt-1">
                      Toppling — Critical / Total / %
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {result.summary.topplingCritical} /{" "}
                      {result.summary.topplingTotal} structures
                    </div>
                  </div>
                  <div className="border border-foreground p-3">
                    <div
                      className={`text-2xl font-extrabold ${result.summary.criticalFs != null && result.summary.criticalFs < 1.3 ? "text-destructive" : ""}`}
                    >
                      {result.summary.criticalFs != null
                        ? result.summary.criticalFs.toFixed(2)
                        : "—"}
                    </div>
                    <div className="swiss-label text-[11px] mt-1">
                      Critical FS
                    </div>
                  </div>
                </div>
                <div className="border border-foreground overflow-x-auto mb-4">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-secondary border-b border-foreground">
                      <tr className="text-left">
                        <th className="px-3 py-2">Mechanism</th>
                        <th className="px-3 py-2 text-right">Critical</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border">
                        <td className="px-3 py-2">Planar Sliding</td>
                        <td className="px-3 py-2 text-right font-bold">
                          {result.summary.planarCritical}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {result.summary.planarTotal}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {result.summary.planarPercentage.toFixed(2)}%
                        </td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="px-3 py-2">Wedge Sliding</td>
                        <td className="px-3 py-2 text-right font-bold">
                          {result.summary.wedgeCritical}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {result.summary.wedgeTotal}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {result.summary.wedgePercentage.toFixed(2)}%
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2">Flexural Toppling (All)</td>
                        <td className="px-3 py-2 text-right font-bold">
                          {result.summary.topplingCritical}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {result.summary.topplingTotal}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {result.summary.topplingPercentage.toFixed(2)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-sm">{result.summary.overallAssessment}</p>
              </div>

              <Stereonet
                result={result}
                slopeDip={parseFloat(slopeDip)}
                slopeDipDirection={parseFloat(slopeDipDirection)}
                frictionAngle={parseFloat(phiB)}
                lateralLimit={parseFloat(lateralLimit)}
              />

              {/* planar table */}
              <div>
                <SectionLabel>
                  Planar sliding — {feasiblePlanar.length} feasible
                </SectionLabel>
                <div className="border border-foreground overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-secondary">
                      <tr className="text-left border-b border-foreground">
                        <th className="px-2 py-1.5">Structure</th>
                        <th className="px-2 py-1.5">Dip/DipDir</th>
                        <th className="px-2 py-1.5">W (kN/m)</th>
                        <th className="px-2 py-1.5">σn (kPa)</th>
                        <th className="px-2 py-1.5">c_i (kPa)</th>
                        <th className="px-2 py-1.5">φ_i (°)</th>
                        <th className="px-2 py-1.5">FS</th>
                        <th className="px-2 py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feasiblePlanar.map((p, i) => (
                        <tr
                          key={i}
                          className="border-b border-border align-top"
                        >
                          <td className="px-2 py-1 font-bold">
                            {p.structureId}
                          </td>
                          <td className="px-2 py-1">
                            {p.dip}°/{p.dipDirection}°
                          </td>
                          <td className="px-2 py-1">
                            {p.blockWeightKn ?? "—"}
                          </td>
                          <td className="px-2 py-1">
                            {p.strength?.normalStressKpa ?? "—"}
                          </td>
                          <td className="px-2 py-1">
                            {p.strength?.instantaneousCohesionKpa ?? "—"}
                          </td>
                          <td className="px-2 py-1">
                            {p.strength?.instantaneousFrictionAngle ?? "—"}
                          </td>
                          <td className="px-2 py-1 font-bold">
                            {p.factorOfSafety ?? "—"}
                          </td>
                          <td className={`px-2 py-1 ${statusColor(p.status)}`}>
                            {p.status ?? "—"}
                          </td>
                        </tr>
                      ))}
                      {!feasiblePlanar.length && (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-3 py-6 text-center text-muted-foreground"
                          >
                            No feasible planar cases.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* wedge table */}
              <div>
                <SectionLabel>
                  Wedge sliding — {result.summary.wedgeCritical} Critical /{" "}
                  {result.summary.wedgeTotal} Total /{" "}
                  {result.summary.wedgePercentage.toFixed(2)}%
                </SectionLabel>
                <div className="border border-foreground overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-secondary">
                      <tr className="text-left border-b border-foreground">
                        <th className="px-2 py-1.5">Pair</th>
                        <th className="px-2 py-1.5">Intersection T/P</th>
                        <th className="px-2 py-1.5">W (kN)</th>
                        <th className="px-2 py-1.5">c_i (kPa)</th>
                        <th className="px-2 py-1.5">φ_i (°)</th>
                        <th className="px-2 py-1.5">FS</th>
                        <th className="px-2 py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feasibleWedge.map((w, i) => (
                        <tr key={i} className="border-b border-border">
                          <td className="px-2 py-1 font-bold">
                            {w.pair.join(" × ")}
                          </td>
                          <td className="px-2 py-1">
                            {w.lineOfIntersection.trend}°/
                            {w.lineOfIntersection.plunge}°
                          </td>
                          <td className="px-2 py-1">
                            {w.blockWeightKn ?? "—"}
                          </td>
                          <td className="px-2 py-1">
                            {w.strength?.instantaneousCohesionKpa ?? "—"}
                          </td>
                          <td className="px-2 py-1">
                            {w.strength?.instantaneousFrictionAngle ?? "—"}
                          </td>
                          <td className="px-2 py-1 font-bold">
                            {w.factorOfSafety ?? "—"}
                          </td>
                          <td className={`px-2 py-1 ${statusColor(w.status)}`}>
                            {w.status ?? "—"}
                          </td>
                        </tr>
                      ))}
                      {!feasibleWedge.length && (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-3 py-6 text-center text-muted-foreground"
                          >
                            No feasible wedge pairs.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* toppling table */}
              <div>
                <SectionLabel>
                  Toppling — {result.summary.topplingCritical} Critical /{" "}
                  {result.summary.topplingTotal} Total /{" "}
                  {result.summary.topplingPercentage.toFixed(2)}%
                </SectionLabel>
                <div className="border border-foreground overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-secondary">
                      <tr className="text-left border-b border-foreground">
                        <th className="px-2 py-1.5">Structure</th>
                        <th className="px-2 py-1.5">Dip/DipDir</th>
                        <th className="px-2 py-1.5">Mode</th>
                        <th className="px-2 py-1.5">W (kN)</th>
                        <th className="px-2 py-1.5">c_i (kPa)</th>
                        <th className="px-2 py-1.5">φ_i (°)</th>
                        <th className="px-2 py-1.5">FS</th>
                        <th className="px-2 py-1.5">Status</th>
                        <th className="px-2 py-1.5">Assessment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feasibleToppling.map((t, i) => (
                        <tr key={i} className="border-b border-border">
                          <td className="px-2 py-1 font-bold">
                            {t.structureId}
                          </td>
                          <td className="px-2 py-1">
                            {t.dip}°/{t.dipDirection}°
                          </td>
                          <td className="px-2 py-1">{t.mode}</td>
                          <td className="px-2 py-1">
                            {t.blockWeightKn ?? "—"}
                          </td>
                          <td className="px-2 py-1">
                            {t.strength?.instantaneousCohesionKpa ?? "—"}
                          </td>
                          <td className="px-2 py-1">
                            {t.strength?.instantaneousFrictionAngle ?? "—"}
                          </td>
                          <td className="px-2 py-1 font-bold">
                            {t.factorOfSafety ?? "—"}
                          </td>
                          <td className={`px-2 py-1 ${statusColor(t.status)}`}>
                            {t.status ?? "—"}
                          </td>
                          <td className="px-2 py-1 text-muted-foreground">
                            {t.reasons[0]}
                          </td>
                        </tr>
                      ))}
                      {!feasibleToppling.length && (
                        <tr>
                          <td
                            colSpan={10}
                            className="px-3 py-6 text-center text-muted-foreground"
                          >
                            No feasible toppling cases.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-xs text-muted-foreground border-t border-border pt-3">
                Method notes: kinematic screening uses Markland-type tests
                (planar/wedge) and the Goodman–Bray slip condition (flexural
                toppling). Shear strength follows Barton–Bandis, τ = σn·tan(φb +
                JRC·log10(JCS/σn)); the instantaneous cohesion and friction
                angle are the tangent line to that envelope at the block's
                normal stress. Block weights assume a unit-thickness planar
                block and a tetrahedral wedge approximation. Results are
                screening-level — detailed design should use dedicated
                limit-equilibrium or numerical software.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
