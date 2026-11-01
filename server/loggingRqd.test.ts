import { describe, expect, it } from "vitest";
import { calculateRqdPercentage, findRqdHeaderIndex } from "../client/src/lib/loggingRqd";

describe("calculateRqdPercentage", () => {
  it("returns percentage points from RQD and recovery lengths in the same metres", () => {
    const rqdMetres = "2.75";
    const recoveryMetres = "4.25";

    expect(calculateRqdPercentage(rqdMetres, recoveryMetres)).toBe(
      (Number(rqdMetres) / Number(recoveryMetres)) * 100,
    );
  });

  it("accepts numeric strings with decimal commas and preserves full precision", () => {
    const rqdMetres = "1,25";
    const recoveryMetres = "3,6";

    expect(calculateRqdPercentage(rqdMetres, recoveryMetres)).toBe(
      (Number(rqdMetres.replace(",", ".")) / Number(recoveryMetres.replace(",", "."))) * 100,
    );
  });

  it("returns zero for a valid zero RQD length", () => {
    expect(calculateRqdPercentage("0", "2.5")).toBe(0);
  });

  it.each([
    [undefined, "2"],
    ["1", undefined],
    ["not-a-length", "2"],
    ["1", "not-a-length"],
    ["-0.01", "2"],
    ["1", "-2"],
    ["1", "0"],
    ["1e309", "2"],
    ["1", "1e309"],
    ["2.01", "2"],
  ])("returns null rather than clamping missing or invalid input (%s, %s)", (rqd, recovery) => {
    expect(calculateRqdPercentage(rqd, recovery)).toBeNull();
  });
});

describe("findRqdHeaderIndex", () => {
  it.each([
    [["RQD (%)", "RQD (>100 mm)"], 1, 0],
    [["RQD (>100 mm)", "RQD (%)"], 0, 1],
  ] as const)("distinguishes length and percent columns regardless of their order", (header, lengthIndex, percentIndex) => {
    expect(findRqdHeaderIndex(header, "length")).toBe(lengthIndex);
    expect(findRqdHeaderIndex(header, "percent")).toBe(percentIndex);
  });

  it.each([
    ["RQD (>100 mm)"],
    ["RQD (>100 mm) (m)"],
    ["RQD"],
    ["RQD length (m)"],
  ])("recognizes %s as an RQD source-length header", lengthHeader => {
    expect(findRqdHeaderIndex(["unrelated", lengthHeader], "length")).toBe(1);
  });

  it.each([
    ["RQD percent"],
    ["rqdPercent"],
    ["RQD %"],
  ])("recognizes %s as an RQD percentage header", percentHeader => {
    expect(findRqdHeaderIndex(["unrelated", percentHeader], "percent")).toBe(1);
  });

  it("excludes RQD rating and score headers", () => {
    const header = ["RQD rating", "RQD score"];

    expect(findRqdHeaderIndex(header, "length")).toBe(-1);
    expect(findRqdHeaderIndex(header, "percent")).toBe(-1);
  });

  it("does not use a percentage column as the source-length column when length is absent", () => {
    const header = ["Depth (m)", "RQD (%)", "Recovery (%)"];

    expect(findRqdHeaderIndex(header, "length")).toBe(-1);
    expect(findRqdHeaderIndex(header, "percent")).toBe(1);
  });
});
