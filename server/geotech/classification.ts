/**
 * Rock mass classification systems:
 * RMR (Bieniawski 1989), Q-system (Barton et al.) and GSI (Hoek).
 */

// ---------- RMR ----------
export interface RMRInput {
  ucs: number; // uniaxial compressive strength (MPa)
  rqd: number; // RQD (%)
  spacing: number; // discontinuity spacing (m)
  conditionRating: number; // discontinuity condition rating (0-30)
  groundwaterRating: number; // groundwater rating (0-15)
  orientationAdjustment: number; // orientation adjustment (-60 to 0)
}

export function ratingUCS(ucs: number): number {
  if (ucs > 250) return 15;
  if (ucs > 100) return 12;
  if (ucs > 50) return 7;
  if (ucs > 25) return 4;
  if (ucs > 5) return 2;
  if (ucs > 1) return 1;
  return 0;
}

export function ratingRQD(rqd: number): number {
  if (rqd >= 90) return 20;
  if (rqd >= 75) return 17;
  if (rqd >= 50) return 13;
  if (rqd >= 25) return 8;
  return 3;
}

export function ratingSpacing(s: number): number {
  if (s > 2) return 20;
  if (s > 0.6) return 15;
  if (s > 0.2) return 10;
  if (s > 0.06) return 8;
  return 5;
}

export interface RMRResult {
  score: number;
  rockClass: string;
  interpretation: string;
  breakdown: Record<string, number>;
}

export function computeRMR(input: RMRInput): RMRResult {
  const r1 = ratingUCS(input.ucs);
  const r2 = ratingRQD(input.rqd);
  const r3 = ratingSpacing(input.spacing);
  const r4 = Math.max(0, Math.min(30, input.conditionRating));
  const r5 = Math.max(0, Math.min(15, input.groundwaterRating));
  const adj = Math.max(-60, Math.min(0, input.orientationAdjustment));
  const score = Math.max(0, Math.min(100, r1 + r2 + r3 + r4 + r5 + adj));

  let rockClass: string;
  let quality: string;
  let advice: string;
  if (score > 80) {
    rockClass = "Class I — Very good rock";
    quality = "very good";
    advice =
      "Excellent ground conditions. Excavations are generally self-supporting; only spot support required.";
  } else if (score > 60) {
    rockClass = "Class II — Good rock";
    quality = "good";
    advice =
      "Generally good ground behavior. Spot bolting and routine monitoring are recommended.";
  } else if (score > 40) {
    rockClass = "Class III — Fair rock";
    quality = "fair";
    advice =
      "Fair ground behavior. Light systematic support (bolts + mesh) and regular slope inspections are advised.";
  } else if (score > 20) {
    rockClass = "Class IV — Poor rock";
    quality = "poor";
    advice =
      "Low-quality rock mass. Reinforced systematic support, conservative slope angles, and close monitoring are required.";
  } else {
    rockClass = "Class V — Very poor rock";
    quality = "very poor";
    advice =
      "Highly weathered/fractured rock mass. Heavy ground support, very conservative geometry, and continuous monitoring are essential.";
  }

  return {
    score,
    rockClass,
    interpretation: `RMR = ${score}. The rock mass is of ${quality} quality (${rockClass}). ${advice}`,
    breakdown: { ucs: r1, rqd: r2, spacing: r3, condition: r4, groundwater: r5, orientation: adj },
  };
}

// ---------- Q-system ----------
export interface QInput {
  rqd: number; // %
  jn: number; // joint set number
  jr: number; // joint roughness number
  ja: number; // joint alteration number
  jw: number; // joint water reduction factor
  srf: number; // stress reduction factor
}

export interface QResult {
  score: number;
  rockClass: string;
  interpretation: string;
}

export function computeQ(input: QInput): QResult {
  const rqd = Math.max(10, Math.min(100, input.rqd)); // RQD min 10 by convention
  const q = (rqd / input.jn) * (input.jr / input.ja) * (input.jw / input.srf);
  const score = Math.round(q * 1000) / 1000;

  let rockClass: string;
  if (q > 400) rockClass = "Exceptionally good";
  else if (q > 100) rockClass = "Extremely good";
  else if (q > 40) rockClass = "Very good";
  else if (q > 10) rockClass = "Good";
  else if (q > 4) rockClass = "Fair";
  else if (q > 1) rockClass = "Poor";
  else if (q > 0.1) rockClass = "Very poor";
  else if (q > 0.01) rockClass = "Extremely poor";
  else rockClass = "Exceptionally poor";

  const interpretation = `Q = ${score < 0.01 ? score.toExponential(2) : score}. Rock mass quality: ${rockClass}. ${
    q > 10
      ? "The rock mass shows good excavation performance with limited support requirements."
      : q > 1
        ? "The rock mass requires appropriate systematic support (bolting, shotcrete depending on span)."
        : "The rock mass is of low quality: heavy support, reduced advance lengths, and intensified monitoring are necessary."
  }`;

  return { score, rockClass, interpretation };
}

// ---------- GSI ----------
export interface GSIInput {
  structureRating: number; // 0-100 (rock mass structure, vertical scale)
  surfaceRating: number; // 0-100 (surface conditions, horizontal scale)
}

export interface GSIResult {
  score: number;
  rockClass: string;
  interpretation: string;
}

/**
 * Numerical approximation of the GSI chart: combination of the two ratings.
 * GSI ≈ weighted average bounded between 5 and 95.
 */
export function computeGSI(input: GSIInput): GSIResult {
  const s = Math.max(0, Math.min(100, input.structureRating));
  const c = Math.max(0, Math.min(100, input.surfaceRating));
  const gsi = Math.round(Math.max(5, Math.min(95, 0.5 * s + 0.5 * c)));

  let rockClass: string;
  let advice: string;
  if (gsi >= 80) {
    rockClass = "Intact to sparsely fractured rock mass";
    advice =
      "Quasi-elastic behavior, high strength. Hoek-Brown parameters close to intact rock.";
  } else if (gsi >= 60) {
    rockClass = "Blocky rock mass";
    advice =
      "Well-interlocked blocky mass. Good overall strength; stability governed by discontinuities.";
  } else if (gsi >= 40) {
    rockClass = "Very blocky rock mass";
    advice =
      "Partially disturbed angular blocks. Significant strength reduction; stability analyses recommended.";
  } else if (gsi >= 20) {
    rockClass = "Blocky/disturbed rock mass";
    advice =
      "Folded/faulted mass with angular blocks and weathered surfaces. Low strength; conservative geometry required.";
  } else {
    rockClass = "Disintegrated rock mass";
    advice =
      "Crushed, heavily weathered mass. Soil-like behavior; soil mechanics approaches should be preferred.";
  }

  return {
    score: gsi,
    rockClass,
    interpretation: `GSI = ${gsi}. ${rockClass}. ${advice}`,
  };
}
