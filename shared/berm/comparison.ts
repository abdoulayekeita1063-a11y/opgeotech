import * as polygonClipping from "polygon-clipping";
import type {
  BermAnalysisInput,
  BermAnalysisResult,
  BermCheck,
  BermCriteria,
  BermDxfDocument,
  BermEntity,
  BermSource,
  BermStatus,
  BermWidthSample,
  MultiPolygon,
  Polygon,
  SurveyPoint,
  XY,
} from "./types";

type ClipPoint = [number, number];
type ClipRing = ClipPoint[];
type ClipPolygon = ClipRing[];
type ClipMultiPolygon = ClipPolygon[];
type Interval = [number, number];
type Segment3 = { a: SurveyPoint; b: SurveyPoint };
type Footprint = {
  geometry: ClipMultiPolygon;
  area: number | null;
  selected: BermEntity[];
  contributing: BermEntity[];
  issues: string[];
  invalidSelection: boolean;
  origin: XY;
};

const EPSILON = 1e-8;
const MAX_WIDTH_SAMPLES = 1000;
const MAX_DEVIATION_SAMPLES = 1000;

/**
 * Compares closed DXF boundaries and 3DFACE footprint coverage without network
 * access. Polygon operations are performed in a local metre coordinate system;
 * all geometries returned to the UI are restored to their original scaled metre
 * coordinates. Nested closed outlines are intentionally unioned as independent
 * coverage — holes are never inferred from nesting.
 */
export function computeBermComparison(input: BermAnalysisInput): BermAnalysisResult {
  const issues: string[] = [];
  const methodNotes = [
    "Footprint areas are horizontal planimetric areas in square metres. Overlapping selected boundaries/faces are unioned, never summed.",
    "Polygon booleans run in a local metre origin to reduce large-survey-coordinate cancellation; returned visualization coordinates are scaled original coordinates in metres.",
    "Nested closed outlines are treated as independent coverage and unioned; no hole is inferred solely from nesting.",
    "Width is sampled at interior longitudinal stations. At each station every continuous planned transverse span is tested; an absent matching As-Built span has width 0.",
    "Horizontal deviation is a bounded, symmetric sampled boundary point-to-segment distance, not a vertex-to-vertex comparison or a proof of continuous clearance.",
    "Elevation deviation, when available, is a bounded boundary-only interpolated comparison; it is not a full surface-deviation calculation.",
    "3D surface area is reported only for verified, non-overlapping triangular 3DFACE coverage; no TIN or point-cloud surface is invented.",
  ];

  const origin = chooseLocalOrigin(input.planned, input.asBuilt);
  const planned = buildFootprint(input.planned, "Planned", origin);
  const asBuilt = buildFootprint(input.asBuilt, "As-Built", origin);
  addUnique(issues, planned.issues);
  addUnique(issues, asBuilt.issues);

  const compatible = coordinateCompatibility(input.planned, input.asBuilt, input.criteria);
  if (!compatible.ok) addUnique(issues, compatible.issues);

  let overlap: ClipMultiPolygon = [];
  let missing: ClipMultiPolygon = [];
  let excess: ClipMultiPolygon = [];
  let overlapArea: number | null = null;
  let missingArea: number | null = null;
  let excessArea: number | null = null;
  let absoluteAreaDifference: number | null = null;
  let areaDeviationPct: number | null = null;

  if (compatible.ok && planned.geometry.length > 0 && asBuilt.geometry.length > 0) {
    try {
      overlap = polygonClipping.intersection(planned.geometry, asBuilt.geometry) as ClipMultiPolygon;
      missing = polygonClipping.difference(planned.geometry, asBuilt.geometry) as ClipMultiPolygon;
      excess = polygonClipping.difference(asBuilt.geometry, planned.geometry) as ClipMultiPolygon;
      overlapArea = multiPolygonArea(overlap);
      missingArea = multiPolygonArea(missing);
      excessArea = multiPolygonArea(excess);
      absoluteAreaDifference = Math.abs((asBuilt.area ?? 0) - (planned.area ?? 0));
      if (planned.area !== null && planned.area > EPSILON && asBuilt.area !== null) {
        areaDeviationPct = ((asBuilt.area - planned.area) / planned.area) * 100;
      }
    } catch (error) {
      issues.push(`Footprint comparison could not be completed: ${formatError(error)}.`);
    }
  } else if (planned.geometry.length === 0 || asBuilt.geometry.length === 0) {
    issues.push("Comparison requires a valid selected closed boundary or 3DFACE footprint for both Planned and As-Built surveys.");
  }

  const width = computeWidths(planned.geometry, asBuilt.geometry, input.widthBearing, input.sampleSpacing, origin);
  addUnique(issues, width.issues);
  addUnique(methodNotes, width.notes);

  const horizontalDeviation = compatible.ok
    ? computeHorizontalDeviation(planned.geometry, asBuilt.geometry)
    : { value: null, note: "Horizontal deviation was not computed because coordinate compatibility is unconfirmed." };
  if (horizontalDeviation.note) methodNotes.push(horizontalDeviation.note);

  const elevation = compatible.ok
    ? computeElevationDeviation(planned, asBuilt, input, origin)
    : { value: null, issue: "Elevation deviation was not computed because coordinate compatibility is unconfirmed." };
  if (elevation.issue) issues.push(elevation.issue);

  const surface = computeSurfaceArea(asBuilt, input.asBuilt, origin);
  if (surface.issue) issues.push(surface.issue);

  const checks = buildChecks({
    input,
    compatible,
    planned,
    asBuilt,
    areaDeviationPct,
    minimumWidth: width.minimumWidth,
    horizontalDeviation: horizontalDeviation.value,
    elevationDeviation: elevation.value,
  });
  const status = overallStatus(checks);

  return {
    status,
    plannedGeometry: restoreMultiPolygon(planned.geometry, origin),
    asBuiltGeometry: restoreMultiPolygon(asBuilt.geometry, origin),
    overlapGeometry: restoreMultiPolygon(overlap, origin),
    missingGeometry: restoreMultiPolygon(missing, origin),
    excessGeometry: restoreMultiPolygon(excess, origin),
    plannedArea: planned.area,
    asBuiltArea: asBuilt.area,
    absoluteAreaDifference,
    areaDeviationPct,
    overlapArea,
    missingArea,
    excessArea,
    plannedWidth: width.plannedWidth,
    asBuiltWidth: width.asBuiltWidth,
    minimumWidth: width.minimumWidth,
    widthSamples: width.samples,
    minimumWidthLocation: width.minimumWidthLocation,
    horizontalDeviation: horizontalDeviation.value,
    elevationDeviation: elevation.value,
    asBuiltSurfaceArea3D: surface.value,
    checks,
    issues: uniqueStrings(issues),
    methodNotes: uniqueStrings(methodNotes),
  };
}

