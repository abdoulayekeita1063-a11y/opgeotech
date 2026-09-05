import * as XLSX from "xlsx";

export type FailureWorkbookRow = {
  incidentDate: number;
  pit: string;
  phase?: string;
  wall?: string;
  bench?: string;
  lithology?: string;
  failureType?: string;
  actionTaken?: string;
  comments?: string;
  pictureReference?: string;
  sourceSheet?: string;
};

export type FailureWorkbookResult = {
  rows: FailureWorkbookRow[];
  warnings: string[];
  sheetNames: string[];
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return !normalized || normalized === "#VALUE!" ? undefined : normalized;
}

function parseDateValue(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? Date.UTC(parsed.y, parsed.m - 1, parsed.d) : null;
  }
  const raw = text(value);
  const named = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})$/);
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (month !== undefined) {
      const yearNumber = Number(named[3]);
      const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
      return Date.UTC(year, month, Number(named[1]));
    }
  }
  const numeric = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (numeric) {
    const yearNumber = Number(numeric[3]);
    const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
    return Date.UTC(year, Number(numeric[2]) - 1, Number(numeric[1]));
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseFailureWorkbook(data: ArrayBuffer): FailureWorkbookResult {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const rows: FailureWorkbookRow[] = [];
  const warnings: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    if (!values.length) continue;
    const headerIndex = values.findIndex(row => Array.isArray(row) && row.some(cell => text(cell).toLowerCase().includes("date")));
    if (headerIndex < 0) {
      warnings.push(`${sheetName}: header row not found`);
      continue;
    }
    for (let index = headerIndex + 1; index < values.length; index += 1) {
      const row = values[index] ?? [];
      if (!Array.isArray(row) || !row.some(cell => text(cell))) continue;
      const incidentDate = parseDateValue(row[0]);
      const pit = text(row[1]);
      if (!incidentDate || !pit) {
        warnings.push(`${sheetName} row ${index + 1}: skipped because Date or Pit is missing/invalid`);
        continue;
      }
      rows.push({
        incidentDate,
        pit,
        phase: optionalText(row[2]),
        wall: optionalText(row[3]),
        bench: optionalText(row[4]),
        lithology: optionalText(row[5]),
        failureType: optionalText(row[6]),
        actionTaken: optionalText(row[7]),
        comments: optionalText(row[8]),
        pictureReference: optionalText(row[9]),
        sourceSheet: sheetName,
      });
    }
  }

  return { rows, warnings, sheetNames: workbook.SheetNames };
}

