import { describe, expect, it } from "vitest";
import { scoreWallRisk, wallRiskCategories, wallRiskWeights } from "./wallRisk";

describe("wall risk classification", () => {
  it("returns a transparent low-risk baseline with all eight categories", () => {
    const result = scoreWallRisk({});
    expect(result.riskLevel).toBe("Low");
    expect(result.overallScore).toBe(0);
    expect(result.categoryScores.map(item => item.category)).toEqual([...wallRiskCategories]);
    expect(Object.values(wallRiskWeights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
  });

  it("elevates water, failure and monitoring concerns into a critical result", () => {
    const result = scoreWallRisk({
      faceMoistureCondition: "Saturated",
      ponding: "Severe ponding",
      drainage: "Blocked",
      potentialFailureMechanism: "Multiple mechanisms",
      failureHistory: "Active",
      orientation: "Daylight / unfavourable",
      factorOfSafety: 0.8,
      monitoringMethod: "None",
      monitoringFrequency: "None",
      analysis: "Critical",
      velocity: 4,
      bermWidth: 10,
      slopeHeight: 100,
      slopeAngle: 90,
      rockMassRating: 10,
      jointSets: 10,
      jointContinuity: "Continuous",
      infilling: "Gouge",
      rockMassCharacterization: "Decomposed",
      mappingDensity: "None",
      irsData: "Missing",
      geotechDrillingProgram: "None",
      faceCleaningMethod: "None",
      bermCondition: "No berm",
      rockFaceDescription: "Unstable",
      looseMaterials: "Hanging block",
      limitBlastingMethod: "None",
      wallDamage: "Severe",
      crestBackbreak: "Severe",
      hardToe: "Severe",
      structuralPlanesVisible: "Yes",
    });
    expect(result.riskLevel).toBe("Critical");
    expect(result.overallScore).toBeGreaterThanOrEqual(7.5);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("keeps blank criteria out of severity while reporting data completeness", () => {
    const result = scoreWallRisk({ rockMassRating: 65, faceMoistureCondition: "Dry" });
    expect(result.overallScore).toBeLessThan(2.5);
    expect(result.dataCompleteness).toBeGreaterThan(0);
    expect(result.method).toContain("Technical 14%");
  });
});
