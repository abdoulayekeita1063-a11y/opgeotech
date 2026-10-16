import { useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Download, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { trpc } from "@/lib/trpc";
import { calculateJointSpacing, calculateLoggingRmr, getRmrQuality, getRoughnessProfile, roughnessCodes, roughnessOptions } from "@/lib/loggingRmr";

type Row = Record<string, string>;
type Metadata = Record<string, string>;
type Column = readonly [string, string];

const metadataFields = [
  ["projectName", "Project name"], ["projectNo", "Project No"], ["deposit", "Deposit"], ["holeNo", "Hole No"],
  ["easting", "Easting"], ["northing", "Northing"], ["rl", "R.L."],
  ["preCollarDepth", "Pre collar depth"], ["pqDepth", "PQ depth"], ["hqDepth", "HQ depth"], ["loggedBy", "Logged by"],
  ["dateLogged", "Date logged"], ["drillStartDate", "Drill start date"], ["completionDate", "Completion date"],
  ["drillingCompany", "Drilling company"], ["oriMethod", "ORI method"], ["rigNo", "Rig No."], ["oriLinePosition", "ORI line position"],
] as const;

const sourceColumns = [
  ["from", "From"], ["to", "To"], ["stratigraphy", "Stratigraphy"], ["recovery", "Recovery (m)"], ["rqd", "RQD (>100 mm)"], ["rqdPercent", "RQD (%)"],
  ["fractureCount", "Fracture Count"],
  ["structureDepth", "Structure Depth"], ["structureType", "Structure Type"],
  ["alphaDip", "Alpha / Dip"], ["betaDipDir", "Beta / Dip Dir."], ["infillThickness", "Infill Thickness"],
  ["microRoughness", "Roughness profile"], ["ucs", "UCS (MPa)"], ["waterCondition", "Water Condition (0–15)"],
] as const;

const derivedColumns = [
  ["jointSpacing", "Joint Spacing (m)"], ["jrc", "JRC"], ["roughnessState", "Surface state"], ["dip", "Dip"], ["dipDirection", "Dip Direction"], ["rmr", "RMR"],
] as const;

const holeColumns = [
  ["holeId", "Hole ID"], ["holeDip", "Hole Dip"], ["holeAzimuth", "Hole Azimuth"],
] as const;
const columns = [...holeColumns, ...sourceColumns, ...derivedColumns] as readonly Column[];
const rockMassColumns = [
  ["holeId", "Hole ID"], ["from", "From"], ["to", "To"], ["stratigraphy", "Stratigraphy"], ["recovery", "Recovery (m)"], ["rqd", "RQD (>100 mm)"], ["rqdPercent", "RQD (%)"],
  ["fractureCount", "Fracture Count"], ["infillThickness", "Infill Thickness"], ["microRoughness", "Roughness profile"], ["ucs", "UCS (MPa)"], ["waterCondition", "Water Condition (0–15)"],
  ["jointSpacing", "Joint Spacing (m)"], ["jrc", "JRC"], ["roughnessState", "Surface state"], ["rmr", "RMR"],
] as readonly Column[];
const discontinuityColumns = [
  ...holeColumns, ["structureDepth", "Structure Depth"], ["structureType", "Structure Type"], ["alphaDip", "Alpha / Dip"], ["betaDipDir", "Beta / Dip Dir."], ["dip", "Dip"], ["dipDirection", "Dip Direction"],
] as readonly Column[];
const rockSourceColumns = sourceColumns.filter(([key]) => !["structureDepth", "structureType", "alphaDip", "betaDipDir"].includes(key));

// Source workbook positions, including the blank separator columns used by HOLEID.
const workbookColumnIndexes = [1, 2, 4, 9, 10, 15, 13, 21, 22, 23, 24, 26, 27, 33, 34] as const;
const exportColumnIndexes = [...workbookColumnIndexes, 35, 36, 37, 38, 39, 40] as const;

const emptyMetadata = (): Metadata => Object.fromEntries(metadataFields.map(([key]) => [key, ""]));
const emptyRow = (): Row => Object.fromEntries(columns.map(([key]) => [key, ""]));
const stringify = (value: unknown) => value == null ? "" : String(value);
const csvSafeFileName = (value: string) => (value || "HOLEID").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toUpperCase();
const numericValue = (value: string | undefined) => {
  const parsed = Number.parseFloat((value ?? "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Converts oriented-core alpha/beta measurements to true dip/dip direction.
 * Convention: hole dip is positive downward from horizontal; azimuth is clockwise
 * from north; alpha is the angle between the discontinuity plane and the core axis;
 * beta is clockwise around the oriented core. The result is a lower-hemisphere
 * plane orientation in degrees.
 */
function alphaBetaToTrueOrientation(alphaText: string, betaText: string, holeDipText: string, holeAzimuthText: string) {
  if (validateAngleText(alphaText, "Alpha / Dip", 0, 180) || validateAngleText(betaText, "Beta / Dip Dir.", 0, 360) || validateAngleText(holeDipText, "Hole Dip", 0, 90) || validateAngleText(holeAzimuthText, "Hole Azimuth", 0, 360)) return { dip: "", dipDirection: "" };
  const alpha = numericValue(alphaText);
  const beta = numericValue(betaText);
  const holeDip = numericValue(holeDipText);
  const holeAzimuth = numericValue(holeAzimuthText);
  if ([alpha, beta, holeDip, holeAzimuth].some(value => value === null)) return { dip: "", dipDirection: "" };

  const rad = Math.PI / 180;
  const dip = Math.max(0, Math.min(90, holeDip as number)) * rad;
  const azimuth = ((holeAzimuth as number % 360) + 360) % 360 * rad;
  const alphaRad = Math.max(0, Math.min(180, alpha as number)) * rad;
  const betaRad = ((beta as number % 360) + 360) % 360 * rad;
  const axis = { e: Math.sin(azimuth) * Math.cos(dip), n: Math.cos(azimuth) * Math.cos(dip), u: -Math.sin(dip) };
  const reference = Math.abs(axis.u) < 0.95 ? { e: 0, n: 0, u: 1 } : { e: 1, n: 0, u: 0 };
  const cross = (a: typeof axis, b: typeof axis) => ({ e: a.n * b.u - a.u * b.n, n: a.u * b.e - a.e * b.u, u: a.e * b.n - a.n * b.e });
  const length = (v: typeof axis) => Math.hypot(v.e, v.n, v.u);
  const normalize = (v: typeof axis) => { const size = length(v) || 1; return { e: v.e / size, n: v.n / size, u: v.u / size }; };
  const radial = normalize(cross(axis, reference));
  const transverse = normalize(cross(axis, radial));
  const poleAngle = Math.PI / 2 - Math.min(Math.PI / 2, alphaRad);
  let pole = normalize({
    e: Math.cos(poleAngle) * axis.e + Math.sin(poleAngle) * (Math.cos(betaRad) * radial.e + Math.sin(betaRad) * transverse.e),
    n: Math.cos(poleAngle) * axis.n + Math.sin(poleAngle) * (Math.cos(betaRad) * radial.n + Math.sin(betaRad) * transverse.n),
    u: Math.cos(poleAngle) * axis.u + Math.sin(poleAngle) * (Math.cos(betaRad) * radial.u + Math.sin(betaRad) * transverse.u),
  });
  if (pole.u < 0) pole = { e: -pole.e, n: -pole.n, u: -pole.u };
  const trueDip = Math.atan2(Math.hypot(pole.e, pole.n), pole.u) / rad;
  const normalBearing = (Math.atan2(pole.e, pole.n) / rad + 360) % 360;
  const trueDipDirection = (normalBearing + 180) % 360;
  return { dip: trueDip.toFixed(1), dipDirection: trueDipDirection.toFixed(1) };
}

function findValue(row: unknown[], label: string) {
  const wanted = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  const index = row.findIndex(value => stringify(value).toLowerCase().replace(/[^a-z0-9]/g, "").includes(wanted));
  if (index < 0) return "";
  return stringify(row.slice(index + 1).find(value => stringify(value).trim()));
}

function findHeaderIndex(header: unknown[], labels: string[]) {
  const normalized = labels.map(label => label.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return header.findIndex(value => {
    const cell = stringify(value).toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalized.some(label => cell === label || cell.includes(label));
  });
}

function normalizeRoughnessValue(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[–—]/g, "-").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const codeMatch = normalized.match(/\b(pp|ps|pr|up|us|ur|sp|ss|si)\b/);
  const byCode = roughnessOptions.find(option => roughnessCodes[option] === codeMatch?.[1]?.toUpperCase());
  if (byCode) return byCode;
  return roughnessOptions.find(option => option.toLowerCase() === normalized) ?? value.trim();
}

function valueFor(row: Row, key: string) {
  if (key === "holeId" || key === "holeDip" || key === "holeAzimuth") return row[key] ?? "";
  if (key === "jointSpacing") return calculateJointSpacing(row.from, row.to, row.fractureCount);
  if (key === "jrc") return getRoughnessProfile(row.microRoughness)?.jrc.toFixed(1) ?? "";
  if (key === "roughnessState") return getRoughnessProfile(row.microRoughness)?.state ?? "";
  if (key === "rmr") return calculateLoggingRmr({ ...row, jointSpacing: calculateJointSpacing(row.from, row.to, row.fractureCount), roughness: row.microRoughness });
  if (key === "dip" || key === "dipDirection") {
    return alphaBetaToTrueOrientation(row.alphaDip ?? "", row.betaDipDir ?? "", row.holeDip ?? "", row.holeAzimuth ?? "")[key];
  }
  return row[key] ?? "";
}

const strictAnglePattern = /^[+-]?\d+(?:\.\d+)?\s*°?$/;
function validateAngleText(value: string, label: string, min: number, max: number) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!strictAnglePattern.test(trimmed)) return `${label} must be a number between ${min}° and ${max}°.`;
  const numeric = Number.parseFloat(trimmed.replace("°", "").trim());
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return `${label} must be between ${min}° and ${max}°.`;
  return null;
}

function orientationErrors(rows: Row[]) {
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const holeDipText = row.holeDip ?? "";
    const holeAzimuthText = row.holeAzimuth ?? "";
    const holeDipError = validateAngleText(holeDipText, `Interval ${index + 1} Hole Dip`, 0, 90);
    const azimuthError = validateAngleText(holeAzimuthText, `Interval ${index + 1} Hole Azimuth`, 0, 360);
    if (holeDipError) errors.push(holeDipError);
    if (azimuthError) errors.push(azimuthError);
    const alphaText = row.alphaDip ?? "";
    const betaText = row.betaDipDir ?? "";
    const hasAlpha = alphaText.trim().length > 0;
    const hasBeta = betaText.trim().length > 0;
    const hasHoleOrientation = holeDipText.trim().length > 0 || holeAzimuthText.trim().length > 0;
    if (!hasAlpha && !hasBeta && !hasHoleOrientation) return;
    if (!holeDipText.trim()) errors.push(`Interval ${index + 1}: Hole Dip is required for each interval.`);
    if (!holeAzimuthText.trim()) errors.push(`Interval ${index + 1}: Hole Azimuth is required for each interval.`);
    if (!hasAlpha) errors.push(`Interval ${index + 1}: Alpha / Dip is required when Beta / Dip Dir. is entered.`);
    if (!hasBeta) errors.push(`Interval ${index + 1}: Beta / Dip Dir. is required when Alpha / Dip is entered.`);
    const alphaError = validateAngleText(alphaText, `Interval ${index + 1} Alpha / Dip`, 0, 180);
    const betaError = validateAngleText(betaText, `Interval ${index + 1} Beta / Dip Dir.`, 0, 360);
    if (alphaError) errors.push(alphaError);
    if (betaError) errors.push(betaError);
  });
  return Array.from(new Set(errors));
}

