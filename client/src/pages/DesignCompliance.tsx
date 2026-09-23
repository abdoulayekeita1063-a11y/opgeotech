import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

type Mode = "presplit" | "no-presplit";
type Result = { mode: Mode; designAchievement: number; faceCondition: number; classification: string; colour: string; action: string; compliancePct: number; interpretation: string; items: Array<{ parameter: string; rating: number; maximum: number; comment: string }> };
type WallPhoto = { name: string; dataUrl: string };
type Field = { key: string; label: string; max: number; options: Array<[string, number]>; group: "Design Achievement (Df)" | "Face Condition (Fc)" };

const fields: Field[] = [
  { key: "benchFaceAngleRating", label: "Bench Face Angle (50%)", max: 50, options: [["≥ Design",50],["Design −3°",25],["Design −5°",10],["Design −10°",0]], group: "Design Achievement (Df)" },
  { key: "benchWidthRating", label: "Bench Width (40%)", max: 40, options: [["≥ Design",40],["Design −1 m",35],["Design −2 m",25],["Design −3 m",15],["Design −5 m",0]], group: "Design Achievement (Df)" },
  { key: "toePositionRating", label: "Toe Position (10%)", max: 10, options: [["On design",10],["Design −1 m",8],["Design −2 m",5],["Design −3 m",0]], group: "Design Achievement (Df)" },
  { key: "halfBarrelsRating", label: "Half Barrels Visible (20%)", max: 20, options: [["≥80%",20],["70–80%",15],["60–70%",12],["50–60%",8],["30–50%",5],["10–30%",2],["<10%",0]], group: "Face Condition (Fc)" },
  { key: "intactRockBreakageRating", label: "Intact Rock Breakage (15%)", max: 15, options: [["<1 /m³",15],[">5 /m³",0]], group: "Face Condition (Fc)" },
  { key: "openJointsRating", label: "Open Joints (10%)", max: 10, options: [["All closed",10],["Many moved",0]], group: "Face Condition (Fc)" },
  { key: "looseMaterialRating", label: "Loose Material on Face (20%)", max: 20, options: [["No blocks",20],["Few small blocks",15],["Large blocks",10],["Many blocks",0]], group: "Face Condition (Fc)" },
  { key: "faceProfileRating", label: "Face Profile (20%)", max: 20, options: [["Straight",20],["Hard toe",10],["Overhanging crest",5],["Irregular face",0]], group: "Face Condition (Fc)" },
  { key: "crestConditionRating", label: "Crest Condition (15%)", max: 15, options: [["Achieved",15],["<1 m loss",12],["1 m–2 m loss",10],["2 m–3 m loss",5],[">3 m loss",0]], group: "Face Condition (Fc)" },
];

const colourStyle: Record<string, string> = { Green: "bg-green-600 text-white", Yellow: "bg-yellow-300 text-black", Orange: "bg-orange-500 text-white", Red: "bg-red-600 text-white" };

