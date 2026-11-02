import DxfParser from "dxf-parser";
import type { BermDxfDocument, BermEntity, SurveyPoint } from "./types";

type RawPoint = { x?: unknown; y?: unknown; z?: unknown };
type RawEntity = Record<string, unknown>;

const MAX_ENTITIES = 50_000;
const MAX_POINTS_PER_ENTITY = 20_000;
const EPSILON = 1e-10;

const INSUNITS: Record<number, { name: string; metres: number | null }> = {
  0: { name: "Unitless", metres: null },
  1: { name: "Inches", metres: 0.0254 },
  2: { name: "Feet", metres: 0.3048 },
  3: { name: "Miles", metres: 1609.344 },
  4: { name: "Millimetres", metres: 0.001 },
  5: { name: "Centimetres", metres: 0.01 },
  6: { name: "Metres", metres: 1 },
  7: { name: "Kilometres", metres: 1000 },
  8: { name: "Microinches", metres: 2.54e-8 },
  9: { name: "Mils", metres: 2.54e-5 },
  10: { name: "Yards", metres: 0.9144 },
  11: { name: "Angstroms", metres: 1e-10 },
  12: { name: "Nanometres", metres: 1e-9 },
  13: { name: "Microns", metres: 1e-6 },
  14: { name: "Decimetres", metres: 0.1 },
  15: { name: "Decametres", metres: 10 },
  16: { name: "Hectometres", metres: 100 },
  17: { name: "Gigametres", metres: 1e9 },
  18: { name: "Astronomical units", metres: 149_597_870_700 },
  19: { name: "Light years", metres: 9.460_730_472_580_8e15 },
  20: { name: "Parsecs", metres: 3.085_677_581_491_367e16 },
};

/**
 * Parses an ASCII DXF into deliberately conservative Berm geometry.
 *
 * Coordinates in returned entities are the original DXF coordinates: no unit or
 * CRS conversion happens here. In particular, omitted group-30 elevations stay
 * null; a 3D POLYLINE flag is not treated as evidence that elevations exist.
 */
export function parseBermDxf(content: string, filename: string): BermDxfDocument {
  const diagnostics: string[] = [];
  const base: BermDxfDocument = {
    filename,
    layers: [],
    entities: [],
    originalEntityCount: 0,
    insunits: null,
    unitName: null,
    unitScale: null,
    diagnostics,
  };

  const structuralProblem = validateAsciiDxf(content, diagnostics);
  if (structuralProblem) return base;

  let parsed: { header?: Record<string, unknown>; entities?: unknown[]; blocks?: Record<string, unknown> } | null;
  try {
    parsed = new DxfParser().parseSync(content) as typeof parsed;
  } catch (error) {
    diagnostics.push(`Malformed DXF: ${formatError(error)}.`);
    return base;
  }

  if (!parsed || !Array.isArray(parsed.entities)) {
    diagnostics.push("Malformed DXF: no ENTITIES section could be parsed.");
    return base;
  }

  const insunits = finiteNumber(parsed.header?.$INSUNITS);
  const declaredUnit = insunits === null ? undefined : INSUNITS[insunits];
  base.insunits = insunits;
  base.unitName = declaredUnit?.name ?? (insunits === null ? null : `Unknown INSUNITS (${insunits})`);
  base.unitScale = declaredUnit?.metres ?? null;
  if (insunits === null) {
    diagnostics.push("DXF $INSUNITS is not declared; confirm a metres-per-unit factor before comparison.");
  } else if (!declaredUnit) {
    diagnostics.push(`DXF $INSUNITS value ${insunits} is unsupported; confirm a metres-per-unit factor before comparison.`);
  }

  base.originalEntityCount = parsed.entities.length;
  if (parsed.entities.length > MAX_ENTITIES) {
    diagnostics.push(`DXF has ${parsed.entities.length} entities; only the first ${MAX_ENTITIES} were inspected.`);
  }

  const layerSet = new Set<string>();
  const duplicateKeys = new Map<string, string>();
  const entities: BermEntity[] = [];

  const inspectedEntities = parsed.entities.slice(0, MAX_ENTITIES);
  for (let index = 0; index < inspectedEntities.length; index += 1) {
    const candidate = inspectedEntities[index];
    if (!isRecord(candidate)) {
      diagnostics.push(`Entity ${index + 1} is malformed and was skipped.`);
      continue;
    }
    const raw = candidate as RawEntity;
    const sourceType = typeof raw.type === "string" ? raw.type : "UNKNOWN";
    const layer = typeof raw.layer === "string" && raw.layer.trim() ? raw.layer : "0";
    layerSet.add(layer);
    const id = entityId(raw, index);
    const entity = parseEntity(raw, id, sourceType, layer, diagnostics);

    if (entity) {
      markDuplicate(entity, duplicateKeys, diagnostics);
      entities.push(entity);
    }
  }

  const blocks = parsed.blocks && isRecord(parsed.blocks) ? Object.keys(parsed.blocks) : [];
  if (blocks.length > 0) {
    diagnostics.push(
      "BLOCK definitions are not expanded. Export the berm as closed LWPOLYLINE/POLYLINE boundaries or triangulated 3DFACE entities, not blocks."
    );
  }

  base.entities = entities;
  base.layers = Array.from(layerSet).sort((a, b) => a.localeCompare(b));
  if (entities.length === 0) {
    diagnostics.push("DXF contains no readable entities.");
  }
  return base;
}