export default function LoggingData() {
  const rockMassFileRef = useRef<HTMLInputElement>(null);
  const discontinuityFileRef = useRef<HTMLInputElement>(null);
  const [metadata, setMetadata] = useState<Metadata>(emptyMetadata);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [comments, setComments] = useState("");
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [showRmrAlertsOnly, setShowRmrAlertsOnly] = useState(false);
  const [fillDrag, setFillDrag] = useState<{ key: string; value: string; startRow: number } | null>(null);
  const rowsHistory = useRef<Row[][]>([]);
  const logs = trpc.logging.list.useQuery();
  const utils = trpc.useUtils();
  const save = trpc.logging.save.useMutation({
    onSuccess: result => { toast.success("Logging workbook saved"); setSelectedLogId(Number(result.id)); utils.logging.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.logging.delete.useMutation({
    onSuccess: () => { toast.success("Logging workbook deleted"); setSelectedLogId(null); setMetadata(emptyMetadata()); setRows([emptyRow()]); setComments(""); utils.logging.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const validationErrors = orientationErrors(rows);
  const alertRowCount = rows.filter(row => ["Poor", "Very poor"].includes(getRmrQuality(valueFor(row, "rmr"))?.label ?? "")).length;
  const displayedRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => !showRmrAlertsOnly || ["Poor", "Very poor"].includes(getRmrQuality(valueFor(row, "rmr"))?.label ?? ""));

  const updateRow = (index: number, key: string, value: string) => setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const commitRows = (updater: (current: Row[]) => Row[]) => setRows(current => { rowsHistory.current.push(current.map(row => ({ ...row }))); return updater(current); });
  const undoRows = () => setRows(current => rowsHistory.current.length ? rowsHistory.current.pop() ?? current : current);
  const handleUndoShortcut = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    undoRows();
  };
  const copyOrientationToAll = () => {
    const source = rows.find(row => String(row.holeId ?? "").trim() && String(row.holeDip ?? "").trim() && String(row.holeAzimuth ?? "").trim());
    if (!source) return toast.error("Complete Hole ID, Hole Dip and Hole Azimuth in one interval first");
    const sourceErrors = [
      validateAngleText(source.holeDip ?? "", "Hole Dip", 0, 90),
      validateAngleText(source.holeAzimuth ?? "", "Hole Azimuth", 0, 360),
    ].filter(Boolean) as string[];
    if (sourceErrors.length) return toast.error(sourceErrors[0]);
    commitRows(current => current.map(row => ({ ...row, holeId: source.holeId, holeDip: source.holeDip, holeAzimuth: source.holeAzimuth })));
    toast.success(`Copied hole orientation to ${rows.length} interval${rows.length === 1 ? "" : "s"}`);
  };

  const importSectionWorkbook = async (file: File, section: "rock" | "discontinuity") => {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("The workbook has no readable worksheet");
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
      const nextMetadata = emptyMetadata();
      const metadataRows = matrix.slice(0, 4);
      const lookup: Record<string, string> = { projectName: "project name", projectNo: "project no", deposit: "deposit", holeNo: "hole no", easting: "easting", northing: "northing", rl: "r.l.", dip: "dip", azimuth: "azimuth", preCollarDepth: "pre collar depth", pqDepth: "pq depth", hqDepth: "hq depth", loggedBy: "logged by", dateLogged: "date logged", drillStartDate: "drill start date", completionDate: "completion date", drillingCompany: "drilling company", oriMethod: "ori method", rigNo: "rig no.", oriLinePosition: "ori line position" };
      for (const [key, label] of Object.entries(lookup)) nextMetadata[key] = metadataRows.map(row => findValue(row, label)).find(Boolean) ?? "";
      const sectionColumns = section === "rock" ? rockMassColumns : discontinuityColumns;
      const headerLabels = sectionColumns.flatMap(([, label]) => [label]);
      const labelRow = matrix.findIndex(row => {
        const matches = headerLabels.filter(label => findHeaderIndex(row, [label]) >= 0).length;
        return section === "rock" ? matches >= 2 && findHeaderIndex(row, ["Stratigraphy"]) >= 0 : matches >= 2 && (findHeaderIndex(row, ["Structure Depth", "Alpha / Dip", "Hole ID"]) >= 0);
      });
      if (labelRow < 0) throw new Error(`Could not find the ${section === "rock" ? "Rock mass classification" : "Discontinuity data"} header row`);
      const start = labelRow + 1;
      const header = matrix[labelRow] ?? [];
      const headerIndexes: Record<string, number> = {};
      [...sectionColumns].forEach(([key, label]) => {
        const index = findHeaderIndex(header, key === "microRoughness" ? [label, key, "Roughness"] : [label, key]);
        if (index >= 0) headerIndexes[key] = index;
      });
      const imported = matrix.slice(start).map(source => {
        const row = emptyRow();
        sectionColumns.forEach(([key]) => {
          const sourceIndex = headerIndexes[key];
          if (sourceIndex !== undefined) row[key] = key === "microRoughness" ? normalizeRoughnessValue(stringify(source[sourceIndex] ?? "")) : stringify(source[sourceIndex] ?? "");
        });
        if (section === "rock") {
          rockSourceColumns.forEach(([key]) => { if (!row[key]) row[key] = stringify(source[headerIndexes[key] ?? -1] ?? ""); });
        }
        row.holeId = row.holeId || nextMetadata.holeNo;
        row.holeDip = row.holeDip || (nextMetadata.dip ?? "");
        row.holeAzimuth = row.holeAzimuth || (nextMetadata.azimuth ?? "");
        return row;
      }).filter(row => Object.values(row).some(value => value.trim()));
      if (section === "discontinuity") {
        const importedErrors = orientationErrors(imported);
        if (importedErrors.length) throw new Error(`Validation failed: ${importedErrors[0]}`);
      }
      setMetadata(current => section === "rock" ? nextMetadata : current);
      commitRows(current => {
        const merged = current.slice(0, Math.max(current.length, imported.length));
        while (merged.length < imported.length) merged.push(emptyRow());
        const keysToMerge = sectionColumns.map(([key]) => key);
        return merged.map((row, index) => {
          const incoming = imported[index];
          if (!incoming) return row;
          return keysToMerge.reduce((mergedRow, key) => ({ ...mergedRow, [key]: incoming[key] ?? "" }), row);
        });
      });
      setSelectedLogId(null);
      toast.success(`Imported ${imported.length} ${section === "rock" ? "rock mass classification" : "discontinuity data"} interval${imported.length === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read workbook");
    }
  };

  const saveWorkbook = () => {
    if (validationErrors.length) return toast.error(validationErrors[0]);
    const rowHoleId = rows.find(row => String(row.holeId ?? "").trim())?.holeId ?? "";
    const validRows = rows.filter(row => Object.values(row).some(value => value.trim())).map(row => ({
      ...row,
      dip: valueFor(row, "dip"),
      dipDirection: valueFor(row, "dipDirection"),
    }));
    if (!validRows.length) return toast.error("Add at least one logging interval");
    const holeId = metadata.holeNo.trim() || String(rowHoleId).trim();
    if (!holeId) return toast.error("Enter a Hole No or Hole ID before saving logging data");
    save.mutate({ holeId, metadata, rows: validRows, comments: comments || undefined });
  };

  const exportWorkbook = () => {
    if (validationErrors.length) return toast.error(validationErrors[0]);
    const headerGroups = Array<string>(39).fill("");
    headerGroups[0] = "Hole ID";
    headerGroups[1] = "Depth";
    headerGroups[4] = "Rock Type";
    headerGroups[9] = "Rock Mass Data";
    headerGroups[18] = "Soil Data";
    headerGroups[21] = "Discontinuity Data";
    const headerLabels = Array<string>(39).fill("");
    sourceColumns.forEach(([key, label], index) => { headerLabels[workbookColumnIndexes[index]] = label; });
    derivedColumns.forEach(([key, label], index) => { headerLabels[exportColumnIndexes[sourceColumns.length + index]] = label; });
    const topRows = [
      ["", "", "", "", "PROJECT NAME:", "", metadata.projectName, "", "", "EASTING:", "", metadata.easting, "", "PRE COLLAR DEPTH:", metadata.preCollarDepth, "", "", "", "", "LOGGED BY:", metadata.loggedBy, "", "", "", "", "DRILL START DATE:", metadata.drillStartDate],
      ["", "", "", "", "PROJECT No:", "", metadata.projectNo, "", "", "NORTHING:", "", metadata.northing, "", "PQ DEPTH:", metadata.pqDepth, "", "", "", "", "DATE LOGGED:", metadata.dateLogged, "", "", "", "", "COMPLETION DATE:", metadata.completionDate],
      ["", "", "", "", "DEPOSIT:", "", metadata.deposit, "", "", "R.L.:", "", metadata.rl, "", "HQ DEPTH:", metadata.hqDepth, "", "", "", "", "DRILLING COMPANY:", metadata.drillingCompany, "", "", "", "", "ORI METHOD:", metadata.oriMethod],
      ["", "", "", "", "HOLE No:", "", metadata.holeNo, "", "", "DIP:", "", metadata.dip, "", "AZIMUTH:", metadata.azimuth, "", "", "", "", "RIG No.:", metadata.rigNo, "", "", "", "", "ORI LINE POSITION:", metadata.oriLinePosition],
      [], headerGroups, headerLabels,
      ...rows.filter(row => Object.values(row).some(value => value.trim())).map(row => {
        const output = Array<string>(39).fill("");
        output[0] = row.holeId || metadata.holeNo;
        sourceColumns.forEach(([key], index) => { output[workbookColumnIndexes[index]] = row[key] ?? ""; });
        derivedColumns.forEach(([key], index) => { output[exportColumnIndexes[sourceColumns.length + index]] = valueFor(row, key); });
        return output;
      }),
      [], ["Comments", comments],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(topRows);
    sheet["!cols"] = [{ wch: 16 }, ...Array.from({ length: 32 }, () => ({ wch: 18 }))];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    XLSX.writeFile(workbook, `${csvSafeFileName(metadata.holeNo)}_HOLEID_Logging.xlsx`);
    toast.success("Logging workbook exported");
  };

  const loadLog = (log: NonNullable<typeof logs.data>[number]) => {
    setSelectedLogId(log.id);
    setMetadata(log.metadata as Metadata);
    setRows((log.rows as Row[]).length ? log.rows as Row[] : [emptyRow()]);
    setComments(log.comments ?? "");
  };

  const pasteGrid = (startRow: number, startKey: string, tableColumns: readonly Column[], text: string) => {
    const matrix = text.replace(/\r/g, "").split("\n").filter(line => line.length > 0).map(line => line.split("\t"));
    const startColumn = tableColumns.findIndex(([key]) => key === startKey);
    if (startColumn < 0 || !matrix.length) return;
    commitRows(current => {
      const next = [...current];
      while (next.length < startRow + matrix.length) next.push(emptyRow());
      matrix.forEach((values, rowOffset) => values.forEach((value, columnOffset) => {
        const column = tableColumns[startColumn + columnOffset];
        if (column && !["dip", "dipDirection", "jointSpacing", "jrc", "roughnessState", "rmr"].includes(column[0])) next[startRow + rowOffset] = { ...next[startRow + rowOffset], [column[0]]: value };
      }));
      return next;
    });
  };

  const fillDown = (startRow: number, key: string, value: string) => {
    if (!value.trim()) return;
    commitRows(current => current.map((row, index) => index >= startRow ? { ...row, [key]: value } : row));
  };

  const handleCellKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>, rowIndex: number, key: string, value: string) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const shortcut = event.key.toLowerCase();
    if (shortcut === "d") {
      event.preventDefault();
      fillDown(rowIndex, key, value);
    } else if (shortcut === "c" && event.currentTarget instanceof HTMLInputElement && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
      event.preventDefault();
      void navigator.clipboard?.writeText(value);
    }
  };

  const renderIntervalTable = (tableColumns: readonly Column[]) => <div className="border border-foreground overflow-auto max-h-[680px]" onMouseUp={() => setFillDrag(null)} onMouseLeave={() => setFillDrag(null)}>
    <table className="text-xs font-mono min-w-[1200px] w-full"><thead className="bg-secondary sticky top-0 z-20 shadow-[0_2px_0_rgba(15,23,42,0.2)]"><tr>{tableColumns.map(([key, label]) => <th key={label} className={`text-left px-2 py-2 border-b border-foreground whitespace-nowrap bg-secondary ${key === "holeId" ? "sticky left-0 z-30 shadow-[2px_0_0_rgba(15,23,42,0.2)]" : ""}`}>{label}</th>)}<th className="px-2 border-b border-foreground bg-secondary" /></tr></thead>
      <tbody>{displayedRows.map(({ row, index }) => { const rmrQuality = getRmrQuality(valueFor(row, "rmr")); return <tr key={index} className={`border-b border-border align-top ${rmrQuality?.rowClass ?? ""}`}>{tableColumns.map(([key]) => { const fieldError = key === "holeDip" ? validateAngleText(row.holeDip ?? "", `Interval ${index + 1} Hole Dip`, 0, 90) : key === "holeAzimuth" ? validateAngleText(row.holeAzimuth ?? "", `Interval ${index + 1} Hole Azimuth`, 0, 360) : key === "alphaDip" ? validateAngleText(row.alphaDip ?? "", `Interval ${index + 1} Alpha / Dip`, 0, 180) : key === "betaDipDir" ? validateAngleText(row.betaDipDir ?? "", `Interval ${index + 1} Beta / Dip Dir.`, 0, 360) : null; const calculated = ["dip", "dipDirection", "jointSpacing", "jrc", "roughnessState", "rmr"].includes(key); const fieldValue = valueFor(row, key); const handlePaste = (event: ClipboardEvent) => { event.preventDefault(); pasteGrid(index, key, tableColumns, event.clipboardData.getData("text/plain")); }; const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => handleCellKeyDown(event, index, key, fieldValue); const handleCellEnter = () => { if (fillDrag?.key === key && index >= fillDrag.startRow) updateRow(index, key, fillDrag.value); }; return <td key={key} className={`p-1 relative group ${fillDrag?.key === key ? "bg-primary/10" : ""} ${key === "holeId" ? "sticky left-0 z-10 bg-background shadow-[2px_0_0_rgba(15,23,42,0.12)]" : ""}`} onMouseEnter={handleCellEnter}>{key === "microRoughness" ? <select className="rounded-none border border-border min-w-44 h-8 text-xs bg-background px-2" value={fieldValue} onChange={event => updateRow(index, key, event.target.value)} onPaste={handlePaste} onKeyDown={handleKeyDown} aria-label={`Interval ${index + 1} roughness`}><option value="">Select roughness</option>{roughnessOptions.map(option => <option key={option} value={option}>{roughnessCodes[option]} — {option}</option>)}</select> : <Input className={`rounded-none border border-border min-w-24 h-8 text-xs ${calculated ? "bg-muted" : ""} ${key === "rmr" && rmrQuality ? rmrQuality.cellClass : ""} ${fieldError ? "border-destructive ring-1 ring-destructive" : ""}`} value={fieldValue} readOnly={calculated} onChange={event => updateRow(index, key, event.target.value)} onPaste={handlePaste} onKeyDown={handleKeyDown} aria-invalid={Boolean(fieldError)} />}{!calculated && <button type="button" className="absolute right-0 bottom-0 hidden group-hover:block bg-primary text-primary-foreground text-[9px] leading-none px-1 py-0.5 cursor-crosshair" onMouseDown={event => { event.preventDefault(); rowsHistory.current.push(rows.map(currentRow => ({ ...currentRow }))); setFillDrag({ key, value: fieldValue, startRow: index }); }} title="Drag down in this column and release to stop" aria-label={`Drag ${key} down to fill`}>↓</button>}</td>; })}<td className="p-2"><button type="button" className="text-destructive" onClick={() => commitRows(current => current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : [emptyRow()])}><Trash2 className="h-4 w-4" /></button></td></tr>; })}</tbody>
    </table>
  </div>;

  return (
    <div onKeyDown={handleUndoShortcut}>
      <ModuleHeader index="06.02" title="Logging Data" description="Log rock mass, soil and discontinuity data by depth interval using the supplied HOLEID workbook structure." />
      <div className="flex flex-wrap gap-2 mb-6">
        <input ref={rockMassFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void importSectionWorkbook(file, "rock"); event.currentTarget.value = ""; }} />
        <input ref={discontinuityFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void importSectionWorkbook(file, "discontinuity"); event.currentTarget.value = ""; }} />
        <Button variant="outline" className="rounded-none border-foreground" onClick={() => rockMassFileRef.current?.click()}><Upload className="h-4 w-4 mr-2" /> Import Rock mass Excel</Button>
        <Button variant="outline" className="rounded-none border-foreground" onClick={() => discontinuityFileRef.current?.click()}><Upload className="h-4 w-4 mr-2" /> Import Discontinuity Excel</Button>
        <Button variant="outline" className="rounded-none border-foreground" onClick={exportWorkbook}><Download className="h-4 w-4 mr-2" /> Export Excel</Button>
        <Button className="rounded-none" disabled={save.isPending} onClick={saveWorkbook}>{save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save logging data</Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-2"><SectionLabel>Rock mass classification</SectionLabel><div className="flex flex-wrap gap-2"><Button variant={showRmrAlertsOnly ? "default" : "outline"} className="rounded-none border-foreground" onClick={() => setShowRmrAlertsOnly(current => !current)}>{showRmrAlertsOnly ? "Show all intervals" : "RMR alerts only"}{alertRowCount > 0 ? ` (${alertRowCount})` : ""}</Button><Button variant="outline" className="rounded-none border-foreground" onClick={copyOrientationToAll}>Copy hole orientation to all rows</Button><Button variant="outline" className="rounded-none border-foreground" onClick={() => commitRows(current => [...current, emptyRow()])}><Plus className="h-4 w-4 mr-1" /> Add interval</Button></div></div>
      <p className="text-[10px] text-muted-foreground font-mono mb-2">Excel-style editing: Ctrl+C copies a cell, Ctrl+V replaces the active cell or pastes a table range, Ctrl+D fills down, and Ctrl+Z undoes the last table operation. Drag the ↓ handle in one column only, then release where you want the fill to stop.</p>
      {renderIntervalTable(rockMassColumns)}
      <div className="mt-6 mb-2"><SectionLabel>Discontinuity data</SectionLabel></div>
      {renderIntervalTable(discontinuityColumns)}
      <div className="flex flex-wrap items-center gap-2 mt-3 text-[10px] font-mono uppercase tracking-wider" aria-label="RMR quality legend"><span className="font-semibold mr-1">RMR quality alert:</span><span className="px-2 py-1 bg-emerald-100 text-emerald-950 border border-emerald-500">81–100 Very good</span><span className="px-2 py-1 bg-green-100 text-green-950 border border-green-500">61–80 Good</span><span className="px-2 py-1 bg-amber-100 text-amber-950 border border-amber-500">41–60 Fair</span><span className="px-2 py-1 bg-orange-200 text-orange-950 border border-orange-600">21–40 Poor</span><span className="px-2 py-1 bg-red-200 text-red-950 border border-red-700 font-bold">0–20 Very poor</span></div>
      {validationErrors.length > 0 && <div className="mt-3 border border-destructive bg-destructive/5 p-3 text-xs text-destructive font-mono"><strong>Orientation validation:</strong> {validationErrors.slice(0, 3).join(" ")}{validationErrors.length > 3 ? ` (+${validationErrors.length - 3} more)` : ""}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2"><Label className="swiss-label text-[10px]">Comments / sample selection information</Label><Textarea className="rounded-none border-foreground mt-1 min-h-24" value={comments} onChange={event => setComments(event.target.value)} /></div>
        <div><SectionLabel>Saved logging files</SectionLabel><div className="border border-foreground mt-2 divide-y divide-border max-h-40 overflow-y-auto">{(logs.data ?? []).map(log => <div key={log.id} className={`p-2 flex items-center justify-between text-xs ${selectedLogId === log.id ? "bg-primary/10" : ""}`}><button type="button" className="text-left font-mono" onClick={() => loadLog(log)}>{log.holeId}<span className="block text-muted-foreground">{Array.isArray(log.rows) ? log.rows.length : 0} intervals</span></button><button type="button" className="text-destructive" onClick={() => remove.mutate({ id: log.id })}><Trash2 className="h-3.5 w-3.5" /></button></div>)}{!(logs.data ?? []).length && <p className="p-3 text-xs text-muted-foreground">No saved logging files yet.</p>}</div></div>
      </div>
    </div>
  );
}
