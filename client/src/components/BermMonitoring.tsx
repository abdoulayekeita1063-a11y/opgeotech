import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  FileDown,
  FileUp,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type {
  BermAnalysisInput,
  BermAnalysisResult,
  BermDxfDocument,
  BermEntity,
  BermSavedRecord,
  BermSavedSummary,
  BermSource,
  BermStatus,
} from "@shared/berm/types";
import { computeBermComparison } from "@shared/berm/comparison";
import { parseBermDxf } from "@shared/berm/dxf";
import { trpc } from "@/lib/trpc";
import { readOfflineDraft, saveOfflineDraft } from "@/lib/offlineStore";
import { exportBermMonitoringPdf } from "@/lib/bermReport";
import BermComparisonViewer from "@/components/BermComparisonViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel } from "@/components/ModuleHeader";

const MAX_DXF_BYTES = 10 * 1024 * 1024;
const MAX_ENTITIES = 4_000;
const MAX_VERTICES = 40_000;
const MAX_LOCAL_SNAPSHOTS = 25;
const HISTORY_KEY = "berm-monitoring-history";

type SourceName = "planned" | "asBuilt";
type LocalSnapshot = {
  localId: string;
  savedAt: number;
  input: BermAnalysisInput;
  result: BermAnalysisResult;
};

const INITIAL_INPUT: BermAnalysisInput = {
  metadata: {
    bermId: "",
    pit: "",
    bench: "",
    surveyDateMs: null,
    reviewer: "",
    comments: "",
  },
  planned: {
    document: null,
    layers: [],
    entityIds: [],
    unitsToMetres: null,
    crs: "",
    verticalDatum: "",
  },
  asBuilt: {
    document: null,
    layers: [],
    entityIds: [],
    unitsToMetres: null,
    crs: "",
    verticalDatum: "",
  },
  criteria: {
    minWidth: null,
    areaDeviationPct: null,
    horizontalDeviation: null,
    elevationDeviation: null,
    warningRatio: 0.8,
    siteApproved: false,
    requireElevation: false,
    surveyComplete: false,
    crsConfirmed: false,
  },
  widthBearing: null,
  sampleSpacing: 1,
};

const STATUS_STYLES: Record<BermStatus, string> = {
  Compliant: "border-emerald-700 bg-emerald-50 text-emerald-900",
  Warning: "border-amber-700 bg-amber-50 text-amber-900",
  "Non-Compliant": "border-red-700 bg-red-50 text-red-900",
  "Insufficient Data": "border-slate-500 bg-slate-100 text-slate-700",
};

function finite(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function metric(value: number | null | undefined, unit = "") {
  return finite(value)
    ? `${value!.toLocaleString(undefined, { maximumFractionDigits: 3 })}${unit}`
    : "Not available";
}

function percent(value: number | null | undefined) {
  return finite(value)
    ? `${value!.toLocaleString(undefined, { maximumFractionDigits: 3, signDisplay: "always" })}%`
    : "Not available";
}

function readOptionalNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: number | null) {
  if (!finite(value)) return "";
  const date = new Date(value!);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Explicitly maps a native YYYY-MM-DD date to midnight UTC, not browser-local time. */
function dateToUtcMs(value: string) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isInteger(part)))
    return null;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function countedVertices(document: BermDxfDocument | null) {
  return (
    document?.entities.reduce(
      (total, entity) => total + entity.points.length,
      0
    ) ?? 0
  );
}

function usableBoundaries(source: BermSource) {
  if (!source.document) return [];
  const selectedLayers = new Set(source.layers);
  const allowed = source.document.entities.filter(
    entity => entity.valid && entity.closed && selectedLayers.has(entity.layer)
  );
  return source.entityIds.length
    ? allowed.filter(entity => source.entityIds.includes(entity.id))
    : allowed;
}

function sourceDiagnostics(source: BermSource, label: string) {
  const notes: string[] = [];
  if (!source.document) notes.push(`${label} DXF has not been imported.`);
  if (source.document && !source.layers.length)
    notes.push(`${label} DXF has no selected layer.`);
  if (source.document && !usableBoundaries(source).length)
    notes.push(
      `${label} has no valid closed boundary or 3DFACE selected for comparison.`
    );
  if (!finite(source.unitsToMetres) || source.unitsToMetres! <= 0)
    notes.push(
      `${label} requires a positive drawing-unit-to-metre conversion.`
    );
  if (!source.crs.trim()) notes.push(`${label} CRS is not supplied.`);
  if (!source.verticalDatum.trim())
    notes.push(
      `${label} vertical datum is not supplied (needed if elevation is reviewed).`
    );
  return notes;
}

function sourceWithinGuard(source: BermSource) {
  if (!source.document) return true;
  return (
    source.document.originalEntityCount <= MAX_ENTITIES &&
    countedVertices(source.document) <= MAX_VERTICES
  );
}

