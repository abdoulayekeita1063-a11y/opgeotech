import { useMemo, useRef, useState } from "react";
import { LocateFixed, Minus, Plus, Search } from "lucide-react";
import type {
  BermAnalysisInput,
  BermAnalysisResult,
  BermEntity,
  MultiPolygon,
  XY,
} from "@shared/berm/types";
import { Button } from "@/components/ui/button";

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type DisplayPoint = { x: number; y: number };

type ViewerProps = {
  input: BermAnalysisInput;
  result: BermAnalysisResult | null;
  selectedEntityId?: string | null;
  onSelectedEntityIdChange?: (entityId: string | null) => void;
};

const VIEW_WIDTH = 920;
const VIEW_HEIGHT = 560;
const PADDING = 54;

function finite(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function metric(value: number | null | undefined, unit = "") {
  return finite(value)
    ? `${value!.toLocaleString(undefined, { maximumFractionDigits: 3 })}${unit}`
    : "Not available";
}

function allGeometryPoints(geometries: MultiPolygon[]) {
  return geometries.flatMap(geometry =>
    geometry.flatMap(polygon => polygon.flatMap(ring => ring))
  );
}

function geometryBounds(
  geometries: MultiPolygon[],
  entities: BermEntity[]
): Bounds | null {
  const points = [
    ...allGeometryPoints(geometries),
    ...entities.flatMap(entity =>
      entity.points.map(point => [point.x, point.y] as XY)
    ),
  ].filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (!points.length) return null;
  return {
    minX: Math.min(...points.map(point => point[0])),
    minY: Math.min(...points.map(point => point[1])),
    maxX: Math.max(...points.map(point => point[0])),
    maxY: Math.max(...points.map(point => point[1])),
  };
}

function makeMapper(bounds: Bounds) {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-9);
  const scale = Math.min(
    (VIEW_WIDTH - PADDING * 2) / spanX,
    (VIEW_HEIGHT - PADDING * 2) / spanY
  );
  const usedWidth = spanX * scale;
  const usedHeight = spanY * scale;
  const offsetX = (VIEW_WIDTH - usedWidth) / 2;
  const offsetY = (VIEW_HEIGHT - usedHeight) / 2;
  const map = ([x, y]: XY): DisplayPoint => ({
    x: offsetX + (x - bounds.minX) * scale,
    y: VIEW_HEIGHT - offsetY - (y - bounds.minY) * scale,
  });
  return { map, scale, spanX, spanY };
}

