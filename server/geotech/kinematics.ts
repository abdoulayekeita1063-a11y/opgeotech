/**
 * Kinematic analysis engine for rock slope stability.
 *
 * For each mapped structure (or structure pair for wedges) against a slope face:
 *  - Screens kinematic feasibility of planar sliding, wedge sliding and
 *    flexural/direct toppling using standard Markland / Goodman-Bray tests.
 *  - Computes shear strength on the discontinuity with the Barton-Bandis
 *    criterion: tau = sigma_n * tan( phi_b + JRC * log10(JCS / sigma_n) ),
 *    from which an instantaneous friction angle and cohesion intercept are
 *    derived at the block's normal stress level.
 *  - Estimates block weight from slope geometry (unit-thickness 2D block for
 *    planar; tetrahedral approximation for wedge) and the factor of safety.
 */

const DEG = Math.PI / 180;

export interface StructureInput {
  id: string;
  dip: number; // 0-90
  dipDirection: number; // 0-360
  jrc?: number | null; // 0-20, default 8
  structureType?: string;
}

export interface KinematicInput {
  slopeDip: number;
  slopeDipDirection: number;
  slopeHeight: number; // m
  unitWeight: number; // kN/m3
  basicFrictionAngle: number; // phi_b, degrees
  jcs: number; // MPa
  lateralLimit?: number; // degrees, default 20
  structures: StructureInput[];
}

export interface BartonStrength {
  normalStressKpa: number;
  peakFrictionAngle: number; // phi_b + JRC*log10(JCS/sigma_n), capped
  instantaneousCohesionKpa: number;
  instantaneousFrictionAngle: number;
}

export interface PlanarResult {
  structureId: string;
  dip: number;
  dipDirection: number;
  feasible: boolean;
  reasons: string[];
  blockWeightKn?: number; // per metre thickness
  strength?: BartonStrength;
  factorOfSafety?: number;
  status?: "Stable" | "Marginal" | "Unstable";
}

export interface WedgeResult {
  pair: [string, string];
  lineOfIntersection: { trend: number; plunge: number };
  feasible: boolean;
  reasons: string[];
  blockWeightKn?: number;
  strength?: BartonStrength;
  factorOfSafety?: number;
  status?: "Stable" | "Marginal" | "Unstable";
}

export interface TopplingResult {
  structureId: string;
  dip: number;
  dipDirection: number;
  feasible: boolean;
  mode: "flexural" | "none";
  reasons: string[];
}

export interface KinematicResult {
  planar: PlanarResult[];
  wedge: WedgeResult[];
  toppling: TopplingResult[];
  summary: {
    planarCount: number;
    planarTotal: number;
    planarPercentage: number;
    planarCritical: number;
    wedgeCount: number;
    wedgeTotal: number;
    wedgePercentage: number;
    wedgeCritical: number;
    topplingCount: number;
    topplingTotal: number;
    topplingPercentage: number;
    topplingCritical: number;
    criticalFs: number | null;
    overallAssessment: string;
  };
}

// ── helpers ──────────────────────────────────────────────────────────

function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Unit normal vector (upper hemisphere pole) of a plane given dip/dip direction. */
function planeNormal(dip: number, dipDir: number): [number, number, number] {
  const d = dip * DEG;
  const dd = dipDir * DEG;
  // ENU frame (x=E, y=N, z=Up). The upward pole of a plane dipping `dip`
  // toward azimuth `dd` has its horizontal component pointing TOWARD dd
  // (verified against pole trend = dd+180, plunge = 90-dip, then negated to
  // point upward): n = (sin(dip)·sin(dd), sin(dip)·cos(dd), cos(dip))
  return [Math.sin(d) * Math.sin(dd), Math.sin(d) * Math.cos(dd), Math.cos(d)];
}

