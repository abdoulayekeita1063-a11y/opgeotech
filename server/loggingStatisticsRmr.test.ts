import { describe, expect, it } from "vitest";
import { calculateLoggingStatistics } from "../client/src/lib/loggingStatistics";
import {
  calculateLoggingRmr,
  getRoughnessProfile,
  roughnessOptions,
  getLoggingWaterRating,
} from "../client/src/lib/loggingRmr";

// Controlled regression fixtures only; never saved in a user workbook or database.
const baseRow = {
  stratigraphy: "LAT",
  from: "0",
  to: "2",
  ucs: "120",
  recovery: "2",
  rqd: "1.6",
  rqdPercent: "80",
  jointSpacing: "1.000",
  microRoughness: "Planar rough",
  jrc: "2.5",
  waterCondition: "Dry",
};

describe("Statistics Water and RMR use the logging scales", () => {
  it.each(roughnessOptions)(
    "uses exactly the logging RMR score for %s",
    profile => {
      const row = {
        ...baseRow,
        microRoughness: profile,
        jrc: String(getRoughnessProfile(profile)!.jrc),
      };
      const result = calculateLoggingStatistics([row]);
      const existingRmr = Number(
        calculateLoggingRmr({ ...row, roughness: profile })
      );
      expect(result.total.rmr).toBe(existingRmr);
      expect(result.groups[0].rmr).toBe(existingRmr);
      expect(result.total.roughnessRating.average).toBe(
        getRoughnessProfile(profile)!.rmrScore
      );
    }
  );

  it("uses Dry=15 and Wet=0 in Water and in the summary RMR", () => {
    const dry = calculateLoggingStatistics([baseRow]).total;
    const wet = calculateLoggingStatistics([
      { ...baseRow, waterCondition: "Wet" },
    ]).total;
    expect(dry.metrics.water.average).toBe(15);
    expect(wet.metrics.water.average).toBe(0);
    expect(dry.rmr! - wet.rmr!).toBe(15);
    expect(dry.rmr).toBe(
      Number(
        calculateLoggingRmr({ ...baseRow, roughness: baseRow.microRoughness })
      )
    );
  });

  it("weights water and source roughness scores, then applies ratings to the summary properties", () => {
    const rows = [
      {
        ...baseRow,
        from: "0",
        to: "2",
        ucs: "10",
        recovery: "2",
        rqd: "0.4",
        rqdPercent: "20",
        jointSpacing: "0.5",
        microRoughness: "Planar polished",
        jrc: "0.5",
        waterCondition: "Dry",
      },
      {
        ...baseRow,
        from: "2",
        to: "10",
        ucs: "100",
        recovery: "8",
        rqd: "6.4",
        rqdPercent: "80",
        jointSpacing: "2",
        microRoughness: "Stepped Irregular",
        jrc: "20",
        waterCondition: "Wet",
      },
    ];
    const result = calculateLoggingStatistics(rows).total;
    expect(result.metrics.water.average).toBe((15 * 2 + 0 * 8) / 10);
    expect(result.roughnessRating.average).toBe((6 * 2 + 25 * 8) / 10);
    // Average UCS lies in the 50–100 band; RQD in 50–75; spacing in 1–3 m.
    const expected =
      7 + 13 + 25 + (6 * 2 + 25 * 8) / 10 + (15 * 2 + 0 * 8) / 10;
    expect(result.rmr).toBeCloseTo(expected);
    const weightedIntervalRmr =
      rows.reduce(
        (sum, row) =>
          sum +
          Number(
            calculateLoggingRmr({ ...row, roughness: row.microRoughness })
          ) *
            (Number(row.to) - Number(row.from)),
        0
      ) / 10;
    expect(result.rmr).not.toBe(weightedIntervalRmr);
  });

  it("does not reclassify JRC as a roughness score or use an existing row RMR", () => {
    const result = calculateLoggingStatistics([
      { ...baseRow, jrc: "20", microRoughness: "Planar polished", rmr: "99" },
    ]).total;
    expect(result.metrics.jrc.average).toBe(20);
    expect(result.roughnessRating.average).toBe(6);
    expect(result.rmr).toBe(12 + 17 + 25 + 6 + 15);
  });

  it("keeps RMR blank when a required component has no valid data", () => {
    for (const field of [
      "ucs",
      "rqd",
      "recovery",
      "jointSpacing",
      "microRoughness",
      "waterCondition",
    ]) {
      expect(
        calculateLoggingStatistics([{ ...baseRow, [field]: "" }]).total.rmr
      ).toBeNull();
    }
    expect(
      calculateLoggingStatistics([
        { ...baseRow, microRoughness: "unknown", jrc: "14" },
      ]).total.rmr
    ).toBeNull();
  });

  it("excludes missing water without replacing it by zero and retains valid Wet=0", () => {
    const result = calculateLoggingStatistics([
      { ...baseRow, from: "0", to: "2", waterCondition: "Wet" },
      { ...baseRow, from: "2", to: "10", waterCondition: "" },
    ]).total;
    expect(result.metrics.water).toEqual({
      average: 0,
      validLength: 2,
      validIntervals: 1,
    });
    expect(result.loggedLength).toBe(10);
    expect(result.rmr).toBe(12 + 17 + 25 + 20 + 0);
  });

  it("retains the distinction between Dry and legacy numerical water=15", () => {
    expect(getLoggingWaterRating("Dry")).toBe(15);
    expect(getLoggingWaterRating("15")).toBe(10);
    expect(getLoggingWaterRating("Wet")).toBe(0);
    expect(getLoggingWaterRating("16")).toBeNull();
    const result = calculateLoggingStatistics([
      { ...baseRow, waterCondition: "15", microRoughness: "5" },
    ]).total;
    expect(result.metrics.water.average).toBe(10);
    expect(result.roughnessRating.average).toBe(20);
    expect(result.rmr).toBe(
      Number(
        calculateLoggingRmr({
          ...baseRow,
          waterCondition: "15",
          roughness: "5",
        })
      )
    );
  });

  it("rejects malformed water/profile data instead of extracting incidental digits", () => {
    const invalidWater = calculateLoggingStatistics([
      { ...baseRow, waterCondition: "Wet15abc" },
    ]).total;
    const invalidProfile = calculateLoggingStatistics([
      { ...baseRow, microRoughness: "unknown5" },
    ]).total;
    expect(invalidWater.metrics.water.average).toBeNull();
    expect(invalidWater.rmr).toBeNull();
    expect(invalidProfile.roughnessRating.average).toBeNull();
    expect(invalidProfile.rmr).toBeNull();
  });
});