function chooseLocalOrigin(planned: BermSource, asBuilt: BermSource): XY {
  const sources = [planned, asBuilt];
  for (const source of sources) {
    const scale = sourceScale(source);
    const point = source.document?.entities.find(entity => entity.points.length > 0)?.points[0];
    if (scale !== null && point) return [point.x * scale, point.y * scale];
  }
  return [0, 0];
}

function buildFootprint(source: BermSource, label: string, origin: XY): Footprint {
  const issues: string[] = [];
  const scale = sourceScale(source);
  const selected = selectEntities(source, issues, label);
  const invalidSelection = selected.some(entity => {
    if (entity.kind !== "polyline" && entity.kind !== "face") return false;
    return !entity.valid || (entity.kind === "polyline" && !entity.closed);
  });

  if (scale === null) {
    issues.push(`${label} unitsToMetres must be a positive finite conversion factor; metre geometry cannot be calculated.`);
    return { geometry: [], area: null, selected, contributing: [], issues, invalidSelection, origin };
  }

  const polygons: ClipPolygon[] = [];
  const contributing: BermEntity[] = [];
  for (const entity of selected) {
    if (entity.kind !== "polyline" && entity.kind !== "face") continue;
    if (!entity.valid) {
      addUnique(issues, entity.issues.map(issue => `${label} ${entity.id}: ${issue}`));
      continue;
    }
    if (entity.kind === "polyline" && !entity.closed) {
      issues.push(`${label} ${entity.id} is an open polyline and cannot define a footprint; export a closed boundary.`);
      continue;
    }
    const ring = entityToLocalRing(entity, scale, origin);
    const ringIssue = validateRing(ring);
    if (ringIssue) {
      issues.push(`${label} ${entity.id} was excluded: ${ringIssue}`);
      continue;
    }
    polygons.push([ring]);
    contributing.push(entity);
  }

  if (polygons.length === 0) {
    issues.push(`${label} has no valid selected closed boundary or 3DFACE footprint coverage.`);
    return { geometry: [], area: null, selected, contributing, issues, invalidSelection, origin };
  }
  if (hasNestedOutlines(polygons)) {
    issues.push(`${label} contains nested closed outlines; inner outlines are treated as independent coverage and unioned, not inferred as holes.`);
  }

  try {
    const geometry = unionPolygons(polygons);
    const area = multiPolygonArea(geometry);
    if (!Number.isFinite(area) || area <= EPSILON) {
      issues.push(`${label} unioned footprint has zero area.`);
      return { geometry: [], area: null, selected, contributing, issues, invalidSelection, origin };
    }
    return { geometry, area, selected, contributing, issues, invalidSelection, origin };
  } catch (error) {
    issues.push(`${label} footprint union failed: ${formatError(error)}.`);
    return { geometry: [], area: null, selected, contributing, issues, invalidSelection, origin };
  }
}

function selectEntities(source: BermSource, issues: string[], label: string): BermEntity[] {
  const document = source.document;
  if (!document) {
    issues.push(`${label} DXF document is missing.`);
    return [];
  }
  addUnique(issues, document.diagnostics.map(diagnostic => `${label} DXF: ${diagnostic}`));
  const ids = new Set(source.entityIds);
  if (ids.size > 0) {
    const selected = document.entities.filter(entity => ids.has(entity.id));
    const found = new Set(selected.map(entity => entity.id));
    for (const id of Array.from(ids)) {
      if (!found.has(id)) issues.push(`${label} selected entity ${id} was not found in its DXF document.`);
    }
    return selected;
  }

  const configuredLayers = source.layers.filter(layer => layer.trim().length > 0);
  const layers = new Set(configuredLayers.length > 0 ? configuredLayers : document.layers);
  if (layers.size === 0) {
    issues.push(`${label} has no selected layers.`);
    return [];
  }
  return document.entities.filter(entity => layers.has(entity.layer));
}

