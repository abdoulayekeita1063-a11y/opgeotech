/**
 * Slope stability calculation engine.
 * Method of slices: Fellenius (ordinary) and simplified Bishop.
 *
 * The calculation discretizes a circular failure surface into vertical slices
 * and searches for the critical circle (minimum FS) over a grid of centers/radii.
 */

export interface StabilityInput {
  cohesion: number; // c' in kPa
  frictionAngle: number; // φ' in degrees
  unitWeight: number; // γ in kN/m3
  slopeHeight: number; // H in m
  slopeAngle: number; // β in degrees
  waterCondition: "dry" | "partial" | "saturated";
  benches?: BenchInput[];
  strengthModel?: StrengthModelInput;
}

export interface BenchInput {
  height: number;
  angle: number;
  bermWidth: number;
  materialLayer?: string;
  strengthModel?: StrengthModelInput;
}

export interface HoekBrownInput {
  sigmaCi: number; // intact UCS, MPa
  gsi: number;
  mi: number;
  disturbanceFactor: number; // D, 0–1
}

export type StrengthModelInput =
  | { type: "mohr-coulomb" }
  | ({ type: "hoek-brown" } & HoekBrownInput);

export interface StabilityResult {
  fsFellenius: number;
  fsBishop: number;
  criticalCircle: { xc: number; yc: number; radius: number };
  ru: number;
  slices: number;
  interpretation: string;
  status: "stable" | "marginal" | "unstable";
  strengthModel: "Mohr–Coulomb" | "Hoek–Brown" | "Mixed";
  equivalentCohesion: number;
  equivalentFrictionAngle: number;
  profile: { totalHeight: number; totalWidth: number; benchCount: number };
  benchStrengths: Array<{ model: "Mohr–Coulomb" | "Hoek–Brown"; cohesion: number; frictionAngle: number }>;
}

const DEG = Math.PI / 180;

type ResolvedStrength = {
  cohesion: number;
  frictionAngle: number;
  label: "Mohr–Coulomb" | "Hoek–Brown";
};

/** Pore pressure ratio ru based on groundwater condition */
function ruFromWater(w: StabilityInput["waterCondition"]): number {
  switch (w) {
    case "dry":
      return 0;
    case "partial":
      return 0.25;
    case "saturated":
      return 0.5;
  }
}

interface Slice {
  weight: number; // W (kN/m)
  alpha: number; // base inclination (rad)
  baseLength: number; // l (m)
  width: number; // b (m)
  cohesion: number;
  frictionAngle: number;
}

/**
 * Geometry: slope rising from (0,0) at the toe to (H/tanβ, H) at the crest.
 * Ground surface: y=0 for x<=0; y = x·tanβ for 0<x<L; y=H for x>=L.
 */
function profileFromInput(input: StabilityInput): {
  points: Array<{ x: number; y: number }>;
  totalHeight: number;
  totalWidth: number;
  benchCount: number;
  benchRanges: Array<{ startX: number; endX: number; strength: ResolvedStrength }>;
} {
  const benches = input.benches?.length
    ? input.benches
    : [{ height: input.slopeHeight, angle: input.slopeAngle, bermWidth: 0 }];
  const points = [{ x: 0, y: 0 }];
  const benchRanges: Array<{ startX: number; endX: number; strength: ResolvedStrength }> = [];
  let x = 0;
  let y = 0;
  for (const bench of benches) {
    const startX = x;
    const angle = Math.max(10, Math.min(85, bench.angle)) * DEG;
    x += bench.height / Math.tan(angle);
    y += bench.height;
    points.push({ x, y });
    x += Math.max(0, bench.bermWidth);
    points.push({ x, y });
    benchRanges.push({
      startX,
      endX: x,
      strength: resolveStrength({ ...input, strengthModel: bench.strengthModel ?? input.strengthModel }),
    });
  }
  return { points, totalHeight: y, totalWidth: x, benchCount: benches.length, benchRanges };
}

function groundY(x: number, profile: Array<{ x: number; y: number }>): number {
  if (x <= 0) return 0;
  if (x >= profile[profile.length - 1].x) return profile[profile.length - 1].y;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (x <= b.x) {
      const ratio = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * ratio;
    }
  }
  return profile[profile.length - 1].y;
}

/**
 * Slices the mass along a circle with center (xc, yc) and radius R.
 * Returns null if the circle does not properly intersect the slope.
 */
