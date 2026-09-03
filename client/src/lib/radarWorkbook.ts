import * as XLSX from "xlsx";

export type RadarSummaryRow = {
  measuredAt: number;
  pit: string;
  window: string;
  displacementMaxMm: number | null;
  displacementMinMm: number | null;
  displacementAverageMm: number | null;
  velocityMaxMmPerDay: number | null;
  velocityMinMmPerDay: number | null;
  velocityAverageMmPerDay: number | null;
  observations: string | null;
};

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S));
  }
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid monitoring date: ${String(value)}`);
  return timestamp;
}

export function parseRadarWorkbook(data: ArrayBuffer): RadarSummaryRow[] {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("The workbook does not contain a readable worksheet");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (matrix.length < 3) throw new Error("The workbook must contain two header rows and at least one monitoring row");

  return matrix.slice(2).filter(row => row.some(cell => String(cell).trim() !== "") && String(row[1] ?? "").trim() && String(row[2] ?? "").trim()).map((row, index) => {
    const value = (column: number) => row[column];
    const pit = String(value(1) ?? "").trim();
    const window = String(value(2) ?? "").trim();
    if (!pit || !window) throw new Error(`Missing pit or window on workbook row ${index + 3}`);
    return {
      measuredAt: parseDate(value(0)),
      pit,
      window,
      displacementMaxMm: numberOrNull(value(3)),
      displacementMinMm: numberOrNull(value(4)),
      displacementAverageMm: numberOrNull(value(5)),
      velocityMaxMmPerDay: numberOrNull(value(6)),
      velocityMinMmPerDay: numberOrNull(value(7)),
      velocityAverageMmPerDay: numberOrNull(value(8)),
      observations: String(value(9) ?? "").trim() || null,
    };
  });
}