function coordinateCompatibility(planned: BermSource, asBuilt: BermSource, criteria: BermCriteria): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (sourceScale(planned) === null || sourceScale(asBuilt) === null) {
    issues.push("Planned and As-Built both require confirmed positive metres-per-unit factors before comparison KPIs are reported.");
  }
  const plannedCrs = normalizeIdentifier(planned.crs);
  const asBuiltCrs = normalizeIdentifier(asBuilt.crs);
  if (!plannedCrs || !asBuiltCrs) {
    issues.push("Both Planned and As-Built CRS identifiers are required before comparison KPIs are reported.");
  } else if (plannedCrs !== asBuiltCrs) {
    issues.push(`CRS mismatch: Planned (${planned.crs}) and As-Built (${asBuilt.crs}) cannot be compared.`);
  }
  if (!criteria.crsConfirmed) {
    issues.push("Coordinate comparison has not been explicitly confirmed for this survey pair.");
  }
  return { ok: issues.length === 0, issues };
}

function sourceScale(source: BermSource): number | null {
  const value = source.unitsToMetres;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function entityToLocalRing(entity: BermEntity, scale: number, origin: XY): ClipRing {
  const raw = removeClosingSurveyPoint(entity.points);
  const ring = raw.map(point => [localCoordinate(point.x, scale, origin[0]), localCoordinate(point.y, scale, origin[1])] as ClipPoint);
  if (ring.length > 0) ring.push([...ring[0]!] as ClipPoint);
  return ring;
}

function localCoordinate(value: number, scale: number, origin: number): number {
  // Subtract in the source unit before scaling, avoiding cancellation near large
  // mine-grid coordinates. origin / scale is deliberately the local reference.
  return (value - origin / scale) * scale;
}

function unionPolygons(polygons: ClipPolygon[]): ClipMultiPolygon {
  if (polygons.length === 1) return polygons[0] ? [polygons[0]] : [];
  return polygonClipping.union(polygons[0]!, ...polygons.slice(1)) as ClipMultiPolygon;
}

function validateRing(ring: ClipRing): string | null {
  if (ring.length < 4) return "fewer than three vertices";
  const open = ring.slice(0, -1);
  if (Math.abs(ringArea(open)) <= EPSILON) return "zero projected area";
  for (let left = 0; left < open.length; left += 1) {
    for (let right = left + 1; right < open.length; right += 1) {
      if (samePoint(open[left]!, open[right]!)) return "repeated non-adjacent vertex";
    }
  }
  if (ringSelfIntersects(open)) return "self-intersecting boundary";
  return null;
}

function hasNestedOutlines(polygons: ClipPolygon[]): boolean {
  for (let outer = 0; outer < polygons.length; outer += 1) {
    for (let inner = outer + 1; inner < polygons.length; inner += 1) {
      const left = polygons[outer]?.[0];
      const right = polygons[inner]?.[0];
      if (!left || !right || left.length < 4 || right.length < 4) continue;
      if (pointInRing(left[0]!, right) || pointInRing(right[0]!, left)) return true;
    }
  }
  return false;
}

function computeWidths(
  planned: ClipMultiPolygon,
  asBuilt: ClipMultiPolygon,
  widthBearing: number | null,
  sampleSpacing: number,
  origin: XY
): {
  plannedWidth: number | null;
  asBuiltWidth: number | null;
  minimumWidth: number | null;
  samples: BermWidthSample[];
  minimumWidthLocation: BermWidthSample | null;
  issues: string[];
  notes: string[];
} {
  const issues: string[] = [];
  const notes: string[] = [];
  if (planned.length === 0 || asBuilt.length === 0) {
    issues.push("Widths require valid Planned and As-Built footprints.");
    return emptyWidths(issues, notes);
  }
  if (typeof widthBearing !== "number" || !Number.isFinite(widthBearing)) {
    issues.push("Widths are unavailable: provide a finite transverse width bearing clockwise from North.");
    return emptyWidths(issues, notes);
  }
  if (!Number.isFinite(sampleSpacing) || sampleSpacing <= 0) {
    issues.push("Widths are unavailable: sample spacing must be a positive finite number of metres.");
    return emptyWidths(issues, notes);
  }

  const radians = ((widthBearing % 360) * Math.PI) / 180;
  const transverse: XY = [Math.sin(radians), Math.cos(radians)];
  const longitudinal: XY = [Math.cos(radians), -Math.sin(radians)];
  const tRange = projectionRange(planned, longitudinal);
  if (!tRange || tRange[1] - tRange[0] <= EPSILON) {
    issues.push("Widths are unavailable: the Planned footprint has no measurable longitudinal extent for this bearing.");
    return emptyWidths(issues, notes);
  }

  const range = tRange[1] - tRange[0];
  const requestedCount = Math.max(1, Math.ceil(range / sampleSpacing) - 1);
  const count = Math.min(MAX_WIDTH_SAMPLES, requestedCount);
  const effectiveSpacing = range / (count + 1);
  if (requestedCount > MAX_WIDTH_SAMPLES) {
    notes.push(`Width sampling was capped at ${MAX_WIDTH_SAMPLES} interior stations; effective spacing is ${formatNumber(effectiveSpacing)} m.`);
  } else {
    notes.push(`Width sampling used ${count} interior station(s) at effective spacing ${formatNumber(effectiveSpacing)} m.`);
  }

  const samples: BermWidthSample[] = [];
  for (let index = 1; index <= count; index += 1) {
    const station = tRange[0] + effectiveSpacing * index;
    const plannedSpans = crossSectionIntervals(planned, station, longitudinal, transverse);
    const asBuiltSpans = crossSectionIntervals(asBuilt, station, longitudinal, transverse);
    for (const plannedSpan of plannedSpans) {
      const match = bestIntersectingSpan(plannedSpan, asBuiltSpans);
      const asBuiltWidth = match ? match[1] - match[0] : 0;
      const displaySpan = match ?? plannedSpan;
      samples.push({
        station,
        plannedWidth: plannedSpan[1] - plannedSpan[0],
        asBuiltWidth,
        from: restorePoint(pointFromAxes(station, displaySpan[0], longitudinal, transverse), origin),
        to: restorePoint(pointFromAxes(station, displaySpan[1], longitudinal, transverse), origin),
      });
    }
  }

  if (samples.length === 0) {
    issues.push("Widths are unavailable: no interior planned cross-section spans were found for this bearing.");
    return emptyWidths(issues, notes);
  }
  const plannedWidth = average(samples.map(sample => sample.plannedWidth));
  const asBuiltWidth = average(samples.map(sample => sample.asBuiltWidth));
  let minimumWidthLocation = samples[0]!;
  for (const sample of samples.slice(1)) {
    if (sample.asBuiltWidth < minimumWidthLocation.asBuiltWidth) minimumWidthLocation = sample;
  }
  return {
    plannedWidth,
    asBuiltWidth,
    minimumWidth: minimumWidthLocation.asBuiltWidth,
    samples,
    minimumWidthLocation,
    issues,
    notes,
  };
}

function emptyWidths(issues: string[], notes: string[]) {
  return {
    plannedWidth: null,
    asBuiltWidth: null,
    minimumWidth: null,
    samples: [],
    minimumWidthLocation: null,
    issues,
    notes,
  };
}

function projectionRange(geometry: ClipMultiPolygon, direction: XY): Interval | null {
  let min = Infinity;
  let max = -Infinity;
  forEachPoint(geometry, point => {
    const projection = dot(point, direction);
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  });
  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : null;
}

function crossSectionIntervals(geometry: ClipMultiPolygon, station: number, longitudinal: XY, transverse: XY): Interval[] {
  const intervals: Interval[] = [];
  for (const polygon of geometry) {
    const crossings: number[] = [];
    for (const ring of polygon) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        const start = ring[index]!;
        const end = ring[index + 1]!;
        const startT = dot(start, longitudinal);
        const endT = dot(end, longitudinal);
        // Half-open crossing convention avoids double-counting vertices. Interior
        // stations avoid intentional endpoint-zero artefacts.
        if ((startT <= station && endT > station) || (endT <= station && startT > station)) {
          const fraction = (station - startT) / (endT - startT);
          crossings.push(dot(start, transverse) + fraction * (dot(end, transverse) - dot(start, transverse)));
        }
      }
    }
    crossings.sort((left, right) => left - right);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const start = crossings[index]!;
      const end = crossings[index + 1]!;
      if (end - start > EPSILON) intervals.push([start, end]);
    }
  }
  return mergeIntervals(intervals);
}

