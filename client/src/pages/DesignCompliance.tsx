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

async function exportWallAssessmentPdf(title: string, zone: string, result: Result, photos: WallPhoto[], requestedFilename: string) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;
  const riskColours: Record<string, [number, number, number]> = { Green: [35, 132, 85], Yellow: [224, 166, 35], Orange: [225, 105, 35], Red: [194, 45, 45] };
  const riskColour = riskColours[result.colour] ?? [40, 40, 40];
  const ensureSpace = (height: number) => { if (y + height > pageHeight - 17) { pdf.addPage(); y = 18; drawPageChrome(); } };
  const drawPageChrome = () => { pdf.setDrawColor(225, 225, 225); pdf.setLineWidth(0.25); pdf.line(margin, 10, pageWidth - margin, 10); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(120, 120, 120); pdf.text("OPGEOTECH  /  GEOTECHNICAL ENGINEERING PLATFORM", margin, 7); pdf.text("WALL ASSESSMENT", pageWidth - margin, 7, { align: "right" }); pdf.setTextColor(25, 25, 25); };
  const heading = (text: string) => { ensureSpace(14); pdf.setFillColor(211, 47, 47); pdf.rect(margin, y - 4, 3, 8, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(25, 25, 25); pdf.text(text.toUpperCase(), margin + 7, y + 2); y += 10; };
  const paragraph = (text: string, size = 9.5) => { pdf.setFont("helvetica", "normal"); pdf.setFontSize(size); const lines = pdf.splitTextToSize(text, contentWidth); ensureSpace(lines.length * 4.5 + 4); pdf.text(lines, margin, y); y += lines.length * 4.5 + 4; };
  const tableRow = (cells: string[], widths: number[], header = false) => { pdf.setFont("helvetica", header ? "bold" : "normal"); pdf.setFontSize(header ? 7.5 : 8); const lineSets = cells.map((cell, index) => pdf.splitTextToSize(cell, widths[index] - 5)); const rowHeight = Math.max(header ? 8 : 9, Math.max(...lineSets.map(lines => lines.length)) * 4 + 5); ensureSpace(rowHeight); let x = margin; if (header) { pdf.setFillColor(245, 246, 247); pdf.rect(margin, y - 4, widths.reduce((sum, width) => sum + width, 0), rowHeight, "F"); } cells.forEach((_, index) => { pdf.setDrawColor(205, 208, 210); pdf.rect(x, y - 4, widths[index], rowHeight); pdf.text(lineSets[index], x + 2.5, y + 1); x += widths[index]; }); y += rowHeight; };
  drawPageChrome();
  pdf.setFillColor(25, 25, 25); pdf.rect(margin, y - 6, contentWidth, 25, "F"); pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(19); pdf.text("WALL ASSESSMENT", margin + 8, y + 3); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.text("Open-pit geotechnical design compliance report", margin + 8, y + 11); pdf.setFontSize(8); pdf.text(new Date().toLocaleDateString(), pageWidth - margin - 8, y + 3, { align: "right" }); pdf.setTextColor(25, 25, 25); y += 29;
  pdf.setFillColor(247, 248, 249); pdf.roundedRect(margin, y - 4, contentWidth, 25, 2, 2, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(115, 115, 115); pdf.text("ASSESSMENT", margin + 7, y + 3); pdf.text("ZONE / SECTOR", margin + contentWidth / 2, y + 3); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10.5); pdf.setTextColor(25, 25, 25); pdf.text(title || "Untitled assessment", margin + 7, y + 10); pdf.text(zone || "Not specified", margin + contentWidth / 2, y + 10); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.text(result.mode === "presplit" ? "With presplit wall control" : "Without presplit wall control", margin + 7, y + 17); y += 33;
  pdf.setFillColor(...riskColour); pdf.roundedRect(margin, y - 5, contentWidth, 24, 2, 2, "F"); pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.text("OVERALL WALL QUALITY", margin + 7, y + 2); pdf.setFontSize(16); pdf.text(result.classification.toUpperCase(), margin + 7, y + 12); pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text(`${result.compliancePct}% overall index`, pageWidth - margin - 7, y + 8, { align: "right" }); pdf.setTextColor(25, 25, 25); y += 31;
  heading("Executive summary");
  const cardGap = 4; const cardWidth = (contentWidth - cardGap * 2) / 3; const cards = [["Df", `${(result.designAchievement * 100).toFixed(1)}%`, "Design achievement"], ["Fc", `${(result.faceCondition * 100).toFixed(1)}%`, "Face condition"], ["STATUS", result.colour, "Assessment colour"]];
  cards.forEach((card, index) => { const x = margin + index * (cardWidth + cardGap); pdf.setFillColor(249, 249, 249); pdf.setDrawColor(220, 220, 220); pdf.roundedRect(x, y - 4, cardWidth, 25, 1.5, 1.5, "FD"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(index === 2 ? 12 : 17); const cardColour = index === 2 ? riskColour : [25, 25, 25]; pdf.setTextColor(cardColour[0], cardColour[1], cardColour[2]); pdf.text(card[1], x + 6, y + 8); pdf.setFontSize(7); pdf.setTextColor(110, 110, 110); pdf.text(card[0] === "STATUS" ? card[2].toUpperCase() : `${card[0]}  /  ${card[2].toUpperCase()}`, x + 6, y + 16); }); y += 33;
  heading("Component ratings");
  tableRow(["COMPONENT", "RATING", "FIELD COMMENT"], [58, 27, contentWidth - 85], true); result.items.forEach(item => tableRow([item.parameter, `${item.rating} / ${item.maximum}`, item.comment], [58, 27, contentWidth - 85]));
  heading("Recommended action"); pdf.setFillColor(255, 248, 232); pdf.setDrawColor(232, 190, 100); const actionLines = pdf.splitTextToSize(result.action, contentWidth - 14); ensureSpace(actionLines.length * 5 + 12); pdf.roundedRect(margin, y - 4, contentWidth, actionLines.length * 5 + 10, 2, 2, "FD"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5); pdf.setTextColor(85, 60, 20); pdf.text(actionLines, margin + 7, y + 3); pdf.setTextColor(25, 25, 25); y += actionLines.length * 5 + 16;
  heading("Engineering interpretation"); paragraph(result.interpretation);
  if (photos.length) {
    heading("Slope photographs");
    for (const photo of photos) {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = photo.dataUrl; });
      const maxWidth = 82; const maxHeight = 62; const scale = Math.min(maxWidth / image.width, maxHeight / image.height); const width = image.width * scale; const height = image.height * scale; const format = photo.dataUrl.startsWith("data:image/png") ? "PNG" : photo.dataUrl.startsWith("data:image/webp") ? "WEBP" : "JPEG"; ensureSpace(height + 12); pdf.addImage(photo.dataUrl, format, margin, y, width, height, undefined, "FAST"); pdf.setFontSize(8); pdf.text(photo.name, margin, y + height + 4); y += height + 10;
    }
  }
  const cleanedFilename = (requestedFilename || title || "wall-assessment").replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "wall-assessment";
  const filename = `${cleanedFilename}.pdf`;
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DesignCompliance() {
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [mode, setMode] = useState<Mode>("presplit");
  const [ratings, setRatings] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(field => [field.key, String(field.options[0][1])] )));
  const [photos, setPhotos] = useState<WallPhoto[]>([]);
  const [pdfFilename, setPdfFilename] = useState("wall-assessment");
  const [isExporting, setIsExporting] = useState(false);
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
  const downloadPdf = async () => {
    if (!result) return;
    setIsExporting(true);
    try { await exportWallAssessmentPdf(title, zone, result, photos, pdfFilename); toast.success("PDF downloaded"); }
    catch { toast.error("Could not generate the PDF"); }
    finally { setIsExporting(false); }
  };
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
      <div className="col-span-12 lg:col-span-5 space-y-5"><SectionLabel>Assessment Result</SectionLabel>{!result && <div className="border border-dashed border-muted-foreground/40 p-10 text-center text-sm text-muted-foreground">Select the wall-control scenario and ratings, then assess the wall.</div>}{result && <div className="space-y-5"><div className={`px-4 py-5 font-bold uppercase tracking-wider ${colourStyle[result.colour] ?? "bg-foreground text-background"}`}><div className="text-2xl">{result.classification}</div><div className="mt-2 text-sm">{result.mode === "presplit" ? "With presplit" : "Without presplit"} · Overall index {result.compliancePct}%</div></div><div className="grid grid-cols-2 gap-px bg-foreground border border-foreground"><div className="bg-background p-4"><div className="swiss-label mb-1">Design Achievement Df</div><div className="swiss-number text-3xl font-bold">{result.designAchievement.toFixed(2)} <span className="text-lg">({(result.designAchievement * 100).toFixed(1)}%)</span></div></div><div className="bg-background p-4"><div className="swiss-label mb-1">Face Condition Fc</div><div className="swiss-number text-3xl font-bold">{result.faceCondition.toFixed(2)} <span className="text-lg">({(result.faceCondition * 100).toFixed(1)}%)</span></div></div></div><div className="border border-foreground"><div className="px-4 py-3 border-b border-foreground swiss-label">Recommended action</div><div className="p-4 text-sm leading-relaxed">{result.action}</div></div><div className="border-l-4 border-primary pl-4 text-sm leading-relaxed">{result.interpretation}</div><div className="border border-foreground overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-foreground bg-secondary"><th className="px-3 py-2 text-left swiss-label">Component</th><th className="px-3 py-2 text-right swiss-label">Rating</th></tr></thead><tbody>{result.items.map(item => <tr key={item.parameter} className="border-b border-foreground"><td className="px-3 py-2">{item.parameter}</td><td className="px-3 py-2 text-right swiss-number">{item.rating}/{item.maximum}</td></tr>)}</tbody></table></div><div><Label className="swiss-label mb-1.5 block">PDF filename</Label><Input value={pdfFilename} onChange={event => setPdfFilename(event.target.value)} placeholder="wall-assessment" /><p className="mt-1 text-xs text-muted-foreground">The .pdf extension is added automatically.</p></div><Button type="button" variant="outline" disabled={isExporting} className="w-full rounded-none border-foreground font-bold" onClick={downloadPdf}><FileDown className="h-4 w-4 mr-2" /> {isExporting ? "Creating PDF…" : "Download PDF file"}</Button><p className="text-xs text-muted-foreground text-center">Direct file download — no printing required.</p></div>}</div>
    </div>
  </div>;
}
