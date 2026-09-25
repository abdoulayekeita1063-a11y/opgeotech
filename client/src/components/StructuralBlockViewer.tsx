import { useMemo, useState } from "react";
import { Rotate3D, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ModuleHeader";

type StructurePoint = {
  id: number;
  structureId: string | null;
  structureType: string;
  easting: number | null;
  northing: number | null;
  elevation: number | null;
};

type Vec3 = { x: number; y: number; z: number };
type ProjectedPoint = StructurePoint & { point: Vec3; sx: number; sy: number; depth: number };

const COLORS: Record<string, string> = {
  joint: "#111111",
  fault: "#d71920",
  bedding: "#1769aa",
  foliation: "#7b1fa2",
  shear: "#ef6c00",
  vein: "#00897b",
  contact: "#5d4037",
};

function colorFor(type: string) {
  return COLORS[type] ?? "#555555";
}

function rotate(point: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x = point.x * cy - point.z * sy;
  const z = point.x * sy + point.z * cy;
  return { x, y: point.y * cp - z * sp, z: point.y * sp + z * cp };
}

function formatMetric(value: number) {
  return Math.abs(value) >= 10000 ? value.toFixed(0) : value.toFixed(2);
}

export function StructuralBlockViewer({ structures }: { structures: StructurePoint[] }) {
  const [yaw, setYaw] = useState(-0.65);
  const [pitch, setPitch] = useState(0.42);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const points = useMemo(() => structures.filter(s =>
    Number.isFinite(s.easting) && Number.isFinite(s.northing) && Number.isFinite(s.elevation)
  ), [structures]);

  const model = useMemo(() => {
    if (!points.length) return { projected: [] as ProjectedPoint[], edges: [] as Array<[number, number]>, bounds: null };
    const min = {
      x: Math.min(...points.map(p => p.easting as number)),
      y: Math.min(...points.map(p => p.northing as number)),
      z: Math.min(...points.map(p => p.elevation as number)),
    };
    const max = {
      x: Math.max(...points.map(p => p.easting as number)),
      y: Math.max(...points.map(p => p.northing as number)),
      z: Math.max(...points.map(p => p.elevation as number)),
    };
    const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
    const span = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1);
    const projected = points.map(point => {
      const rotated = rotate({
        x: ((point.easting as number) - center.x) / span,
        y: ((point.elevation as number) - center.z) / span,
        z: ((point.northing as number) - center.y) / span,
      }, yaw, pitch);
      return {
        ...point,
        point: rotated,
        sx: 320 + rotated.x * 400 * zoom,
        sy: 230 - rotated.y * 400 * zoom,
        depth: rotated.z,
      };
    });
    const edges: Array<[number, number]> = [];
    // Connect each point to its two nearest mapped neighbours as a transparent
    // screening network for potential block boundaries.
    points.forEach((a, i) => {
      const neighbours = points.map((b, j) => ({ j, d: j === i ? Infinity : Math.hypot(
        (a.easting as number) - (b.easting as number),
        (a.northing as number) - (b.northing as number),
        (a.elevation as number) - (b.elevation as number),
      )})).sort((u, v) => u.d - v.d).slice(0, 2);
      neighbours.forEach(({ j }) => {
        const edge: [number, number] = i < j ? [i, j] : [j, i];
        if (!edges.some(existing => existing[0] === edge[0] && existing[1] === edge[1])) edges.push(edge);
      });
    });
    return { projected, edges, bounds: { min, max, span } };
  }, [points, yaw, pitch, zoom]);

  const reset = () => { setYaw(-0.65); setPitch(0.42); setZoom(1); };
  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setLastPointer({ x: event.clientX, y: event.clientY });
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging || !lastPointer) return;
    setYaw(value => value + (event.clientX - lastPointer.x) * 0.01);
    setPitch(value => Math.max(-1.2, Math.min(1.2, value + (event.clientY - lastPointer.y) * 0.01)));
    setLastPointer({ x: event.clientX, y: event.clientY });
  };
  const onPointerUp = () => { setDragging(false); setLastPointer(null); };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3 mb-2">
        <SectionLabel>3D block view — Easting / Northing / Elevation</SectionLabel>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="rounded-none border-foreground" onClick={() => setZoom(value => Math.min(2.5, value + 0.15))} aria-label="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="sm" className="rounded-none border-foreground" onClick={() => setZoom(value => Math.max(0.5, value - 0.15))} aria-label="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="sm" className="rounded-none border-foreground" onClick={reset}><Rotate3D className="h-3.5 w-3.5 mr-1" />Reset</Button>
        </div>
      </div>
      <div className="border border-foreground bg-slate-950 overflow-hidden">
        {points.length < 1 ? (
          <div className="h-[360px] flex items-center justify-center px-6 text-center text-sm text-slate-300 font-mono">
            Add Easting, Northing and Elevation to mapped structures to activate the 3D block view.
          </div>
        ) : (
          <svg
            viewBox="0 0 640 460"
            className={dragging ? "w-full h-auto cursor-grabbing" : "w-full h-auto cursor-grab"}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="img"
            aria-label="Interactive three-dimensional structural block view"
          >
            <defs>
              <linearGradient id="blockGrid" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#334155" /><stop offset="1" stopColor="#0f172a" /></linearGradient>
            </defs>
            <rect width="640" height="460" fill="url(#blockGrid)" />
            <g opacity="0.35" stroke="#94a3b8" strokeWidth="1">
              <path d="M40 390H600M70 350H570M100 310H540" />
              <path d="M90 420L220 365M190 420L320 365M290 420L420 365M390 420L520 365" />
            </g>
            <text x="28" y="30" fill="#cbd5e1" fontSize="12" fontFamily="IBM Plex Mono">DRAG TO ROTATE · USE BUTTONS TO ZOOM</text>
            <text x="570" y="430" fill="#94a3b8" fontSize="12" fontFamily="IBM Plex Mono">E →</text>
            <text x="42" y="432" fill="#94a3b8" fontSize="12" fontFamily="IBM Plex Mono">N ↑</text>
            <text x="310" y="32" fill="#94a3b8" fontSize="12" fontFamily="IBM Plex Mono">RL / Z</text>
            {model.edges.map(([a, b]) => {
              const p = model.projected[a];
              const q = model.projected[b];
              return <line key={`${p.id}-${q.id}`} x1={p.sx} y1={p.sy} x2={q.sx} y2={q.sy} stroke="#f59e0b" strokeWidth="2" opacity="0.58" />;
            })}
            {model.projected.slice().sort((a, b) => a.depth - b.depth).map(point => {
              const selected = selectedId === point.id;
              return (
                <g key={point.id} onClick={() => setSelectedId(point.id)}>
                  <circle cx={point.sx} cy={point.sy} r={selected ? 9 : 6} fill={colorFor(point.structureType)} stroke={selected ? "#fff" : "#0f172a"} strokeWidth={selected ? 3 : 1.5} />
                  {selected && <text x={point.sx + 12} y={point.sy - 10} fill="#fff" fontSize="12" fontFamily="IBM Plex Mono">{point.structureId || `#${point.id}`}</text>}
                </g>
              );
            })}
            {selectedId && (() => {
              const selected = model.projected.find(point => point.id === selectedId);
              if (!selected) return null;
              return <text x="24" y="402" fill="#f8fafc" fontSize="12" fontFamily="IBM Plex Mono">Selected {selected.structureId || `#${selected.id}`} · E {formatMetric(selected.easting!)} · N {formatMetric(selected.northing!)} · RL {formatMetric(selected.elevation!)}</text>;
            })()}
          </svg>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs font-mono text-muted-foreground">
        <span><b className="text-foreground">{points.length}</b> coordinate points</span>
        <span><b className="text-foreground">{model.edges.length}</b> nearest-neighbour block edges</span>
        {structures.length > points.length && <span>{structures.length - points.length} structures without complete coordinates hidden</span>}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2 font-mono">Screening visualization only: the yellow network indicates nearest-neighbour block connections; engineering block geometry should be confirmed with a surveyed surface and structural model.</p>
    </div>
  );
}

export default StructuralBlockViewer;

// Keep this module dependency-free so the visualization remains available offline.
export type { StructurePoint };