function bestIntersectingSpan(planned: Interval, asBuilt: Interval[]): Interval | null {
  let candidate: Interval | null = null;
  let greatestOverlap = EPSILON;
  for (const span of asBuilt) {
    const overlap = Math.min(planned[1], span[1]) - Math.max(planned[0], span[0]);
    if (overlap > greatestOverlap) {
      greatestOverlap = overlap;
      candidate = span;
    }
  }
  return candidate;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter(interval => interval[1] - interval[0] > EPSILON)
    .sort((left, right) => left[0] - right[0]);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval[0] > previous[1] + EPSILON) {
      merged.push([interval[0], interval[1]]);
    } else {
      previous[1] = Math.max(previous[1], interval[1]);
    }
  }
  return merged;
}

function pointFromAxes(station: number, cross: number, longitudinal: XY, transverse: XY): XY {
  return [longitudinal[0] * station + transverse[0] * cross, longitudinal[1] * station + transverse[1] * cross];
}

function computeHorizontalDeviation(planned: ClipMultiPolygon, asBuilt: ClipMultiPolygon): { value: number | null; note: string | null } {
  if (planned.length === 0 || asBuilt.length === 0) {
    return { value: null, note: "Horizontal deviation requires both valid footprint boundaries." };
  }
  const plannedSegments = geometrySegments(planned);
  const asBuiltSegments = geometrySegments(asBuilt);
  if (plannedSegments.length === 0 || asBuiltSegments.length === 0) {
    return { value: null, note: "Horizontal deviation requires non-empty footprint boundary segments." };
  }
  const plannedSamples = sampleSegments(plannedSegments, MAX_DEVIATION_SAMPLES);
  const asBuiltSamples = sampleSegments(asBuiltSegments, MAX_DEVIATION_SAMPLES);
  let maximum = 0;
  for (const point of plannedSamples) maximum = Math.max(maximum, nearestSegmentDistance(point, asBuiltSegments));
  for (const point of asBuiltSamples) maximum = Math.max(maximum, nearestSegmentDistance(point, plannedSegments));
  return {
    value: maximum,
    note: `Horizontal boundary deviation used ${plannedSamples.length} Planned and ${asBuiltSamples.length} As-Built samples (cap ${MAX_DEVIATION_SAMPLES} per boundary).`,
  };
}

