import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseRadarWorkbook } from "../client/src/lib/radarWorkbook";

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Radar Monitoring");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("parseRadarWorkbook", () => {
  it("parses displacement, velocity and observations from the two-row radar header", () => {
    const buffer = workbookBuffer([
      ["Date", "Pit", "Window", "displacement", "", "", "Velocity", "", "", "Observations"],
      ["", "", "", "Max", "min", "average", "Max", "min", "average", ""],
      ["24-Apr-25", "Fekola", "East", 1.47, 0.015, 0.7425, 0.077, 0, 0.0385, "NF"],
    ]);

    const rows = parseRadarWorkbook(buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pit: "Fekola",
      window: "East",
      displacementMaxMm: 1.47,
      displacementMinMm: 0.015,
      displacementAverageMm: 0.7425,
      velocityMaxMmPerDay: 0.077,
      velocityMinMmPerDay: 0,
      velocityAverageMmPerDay: 0.0385,
      observations: "NF",
    });
  });

  it("ignores formatting-only rows that have no pit and window", () => {
    const buffer = workbookBuffer([
      ["Date", "Pit", "Window", "displacement", "", "", "Velocity", "", "", "Observations"],
      ["", "", "", "Max", "min", "average", "Max", "min", "average", ""],
      ["24-Apr-25", "Fekola", "East", 1, 0, 0.5, 0.1, 0, 0.05, "NF"],
      ["24-Apr-25", "", "", "", "", "", "", "", "", ""],
    ]);

    expect(parseRadarWorkbook(buffer)).toHaveLength(1);
  });
});
