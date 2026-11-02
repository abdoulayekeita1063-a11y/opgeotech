export type XY = [number, number];
export type Polygon = XY[][];
export type MultiPolygon = Polygon[];
export type BermStatus =
  | "Compliant"
  | "Warning"
  | "Non-Compliant"
  | "Insufficient Data";
export type SurveyPoint = { x: number; y: number; z: number | null };
export type BermEntity = {
  id: string;
  sourceType: string;
  kind: "polyline" | "face" | "point" | "line";
  layer: string;
  points: SurveyPoint[];
  closed: boolean;
  valid: boolean;
  hasElevation: boolean;
  issues: string[];
};
export type BermDxfDocument = {
  filename: string;
  layers: string[];
  entities: BermEntity[];
  originalEntityCount: number;
  insunits: number | null;
  unitName: string | null;
  unitScale: number | null;
  diagnostics: string[];
};
export type BermSource = {
  document: BermDxfDocument | null;
  layers: string[];
  /** Empty means all valid boundaries/faces on selected layers. */
  entityIds: string[];
  unitsToMetres: number | null;
  crs: string;
  verticalDatum: string;
};
export type BermCriteria = {
  minWidth: number | null;
  areaDeviationPct: number | null;
  horizontalDeviation: number | null;
  elevationDeviation: number | null;
  warningRatio: number;
  siteApproved: boolean;
  requireElevation: boolean;
  surveyComplete: boolean;
  crsConfirmed: boolean;
};
export type BermMetadata = {
  bermId: string;
  pit: string;
  bench: string;
  surveyDateMs: number | null;
  reviewer: string;
  comments: string;
};
export type BermAnalysisInput = {
  metadata: BermMetadata;
  planned: BermSource;
  asBuilt: BermSource;
  criteria: BermCriteria;
  /** Transverse width measurement direction, clockwise from North. */
  widthBearing: number | null;
  sampleSpacing: number;
};
export type BermWidthSample = {
  station: number;
  plannedWidth: number;
  asBuiltWidth: number;
  from: XY;
  to: XY;
};
export type BermCheck = {
  name: string;
  status: BermStatus;
  measured: string;
  criterion: string;
  explanation: string;
};
export type BermAnalysisResult = {
  status: BermStatus;
  plannedGeometry: MultiPolygon;
  asBuiltGeometry: MultiPolygon;
  overlapGeometry: MultiPolygon;
  missingGeometry: MultiPolygon;
  excessGeometry: MultiPolygon;
  plannedArea: number | null;
  asBuiltArea: number | null;
  absoluteAreaDifference: number | null;
  /** Signed (As-Built - Planned) / Planned x 100. */
  areaDeviationPct: number | null;
  overlapArea: number | null;
  missingArea: number | null;
  excessArea: number | null;
  plannedWidth: number | null;
  asBuiltWidth: number | null;
  minimumWidth: number | null;
  widthSamples: BermWidthSample[];
  minimumWidthLocation: BermWidthSample | null;
  horizontalDeviation: number | null;
  elevationDeviation: number | null;
  /** Only valid, non-overlapping 3DFACE coverage may have a 3D surface area. */
  asBuiltSurfaceArea3D: number | null;
  checks: BermCheck[];
  issues: string[];
  methodNotes: string[];
};
export type BermSavedSummary = {
  id: number;
  bermId: string;
  pit: string;
  bench: string;
  status: BermStatus;
  surveyDateMs: number | null;
  createdAtMs: number;
};
export type BermSavedRecord = BermSavedSummary & {
  input: BermAnalysisInput;
  result: BermAnalysisResult;
};