function computeElevationDeviation(
  planned: Footprint,
  asBuilt: Footprint,
  input: BermAnalysisInput,
  origin: XY
): { value: number | null; issue: string | null } {
  const plannedDatum = normalizeIdentifier(input.planned.verticalDatum);
  const asBuiltDatum = normalizeIdentifier(input.asBuilt.verticalDatum);
  if (!input.criteria.crsConfirmed || !plannedDatum || !asBuiltDatum || plannedDatum !== asBuiltDatum) {
    return { value: null, issue: "Elevation deviation is unavailable: matching non-empty vertical datum identifiers and confirmed coordinates are required." };
  }
  if (!input.criteria.surveyComplete || planned.invalidSelection || asBuilt.invalidSelection) {
    return { value: null, issue: "Elevation deviation is unavailable: complete, continuous selected survey coverage has not been confirmed." };
  }
  if (!allContributingHaveElevation(planned) || !allContributingHaveElevation(asBuilt)) {
    return { value: null, issue: "Elevation deviation is unavailable: all contributing selected boundaries/faces must contain actual elevations; no Z values were manufactured." };
  }
  const plannedScale = sourceScale(input.planned);
  const asBuiltScale = sourceScale(input.asBuilt);
  if (plannedScale === null || asBuiltScale === null) {
    return { value: null, issue: "Elevation deviation is unavailable: metre conversion factors are missing." };
  }
  const plannedSegments = elevatedEntitySegments(planned.contributing, plannedScale, origin);
  const asBuiltSegments = elevatedEntitySegments(asBuilt.contributing, asBuiltScale, origin);
  if (plannedSegments.length === 0 || asBuiltSegments.length === 0) {
    return { value: null, issue: "Elevation deviation is unavailable: no complete elevated boundary segments were found." };
  }
  const plannedSamples = sampleSegments3(plannedSegments, MAX_DEVIATION_SAMPLES);
  const asBuiltSamples = sampleSegments3(asBuiltSegments, MAX_DEVIATION_SAMPLES);
  let maximum = 0;
  for (const point of plannedSamples) maximum = Math.max(maximum, elevationDifferenceToNearestSegment(point, asBuiltSegments));
  for (const point of asBuiltSamples) maximum = Math.max(maximum, elevationDifferenceToNearestSegment(point, plannedSegments));
  return { value: maximum, issue: null };
}

function allContributingHaveElevation(footprint: Footprint): boolean {
  return footprint.contributing.length > 0 && footprint.contributing.every(entity => entity.hasElevation && entity.points.every(point => point.z !== null));
}

function computeSurfaceArea(footprint: Footprint, source: BermSource, origin: XY): { value: number | null; issue: string | null } {
  const faces = footprint.contributing.filter(entity => entity.kind === "face");
  if (faces.length === 0) return { value: null, issue: "As-Built 3D surface area is unavailable: no selected 3DFACE coverage was found." };
  if (!allContributingHaveElevation(footprint)) {
    return { value: null, issue: "As-Built 3D surface area is unavailable: every contributing entity requires actual elevations." };
  }
  if (faces.length !== footprint.contributing.length) {
    return { value: null, issue: "As-Built 3D surface area is unavailable: selected boundary coverage is not fully represented by 3DFACE triangles." };
  }
  if (faces.some(face => removeClosingSurveyPoint(face.points).length !== 3)) {
    return { value: null, issue: "As-Built 3D surface area is unavailable: only triangular 3DFACE entities are supported; triangulate quadrilateral faces before export." };
  }
  const scale = sourceScale(source);
  if (scale === null) return { value: null, issue: "As-Built 3D surface area is unavailable: unitsToMetres is missing." };

  const projectedFaces = faces.map(face => [entityToLocalRing(face, scale, origin)]);
  for (let left = 0; left < projectedFaces.length; left += 1) {
    for (let right = left + 1; right < projectedFaces.length; right += 1) {
      const overlap = polygonClipping.intersection(projectedFaces[left]!, projectedFaces[right]!) as ClipMultiPolygon;
      if (multiPolygonArea(overlap) > EPSILON) {
        return { value: null, issue: "As-Built 3D surface area is unavailable: projected 3DFACE coverage overlaps, so an unambiguous surface cannot be verified." };
      }
    }
  }
  const faceUnion = unionPolygons(projectedFaces);
  if (footprint.area === null || Math.abs(multiPolygonArea(faceUnion) - footprint.area) > Math.max(EPSILON, footprint.area * 1e-8)) {
    return { value: null, issue: "As-Built 3D surface area is unavailable: triangular 3DFACE coverage does not completely cover the selected footprint." };
  }

  let area = 0;
  for (const face of faces) {
    const points = removeClosingSurveyPoint(face.points);
    const first = scaled3(points[0]!, scale);
    const second = scaled3(points[1]!, scale);
    const third = scaled3(points[2]!, scale);
    area += triangleArea3D(first, second, third);
  }
  return { value: area, issue: null };
}