function parseEntity(
  raw: RawEntity,
  id: string,
  sourceType: string,
  layer: string,
  diagnostics: string[]
): BermEntity | null {
  switch (sourceType) {
    case "LWPOLYLINE":
      return parseLwPolyline(raw, id, layer);
    case "POLYLINE":
      return parsePolyline(raw, id, layer);
    case "3DFACE":
      return parseFace(raw, id, layer);
    case "POINT":
      return parsePoint(raw, id, layer);
    case "LINE":
      return parseLine(raw, id, layer);
    case "INSERT":
      return unsupportedEntity(
        id,
        sourceType,
        layer,
        "INSERT/block references are unsupported; explode and export a closed polyline or triangulated 3DFACE."
      );
    default:
      diagnostics.push(
        `Unsupported DXF entity ${sourceType} on layer ${layer}; export berm geometry as a closed LWPOLYLINE/POLYLINE or triangulated 3DFACE.`
      );
      return unsupportedEntity(
        id,
        sourceType,
        layer,
        `Unsupported ${sourceType}; export berm geometry as a closed polyline or triangulated 3DFACE.`
      );
  }
}

function parseLwPolyline(raw: RawEntity, id: string, layer: string): BermEntity {
  const issues: string[] = [];
  const extrusion = extrusionVector(raw);
  if (!isDefaultOcs(extrusion)) {
    issues.push(
      "LWPOLYLINE has a non-default OCS extrusion direction and was excluded; transform it to WCS or export a WCS closed polyline."
    );
  }

  const vertices = toPointArray(raw.vertices, null, issues);
  const elevation = finiteNumber(raw.elevation);
  const points = vertices.map(point => ({ ...point, z: elevation }));
  const hasBulge = asArray(raw.vertices).some(vertex => {
    const bulge = finiteNumber(isRecord(vertex) ? vertex.bulge : undefined);
    return bulge !== null && Math.abs(bulge) > EPSILON;
  });
  if (hasBulge) {
    issues.push(
      "LWPOLYLINE contains bulge arcs and was excluded; tessellate arcs to a documented tolerance before export."
    );
  }

  const closed = raw.shape === true;
  validatePolyline(points, closed, issues);
  return {
    id,
    sourceType: "LWPOLYLINE",
    kind: "polyline",
    layer,
    points,
    closed,
    valid: issues.length === 0,
    hasElevation: points.length > 0 && points.every(point => point.z !== null),
    issues,
  };
}

function parsePolyline(raw: RawEntity, id: string, layer: string): BermEntity {
  const issues: string[] = [];
  if (raw.is3dPolygonMesh === true || raw.is3dPolygonMeshClosed === true || raw.isPolyfaceMesh === true) {
    issues.push(
      "POLYLINE mesh/polyface mesh is unsupported; export the surface as triangulated 3DFACE entities."
    );
  }
  if (!isDefaultOcs(extrusionVector(raw))) {
    issues.push(
      "POLYLINE has a non-default OCS extrusion direction and was excluded; transform it to WCS before export."
    );
  }
  const points = toPointArray(raw.vertices, null, issues);
  const hasBulge = asArray(raw.vertices).some(vertex => {
    const bulge = finiteNumber(isRecord(vertex) ? vertex.bulge : undefined);
    return bulge !== null && Math.abs(bulge) > EPSILON;
  });
  if (hasBulge) {
    issues.push(
      "POLYLINE contains bulge arcs and was excluded; tessellate arcs to a documented tolerance before export."
    );
  }
  const closed = raw.shape === true;
  validatePolyline(points, closed, issues);
  return {
    id,
    sourceType: raw.is3dPolyline === true ? "3D POLYLINE" : "POLYLINE",
    kind: "polyline",
    layer,
    points,
    closed,
    valid: issues.length === 0,
    hasElevation: points.length > 0 && points.every(point => point.z !== null),
    issues,
  };
}

