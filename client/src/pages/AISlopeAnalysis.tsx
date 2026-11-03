import { useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Compass,
  ImagePlus,
  Loader2,
  Mountain,
  ScanLine,
  Upload,
} from "lucide-react";
import { ModuleHeader } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";

type Point = { x: number; y: number };
type Geometry = {
  crest: Point;
  toe: Point;
  face: Point[];
  berms: Point[][];
  visibleBoundaries: Point[];
};
type Analysis = {
  estimatedFaceAngle: number;
  confidence: number;
  geometry: Geometry;
  method: string[];
  disclaimer: string;
};
type ReviewStatus = "Preliminary" | "Reviewed" | "Approved";
type SelectionMode = "crest" | "toe" | "scaleA" | "scaleB" | null;

function pointString(point: Point) {
  return `${(point.x * 100).toFixed(1)},${(point.y * 100).toFixed(1)}`;
}

function angleBetween(a: Point, b: Point) {
  return Number(
    (
      (Math.atan2(Math.abs(b.y - a.y), Math.max(Math.abs(b.x - a.x), 0.0001)) *
        180) /
      Math.PI
    ).toFixed(1)
  );
}

function prepareImage(file: File) {
  return new Promise<{ dataUrl: string; edgeDensity: number }>(
    (resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Unable to read the image."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Unable to decode the image."));
        image.onload = () => {
          const scale = Math.min(
            1,
            1400 / Math.max(image.naturalWidth, image.naturalHeight)
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d");
          if (!context)
            return reject(
              new Error("Image processing is not available in this browser.")
            );
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const edgeCanvas = document.createElement("canvas");
          edgeCanvas.width = 64;
          edgeCanvas.height = 64;
          const edgeContext = edgeCanvas.getContext("2d", {
            willReadFrequently: true,
          });
          if (!edgeContext)
            return reject(
              new Error(
                "Image edge detection is not available in this browser."
              )
            );
          edgeContext.drawImage(canvas, 0, 0, 64, 64);
          const pixels = edgeContext.getImageData(0, 0, 64, 64).data;
          const gray = (x: number, y: number) => {
            const offset = (y * 64 + x) * 4;
            return (
              pixels[offset] * 0.299 +
              pixels[offset + 1] * 0.587 +
              pixels[offset + 2] * 0.114
            );
          };
          let gradient = 0;
          let comparisons = 0;
          for (let y = 0; y < 63; y++)
            for (let x = 0; x < 63; x++) {
              gradient +=
                Math.abs(gray(x, y) - gray(x + 1, y)) +
                Math.abs(gray(x, y) - gray(x, y + 1));
              comparisons += 2;
            }
          resolve({
            dataUrl: canvas.toDataURL("image/jpeg", 0.72),
            edgeDensity: Math.max(
              0,
              Math.min(1, gradient / Math.max(1, comparisons) / 255)
            ),
          });
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    }
  );
}

function GeometryOverlay({
  geometry,
  manualCrest,
  manualToe,
  scaleA,
  scaleB,
}: {
  geometry: Geometry;
  manualCrest?: Point | null;
  manualToe?: Point | null;
  scaleA?: Point | null;
  scaleB?: Point | null;
}) {
  const facePoints =
    geometry.face.length >= 2
      ? geometry.face.map(pointString).join(" ")
      : `${pointString(geometry.crest)} ${pointString(geometry.toe)}`;
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-label="Detected slope geometry overlay"
    >
      <polyline
        points={geometry.visibleBoundaries.map(pointString).join(" ")}
        fill="none"
        stroke="#facc15"
        strokeWidth="0.7"
        strokeDasharray="2 1"
      />
      {geometry.berms.map((berm, index) => (
        <polyline
          key={index}
          points={berm.map(pointString).join(" ")}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="0.9"
        />
      ))}
      <polyline
        points={facePoints}
        fill="none"
        stroke="#ef4444"
        strokeWidth="1.2"
      />
      <circle
        cx={geometry.crest.x * 100}
        cy={geometry.crest.y * 100}
        r="1.6"
        fill="#22c55e"
        stroke="white"
        strokeWidth="0.5"
      />
      <circle
        cx={geometry.toe.x * 100}
        cy={geometry.toe.y * 100}
        r="1.6"
        fill="#a855f7"
        stroke="white"
        strokeWidth="0.5"
      />
      {manualCrest && (
        <circle
          cx={manualCrest.x * 100}
          cy={manualCrest.y * 100}
          r="2.2"
          fill="#16a34a"
          stroke="white"
          strokeWidth="0.7"
        />
      )}
      {manualToe && (
        <circle
          cx={manualToe.x * 100}
          cy={manualToe.y * 100}
          r="2.2"
          fill="#7c3aed"
          stroke="white"
          strokeWidth="0.7"
        />
      )}
      {manualCrest && manualToe && (
        <line
          x1={manualCrest.x * 100}
          y1={manualCrest.y * 100}
          x2={manualToe.x * 100}
          y2={manualToe.y * 100}
          stroke="#111827"
          strokeWidth="1"
          strokeDasharray="2 1"
        />
      )}
      {scaleA && (
        <circle
          cx={scaleA.x * 100}
          cy={scaleA.y * 100}
          r="1.8"
          fill="#0284c7"
          stroke="white"
          strokeWidth="0.7"
        />
      )}
      {scaleB && (
        <circle
          cx={scaleB.x * 100}
          cy={scaleB.y * 100}
          r="1.8"
          fill="#0284c7"
          stroke="white"
          strokeWidth="0.7"
        />
      )}
      {scaleA && scaleB && (
        <line
          x1={scaleA.x * 100}
          y1={scaleA.y * 100}
          x2={scaleB.x * 100}
          y2={scaleB.y * 100}
          stroke="#0284c7"
          strokeWidth="0.9"
          strokeDasharray="1 1"
        />
      )}
    </svg>
  );
}

