import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseFailureWorkbook } from "../client/src/lib/failureWorkbook";

describe("Failure Records workbook parser", () => {
  it("imports multiple yearly sheets and tolerates optional fields", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Date", "Pit", "Phase", "Wall", "Bench", "Lithologie", "Failure Type", "Action", "Other Comment", "Picture"],
      ["17-Oct-18", "Fekola", "4", "East", "90", "CHP", "Wedge", "Clean berm", "Contained by berm", "photo-1.jpg"],
    ]), "2018");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Date", "Pit", "Phase", "Wall", "Bench", "Lithologie", "Failure Type", "Action", "Other Comment", "Picture"],
      ["12-06-26", "Fekola", "8", "West", "", "MBX", "Planar", "Restrict access", "After rainfall", "#VALUE!"],
    ]), "2026");

    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const result = parseFailureWorkbook(bytes);

    expect(result.rows).toHaveLength(2);
    expect(result.sheetNames).toEqual(["2018", "2026"]);
    expect(result.rows[0]).toMatchObject({ pit: "Fekola", phase: "4", wall: "East", lithology: "CHP", sourceSheet: "2018" });
    expect(result.rows[1]).toMatchObject({ pit: "Fekola", failureType: "Planar", pictureReference: undefined, sourceSheet: "2026" });
  });
});

