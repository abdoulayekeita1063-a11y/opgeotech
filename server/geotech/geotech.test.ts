import { describe, expect, it } from "vitest";
import { computeStability } from "./stability";
import { computeCompliance } from "./compliance";
import {
  computeGSI,
  computeQ,
  computeRMR,
  computeSMR,
  ratingRQD,
  ratingSpacing,
  ratingUCS,
} from "./classification";

describe("slope stability (Fellenius & Bishop)", () => {
  it("computes a stable FS for a gentle, strong slope", () => {
    const r = computeStability({
      cohesion: 25,
      frictionAngle: 35,
      unitWeight: 20,
      slopeHeight: 10,
      slopeAngle: 30,
      waterCondition: "dry",
    });
    expect(r.fsBishop).toBeGreaterThan(1.3);
    expect(r.fsFellenius).toBeGreaterThan(1.0);
    expect(r.status).toBe("stable");
    expect(r.interpretation).toContain("STABLE");
  });

  it("computes a low FS for a steep, weak, saturated slope", () => {
    const r = computeStability({
      cohesion: 5,
      frictionAngle: 20,
      unitWeight: 22,
      slopeHeight: 60,
      slopeAngle: 65,
      waterCondition: "saturated",
    });
    expect(r.fsBishop).toBeLessThan(1.0);
    expect(r.status).toBe("unstable");
  });

  it("saturated condition reduces FS vs dry", () => {
    const base = {
      cohesion: 20,
      frictionAngle: 30,
      unitWeight: 20,
      slopeHeight: 20,
      slopeAngle: 45,
    } as const;
    const dry = computeStability({ ...base, waterCondition: "dry" });
    const sat = computeStability({ ...base, waterCondition: "saturated" });
    expect(sat.fsBishop).toBeLessThan(dry.fsBishop);
  });

  it("benchmark: matches expected FS range for a classic textbook case", () => {
    // Reference-style case: c'=20 kPa, φ'=25°, γ=19 kN/m3, H=15 m, β=35°, dry.
    // Chart solutions (Taylor / Bishop-Morgenstern) give FS ≈ 1.3–1.6 for
    // this configuration; the grid-search slice engine should land in that band.
    const r = computeStability({
      cohesion: 20,
      frictionAngle: 25,
      unitWeight: 19,
      slopeHeight: 15,
      slopeAngle: 35,
      waterCondition: "dry",
    });
    expect(r.fsBishop).toBeGreaterThan(1.2);
    expect(r.fsBishop).toBeLessThan(1.8);
    expect(r.fsFellenius).toBeGreaterThan(1.0);
    expect(r.fsFellenius).toBeLessThan(1.8);
  });

  it("returns finite positive FS values and a critical circle", () => {
    const r = computeStability({
      cohesion: 15,
      frictionAngle: 28,
      unitWeight: 21,
      slopeHeight: 30,
      slopeAngle: 40,
      waterCondition: "partial",
    });
    expect(r.fsBishop).toBeGreaterThan(0);
    expect(r.fsFellenius).toBeGreaterThan(0);
    expect(Number.isFinite(r.fsBishop)).toBe(true);
    expect(Number.isFinite(r.fsFellenius)).toBe(true);
    expect(r.criticalCircle.radius).toBeGreaterThan(0);
  });
});

describe("RMR classification", () => {
  it("rates individual parameters per Bieniawski 1989", () => {
    expect(ratingUCS(300)).toBe(15);
    expect(ratingUCS(150)).toBe(12);
    expect(ratingUCS(30)).toBe(4);
    expect(ratingRQD(95)).toBe(20);
    expect(ratingRQD(60)).toBe(13);
    expect(ratingSpacing(3)).toBe(20);
    expect(ratingSpacing(0.3)).toBe(10);
  });

  it("classifies a good rock mass as Class II", () => {
    const r = computeRMR({
      ucs: 120, // 12
      rqd: 80, // 17
      spacing: 0.7, // 15
      conditionRating: 20,
      groundwaterRating: 10,
      orientationAdjustment: -5,
    });
    // 12+17+15+20+10-5 = 69
    expect(r.score).toBe(69);
    expect(r.rockClass).toContain("Class II");
    expect(r.interpretation).toContain("good");
  });

  it("classifies a very poor rock mass as Class V", () => {
    const r = computeRMR({
      ucs: 2,
      rqd: 20,
      spacing: 0.05,
      conditionRating: 5,
      groundwaterRating: 0,
      orientationAdjustment: -10,
    });
    expect(r.score).toBeLessThanOrEqual(20);
    expect(r.rockClass).toContain("Class V");
  });
});