function buildChecks(values: {
  input: BermAnalysisInput;
  compatible: { ok: boolean; issues: string[] };
  planned: Footprint;
  asBuilt: Footprint;
  areaDeviationPct: number | null;
  minimumWidth: number | null;
  horizontalDeviation: number | null;
  elevationDeviation: number | null;
}): BermCheck[] {
  const { input, compatible, planned, asBuilt } = values;
  const criteria = input.criteria;
  const checks: BermCheck[] = [];

  checks.push({
    name: "Coordinate compatibility",
    status: compatible.ok ? "Compliant" : "Insufficient Data",
    measured: compatible.ok ? "Confirmed matching CRS and metres-per-unit factors" : "Not confirmed",
    criterion: "Matching CRS, positive units, and explicit confirmation",
    explanation: compatible.ok ? "Comparison KPIs use confirmed compatible horizontal coordinates." : compatible.issues.join(" "),
  });

  checks.push({
    name: "Survey completeness",
    status: surveyStatus(criteria, planned, asBuilt),
    measured: criteria.surveyComplete ? "Explicitly confirmed" : "Not confirmed",
    criterion: "Explicit complete-survey confirmation with continuous selected geometry",
    explanation: surveyExplanation(criteria, planned, asBuilt),
  });

  checks.push(
    upperLimitCheck({
      name: "Footprint area deviation",
      measured: values.areaDeviationPct === null ? null : Math.abs(values.areaDeviationPct),
      criterion: criteria.areaDeviationPct,
      unit: "%",
      criteria,
      unavailable: "Area deviation requires compatible, non-empty Planned and As-Built footprints.",
      signedDetail: values.areaDeviationPct === null ? "" : ` Signed deviation is ${formatNumber(values.areaDeviationPct)}%.`,
    })
  );

  checks.push(
    lowerLimitCheck({
      name: "Minimum sampled width",
      measured: values.minimumWidth,
      criterion: criteria.minWidth,
      unit: "m",
      criteria,
      unavailable: "Minimum width requires a confirmed bearing, positive sample spacing, and both footprints.",
    })
  );

  checks.push(
    upperLimitCheck({
      name: "Horizontal boundary deviation",
      measured: values.horizontalDeviation,
      criterion: criteria.horizontalDeviation,
      unit: "m",
      criteria,
      unavailable: "Horizontal boundary deviation requires compatible Planned and As-Built footprints.",
      signedDetail: " Sampled boundary distance is symmetric and not a continuous clearance proof.",
    })
  );

  checks.push(elevationCheck(values.elevationDeviation, criteria));
  return checks;
}

function surveyStatus(criteria: BermCriteria, planned: Footprint, asBuilt: Footprint): BermStatus {
  if (!criteria.surveyComplete || planned.invalidSelection || asBuilt.invalidSelection || planned.geometry.length === 0 || asBuilt.geometry.length === 0) {
    return "Insufficient Data";
  }
  return "Compliant";
}

function surveyExplanation(criteria: BermCriteria, planned: Footprint, asBuilt: Footprint): string {
  if (!criteria.surveyComplete) return "Survey completeness was not explicitly confirmed; geometry cannot silently pass on partial coverage.";
  if (planned.invalidSelection || asBuilt.invalidSelection) return "A selected boundary/face is invalid or open; repair continuity before relying on compliance.";
  if (planned.geometry.length === 0 || asBuilt.geometry.length === 0) return "At least one source has no valid selected footprint coverage.";
  return "Selected geometry is closed/valid and survey completeness has been explicitly confirmed.";
}

function upperLimitCheck(options: {
  name: string;
  measured: number | null;
  criterion: number | null;
  unit: string;
  criteria: BermCriteria;
  unavailable: string;
  signedDetail: string;
}): BermCheck {
  const threshold = positiveOrZero(options.criterion);
  if (!options.criteria.siteApproved) return criteriaNotApproved(options.name, options.measured, options.unit);
  if (threshold === null) return missingThreshold(options.name, options.measured, options.unit, options.unavailable);
  if (options.measured === null) return insufficientCheck(options.name, "Unavailable", `≤ ${formatNumber(threshold)} ${options.unit}`, options.unavailable);
  const status: BermStatus = options.measured > threshold ? "Non-Compliant" : options.measured >= threshold * warningRatio(options.criteria) ? "Warning" : "Compliant";
  return {
    name: options.name,
    status,
    measured: `${formatNumber(options.measured)} ${options.unit}`,
    criterion: `≤ ${formatNumber(threshold)} ${options.unit}`,
    explanation: `${statusExplanation(status, "upper")}${options.signedDetail}`,
  };
}

function lowerLimitCheck(options: {
  name: string;
  measured: number | null;
  criterion: number | null;
  unit: string;
  criteria: BermCriteria;
  unavailable: string;
}): BermCheck {
  const threshold = positiveOrZero(options.criterion);
  if (!options.criteria.siteApproved) return criteriaNotApproved(options.name, options.measured, options.unit);
  if (threshold === null || threshold <= 0) return missingThreshold(options.name, options.measured, options.unit, options.unavailable);
  if (options.measured === null) return insufficientCheck(options.name, "Unavailable", `≥ ${formatNumber(threshold)} ${options.unit}`, options.unavailable);
  const status: BermStatus = options.measured < threshold ? "Non-Compliant" : options.measured <= threshold / warningRatio(options.criteria) ? "Warning" : "Compliant";
  return {
    name: options.name,
    status,
    measured: `${formatNumber(options.measured)} ${options.unit}`,
    criterion: `≥ ${formatNumber(threshold)} ${options.unit}`,
    explanation: statusExplanation(status, "lower"),
  };
}