function buildSlices(
  input: StabilityInput,
  xc: number,
  yc: number,
  R: number,
  nSlices = 50,
): Slice[] | null {
  const profile = profileFromInput(input);
  const H = profile.totalHeight;

  // Intersections of the circle with the ground surface (numerical search)
  // f(x) = groundY(x) - yCircle(x); circle: y = yc - sqrt(R² - (x-xc)²)
  const xMin = xc - R;
  const xMax = xc + R;
  const f = (x: number): number => {
    const dx = x - xc;
    const disc = R * R - dx * dx;
    if (disc <= 0) return NaN;
    const yCircle = yc - Math.sqrt(disc);
    return groundY(x, profile.points) - yCircle;
  };

  // Sweep to find the two intersections (entry and exit)
  const N = 400;
  let x1: number | null = null;
  let x2: number | null = null;
  let prev = NaN;
  let prevX = xMin;
  for (let i = 0; i <= N; i++) {
    const x = xMin + ((xMax - xMin) * i) / N;
    const v = f(x);
    if (!Number.isNaN(prev) && !Number.isNaN(v) && prev * v < 0) {
      // Quick bisection
      let a = prevX;
      let b = x;
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2;
        if (f(a) * f(m) <= 0) b = m;
        else a = m;
      }
      const root = (a + b) / 2;
      if (x1 === null) x1 = root;
      else {
        x2 = root;
        break;
      }
    }
    prev = v;
    prevX = x;
  }
  if (x1 === null || x2 === null || x2 - x1 < 0.5) return null;

  const slices: Slice[] = [];
  const b = (x2 - x1) / nSlices;
  for (let i = 0; i < nSlices; i++) {
    const xm = x1 + b * (i + 0.5);
    const dx = xm - xc;
    const disc = R * R - dx * dx;
    if (disc <= 0) return null;
    const yBase = yc - Math.sqrt(disc);
    const yTop = groundY(xm, profile.points);
    const h = yTop - yBase;
    if (h < 0) return null;
    const alpha = Math.asin(dx / R); // inclinaison de la base
    const W = input.unitWeight * h * b;
    const benchRange = profile.benchRanges.find(range => xm >= range.startX && xm <= range.endX);
    const strength = benchRange?.strength ?? resolveStrength(input);
    slices.push({
      weight: W,
      alpha,
      baseLength: b / Math.cos(alpha),
      width: b,
      cohesion: strength.cohesion,
      frictionAngle: strength.frictionAngle,
    });
  }
  return slices;
}

/** FS by the Fellenius method (ordinary method of slices), with ru */
function fsFellenius(input: StabilityInput, slices: Slice[]): number {
  const ru = ruFromWater(input.waterCondition);
  let num = 0;
  let den = 0;
  for (const s of slices) {
    const phi = s.frictionAngle * DEG;
    const c = s.cohesion;
    const N = s.weight * Math.cos(s.alpha);
    const U = ru * s.weight; // simplified pore force u·l ≈ ru·W
    num += c * s.baseLength + (N - U * Math.cos(s.alpha)) * Math.tan(phi);
    den += s.weight * Math.sin(s.alpha);
  }
  if (den <= 0) return Infinity;
  return num / den;
}

/** FS by the simplified Bishop method (iterative), with ru */
function fsBishop(input: StabilityInput, slices: Slice[]): number {
  const ru = ruFromWater(input.waterCondition);
  let FS = 1.2;
  for (let iter = 0; iter < 100; iter++) {
    let num = 0;
    let den = 0;
    for (const s of slices) {
      const phi = s.frictionAngle * DEG;
      const c = s.cohesion;
      const mAlpha =
        Math.cos(s.alpha) + (Math.sin(s.alpha) * Math.tan(phi)) / FS;
      num +=
        (c * s.width + (s.weight - ru * s.weight) * Math.tan(phi)) / mAlpha;
      den += s.weight * Math.sin(s.alpha);
    }
    if (den <= 0) return Infinity;
    const newFS = num / den;
    if (Math.abs(newFS - FS) < 1e-4) return newFS;
    FS = newFS;
  }
  return FS;
}

function resolveStrength(input: StabilityInput): ResolvedStrength {
  if (input.strengthModel?.type !== "hoek-brown") {
    return { cohesion: input.cohesion, frictionAngle: input.frictionAngle, label: "Mohr–Coulomb" };
  }
  const hb = input.strengthModel;
  const sigmaCi = Math.max(0.1, hb.sigmaCi);
  const gsi = Math.max(0, Math.min(100, hb.gsi));
  const mi = Math.max(1, hb.mi);
  const D = Math.max(0, Math.min(1, hb.disturbanceFactor));
  const mb = mi * Math.exp((gsi - 100) / (28 - 14 * D));
  const s = Math.exp((gsi - 100) / (9 - 3 * D));
  const a = 0.5 + (Math.exp(-gsi / 15) - Math.exp(-20 / 3)) / 6;
  const sigma3 = Math.max(0.01, sigmaCi * 0.1);
  const sigma1AtZero = sigmaCi * Math.pow(s, a);
  const sigma1AtConfinement = sigma3 + sigmaCi * Math.pow(mb * sigma3 / sigmaCi + s, a);
  const slope = Math.max(1, (sigma1AtConfinement - sigma1AtZero) / sigma3);
  const sinPhi = Math.max(0, Math.min(0.98, (slope - 1) / (slope + 1)));
  const phi = Math.asin(sinPhi);
  const cohesion = Math.max(0, sigma1AtZero * (1 - sinPhi) / (2 * Math.cos(phi)));
  return {
    cohesion: Math.round(cohesion * 100) / 100,
    frictionAngle: Math.round((phi / DEG) * 100) / 100,
    label: "Hoek–Brown",
  };
}

