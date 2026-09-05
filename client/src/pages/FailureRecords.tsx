import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { parseFailureWorkbook } from "@/lib/failureWorkbook";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const initialForm = {
  incidentDate: new Date().toISOString().slice(0, 10), pit: "", phase: "", wall: "", bench: "",
  lithology: "", failureType: "", actionTaken: "", comments: "", pictureReference: "",
};

function downloadTemplate() {
  const headers = [["Date", "Pit", "Phase", "Wall", "Bench", "Lithologie", "Failure Type", "Action", "Other Comment", "Picture"]];
  const worksheet = XLSX.utils.aoa_to_sheet(headers);
  worksheet["!cols"] = [14, 18, 14, 14, 12, 18, 20, 34, 34, 24].map(wch => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, String(new Date().getFullYear()));
  XLSX.writeFile(workbook, "OPGeotech_Failure_Records_Template.xlsx");
}

export default function FailureRecords() {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [wall, setWall] = useState("all");
  const [failureType, setFailureType] = useState("all");
  const { data: rows = [], isLoading } = trpc.reporting.failures.list.useQuery();

  const create = trpc.reporting.failures.create.useMutation({
    onSuccess: () => { utils.reporting.failures.list.invalidate(); setDialogOpen(false); setForm(initialForm); toast.success("Failure record added"); },
    onError: error => toast.error(error.message),
  });
  const importWorkbook = trpc.reporting.failures.importWorkbook.useMutation({
    onSuccess: result => { utils.reporting.failures.list.invalidate(); toast.success(`${result.imported} failure records imported`); },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.reporting.failures.delete.useMutation({
    onSuccess: () => utils.reporting.failures.list.invalidate(),
    onError: error => toast.error(error.message),
  });

  const options = useMemo(() => ({
    years: Array.from(new Set(rows.map(row => new Date(row.incidentDate).getUTCFullYear()))).sort((a, b) => b - a),
    walls: Array.from(new Set(rows.map(row => row.wall).filter(Boolean) as string[])).sort(),
    types: Array.from(new Set(rows.map(row => row.failureType).filter(Boolean) as string[])).sort(),
  }), [rows]);

  const filtered = useMemo(() => rows.filter(row => {
    const haystack = [row.pit, row.phase, row.wall, row.bench, row.lithology, row.failureType, row.actionTaken, row.comments].filter(Boolean).join(" ").toLowerCase();
    return (!search || haystack.includes(search.toLowerCase()))
      && (year === "all" || String(new Date(row.incidentDate).getUTCFullYear()) === year)
      && (wall === "all" || row.wall === wall)
      && (failureType === "all" || row.failureType === failureType);
  }), [rows, search, year, wall, failureType]);

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseFailureWorkbook(await file.arrayBuffer());
      if (!parsed.rows.length) throw new Error("No valid failure records were found in this workbook.");
      importWorkbook.mutate({ sourceFile: file.name, replaceExisting, rows: parsed.rows });
      if (parsed.warnings.length) toast.warning(`${parsed.warnings.length} workbook rows were skipped`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read the workbook");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addRecord = () => {
    if (!form.pit.trim()) return toast.error("Pit is required");
    create.mutate({
      incidentDate: Date.parse(`${form.incidentDate}T00:00:00Z`), pit: form.pit.trim(),
      phase: form.phase.trim() || undefined, wall: form.wall.trim() || undefined, bench: form.bench.trim() || undefined,
      lithology: form.lithology.trim() || undefined, failureType: form.failureType.trim() || undefined,
      actionTaken: form.actionTaken.trim() || undefined, comments: form.comments.trim() || undefined,
      pictureReference: form.pictureReference.trim() || undefined,
    });
  };

  const field = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(current => ({ ...current, [key]: event.target.value }));

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-foreground pb-5">
      <div><div className="swiss-label text-primary mb-2">Failure incident register</div><h2 className="text-2xl font-extrabold uppercase">Failure Records</h2><p className="text-sm text-muted-foreground mt-2 max-w-3xl">Import the yearly Excel workbook or record individual fall-of-ground incidents. The source wording is preserved for auditability.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={downloadTemplate}><FileSpreadsheet className="h-4 w-4" /> Download template</Button>
        <input ref={fileRef} className="hidden" type="file" accept=".xlsx,.xls" onChange={event => importFile(event.target.files?.[0])} />
        <Button variant="outline" disabled={importWorkbook.isPending} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> {importWorkbook.isPending ? "Importing…" : "Import Excel"}</Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Add failure</Button></DialogTrigger><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Add Failure Record</DialogTitle></DialogHeader><div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto p-1">
          {(["incidentDate", "pit", "phase", "wall", "bench", "lithology", "failureType", "pictureReference"] as const).map(key => <div key={key}><Label className="swiss-label mb-1.5 block">{key === "incidentDate" ? "Date" : key.replace(/([A-Z])/g, " $1")}{key === "pit" ? " *" : ""}</Label><Input type={key === "incidentDate" ? "date" : "text"} value={form[key]} onChange={field(key)} /></div>)}
          <div className="md:col-span-3"><Label className="swiss-label mb-1.5 block">Action</Label><Textarea rows={3} value={form.actionTaken} onChange={field("actionTaken")} /></div>
          <div className="md:col-span-3"><Label className="swiss-label mb-1.5 block">Other comment</Label><Textarea rows={3} value={form.comments} onChange={field("comments")} /></div>
        </div><Button className="w-full" disabled={create.isPending} onClick={addRecord}>{create.isPending ? "Saving…" : "Save failure record"}</Button></DialogContent></Dialog>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-4 border border-foreground p-4">
      <div className="min-w-64 flex-1"><Label className="swiss-label mb-1.5 block">Search</Label><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Pit, phase, wall, lithology, action…" /></div>
      <div className="w-36"><Label className="swiss-label mb-1.5 block">Year</Label><Select value={year} onValueChange={setYear}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All years</SelectItem>{options.years.map(item => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}</SelectContent></Select></div>
      <div className="w-44"><Label className="swiss-label mb-1.5 block">Wall</Label><Select value={wall} onValueChange={setWall}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All walls</SelectItem>{options.walls.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
      <div className="w-48"><Label className="swiss-label mb-1.5 block">Failure type</Label><Select value={failureType} onValueChange={setFailureType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{options.types.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
      <label className="flex items-center gap-2 text-sm pt-5"><Checkbox checked={replaceExisting} onCheckedChange={checked => setReplaceExisting(checked === true)} /> Replace existing records on import</label>
    </div>

    <div className="border border-foreground overflow-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Pit</TableHead><TableHead>Phase</TableHead><TableHead>Wall</TableHead><TableHead>Bench</TableHead><TableHead>Lithology</TableHead><TableHead>Failure type</TableHead><TableHead>Action / comment</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>
      {isLoading ? <TableRow><TableCell colSpan={9} className="py-12 text-center">Loading records…</TableCell></TableRow> : filtered.length ? filtered.map(row => <TableRow key={row.id}><TableCell className="whitespace-nowrap">{new Date(row.incidentDate).toLocaleDateString()}</TableCell><TableCell className="font-semibold">{row.pit}</TableCell><TableCell>{row.phase || "—"}</TableCell><TableCell>{row.wall || "—"}</TableCell><TableCell>{row.bench || "—"}</TableCell><TableCell>{row.lithology || "—"}</TableCell><TableCell>{row.failureType || "—"}</TableCell><TableCell className="min-w-72"><div>{row.actionTaken || "—"}</div>{row.comments && <div className="text-muted-foreground text-xs mt-1">{row.comments}</div>}</TableCell><TableCell><Button variant="ghost" size="icon" onClick={() => remove.mutate({ id: row.id })}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">No failure records match the current filters.</TableCell></TableRow>}
    </TableBody></Table></div>
    <div className="text-sm text-muted-foreground">Showing {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} records.</div>
  </div>;
}
