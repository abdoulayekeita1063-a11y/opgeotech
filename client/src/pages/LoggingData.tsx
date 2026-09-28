import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Download, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { trpc } from "@/lib/trpc";

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
  ["from", "From"], ["to", "To"], ["stratigraphy", "Stratigraphy"], ["recovery", "Recovery (m)"], ["rqd", "RQD (>100 mm)"],
  ["weathering", "Weathering"], ["strength", "Strength"], ["fractureCount", "Fracture Count"], ["structuralSets", "Structural Sets"],
  ["structureDepth", "Structure Depth"], ["structureType", "Structure Type"],
  ["alphaDip", "Alpha / Dip"], ["betaDipDir", "Beta / Dip Dir."], ["oriReliability", "ORI Reliability"], ["infillThickness", "Infill Thickness"],
  ["microRoughness", "Micro Roughness"], ["surfaceWeathering", "Surface Weathering"], ["jointAltInfill", "Joint Alt./Infill"],
  ["discontinuityCount", "Discontinuity Count"],
] as const;

const derivedColumns = [
  ["dip", "Dip"], ["dipDirection", "Dip Direction"],
] as const;

const holeColumns = [
  ["holeId", "Hole ID"], ["holeDip", "Hole Dip"], ["holeAzimuth", "Hole Azimuth"],
] as const;
const columns = [...holeColumns, ...sourceColumns, ...derivedColumns] as readonly Column[];

// Source workbook positions, including the blank separator columns used by HOLEID.
const workbookColumnIndexes = [1, 2, 4, 9, 10, 11, 12, 13, 14, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] as const;
const exportColumnIndexes = [...workbookColumnIndexes, 31, 32] as const;

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

