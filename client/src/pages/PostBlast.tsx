import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  FileDown,
  Upload,
  CheckCircle2,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
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
    if (!file.type.startsWith("image/"))
      return toast.error("Please select an image file");
    if (file.size > 15 * 1024 * 1024)
      return toast.error("Image exceeds 15 MB limit");
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
            <img
              src={photo.url}
              alt={label}
              className="max-h-32 object-contain"
            />
            <span className="text-xs flex items-center gap-1 text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {photo.name}{" "}
              — click to replace
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

// ─── Blastability Index Tab ──────────────────────────────────────────────────

function BlastabilityTab() {
  const [rmd, setRmd] = useState("20");
  const [jps, setJps] = useState("20");
  const [jpo, setJpo] = useState("20");
  const [sg, setSg] = useState("2.7");
  const [ucs, setUcs] = useState("100");
  const [result, setResult] = useState<any>(null);

  const compute = trpc.blast.blastabilityIndex.useMutation({
    onSuccess: d => setResult(d),
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    compute.mutate({
      rmd: Number(rmd),
      jps: Number(jps),
      jpo: Number(jpo),
      density: Number(sg),
      ucs: Number(ucs),
    });
  };

  return (
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-12 lg:col-span-5 space-y-4">
        <SectionLabel>Rock Mass Parameters</SectionLabel>
        <div>
          <Label className="swiss-label mb-1.5 block">
            Rock Mass Description (RMD)
          </Label>
          <Select value={rmd} onValueChange={setRmd}>
            <SelectTrigger className="rounded-none border-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 — Powdery / Friable</SelectItem>
              <SelectItem value="20">20 — Blocky</SelectItem>
              <SelectItem value="50">50 — Massive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="swiss-label mb-1.5 block">
            Joint Plane Spacing (JPS)
          </Label>
          <Select value={jps} onValueChange={setJps}>
            <SelectTrigger className="rounded-none border-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 — Close (&lt;0.1 m)</SelectItem>
              <SelectItem value="20">20 — Intermediate (0.1–1 m)</SelectItem>
              <SelectItem value="50">50 — Wide (&gt;1 m)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="swiss-label mb-1.5 block">
            Joint Plane Orientation (JPO)
          </Label>
          <Select value={jpo} onValueChange={setJpo}>
            <SelectTrigger className="rounded-none border-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 — Horizontal</SelectItem>
              <SelectItem value="20">20 — Dip out of face</SelectItem>
              <SelectItem value="30">30 — Strike ⊥ face</SelectItem>
              <SelectItem value="40">40 — Dip into face</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="swiss-label mb-1.5 block">Density (t/m³)</Label>
            <Input
              type="number"
              step="0.1"
              min="1.5"
              max="5.0"
              value={sg}
              onChange={e => setSg(e.target.value)}
            />
          </div>
          <div>
            <Label className="swiss-label mb-1.5 block">UCS (MPa)</Label>
            <Input
              type="number"
              min="1"
              max="350"
              value={ucs}
              onChange={e => setUcs(e.target.value)}
            />
          </div>
        </div>
        <Button
          className="w-full font-bold uppercase tracking-wider"
          disabled={compute.isPending}
          onClick={submit}
        >
          {compute.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Compute Blastability Index"
          )}
        </Button>
      </div>
      <div className="col-span-12 lg:col-span-7">
        <SectionLabel>Results & Powder Factor Recommendation</SectionLabel>
        {!result && (
          <div className="border border-dashed border-muted-foreground/40 p-10 text-center text-sm text-muted-foreground mt-4">
            Enter rock mass parameters and compute to obtain the Blastability
            Index (Lilly 1986) and recommended powder factor.
          </div>
        )}
        {result && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-px bg-foreground border border-foreground">
              <div className="bg-background p-5">
                <div className="swiss-label mb-1 text-xs">
                  Blastability Index
                </div>
                <div className="swiss-number text-4xl font-bold">
                  {result.bi}
                </div>
              </div>
              <div className="bg-background p-5">
                <div className="swiss-label mb-1 text-xs">Classification</div>
                <div className="font-bold text-lg">{result.classification}</div>
              </div>
              <div className="bg-background p-5">
                <div className="swiss-label mb-1 text-xs">RDI / Strength</div>
                <div className="swiss-number text-2xl font-bold">
                  {result.rdi} / {result.strength}
                </div>
                <div className="text-xs text-muted-foreground">
                  Density index / UCS factor
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {result.description}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-foreground p-4">
                <div className="swiss-label text-xs mb-2">
                  Suggested Powder Factor (Lilly)
                </div>
                <div className="text-2xl font-bold">
                  {result.suggestedPowderFactor.value}
                </div>
                <div className="text-xs text-muted-foreground">
                  {result.suggestedPowderFactor.unit}
                </div>
              </div>
              <div className="border border-primary p-4 bg-primary/5">
                <div className="swiss-label text-xs mb-2 text-primary">
                  Wall Proximity PF (reduced)
                </div>
                <div className="text-2xl font-bold text-primary">
                  {result.wallProximityPF.min} – {result.wallProximityPF.max}
                </div>
                <div className="text-xs text-muted-foreground">
                  {result.wallProximityPF.unit}
                </div>
              </div>
            </div>
            <div className="border border-foreground p-4">
              <div className="swiss-label text-xs mb-2">Recommendations</div>
              <ul className="space-y-1 text-sm">
                {result.recommendations.map((r: string, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary font-bold">•</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Wall Control Compliance Tab ─────────────────────────────────────────────

function WallControlTab() {
  const [preSplit, setPreSplit] = useState(true);
  const [preSplitSpacing, setPreSplitSpacing] = useState("1.0");
  const [preSplitDiameter, setPreSplitDiameter] = useState("89");
  const [trimBlast, setTrimBlast] = useState(true);
  const [trimBurden, setTrimBurden] = useState("2.5");
  const [bufferRows, setBufferRows] = useState("2");
  const [standoffDistance, setStandoffDistance] = useState("5");
  const [measuredBackbreak, setMeasuredBackbreak] = useState("0.5");
  const [measuredCrestLoss, setMeasuredCrestLoss] = useState("0.3");
  const [designBermWidth, setDesignBermWidth] = useState("8");
  const [actualBermWidth, setActualBermWidth] = useState("7.5");
  const [blastAzimuth, setBlastAzimuth] = useState("90");
  const [wallFaceAzimuth, setWallFaceAzimuth] = useState("90");
  const [structureDipDirection, setStructureDipDirection] = useState("90");
  const [structureDip, setStructureDip] = useState("45");
  const [initiationDirection, setInitiationDirection] =
    useState("away-from-wall");
  const [tieUpPattern, setTieUpPattern] = useState("echelon");
  const [holeDelayMs, setHoleDelayMs] = useState("17");
  const [rowDelayMs, setRowDelayMs] = useState("65");
  const [controlledWallBlast, setControlledWallBlast] = useState(true);
  const [result, setResult] = useState<any>(null);

  const evaluate = trpc.blast.wallControl.useMutation({
    onSuccess: d => setResult(d),
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    evaluate.mutate({
      preSplit,
      preSplitSpacing: Number(preSplitSpacing),
      preSplitDiameter: Number(preSplitDiameter),
      trimBlast,
      trimBurden: Number(trimBurden),
      bufferRows: Number(bufferRows),
      standoffDistance: Number(standoffDistance),
      measuredBackbreak: Number(measuredBackbreak),
      measuredCrestLoss: Number(measuredCrestLoss),
      designBermWidth: Number(designBermWidth),
      actualBermWidth: Number(actualBermWidth),
      blastAzimuth: Number(blastAzimuth),
      wallFaceAzimuth: Number(wallFaceAzimuth),
      structureDipDirection: Number(structureDipDirection),
      structureDip: Number(structureDip),
      initiationDirection: initiationDirection as
        | "away-from-wall"
        | "parallel-to-wall"
        | "toward-wall",
      tieUpPattern: tieUpPattern as
        | "echelon"
        | "diagonal"
        | "row-by-row"
        | "v-cut"
        | "unknown",
      holeDelayMs: Number(holeDelayMs),
      rowDelayMs: Number(rowDelayMs),
      controlledWallBlast,
    });
  };

  const statusIcon = (s: string) =>
    s === "Pass" ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : s === "Warning" ? (
      <AlertTriangle className="h-4 w-4 text-yellow-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );

  const complianceColor = (c: string) =>
    c === "Compliant"
      ? "bg-foreground text-background"
      : c === "Partially Compliant"
        ? "bg-secondary border border-foreground"
        : "bg-primary text-primary-foreground";

  return (
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-12 lg:col-span-5 space-y-4">
        <SectionLabel>Wall Control Methods</SectionLabel>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={preSplit}
              onChange={e => setPreSplit(e.target.checked)}
              className="h-4 w-4"
            />
            Pre-split used
          </label>
          {preSplit && (
            <div className="grid grid-cols-2 gap-3 pl-6">
              <div>
                <Label className="swiss-label text-[11px]">Spacing (m)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={preSplitSpacing}
                  onChange={e => setPreSplitSpacing(e.target.value)}
                />
              </div>
              <div>
                <Label className="swiss-label text-[11px]">Diameter (mm)</Label>
                <Input
                  type="number"
                  value={preSplitDiameter}
                  onChange={e => setPreSplitDiameter(e.target.value)}
                />
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={trimBlast}
              onChange={e => setTrimBlast(e.target.checked)}
              className="h-4 w-4"
            />
            Trim (cushion) blast used
          </label>
          {trimBlast && (
            <div className="pl-6">
              <Label className="swiss-label text-[11px]">
                Trim row burden (m)
              </Label>
              <Input
                type="number"
                step="0.1"
                value={trimBurden}
                onChange={e => setTrimBurden(e.target.value)}
                className="max-w-[180px]"
              />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="swiss-label text-[11px]">Buffer rows</Label>
            <Input
              type="number"
              min="0"
              max="10"
              value={bufferRows}
              onChange={e => setBufferRows(e.target.value)}
            />
          </div>
          <div>
            <Label className="swiss-label text-[11px]">
              Standoff distance (m)
            </Label>
            <Input
              type="number"
              step="0.5"
              value={standoffDistance}
              onChange={e => setStandoffDistance(e.target.value)}
            />
          </div>
        </div>
        <SectionLabel>Blast Orientation & Tie-up</SectionLabel>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Screen the blast direction against the final wall and dominant
          discontinuities. The output is an engineering aid; confirm the final
          timing with the responsible blast engineer.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="swiss-label text-[11px]">Blast azimuth (°)</Label>
            <Input
              type="number"
              min="0"
              max="360"
              value={blastAzimuth}
              onChange={e => setBlastAzimuth(e.target.value)}
            />
          </div>
          <div>
            <Label className="swiss-label text-[11px]">
              Final wall azimuth (°)
            </Label>
            <Input
              type="number"
              min="0"
              max="360"
              value={wallFaceAzimuth}
              onChange={e => setWallFaceAzimuth(e.target.value)}
            />
          </div>
          <div>
            <Label className="swiss-label text-[11px]">
              Structure dip direction (°)
            </Label>
            <Input
              type="number"
              min="0"
              max="360"
              value={structureDipDirection}
              onChange={e => setStructureDipDirection(e.target.value)}
            />
          </div>
          <div>
            <Label className="swiss-label text-[11px]">Structure dip (°)</Label>
            <Input
              type="number"
              min="0"
              max="90"
              value={structureDip}
              onChange={e => setStructureDip(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="swiss-label text-[11px]">
              Initiation direction
            </Label>
            <Select
              value={initiationDirection}
              onValueChange={setInitiationDirection}
            >
              <SelectTrigger className="rounded-none border-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="away-from-wall">
                  Away from final wall
                </SelectItem>
                <SelectItem value="parallel-to-wall">
                  Parallel to final wall
                </SelectItem>
                <SelectItem value="toward-wall">Toward final wall</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="swiss-label text-[11px]">Tie-up pattern</Label>
            <Select value={tieUpPattern} onValueChange={setTieUpPattern}>
              <SelectTrigger className="rounded-none border-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="echelon">Echelon</SelectItem>
                <SelectItem value="diagonal">Diagonal</SelectItem>
                <SelectItem value="row-by-row">Row-by-row</SelectItem>
                <SelectItem value="v-cut">V-cut</SelectItem>
                <SelectItem value="unknown">Not recorded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="swiss-label text-[11px]">Hole delay (ms)</Label>
            <Input
              type="number"
              min="1"
              max="1000"
              value={holeDelayMs}
              onChange={e => setHoleDelayMs(e.target.value)}
            />
          </div>
          <div>
            <Label className="swiss-label text-[11px]">Row delay (ms)</Label>
            <Input
              type="number"
              min="1"
              max="2000"
              value={rowDelayMs}
              onChange={e => setRowDelayMs(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={controlledWallBlast}
            onChange={e => setControlledWallBlast(e.target.checked)}
            className="h-4 w-4"
          />
          Controlled perimeter blast used (trim / cushion / pre-split)
        </label>
        <SectionLabel>Measured Wall Damage</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="swiss-label text-[11px]">Backbreak (m)</Label>
            <Input
              type="number"
              step="0.1"
              value={measuredBackbreak}
              onChange={e => setMeasuredBackbreak(e.target.value)}
            />
          </div>
          <div>
            <Label className="swiss-label text-[11px]">Crest loss (m)</Label>
            <Input
              type="number"
              step="0.1"
              value={measuredCrestLoss}
              onChange={e => setMeasuredCrestLoss(e.target.value)}
            />
          </div>
          <div>
            <Label className="swiss-label text-[11px]">
              Design berm width (m)
            </Label>
            <Input
              type="number"
              step="0.1"
              value={designBermWidth}
              onChange={e => setDesignBermWidth(e.target.value)}
            />
          </div>
          <div>
            <Label className="swiss-label text-[11px]">
              Actual berm width (m)
            </Label>
            <Input
              type="number"
              step="0.1"
              value={actualBermWidth}
              onChange={e => setActualBermWidth(e.target.value)}
            />
          </div>
        </div>
        <Button
          className="w-full font-bold uppercase tracking-wider"
          disabled={evaluate.isPending}
          onClick={submit}
        >
          {evaluate.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Evaluate Wall Control"
          )}
        </Button>
      </div>
      <div className="col-span-12 lg:col-span-7">
        <SectionLabel>Compliance Verdict</SectionLabel>
        {!result && (
          <div className="border border-dashed border-muted-foreground/40 p-10 text-center text-sm text-muted-foreground mt-4">
            Enter wall control parameters and measured damage to evaluate
            compliance.
          </div>
        )}
        {result && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-px bg-foreground border border-foreground">
              <div
                className={`p-5 ${complianceColor(result.overallCompliance)}`}
              >
                <div
                  className="swiss-label mb-1 text-xs"
                  style={{ color: "inherit" }}
                >
                  Overall Compliance
                </div>
                <div className="text-xl font-bold">
                  {result.overallCompliance}
                </div>
              </div>
              <div className="bg-background p-5">
                <div className="swiss-label mb-1 text-xs">Score</div>
                <div className="swiss-number text-4xl font-bold">
                  {result.score}
                  <span className="text-lg font-normal">/100</span>
                </div>
              </div>
            </div>
            {/* Checks table */}
            <div className="border border-foreground divide-y divide-border">
              <div className="grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-2 bg-secondary font-bold text-xs uppercase tracking-wider">
                <span></span>
                <span>Parameter</span>
                <span>Status</span>
              </div>
              {result.checks.map((c: any, i: number) => (
                <div
                  key={i}
                  className="grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-2 text-sm items-center"
                >
                  {statusIcon(c.status)}
                  <div>
                    <span className="font-medium">{c.parameter}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {c.detail}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-bold ${c.status === "Pass" ? "text-green-600" : c.status === "Warning" ? "text-yellow-600" : "text-red-600"}`}
                  >
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
            {result.blastControl && (
              <div className="border border-primary bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="swiss-label text-xs">
                    Orientation & Tie-up Recommendation
                  </div>
                  <div className="font-bold text-sm">
                    {result.blastControl.orientationRisk} risk
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">
                      Blast / wall angle
                    </span>
                    <div className="font-bold">
                      {result.blastControl.wallAlignmentAngle}°
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">
                      Structure / wall angle
                    </span>
                    <div className="font-bold">
                      {result.blastControl.structureWallAngle}°
                    </div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed">
                  {result.blastControl.tieUpRecommendation}
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {result.blastControl.recommendations.map(
                    (r: string, i: number) => (
                      <li key={i}>• {r}</li>
                    )
                  )}
                </ul>
              </div>
            )}
            {/* Wall Damage Assessment */}
            <div className="border border-foreground p-4">
              <div className="swiss-label text-xs mb-3">
                Wall Damage Assessment
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                <div>
                  <span className="text-muted-foreground text-xs">
                    Backbreak
                  </span>
                  <div className="font-bold">
                    {result.wallDamageAssessment.backbreakSeverity}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">
                    Crest loss
                  </span>
                  <div className="font-bold">
                    {result.wallDamageAssessment.crestLossSeverity}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">
                    Berm reduction
                  </span>
                  <div className="font-bold">
                    {result.wallDamageAssessment.bermReduction}%
                  </div>
                </div>
              </div>
              <div
                className={`inline-block px-3 py-1 text-xs font-bold uppercase ${
                  result.wallDamageAssessment.overallDamage === "Acceptable"
                    ? "bg-foreground text-background"
                    : result.wallDamageAssessment.overallDamage === "Marginal"
                      ? "bg-secondary border border-foreground"
                      : "bg-primary text-primary-foreground"
                }`}
              >
                {result.wallDamageAssessment.overallDamage}
              </div>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {result.wallDamageAssessment.comments.map(
                  (c: string, i: number) => (
                    <li key={i}>• {c}</li>
                  )
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

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
    if (!form.title.trim())
      return toast.error("Please provide an assessment title");
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
    s >= 75
      ? "bg-foreground text-background"
      : s >= 50
        ? "bg-secondary border border-foreground"
        : "bg-primary text-primary-foreground";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ModuleHeader
        index="04"
        title="Blast Assessment"
        module="Blast Assessment"
        description="Comprehensive blast evaluation: AI photo analysis, Blastability Index, wall-control compliance, blast orientation screening and tie-up recommendations to help reduce backbreak and wall damage."
      />

      <Tabs defaultValue="photo" className="mt-6">
        <TabsList className="w-full rounded-none border border-foreground bg-background h-auto p-0 grid grid-cols-3">
          <TabsTrigger
            value="photo"
            className="rounded-none data-[state=active]:bg-foreground data-[state=active]:text-background py-3 font-bold uppercase text-xs tracking-wider"
          >
            Photo Analysis
          </TabsTrigger>
          <TabsTrigger
            value="bi"
            className="rounded-none data-[state=active]:bg-foreground data-[state=active]:text-background py-3 font-bold uppercase text-xs tracking-wider"
          >
            Blastability Index
          </TabsTrigger>
          <TabsTrigger
            value="wallcontrol"
            className="rounded-none data-[state=active]:bg-foreground data-[state=active]:text-background py-3 font-bold uppercase text-xs tracking-wider"
          >
            Wall Control
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photo" className="mt-6">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 lg:col-span-5 space-y-4">
              <SectionLabel>Blast Data</SectionLabel>
              <div>
                <Label className="swiss-label mb-1.5 block">
                  Assessment title *
                </Label>
                <Input
                  value={form.title}
                  onChange={set("title")}
                  placeholder="e.g. Blast #2026-142 — Bench 1230"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="swiss-label mb-1.5 block">
                    Blast date *
                  </Label>
                  <Input
                    type="date"
                    value={form.blastDate}
                    onChange={set("blastDate")}
                  />
                </div>
                <div>
                  <Label className="swiss-label mb-1.5 block">Zone *</Label>
                  <Input
                    value={form.zone}
                    onChange={set("zone")}
                    placeholder="e.g. East pit, bench 1230"
                  />
                </div>
              </div>
              <PhotoUpload
                label="Before"
                photo={before}
                onUploaded={setBefore}
              />
              <PhotoUpload label="After" photo={after} onUploaded={setAfter} />
              <div>
                <Label className="swiss-label mb-1.5 block">Field notes</Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={set("notes")}
                  placeholder="e.g. 89 holes, 165 mm diameter, ANFO, powder factor 0.85 kg/m³…"
                />
              </div>
              <Button
                className="w-full font-bold uppercase tracking-wider"
                disabled={analyze.isPending}
                onClick={submit}
              >
                {analyze.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Analyzing
                    photos…
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
                    onClick={() =>
                      exportRecordAsPdf(
                        form.title || "Blast assessment",
                        markdownToHtml(report)
                      )
                    }
                  >
                    <FileDown className="h-3.5 w-3.5" /> Export PDF
                  </Button>
                )}
              </div>
              {!analysis && !analyze.isPending && (
                <div className="border border-dashed border-muted-foreground/40 p-10 text-center text-sm text-muted-foreground">
                  Upload both photographs and run the analysis to obtain the
                  blast quality score and the structured assessment report.
                </div>
              )}
              {analyze.isPending && (
                <div className="border border-foreground p-10 flex items-center justify-center gap-3 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> The AI is
                  analyzing the before/after photos…
                </div>
              )}
              {analysis && !analyze.isPending && (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-px bg-foreground border border-foreground">
                    <div className={`p-6 ${scoreColor(analysis.qualityScore)}`}>
                      <div
                        className="swiss-label mb-2 opacity-70"
                        style={{ color: "inherit" }}
                      >
                        Quality score
                      </div>
                      <div className="swiss-number text-5xl font-bold">
                        {analysis.qualityScore}
                        <span className="text-lg font-normal">/100</span>
                      </div>
                    </div>
                    <div className="bg-background p-6">
                      <div className="swiss-label mb-2">Fragmentation</div>
                      <div className="font-bold text-xl">
                        {analysis.fragmentationRating}
                      </div>
                    </div>
                    <div className="bg-background p-6">
                      <div className="swiss-label mb-2">Break control</div>
                      <div className="font-bold text-xl">
                        {analysis.overbreakDetected}
                      </div>
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
        </TabsContent>

        <TabsContent value="bi" className="mt-6">
          <BlastabilityTab />
        </TabsContent>

        <TabsContent value="wallcontrol" className="mt-6">
          <WallControlTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
