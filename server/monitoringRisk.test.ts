import { describe, expect, it } from "vitest";
import { classifyMonitoringRiskFromVelocities, validateMonitoringThresholds } from "../client/src/lib/monitoringRisk";

describe("Monitoring maximum-velocity risk classification", () => {
  it("classifies 6.230 mm/day as Critical when the critical threshold is 5.601", () => {
    const result = classifyMonitoringRiskFromVelocities(
      [0.2, 0.8, 6.23, 1.4],
      { moderate: 1, high: 1.001, critical: 5.601 },
    );

    expect(result.maxVelocity).toBe(6.23);
    expect(result.risk).toBe("Critical");
  });

  it("uses absolute maximum velocity and applies threshold precedence", () => {
    expect(classifyMonitoringRiskFromVelocities([-6.23], { moderate: 1, high: 1.001, critical: 5.601 }).risk).toBe("Critical");
    expect(classifyMonitoringRiskFromVelocities([3], { moderate: 1, high: 1.001, critical: 5.601 }).risk).toBe("High");
    expect(classifyMonitoringRiskFromVelocities([1], { moderate: 1, high: 1.001, critical: 5.601 }).risk).toBe("Moderate");
    expect(classifyMonitoringRiskFromVelocities([0.999], { moderate: 1, high: 1.001, critical: 5.601 }).risk).toBe("Low");
  });

  it("accepts any ordered non-negative thresholds and rejects ambiguous order", () => {
    expect(validateMonitoringThresholds({ moderate: 0.25, high: 2.75, critical: 12.5 })).toBeNull();
    expect(validateMonitoringThresholds({ moderate: 5, high: 5, critical: 10 })).toBe("Threshold order must be Moderate < High < Critical.");
    expect(validateMonitoringThresholds({ moderate: 6, high: 5, critical: 10 })).toBe("Threshold order must be Moderate < High < Critical.");
    expect(validateMonitoringThresholds({ moderate: -1, high: 5, critical: 10 })).toBe("Thresholds must be non-negative numeric values.");
  });
});
