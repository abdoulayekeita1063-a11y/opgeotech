import { describe, expect, it } from "vitest";
import { analyzeRadarTrend } from "./radar";

const day = 86_400_000;

describe("Radar trend analysis", () => {
  it("derives velocity from displacement time series", () => {
    const result = analyzeRadarTrend([
      { radarPointId: "P-01", measuredAt: 0 + day, displacementMm: 0 },
      { radarPointId: "P-01", measuredAt: 2 * day, displacementMm: 2 },
      { radarPointId: "P-01", measuredAt: 3 * day, displacementMm: 5 },
    ]);

    expect(result.sampleCount).toBe(3);
    expect(result.displacementChangeMm).toBe(5);
    expect(result.latestVelocityMmPerDay).toBe(3);
    expect(result.risk).toBe("Moderate");
  });

  it("returns an inverse-velocity forecast when the speed trend accelerates consistently", () => {
    const result = analyzeRadarTrend([
      { radarPointId: "P-INV", measuredAt: day, displacementMm: 0 },
      { radarPointId: "P-INV", measuredAt: 2 * day, displacementMm: 1 },
      { radarPointId: "P-INV", measuredAt: 3 * day, displacementMm: 3 },
      { radarPointId: "P-INV", measuredAt: 4 * day, displacementMm: 6 },
    ]);

    expect(result.failureForecast.method).toBe("Inverse velocity");
    expect(result.failureForecast.status).toBe("Forecast available");
    expect(result.failureForecast.predictedFailureAt).not.toBeNull();
    expect(result.failureForecast.rSquared).toBeGreaterThanOrEqual(0.9);
  });

  it("respects configurable velocity thresholds", () => {
    const result = analyzeRadarTrend([
      { radarPointId: "P-CFG", measuredAt: day, displacementMm: 0 },
      { radarPointId: "P-CFG", measuredAt: 2 * day, displacementMm: 2 },
    ], {
      moderateVelocityMmPerDay: 3,
      highVelocityMmPerDay: 6,
      criticalVelocityMmPerDay: 9,
    });

    expect(result.latestVelocityMmPerDay).toBe(2);
    expect(result.risk).toBe("Low");
  });

  it("classifies every Monitoring risk level from velocity thresholds only", () => {
    const thresholds = {
      moderateVelocityMmPerDay: 1,
      highVelocityMmPerDay: 5,
      criticalVelocityMmPerDay: 10,
    };
    const riskAt = (velocityMmPerDay: number) => analyzeRadarTrend([
      { radarPointId: "PROJECT-RISK", measuredAt: day, displacementMm: 0, velocityMmPerDay: 0 },
      { radarPointId: "PROJECT-RISK", measuredAt: 2 * day, displacementMm: velocityMmPerDay, velocityMmPerDay },
    ], thresholds).risk;

    expect(riskAt(0.99)).toBe("Low");
    expect(riskAt(1)).toBe("Moderate");
    expect(riskAt(5)).toBe("High");
    expect(riskAt(10)).toBe("Critical");
  });

  it("uses maximum filtered velocity for risk instead of only the latest value", () => {
    const result = analyzeRadarTrend([
      { radarPointId: "PROJECT-MAX", measuredAt: day, displacementMm: 0, velocityMmPerDay: 0.2 },
      { radarPointId: "PROJECT-MAX", measuredAt: 2 * day, displacementMm: 6.23, velocityMmPerDay: 6.23 },
      { radarPointId: "PROJECT-MAX", measuredAt: 3 * day, displacementMm: 6.73, velocityMmPerDay: 0.5 },
    ], {
      moderateVelocityMmPerDay: 1,
      highVelocityMmPerDay: 1.001,
      criticalVelocityMmPerDay: 5.601,
    });

    expect(result.latestVelocityMmPerDay).toBe(0.5);
    expect(result.peakVelocityMmPerDay).toBe(6.23);
    expect(result.risk).toBe("Critical");
  });

  it("uses supplied velocity when available", () => {
    const result = analyzeRadarTrend([
      { radarPointId: "P-02", measuredAt: day, displacementMm: 10, velocityMmPerDay: 0.4 },
      { radarPointId: "P-02", measuredAt: 2 * day, displacementMm: 10.4, velocityMmPerDay: 0.5 },
    ]);

    expect(result.latestVelocityMmPerDay).toBe(0.5);
    expect(result.risk).toBe("Low");
  });

  it("returns a moderate warning when a trend exceeds the moderate threshold", () => {
    const result = analyzeRadarTrend([
      { radarPointId: "P-03", measuredAt: day, displacementMm: 0 },
      { radarPointId: "P-03", measuredAt: 2 * day, displacementMm: 2 },
    ]);

    expect(result.latestVelocityMmPerDay).toBe(2);
    expect(result.risk).toBe("Moderate");
    expect(result.alert).toContain("Moderate movement velocity");
  });
});