export default function AISlopeAnalysis() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageData, setImageData] = useState("");
  const [edgeDensity, setEdgeDensity] = useState(0);
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [manualCrest, setManualCrest] = useState<Point | null>(null);
  const [manualToe, setManualToe] = useState<Point | null>(null);
  const [scaleA, setScaleA] = useState<Point | null>(null);
  const [scaleB, setScaleB] = useState<Point | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [knownScale, setKnownScale] = useState("");
  const [adjustedAngle, setAdjustedAngle] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("Preliminary");
  const [reviewExplanation, setReviewExplanation] = useState("");
  const analyze = trpc.aiSlope.analyzePhoto.useMutation({
    onSuccess: result => {
      setAnalysis(result as Analysis);
      setManualCrest(null);
      setManualToe(null);
      setScaleA(null);
      setScaleB(null);
      setAdjustedAngle((result as Analysis).estimatedFaceAngle.toFixed(1));
      setReviewStatus("Preliminary");
      setReviewExplanation("");
      setError("");
    },
    onError: result =>
      setError(
        result.message ||
          "The slope image could not be analyzed. Check that the image is JPEG, PNG or WebP and try again."
      ),
  });

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (
      ["image/heic", "image/heif"].includes(file.type.toLowerCase()) ||
      /\.hei[cf]$/i.test(file.name)
    ) {
      setError(
        "HEIC/HEIF photos are not supported by this browser workflow yet. Export the photo as JPEG or PNG and try again."
      );
      return;
    }
    try {
      setError("");
      setAnalysis(null);
      setManualCrest(null);
      setManualToe(null);
      setScaleA(null);
      setScaleB(null);
      setSelectionMode(null);
      setAdjustedAngle("");
      setReviewStatus("Preliminary");
      setReviewExplanation("");
      setFileName(
        `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB original)`
      );
      const prepared = await prepareImage(file);
      setImageData(prepared.dataUrl);
      setEdgeDensity(prepared.edgeDensity);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to prepare the image."
      );
    }
  };

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-8">
      <ModuleHeader
        index="02.01"
        title="AI Slope Analysis"
        module="AI Slope Analysis"
        description="Preliminary photo-based estimation of open-pit slope geometry using crest/toe detection, segmentation and image geometry."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <Card className="rounded-none border-foreground">
          <CardHeader className="border-b border-foreground">
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" /> Slope image
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Take a field photo or upload an existing image. For best results,
              include the complete visible face with crest and toe in the same
              frame.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={event => {
                void handleFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                className="rounded-none"
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="mr-2 h-4 w-4" /> Take photo
              </Button>
              <Button
                variant="outline"
                className="rounded-none border-foreground"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" /> Upload image
              </Button>
              {imageData && (
                <Button
                  variant="outline"
                  className="rounded-none border-foreground"
                  onClick={() => {
                    setImageData("");
                    setEdgeDensity(0);
                    setAnalysis(null);
                    setManualCrest(null);
                    setManualToe(null);
                    setScaleA(null);
                    setScaleB(null);
                    setSelectionMode(null);
                    setAdjustedAngle("");
                    setReviewStatus("Preliminary");
                    setReviewExplanation("");
                    setFileName("");
                  }}
                >
                  Remove image
                </Button>
              )}
            </div>
            {imageData ? (
              <div
                className={`relative overflow-hidden border border-foreground bg-black ${selectionMode ? "cursor-crosshair" : ""}`}
                onClick={event => {
                  if (!selectionMode) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const selected = {
                    x: Math.max(
                      0,
                      Math.min(1, (event.clientX - rect.left) / rect.width)
                    ),
                    y: Math.max(
                      0,
                      Math.min(1, (event.clientY - rect.top) / rect.height)
                    ),
                  };
                  if (selectionMode === "crest") setManualCrest(selected);
                  if (selectionMode === "toe") setManualToe(selected);
                  if (selectionMode === "scaleA") setScaleA(selected);
                  if (selectionMode === "scaleB") setScaleB(selected);
                  setSelectionMode(null);
                }}
              >
                <img
                  src={imageData}
                  alt={fileName || "Selected open-pit slope"}
                  className="block max-h-[620px] w-full object-contain"
                />
                {analysis && (
                  <GeometryOverlay
                    geometry={analysis.geometry}
                    manualCrest={manualCrest}
                    manualToe={manualToe}
                    scaleA={scaleA}
                    scaleB={scaleB}
                  />
                )}
              </div>
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center border border-dashed border-foreground/50 bg-muted/30 text-center">
                <ImagePlus className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="font-semibold">No slope image selected</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Use the camera button on a phone or upload a clear photo from
                  your survey or inspection record.
                </p>
              </div>
            )}
            {fileName && (
              <p className="text-xs font-mono text-muted-foreground">
                Prepared image: {fileName} · resized locally before analysis
              </p>
            )}
            <Button
              className="w-full rounded-none"
              size="lg"
              disabled={!imageData || analyze.isPending}
              onClick={() =>
                analyze.mutate({ imageDataUrl: imageData, edgeDensity })
              }
            >
              {analyze.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing
                  visible slope geometry…
                </>
              ) : (
                <>
                  <ScanLine className="mr-2 h-4 w-4" /> Analyze slope photo
                </>
              )}
            </Button>
            <div
              className="border border-amber-600 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
              role="note"
              aria-label="Photo geometry limitation warning"
            >
              <p className="font-bold">Warning — photo geometry limitations</p>
              <p className="mt-1">
                Without a known scale, camera distance and orientation, survey
                control, LiDAR or drone data, OPGeotech can estimate only the
                apparent 2D face angle from this image. Perspective may distort
                the crest and toe, so the photo cannot reliably determine true
                slope height, 3D geometry or stability.
              </p>
              <p className="mt-1 font-semibold">
                Use this result for preliminary screening only. Verify it with
                survey, LiDAR, drone photogrammetry or field measurements before
                design or safety decisions.
              </p>
            </div>
            {imageData && (
              <div className="space-y-4 border border-foreground bg-muted/20 p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest">
                    Engineer review and manual controls
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Select points directly on the image before or after AI
                    analysis. The black dashed line is the engineer-selected
                    crest-to-toe line.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={selectionMode === "crest" ? "default" : "outline"}
                    className="rounded-none border-foreground"
                    onClick={() => setSelectionMode("crest")}
                  >
                    Select Crest
                  </Button>
                  <Button
                    type="button"
                    variant={selectionMode === "toe" ? "default" : "outline"}
                    className="rounded-none border-foreground"
                    onClick={() => setSelectionMode("toe")}
                  >
                    Select Toe
                  </Button>
                  <Button
                    type="button"
                    variant={selectionMode === "scaleA" ? "default" : "outline"}
                    className="rounded-none border-foreground"
                    onClick={() => setSelectionMode("scaleA")}
                  >
                    Select Scale Point A
                  </Button>
                  <Button
                    type="button"
                    variant={selectionMode === "scaleB" ? "default" : "outline"}
                    className="rounded-none border-foreground"
                    onClick={() => setSelectionMode("scaleB")}
                  >
                    Select Scale Point B
                  </Button>
                </div>
                {selectionMode && (
                  <p className="text-sm font-semibold text-primary">
                    Click the{" "}
                    {selectionMode === "crest"
                      ? "crest"
                      : selectionMode === "toe"
                        ? "toe"
                        : `scale point ${selectionMode === "scaleA" ? "A" : "B"}`}{" "}
                    on the image.
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    Known scale distance (m)
                    <input
                      className="mt-1 w-full border border-foreground bg-background px-3 py-2 font-mono font-normal"
                      type="number"
                      min="0"
                      step="0.01"
                      value={knownScale}
                      onChange={event => setKnownScale(event.target.value)}
                      placeholder="e.g. 5.00"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Engineer-adjusted angle (°)
                    <input
                      className="mt-1 w-full border border-foreground bg-background px-3 py-2 font-mono font-normal"
                      type="number"
                      min="0"
                      max="90"
                      step="0.1"
                      value={adjustedAngle}
                      onChange={event => setAdjustedAngle(event.target.value)}
                    />
                  </label>
                </div>
                {scaleA && scaleB && knownScale && (
                  <p className="text-xs text-muted-foreground">
                    Reference selected: {Number(knownScale).toFixed(2)} m. This
                    documents scale; perspective correction still requires
                    survey or LiDAR.
                  </p>
                )}
                {manualCrest && manualToe && (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none border-foreground"
                    onClick={() =>
                      setAdjustedAngle(
                        angleBetween(manualCrest, manualToe).toFixed(1)
                      )
                    }
                  >
                    Calculate angle from selected Crest/Toe
                  </Button>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    Review status
                    <select
                      className="mt-1 w-full border border-foreground bg-background px-3 py-2 font-normal"
                      value={reviewStatus}
                      onChange={event =>
                        setReviewStatus(event.target.value as ReviewStatus)
                      }
                    >
                      <option>Preliminary</option>
                      <option>Reviewed</option>
                      <option>Approved</option>
                    </select>
                  </label>
                  <label className="text-sm font-semibold">
                    Engineer explanation
                    <textarea
                      className="mt-1 min-h-20 w-full border border-foreground bg-background px-3 py-2 font-normal"
                      value={reviewExplanation}
                      onChange={event =>
                        setReviewExplanation(event.target.value)
                      }
                      placeholder="Explain any correction or acceptance decision…"
                    />
                  </label>
                </div>
              </div>
            )}
            {error && (
              <div className="flex gap-3 border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-none border-foreground">
            <CardHeader className="border-b border-foreground">
              <CardTitle>Estimated result</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {analysis ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-foreground p-4">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Estimated Face Angle
                      </p>
                      <p className="mt-2 text-4xl font-black">
                        {analysis.estimatedFaceAngle.toFixed(1)}°
                      </p>
                    </div>
                    <div className="border border-foreground p-4">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        AI Confidence
                      </p>
                      <p className="mt-2 text-4xl font-black">
                        {analysis.confidence}%
                      </p>
                      <Progress
                        value={analysis.confidence}
                        className="mt-3 h-2"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="border border-foreground p-3">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        AI Estimate
                      </p>
                      <p className="mt-2 text-2xl font-black">
                        {analysis.estimatedFaceAngle.toFixed(1)}°
                      </p>
                    </div>
                    <div className="border border-foreground p-3">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Engineer Adjusted
                      </p>
                      <p className="mt-2 text-2xl font-black">
                        {adjustedAngle
                          ? `${Number(adjustedAngle).toFixed(1)}°`
                          : "—"}
                      </p>
                    </div>
                    <div className="border border-foreground p-3">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Review Status
                      </p>
                      <p className="mt-2 text-lg font-black">{reviewStatus}</p>
                    </div>
                  </div>
                  <div className="space-y-3 text-sm">
                    <p className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="h-4 w-4 text-green-600" /> Crest
                      and toe geometry detected
                    </p>
                    <p className="flex items-center gap-2 font-semibold">
                      <Mountain className="h-4 w-4 text-red-500" /> Red:
                      representative face · Green: crest · Purple: toe
                    </p>
                    <p className="flex items-center gap-2 font-semibold">
                      <Compass className="h-4 w-4 text-sky-500" /> Blue: visible
                      berm traces · Yellow: boundaries
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Method used
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {analysis.method.map(item => (
                        <span
                          key={item}
                          className="border border-foreground px-2 py-1 text-xs"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <ScanLine className="mx-auto mb-3 h-8 w-8" />
                  <p>
                    Upload a photo and start the analysis to see the estimated
                    face angle.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-none border-amber-600 bg-amber-50/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="h-5 w-5" /> Engineering limitation
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-amber-950">
              {analysis?.disclaimer ??
                "A photograph does not provide a reliable scale, survey datum or full 3D geometry. The result is an AI-assisted preliminary estimate only. Verify with survey, drone photogrammetry, LiDAR or field measurements before geotechnical design, stability decisions or compliance acceptance."}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