function multiPolygonPath(
  geometry: MultiPolygon,
  map: (point: XY) => DisplayPoint
) {
  return geometry
    .flatMap(polygon =>
      polygon.map(ring => {
        if (!ring.length) return "";
        const first = map(ring[0]);
        return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${ring
          .slice(1)
          .map(coordinate => {
            const point = map(coordinate);
            return `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
          })
          .join(" ")} Z`;
      })
    )
    .join(" ");
}

function entityPath(entity: BermEntity, map: (point: XY) => DisplayPoint) {
  if (!entity.points.length) return "";
  const first = map([entity.points[0].x, entity.points[0].y]);
  const segments = entity.points.slice(1).map(point => {
    const display = map([point.x, point.y]);
    return `L ${display.x.toFixed(2)} ${display.y.toFixed(2)}`;
  });
  return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${segments.join(" ")}${entity.closed ? " Z" : ""}`;
}

function selectedEntities(source: BermAnalysisInput["planned"]) {
  const document = source.document;
  if (!document) return [];
  const accepted = document.entities.filter(
    entity =>
      source.layers.includes(entity.layer) && entity.valid && entity.closed
  );
  return source.entityIds.length
    ? accepted.filter(entity => source.entityIds.includes(entity.id))
    : accepted;
}

function sourceCode(entity: BermEntity, source: "Planned" | "As-Built") {
  return `${source}:${entity.id}`;
}

export default function BermComparisonViewer({
  input,
  result,
  selectedEntityId: controlledEntityId,
  onSelectedEntityIdChange,
}: ViewerProps) {
  const [uncontrolledEntityId, setUncontrolledEntityId] = useState<
    string | null
  >(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const [hover, setHover] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const selectedId =
    controlledEntityId === undefined
      ? uncontrolledEntityId
      : controlledEntityId;

  const entities = useMemo(() => {
    const planned = selectedEntities(input.planned).map(entity => ({
      entity,
      source: "Planned" as const,
    }));
    const asBuilt = selectedEntities(input.asBuilt).map(entity => ({
      entity,
      source: "As-Built" as const,
    }));
    return [...planned, ...asBuilt];
  }, [input.asBuilt, input.planned]);

  const selected = useMemo(
    () =>
      entities.find(
        item => sourceCode(item.entity, item.source) === selectedId
      ) ?? null,
    [entities, selectedId]
  );
  const bounds = useMemo(
    () =>
      geometryBounds(
        result
          ? [
              result.plannedGeometry,
              result.asBuiltGeometry,
              result.overlapGeometry,
              result.missingGeometry,
              result.excessGeometry,
            ]
          : [],
        entities.map(item => item.entity)
      ),
    [entities, result]
  );
  const model = useMemo(() => (bounds ? makeMapper(bounds) : null), [bounds]);

  const setSelection = (next: string | null) => {
    if (controlledEntityId === undefined) setUncontrolledEntityId(next);
    onSelectedEntityIdChange?.(next);
  };
  const fit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const updateZoom = (next: number) =>
    setZoom(Math.max(0.45, Math.min(8, next)));
  const onWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    updateZoom(zoom * (event.deltaY > 0 ? 0.88 : 1.14));
  };
  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPan(current => ({
      x: current.x + ((event.clientX - drag.x) / rect.width) * VIEW_WIDTH,
      y: current.y + ((event.clientY - drag.y) / rect.height) * VIEW_HEIGHT,
    }));
    setDrag({ ...drag, x: event.clientX, y: event.clientY });
  };
  const releasePointer = () => setDrag(null);

  const selectedEntityPath =
    selected && model ? entityPath(selected.entity, model.map) : "";
  const plannedLayers = input.planned.layers.join(", ") || "No layer selected";
  const asBuiltLayers = input.asBuilt.layers.join(", ") || "No layer selected";

  return (
    <section
      className="border border-foreground bg-background"
      aria-labelledby="berm-comparison-map-heading"
    >
      <div className="flex flex-col gap-3 border-b border-foreground bg-secondary px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div id="berm-comparison-map-heading" className="font-bold">
            Measured plan comparison
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Local SVG viewBox only; E/N labels and inspection values retain
            source world coordinates.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="flex items-center gap-2 text-xs font-medium"
            htmlFor="berm-geometry-inspector"
          >
            <Search className="h-3.5 w-3.5" /> Inspect geometry
          </label>
          <select
            id="berm-geometry-inspector"
            className="h-9 max-w-72 border border-foreground bg-background px-2 text-xs"
            value={selectedId ?? ""}
            onChange={event => setSelection(event.target.value || null)}
          >
            <option value="">All selected boundaries</option>
            {entities.map(({ entity, source }) => (
              <option
                key={sourceCode(entity, source)}
                value={sourceCode(entity, source)}
              >
                {source} · {entity.id} · {entity.layer}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-none border-foreground"
            onClick={() => updateZoom(zoom * 1.2)}
            aria-label="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-none border-foreground"
            onClick={() => updateZoom(zoom / 1.2)}
            aria-label="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-none border-foreground"
            onClick={fit}
          >
            <LocateFixed className="mr-1 h-3.5 w-3.5" />
            Fit
          </Button>
        </div>
      </div>

      {!model || !bounds ? (
        <div className="flex min-h-80 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Import selected planned and As-Built DXF geometry, then compute a
          comparison to view coordinate-faithful overlays.
        </div>
      ) : (
        <div className="relative overflow-hidden bg-slate-50">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className={
              drag
                ? "block w-full touch-none cursor-grabbing"
                : "block w-full touch-none cursor-grab"
            }
            style={{ minHeight: 330 }}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={releasePointer}
            onPointerCancel={releasePointer}
            role="img"
            aria-label="Interactive planned and As-Built berm comparison in Easting and Northing coordinates"
          >
            <defs>
              <pattern
                id="berm-grid"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="0.7"
                />
              </pattern>
            </defs>
            <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#f8fafc" />
            <rect
              width={VIEW_WIDTH}
              height={VIEW_HEIGHT}
              fill="url(#berm-grid)"
              opacity="0.65"
            />
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {result && (
                <>
                  <path
                    d={multiPolygonPath(result.overlapGeometry, model.map)}
                    fill="#94a3b8"
                    fillOpacity="0.38"
                    fillRule="evenodd"
                    pointerEvents="none"
                  />
                  <path
                    d={multiPolygonPath(result.missingGeometry, model.map)}
                    fill="#dc2626"
                    fillOpacity="0.30"
                    fillRule="evenodd"
                    pointerEvents="none"
                  />
                  <path
                    d={multiPolygonPath(result.excessGeometry, model.map)}
                    fill="#d97706"
                    fillOpacity="0.30"
                    fillRule="evenodd"
                    pointerEvents="none"
                  />
                  <path
                    d={multiPolygonPath(result.plannedGeometry, model.map)}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth={2.7 / zoom}
                    fillRule="evenodd"
                    pointerEvents="none"
                  />
                  <path
                    d={multiPolygonPath(result.asBuiltGeometry, model.map)}
                    fill="none"
                    stroke="#0f766e"
                    strokeWidth={2.7 / zoom}
                    fillRule="evenodd"
                    pointerEvents="none"
                  />
                  {result.minimumWidthLocation &&
                    (() => {
                      const from = model.map(result.minimumWidthLocation.from);
                      const to = model.map(result.minimumWidthLocation.to);
                      return (
                        <g pointerEvents="none">
                          <line
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke="#dc2626"
                            strokeWidth={4 / zoom}
                          />
                          <circle
                            cx={from.x}
                            cy={from.y}
                            r={4 / zoom}
                            fill="#dc2626"
                          />
                          <circle
                            cx={to.x}
                            cy={to.y}
                            r={4 / zoom}
                            fill="#dc2626"
                          />
                        </g>
                      );
                    })()}
                </>
              )}
              {entities.map(({ entity, source }) => {
                const code = sourceCode(entity, source);
                const active = code === selectedId;
                const color = source === "Planned" ? "#2563eb" : "#0f766e";
                return (
                  <path
                    key={code}
                    d={entityPath(entity, model.map)}
                    fill="none"
                    stroke={active ? "#111827" : color}
                    strokeWidth={(active ? 4 : 1.2) / zoom}
                    strokeDasharray={
                      active ? undefined : `${4 / zoom} ${3 / zoom}`
                    }
                    opacity={active ? 1 : 0.68}
                    onClick={event => {
                      event.stopPropagation();
                      setSelection(code);
                    }}
                    onPointerEnter={event =>
                      setHover({
                        text: `${source} ${entity.id} · ${entity.layer} · ${entity.points.length} vertices`,
                        x: event.clientX,
                        y: event.clientY,
                      })
                    }
                    onPointerMove={event =>
                      setHover({
                        text: `${source} ${entity.id} · ${entity.layer} · ${entity.points.length} vertices`,
                        x: event.clientX,
                        y: event.clientY,
                      })
                    }
                    onPointerLeave={() => setHover(null)}
                  />
                );
              })}
              {selected &&
                selected.entity.points.map((point, index) => {
                  const display = model.map([point.x, point.y]);
                  return (
                    <circle
                      key={`${sourceCode(selected.entity, selected.source)}-${index}`}
                      cx={display.x}
                      cy={display.y}
                      r={3.8 / zoom}
                      fill="#111827"
                      stroke="#ffffff"
                      strokeWidth={1 / zoom}
                      onPointerEnter={event =>
                        setHover({
                          text: `${selected.source} ${selected.entity.id} · vertex ${index + 1}: E ${point.x.toFixed(3)}, N ${point.y.toFixed(3)}, RL ${finite(point.z) ? point.z!.toFixed(3) : "not supplied"}`,
                          x: event.clientX,
                          y: event.clientY,
                        })
                      }
                      onPointerMove={event =>
                        setHover({
                          text: `${selected.source} ${selected.entity.id} · vertex ${index + 1}: E ${point.x.toFixed(3)}, N ${point.y.toFixed(3)}, RL ${finite(point.z) ? point.z!.toFixed(3) : "not supplied"}`,
                          x: event.clientX,
                          y: event.clientY,
                        })
                      }
                      onPointerLeave={() => setHover(null)}
                    />
                  );
                })}
            </g>
            <g
              fontFamily="IBM Plex Mono, monospace"
              fontSize="12"
              fill="#334155"
              pointerEvents="none"
            >
              <rect
                x="12"
                y="12"
                width="298"
                height="64"
                fill="#ffffff"
                fillOpacity="0.92"
                stroke="#cbd5e1"
              />
              <text x="22" y="34">
                E {bounds.minX.toFixed(3)} → {bounds.maxX.toFixed(3)}
              </text>
              <text x="22" y="54">
                N {bounds.minY.toFixed(3)} → {bounds.maxY.toFixed(3)}
              </text>
              <text x="22" y="70" fontSize="10">
                Zoom {zoom.toFixed(2)}× · drag to pan · wheel to zoom
              </text>
            </g>
            <g
              fontFamily="IBM Plex Mono, monospace"
              fontSize="11"
              fill="#1e293b"
              pointerEvents="none"
            >
              <rect
                x={VIEW_WIDTH - 226}
                y="12"
                width="214"
                height="113"
                fill="#ffffff"
                fillOpacity="0.94"
                stroke="#cbd5e1"
              />
              <line
                x1={VIEW_WIDTH - 212}
                y1="32"
                x2={VIEW_WIDTH - 190}
                y2="32"
                stroke="#2563eb"
                strokeWidth="3"
              />
              <text x={VIEW_WIDTH - 182} y="36">
                Planned outline
              </text>
              <line
                x1={VIEW_WIDTH - 212}
                y1="52"
                x2={VIEW_WIDTH - 190}
                y2="52"
                stroke="#0f766e"
                strokeWidth="3"
              />
              <text x={VIEW_WIDTH - 182} y="56">
                As-Built outline
              </text>
              <rect
                x={VIEW_WIDTH - 212}
                y="66"
                width="16"
                height="10"
                fill="#94a3b8"
                fillOpacity="0.6"
              />
              <text x={VIEW_WIDTH - 188} y="75">
                Overlap
              </text>
              <rect
                x={VIEW_WIDTH - 212}
                y="84"
                width="16"
                height="10"
                fill="#dc2626"
                fillOpacity="0.55"
              />
              <text x={VIEW_WIDTH - 188} y="93">
                Missing / min width
              </text>
              <rect
                x={VIEW_WIDTH - 212}
                y="102"
                width="16"
                height="10"
                fill="#d97706"
                fillOpacity="0.55"
              />
              <text x={VIEW_WIDTH - 188} y="111">
                Excess
              </text>
            </g>
          </svg>
          {hover && (
            <div
              className="pointer-events-none fixed z-50 max-w-sm border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-[11px] text-white shadow-lg"
              style={{ left: hover.x + 12, top: hover.y + 12 }}
            >
              {hover.text}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-px border-t border-foreground bg-foreground text-xs md:grid-cols-3">
        <div className="bg-background px-3 py-2">
          <span className="swiss-label block">Berm / selected layers</span>
          <span className="font-medium">
            {input.metadata.bermId || "Berm ID not supplied"}
          </span>
        </div>
        <div className="bg-background px-3 py-2">
          <span className="swiss-label block">Planned source layer(s)</span>
          <span>{plannedLayers}</span>
        </div>
        <div className="bg-background px-3 py-2">
          <span className="swiss-label block">As-Built source layer(s)</span>
          <span>{asBuiltLayers}</span>
        </div>
      </div>
      {selected && (
        <div className="border-t border-foreground bg-slate-50 px-3 py-2 text-xs">
          <strong>
            {selected.source} entity {selected.entity.id}
          </strong>{" "}
          · layer {selected.entity.layer} · {selected.entity.points.length}{" "}
          vertices ·{" "}
          {selected.entity.hasElevation
            ? "elevations supplied"
            : "elevations missing"}{" "}
          · {selected.entity.closed ? "closed boundary" : "open geometry"} ·
          first point E {metric(selected.entity.points[0]?.x)} / N{" "}
          {metric(selected.entity.points[0]?.y)} / RL{" "}
          {metric(selected.entity.points[0]?.z)}
        </div>
      )}
      {result?.minimumWidthLocation && (
        <div className="border-t border-foreground px-3 py-2 text-xs">
          <span className="font-bold text-red-700">
            Minimum sampled width segment:
          </span>{" "}
          {metric(result.minimumWidth, " m")} at station{" "}
          {metric(result.minimumWidthLocation.station, " m")} · E{" "}
          {result.minimumWidthLocation.from[0].toFixed(3)}, N{" "}
          {result.minimumWidthLocation.from[1].toFixed(3)} → E{" "}
          {result.minimumWidthLocation.to[0].toFixed(3)}, N{" "}
          {result.minimumWidthLocation.to[1].toFixed(3)}
        </div>
      )}
    </section>
  );
}

export type { ViewerProps };
