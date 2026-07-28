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
}

export interface StabilityResult {
  fsFellenius: number;
  fsBishop: number;
  criticalCircle: { xc: number; yc: number; radius: number };
  ru: number;
  slices: number;
  interpretation: string;
  status: "stable" | "marginal" | "unstable";
}

const DEG = Math.PI / 180;

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
}

/**
 * Geometry: slope rising from (0,0) at the toe to (H/tanβ, H) at the crest.
 * Ground surface: y=0 for x<=0; y = x·tanβ for 0<x<L; y=H for x>=L.
 */
function groundY(x: number, H: number, beta: number): number {
  const L = H / Math.tan(beta);
  if (x <= 0) return 0;
  if (x >= L) return H;
  return x * Math.tan(beta);
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
  const beta = input.slopeAngle * DEG;
  const H = input.slopeHeight;

  // Intersections of the circle with the ground surface (numerical search)
  // f(x) = groundY(x) - yCircle(x); circle: y = yc - sqrt(R² - (x-xc)²)
  const xMin = xc - R;
  const xMax = xc + R;
  const f = (x: number): number => {
    const dx = x - xc;
    const disc = R * R - dx * dx;
    if (disc <= 0) return NaN;
    const yCircle = yc - Math.sqrt(disc);
    return groundY(x, H, beta) - yCircle;
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
    const yTop = groundY(xm, H, beta);
    const h = yTop - yBase;
    if (h < 0) return null;
    const alpha = Math.asin(dx / R); // inclinaison de la base
    const W = input.unitWeight * h * b;
    slices.push({ weight: W, alpha, baseLength: b / Math.cos(alpha), width: b });
  }
  return slices;
}

/** FS by the Fellenius method (ordinary method of slices), with ru */
function fsFellenius(input: StabilityInput, slices: Slice[]): number {
  const phi = input.frictionAngle * DEG;
  const c = input.cohesion;
  const ru = ruFromWater(input.waterCondition);
  let num = 0;
  let den = 0;
  for (const s of slices) {
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
  const phi = input.frictionAngle * DEG;
  const c = input.cohesion;
  const ru = ruFromWater(input.waterCondition);
  let FS = 1.2;
  for (let iter = 0; iter < 100; iter++) {
    let num = 0;
    let den = 0;
    for (const s of slices) {
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

/**
 * Searches for the critical circle over a grid of centers and radii,
 * then computes Fellenius and Bishop FS on that circle.
 */
export function computeStability(input: StabilityInput): StabilityResult {
  const beta = input.slopeAngle * DEG;
  const H = input.slopeHeight;
  const L = H / Math.tan(beta);

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
        const slices = buildSlices(input, xc, yc, R);
        if (!slices || slices.length < 10) continue;
        const fsF = fsFellenius(input, slices);
        const fsB = fsBishop(input, slices);
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
  };
}
