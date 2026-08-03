import { describe, expect, it } from "vitest";
import { computeBlastabilityIndex, evaluateWallControl } from "./blastability";

describe("Blastability Index (Lilly 1986)", () => {
  it("computes BI for typical blocky rock with intermediate joints (UCS 100 MPa)", () => {
    const result = computeBlastabilityIndex({
      rmd: 20,
      jps: 20,
      jpo: 20,
      specificGravity: 2.7,
      hardness: 100, // UCS 100 MPa → H=5
    });
    // SGI = 25*2.7 - 50 = 17.5
    // H = 5 (UCS 75-100 → 5)
    // BI = 0.5*(20+20+20+17.5+5) = 41.25
    expect(result.bi).toBeCloseTo(41.25, 1);
    expect(result.sgi).toBeCloseTo(17.5, 1);
    expect(result.classification).toBe("Medium");
    expect(result.suggestedPowderFactor.min).toBeGreaterThan(0.2);
    expect(result.suggestedPowderFactor.max).toBeLessThan(0.5);
    expect(result.wallProximityPF.max).toBeLessThan(result.suggestedPowderFactor.min);
  });

  it("classifies massive hard rock (UCS 280 MPa) as Very Difficult", () => {
    const result = computeBlastabilityIndex({
      rmd: 50,
      jps: 50,
      jpo: 40,
      specificGravity: 3.5,
      hardness: 280, // UCS 280 MPa → H=10 (>250)
    });
    // SGI = 25*3.5-50 = 37.5; H=10; BI = 0.5*(50+50+40+37.5+10) = 93.75
    expect(result.bi).toBeCloseTo(93.75, 1);
    expect(result.classification).toBe("Very Difficult");
  });

  it("classifies friable rock (UCS 3 MPa) as Very Easy", () => {
    const result = computeBlastabilityIndex({
      rmd: 10,
      jps: 10,
      jpo: 10,
      specificGravity: 2.0,
      hardness: 3, // UCS 3 MPa → H=1 (<5)
    });
    // SGI = 25*2-50 = 0; H=1; BI = 0.5*(10+10+10+0+1) = 15.5
    expect(result.bi).toBeCloseTo(15.5, 1);
    expect(result.classification).toBe("Very Easy");
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