function validateInput(input: BermAnalysisInput) {
  const messages: string[] = [];
  const namedValues: Array<[string, number | null]> = [
    ["Minimum width", input.criteria.minWidth],
    ["Area deviation", input.criteria.areaDeviationPct],
    ["Horizontal deviation", input.criteria.horizontalDeviation],
    ["Elevation deviation", input.criteria.elevationDeviation],
  ];
  namedValues.forEach(([name, value]) => {
    if (value !== null && (!Number.isFinite(value) || value < 0))
      messages.push(`${name} must be a finite value of zero or greater.`);
  });
  if (
    !Number.isFinite(input.sampleSpacing) ||
    input.sampleSpacing < 0.01 ||
    input.sampleSpacing > 1_000
  )
    messages.push("Sample spacing must be a finite value from 0.01 to 1,000 m.");
  if (
    !Number.isFinite(input.criteria.warningRatio) ||
    input.criteria.warningRatio < 0.01 ||
    input.criteria.warningRatio > 1
  )
    messages.push("Warning ratio must be from 0.01 through 1.");
  if (
    input.widthBearing !== null &&
    (!Number.isFinite(input.widthBearing) ||
      input.widthBearing < 0 ||
      input.widthBearing > 360)
  )
    messages.push(
      "Width bearing must be from 0° through 360° clockwise from North."
    );
  if (
    input.criteria.requireElevation &&
    (input.criteria.elevationDeviation === null ||
      input.criteria.elevationDeviation < 0)
  )
    messages.push(
      "An elevation-deviation threshold is required when elevation is required."
    );
  if (!input.planned.document) messages.push("Planned DXF upload is required.");
  if (!input.asBuilt.document)
    messages.push("As-Built DXF upload is required.");
  if (!sourceWithinGuard(input.planned))
    messages.push(
      `Planned DXF exceeds the browser guard of ${MAX_ENTITIES.toLocaleString()} entities or ${MAX_VERTICES.toLocaleString()} vertices.`
    );
  if (!sourceWithinGuard(input.asBuilt))
    messages.push(
      `As-Built DXF exceeds the browser guard of ${MAX_ENTITIES.toLocaleString()} entities or ${MAX_VERTICES.toLocaleString()} vertices.`
    );
  return messages;
}

function validateServerSave(input: BermAnalysisInput) {
  const messages = validateInput(input);
  if (!input.metadata.bermId.trim())
    messages.push("Berm ID is required before saving to server.");
  if (!input.metadata.pit.trim())
    messages.push("Pit is required before saving to server.");
  if (!input.metadata.bench.trim())
    messages.push("Bench is required before saving to server.");
  return messages;
}

