import { describe, expect, it } from "vitest";
import { calculateJointSpacing, calculateLoggingRmr, getRmrQuality } from "../client/src/lib/loggingRmr";

describe("Logging Data rock-mass calculations", () => {
  it("calculates joint spacing as interval length divided by fracture count", () => {
    expect(calculateJointSpacing("10", "22", "4")).toBe("3.000");
    expect(calculateJointSpacing("10", "22", "0")).toBe("");
    expect(calculateJointSpacing("22", "10", "4")).toBe("");
  });

  it("calculates RMR from UCS, RQD, joint spacing, roughness and water condition", () => {
    expect(calculateLoggingRmr({
      ucs: "120",
      rqdPercent: "80",
      rqd: "10",
      jointSpacing: "1.000",
      roughness: "5",
      waterCondition: "12",
    })).toBe("84.0");
  });

  it("returns a blank RMR when required inputs are incomplete or out of range", () => {
    expect(calculateLoggingRmr({ ucs: "120", rqd: "80", jointSpacing: "", roughness: "5", waterCondition: "12" })).toBe("");
    expect(calculateLoggingRmr({ ucs: "120", rqd: "80", jointSpacing: "1", roughness: "7", waterCondition: "12" })).toBe("");
    expect(calculateLoggingRmr({ ucs: "120", rqd: "80", jointSpacing: "1", roughness: "5", waterCondition: "16" })).toBe("");
  });

  it("classifies RMR bands and marks low-quality intervals with alert colours", () => {
    expect(getRmrQuality("85")?.label).toBe("Very good");
    expect(getRmrQuality("45")?.label).toBe("Fair");
    expect(getRmrQuality("35")?.label).toBe("Poor");
    expect(getRmrQuality("35")?.cellClass).toContain("orange");
    expect(getRmrQuality("15")?.label).toBe("Very poor");
    expect(getRmrQuality("")).toBeNull();
  });

  it("uses RQD (%) when both RQD fields are present", () => {
    const withHighPercent = calculateLoggingRmr({ ucs: "120", rqdPercent: "80", rqd: "10", jointSpacing: "1", roughness: "5", waterCondition: "12" });
    const withLowPercent = calculateLoggingRmr({ ucs: "120", rqdPercent: "10", rqd: "80", jointSpacing: "1", roughness: "5", waterCondition: "12" });
    expect(withHighPercent).toBe("84.0");
    expect(withLowPercent).toBe("70.0");
  });

  it("accepts the requested roughness labels in the RMR calculation", () => {
    const polished = calculateLoggingRmr({ ucs: "120", rqdPercent: "80", jointSpacing: "1", roughness: "Planar polished", waterCondition: "12" });
    const irregular = calculateLoggingRmr({ ucs: "120", rqdPercent: "80", jointSpacing: "1", roughness: "Stepped Irregular", waterCondition: "12" });
    expect(polished).toBe("64.0");
    expect(irregular).toBe("89.0");
  });
});