async function exportWallAssessmentPdf(title: string, zone: string, result: Result, photos: WallPhoto[]) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  let y = 18;
  const ensureSpace = (height: number) => { if (y + height > pageHeight - 16) { pdf.addPage(); y = 18; } };
  const heading = (text: string) => { ensureSpace(12); pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.text(text, margin, y); y += 7; pdf.setDrawColor(30); pdf.line(margin, y, pageWidth - margin, y); y += 5; };
  const paragraph = (text: string, size = 10) => { pdf.setFont("helvetica", "normal"); pdf.setFontSize(size); const lines = pdf.splitTextToSize(text, pageWidth - margin * 2); ensureSpace(lines.length * 5 + 3); pdf.text(lines, margin, y); y += lines.length * 5 + 3; };
  const tableRow = (cells: string[], widths: number[], header = false) => { const rowHeight = 8; ensureSpace(rowHeight); let x = margin; pdf.setFont("helvetica", header ? "bold" : "normal"); pdf.setFontSize(header ? 8 : 8.5); cells.forEach((cell, index) => { pdf.rect(x, y - 5, widths[index], rowHeight); pdf.text(pdf.splitTextToSize(cell, widths[index] - 3), x + 1.5, y); x += widths[index]; }); y += rowHeight; };
  pdf.setFillColor(211, 47, 47); pdf.rect(margin, y - 5, 4, 4, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.text("OPGeotech — Wall Assessment", margin + 7, y); y += 10;
  pdf.setFontSize(10); pdf.setFont("helvetica", "normal"); paragraph(`Assessment: ${title || "Untitled assessment"}\nZone / sector: ${zone || "Not specified"}\nWall-control scenario: ${result.mode === "presplit" ? "With Presplit" : "Without Presplit"}`);
  heading("Assessment classification");
  tableRow(["Classification", "Colour", "Overall index"], [85, 35, 55], true); tableRow([result.classification, result.colour, `${result.compliancePct}%`], [85, 35, 55]);
  tableRow(["Design Achievement (Df)", "Face Condition (Fc)"], [87.5, 87.5], true); tableRow([`${result.designAchievement.toFixed(2)} (${(result.designAchievement * 100).toFixed(1)}%)`, `${result.faceCondition.toFixed(2)} (${(result.faceCondition * 100).toFixed(1)}%)`], [87.5, 87.5]);
  heading("Component ratings");
  tableRow(["Component", "Rating", "Comments"], [58, 25, 92], true); result.items.forEach(item => tableRow([item.parameter, `${item.rating} / ${item.maximum}`, item.comment], [58, 25, 92]));
  heading("Recommended action"); paragraph(result.action);
  heading("Interpretation"); paragraph(result.interpretation);
  if (photos.length) {
    heading("Slope photographs");
    for (const photo of photos) {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = photo.dataUrl; });
      const maxWidth = 82; const maxHeight = 62; const scale = Math.min(maxWidth / image.width, maxHeight / image.height); const width = image.width * scale; const height = image.height * scale; const format = photo.dataUrl.startsWith("data:image/png") ? "PNG" : photo.dataUrl.startsWith("data:image/webp") ? "WEBP" : "JPEG"; ensureSpace(height + 12); pdf.addImage(photo.dataUrl, format, margin, y, width, height, undefined, "FAST"); pdf.setFontSize(8); pdf.text(photo.name, margin, y + height + 4); y += height + 10;
    }
  }
  pdf.save(`${(title || "wall-assessment").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "wall-assessment"}.pdf`);
}