function StatusPill({ status }: { status: BermStatus }) {
  return (
    <span
      className={`inline-flex border px-2 py-1 text-xs font-bold ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

function CheckBoxField({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-2 border border-foreground/25 bg-background px-3 py-2 text-sm leading-snug"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <span>{children}</span>
    </label>
  );
}

function SourcePanel({
  sourceName,
  label,
  source,
  onChange,
}: {
  sourceName: SourceName;
  label: string;
  source: BermSource;
  onChange: (source: BermSource) => void;
}) {
  const [isParsing, setIsParsing] = useState(false);
  const candidates = useMemo(
    () => usableBoundaries({ ...source, entityIds: [] }),
    [source]
  );
  const selectedCandidates = useMemo(() => usableBoundaries(source), [source]);
  const document = source.document;
  const vertices = countedVertices(document);
  const guardExceeded = !sourceWithinGuard(source);
  const missing = sourceDiagnostics(source, label);

  const clear = () =>
    onChange({
      ...source,
      document: null,
      layers: [],
      entityIds: [],
      unitsToMetres: null,
    });
  const parse = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_DXF_BYTES) {
      clear();
      toast.error(`${label} DXF is larger than the 10 MB upload limit.`);
      return;
    }
    setIsParsing(true);
    try {
      const parsed = parseBermDxf(await file.text(), file.name);
      if (
        !parsed ||
        !Array.isArray(parsed.layers) ||
        !Array.isArray(parsed.entities)
      )
        throw new Error("DXF parser returned no usable document.");
      onChange({
        ...source,
        document: parsed,
        layers: [...parsed.layers],
        entityIds: [],
        unitsToMetres:
          finite(parsed.unitScale) && parsed.unitScale! > 0
            ? parsed.unitScale
            : null,
      });
      toast.success(`${label} DXF parsed locally.`);
    } catch (error) {
      clear();
      toast.error(
        `${label} DXF could not be parsed: ${error instanceof Error ? error.message : "unsupported DXF content"}`
      );
    } finally {
      setIsParsing(false);
    }
  };

  const selectedLayerSet = new Set(source.layers);
  const invalidOrOpen =
    document?.entities.filter(entity => !entity.valid || !entity.closed)
      .length ?? 0;
  const noElevation =
    document?.entities.filter(entity => !entity.hasElevation).length ?? 0;

  return (
    <section
      className="border border-foreground bg-background"
      aria-labelledby={`${sourceName}-dxf-heading`}
    >
      <div className="flex flex-col gap-3 border-b border-foreground bg-secondary px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div id={`${sourceName}-dxf-heading`} className="font-bold">
            {label} DXF source
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Original E/N/RL values are retained in parsed geometry. No file
            bytes are persisted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex h-9 items-center gap-2 border border-foreground bg-background px-3 text-sm font-medium">
            {isParsing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            <span>{document ? "Replace DXF" : "Import DXF"}</span>
            <input
              aria-label={`Import ${label} DXF`}
              type="file"
              accept=".dxf,application/dxf"
              className="sr-only"
              disabled={isParsing}
              onChange={event => {
                void parse(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {document && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-none border-foreground"
              onClick={clear}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {!document ? (
        <div className="p-4 text-sm text-muted-foreground">
          {label} DXF is required. Upload a local .dxf file (maximum 10 MB);
          parsing and comparison remain in this browser.
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {guardExceeded && (
            <div
              role="alert"
              className="flex gap-2 border border-amber-700 bg-amber-50 p-3 text-sm text-amber-950"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Browser guard reached.</strong> This document has{" "}
                {document.originalEntityCount.toLocaleString()} entities and{" "}
                {vertices.toLocaleString()} vertices. Comparison is disabled
                above {MAX_ENTITIES.toLocaleString()} entities or{" "}
                {MAX_VERTICES.toLocaleString()} vertices; export a narrower DXF
                extent or fewer layers.
              </span>
            </div>
          )}
          <div className="overflow-x-auto border border-foreground/30">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="border-b border-foreground bg-secondary swiss-label">
                <tr>
                  <th className="px-3 py-2">Filename</th>
                  <th className="px-3 py-2 text-right">Entities</th>
                  <th className="px-3 py-2 text-right">Vertices</th>
                  <th className="px-3 py-2 text-right">Layers</th>
                  <th className="px-3 py-2">DXF units</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 font-medium">{document.filename}</td>
                  <td className="px-3 py-2 text-right swiss-number">
                    {document.originalEntityCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right swiss-number">
                    {vertices.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right swiss-number">
                    {document.layers.length}
                  </td>
                  <td className="px-3 py-2">
                    {document.unitName || "Missing INSUNITS"}
                    {finite(document.unitScale)
                      ? ` (1 unit = ${document.unitScale} m)`
                      : ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label
                htmlFor={`${sourceName}-layers`}
                className="swiss-label mb-1.5 block"
              >
                DXF layer selection
              </Label>
              <select
                id={`${sourceName}-layers`}
                multiple
                size={Math.min(Math.max(document.layers.length, 3), 8)}
                className="w-full border border-foreground bg-background p-2 text-sm"
                value={source.layers}
                onChange={event => {
                  const layers = Array.from(
                    event.currentTarget.selectedOptions,
                    option => option.value
                  );
                  onChange({ ...source, layers, entityIds: [] });
                }}
              >
                {document.layers.map(layer => (
                  <option key={layer} value={layer}>
                    {layer}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Use Ctrl/Cmd-click for multiple layers. Boundary list updates to
                these layers.
              </p>
            </div>
            <div>
              <Label
                htmlFor={`${sourceName}-entities`}
                className="swiss-label mb-1.5 block"
              >
                Closed boundary / entity selection
              </Label>
              <select
                id={`${sourceName}-entities`}
                multiple
                size={Math.min(Math.max(candidates.length, 3), 8)}
                className="w-full border border-foreground bg-background p-2 text-sm"
                value={source.entityIds}
                onChange={event =>
                  onChange({
                    ...source,
                    entityIds: Array.from(
                      event.currentTarget.selectedOptions,
                      option => option.value
                    ),
                  })
                }
                disabled={!candidates.length}
              >
                {candidates.map(entity => (
                  <option key={entity.id} value={entity.id}>
                    {entity.id} · {entity.layer} · {entity.kind} ·{" "}
                    {entity.points.length} vertices
                    {entity.hasElevation ? " · Z" : " · 2D"}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                No entity selected means{" "}
                <strong>
                  all {candidates.length} valid closed boundaries/faces
                </strong>{" "}
                on selected layers. Open, invalid, and unsupported geometry is
                excluded.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label
                htmlFor={`${sourceName}-unit-factor`}
                className="swiss-label mb-1.5 block"
              >
                Drawing unit → metres *
              </Label>
              <Input
                id={`${sourceName}-unit-factor`}
                type="number"
                min="0"
                step="any"
                value={source.unitsToMetres ?? ""}
                placeholder={
                  finite(document.unitScale)
                    ? String(document.unitScale)
                    : "Required"
                }
                onChange={event =>
                  onChange({
                    ...source,
                    unitsToMetres: readOptionalNumber(event.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {finite(document.unitScale)
                  ? `Defaulted from INSUNITS: 1 drawing unit = ${document.unitScale} m.`
                  : "INSUNITS is missing: enter the surveyed conversion explicitly."}
              </p>
            </div>
            <div>
              <Label
                htmlFor={`${sourceName}-crs`}
                className="swiss-label mb-1.5 block"
              >
                CRS *
              </Label>
              <Input
                id={`${sourceName}-crs`}
                value={source.crs}
                onChange={event =>
                  onChange({ ...source, crs: event.target.value })
                }
                placeholder="e.g. EPSG:32735 / mine grid"
              />
            </div>
            <div>
              <Label
                htmlFor={`${sourceName}-datum`}
                className="swiss-label mb-1.5 block"
              >
                Vertical datum *
              </Label>
              <Input
                id={`${sourceName}-datum`}
                value={source.verticalDatum}
                onChange={event =>
                  onChange({ ...source, verticalDatum: event.target.value })
                }
                placeholder="e.g. Mine RL / AHD"
              />
            </div>
          </div>

          <div className="grid gap-px border border-foreground/30 bg-foreground text-xs sm:grid-cols-3">
            <div className="bg-background p-2">
              <span className="swiss-label block">Valid closed candidates</span>
              <strong>{candidates.length}</strong> total ·{" "}
              <strong>{selectedCandidates.length}</strong> active
            </div>
            <div className="bg-background p-2">
              <span className="swiss-label block">Open / invalid geometry</span>
              {invalidOrOpen} excluded from boundary comparison
            </div>
            <div className="bg-background p-2">
              <span className="swiss-label block">Entities without Z</span>
              {noElevation} (2D only; not terrain/3D)
            </div>
          </div>
          {(document.diagnostics.length > 0 || missing.length > 0) && (
            <div className="border border-slate-300 bg-slate-50 p-3 text-xs">
              <div className="mb-1 font-bold">
                Parser diagnostics and missing data
              </div>
              <ul className="list-disc space-y-1 pl-5">
                {[...missing, ...document.diagnostics].map((note, index) => (
                  <li key={`${note}-${index}`}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ResultMetric({
  label,
  value,
  method,
}: {
  label: string;
  value: string;
  method: string;
}) {
  return (
    <div className="bg-background p-3">
      <div className="swiss-label min-h-8">{label}</div>
      <div className="swiss-number mt-1 text-lg font-bold leading-tight">
        {value}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {method}
      </p>
    </div>
  );
}

export default function BermMonitoring() {
  const [input, setInput] = useState<BermAnalysisInput>(INITIAL_INPUT);
  const [result, setResult] = useState<BermAnalysisResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfFilename, setPdfFilename] = useState("berm-monitoring-report");
  const [localHistory, setLocalHistory] = useState<LocalSnapshot[]>([]);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [requestedServerId, setRequestedServerId] = useState<number | null>(
    null
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const utils = trpc.useUtils();
  const serverHistory = trpc.berm.list.useQuery(undefined, { retry: false });
  const serverRecord = trpc.berm.get.useQuery(
    { id: requestedServerId ?? 1 },
    { enabled: requestedServerId !== null, retry: false }
  );
  const saveToServer = trpc.berm.save.useMutation({
    onSuccess: response => {
      setResult(response.result as BermAnalysisResult);
      void utils.berm.list.invalidate();
      toast.success(`Comparison saved to server (record ${response.id}).`);
    },
    onError: error => toast.error(`Server save failed: ${error.message}`),
  });
  const removeServer = trpc.berm.delete.useMutation({
    onSuccess: () => {
      void utils.berm.list.invalidate();
      toast.success("Server comparison removed.");
    },
    onError: error =>
      toast.error(`Could not remove server record: ${error.message}`),
  });

  const invalidateResult = () => setResult(null);
  const patchInput = (
    patch: (current: BermAnalysisInput) => BermAnalysisInput
  ) => {
    setInput(current => patch(current));
    invalidateResult();
  };
  const updateSource = (name: SourceName, source: BermSource) =>
    patchInput(current => ({ ...current, [name]: source }));
  const validationMessages = useMemo(() => validateInput(input), [input]);
  const sourceNotes = useMemo(
    () => [
      ...sourceDiagnostics(input.planned, "Planned"),
      ...sourceDiagnostics(input.asBuilt, "As-Built"),
    ],
    [input.asBuilt, input.planned]
  );
  const widthBearingMissing = input.widthBearing === null;

  useEffect(() => {
    void readOfflineDraft<LocalSnapshot[]>(HISTORY_KEY)
      .then(stored => {
        if (Array.isArray(stored))
          setLocalHistory(
            stored
              .filter(item => item && item.input && item.result)
              .slice(0, MAX_LOCAL_SNAPSHOTS)
          );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    if (!serverRecord.data) return;
    const record = serverRecord.data as BermSavedRecord;
    setInput(record.input);
    setResult(record.result);
    setRequestedServerId(null);
    toast.success(`Loaded server record ${record.id}.`);
  }, [serverRecord.data]);

  const runComparison = async () => {
    if (validationMessages.length) {
      toast.error(
        "Resolve the highlighted input requirements before computing."
      );
      return;
    }
    setCalculating(true);
    try {
      await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      const next = computeBermComparison(input);
      setResult(next);
      toast.success("Local Berm comparison complete.");
    } catch (error) {
      toast.error(
        `Comparison failed: ${error instanceof Error ? error.message : "geometry could not be evaluated"}`
      );
    } finally {
      setCalculating(false);
    }
  };

  const saveLocalSnapshot = async () => {
    if (!result) return;
    const snapshot: LocalSnapshot = {
      localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: Date.now(),
      input,
      result,
    };
    const next = [snapshot, ...localHistory].slice(0, MAX_LOCAL_SNAPSHOTS);
    try {
      await saveOfflineDraft(HISTORY_KEY, next);
      setLocalHistory(next);
      toast.success("Local-only snapshot saved on this device.");
    } catch {
      toast.error("This browser could not save the local snapshot.");
    }
  };

  const downloadReport = async () => {
    if (!result) return;
    setExporting(true);
    try {
      await exportBermMonitoringPdf({ input, result, filename: pdfFilename });
      toast.success("PDF report downloaded.");
    } catch {
      toast.error("PDF report could not be generated.");
    } finally {
      setExporting(false);
    }
  };

  const savedSummaries = (serverHistory.data ?? []) as BermSavedSummary[];

  return (
    <div className="max-w-7xl space-y-7">
      <div className="grid gap-4 border-b-2 border-foreground pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="swiss-square" />
            <span className="swiss-label">
              DXF planned / As-Built assessment
            </span>
          </div>
          <h2 className="text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">
            Berm Monitoring
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Compare selected closed DXF berm boundaries locally. 2D footprint
            calculations and sampled transverse widths are clearly distinguished
            from boundary-only elevation checks and eligible 3D surface
            coverage.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 border border-foreground px-3 py-2 text-left text-xs font-medium hover:bg-secondary"
          onClick={() => setHistoryOpen(open => !open)}
          aria-expanded={historyOpen}
        >
          {historyOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}{" "}
          History · {savedSummaries.length} server / {localHistory.length} local
        </button>
      </div>

      {historyOpen && (
        <section
          className="border border-foreground bg-background"
          aria-labelledby="berm-history-heading"
        >
          <div className="border-b border-foreground bg-secondary px-4 py-3">
            <h3 id="berm-history-heading" className="font-bold">
              Saved comparisons
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Local snapshots are only on this device and are never synchronized
              automatically. Server records require a manual save.
            </p>
          </div>
          <div className="grid gap-0 lg:grid-cols-2">
            <div className="border-b border-foreground p-4 lg:border-b-0 lg:border-r">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <span className="swiss-label">Server records</span>
                  <p className="text-xs text-muted-foreground">
                    Authenticated and manually saved.
                  </p>
                </div>
                <Cloud className="h-4 w-4" />
              </div>
              {serverHistory.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading server history…
                </p>
              ) : serverHistory.error ? (
                <p className="text-sm text-muted-foreground">
                  Server history is unavailable: {serverHistory.error.message}
                </p>
              ) : !savedSummaries.length ? (
                <p className="text-sm text-muted-foreground">
                  No server records yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {savedSummaries.map(summary => (
                    <div
                      key={summary.id}
                      className="flex flex-wrap items-center justify-between gap-2 border border-foreground/30 p-2"
                    >
                      <div>
                        <div className="font-medium">
                          {summary.bermId || "Unnamed berm"} ·{" "}
                          {summary.pit || "No pit"} /{" "}
                          {summary.bench || "No bench"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Survey{" "}
                          {dateValue(summary.surveyDateMs) || "not recorded"} ·
                          saved {new Date(summary.createdAtMs).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill status={summary.status} />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-none border-foreground"
                          onClick={() => setRequestedServerId(summary.id)}
                        >
                          Load
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-none border-foreground text-red-700"
                          disabled={removeServer.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete server record ${summary.id}? This cannot be undone.`
                              )
                            )
                              removeServer.mutate({ id: summary.id });
                          }}
                          aria-label={`Delete server record ${summary.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4">
              <span className="swiss-label">Local-only snapshots</span>
              <p className="mb-3 text-xs text-muted-foreground">
                IndexedDB cache; no raw DXF bytes and no upload.
              </p>
              {!localHistory.length ? (
                <p className="text-sm text-muted-foreground">
                  No local snapshots saved.
                </p>
              ) : (
                <div className="space-y-2">
                  {localHistory.map(snapshot => (
                    <div
                      key={snapshot.localId}
                      className="flex flex-wrap items-center justify-between gap-2 border border-foreground/30 p-2"
                    >
                      <div>
                        <div className="font-medium">
                          {snapshot.input.metadata.bermId || "Unnamed berm"} ·{" "}
                          {snapshot.input.metadata.pit || "No pit"} /{" "}
                          {snapshot.input.metadata.bench || "No bench"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Saved locally{" "}
                          {new Date(snapshot.savedAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill status={snapshot.result.status} />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-none border-foreground"
                          onClick={() => {
                            setInput(snapshot.input);
                            setResult(snapshot.result);
                            toast.success("Loaded local-only snapshot.");
                          }}
                        >
                          Load
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-none border-foreground text-red-700"
                          onClick={() => {
                            const next = localHistory.filter(
                              item => item.localId !== snapshot.localId
                            );
                            void saveOfflineDraft(HISTORY_KEY, next);
                            setLocalHistory(next);
                          }}
                          aria-label={`Delete local snapshot for ${snapshot.input.metadata.bermId || "unnamed berm"}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.67fr)]">
        <div className="space-y-6">
          <section
            className="border border-foreground bg-background"
            aria-labelledby="berm-record-heading"
          >
            <div className="border-b border-foreground bg-secondary px-4 py-3">
              <h3 id="berm-record-heading" className="font-bold">
                Survey record and review
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Blank criteria remain unconfigured; no approval thresholds are
                presumed.
              </p>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <Label htmlFor="berm-id" className="swiss-label mb-1.5 block">
                  Berm ID
                </Label>
                <Input
                  id="berm-id"
                  value={input.metadata.bermId}
                  onChange={event =>
                    patchInput(current => ({
                      ...current,
                      metadata: {
                        ...current.metadata,
                        bermId: event.target.value,
                      },
                    }))
                  }
                  placeholder="e.g. E-P2-B1240-03"
                />
              </div>
              <div>
                <Label htmlFor="berm-pit" className="swiss-label mb-1.5 block">
                  Pit
                </Label>
                <Input
                  id="berm-pit"
                  value={input.metadata.pit}
                  onChange={event =>
                    patchInput(current => ({
                      ...current,
                      metadata: {
                        ...current.metadata,
                        pit: event.target.value,
                      },
                    }))
                  }
                  placeholder="e.g. East pit"
                />
              </div>
              <div>
                <Label
                  htmlFor="berm-bench"
                  className="swiss-label mb-1.5 block"
                >
                  Bench
                </Label>
                <Input
                  id="berm-bench"
                  value={input.metadata.bench}
                  onChange={event =>
                    patchInput(current => ({
                      ...current,
                      metadata: {
                        ...current.metadata,
                        bench: event.target.value,
                      },
                    }))
                  }
                  placeholder="e.g. 1240 RL"
                />
              </div>
              <div>
                <Label
                  htmlFor="berm-survey-date"
                  className="swiss-label mb-1.5 block"
                >
                  Survey date
                </Label>
                <Input
                  id="berm-survey-date"
                  type="date"
                  value={dateValue(input.metadata.surveyDateMs)}
                  onChange={event =>
                    patchInput(current => ({
                      ...current,
                      metadata: {
                        ...current.metadata,
                        surveyDateMs: dateToUtcMs(event.target.value),
                      },
                    }))
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Stored as explicit 00:00 UTC milliseconds.
                </p>
              </div>
              <div>
                <Label
                  htmlFor="berm-reviewer"
                  className="swiss-label mb-1.5 block"
                >
                  Reviewer
                </Label>
                <Input
                  id="berm-reviewer"
                  value={input.metadata.reviewer}
                  onChange={event =>
                    patchInput(current => ({
                      ...current,
                      metadata: {
                        ...current.metadata,
                        reviewer: event.target.value,
                      },
                    }))
                  }
                  placeholder="Name / role"
                />
              </div>
              <div className="md:col-span-2 xl:col-span-1">
                <Label
                  htmlFor="berm-comments"
                  className="swiss-label mb-1.5 block"
                >
                  Reviewer comments
                </Label>
                <Textarea
                  id="berm-comments"
                  value={input.metadata.comments}
                  onChange={event =>
                    patchInput(current => ({
                      ...current,
                      metadata: {
                        ...current.metadata,
                        comments: event.target.value,
                      },
                    }))
                  }
                  placeholder="Limitations, review notes, actions…"
                  className="min-h-20"
                />
              </div>
            </div>
          </section>

          <SourcePanel
            sourceName="planned"
            label="Planned"
            source={input.planned}
            onChange={source => updateSource("planned", source)}
          />
          <SourcePanel
            sourceName="asBuilt"
            label="As-Built"
            source={input.asBuilt}
            onChange={source => updateSource("asBuilt", source)}
          />
        </div>

        <aside className="space-y-6 xl:sticky xl:top-4 xl:self-start">
          <section
            className="border border-foreground bg-background"
            aria-labelledby="berm-criteria-heading"
          >
            <div className="border-b border-foreground bg-secondary px-4 py-3">
              <h3 id="berm-criteria-heading" className="font-bold">
                Acceptance criteria and method
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter only site-approved thresholds. Blank fields are reported
                as unconfigured.
              </p>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div>
                  <Label
                    htmlFor="min-width"
                    className="swiss-label mb-1.5 block"
                  >
                    Minimum width (m)
                  </Label>
                  <Input
                    id="min-width"
                    type="number"
                    min="0"
                    step="any"
                    value={input.criteria.minWidth ?? ""}
                    placeholder="Unconfigured"
                    onChange={event =>
                      patchInput(current => ({
                        ...current,
                        criteria: {
                          ...current.criteria,
                          minWidth: readOptionalNumber(event.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label
                    htmlFor="area-deviation"
                    className="swiss-label mb-1.5 block"
                  >
                    Area deviation (%)
                  </Label>
                  <Input
                    id="area-deviation"
                    type="number"
                    min="0"
                    step="any"
                    value={input.criteria.areaDeviationPct ?? ""}
                    placeholder="Unconfigured"
                    onChange={event =>
                      patchInput(current => ({
                        ...current,
                        criteria: {
                          ...current.criteria,
                          areaDeviationPct: readOptionalNumber(
                            event.target.value
                          ),
                        },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label
                    htmlFor="horizontal-deviation"
                    className="swiss-label mb-1.5 block"
                  >
                    Horizontal deviation (m)
                  </Label>
                  <Input
                    id="horizontal-deviation"
                    type="number"
                    min="0"
                    step="any"
                    value={input.criteria.horizontalDeviation ?? ""}
                    placeholder="Unconfigured"
                    onChange={event =>
                      patchInput(current => ({
                        ...current,
                        criteria: {
                          ...current.criteria,
                          horizontalDeviation: readOptionalNumber(
                            event.target.value
                          ),
                        },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label
                    htmlFor="elevation-deviation"
                    className="swiss-label mb-1.5 block"
                  >
                    Elevation deviation (m)
                  </Label>
                  <Input
                    id="elevation-deviation"
                    type="number"
                    min="0"
                    step="any"
                    disabled={!input.criteria.requireElevation}
                    value={input.criteria.elevationDeviation ?? ""}
                    placeholder={
                      input.criteria.requireElevation
                        ? "Required"
                        : "Not required"
                    }
                    onChange={event =>
                      patchInput(current => ({
                        ...current,
                        criteria: {
                          ...current.criteria,
                          elevationDeviation: readOptionalNumber(
                            event.target.value
                          ),
                        },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label
                    htmlFor="warning-ratio"
                    className="swiss-label mb-1.5 block"
                  >
                    Warning ratio
                  </Label>
                  <Input
                    id="warning-ratio"
                    type="number"
                    min="0.01"
                    max="1"
                    step="0.01"
                    value={input.criteria.warningRatio}
                    onChange={event =>
                      patchInput(current => ({
                        ...current,
                        criteria: {
                          ...current.criteria,
                          warningRatio:
                            readOptionalNumber(event.target.value) ?? 0,
                        },
                      }))
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Default 0.80: warning begins at approximately 80% of an
                    entered threshold.
                  </p>
                </div>
                <div>
                  <Label
                    htmlFor="width-bearing"
                    className="swiss-label mb-1.5 block"
                  >
                    Width bearing (°)
                  </Label>
                  <Input
                    id="width-bearing"
                    type="number"
                    min="0"
                    max="360"
                    step="any"
                    value={input.widthBearing ?? ""}
                    placeholder="Required for width KPI"
                    onChange={event =>
                      patchInput(current => ({
                        ...current,
                        widthBearing: readOptionalNumber(event.target.value),
                      }))
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Transverse direction, clockwise from North.
                  </p>
                </div>
                <div>
                  <Label
                    htmlFor="sample-spacing"
                    className="swiss-label mb-1.5 block"
                  >
                    Sample spacing (m) *
                  </Label>
                  <Input
                    id="sample-spacing"
                    type="number"
                    min="0.001"
                    step="any"
                    value={input.sampleSpacing}
                    onChange={event =>
                      patchInput(current => ({
                        ...current,
                        sampleSpacing:
                          readOptionalNumber(event.target.value) ?? 0,
                      }))
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Width minimum is sampled, not continuous/exact.
                  </p>
                </div>
              </div>
              <div className="grid gap-2">
                <CheckBoxField
                  id="require-elevation"
                  checked={input.criteria.requireElevation}
                  onChange={checked =>
                    patchInput(current => ({
                      ...current,
                      criteria: {
                        ...current.criteria,
                        requireElevation: checked,
                        elevationDeviation: checked
                          ? current.criteria.elevationDeviation
                          : current.criteria.elevationDeviation,
                      },
                    }))
                  }
                >
                  Require an elevation-deviation threshold and evaluate
                  available boundary elevations.
                </CheckBoxField>
                <CheckBoxField
                  id="survey-complete"
                  checked={input.criteria.surveyComplete}
                  onChange={checked =>
                    patchInput(current => ({
                      ...current,
                      criteria: {
                        ...current.criteria,
                        surveyComplete: checked,
                      },
                    }))
                  }
                >
                  Survey complete (review confirmation).
                </CheckBoxField>
                <CheckBoxField
                  id="crs-confirmed"
                  checked={input.criteria.crsConfirmed}
                  onChange={checked =>
                    patchInput(current => ({
                      ...current,
                      criteria: { ...current.criteria, crsConfirmed: checked },
                    }))
                  }
                >
                  CRS and vertical datum confirmed for planned and As-Built
                  sources.
                </CheckBoxField>
                <CheckBoxField
                  id="site-approved"
                  checked={input.criteria.siteApproved}
                  onChange={checked =>
                    patchInput(current => ({
                      ...current,
                      criteria: { ...current.criteria, siteApproved: checked },
                    }))
                  }
                >
                  Site-approved criteria confirmed.
                </CheckBoxField>
              </div>
              <div className="border-l-4 border-sky-700 bg-sky-50 p-3 text-xs leading-relaxed text-sky-950">
                <strong>Method limits:</strong> planned/As-Built areas are 2D
                planimetric footprints; width is a sampled transverse
                measurement using the entered bearing; horizontal and elevation
                deviations are boundary-only. 2D data is never presented as
                terrain or 3D surface area.
              </div>
            </div>
          </section>

          {(validationMessages.length > 0 ||
            sourceNotes.length > 0 ||
            widthBearingMissing) && (
            <section
              className="border border-amber-700 bg-amber-50 p-4 text-sm text-amber-950"
              aria-live="polite"
            >
              <div className="mb-2 flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4" />
                Input completeness
              </div>
              <ul className="list-disc space-y-1 pl-5 text-xs">
                {validationMessages.map(message => (
                  <li key={message}>{message}</li>
                ))}
                {sourceNotes
                  .filter(note => !validationMessages.includes(note))
                  .map(note => (
                    <li key={note}>{note}</li>
                  ))}
                {widthBearingMissing && (
                  <li>
                    Width bearing is blank: comparison can run, but width KPI
                    must remain unavailable/insufficient rather than inferred.
                  </li>
                )}
              </ul>
            </section>
          )}

          <Button
            type="button"
            className="w-full rounded-none bg-slate-950 py-6 font-bold uppercase tracking-wide hover:bg-slate-800"
            disabled={calculating || validationMessages.length > 0}
            onClick={() => {
              void runComparison();
            }}
          >
            {calculating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Computing local
                comparison…
              </>
            ) : (
              "Compute local comparison"
            )}
          </Button>
          <p className="-mt-3 text-center text-xs text-muted-foreground">
            Pure local geometry computation. It does not create a server record.
          </p>
        </aside>
      </div>

      <section aria-labelledby="berm-results-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel>Comparison result</SectionLabel>
            <h3 id="berm-results-heading" className="text-xl font-bold">
              Measured KPIs and acceptance checks
            </h3>
          </div>
          {result && <StatusPill status={result.status} />}
        </div>
        {!result ? (
          <div className="border border-dashed border-muted-foreground/50 px-6 py-12 text-center text-sm text-muted-foreground">
            Import both DXFs, select layers/boundaries, set conversion and
            review data, then compute. Any input edit intentionally invalidates
            a previous result to prevent stale reports.
          </div>
        ) : (
          <div className="space-y-5">
            <div className={`border p-4 ${STATUS_STYLES[result.status]}`}>
              <div className="swiss-label !text-current">Overall result</div>
              <div className="mt-1 text-2xl font-extrabold">
                {result.status}
              </div>
              <p className="mt-1 text-sm">
                {result.status === "Insufficient Data"
                  ? "Review diagnostics and missing survey/criteria fields; the comparison does not claim compliance."
                  : "Review each individual check and documented method limitation before acceptance."}
              </p>
            </div>

            <div className="grid gap-px border border-foreground bg-foreground sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <ResultMetric
                label="Planned footprint area"
                value={metric(result.plannedArea, " m²")}
                method="2D planimetry"
              />
              <ResultMetric
                label="As-Built footprint area"
                value={metric(result.asBuiltArea, " m²")}
                method="2D footprint; not terrain"
              />
              <ResultMetric
                label="Area deviation"
                value={percent(result.areaDeviationPct)}
                method={`Absolute ${metric(result.absoluteAreaDifference, " m²")}`}
              />
              <ResultMetric
                label="Minimum sampled width"
                value={metric(result.minimumWidth, " m")}
                method={`${input.sampleSpacing} m samples; not continuous exact min`}
              />
              <ResultMetric
                label="Mean widths"
                value={`${metric(result.plannedWidth, " m")} / ${metric(result.asBuiltWidth, " m")}`}
                method="Planned / As-Built sampled transverse width"
              />
              <ResultMetric
                label="Max horizontal deviation"
                value={metric(result.horizontalDeviation, " m")}
                method="Boundary-only horizontal comparison"
              />
              <ResultMetric
                label="Max elevation deviation"
                value={metric(result.elevationDeviation, " m")}
                method="Boundary-only; no inferred terrain"
              />
              <ResultMetric
                label="Overlap / missing / excess"
                value={`${metric(result.overlapArea, " m²")} / ${metric(result.missingArea, " m²")} / ${metric(result.excessArea, " m²")}`}
                method="2D polygon overlay areas"
              />
              <ResultMetric
                label="Eligible true 3D area"
                value={metric(result.asBuiltSurfaceArea3D, " m²")}
                method="Only valid non-overlapping 3DFACE coverage"
              />
            </div>

            <BermComparisonViewer input={input} result={result} />

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.55fr)]">
              <section className="border border-foreground">
                <div className="border-b border-foreground bg-secondary px-4 py-3 font-bold">
                  Per-criterion checks
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-foreground swiss-label">
                      <tr>
                        <th className="px-3 py-2">Check</th>
                        <th className="px-3 py-2">Measured</th>
                        <th className="px-3 py-2">Criterion</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Explanation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.checks.length ? (
                        result.checks.map((check, index) => (
                          <tr
                            key={`${check.name}-${index}`}
                            className="border-b border-foreground/20 align-top"
                          >
                            <td className="px-3 py-2 font-medium">
                              {check.name}
                            </td>
                            <td className="px-3 py-2 swiss-number">
                              {check.measured}
                            </td>
                            <td className="px-3 py-2">{check.criterion}</td>
                            <td className="px-3 py-2">
                              <StatusPill status={check.status} />
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {check.explanation}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-6 text-center text-muted-foreground"
                          >
                            No check items returned by the comparison engine.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="space-y-5">
                <div className="border border-foreground">
                  <div className="border-b border-foreground bg-secondary px-4 py-3 font-bold">
                    Issues requiring review
                  </div>
                  {result.issues.length ? (
                    <ul className="list-disc space-y-2 p-4 pl-8 text-sm">
                      {result.issues.map((issue, index) => (
                        <li key={`${issue}-${index}`}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">
                      No issue items were returned.
                    </p>
                  )}
                </div>
                <div className="border border-foreground">
                  <div className="border-b border-foreground bg-secondary px-4 py-3 font-bold">
                    Method notes
                  </div>
                  {result.methodNotes.length ? (
                    <ul className="list-disc space-y-2 p-4 pl-8 text-sm text-muted-foreground">
                      {result.methodNotes.map((note, index) => (
                        <li key={`${note}-${index}`}>{note}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">
                      No method notes were returned.
                    </p>
                  )}
                </div>
              </section>
            </div>

            <section className="grid gap-4 border border-foreground bg-secondary p-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <Label
                  htmlFor="berm-pdf-filename"
                  className="swiss-label mb-1.5 block"
                >
                  PDF filename
                </Label>
                <Input
                  id="berm-pdf-filename"
                  value={pdfFilename}
                  onChange={event => setPdfFilename(event.target.value)}
                  placeholder="berm-monitoring-report"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Downloads a real PDF with inputs, criteria, statuses,
                  diagnostics, reviewer data, and static measured plot.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none border-foreground"
                  disabled={exporting}
                  onClick={() => {
                    void downloadReport();
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {exporting ? "Creating PDF…" : "Download PDF"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none border-foreground"
                  onClick={() => {
                    void saveLocalSnapshot();
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Save locally
                </Button>
                <Button
                  type="button"
                  className="rounded-none"
                  disabled={!isOnline || saveToServer.isPending}
                  onClick={() => saveToServer.mutate({ input })}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saveToServer.isPending
                    ? "Saving…"
                    : isOnline
                      ? "Save to server"
                      : "Offline — server save unavailable"}
                </Button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