function parseFace(raw: RawEntity, id: string, layer: string): BermEntity {
  const issues: string[] = [];
  const parsed = toPointArray(raw.vertices, null, issues);
  const points = removeRepeatedFaceVertex(parsed);
  if (points.length < 3 || points.length > 4) {
    issues.push("3DFACE must contain three or four readable vertices.");
  }
  if (points.length >= 3) {
    validateSimpleRing(points, issues, "3DFACE projected boundary");
  }
  return {
    id,
    sourceType: "3DFACE",
    kind: "face",
    layer,
    points,
    closed: true,
    valid: issues.length === 0,
    hasElevation: points.length >= 3 && points.every(point => point.z !== null),
    issues,
  };
}

function parsePoint(raw: RawEntity, id: string, layer: string): BermEntity {
  const issues: string[] = [];
  const position = pointFromRaw(raw.position, null);
  if (!position) issues.push("POINT has no finite X/Y coordinate.");
  return {
    id,
    sourceType: "POINT",
    kind: "point",
    layer,
    points: position ? [position] : [],
    closed: false,
    valid: issues.length === 0,
    hasElevation: position?.z !== null && position !== undefined,
    issues,
  };
}

function parseLine(raw: RawEntity, id: string, layer: string): BermEntity {
  const issues: string[] = [];
  const points = toPointArray(raw.vertices, null, issues);
  if (points.length !== 2) issues.push("LINE must have two finite endpoints.");
  return {
    id,
    sourceType: "LINE",
    kind: "line",
    layer,
    points,
    closed: false,
    valid: issues.length === 0,
    hasElevation: points.length === 2 && points.every(point => point.z !== null),
    issues,
  };
}

function unsupportedEntity(id: string, sourceType: string, layer: string, issue: string): BermEntity {
  return {
    id,
    sourceType,
    kind: "line",
    layer,
    points: [],
    closed: false,
    valid: false,
    hasElevation: false,
    issues: [issue],
  };
}

function validateAsciiDxf(content: string, diagnostics: string[]): boolean {
  if (!content || !content.trim()) {
    diagnostics.push("Malformed DXF: file is empty.");
    return true;
  }
  if (/AutoCAD Binary DXF/i.test(content.slice(0, 64)) || content.includes("\u0000")) {
    diagnostics.push("Binary DXF is unsupported. Export an ASCII DXF containing closed polylines or 3DFACE entities.");
    return true;
  }

  const lines = content.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop();
  if (lines.length % 2 !== 0) {
    diagnostics.push("Malformed ASCII DXF: group-code/value lines are not paired.");
    return true;
  }
  for (let index = 0; index < lines.length; index += 2) {
    if (!/^[-+]?\d+$/.test(lines[index]?.trim() ?? "")) {
      diagnostics.push(`Malformed ASCII DXF: invalid group code at line ${index + 1}.`);
      return true;
    }
  }
  if (!/\n\s*2\s*\n\s*ENTITIES\s*(?:\n|$)/i.test(`\n${content}`)) {
    diagnostics.push("Malformed DXF: the ENTITIES section is missing.");
    return true;
  }
  return false;
}

function toPointArray(value: unknown, elevation: number | null, issues: string[]): SurveyPoint[] {
  const rawPoints = asArray(value);
  if (rawPoints.length > MAX_POINTS_PER_ENTITY) {
    issues.push(`Entity exceeds ${MAX_POINTS_PER_ENTITY} vertices and was excluded.`);
    return [];
  }
  const points: SurveyPoint[] = [];
  for (const rawPoint of rawPoints) {
    const point = pointFromRaw(rawPoint, elevation);
    if (!point) {
      issues.push("Entity contains a vertex without finite X/Y coordinates.");
      continue;
    }
    points.push(point);
  }
  return points;
}