export default function DesignCompliance() {
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [mode, setMode] = useState<Mode>("presplit");
  const [ratings, setRatings] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(field => [field.key, String(field.options[0][1])] )));
  const [photos, setPhotos] = useState<WallPhoto[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const compute = trpc.compliance.compute.useMutation({ onSuccess: data => { setResult(data as Result); toast.success("Wall assessment completed"); }, onError: error => toast.error(error.message) });
  const submit = () => {
    if (!title.trim()) return toast.error("Please provide an assessment title");
    compute.mutate({ title: title.trim(), zone: zone.trim() || undefined, mode, ...Object.fromEntries(fields.map(field => [field.key, Number(ratings[field.key])])) } as never);
  };
  const update = (field: Field, value: string) => setRatings(current => ({ ...current, [field.key]: value }));
  const addPhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(file => file.type.startsWith("image/"));
    if (files.length === 0) return;
    Promise.all(files.map(file => new Promise<WallPhoto>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) }); reader.onerror = reject; reader.readAsDataURL(file); }))).then(next => setPhotos(current => [...current, ...next].slice(0, 8))).catch(() => toast.error("Could not read one or more photos"));
    event.currentTarget.value = "";
  };
  const group = (name: Field["group"]) => fields.filter(field => field.group === name);
  return <div className="max-w-6xl mx-auto px-4 py-8">
    <ModuleHeader index="05" title="Design Compliance" description="Wall assessment based on design achievement and face condition. Assess the wall with presplit or without presplit and classify the resulting wall quality." />
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-12 lg:col-span-7 space-y-5">
        <SectionLabel>Wall Assessment</SectionLabel>
        <div className="grid grid-cols-2 gap-4"><div><Label className="swiss-label mb-1.5 block">Assessment title *</Label><Input value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. East Wall — Bench 1240" /></div><div><Label className="swiss-label mb-1.5 block">Zone / sector</Label><Input value={zone} onChange={event => setZone(event.target.value)} placeholder="e.g. Phase 2 East" /></div></div>
        <div className="grid grid-cols-2 gap-3"><Button type="button" className={`rounded-none ${mode === "presplit" ? "bg-foreground text-background" : ""}`} variant={mode === "presplit" ? "default" : "outline"} onClick={() => setMode("presplit")}>With Presplit</Button><Button type="button" className={`rounded-none ${mode === "no-presplit" ? "bg-foreground text-background" : ""}`} variant={mode === "no-presplit" ? "default" : "outline"} onClick={() => setMode("no-presplit")}>Without Presplit</Button></div>
        <div className="border border-foreground"><div className="grid grid-cols-[1.3fr_1fr_0.35fr] bg-secondary border-b border-foreground px-3 py-2 swiss-label"><span>Component (weighting)</span><span>Assigned value</span><span>Rating</span></div>
          {(["Design Achievement (Df)", "Face Condition (Fc)"] as const).map(section => <div key={section}><div className="px-3 py-2 font-bold border-b border-foreground">{section}</div>{group(section).map(field => <div key={field.key} className="grid grid-cols-[1.3fr_1fr_0.35fr] items-center gap-2 border-b border-foreground px-3 py-2"><Label className="text-xs font-medium">{field.label}</Label><select className="h-9 border border-foreground bg-background px-2 text-sm" value={ratings[field.key]} onChange={event => update(field, event.target.value)}>{field.options.map(([label, value]) => <option key={label} value={value}>{label}</option>)}</select><span className="swiss-number text-right font-bold">{ratings[field.key]}/{field.max}</span></div>)}</div>)}
        </div>
        <Button className="w-full font-bold uppercase tracking-wider" disabled={compute.isPending} onClick={submit}>{compute.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Assessing…</> : "Assess wall quality"}</Button>
        <div className="border border-foreground p-4 space-y-3"><SectionLabel>Slope photographs</SectionLabel><p className="text-xs text-muted-foreground">Import up to 8 JPG, PNG or WebP photos. They will be included in the PDF report.</p><Input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} />{photos.length > 0 && <div className="grid grid-cols-2 gap-3">{photos.map((photo, index) => <div key={`${photo.name}-${index}`} className="border border-foreground p-2"><img src={photo.dataUrl} alt={photo.name} className="h-28 w-full object-cover" /><div className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs">{photo.name}</span><button type="button" className="text-xs font-bold underline" onClick={() => setPhotos(current => current.filter((_, photoIndex) => photoIndex !== index))}>Remove</button></div></div>)}</div>}</div>
      </div>
      <div className="col-span-12 lg:col-span-5 space-y-5"><SectionLabel>Assessment Result</SectionLabel>{!result && <div className="border border-dashed border-muted-foreground/40 p-10 text-center text-sm text-muted-foreground">Select the wall-control scenario and ratings, then assess the wall.</div>}{result && <div className="space-y-5"><div className={`px-4 py-5 font-bold uppercase tracking-wider ${colourStyle[result.colour] ?? "bg-foreground text-background"}`}><div className="text-2xl">{result.classification}</div><div className="mt-2 text-sm">{result.mode === "presplit" ? "With presplit" : "Without presplit"} · Overall index {result.compliancePct}%</div></div><div className="grid grid-cols-2 gap-px bg-foreground border border-foreground"><div className="bg-background p-4"><div className="swiss-label mb-1">Design Achievement Df</div><div className="swiss-number text-3xl font-bold">{result.designAchievement.toFixed(2)} <span className="text-lg">({(result.designAchievement * 100).toFixed(1)}%)</span></div></div><div className="bg-background p-4"><div className="swiss-label mb-1">Face Condition Fc</div><div className="swiss-number text-3xl font-bold">{result.faceCondition.toFixed(2)} <span className="text-lg">({(result.faceCondition * 100).toFixed(1)}%)</span></div></div></div><div className="border border-foreground"><div className="px-4 py-3 border-b border-foreground swiss-label">Recommended action</div><div className="p-4 text-sm leading-relaxed">{result.action}</div></div><div className="border-l-4 border-primary pl-4 text-sm leading-relaxed">{result.interpretation}</div><div className="border border-foreground overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-foreground bg-secondary"><th className="px-3 py-2 text-left swiss-label">Component</th><th className="px-3 py-2 text-right swiss-label">Rating</th></tr></thead><tbody>{result.items.map(item => <tr key={item.parameter} className="border-b border-foreground"><td className="px-3 py-2">{item.parameter}</td><td className="px-3 py-2 text-right swiss-number">{item.rating}/{item.maximum}</td></tr>)}</tbody></table></div><Button type="button" variant="outline" className="w-full rounded-none border-foreground font-bold" onClick={() => exportWallAssessmentPdf(title, zone, result, photos).catch(() => toast.error("Could not generate the PDF"))}><FileDown className="h-4 w-4 mr-2" /> Download PDF</Button></div>}</div>
    </div>
  </div>;
}
