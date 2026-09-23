export type AssessmentMode = "presplit" | "no-presplit";

export interface ComplianceInput {
  mode: AssessmentMode;
  benchFaceAngleRating: number;
  benchWidthRating: number;
  toePositionRating: number;
  halfBarrelsRating: number;
  intactRockBreakageRating: number;
  openJointsRating: number;
  looseMaterialRating: number;
  faceProfileRating: number;
  crestConditionRating: number;
}

export interface ComplianceItem {
  parameter: string;
  rating: number;
  maximum: number;
  weight: number;
  normalized: number;
  comment: string;
}

export interface ComplianceResult {
  mode: AssessmentMode;
  designAchievement: number;
  faceCondition: number;
  classification: string;
  colour: string;
  action: string;
  compliant: boolean;
  compliancePct: number;
  items: ComplianceItem[];
  interpretation: string;
}

function item(parameter: string, rating: number, maximum: number, weight: number, comment: string): ComplianceItem {
  const safe = Math.max(0, Math.min(maximum, rating));
  return { parameter, rating: safe, maximum, weight, normalized: Math.round((safe / maximum) * 1000) / 1000, comment };
}

export function computeCompliance(input: ComplianceInput | LegacyComplianceInput): ComplianceResult {
  if (!("mode" in input)) return computeLegacyCompliance(input);
  const items = [
    item("Bench face angle", input.benchFaceAngleRating, 50, 50, "Achieved overall bench face angle relative to design"),
    item("Bench width", input.benchWidthRating, 40, 40, "Achieved average bench width relative to design"),
    item("Toe position", input.toePositionRating, 10, 10, "Whether the design toe is being achieved"),
    item("Half barrels visible", input.halfBarrelsRating, 20, 20, "Reduce the rating when half barrels are only visible in the lower part of the bench"),
    item("Intact rock breakage", input.intactRockBreakageRating, 15, 15, "Subjective evaluation; interpolate between 0 and 15"),
    item("Open joints", input.openJointsRating, 10, 10, "Subjective evaluation of closed versus open joints"),
    item("Loose material on face", input.looseMaterialRating, 20, 20, "Assess in terms of rockfall hazard"),
    item("Face profile", input.faceProfileRating, 20, 20, "Shape of face and basis for variations"),
    item("Crest condition", input.crestConditionRating, 15, 15, "Deduct points for loose rock or crest loss"),
  ];
  const designItems = items.slice(0, 3);
  const faceItems = items.slice(3);
  const designAchievement = Math.round(designItems.reduce((sum, current) => sum + current.rating, 0)) / 100;
  const faceCondition = Math.round(faceItems.reduce((sum, current) => sum + current.rating, 0)) / 100;
  let classification: string;
  let colour: string;
  let action: string;
  if (designAchievement >= 0.7 && faceCondition >= 0.7) {
    classification = "Good results"; colour = "Green"; action = "Maintain the wall-control standard and continue routine monitoring.";
  } else if (designAchievement < 0.7 && faceCondition >= 0.7) {
    classification = "Geometry achieved — face condition requires attention"; colour = "Yellow"; action = "Review geometry and correct the next mining advance; maintain face-condition controls.";
  } else if (designAchievement >= 0.7 && faceCondition < 0.7) {
    classification = "Good face conditions — geometry unacceptable"; colour = "Orange"; action = "Restrict acceptance of the wall and correct geometry before continuing the advance.";
  } else {
    classification = "Unacceptable results"; colour = "Red"; action = "Stop and initiate a geotechnical review before further operations in the assessed wall.";
  }
  const compliancePct = Math.round(((designAchievement + faceCondition) / 2) * 1000) / 10;
  return {
    mode: input.mode,
    designAchievement,
    faceCondition,
    classification,
    colour,
    action,
    compliant: colour === "Green",
    compliancePct,
    items,
    interpretation: `${classification}. Design Achievement (Df) = ${designAchievement.toFixed(2)} and Face Condition (Fc) = ${faceCondition.toFixed(2)}. ${action}`,
  };
}

export const wallAssessmentOptions = {
  benchFaceAngle: [50, 25, 10, 0],
  benchWidth: [40, 35, 25, 15, 0],
  toePosition: [10, 8, 5, 0],
  halfBarrels: [20, 15, 12, 8, 5, 2, 0],
  intactRockBreakage: [15, 0],
  openJoints: [10, 0],
  looseMaterial: [20, 15, 10, 0],
  faceProfile: [20, 10, 5, 0],
  crestCondition: [15, 12, 10, 5, 0],
} as const;

export const wallAssessmentLabels = {
  benchFaceAngle: ["≥ Design", "Design −3°", "Design −5°", "Design −10°"],
  benchWidth: ["≥ Design", "Design −1 m", "Design −2 m", "Design −3 m", "Design −5 m"],
  toePosition: ["On design", "Design −1 m", "Design −2 m", "Design −3 m"],
  halfBarrels: ["≥80%", "70–80%", "60–70%", "50–60%", "30–50%", "10–30%", "<10%"],
  intactRockBreakage: ["<1 /m³", ">5 /m³"],
  openJoints: ["All closed", "Many moved"],
  looseMaterial: ["No blocks", "Few small blocks", "Large blocks", "Many blocks"],
  faceProfile: ["Straight", "Hard toe", "Overhanging crest", "Irregular face"],
  crestCondition: ["Achieved", "<1 m loss", "1 m–2 m loss", "2 m–3 m loss", ">3 m loss"],
} as const;

type LegacyComplianceInput = { designBenchHeight: number; actualBenchHeight: number; designBermWidth: number; actualBermWidth: number; designBatterAngle: number; actualBatterAngle: number; toleranceHeight: number; toleranceBerm: number; toleranceAngle: number };
export function computeLegacyCompliance(input: LegacyComplianceInput): ComplianceResult {
  return computeCompliance({ mode: "no-presplit", benchFaceAngleRating: Math.max(0, 50 - Math.abs(input.actualBatterAngle - input.designBatterAngle) * 5), benchWidthRating: Math.max(0, 40 - Math.abs(input.actualBermWidth - input.designBermWidth) * 5), toePositionRating: 10, halfBarrelsRating: 20, intactRockBreakageRating: 15, openJointsRating: 10, looseMaterialRating: 20, faceProfileRating: 20, crestConditionRating: 15 });
}
