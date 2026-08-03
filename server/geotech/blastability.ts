/**
 * Blastability Index (BI) engine based on Lilly (1986) — SME reference.
 * 
 * Formula: BI = 0.5 * (RMD + JPS + JPO + RDI + Strength)
 * Where:
 *   RMD = Rock Mass Description: 10 (Powdery/Friable), 20 (Blocky), 50 (Massive)
 *   JPS = Joint Plane Spacing: 10 (Close <0.1m), 20 (Intermediate 0.1–1m), 50 (Wide >1m)
 *   JPO = Joint Plane Orientation: 10 (Horizontal), 20 (Dip out of face), 30 (Strike ⊥ face), 40 (Dip into face)
 *   RDI = Rock Density Index = 25 * Density(t/m³) - 50
 *   Strength = 0.05 * UCS(MPa)
 *
 * Suggested Powder Factor (kg/m³) = 0.004 * BI * Density
 * Wall proximity PF is reduced by 30–50% from production PF.
 * RQD adjustment: high RQD (massive) increases PF need; low RQD (fractured) reduces it.
 */

// ─── Blastability Index (Lilly 1986) ─────────────────────────────────────────

export interface BlastabilityInput {
  /** Rock Mass Description rating (RMD): 10=powdery/friable, 20=blocky, 50=massive */
  rmd: number;
  /** Joint Plane Spacing (JPS): 10=close(<0.1m), 20=intermediate(0.1–1m), 50=wide(>1m) */
  jps: number;
  /** Joint Plane Orientation (JPO): 10=horizontal, 20=dip out of face, 30=strike ⊥ face, 40=dip into face */
  jpo: number;
  /** Density in t/m³. RDI = 25 * density - 50 */
  density: number;
  /** UCS in MPa. Strength = 0.05 * UCS */
  ucs: number;
}

export interface BlastabilityResult {
  bi: number;
  rdi: number;
  strength: number;
  classification: string;
  description: string;
  suggestedPowderFactor: { value: number; unit: string };
  wallProximityPF: { min: number; max: number; unit: string };
  recommendations: string[];
}

export function computeBlastabilityIndex(input: BlastabilityInput): BlastabilityResult {
  const { rmd, jps, jpo, density, ucs } = input;

  // RDI = 25 * Density - 50
  const rdi = 25 * density - 50;

  // Strength = 0.05 * UCS
  const strength = 0.05 * ucs;

  // BI = 0.5 * (RMD + JPS + JPO + RDI + Strength)
  const bi = 0.5 * (rmd + jps + jpo + rdi + strength);

  // Classification
  let classification: string;
  let description: string;
  if (bi < 20) {
    classification = "Very Easy";
    description = "Very easily blasted; minimal energy required. Friable, heavily fractured rock.";
  } else if (bi < 35) {
    classification = "Easy";
    description = "Easily blasted; standard patterns with moderate energy.";
  } else if (bi < 50) {
    classification = "Medium";
    description = "Moderate blasting difficulty; requires careful design.";
  } else if (bi < 65) {
    classification = "Difficult";
    description = "Difficult to blast; tight patterns and higher energy needed.";
  } else {
    classification = "Very Difficult";
    description = "Very difficult to blast; massive, hard rock requiring maximum energy and close spacing.";
  }

  // Suggested Powder Factor (kg/m³) = 0.004 * BI * Density (per SME reference)
  const pfBase = 0.004 * bi * density;

  const suggestedPowderFactor = {
    value: round3(pfBase),
    unit: "kg/m³",
  };

  // Wall proximity PF: reduced by 35–50% to minimize damage
  const wallProximityPF = {
    min: round3(pfBase * 0.50),
    max: round3(pfBase * 0.65),
    unit: "kg/m³",
  };

  const recommendations: string[] = [];
  if (bi >= 50) {
    recommendations.push("Consider using high-energy explosives (emulsion) for production holes.");
    recommendations.push("Reduce burden and spacing to improve fragmentation.");
  }
  if (jpo >= 30) {
    recommendations.push("Joint orientation dips into face — higher risk of backbreak; use buffer rows.");
  }
  if (bi < 25) {
    recommendations.push("Low BI — risk of over-fragmentation; consider reducing charge per hole.");
  }
  recommendations.push(
    `For wall control (trim/buffer rows), use powder factor ${wallProximityPF.min}–${wallProximityPF.max} kg/m³.`
  );
  recommendations.push(
    `For production blasting, use powder factor ${suggestedPowderFactor.value} kg/m³.`
  );

  return {
    bi: round3(bi),
    rdi: round3(rdi),
    strength: round3(strength),
    classification,
    description,
    suggestedPowderFactor,
    wallProximityPF,
    recommendations,
  };
}