/** Trend/plunge of the line of intersection of two planes. */
function intersectionLine(
  s1: StructureInput,
  s2: StructureInput
): { trend: number; plunge: number } {
  const n1 = planeNormal(s1.dip, s1.dipDirection);
  const n2 = planeNormal(s2.dip, s2.dipDirection);
  // i = n1 x n2
  let ix = n1[1] * n2[2] - n1[2] * n2[1];
  let iy = n1[2] * n2[0] - n1[0] * n2[2];
  let iz = n1[0] * n2[1] - n1[1] * n2[0];
  const mag = Math.hypot(ix, iy, iz);
  if (mag < 1e-9) return { trend: 0, plunge: 0 };
  ix /= mag;
  iy /= mag;
  iz /= mag;
  if (iz > 0) {
    // ensure the line plunges downward (z negative = down in ENU)
    ix = -ix;
    iy = -iy;
    iz = -iz;
  }
  const plunge = Math.asin(Math.min(Math.max(-iz, 0), 1)) / DEG;
  let trend = Math.atan2(ix, iy) / DEG;
  trend = ((trend % 360) + 360) % 360;
  return { trend: r1(trend), plunge: r1(plunge) };
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Barton-Bandis strength at a given normal stress.
 * tau = sn * tan(phi_b + JRC*log10(JCS/sn)); the dilation-corrected angle is
 * capped at phi_b + 50 deg per Barton's recommendation (and 70 deg absolute).
 */
export function bartonBandis(
  normalStressKpa: number,
  jrc: number,
  jcsMpa: number,
  phiB: number
): BartonStrength {
  const sn = Math.max(normalStressKpa, 1); // avoid log blow-up at ~zero stress
  const jcsKpa = jcsMpa * 1000;
  let phiPeak = phiB + jrc * Math.log10(jcsKpa / sn);
  phiPeak = Math.min(phiPeak, phiB + 50, 70);
  const tau = sn * Math.tan(phiPeak * DEG);

  // Instantaneous (tangent) friction angle & cohesion at sn:
  // d(tau)/d(sn) with phi(sn) = phiB + JRC*log10(JCS/sn)
  const phiRad = phiPeak * DEG;
  const dPhidSn = (-jrc / (sn * Math.LN10)) * DEG; // rad per kPa
  const dTau = Math.tan(phiRad) + sn * dPhidSn / Math.cos(phiRad) ** 2;
  const phiInst = Math.atan(Math.max(dTau, 0.05)) / DEG;
  const cInst = Math.max(tau - Math.max(dTau, 0.05) * sn, 0);

  return {
    normalStressKpa: r2(sn),
    peakFrictionAngle: r1(phiPeak),
    instantaneousCohesionKpa: r2(cInst),
    instantaneousFrictionAngle: r1(phiInst),
  };
}

// ── planar ───────────────────────────────────────────────────────────

function analyzePlanar(s: StructureInput, inp: Required<KinematicInput>): PlanarResult {
  const reasons: string[] = [];
  const lateral = angleDiff(s.dipDirection, inp.slopeDipDirection);
  const phiB = inp.basicFrictionAngle;

  const dirOk = lateral <= inp.lateralLimit;
  if (!dirOk) reasons.push(`Dip direction differs from slope face by ${r1(lateral)}° (> ±${inp.lateralLimit}°)`);
  const daylights = s.dip < inp.slopeDip;
  if (!daylights) reasons.push(`Plane (${s.dip}°) does not daylight in the ${inp.slopeDip}° face`);
  const steepEnough = s.dip > phiB;
  if (!steepEnough) reasons.push(`Plane dip (${s.dip}°) ≤ basic friction angle (${phiB}°)`);

  const feasible = dirOk && daylights && steepEnough;
  const res: PlanarResult = {
    structureId: s.id,
    dip: s.dip,
    dipDirection: s.dipDirection,
    feasible,
    reasons: feasible ? ["Daylighting plane within lateral limits, dip exceeds friction angle"] : reasons,
  };
  if (!feasible) return res;

  // Block geometry: unit-thickness wedge between slope face and plane
  const H = inp.slopeHeight;
  const psiF = inp.slopeDip * DEG;
  const psiP = s.dip * DEG;
  // Area of sliding block cross-section (m2): 0.5*H^2*(cot(psiP) - cot(psiF))
  const area = 0.5 * H * H * (1 / Math.tan(psiP) - 1 / Math.tan(psiF));
  const W = Math.max(area, 0) * inp.unitWeight; // kN per metre
  const planeLength = H / Math.sin(psiP); // m
  const sigmaN = (W * Math.cos(psiP)) / planeLength; // kPa (kN/m per m2/m)

  const jrc = s.jrc ?? 8;
  const strength = bartonBandis(sigmaN, jrc, inp.jcs, phiB);
  // FS = [c*L + W cos(psiP) tan(phi)] / [W sin(psiP)]
  const resisting =
    strength.instantaneousCohesionKpa * planeLength +
    W * Math.cos(psiP) * Math.tan(strength.instantaneousFrictionAngle * DEG);
  const driving = W * Math.sin(psiP);
  const fs = driving > 0 ? resisting / driving : 99;

  res.blockWeightKn = r2(W);
  res.strength = strength;
  res.factorOfSafety = r2(Math.min(fs, 99));
  res.status = fs >= 1.3 ? "Stable" : fs >= 1.0 ? "Marginal" : "Unstable";
  return res;
}

// ── wedge ────────────────────────────────────────────────────────────

function analyzeWedge(
  s1: StructureInput,
  s2: StructureInput,
  inp: Required<KinematicInput>
): WedgeResult {
  const li = intersectionLine(s1, s2);
  const reasons: string[] = [];
  const phiB = inp.basicFrictionAngle;

  const trendOk = angleDiff(li.trend, inp.slopeDipDirection) <= 90;
  if (!trendOk) reasons.push(`Intersection trend (${li.trend}°) points away from the slope face`);
  const daylights = li.plunge < inp.slopeDip;
  if (!daylights) reasons.push(`Intersection plunge (${li.plunge}°) ≥ slope dip (${inp.slopeDip}°) — does not daylight`);
  const steepEnough = li.plunge > phiB;
  if (!steepEnough) reasons.push(`Intersection plunge (${li.plunge}°) ≤ basic friction angle (${phiB}°)`);

  const feasible = trendOk && daylights && steepEnough;
  const res: WedgeResult = {
    pair: [s1.id, s2.id],
    lineOfIntersection: li,
    feasible,
    reasons: feasible
      ? ["Line of intersection daylights in the face and exceeds the friction angle"]
      : reasons,
  };
  if (!feasible) return res;

  // Tetrahedral wedge approximation sliding on the line of intersection.
  const H = inp.slopeHeight;
  const psiI = li.plunge * DEG;
  const psiF = inp.slopeDip * DEG;
  const included = Math.max(angleDiff(s1.dipDirection, s2.dipDirection), 10) * DEG;
  // Volume approximation: (H^3 / 6) * (cot(psiI) - cot(psiF)) * tan(included/2), floored at 0
  const vol = Math.max((H ** 3 / 6) * (1 / Math.tan(psiI) - 1 / Math.tan(psiF)) * Math.tan(included / 2), 0);
  const W = vol * inp.unitWeight; // kN
  // Contact area along both planes (rough approximation)
  const contact = Math.max((H * H) / Math.sin(psiI), 1);
  const sigmaN = (W * Math.cos(psiI)) / contact;

  const jrcAvg = ((s1.jrc ?? 8) + (s2.jrc ?? 8)) / 2;
  const strength = bartonBandis(sigmaN, jrcAvg, inp.jcs, phiB);
  // Wedge factor (Hoek & Bray): K depends on wedge geometry; use K = sin(beta)/sin(included/2) simplified ~ 1.2-2
  const K = Math.min(Math.max(1 / Math.sin(included / 2) * 0.7, 1), 3);
  const resisting =
    strength.instantaneousCohesionKpa * contact +
    K * W * Math.cos(psiI) * Math.tan(strength.instantaneousFrictionAngle * DEG);
  const driving = W * Math.sin(psiI);
  const fs = driving > 0 ? resisting / driving : 99;

  res.blockWeightKn = r2(W);
  res.strength = strength;
  res.factorOfSafety = r2(Math.min(fs, 99));
  res.status = fs >= 1.3 ? "Stable" : fs >= 1.0 ? "Marginal" : "Unstable";
  return res;
}

// ── toppling ─────────────────────────────────────────────────────────

function analyzeToppling(s: StructureInput, inp: Required<KinematicInput>): TopplingResult {
  const reasons: string[] = [];
  // Flexural toppling (Goodman-Bray): planes dip INTO the face:
  // dip direction opposite to slope (within lateral limit of the anti-direction),
  // and (90 - dip) <= slopeDip - phiB  (slip on steep planes)
  const antiDir = (inp.slopeDipDirection + 180) % 360;
  const lateral = angleDiff(s.dipDirection, antiDir);
  const dirOk = lateral <= inp.lateralLimit + 10; // toppling tolerates wider window
  if (!dirOk) reasons.push(`Dip direction not opposed to slope face (off anti-direction by ${r1(lateral)}°)`);
  const slipCondition = 90 - s.dip <= inp.slopeDip - inp.basicFrictionAngle;
  if (!slipCondition)
    reasons.push(
      `Slip condition not met: (90° − ${s.dip}°) > (${inp.slopeDip}° − ${inp.basicFrictionAngle}°)`
    );
  const steep = s.dip >= 60;
  if (!steep) reasons.push(`Plane dip (${s.dip}°) too shallow for toppling columns (< 60°)`);

  const feasible = dirOk && slipCondition && steep;
  return {
    structureId: s.id,
    dip: s.dip,
    dipDirection: s.dipDirection,
    feasible,
    mode: feasible ? "flexural" : "none",
    reasons: feasible
      ? ["Steep plane dipping into the face satisfying the Goodman-Bray slip condition"]
      : reasons,
  };
}

// ── main entry ───────────────────────────────────────────────────────

export function runKinematicAnalysis(input: KinematicInput): KinematicResult {
  const inp: Required<KinematicInput> = {
    lateralLimit: 20,
    ...input,
    structures: input.structures,
  } as Required<KinematicInput>;

  if (!inp.structures.length) {
    throw new Error("At least one structure is required");
  }
  if (inp.slopeDip <= 0 || inp.slopeDip > 90) throw new Error("Slope dip must be within 1-90°");

  const planar = inp.structures.map(s => analyzePlanar(s, inp));

  const wedge: WedgeResult[] = [];
  for (let i = 0; i < inp.structures.length; i++) {
    for (let j = i + 1; j < inp.structures.length; j++) {
      wedge.push(analyzeWedge(inp.structures[i], inp.structures[j], inp));
    }
  }

  const toppling = inp.structures.map(s => analyzeToppling(s, inp));

  const feasibleFs = [
    ...planar.filter(p => p.feasible && p.factorOfSafety != null).map(p => p.factorOfSafety!),
    ...wedge.filter(w => w.feasible && w.factorOfSafety != null).map(w => w.factorOfSafety!),
  ];
  const criticalFs = feasibleFs.length ? Math.min(...feasibleFs) : null;

  const pc = planar.filter(p => p.feasible).length;
  const wc = wedge.filter(w => w.feasible).length;
  const tc = toppling.filter(t => t.feasible).length;
  const percentage = (feasible: number, total: number) => total ? Math.round((feasible / total) * 1000) / 10 : 0;
  const pp = percentage(pc, planar.length);
  const wp = percentage(wc, wedge.length);
  const tp = percentage(tc, toppling.length);

  let overall = `Kinematic feasibility: Planar ${pp.toFixed(1)}% (${pc}/${planar.length} structures), Wedge ${wp.toFixed(1)}% (${wc}/${wedge.length} pairs), Toppling ${tp.toFixed(1)}% (${tc}/${toppling.length} structures).`;
  if (criticalFs == null && tc === 0) {
    overall += " No kinematically feasible failure mode identified for the given slope orientation and structural data.";
  } else {
    if (criticalFs != null) {
      overall += ` Critical factor of safety = ${criticalFs.toFixed(2)} (${
        criticalFs >= 1.3 ? "acceptable" : criticalFs >= 1.0 ? "marginal — reinforcement or redesign advised" : "unacceptable — failure likely, immediate action required"
      }).`;
    }
  }

  return {
    planar,
    wedge,
    toppling,
    summary: {
      planarCount: pc,
      planarTotal: planar.length,
      planarPercentage: pp,
      planarCritical: pc,
      wedgeCount: wc,
      wedgeTotal: wedge.length,
      wedgePercentage: wp,
      wedgeCritical: wc,
      topplingCount: tc,
      topplingTotal: toppling.length,
      topplingPercentage: tp,
      topplingCritical: tc,
      criticalFs,
      overallAssessment: overall,
    },
  };
}
