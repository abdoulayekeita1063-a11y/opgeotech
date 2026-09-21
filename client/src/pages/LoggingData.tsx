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

const metadataFields = [
  ["projectName", "Project name"], ["projectNo", "Project No"], ["deposit", "Deposit"], ["holeNo", "Hole No"],
  ["easting", "Easting"], ["northing", "Northing"], ["rl", "R.L."], ["dip", "Dip"], ["azimuth", "Azimuth"],
  ["preCollarDepth", "Pre collar depth"], ["pqDepth", "PQ depth"], ["hqDepth", "HQ depth"], ["loggedBy", "Logged by"],
  ["dateLogged", "Date logged"], ["drillStartDate", "Drill start date"], ["completionDate", "Completion date"],
  ["drillingCompany", "Drilling company"], ["oriMethod", "ORI method"], ["rigNo", "Rig No."], ["oriLinePosition", "ORI line position"],
] as const;

const columns = [
  ["from", "From"], ["to", "To"], ["stratigraphy", "Stratigraphy"], ["lithologyMax", "Max Lithology"], ["lithologyMin", "Min Lithology"],
  ["colour", "Colour"], ["recovery", "Recovery (m)"], ["rqd", "RQD (>100 mm)"], ["weathering", "Weathering"], ["strength", "Strength"],
  ["fractureCount", "Fracture Count"], ["structuralSets", "Structural Sets"], ["spacing", "Bedding/Foliation Spacing"], ["development", "Bedding/Foliation Development"],
  ["uscs", "USCS"], ["soilStrength", "Soil Strength"], ["structureDepth", "Structure Depth"], ["structureType", "Structure Type"],
  ["alphaDip", "Alpha / Dip"], ["betaDipDir", "Beta / Dip Dir."], ["oriReliability", "ORI Reliability"], ["infillThickness", "Infill Thickness"],
  ["microRoughness", "Micro Roughness"], ["surfaceWeathering", "Surface Weathering"], ["jointAltInfill", "Joint Alt./Infill"],
  ["discontinuityCount", "Discontinuity Count"], ["intervalPoint", "Interval (1) / Point (2)"],
] as const;

// Source workbook positions, including the blank separator columns used by HOLEID.
const workbookColumnIndexes = [1, 2, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31] as const;

const emptyMetadata = (): Metadata => Object.fromEntries(metadataFields.map(([key]) => [key, ""]));
const emptyRow = (): Row => Object.fromEntries(columns.map(([key]) => [key, ""]));
const stringify = (value: unknown) => value == null ? "" : String(value);
const csvSafeFileName = (value: string) => (value || "HOLEID").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toUpperCase();

function findValue(row: unknown[], label: string) {
  const wanted = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  const index = row.findIndex(value => stringify(value).toLowerCase().replace(/[^a-z0-9]/g, "").includes(wanted));
  if (index < 0) return "";
  return stringify(row.slice(index + 1).find(value => stringify(value).trim()));
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
        columns.forEach(([key], index) => { row[key] = stringify(source[workbookColumnIndexes[index]] ?? ""); });
        return row;
      }).filter(row => Object.values(row).some(value => value.trim()));
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
    const holeId = metadata.holeNo.trim();
    if (!holeId) return toast.error("Hole No is required before saving logging data");
    const validRows = rows.filter(row => Object.values(row).some(value => value.trim()));
    if (!validRows.length) return toast.error("Add at least one logging interval");
    save.mutate({ holeId, metadata, rows: validRows, comments: comments || undefined });
  };

  const exportWorkbook = () => {
    const headerGroups = Array<string>(32).fill("");
    headerGroups[0] = "Hole ID";
    headerGroups[1] = "Depth";
    headerGroups[4] = "Rock Type";
    headerGroups[9] = "Rock Mass Data";
    headerGroups[18] = "Soil Data";
    headerGroups[21] = "Discontinuity Data";
    const headerLabels = Array<string>(32).fill("");
    columns.forEach(([key, label], index) => { headerLabels[workbookColumnIndexes[index]] = label; });
    const topRows = [
      ["", "", "", "", "PROJECT NAME:", "", metadata.projectName, "", "", "EASTING:", "", metadata.easting, "", "PRE COLLAR DEPTH:", metadata.preCollarDepth, "", "", "", "", "LOGGED BY:", metadata.loggedBy, "", "", "", "", "DRILL START DATE:", metadata.drillStartDate],
      ["", "", "", "", "PROJECT No:", "", metadata.projectNo, "", "", "NORTHING:", "", metadata.northing, "", "PQ DEPTH:", metadata.pqDepth, "", "", "", "", "DATE LOGGED:", metadata.dateLogged, "", "", "", "", "COMPLETION DATE:", metadata.completionDate],
      ["", "", "", "", "DEPOSIT:", "", metadata.deposit, "", "", "R.L.:", "", metadata.rl, "", "HQ DEPTH:", metadata.hqDepth, "", "", "", "", "DRILLING COMPANY:", metadata.drillingCompany, "", "", "", "", "ORI METHOD:", metadata.oriMethod],
      ["", "", "", "", "HOLE No:", "", metadata.holeNo, "", "", "DIP:", "", metadata.dip, "", "AZIMUTH:", metadata.azimuth, "", "", "", "", "RIG No.:", metadata.rigNo, "", "", "", "", "ORI LINE POSITION:", metadata.oriLinePosition],
      [], headerGroups, headerLabels,
      ...rows.filter(row => Object.values(row).some(value => value.trim())).map(row => {
        const output = Array<string>(32).fill("");
        output[0] = metadata.holeNo;
        columns.forEach(([key], index) => { output[workbookColumnIndexes[index]] = row[key]; });
        return output;
      }),
      [], ["Comments", comments],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(topRows);
    sheet["!cols"] = [{ wch: 16 }, ...columns.map(() => ({ wch: 18 }))];
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
        <table className="text-xs font-mono min-w-[2200px] w-full">
          <thead className="bg-secondary"><tr>{columns.map(([, label]) => <th key={label} className="text-left px-2 py-2 border-b border-foreground whitespace-nowrap">{label}</th>)}<th className="px-2 border-b border-foreground" /></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index} className="border-b border-border align-top">{columns.map(([key]) => <td key={key} className="p-1"><Input className="rounded-none border-border min-w-24 h-8 text-xs" value={row[key] ?? ""} onChange={event => updateRow(index, key, event.target.value)} /></td>)}<td className="p-2"><button type="button" className="text-destructive" onClick={() => setRows(current => current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : [emptyRow()])}><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2"><Label className="swiss-label text-[10px]">Comments / sample selection information</Label><Textarea className="rounded-none border-foreground mt-1 min-h-24" value={comments} onChange={event => setComments(event.target.value)} /></div>
        <div><SectionLabel>Saved logging files</SectionLabel><div className="border border-foreground mt-2 divide-y divide-border max-h-40 overflow-y-auto">{(logs.data ?? []).map(log => <div key={log.id} className={`p-2 flex items-center justify-between text-xs ${selectedLogId === log.id ? "bg-primary/10" : ""}`}><button type="button" className="text-left font-mono" onClick={() => loadLog(log)}>{log.holeId}<span className="block text-muted-foreground">{Array.isArray(log.rows) ? log.rows.length : 0} intervals</span></button><button type="button" className="text-destructive" onClick={() => remove.mutate({ id: log.id })}><Trash2 className="h-3.5 w-3.5" /></button></div>)}{!(logs.data ?? []).length && <p className="p-3 text-xs text-muted-foreground">No saved logging files yet.</p>}</div></div>
      </div>
    </div>
  );
}