describe("SMR classification", () => {
  it("computes the Romana correction factors and classifies a stable slope", () => {
    const result = computeSMR({
      rmrBasic: 69,
      jointDip: 65,
      jointDipDirection: 120,
      slopeDip: 70,
      slopeDipDirection: 120,
      excavationMethod: "production-blasting",
    });

    expect(result.breakdown.f1).toBeCloseTo(0.15, 2);
    expect(result.breakdown.f2).toBe(1);
    expect(result.breakdown.f3).toBe(-6);
    expect(result.breakdown.f4).toBe(-8);
    expect(result.score).toBeCloseTo(60.1, 1);
    expect(result.rockClass).toContain("Class II");
  });

  it("reduces SMR for unfavorable joint and slope orientation", () => {
    const result = computeSMR({
      rmrBasic: 55,
      jointDip: 75,
      jointDipDirection: 100,
      slopeDip: 65,
      slopeDipDirection: 280,
      excavationMethod: "poor-blasting",
    });

    expect(result.breakdown.f1).toBe(1);
    expect(result.breakdown.f3).toBe(-25);
    expect(result.score).toBeLessThan(35);
    expect(result.rockClass).toMatch(/Class IV|Class V/);
  });

  it("evaluates two joint sets and uses the lower governing SMR", () => {
    const result = computeSMR({
      rmrBasic: 69,
      jointDip: 65,
      jointDipDirection: 120,
      jointDip2: 80,
      jointDipDirection2: 300,
      slopeDip: 70,
      slopeDipDirection: 120,
      excavationMethod: "production-blasting",
    });

    expect(result.governingJointSet).toBe(2);
    expect(result.breakdown.set1Score).toBeGreaterThan(result.breakdown.set2Score);
    expect(result.score).toBe(result.breakdown.set2Score);
    expect(result.interpretation).toContain("Joint Set 2 governs");
  });
});

describe("Q-system classification", () => {
  it("computes Q = (RQD/Jn)(Jr/Ja)(Jw/SRF)", () => {
    const r = computeQ({ rqd: 90, jn: 9, jr: 3, ja: 1, jw: 1, srf: 1 });
    expect(r.score).toBeCloseTo(30, 1);
    expect(r.rockClass).toBe("Good");
  });

  it("classifies very poor rock", () => {
    const r = computeQ({ rqd: 25, jn: 15, jr: 1, ja: 8, jw: 0.66, srf: 5 });
    expect(r.score).toBeLessThan(0.1);
    expect(r.rockClass).toMatch(/poor/i);
  });

  it("applies RQD minimum of 10", () => {
    const r = computeQ({ rqd: 0, jn: 9, jr: 1, ja: 1, jw: 1, srf: 1 });
    expect(r.score).toBeCloseTo(10 / 9, 2);
  });
});

describe("GSI classification", () => {
  it("computes GSI from structure and surface ratings", () => {
    const r = computeGSI({ structureRating: 70, surfaceRating: 60 });
    expect(r.score).toBe(65);
    expect(r.rockClass).toContain("Blocky");
  });

  it("bounds GSI between 5 and 95", () => {
    expect(computeGSI({ structureRating: 0, surfaceRating: 0 }).score).toBe(5);
    expect(computeGSI({ structureRating: 100, surfaceRating: 100 }).score).toBe(95);
  });
});

describe("design compliance", () => {
  it("passes when all deviations are within tolerance", () => {
    const r = computeCompliance({
      designBenchHeight: 10,
      actualBenchHeight: 10.3,
      designBermWidth: 8,
      actualBermWidth: 7.5,
      designBatterAngle: 70,
      actualBatterAngle: 71,
      toleranceHeight: 0.5,
      toleranceBerm: 1,
      toleranceAngle: 2,
    });
    expect(r.compliant).toBe(true);
    expect(r.compliancePct).toBe(100);
    expect(r.interpretation).toContain("COMPLIANT");
  });

  it("fails with a major deviation flagged", () => {
    const r = computeCompliance({
      designBenchHeight: 10,
      actualBenchHeight: 10.2,
      designBermWidth: 8,
      actualBermWidth: 4, // -4 m >> 2x tolerance → major
      designBatterAngle: 70,
      actualBatterAngle: 76, // +6° > 2x tolerance → major
      toleranceHeight: 0.5,
      toleranceBerm: 1,
      toleranceAngle: 2,
    });
    expect(r.compliant).toBe(false);
    expect(r.compliancePct).toBeCloseTo(33.3, 1);
    const berm = r.items.find(i => i.parameter === "Berm width")!;
    expect(berm.severity).toBe("major");
    expect(r.interpretation).toContain("NON-COMPLIANT");
  });
});