function valueFor(row: Row, key: string) {
  if (key === "holeId" || key === "holeDip" || key === "holeAzimuth") return row[key] ?? "";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [metadata, setMetadata] = useState<Metadata>(emptyMetadata);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [comments, setComments] = useState("");
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
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

  const updateMetadata = (key: string, value: string) => setMetadata(current => ({ ...current, [key]: value }));
  const updateRow = (index: number, key: string, value: string) => setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));

  const importWorkbook = async (file: File) => {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("The workbook has no readable worksheet");
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
      const nextMetadata = emptyMetadata();
      const metadataRows = matrix.slice(0, 4);
      const lookup: Record<string, string> = { projectName: "project name", projectNo: "project no", deposit: "deposit", holeNo: "hole no", easting: "easting", northing: "northing", rl: "r.l.", dip: "dip", azimuth: "azimuth", preCollarDepth: "pre collar depth", pqDepth: "pq depth", hqDepth: "hq depth", loggedBy: "logged by", dateLogged: "date logged", drillStartDate: "drill start date", completionDate: "completion date", drillingCompany: "drilling company", oriMethod: "ori method", rigNo: "rig no.", oriLinePosition: "ori line position" };
      for (const [key, label] of Object.entries(lookup)) nextMetadata[key] = metadataRows.map(row => findValue(row, label)).find(Boolean) ?? "";
      const labelRow = matrix.findIndex(row => row.some(value => stringify(value).toLowerCase().includes("stratigraphy")));
      if (labelRow < 0) throw new Error("Could not find the HOLEID logging header row");
      const start = labelRow + 1;
      const imported = matrix.slice(start).map(source => {
        const row = emptyRow();
        row.holeId = stringify(source[0] ?? "") || nextMetadata.holeNo;
        row.holeDip = nextMetadata.dip ?? "";
        row.holeAzimuth = nextMetadata.azimuth ?? "";
        sourceColumns.forEach(([key], index) => { row[key] = stringify(source[workbookColumnIndexes[index]] ?? ""); });
        return row;
      }).filter(row => Object.values(row).some(value => value.trim()));
      const importedErrors = orientationErrors(imported);
      if (importedErrors.length) throw new Error(`Validation failed: ${importedErrors[0]}`);
      setMetadata(nextMetadata);
      setRows(imported.length ? imported : [emptyRow()]);
      setComments("");
      setSelectedLogId(null);
      toast.success(`Imported ${imported.length} logging interval${imported.length === 1 ? "" : "s"}`);
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
    const headerGroups = Array<string>(33).fill("");
    headerGroups[0] = "Hole ID";
    headerGroups[1] = "Depth";
    headerGroups[4] = "Rock Type";
    headerGroups[9] = "Rock Mass Data";
    headerGroups[18] = "Soil Data";
    headerGroups[21] = "Discontinuity Data";
    const headerLabels = Array<string>(33).fill("");
    sourceColumns.forEach(([key, label], index) => { headerLabels[workbookColumnIndexes[index]] = label; });
    derivedColumns.forEach(([key, label], index) => { headerLabels[exportColumnIndexes[sourceColumns.length + index]] = label; });
    const topRows = [
      ["", "", "", "", "PROJECT NAME:", "", metadata.projectName, "", "", "EASTING:", "", metadata.easting, "", "PRE COLLAR DEPTH:", metadata.preCollarDepth, "", "", "", "", "LOGGED BY:", metadata.loggedBy, "", "", "", "", "DRILL START DATE:", metadata.drillStartDate],
      ["", "", "", "", "PROJECT No:", "", metadata.projectNo, "", "", "NORTHING:", "", metadata.northing, "", "PQ DEPTH:", metadata.pqDepth, "", "", "", "", "DATE LOGGED:", metadata.dateLogged, "", "", "", "", "COMPLETION DATE:", metadata.completionDate],
      ["", "", "", "", "DEPOSIT:", "", metadata.deposit, "", "", "R.L.:", "", metadata.rl, "", "HQ DEPTH:", metadata.hqDepth, "", "", "", "", "DRILLING COMPANY:", metadata.drillingCompany, "", "", "", "", "ORI METHOD:", metadata.oriMethod],
      ["", "", "", "", "HOLE No:", "", metadata.holeNo, "", "", "DIP:", "", metadata.dip, "", "AZIMUTH:", metadata.azimuth, "", "", "", "", "RIG No.:", metadata.rigNo, "", "", "", "", "ORI LINE POSITION:", metadata.oriLinePosition],
      [], headerGroups, headerLabels,
      ...rows.filter(row => Object.values(row).some(value => value.trim())).map(row => {
        const output = Array<string>(33).fill("");
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

  return (
    <div>
      <ModuleHeader index="06.02" title="Logging Data" description="Log rock mass, soil and discontinuity data by depth interval using the supplied HOLEID workbook structure." />
      <div className="flex flex-wrap gap-2 mb-6">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void importWorkbook(file); event.currentTarget.value = ""; }} />
        <Button variant="outline" className="rounded-none border-foreground" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" /> Import HOLEID Excel</Button>
        <Button variant="outline" className="rounded-none border-foreground" onClick={exportWorkbook}><Download className="h-4 w-4 mr-2" /> Export Excel</Button>
        <Button className="rounded-none" disabled={save.isPending} onClick={saveWorkbook}>{save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save logging data</Button>
      </div>

      <SectionLabel>Hole information</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-3 mb-8">
        {metadataFields.map(([key, label]) => <div key={key}><Label className="swiss-label text-[10px]">{label}</Label><Input className="rounded-none border-foreground mt-1" value={metadata[key] ?? ""} onChange={event => updateMetadata(key, event.target.value)} /></div>)}
      </div>

      <div className="flex items-center justify-between mb-2"><SectionLabel>Interval logging</SectionLabel><Button variant="outline" className="rounded-none border-foreground" onClick={() => setRows(current => [...current, emptyRow()])}><Plus className="h-4 w-4 mr-1" /> Add interval</Button></div>
      <div className="border border-foreground overflow-x-auto">
          <table className="text-xs font-mono min-w-[2500px] w-full">
          <thead className="bg-secondary"><tr>{columns.map(([, label]) => <th key={label} className="text-left px-2 py-2 border-b border-foreground whitespace-nowrap">{label}</th>)}<th className="px-2 border-b border-foreground" /></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index} className="border-b border-border align-top">{columns.map(([key]) => { const isHoleField = key === "holeId" || key === "holeDip" || key === "holeAzimuth"; const fieldError = key === "holeDip" ? validateAngleText(row.holeDip ?? "", `Interval ${index + 1} Hole Dip`, 0, 90) : key === "holeAzimuth" ? validateAngleText(row.holeAzimuth ?? "", `Interval ${index + 1} Hole Azimuth`, 0, 360) : key === "alphaDip" ? validateAngleText(row.alphaDip ?? "", `Interval ${index + 1} Alpha / Dip`, 0, 180) : key === "betaDipDir" ? validateAngleText(row.betaDipDir ?? "", `Interval ${index + 1} Beta / Dip Dir.`, 0, 360) : null; return <td key={key} className="p-1"><Input className={`rounded-none border-border min-w-24 h-8 text-xs ${key === "dip" || key === "dipDirection" ? "bg-muted" : ""} ${fieldError ? "border-destructive ring-1 ring-destructive" : ""}`} value={valueFor(row, key)} readOnly={key === "dip" || key === "dipDirection"} onChange={event => updateRow(index, key, event.target.value)} aria-invalid={Boolean(fieldError)} title={fieldError ?? (key === "dip" || key === "dipDirection" ? "Calculated from Alpha / Dip, Beta / Dip Direction, Hole Dip and Hole Azimuth" : undefined)} /></td>; })}<td className="p-2"><button type="button" className="text-destructive" onClick={() => setRows(current => current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : [emptyRow()])}><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2 font-mono">Dip and Dip Direction are calculated automatically from Alpha / Dip and Beta / Dip Direction using the Hole Dip and Hole Azimuth entered in the same interval row. Enter the row orientation to activate the conversion.</p>
      {validationErrors.length > 0 && <div className="mt-3 border border-destructive bg-destructive/5 p-3 text-xs text-destructive font-mono"><strong>Orientation validation:</strong> {validationErrors.slice(0, 3).join(" ")}{validationErrors.length > 3 ? ` (+${validationErrors.length - 3} more)` : ""}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2"><Label className="swiss-label text-[10px]">Comments / sample selection information</Label><Textarea className="rounded-none border-foreground mt-1 min-h-24" value={comments} onChange={event => setComments(event.target.value)} /></div>
        <div><SectionLabel>Saved logging files</SectionLabel><div className="border border-foreground mt-2 divide-y divide-border max-h-40 overflow-y-auto">{(logs.data ?? []).map(log => <div key={log.id} className={`p-2 flex items-center justify-between text-xs ${selectedLogId === log.id ? "bg-primary/10" : ""}`}><button type="button" className="text-left font-mono" onClick={() => loadLog(log)}>{log.holeId}<span className="block text-muted-foreground">{Array.isArray(log.rows) ? log.rows.length : 0} intervals</span></button><button type="button" className="text-destructive" onClick={() => remove.mutate({ id: log.id })}><Trash2 className="h-3.5 w-3.5" /></button></div>)}{!(logs.data ?? []).length && <p className="p-3 text-xs text-muted-foreground">No saved logging files yet.</p>}</div></div>
      </div>
    </div>
  );
}
