/**
 * Rock mass classification systems:
 * RMR (Bieniawski 1989), SMR (Romana), Q-system (Barton et al.) and GSI (Hoek).
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

// ---------- SMR (Romana) ----------
export type SMRExcavationMethod =
  | "natural"
  | "pre-splitting"
  | "smooth-blasting"
  | "mechanical"
  | "production-blasting"
  | "poor-blasting";

export interface SMRInput {
  rmrBasic: number; // basic RMR before orientation adjustment (0-100)
  jointDip: number; // joint set 1 dip (degrees)
  jointDipDirection: number; // joint set 1 dip direction (degrees)
  jointDip2?: number; // joint set 2 dip (degrees)
  jointDipDirection2?: number; // joint set 2 dip direction (degrees)
  slopeDip: number; // slope dip (degrees)
  slopeDipDirection: number; // slope dip direction (degrees)
  excavationMethod: SMRExcavationMethod;
}

export interface SMRResult {
  score: number;
  rockClass: string;
  interpretation: string;
  breakdown: Record<string, number>;
  excavationMethod: string;
  governingJointSet: 1 | 2;
}

function angularDifference(a: number, b: number): number {
  const raw = Math.abs(((a - b + 540) % 360) - 180);
  return raw > 180 ? 360 - raw : raw;
}

function smrF1(angle: number): number {
  if (angle <= 5) return 0.15;
  if (angle <= 10) return 0.4;
  if (angle <= 20) return 0.7;
  return 1;
}

function smrF2(jointDip: number): number {
  if (jointDip <= 20) return 0.4;
  if (jointDip <= 30) return 0.7;
  if (jointDip <= 35) return 0.85;
  return 1;
}

function smrF3(jointDip: number, slopeDip: number): number {
  const difference = jointDip - slopeDip;
  if (difference < -10) return 0;
  if (difference <= 0) return -6;
  if (difference <= 10) return -25;
  if (difference <= 20) return -50;
  return -60;
}

const SMR_METHODS: Record<SMRExcavationMethod, { label: string; f4: number }> = {
  natural: { label: "Natural slope", f4: 15 },
  "pre-splitting": { label: "Pre-splitting", f4: 10 },
  "smooth-blasting": { label: "Smooth blasting", f4: 8 },
  mechanical: { label: "Mechanical excavation", f4: 0 },
  "production-blasting": { label: "Production blasting", f4: -8 },
  "poor-blasting": { label: "Poor blasting", f4: -12 },
};

export function computeSMR(input: SMRInput): SMRResult {
  const rmrBasic = Math.max(0, Math.min(100, input.rmrBasic));
  const slopeDip = Math.max(0, Math.min(90, input.slopeDip));
  const set1 = {
    dip: Math.max(0, Math.min(90, input.jointDip)),
    dipDirection: input.jointDipDirection,
  };
  const set2 = {
    dip: Math.max(0, Math.min(90, input.jointDip2 ?? input.jointDip)),
    dipDirection: input.jointDipDirection2 ?? input.jointDipDirection,
  };
  const calculateSet = (set: typeof set1) => {
    const f1 = smrF1(angularDifference(set.dipDirection, input.slopeDipDirection));
    const f2 = smrF2(set.dip);
    const f3 = smrF3(set.dip, slopeDip);
    return { f1, f2, f3, score: rmrBasic + f1 * f2 * f3 };
  };
  const set1Result = calculateSet(set1);
  const set2Result = calculateSet(set2);
  const method = SMR_METHODS[input.excavationMethod];
  const governingJointSet: 1 | 2 = set2Result.score < set1Result.score ? 2 : 1;
  const governing = governingJointSet === 1 ? set1Result : set2Result;
  const score = Math.max(0, Math.min(100, Math.round((governing.score + method.f4) * 10) / 10));

  let rockClass: string;
  let advice: string;
  if (score >= 81) {
    rockClass = "Class I — Very stable";
    advice = "Very stable slope conditions; little support is normally required, subject to site verification.";
  } else if (score >= 61) {
    rockClass = "Class II — Stable";
    advice = "Stable conditions are expected; local support and routine monitoring may be appropriate.";
  } else if (score >= 41) {
    rockClass = "Class III — Partially stable";
    advice = "Partially stable conditions; systematic assessment, drainage and local or systematic support should be considered.";
  } else if (score >= 21) {
    rockClass = "Class IV — Unstable";
    advice = "Unstable conditions are possible; redesign, reinforcement, drainage and close monitoring are recommended.";
  } else {
    rockClass = "Class V — Very unstable";
    advice = "Very unstable conditions; stabilization, conservative geometry and continuous monitoring are required.";
  }

  return {
    score,
    rockClass,
    excavationMethod: method.label,
    breakdown: {
      rmrBasic,
      f1: governing.f1,
      f2: governing.f2,
      f3: governing.f3,
      f4: method.f4,
      set1Dip: set1.dip,
      set1DipDirection: set1.dipDirection,
      set1F1: set1Result.f1,
      set1F2: set1Result.f2,
      set1F3: set1Result.f3,
      set1Score: Math.round((set1Result.score + method.f4) * 10) / 10,
      set2Dip: set2.dip,
      set2DipDirection: set2.dipDirection,
      set2F1: set2Result.f1,
      set2F2: set2Result.f2,
      set2F3: set2Result.f3,
      set2Score: Math.round((set2Result.score + method.f4) * 10) / 10,
    },
    governingJointSet,
    interpretation: `SMR = ${score}. ${rockClass}. ${advice} Two joint sets were evaluated with the Romana factors; Joint Set ${governingJointSet} governs because it produces the lower SMR score.`,
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