// ─── Wall Control Compliance ─────────────────────────────────────────────────

export interface WallControlInput {
  /** Was pre-split used? */
  preSplit: boolean;
  /** Pre-split hole spacing (m) — 0 if not used */
  preSplitSpacing: number;
  /** Pre-split hole diameter (mm) */
  preSplitDiameter: number;
  /** Was trim (cushion) blasting used? */
  trimBlast: boolean;
  /** Trim row burden (m) */
  trimBurden: number;
  /** Number of buffer rows between production and final wall */
  bufferRows: number;
  /** Standoff distance from final wall to nearest production hole (m) */
  standoffDistance: number;
  /** Actual measured backbreak (m) */
  measuredBackbreak: number;
  /** Actual measured crest loss (m) */
  measuredCrestLoss: number;
  /** Design berm width (m) */
  designBermWidth: number;
  /** Actual berm width remaining (m) */
  actualBermWidth: number;
}

export interface WallControlResult {
  overallCompliance: "Compliant" | "Partially Compliant" | "Non-Compliant";
  score: number; // 0–100
  checks: WallControlCheck[];
  wallDamageAssessment: WallDamageAssessment;
}

export interface WallControlCheck {
  parameter: string;
  status: "Pass" | "Warning" | "Fail";
  detail: string;
}

export interface WallDamageAssessment {
  backbreakSeverity: "None" | "Minor" | "Moderate" | "Severe";
  crestLossSeverity: "None" | "Minor" | "Moderate" | "Severe";
  bermReduction: number; // percentage of design berm lost
  overallDamage: "Acceptable" | "Marginal" | "Unacceptable";
  comments: string[];
}