function elevationCheck(measured: number | null, criteria: BermCriteria): BermCheck {
  if (!criteria.requireElevation) {
    return {
      name: "Boundary elevation deviation",
      status: "Compliant",
      measured: measured === null ? "3D unavailable" : `${formatNumber(measured)} m (boundary-only)`,
      criterion: "Not required",
      explanation: measured === null ? "Elevation data is unavailable but is not required by the approved criteria; no 3D compliance is implied." : "Elevation is shown as a boundary-only informational result; no elevation tolerance is required.",
    };
  }
  return upperLimitCheck({
    name: "Boundary elevation deviation",
    measured,
    criterion: criteria.elevationDeviation,
    unit: "m",
    criteria,
    unavailable: "Elevation requires matching confirmed vertical datums and complete actual Z values on all contributing selected boundaries/faces.",
    signedDetail: " This is boundary-only interpolated elevation deviation, not full surface deviation.",
  });
}

function criteriaNotApproved(name: string, measured: number | null, unit: string): BermCheck {
  return insufficientCheck(name, measured === null ? "Unavailable" : `${formatNumber(measured)} ${unit}`, "Site-approved criterion required", "Criteria are not site-approved; no default tolerance is implied.");
}

function missingThreshold(name: string, measured: number | null, unit: string, unavailable: string): BermCheck {
  return insufficientCheck(name, measured === null ? "Unavailable" : `${formatNumber(measured)} ${unit}`, "Approved threshold required", `Missing or invalid essential approved threshold. ${unavailable}`);
}

function insufficientCheck(name: string, measured: string, criterion: string, explanation: string): BermCheck {
  return { name, status: "Insufficient Data", measured, criterion, explanation };
}

function overallStatus(checks: BermCheck[]): BermStatus {
  if (checks.some(check => check.status === "Non-Compliant")) return "Non-Compliant";
  if (checks.some(check => check.status === "Warning")) return "Warning";
  if (checks.some(check => check.status === "Insufficient Data")) return "Insufficient Data";
  return "Compliant";
}

function geometrySegments(geometry: ClipMultiPolygon): Array<{ a: ClipPoint; b: ClipPoint }> {
  const segments: Array<{ a: ClipPoint; b: ClipPoint }> = [];
  for (const polygon of geometry) {
    for (const ring of polygon) {
      for (let index = 0; index + 1 < ring.length; index += 1) {
        if (!samePoint(ring[index]!, ring[index + 1]!)) segments.push({ a: ring[index]!, b: ring[index + 1]! });
      }
    }
  }
  return segments;
}

function sampleSegments(segments: Array<{ a: ClipPoint; b: ClipPoint }>, cap: number): ClipPoint[] {
  const total = segments.reduce((sum, segment) => sum + distance2(segment.a, segment.b), 0);
  const samples: ClipPoint[] = [];
  for (const segment of segments) {
    const length = distance2(segment.a, segment.b);
    const count = Math.max(1, Math.min(cap, Math.ceil((length / total) * cap)));
    for (let index = 0; index < count; index += 1) {
      const fraction = (index + 0.5) / count;
      samples.push([segment.a[0] + (segment.b[0] - segment.a[0]) * fraction, segment.a[1] + (segment.b[1] - segment.a[1]) * fraction]);
    }
  }
  return samples;
}

function nearestSegmentDistance(point: ClipPoint, segments: Array<{ a: ClipPoint; b: ClipPoint }>): number {
  let nearest = Infinity;
  for (const segment of segments) nearest = Math.min(nearest, pointToSegmentDistance(point, segment.a, segment.b));
  return nearest;
}

function elevatedEntitySegments(entities: BermEntity[], scale: number, origin: XY): Segment3[] {
  const segments: Segment3[] = [];
  for (const entity of entities) {
    const points = removeClosingSurveyPoint(entity.points).map(point => ({
      x: localCoordinate(point.x, scale, origin[0]),
      y: localCoordinate(point.y, scale, origin[1]),
      z: (point.z ?? 0) * scale,
    }));
    if (points.length < 2) continue;
    const limit = entity.closed ? points.length : points.length - 1;
    for (let index = 0; index < limit; index += 1) {
      const next = points[(index + 1) % points.length]!;
      const current = points[index]!;
      if (Math.hypot(next.x - current.x, next.y - current.y) > EPSILON) segments.push({ a: current, b: next });
    }
  }
  return segments;
}

function sampleSegments3(segments: Segment3[], cap: number): SurveyPoint[] {
  const total = segments.reduce((sum, segment) => sum + Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y), 0);
  const samples: SurveyPoint[] = [];
  for (const segment of segments) {
    const length = Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y);
    const count = Math.max(1, Math.min(cap, Math.ceil((length / total) * cap)));
    for (let index = 0; index < count; index += 1) {
      const fraction = (index + 0.5) / count;
      samples.push({
        x: segment.a.x + (segment.b.x - segment.a.x) * fraction,
        y: segment.a.y + (segment.b.y - segment.a.y) * fraction,
        z: (segment.a.z ?? 0) + ((segment.b.z ?? 0) - (segment.a.z ?? 0)) * fraction,
      });
    }
  }
  return samples;
}