/**
 * Searches for the critical circle over a grid of centers and radii,
 * then computes Fellenius and Bishop FS on that circle.
 */
export function computeStability(input: StabilityInput): StabilityResult {
  const profile = profileFromInput(input);
  const strength = resolveStrength(input);
  const calculationInput: StabilityInput = {
    ...input,
    cohesion: strength.cohesion,
    frictionAngle: strength.frictionAngle,
  };
  const H = profile.totalHeight;
  const L = profile.totalWidth;

  let best: {
    fsF: number;
    fsB: number;
    xc: number;
    yc: number;
    R: number;
  } | null = null;

  // Search grid of centers above the slope
  for (let ix = 0; ix <= 8; ix++) {
    for (let iy = 0; iy <= 8; iy++) {
      const xc = -0.5 * L + (1.5 * L * ix) / 8;
      const yc = H * (1.05 + (1.5 * iy) / 8);
      // Radii between distance to crest and extended distance to toe
      const rMin = Math.hypot(xc - L, yc - H) * 1.01;
      const rMax = Math.hypot(xc, yc) * 1.4;
      for (let ir = 0; ir <= 6; ir++) {
        const R = rMin + ((rMax - rMin) * ir) / 6;
        const slices = buildSlices(calculationInput, xc, yc, R);
        if (!slices || slices.length < 10) continue;
        const fsF = fsFellenius(calculationInput, slices);
        const fsB = fsBishop(calculationInput, slices);
        if (!Number.isFinite(fsF) || !Number.isFinite(fsB)) continue;
        if (fsF <= 0 || fsB <= 0) continue;
        if (!best || fsB < best.fsB) {
          best = { fsF, fsB, xc, yc, R };
        }
      }
    }
  }

  if (!best) {
    throw new Error(
      "Unable to find a valid failure surface for this geometry. Please check the input parameters.",
    );
  }

  const fsB = Math.round(best.fsB * 1000) / 1000;
  const fsF = Math.round(best.fsF * 1000) / 1000;

  let status: StabilityResult["status"];
  let interpretation: string;
  if (fsB >= 1.3) {
    status = "stable";
    interpretation = `The Bishop factor of safety (FS = ${fsB.toFixed(2)}) is greater than or equal to 1.30, the threshold generally accepted for permanent mining slopes. The slope is considered STABLE under the analyzed conditions. The more conservative Fellenius method gives FS = ${fsF.toFixed(2)}. Continue routine monitoring.`;
  } else if (fsB >= 1.0) {
    status = "marginal";
    interpretation = `The Bishop factor of safety (FS = ${fsB.toFixed(2)}) is between 1.00 and 1.30: stability is MARGINAL. The safety margin is insufficient for a permanent slope. It is recommended to intensify monitoring (prisms, radar), review the geometry (reduce slope angle or height), and control groundwater conditions (drainage).`;
  } else {
    status = "unstable";
    interpretation = `The Bishop factor of safety (FS = ${fsB.toFixed(2)}) is below 1.00: the slope is theoretically UNSTABLE under the analyzed conditions. Immediate measures are required: access restriction, re-profiling, emergency drainage, and continuous monitoring. The Fellenius method gives FS = ${fsF.toFixed(2)}.`;
  }

  const benchStrengths = profile.benchRanges.map(range => ({
    model: range.strength.label,
    cohesion: range.strength.cohesion,
    frictionAngle: range.strength.frictionAngle,
  }));
  const models = new Set(benchStrengths.map(bench => bench.model));
  const resultStrengthModel: StabilityResult["strengthModel"] = models.size > 1
    ? "Mixed"
    : (benchStrengths[0]?.model ?? strength.label);
  const averageCohesion = benchStrengths.length
    ? benchStrengths.reduce((sum, bench) => sum + bench.cohesion, 0) / benchStrengths.length
    : strength.cohesion;
  const averageFrictionAngle = benchStrengths.length
    ? benchStrengths.reduce((sum, bench) => sum + bench.frictionAngle, 0) / benchStrengths.length
    : strength.frictionAngle;

  return {
    fsFellenius: fsF,
    fsBishop: fsB,
    criticalCircle: {
      xc: Math.round(best.xc * 100) / 100,
      yc: Math.round(best.yc * 100) / 100,
      radius: Math.round(best.R * 100) / 100,
    },
    ru: ruFromWater(input.waterCondition),
    slices: 50,
    interpretation,
    status,
    strengthModel: resultStrengthModel,
    equivalentCohesion: Math.round(averageCohesion * 100) / 100,
    equivalentFrictionAngle: Math.round(averageFrictionAngle * 100) / 100,
    profile: { totalHeight: H, totalWidth: L, benchCount: profile.benchCount },
    benchStrengths,
  };
}