function pointFromRaw(value: unknown, fallbackElevation: number | null): SurveyPoint | null {
  if (!isRecord(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  if (x === null || y === null) return null;
  const z = finiteNumber(value.z);
  return { x, y, z: z ?? fallbackElevation };
}

function validatePolyline(points: SurveyPoint[], closed: boolean, issues: string[]) {
  if (points.length < 2) {
    issues.push("POLYLINE has fewer than two readable vertices.");
    return;
  }
  if (closed) {
    validateSimpleRing(points, issues, "Closed polyline");
  }
}

function validateSimpleRing(points: SurveyPoint[], issues: string[], label: string) {
  const ring = removeClosingPoint(points);
  if (ring.length < 3) {
    issues.push(`${label} has fewer than three distinct vertices.`);
    return;
  }
  if (hasRepeatedNonAdjacentPoint(ring)) {
    issues.push(`${label} repeats a non-adjacent vertex and was excluded.`);
    return;
  }
  if (Math.abs(signedArea(ring)) <= EPSILON) {
    issues.push(`${label} has zero projected area and was excluded.`);
    return;
  }
  if (hasSelfIntersection(ring)) {
    issues.push(`${label} self-intersects and was excluded; repair the boundary before export.`);
  }
}

function markDuplicate(entity: BermEntity, duplicates: Map<string, string>, diagnostics: string[]) {
  if (!entity.valid || entity.points.length === 0) return;
  const key = `${entity.kind}|${entity.layer}|${entity.closed}|${entity.points
    .map(point => `${point.x},${point.y},${point.z ?? "null"}`)
    .join(";")}`;
  const original = duplicates.get(key);
  if (original) {
    const message = `Duplicate of entity ${original}; retained for audit and deduplicated by footprint union.`;
    entity.issues.push(message);
    diagnostics.push(`Entity ${entity.id} duplicates ${original}.`);
  } else {
    duplicates.set(key, entity.id);
  }
}

function entityId(raw: RawEntity, index: number): string {
  const handle = raw.handle;
  const stableHandle = typeof handle === "string" || typeof handle === "number" ? String(handle) : undefined;
  return stableHandle ? `dxf-${stableHandle}` : `entity-${index + 1}`;
}

function extrusionVector(raw: RawEntity): [number, number, number] | null {
  const x = finiteNumber(raw.extrusionDirectionX);
  const y = finiteNumber(raw.extrusionDirectionY);
  const z = finiteNumber(raw.extrusionDirectionZ);
  if (x !== null || y !== null || z !== null) return [x ?? 0, y ?? 0, z ?? 0];
  if (isRecord(raw.extrusionDirection)) {
    const ex = finiteNumber(raw.extrusionDirection.x);
    const ey = finiteNumber(raw.extrusionDirection.y);
    const ez = finiteNumber(raw.extrusionDirection.z);
    if (ex !== null || ey !== null || ez !== null) return [ex ?? 0, ey ?? 0, ez ?? 0];
  }
  return null;
}

function isDefaultOcs(vector: [number, number, number] | null): boolean {
  if (!vector) return true;
  return Math.abs(vector[0]) <= EPSILON && Math.abs(vector[1]) <= EPSILON && Math.abs(vector[2] - 1) <= EPSILON;
}

function removeRepeatedFaceVertex(points: SurveyPoint[]): SurveyPoint[] {
  const filtered = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (filtered.length >= 4 && sameXy(filtered[filtered.length - 1]!, filtered[filtered.length - 2]!)) {
    filtered.pop();
  }
  return filtered;
}

function removeClosingPoint(points: SurveyPoint[]): SurveyPoint[] {
  if (points.length > 1 && sameXy(points[0]!, points[points.length - 1]!)) return points.slice(0, -1);
  return points;
}

function hasRepeatedNonAdjacentPoint(points: SurveyPoint[]): boolean {
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      if (sameXy(points[left]!, points[right]!)) return true;
    }
  }
  return false;
}

function hasSelfIntersection(points: SurveyPoint[]): boolean {
  const length = points.length;
  for (let first = 0; first < length; first += 1) {
    const firstEnd = (first + 1) % length;
    for (let second = first + 1; second < length; second += 1) {
      const secondEnd = (second + 1) % length;
      if (first === second || first === secondEnd || firstEnd === second || firstEnd === secondEnd) continue;
      if (segmentsIntersect(points[first]!, points[firstEnd]!, points[second]!, points[secondEnd]!)) return true;
    }
  }
  return false;
}

function segmentsIntersect(a: SurveyPoint, b: SurveyPoint, c: SurveyPoint, d: SurveyPoint): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (Math.abs(o1) <= EPSILON && onSegment(a, b, c)) return true;
  if (Math.abs(o2) <= EPSILON && onSegment(a, b, d)) return true;
  if (Math.abs(o3) <= EPSILON && onSegment(c, d, a)) return true;
  if (Math.abs(o4) <= EPSILON && onSegment(c, d, b)) return true;
  return (o1 > EPSILON && o2 < -EPSILON || o1 < -EPSILON && o2 > EPSILON) && (o3 > EPSILON && o4 < -EPSILON || o3 < -EPSILON && o4 > EPSILON);
}

function orientation(a: SurveyPoint, b: SurveyPoint, c: SurveyPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: SurveyPoint, b: SurveyPoint, point: SurveyPoint): boolean {
  return point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON && point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON;
}

function signedArea(points: SurveyPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]!;
    const point = points[index]!;
    area += point.x * next.y - next.x * point.y;
  }
  return area / 2;
}

function sameXy(left: SurveyPoint, right: SurveyPoint): boolean {
  return Math.abs(left.x - right.x) <= EPSILON && Math.abs(left.y - right.y) <= EPSILON;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