function elevationDifferenceToNearestSegment(point: SurveyPoint, segments: Segment3[]): number {
  let nearestDistance = Infinity;
  let interpolatedZ = 0;
  for (const segment of segments) {
    const dx = segment.b.x - segment.a.x;
    const dy = segment.b.y - segment.a.y;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared <= EPSILON ? 0 : clamp(((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / lengthSquared, 0, 1);
    const x = segment.a.x + dx * fraction;
    const y = segment.a.y + dy * fraction;
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      interpolatedZ = (segment.a.z ?? 0) + ((segment.b.z ?? 0) - (segment.a.z ?? 0)) * fraction;
    }
  }
  return Math.abs((point.z ?? 0) - interpolatedZ);
}

function multiPolygonArea(geometry: ClipMultiPolygon): number {
  let area = 0;
  for (const polygon of geometry) {
    polygon.forEach((ring, index) => {
      const ringAreaAbsolute = Math.abs(ringArea(ring));
      area += index === 0 ? ringAreaAbsolute : -ringAreaAbsolute;
    });
  }
  return Math.max(0, area);
}

function restoreMultiPolygon(geometry: ClipMultiPolygon, origin: XY): MultiPolygon {
  return geometry.map(polygon => polygon.map(ring => ring.map(point => restorePoint(point, origin))));
}

function restorePoint(point: XY, origin: XY): XY {
  return [point[0] + origin[0], point[1] + origin[1]];
}

function forEachPoint(geometry: ClipMultiPolygon, callback: (point: ClipPoint) => void) {
  for (const polygon of geometry) for (const ring of polygon) for (const point of ring) callback(point);
}

function removeClosingSurveyPoint(points: SurveyPoint[]): SurveyPoint[] {
  if (points.length > 1 && sameSurveyPoint(points[0]!, points[points.length - 1]!)) return points.slice(0, -1);
  return points.slice();
}

function ringSelfIntersects(points: ClipPoint[]): boolean {
  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length;
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length;
      if (left === right || left === rightNext || leftNext === right || leftNext === rightNext) continue;
      if (segmentsIntersect(points[left]!, points[leftNext]!, points[right]!, points[rightNext]!)) return true;
    }
  }
  return false;
}

function segmentsIntersect(a: ClipPoint, b: ClipPoint, c: ClipPoint, d: ClipPoint): boolean {
  const first = cross(a, b, c);
  const second = cross(a, b, d);
  const third = cross(c, d, a);
  const fourth = cross(c, d, b);
  if (Math.abs(first) <= EPSILON && pointOnSegment(a, b, c)) return true;
  if (Math.abs(second) <= EPSILON && pointOnSegment(a, b, d)) return true;
  if (Math.abs(third) <= EPSILON && pointOnSegment(c, d, a)) return true;
  if (Math.abs(fourth) <= EPSILON && pointOnSegment(c, d, b)) return true;
  return (first > EPSILON && second < -EPSILON || first < -EPSILON && second > EPSILON) && (third > EPSILON && fourth < -EPSILON || third < -EPSILON && fourth > EPSILON);
}

function pointInRing(point: ClipPoint, ring: ClipRing): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current]!;
    const b = ring[previous]!;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function ringArea(points: ClipRing): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function triangleArea3D(first: [number, number, number], second: [number, number, number], third: [number, number, number]): number {
  const ux = second[0] - first[0];
  const uy = second[1] - first[1];
  const uz = second[2] - first[2];
  const vx = third[0] - first[0];
  const vy = third[1] - first[1];
  const vz = third[2] - first[2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}

function scaled3(point: SurveyPoint, scale: number): [number, number, number] {
  return [point.x * scale, point.y * scale, (point.z ?? 0) * scale];
}

function pointToSegmentDistance(point: ClipPoint, start: ClipPoint, end: ClipPoint): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared <= EPSILON ? 0 : clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point[0] - (start[0] + dx * fraction), point[1] - (start[1] + dy * fraction));
}

function dot(point: ClipPoint, direction: XY): number {
  return point[0] * direction[0] + point[1] * direction[1];
}

function distance2(left: ClipPoint, right: ClipPoint): number {
  return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

function cross(a: ClipPoint, b: ClipPoint, c: ClipPoint): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(start: ClipPoint, end: ClipPoint, point: ClipPoint): boolean {
  return point[0] >= Math.min(start[0], end[0]) - EPSILON && point[0] <= Math.max(start[0], end[0]) + EPSILON && point[1] >= Math.min(start[1], end[1]) - EPSILON && point[1] <= Math.max(start[1], end[1]) + EPSILON;
}

function samePoint(left: ClipPoint, right: ClipPoint): boolean {
  return Math.abs(left[0] - right[0]) <= EPSILON && Math.abs(left[1] - right[1]) <= EPSILON;
}

function sameSurveyPoint(left: SurveyPoint, right: SurveyPoint): boolean {
  return Math.abs(left.x - right.x) <= EPSILON && Math.abs(left.y - right.y) <= EPSILON;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function positiveOrZero(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function warningRatio(criteria: BermCriteria): number {
  return typeof criteria.warningRatio === "number" && criteria.warningRatio > 0 && criteria.warningRatio < 1 ? criteria.warningRatio : 0.9;
}

function statusExplanation(status: BermStatus, direction: "upper" | "lower"): string {
  if (status === "Compliant") return "Measured value is within the approved tolerance.";
  if (status === "Warning") return direction === "upper" ? "Measured value is within tolerance but near the approved upper limit." : "Measured value is above the approved minimum but near it.";
  if (status === "Non-Compliant") return direction === "upper" ? "Measured value exceeds the approved upper limit." : "Measured value is below the approved minimum.";
  return "Insufficient data for an approved compliance decision.";
}

function normalizeIdentifier(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3).replace(/\.?(0+)$/, "") : "Unavailable";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addUnique(target: string[], values: string[]) {
  for (const value of values) if (!target.includes(value)) target.push(value);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
