/**
 * DXF parsing for the Drillhole planning module.
 * Converts a DXF file into a compact geometry JSON the client can render as SVG.
 */
import DxfParser from "dxf-parser";

export interface DxfSegment {
  type: "polyline" | "line";
  layer: string;
  points: [number, number][];
}

export interface DxfPoint {
  type: "point" | "circle" | "insert";
  layer: string;
  x: number;
  y: number;
  r?: number;
}

export interface DxfText {
  type: "text";
  layer: string;
  x: number;
  y: number;
  text: string;
  height?: number;
}

export interface DxfGeometry {
  segments: DxfSegment[];
  points: DxfPoint[];
  texts: DxfText[];
  layers: string[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  entityCount: number;
}

const MAX_ENTITIES = 20000;
const MAX_VERTICES_PER_POLY = 5000;

export function parseDxf(content: string): DxfGeometry {
  const parser = new DxfParser();
  const dxf = parser.parseSync(content);
  if (!dxf || !dxf.entities) {
    throw new Error("Could not parse DXF file: no entities found");
  }

  const segments: DxfSegment[] = [];
  const points: DxfPoint[] = [];
  const texts: DxfText[] = [];
  const layerSet = new Set<string>();
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let count = 0;

  const extend = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const ent of dxf.entities as any[]) {
    if (count >= MAX_ENTITIES) break;
    const layer = ent.layer || "0";

    if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      const verts = (ent.vertices || [])
        .slice(0, MAX_VERTICES_PER_POLY)
        .filter((v: any) => Number.isFinite(v?.x) && Number.isFinite(v?.y))
        .map((v: any) => [round(v.x), round(v.y)] as [number, number]);
      if (verts.length >= 2) {
        if (ent.shape) verts.push(verts[0]); // closed polyline
        verts.forEach(([x, y]: [number, number]) => extend(x, y));
        segments.push({ type: "polyline", layer, points: verts });
        layerSet.add(layer);
        count++;
      }
    } else if (ent.type === "LINE") {
      const vs = ent.vertices || [];
      if (vs.length >= 2 && Number.isFinite(vs[0]?.x) && Number.isFinite(vs[1]?.x)) {
        const pts: [number, number][] = [
          [round(vs[0].x), round(vs[0].y)],
          [round(vs[1].x), round(vs[1].y)],
        ];
        pts.forEach(([x, y]) => extend(x, y));
        segments.push({ type: "line", layer, points: pts });
        layerSet.add(layer);
        count++;
      }
    } else if (ent.type === "POINT") {
      const p = ent.position;
      if (p && Number.isFinite(p.x)) {
        points.push({ type: "point", layer, x: round(p.x), y: round(p.y) });
        extend(p.x, p.y);
        layerSet.add(layer);
        count++;
      }
    } else if (ent.type === "CIRCLE" || ent.type === "ARC") {
      const c = ent.center;
      if (c && Number.isFinite(c.x)) {
        points.push({ type: "circle", layer, x: round(c.x), y: round(c.y), r: round(ent.radius || 1) });
        extend(c.x - (ent.radius || 0), c.y - (ent.radius || 0));
        extend(c.x + (ent.radius || 0), c.y + (ent.radius || 0));
        layerSet.add(layer);
        count++;
      }
    } else if (ent.type === "TEXT" || ent.type === "MTEXT") {
      const p = ent.startPoint || ent.position;
      const raw = typeof ent.text === "string" ? ent.text : "";
      if (p && Number.isFinite(p.x) && raw) {
        texts.push({
          type: "text",
          layer,
          x: round(p.x),
          y: round(p.y),
          text: raw.replace(/\\[A-Za-z][^;]*;/g, "").slice(0, 80),
          height: ent.textHeight ? round(ent.textHeight) : undefined,
        });
        extend(p.x, p.y);
        layerSet.add(layer);
        count++;
      }
    } else if (ent.type === "INSERT") {
      const p = ent.position;
      if (p && Number.isFinite(p.x)) {
        points.push({ type: "insert", layer, x: round(p.x), y: round(p.y) });
        extend(p.x, p.y);
        layerSet.add(layer);
        count++;
      }
    }
  }

  if (count === 0 || !Number.isFinite(minX)) {
    throw new Error("DXF parsed but contains no drawable 2D entities (lines, polylines, points, circles, text)");
  }

  return {
    segments,
    points,
    texts,
    layers: Array.from(layerSet).sort(),
    bounds: { minX: round(minX), minY: round(minY), maxX: round(maxX), maxY: round(maxY) },
    entityCount: count,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
