import { describe, expect, it } from "vitest";
import { computeBlastabilityIndex, evaluateWallControl } from "./blastability";

describe("Blastability Index (Lilly 1986) — SME reference", () => {
  it("matches the SME spreadsheet example: BI=50, PF=0.52", () => {
    // From the reference: RMD=10, JPS=50, JPO=20, Density=2.6, UCS=100
    // RDI = 25*2.6 - 50 = 15
    // Strength = 0.05*100 = 5
    // BI = 0.5*(10+50+20+15+5) = 50.0
    // PF = 0.004*50*2.6 = 0.52
    const result = computeBlastabilityIndex({
      rmd: 10,
      jps: 50,
      jpo: 20,
      density: 2.6,
      ucs: 100,
      rqd: 60, // fair — no adjustment
    });
    expect(result.bi).toBeCloseTo(50.0, 1);
    expect(result.rdi).toBeCloseTo(15, 1);
    expect(result.strength).toBeCloseTo(5, 1);
    expect(result.suggestedPowderFactor.value).toBeCloseTo(0.52, 2);
    expect(result.classification).toBe("Difficult");
  });

  it("computes BI for typical blocky rock (RMD=20, JPS=20, JPO=20, density=2.7, UCS=100)", () => {
    const result = computeBlastabilityIndex({
      rmd: 20,
      jps: 20,
      jpo: 20,
      density: 2.7,
      ucs: 100,
      rqd: 60,
    });
    // RDI = 25*2.7-50 = 17.5, Strength = 0.05*100 = 5
    // BI = 0.5*(20+20+20+17.5+5) = 41.25
    expect(result.bi).toBeCloseTo(41.25, 1);
    expect(result.classification).toBe("Medium");
    // PF = 0.004*41.25*2.7 = 0.4455
    expect(result.suggestedPowderFactor.value).toBeCloseTo(0.4455, 2);
  });

  it("RQD adjustment increases PF for massive rock (RQD=95)", () => {
    const base = computeBlastabilityIndex({
      rmd: 20, jps: 20, jpo: 20, density: 2.7, ucs: 100, rqd: 60,
    });
    const highRqd = computeBlastabilityIndex({
      rmd: 20, jps: 20, jpo: 20, density: 2.7, ucs: 100, rqd: 95,
    });
    // RQD 95 → factor 1.15 → PF should be 15% higher
    expect(highRqd.suggestedPowderFactor.value).toBeGreaterThan(base.suggestedPowderFactor.value);
    expect(highRqd.suggestedPowderFactor.value).toBeCloseTo(base.suggestedPowderFactor.value * 1.15, 2);
  });

  it("RQD adjustment decreases PF for fractured rock (RQD=15)", () => {
    const base = computeBlastabilityIndex({
      rmd: 20, jps: 20, jpo: 20, density: 2.7, ucs: 100, rqd: 60,
    });
    const lowRqd = computeBlastabilityIndex({
      rmd: 20, jps: 20, jpo: 20, density: 2.7, ucs: 100, rqd: 15,
    });
    // RQD 15 → factor 0.80 → PF should be 20% lower
    expect(lowRqd.suggestedPowderFactor.value).toBeLessThan(base.suggestedPowderFactor.value);
    expect(lowRqd.suggestedPowderFactor.value).toBeCloseTo(base.suggestedPowderFactor.value * 0.80, 2);
  });

  it("classifies massive hard dense rock as Very Difficult", () => {
    const result = computeBlastabilityIndex({
      rmd: 50,
      jps: 50,
      jpo: 40,
      density: 3.5,
      ucs: 250,
      rqd: 90,
    });
    // RDI = 25*3.5-50 = 37.5, Strength = 0.05*250 = 12.5
    // BI = 0.5*(50+50+40+37.5+12.5) = 95
    expect(result.bi).toBeCloseTo(95, 1);
    expect(result.classification).toBe("Very Difficult");
  });
});

describe("Wall Control Compliance", () => {
  it("returns Compliant for well-controlled blast with minimal damage", () => {
    const result = evaluateWallControl({
      preSplit: true,
      preSplitSpacing: 0.9,
      preSplitDiameter: 89,
      trimBlast: true,
      trimBurden: 2.5,
      bufferRows: 2,
      standoffDistance: 6,
      measuredBackbreak: 0.3,
      measuredCrestLoss: 0.2,
      designBermWidth: 8,
      actualBermWidth: 7.8,
    });
    expect(result.overallCompliance).toBe("Compliant");
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.wallDamageAssessment.overallDamage).toBe("Acceptable");
  });

  it("returns Non-Compliant for uncontrolled blast with severe damage", () => {
    const result = evaluateWallControl({
      preSplit: false,
      preSplitSpacing: 0,
      preSplitDiameter: 0,
      trimBlast: false,
      trimBurden: 0,
      bufferRows: 0,
      standoffDistance: 2,
      measuredBackbreak: 4.0,
      measuredCrestLoss: 3.0,
      designBermWidth: 8,
      actualBermWidth: 3,
    });
    expect(result.overallCompliance).toBe("Non-Compliant");
    expect(result.score).toBeLessThan(50);
    expect(result.wallDamageAssessment.overallDamage).toBe("Unacceptable");
    expect(result.wallDamageAssessment.backbreakSeverity).toBe("Severe");
  });
});
