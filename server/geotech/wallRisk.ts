export const wallRiskCategories = [
  "Technical",
  "Water",
  "Rock Mass",
  "Geotechnical",
  "Failure Potential",
  "Fall of Ground",
  "Blasting",
  "Monitoring",
] as const;

export type WallRiskCategory = (typeof wallRiskCategories)[number];
export type WallRiskLevel = "Low" | "Moderate" | "High" | "Critical";

export interface WallRiskInput {
  bermWidth?: number | null;
  slopeHeight?: number | null;
  slopeAngle?: number | null;
  monthToDateRainfall?: number | null;
  faceMoistureCondition?: string | null;
  ponding?: string | null;
  drainage?: string | null;
  rockMassRating?: number | null;
  jointSets?: number | null;
  jointContinuity?: string | null;
  rockType?: string | null;
  structuralType?: string | null;
  infilling?: string | null;
  rockMassCharacterization?: string | null;
  mappingDensity?: string | null;
  irsData?: string | null;
  geotechDrillingProgram?: string | null;
  geotechnicalAnalysis?: string | null;
  potentialFailureMechanism?: string | null;
  factorOfSafety?: number | null;
  failureHistory?: string | null;
  probabilityOfFailure?: number | null;
  orientation?: string | null;
  faceCleaningMethod?: string | null;
  bermCondition?: string | null;
  rockFaceDescription?: string | null;
  looseMaterials?: string | null;
  limitBlastingMethod?: string | null;
  wallDamage?: string | null;
  presplitBarrelsVisible?: string | null;
  crestBackbreak?: string | null;
  hardToe?: string | null;
  structuralPlanesVisible?: string | null;
  monitoringMethod?: string | null;
  monitoringFrequency?: string | null;
  cumulativeDisplacement?: number | null;
  analysis?: string | null;
  velocity?: number | null;
}

export interface WallRiskCategoryScore {
  category: WallRiskCategory;
  score: number;
  weight: number;
  contribution: number;
  basis: string[];
}

export interface WallRiskResult {
  overallScore: number;
  riskLevel: WallRiskLevel;
  actionPriority: string;
  categoryScores: WallRiskCategoryScore[];
  recommendations: string[];
  dataCompleteness: number;
  method: string;
}

const weights: Record<WallRiskCategory, number> = {
  Technical: 0.14,
  Water: 0.12,
  "Rock Mass": 0.14,
  Geotechnical: 0.14,
  "Failure Potential": 0.18,
  "Fall of Ground": 0.12,
  Blasting: 0.08,
  Monitoring: 0.08,
};

const clamp = (value: number) => Math.max(0, Math.min(10, value));
const num = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const entered = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== "";

function textScore(value: string | null | undefined, rules: Array<[string | string[], number]>) {
  const text = String(value ?? "").toLowerCase();
  if (!text.trim()) return undefined;
  for (const [terms, score] of rules) {
    const values = Array.isArray(terms) ? terms : [terms];
    if (values.some(term => text.includes(term))) return score;
  }
  return 3;
}

