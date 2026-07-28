import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileDown, Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { exportRecordAsPdf, markdownToHtml } from "@/lib/exportPdf";

type Photo = { key: string; url: string; name: string };

function PhotoUpload({
  label,
  photo,
  onUploaded,
}: {
  label: string;
  photo: Photo | null;
  onUploaded: (p: Photo) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = trpc.blast.uploadPhoto.useMutation({
    onError: e => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Please select an image file");
    if (file.size > 15 * 1024 * 1024) return toast.error("Image exceeds 15 MB limit");
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const res = await upload.mutateAsync({
      fileName: file.name,
      mimeType: file.type,
      base64,
    });
    onUploaded({ key: res.key, url: res.url, name: file.name });
    toast.success(`${label} photo uploaded`);
  };

  return (
    <div>
      <Label className="swiss-label mb-1.5 block">{label} photo *</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full border border-foreground p-4 flex flex-col items-center gap-2 hover:bg-secondary transition-colors min-h-[120px] justify-center"
      >
        {upload.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : photo ? (
          <>
            <img src={photo.url} alt={label} className="max-h-32 object-contain" />
            <span className="text-xs flex items-center gap-1 text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {photo.name} — click to replace
            </span>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Click to upload the {label.toLowerCase()} photo
            </span>
          </>
        )}
      </button>
    </div>
  );
}

type Analysis = {
  qualityScore: number;
  fragmentationRating: string;
  fragmentationComment: string;
  overbreakDetected: string;
  overbreakComment: string;
  muckpileComment: string;
  wallConditionComment: string;
  recommendations: string[];
};

export default function PostBlast() {
  const [form, setForm] = useState({
    title: "",
    blastDate: new Date().toISOString().slice(0, 10),
    zone: "",
    notes: "",
  });
  const [before, setBefore] = useState<Photo | null>(null);
  const [after, setAfter] = useState<Photo | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const analyze = trpc.blast.analyze.useMutation({
    onSuccess: d => {
      setAnalysis(d.analysis);
      setReport(d.generatedReport);
      utils.blast.list.invalidate();
      toast.success("Blast analysis completed");
    },
    onError: e => toast.error(e.message),
  });

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.title.trim()) return toast.error("Please provide an assessment title");
    if (!form.zone.trim()) return toast.error("Please indicate the blast zone");
    if (!before) return toast.error("Please upload the BEFORE photo");
    if (!after) return toast.error("Please upload the AFTER photo");
    analyze.mutate({
      title: form.title.trim(),
      blastDate: form.blastDate,
      zone: form.zone.trim(),
      beforePhotoUrl: before.url,
      beforePhotoKey: before.key,
      afterPhotoUrl: after.url,
      afterPhotoKey: after.key,
      notes: form.notes.trim() || undefined,
    });
  };

  const scoreColor = (s: number) =>
    s >= 75 ? "bg-foreground text-background" : s >= 50 ? "bg-secondary border border-foreground" : "bg-primary text-primary-foreground";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ModuleHeader
        index="04"
        title="Post-Blast Assessment"
        description="Upload before/after blast photographs. The multimodal AI evaluates fragmentation, overbreak/underbreak and wall condition, and returns a quantified blast quality score (0–100) with a structured report."
      />
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-5 space-y-4">
          <SectionLabel>Blast Data</SectionLabel>
          <div>
            <Label className="swiss-label mb-1.5 block">Assessment title *</Label>
            <Input value={form.title} onChange={set("title")} placeholder="e.g. Blast #2026-142 — Bench 1230" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="swiss-label mb-1.5 block">Blast date *</Label>
              <Input type="date" value={form.blastDate} onChange={set("blastDate")} />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">Zone *</Label>
              <Input value={form.zone} onChange={set("zone")} placeholder="e.g. East pit, bench 1230" />
            </div>
          </div>
          <PhotoUpload label="Before" photo={before} onUploaded={setBefore} />
          <PhotoUpload label="After" photo={after} onUploaded={setAfter} />
          <div>
            <Label className="swiss-label mb-1.5 block">Field notes</Label>
            <Textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="e.g. 89 holes, 165 mm diameter, ANFO, powder factor 0.85 kg/m³…" />
          </div>
          <Button className="w-full font-bold uppercase tracking-wider" disabled={analyze.isPending} onClick={submit}>
            {analyze.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing photos…
              </>
            ) : (
              "Run AI Analysis"
            )}
          </Button>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Analysis & Report</SectionLabel>
            {report && (
              <Button
                variant="outline"
                size="sm"
                className="font-bold uppercase tracking-wider text-xs"
                onClick={() => exportRecordAsPdf(form.title || "Post-blast assessment", markdownToHtml(report))}
              >
                <FileDown className="h-3.5 w-3.5" /> Export PDF
              </Button>
            )}
          </div>
          {!analysis && !analyze.isPending && (
            <div className="border border-dashed border-muted-foreground/40 p-10 text-center text-sm text-muted-foreground">
              Upload both photographs and run the analysis to obtain the blast
              quality score and the structured assessment report.
            </div>
          )}
          {analyze.isPending && (
            <div className="border border-foreground p-10 flex items-center justify-center gap-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> The AI is analyzing the before/after photos…
            </div>
          )}
          {analysis && !analyze.isPending && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-px bg-foreground border border-foreground">
                <div className={`p-6 ${scoreColor(analysis.qualityScore)}`}>
                  <div className="swiss-label mb-2 opacity-70" style={{ color: "inherit" }}>
                    Quality score
                  </div>
                  <div className="swiss-number text-5xl font-bold">
                    {analysis.qualityScore}
                    <span className="text-lg font-normal">/100</span>
                  </div>
                </div>
                <div className="bg-background p-6">
                  <div className="swiss-label mb-2">Fragmentation</div>
                  <div className="font-bold text-xl">{analysis.fragmentationRating}</div>
                </div>
                <div className="bg-background p-6">
                  <div className="swiss-label mb-2">Break control</div>
                  <div className="font-bold text-xl">{analysis.overbreakDetected}</div>
                </div>
              </div>
              {report && (
                <div className="border border-foreground p-6 prose prose-sm max-w-none">
                  <Streamdown>{report}</Streamdown>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
