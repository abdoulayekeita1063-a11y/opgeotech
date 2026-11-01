import { describe, expect, it } from "vitest";
import {
  calculateJointSpacing,
  calculateLoggingRmr,
  getRmrQuality,
  getRoughnessProfile,
  roughnessCodes,
} from "../client/src/lib/loggingRmr";

const base = {
  ucs: "120",
  recovery: "2",
  rqd: "1.6",
  rqdPercent: "99",
  jointSpacing: "1.000",
  roughness: "5",
  waterCondition: "12",
};

describe("Logging Data rock-mass calculations", () => {
  it("calculates joint spacing as interval length divided by fracture count", () => {
    expect(calculateJointSpacing("10", "22", "4")).toBe("3.000");
    expect(calculateJointSpacing("10", "22", "0")).toBe("");
    expect(calculateJointSpacing("22", "10", "4")).toBe("");
  });

  it("calculates RMR from recovery-based RQD (%), UCS, spacing, roughness and water", () => {
    expect(calculateLoggingRmr(base)).toBe("84.0");
  });

  it("adds 15 RMR points for Dry and 0 points for Wet", () => {
    expect(calculateLoggingRmr({ ...base, waterCondition: "Dry" })).toBe(
      "89.0"
    );
    expect(calculateLoggingRmr({ ...base, waterCondition: "Wet" })).toBe(
      "74.0"
    );
  });

  it("returns blank RMR for incomplete or invalid sources instead of using a stored percent", () => {
    expect(calculateLoggingRmr({ ...base, jointSpacing: "" })).toBe("");
    expect(calculateLoggingRmr({ ...base, roughness: "7" })).toBe("");
    expect(calculateLoggingRmr({ ...base, waterCondition: "16" })).toBe("");
    expect(calculateLoggingRmr({ ...base, recovery: "0" })).toBe("");
    expect(calculateLoggingRmr({ ...base, recovery: "" })).toBe("");
    expect(calculateLoggingRmr({ ...base, rqd: "2.1" })).toBe("");
    expect(calculateLoggingRmr({ ...base, rqd: "" })).toBe("");
  });

  it("classifies RMR bands and marks low-quality intervals with alert colours", () => {
    expect(getRmrQuality("85")?.label).toBe("Very good");
    expect(getRmrQuality("45")?.label).toBe("Fair");
    expect(getRmrQuality("35")?.label).toBe("Poor");
    expect(getRmrQuality("35")?.cellClass).toContain("orange");
    expect(getRmrQuality("15")?.label).toBe("Very poor");
    expect(getRmrQuality("")).toBeNull();
  });

  it("uses the calculated percentage even when an old imported percent contradicts it", () => {
    expect(calculateLoggingRmr({ ...base, rqd: "1.6", rqdPercent: "10" })).toBe(
      "84.0"
    );
    expect(calculateLoggingRmr({ ...base, rqd: "0.2", rqdPercent: "80" })).toBe(
      "70.0"
    );
  });

  it("preserves the requested roughness profiles and their RMR scores", () => {
    expect(calculateLoggingRmr({ ...base, roughness: "Planar polished" })).toBe(
      "70.0"
    );
    expect(
      calculateLoggingRmr({ ...base, roughness: "Stepped Irregular" })
    ).toBe("89.0");
    expect(getRoughnessProfile("Undulating Smooth")).toEqual({
      jrc: 11,
      state: "Very rough",
      rmrScore: 25,
    });
    expect(roughnessCodes["Undulating Smooth"]).toBe("US");
    expect(getRoughnessProfile("Planar rough")).toEqual({
      jrc: 2.5,
      state: "Rough",
      rmrScore: 20,
    });
    expect(roughnessCodes["Planar rough"]).toBe("PR");
  });
});
