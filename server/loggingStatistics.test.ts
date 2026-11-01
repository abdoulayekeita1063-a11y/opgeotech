import { describe, expect, it } from "vitest";
import { calculateLoggingStatistics } from "../client/src/lib/loggingStatistics";

// Controlled test fixtures only; never seeded into user workbooks or the database.
describe("Logging statistics by stratigraphy", () => {
  it("uses interval-length weighting for all four properties, not a simple average", () => {
    const result = calculateLoggingStatistics([
      {
        stratigraphy: "LAT",
        from: "0",
        to: "2",
        ucs: "10",
        rqdPercent: "20",
        fractureCount: "4",
        microRoughness: "Planar polished",
      },
      {
        stratigraphy: "LAT",
        from: "2",
        to: "10",
        ucs: "100",
        rqdPercent: "80",
        fractureCount: "4",
        microRoughness: "Stepped Irregular",
      },
    ]);
    const total = result.total;
    expect(total.loggedLength).toBe(10);
    expect(total.intervalCount).toBe(2);
    expect(total.metrics.ucs.average).toBeCloseTo((10 * 2 + 100 * 8) / 10);
    expect(total.metrics.rqd.average).toBeCloseTo((20 * 2 + 80 * 8) / 10);
    expect(total.metrics.spacing.average).toBeCloseTo(
      ((2 / 4) * 2 + (8 / 4) * 8) / 10
    );
    expect(total.metrics.jrc.average).toBeCloseTo((0.5 * 2 + 20 * 8) / 10);
    expect(result.groups[0].metrics).toEqual(total.metrics);
  });

  it("groups trimmed stratigraphy names case-insensitively across Hole IDs", () => {
    const result = calculateLoggingStatistics([
      { holeId: "DH-01", stratigraphy: " LAT ", from: "0", to: "2" },
      { holeId: "DH-02", stratigraphy: "lat", from: "0", to: "3" },
      { stratigraphy: "SAP", from: "2", to: "9" },
    ]);
    expect(result.groups.map(group => group.stratigraphy)).toEqual([
      "LAT",
      "SAP",
    ]);
    expect(result.groups[0].loggedLength).toBe(5);
    expect(result.groups[0].intervalCount).toBe(2);
    expect(result.total.loggedLength).toBe(12);
    expect(result.total.intervalCount).toBe(3);
  });

  it("excludes missing data separately per metric while preserving valid zero UCS and RQD", () => {
    const result = calculateLoggingStatistics([
      {
        stratigraphy: "LAT",
        from: "0",
        to: "2",
        ucs: "0",
        rqdPercent: "0",
        fractureCount: "0",
        microRoughness: "unknown",
      },
      {
        stratigraphy: "LAT",
        from: "2",
        to: "10",
        ucs: "",
        rqdPercent: "80",
        fractureCount: "4",
        microRoughness: "Planar rough",
      },
    ]);
    expect(result.total.metrics.ucs).toEqual({
      average: 0,
      validLength: 2,
      validIntervals: 1,
    });
    expect(result.total.metrics.rqd).toEqual({
      average: 64,
      validLength: 10,
      validIntervals: 2,
    });
    expect(result.total.metrics.spacing).toEqual({
      average: 2,
      validLength: 8,
      validIntervals: 1,
    });
    expect(result.total.metrics.jrc).toEqual({
      average: 2.5,
      validLength: 8,
      validIntervals: 1,
    });
  });

  it("uses RQD (%) only and does not mistake RQD >100 mm length for a percentage", () => {
    const result = calculateLoggingStatistics([
      { stratigraphy: "LAT", from: "0", to: "2", rqd: "1.5", rqdPercent: "75" },
      { stratigraphy: "LAT", from: "2", to: "10", rqd: "5" },
    ]);
    expect(result.total.metrics.rqd).toEqual({
      average: 75,
      validLength: 2,
      validIntervals: 1,
    });
  });

  it("ignores blank and discontinuity-only records and reports invalid rock intervals", () => {
    const result = calculateLoggingStatistics([
      {},
      { holeId: "DH-01", structureDepth: "10", alphaDip: "30" },
      { stratigraphy: "LAT", from: "", to: "2" },
      { stratigraphy: "LAT", from: "3", to: "3" },
      { stratigraphy: "LAT", from: "10", to: "5" },
      { stratigraphy: "LAT", from: "-1", to: "5" },
      { stratigraphy: "LAT", from: "0", to: "4" },
    ]);
    expect(result.excludedIntervals).toBe(4);
    expect(result.total.loggedLength).toBe(4);
    expect(result.total.intervalCount).toBe(1);
  });

  it("marks absent stratigraphy as Unspecified and invalid property values as missing", () => {
    const result = calculateLoggingStatistics([
      {
        from: "0",
        to: "2",
        rqdPercent: "101",
        ucs: "-1",
        fractureCount: "-2",
        microRoughness: "wrong profile",
      },
    ]);
    expect(result.unspecifiedIntervals).toBe(1);
    expect(result.groups[0].stratigraphy).toBe("Unspecified");
    Object.values(result.total.metrics).forEach(metric =>
      expect(metric).toEqual({
        average: null,
        validLength: 0,
        validIntervals: 0,
      })
    );
  });

  it("keeps full precision for spacing and computes the total from intervals", () => {
    const result = calculateLoggingStatistics([
      { stratigraphy: "LAT", from: "0", to: "1", fractureCount: "3", ucs: "1" },
      {
        stratigraphy: "SAP",
        from: "0",
        to: "2",
        fractureCount: "3",
        ucs: "10",
      },
    ]);
    expect(result.groups[0].metrics.spacing.average).toBeCloseTo(1 / 3, 12);
    expect(result.total.metrics.spacing.average).toBeCloseTo(
      ((1 / 3) * 1 + (2 / 3) * 2) / 3,
      12
    );
    expect(result.total.metrics.ucs.average).toBeCloseTo(
      (1 * 1 + 10 * 2) / 3,
      12
    );
  });

  it("accepts decimal comma numbers but rejects malformed values and qualifiers", () => {
    const result = calculateLoggingStatistics([
      {
        stratigraphy: "LAT",
        from: "0",
        to: "1,5",
        rqdPercent: "45,5",
        ucs: "12,5",
        fractureCount: "3",
      },
      {
        stratigraphy: "SAP",
        from: "0",
        to: "1",
        rqdPercent: "45abc",
        ucs: "<10",
        fractureCount: "3x",
      },
    ]);
    expect(result.groups[0].loggedLength).toBe(1.5);
    expect(result.groups[0].metrics.ucs.average).toBe(12.5);
    expect(result.groups[0].metrics.rqd.average).toBe(45.5);
    expect(result.groups[1].metrics.ucs.average).toBeNull();
    expect(result.groups[1].metrics.rqd.average).toBeNull();
    expect(result.groups[1].metrics.spacing.average).toBeNull();
  });

  it("returns an empty summary without NaN or invented averages", () => {
    const result = calculateLoggingStatistics([{}]);
    expect(result.groups).toEqual([]);
    expect(result.total.loggedLength).toBe(0);
    expect(result.total.intervalCount).toBe(0);
    expect(result.total.metrics.ucs.average).toBeNull();
    expect(result.excludedIntervals).toBe(0);
  });
});
