import { describe, expect, it } from "vitest";
import { parseRadarCsv } from "./radarCsv";

describe("Radar CSV import", () => {
  it("parses ISO timestamps and converts numeric epoch seconds to milliseconds", () => {
    const readings = parseRadarCsv([
      "radarPointId,measuredAt,displacementMm,velocityMmPerDay,accelerationMmPerDay2",
      "P-01,2026-08-01T00:00:00Z,12.5,0.8,0.04",
      "P-01,1785628800,13.2,,",
    ].join("\\n"));

    expect(readings).toHaveLength(2);
    expect(readings[0]).toMatchObject({ radarPointId: "P-01", displacementMm: 12.5, velocityMmPerDay: 0.8, accelerationMmPerDay2: 0.04 });
    expect(readings[1].measuredAt).toBe(1785628800 * 1000);
    expect(readings[1].displacementMm).toBe(13.2);
  });

  it("rejects CSV files without the required time and displacement columns", () => {
    expect(() => parseRadarCsv("point,reading\\nP-01,4")).toThrow("measuredAt/timestamp and displacementMm");
  });
});