export function evaluateWallControl(input: WallControlInput): WallControlResult {
  const checks: WallControlCheck[] = [];
  let score = 100;

  // 1. Pre-split check
  if (input.preSplit) {
    if (input.preSplitSpacing > 0 && input.preSplitSpacing <= 1.2) {
      checks.push({ parameter: "Pre-split spacing", status: "Pass", detail: `${input.preSplitSpacing} m — within recommended range (≤1.2 m)` });
    } else if (input.preSplitSpacing <= 1.8) {
      checks.push({ parameter: "Pre-split spacing", status: "Warning", detail: `${input.preSplitSpacing} m — slightly wide; recommend ≤1.2 m for effective crack propagation` });
      score -= 10;
    } else {
      checks.push({ parameter: "Pre-split spacing", status: "Fail", detail: `${input.preSplitSpacing} m — too wide for effective pre-split (>1.8 m)` });
      score -= 20;
    }
    if (input.preSplitDiameter >= 64 && input.preSplitDiameter <= 127) {
      checks.push({ parameter: "Pre-split diameter", status: "Pass", detail: `${input.preSplitDiameter} mm — standard range` });
    } else {
      checks.push({ parameter: "Pre-split diameter", status: "Warning", detail: `${input.preSplitDiameter} mm — outside typical 64–127 mm range` });
      score -= 5;
    }
  } else {
    checks.push({ parameter: "Pre-split", status: "Warning", detail: "No pre-split used — wall protection relies on trim and buffer only" });
    score -= 15;
  }

  // 2. Trim blast check
  if (input.trimBlast) {
    if (input.trimBurden > 0 && input.trimBurden <= 3.0) {
      checks.push({ parameter: "Trim row burden", status: "Pass", detail: `${input.trimBurden} m — appropriate for controlled blasting` });
    } else if (input.trimBurden <= 4.5) {
      checks.push({ parameter: "Trim row burden", status: "Warning", detail: `${input.trimBurden} m — consider reducing for better wall control` });
      score -= 10;
    } else {
      checks.push({ parameter: "Trim row burden", status: "Fail", detail: `${input.trimBurden} m — excessive for trim row (>4.5 m)` });
      score -= 20;
    }
  } else {
    checks.push({ parameter: "Trim blast", status: "Warning", detail: "No trim blasting used — higher risk of wall damage" });
    score -= 10;
  }

  // 3. Buffer rows
  if (input.bufferRows >= 2) {
    checks.push({ parameter: "Buffer rows", status: "Pass", detail: `${input.bufferRows} buffer rows — adequate protection` });
  } else if (input.bufferRows === 1) {
    checks.push({ parameter: "Buffer rows", status: "Warning", detail: "Only 1 buffer row — minimum acceptable; 2+ recommended" });
    score -= 10;
  } else {
    checks.push({ parameter: "Buffer rows", status: "Fail", detail: "No buffer rows — production blast directly adjacent to final wall" });
    score -= 25;
  }

  // 4. Standoff distance
  if (input.standoffDistance >= 5) {
    checks.push({ parameter: "Standoff distance", status: "Pass", detail: `${input.standoffDistance} m — good separation from final wall` });
  } else if (input.standoffDistance >= 3) {
    checks.push({ parameter: "Standoff distance", status: "Warning", detail: `${input.standoffDistance} m — marginal; recommend ≥5 m` });
    score -= 10;
  } else {
    checks.push({ parameter: "Standoff distance", status: "Fail", detail: `${input.standoffDistance} m — insufficient standoff (<3 m)` });
    score -= 20;
  }

  // 5. Wall damage assessment
  const bermReduction = input.designBermWidth > 0
    ? Math.max(0, (1 - input.actualBermWidth / input.designBermWidth) * 100)
    : 0;

  const backbreakSeverity: WallDamageAssessment["backbreakSeverity"] =
    input.measuredBackbreak <= 0.5 ? "None" :
    input.measuredBackbreak <= 1.5 ? "Minor" :
    input.measuredBackbreak <= 3.0 ? "Moderate" : "Severe";

  const crestLossSeverity: WallDamageAssessment["crestLossSeverity"] =
    input.measuredCrestLoss <= 0.3 ? "None" :
    input.measuredCrestLoss <= 1.0 ? "Minor" :
    input.measuredCrestLoss <= 2.0 ? "Moderate" : "Severe";

  if (backbreakSeverity === "Moderate") score -= 10;
  else if (backbreakSeverity === "Severe") score -= 25;

  if (crestLossSeverity === "Moderate") score -= 10;
  else if (crestLossSeverity === "Severe") score -= 20;

  if (bermReduction > 30) score -= 15;
  else if (bermReduction > 15) score -= 8;

  score = Math.max(0, Math.min(100, score));

  const overallDamage: WallDamageAssessment["overallDamage"] =
    (backbreakSeverity === "Severe" || crestLossSeverity === "Severe" || bermReduction > 40)
      ? "Unacceptable"
      : (backbreakSeverity === "Moderate" || crestLossSeverity === "Moderate" || bermReduction > 20)
        ? "Marginal"
        : "Acceptable";

  const comments: string[] = [];
  if (backbreakSeverity !== "None") {
    comments.push(`Backbreak of ${input.measuredBackbreak} m detected (${backbreakSeverity}).`);
  }
  if (crestLossSeverity !== "None") {
    comments.push(`Crest loss of ${input.measuredCrestLoss} m (${crestLossSeverity}).`);
  }
  if (bermReduction > 10) {
    comments.push(`Berm width reduced by ${round3(bermReduction)}% (design ${input.designBermWidth} m → actual ${input.actualBermWidth} m).`);
  }
  if (overallDamage === "Acceptable") {
    comments.push("Wall damage within acceptable limits.");
  } else if (overallDamage === "Unacceptable") {
    comments.push("CRITICAL: Wall damage exceeds acceptable limits. Review blast design immediately.");
  }

  const wallDamageAssessment: WallDamageAssessment = {
    backbreakSeverity,
    crestLossSeverity,
    bermReduction: round3(bermReduction),
    overallDamage,
    comments,
  };

  checks.push({
    parameter: "Backbreak",
    status: backbreakSeverity === "None" || backbreakSeverity === "Minor" ? "Pass" : backbreakSeverity === "Moderate" ? "Warning" : "Fail",
    detail: `${input.measuredBackbreak} m — ${backbreakSeverity}`,
  });
  checks.push({
    parameter: "Crest loss",
    status: crestLossSeverity === "None" || crestLossSeverity === "Minor" ? "Pass" : crestLossSeverity === "Moderate" ? "Warning" : "Fail",
    detail: `${input.measuredCrestLoss} m — ${crestLossSeverity}`,
  });

  const overallCompliance: WallControlResult["overallCompliance"] =
    score >= 75 ? "Compliant" : score >= 50 ? "Partially Compliant" : "Non-Compliant";

  return { overallCompliance, score, checks, wallDamageAssessment };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