function mean(values: Array<number | undefined>) {
  const valid = values.filter((value): value is number => value !== undefined);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function makeCategory(category: WallRiskCategory, values: Array<number | undefined>, basis: string[]) {
  const score = Math.round(clamp(mean(values)) * 100) / 100;
  return { category, score, weight: weights[category], contribution: Math.round(score * weights[category] * 100) / 100, basis };
}

function level(score: number): WallRiskLevel {
  if (score >= 7.5) return "Critical";
  if (score >= 5) return "High";
  if (score >= 2.5) return "Moderate";
  return "Low";
}

function action(risk: WallRiskLevel) {
  if (risk === "Critical") return "No entry; cease operations until controls are verified and the wall is re-assessed.";
  if (risk === "High") return "Demarcate, apply immediate controls, increase monitoring and refer to the geotechnical review team.";
  if (risk === "Moderate") return "Demarcate the highwall stand-off, monitor closely and treat identified hazards promptly.";
  return "Notify personnel in the work area, maintain routine controls and treat minor hazards promptly.";
}

export function scoreWallRisk(input: WallRiskInput): WallRiskResult {
  const scores: WallRiskCategoryScore[] = [];
  const add = (category: WallRiskCategory, values: Array<number | undefined>, basis: string[]) => scores.push(makeCategory(category, values, basis));

  const technical: string[] = [];
  add("Technical", [num(input.bermWidth) === undefined ? undefined : clamp((100 - input.bermWidth!) / 10), num(input.slopeHeight) === undefined ? undefined : clamp((input.slopeHeight! - 10) / 8), num(input.slopeAngle) === undefined ? undefined : clamp((input.slopeAngle! - 50) / 4)], technical);
  if (num(input.bermWidth) !== undefined) technical.push(`Berm width ${input.bermWidth}`);
  if (num(input.slopeHeight) !== undefined) technical.push(`Slope height ${input.slopeHeight}`);
  if (num(input.slopeAngle) !== undefined) technical.push(`Slope angle ${input.slopeAngle}°`);

  const water: string[] = [];
  add("Water", [num(input.monthToDateRainfall) === undefined ? undefined : clamp(input.monthToDateRainfall! / 25), textScore(input.faceMoistureCondition, [["dry", 0], ["damp", 3], ["wet", 6], ["flow", 9], ["saturated", 10]]), textScore(input.ponding, [["no", 0], ["none", 0], ["minor", 3], ["yes", 7], ["severe", 10]]), textScore(input.drainage, [["good", 0], ["adequate", 2], ["partial", 5], ["poor", 7], ["blocked", 9], ["none", 9]])], water);
  [input.faceMoistureCondition, input.ponding, input.drainage].filter(entered).forEach(value => water.push(String(value)));

  const rock: string[] = [];
  add("Rock Mass", [num(input.rockMassRating) === undefined ? undefined : clamp((65 - input.rockMassRating!) / 6), num(input.jointSets) === undefined ? undefined : clamp((input.jointSets! - 1) * 1.5), textScore(input.jointContinuity, [["discontinu", 0], ["short", 1], ["moderate", 4], ["continuous", 8]]), textScore(input.infilling, [["none", 0], ["clean", 0], ["thin", 2], ["soft", 6], ["clay", 8], ["gouge", 10]]), textScore(`${input.rockMassCharacterization ?? ""} ${input.rockType ?? ""}`, [["massive", 0], ["fresh", 1], ["fair", 3], ["weather", 6], ["weak", 8], ["decomposed", 10]])], rock);
  if (num(input.rockMassRating) !== undefined) rock.push(`RMR ${input.rockMassRating}/100`);
  [input.jointContinuity, input.rockType, input.structuralType, input.infilling, input.rockMassCharacterization].filter(entered).forEach(value => rock.push(String(value)));

  const geotechnical: string[] = [];
  const fs = num(input.factorOfSafety);
  add("Geotechnical", [fs === undefined ? undefined : fs >= 1.5 ? 0 : fs >= 1.3 ? 3 : fs >= 1 ? 6 : 10, num(input.probabilityOfFailure) === undefined ? undefined : clamp(input.probabilityOfFailure! / 10), textScore(input.mappingDensity, [["high", 0], ["complete", 0], ["moderate", 3], ["low", 7], ["none", 9]]), textScore(input.geotechDrillingProgram, [["complete", 0], ["active", 1], ["planned", 3], ["partial", 5], ["none", 8]]), textScore(input.irsData, [["available", 0], ["complete", 0], ["partial", 4], ["missing", 8], ["none", 8]])], geotechnical);
  if (fs !== undefined) geotechnical.push(`Factor of safety ${fs}`);
  [input.geotechnicalAnalysis, input.mappingDensity, input.irsData, input.geotechDrillingProgram].filter(entered).forEach(value => geotechnical.push(String(value)));

  const failure: string[] = [];
  add("Failure Potential", [textScore(input.potentialFailureMechanism, [["none", 0], ["no failure", 0], ["planar", 5], ["wedge", 6], ["toppling", 6], ["circular", 7], ["multiple", 9]]), textScore(input.failureHistory, [["no failure", 0], ["none", 0], ["old", 3], ["minor", 5], ["recent", 8], ["active", 10]]), textScore(input.orientation, [["favourable", 0], ["stable", 0], ["neutral", 3], ["daylight", 8], ["unfavourable", 8]])], failure);
  [input.potentialFailureMechanism, input.failureHistory, input.orientation].filter(entered).forEach(value => failure.push(String(value)));

  const fog: string[] = [];
  add("Fall of Ground", [textScore(input.faceCleaningMethod, [["scaled", 0], ["clean", 0], ["partial", 4], ["none", 8]]), textScore(input.bermCondition, [["good", 0], ["adequate", 2], ["fair", 4], ["poor", 7], ["no berm", 9]]), textScore(input.rockFaceDescription, [["massive", 0], ["competent", 1], ["blocky", 4], ["fractured", 6], ["loose", 8], ["unstable", 10]]), textScore(input.looseMaterials, [["no", 0], ["none", 0], ["minor", 4], ["yes", 8], ["hanging", 10], ["block", 8]])], fog);
  [input.faceCleaningMethod, input.bermCondition, input.rockFaceDescription, input.looseMaterials].filter(entered).forEach(value => fog.push(String(value)));

  const blasting: string[] = [];
  add("Blasting", [textScore(input.limitBlastingMethod, [["presplit", 0], ["trim", 1], ["buffer", 2], ["controlled", 2], ["production", 5], ["none", 9]]), textScore(input.wallDamage, [["no", 0], ["none", 0], ["minor", 4], ["yes", 8], ["severe", 10]]), textScore(input.presplitBarrelsVisible, [["70", 0], ["80", 0], ["visible", 1], ["partial", 5], ["no", 8], ["none", 8]]), textScore(input.crestBackbreak, [["no", 0], ["none", 0], ["minor", 4], ["yes", 8], ["severe", 10]]), textScore(input.hardToe, [["no", 0], ["none", 0], ["minor", 3], ["yes", 6], ["severe", 9]]), textScore(input.structuralPlanesVisible, [["no", 0], ["none", 0], ["minor", 3], ["yes", 6]])], blasting);
  [input.limitBlastingMethod, input.wallDamage, input.presplitBarrelsVisible, input.crestBackbreak, input.hardToe, input.structuralPlanesVisible].filter(entered).forEach(value => blasting.push(String(value)));

  const monitoring: string[] = [];
  add("Monitoring", [textScore(input.monitoringMethod, [["ids radar", 0], ["radar", 0], ["prism", 1], ["survey", 2], ["visual", 5], ["none", 9]]), textScore(input.monitoringFrequency, [["24", 0], ["daily", 1], ["weekly", 4], ["monthly", 7], ["none", 9]]), num(input.cumulativeDisplacement) === undefined ? undefined : clamp(input.cumulativeDisplacement! / 5), num(input.velocity) === undefined ? undefined : clamp(input.velocity! / 2), textScore(input.analysis, [["stable", 0], ["normal", 1], ["increasing", 6], ["accelerating", 9], ["critical", 10]])], monitoring);
  [input.monitoringMethod, input.monitoringFrequency, input.analysis].filter(entered).forEach(value => monitoring.push(String(value)));

  const overallScore = Math.round(clamp(scores.reduce((sum, item) => sum + item.contribution, 0)) * 100) / 100;
  const riskLevel = level(overallScore);
  const recommendations: string[] = [];
  if (scores.find(item => item.category === "Water")!.score >= 5) recommendations.push("Inspect and restore drainage; control ponding and reassess the wet face after rainfall.");
  if (scores.find(item => item.category === "Rock Mass")!.score >= 5 || scores.find(item => item.category === "Failure Potential")!.score >= 5) recommendations.push("Complete structural mapping and geotechnical review before work continues below the wall.");
  if (scores.find(item => item.category === "Fall of Ground")!.score >= 5) recommendations.push("Scale loose material or hanging blocks, establish a stand-off and restrict access until the face is safe.");
  if (scores.find(item => item.category === "Blasting")!.score >= 5) recommendations.push("Review wall-control blast design, perimeter energy, presplit performance and crest/backbreak records.");
  if (scores.find(item => item.category === "Monitoring")!.score >= 5) recommendations.push("Increase monitoring frequency and review displacement/velocity trends with the geotechnical control team.");
  if (!recommendations.length) recommendations.push("Maintain routine inspections, recording and monitoring in accordance with the ground control management plan.");

  const fieldCount = Object.values(input).filter(entered).length;
  return {
    overallScore,
    riskLevel,
    actionPriority: action(riskLevel),
    categoryScores: scores,
    recommendations,
    dataCompleteness: Math.round(fieldCount / Object.keys(input).length * 100),
    method: "Eight-category weighted screening score on a 0–10 scale. Weights: Technical 14%, Water 12%, Rock Mass 14%, Geotechnical 14%, Failure Potential 18%, Fall of Ground 12%, Blasting 8%, Monitoring 8%. Thresholds: Low <2.5, Moderate 2.5–<5, High 5–<7.5, Critical ≥7.5.",
  };
}

export function serializeWallRisk(result: WallRiskResult) {
  return { riskLevel: result.riskLevel, riskScore: result.overallScore, actionPriority: result.actionPriority, categoryScoresJson: JSON.stringify(result.categoryScores), recommendations: result.recommendations.join(" ") };
}

export function parseWallRiskCategories(value: string | null | undefined): WallRiskCategoryScore[] {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export const wallRiskWeights = weights;
export const wallRiskThresholds = { moderate: 2.5, high: 5, critical: 7.5 } as const;
export const wallRiskActions = { Low: "Routine controls", Moderate: "Monitor and treat", High: "Restrict and control", Critical: "Stop and make safe" } as const;
export const wallRiskEngineeringDisclaimer = "Engineering screening only; validate risk outputs against the site ground control management plan and competent-person review.";
