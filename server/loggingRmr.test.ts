import { describe, expect, it } from "vitest";
import { calculateJointSpacing, calculateLoggingRmr } from "../client/src/lib/loggingRmr";

describe("Logging Data rock-mass calculations", () => {
  it("calculates joint spacing as interval length divided by fracture count", () => {
    expect(calculateJointSpacing("10", "22", "4")).toBe("3.000");
    expect(calculateJointSpacing("10", "22", "0")).toBe("");
    expect(calculateJointSpacing("22", "10", "4")).toBe("");
  });

  it("calculates RMR from UCS, RQD, joint spacing, roughness and water condition", () => {
    expect(calculateLoggingRmr({
      ucs: "120",
      rqd: "80",
      jointSpacing: "1.000",
      roughness: "5",
      waterCondition: "12",
    })).toBe("81.0");
  });

  it("returns a blank RMR when required inputs are incomplete or out of range", () => {
    expect(calculateLoggingRmr({ ucs: "120", rqd: "80", jointSpacing: "", roughness: "5", waterCondition: "12" })).toBe("");
    expect(calculateLoggingRmr({ ucs: "120", rqd: "80", jointSpacing: "1", roughness: "7", waterCondition: "12" })).toBe("");
    expect(calculateLoggingRmr({ ucs: "120", rqd: "80", jointSpacing: "1", roughness: "5", waterCondition: "16" })).toBe("");
  });
});
