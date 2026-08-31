import { describe, expect, it } from "vitest";
import { analyzeRadarTrend } from "./radar";

const day = 86_400_000;

describe("Radar trend analysis", () => {
  it("derives velocity and acceleration from displacement time series", () => {
    const result = analyzeRadarTrend([
      { radarPointId: "P-01", measuredAt: 0 + day, displacementMm: 0 },
      { radarPointId: "P-01", measuredAt: 2 * day, displacementMm: 2 },
      { radarPointId: "P-01", measuredAt: 3 * day, displacementMm: 5 },
    ]);

    expect(result.sampleCount).toBe(3);
    expect(result.displacementChangeMm).toBe(5);
    expect(result.latestVelocityMmPerDay).toBe(3);
    expect(result.latestAccelerationMmPerDay2).toBe(1);
    expect(result.risk).toBe("Critical");
  });

  it("uses supplied velocity and acceleration when available", () => {
    const result = analyzeRadarTrend([
      { radarPointId: "P-02", measuredAt: day, displacementMm: 10, velocityMmPerDay: 0.4, accelerationMmPerDay2: 0.02 },
      { radarPointId: "P-02", measuredAt: 2 * day, displacementMm: 10.4, velocityMmPerDay: 0.5, accelerationMmPerDay2: 0.03 },
    ]);

    expect(result.latestVelocityMmPerDay).toBe(0.5);
    expect(result.latestAccelerationMmPerDay2).toBe(0.03);
    expect(result.risk).toBe("Low");
  });

  it("returns a moderate warning when a trend exceeds the moderate threshold", () => {
    const result = analyzeRadarTrend([
      { radarPointId: "P-03", measuredAt: day, displacementMm: 0 },
      { radarPointId: "P-03", measuredAt: 2 * day, displacementMm: 2 },
    ]);

    expect(result.latestVelocityMmPerDay).toBe(2);
    expect(result.risk).toBe("Moderate");
    expect(result.alert).toContain("Moderate movement trend");
  });
});
