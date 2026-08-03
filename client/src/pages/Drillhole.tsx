import { useMemo, useRef, useState } from "react";
import { useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, Trash2, Crosshair } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";

interface DxfGeometry {
  segments: { type: string; layer: string; points: [number, number][] }[];
  points: { type: string; layer: string; x: number; y: number; r?: number }[];
  texts: { type: string; layer: string; x: number; y: number; text: string }[];
  layers: string[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  entityCount: number;
}

export default function Drillhole() {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);
  const [pendingXY, setPendingXY] = useState<{ x: number; y: number } | null>(null);

  // hole form state
  const [holeId, setHoleId] = useState("");
  const [collarX, setCollarX] = useState("");
  const [collarY, setCollarY] = useState("");
  const [collarZ, setCollarZ] = useState("0");
  const [azimuth, setAzimuth] = useState("0");
  const [dip, setDip] = useState("-90");
  const [depth, setDepth] = useState("30");
  const [purpose, setPurpose] = useState("geotechnical");
  const [notes, setNotes] = useState("");
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);

  const plans = trpc.drillhole.listPlans.useQuery();
  const holes = trpc.drillhole.listHoles.useQuery();
  const planDetail = trpc.drillhole.getPlan.useQuery(
    { id: selectedPlanId ?? 0 },
    { enabled: selectedPlanId != null }
  );

  const importDxf = trpc.drillhole.importDxf.useMutation({
    onSuccess: res => {
      toast.success(`DXF imported — ${res.entityCount} entities, ${res.layers.length} layers`);
      utils.drillhole.listPlans.invalidate();
      setSelectedPlanId(res.id as number);
    },
    onError: e => toast.error(e.message),
    onSettled: () => setUploading(false),
  });

  const createHole = trpc.drillhole.createHole.useMutation({
    onSuccess: () => {
      toast.success("Drillhole saved");
      utils.drillhole.listHoles.invalidate();
      setHoleId("");
      setPendingXY(null);
    },
    onError: e => toast.error(e.message),
  });

  const deleteHole = trpc.drillhole.deleteHole.useMutation({
    onSuccess: () => utils.drillhole.listHoles.invalidate(),
    onError: e => toast.error(e.message),
  });

  const deletePlan = trpc.drillhole.deletePlan.useMutation({
    onSuccess: () => {
      utils.drillhole.listPlans.invalidate();
      setSelectedPlanId(null);
    },
    onError: e => toast.error(e.message),
  });

  const geometry: DxfGeometry | null = useMemo(() => {
    if (!planDetail.data?.geometryJson) return null;
    try {
      return JSON.parse(planDetail.data.geometryJson) as DxfGeometry;
    } catch {
      return null;
    }
  }, [planDetail.data]);

  const handleFile = async (f: File) => {
    if (!f.name.toLowerCase().endsWith(".dxf")) {
      toast.error("Please select a .dxf file");
      return;
    }
    setUploading(true);
    const buf = await f.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    importDxf.mutate({ name: f.name, base64: btoa(binary) });
  };

  const submitHole = () => {
    if (!holeId.trim()) return toast.error("Hole ID is required");
    const x = parseFloat(collarX);
    const y = parseFloat(collarY);
    const d = parseFloat(depth);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return toast.error("Collar X and Y are required");
    if (!Number.isFinite(d) || d <= 0) return toast.error("Depth must be positive");
    createHole.mutate({
      planId: selectedPlanId,
      holeId: holeId.trim(),
      collarX: x,
      collarY: y,
      collarZ: parseFloat(collarZ) || 0,
      azimuth: parseFloat(azimuth) || 0,
      dip: parseFloat(dip) || -90,
      depth: d,
      purpose,
      notes: notes || undefined,
    });
  };

  // SVG viewport
  const viewBox = useMemo(() => {
    if (!geometry) return "0 0 100 100";
    const { minX, minY, maxX, maxY } = geometry.bounds;
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const pad = Math.max(w, h) * 0.05;
    return `${minX - pad} ${-(maxY + pad)} ${w + 2 * pad} ${h + 2 * pad}`;
  }, [geometry]);

  const strokeW = useMemo(() => {
    if (!geometry) return 1;
    const { minX, maxX, minY, maxY } = geometry.bounds;
    return Math.max(maxX - minX, maxY - minY, 1) / 800;
  }, [geometry]);

  const onSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!placing || !geometry) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    const x = Math.round(p.x * 1000) / 1000;
    const y = Math.round(-p.y * 1000) / 1000;
    setCollarX(String(x));
    setCollarY(String(y));
    setPendingXY({ x, y });
    setPlacing(false);
    toast.success(`Collar set at X=${x}, Y=${y}`);
  };

  const onSvgMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!geometry) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    setCursorCoords({ x: Math.round(p.x * 100) / 100, y: Math.round(-p.y * 100) / 100 });
  }, [geometry]);

  const planHoles = (holes.data ?? []).filter(
    h => selectedPlanId == null || h.planId === selectedPlanId
  );

  return (
    <div>
      <ModuleHeader
        index="06"
        title="Drillhole Planning"
        description="Import a DXF site plan with its original real-world coordinates (Easting/Northing), visualize it, and plan geotechnical drillholes — collar coordinates, azimuth, dip and depth — directly on the plan."
      />

      <div className="grid grid-cols-12 gap-8">
        {/* Left column: DXF + plan viewer */}
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Site plan (DXF)</SectionLabel>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".dxf"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.currentTarget.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="rounded-none border-foreground"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                Import DXF
              </Button>
            </div>
          </div>

          {(plans.data?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <Select
                value={selectedPlanId != null ? String(selectedPlanId) : undefined}
                onValueChange={v => setSelectedPlanId(Number(v))}
              >
                <SelectTrigger className="rounded-none border-foreground w-72">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {(plans.data ?? []).map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} ({p.entityCount} entities)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPlanId != null && (
                <>
                  <Button
                    size="sm"
                    variant={placing ? "default" : "outline"}
                    className="rounded-none border-foreground"
                    onClick={() => setPlacing(v => !v)}
                  >
                    <Crosshair className="h-4 w-4 mr-1" />
                    {placing ? "Click on plan…" : "Pick collar on plan"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-none border-destructive text-destructive"
                    onClick={() => deletePlan.mutate({ id: selectedPlanId })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="border border-foreground bg-white relative" style={{ minHeight: 380 }}>
            {planDetail.isLoading && selectedPlanId != null ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : geometry ? (
              <svg
                viewBox={viewBox}
                className={`w-full h-[480px] ${placing ? "cursor-crosshair" : ""}`}
                onClick={onSvgClick}
                onMouseMove={onSvgMove}
                onMouseLeave={() => setCursorCoords(null)}
                preserveAspectRatio="xMidYMid meet"
              >
                {/* flip Y: CAD Y-up vs SVG Y-down */}
                <g transform="scale(1,-1)">
                  {geometry.segments.map((s, i) => (
                    <polyline
                      key={i}
                      points={s.points.map(([x, y]) => `${x},${y}`).join(" ")}
                      fill="none"
                      stroke="#111"
                      strokeWidth={strokeW}
                    />
                  ))}
                  {geometry.points.map((p, i) =>
                    p.type === "circle" ? (
                      <circle
                        key={`c${i}`}
                        cx={p.x}
                        cy={p.y}
                        r={p.r || strokeW * 3}
                        fill="none"
                        stroke="#666"
                        strokeWidth={strokeW}
                      />
                    ) : (
                      <circle key={`p${i}`} cx={p.x} cy={p.y} r={strokeW * 2.5} fill="#666" />
                    )
                  )}
                  {/* planned holes */}
                  {planHoles.map(h => (
                    (() => {
                      // Project the hole trace in plan view:
                      // Horizontal projection length = depth * cos(dip)
                      // dip is stored as negative (e.g. -90 = vertical, -60 = 60° from horizontal)
                      const dipRad = Math.abs(h.dip) * Math.PI / 180;
                      const horizLen = h.depth * Math.cos(dipRad);
                      // Azimuth: 0=North(+Y), 90=East(+X)
                      const azRad = (h.azimuth) * Math.PI / 180;
                      const dx = horizLen * Math.sin(azRad);
                      const dy = horizLen * Math.cos(azRad);
                      const toeX = h.collarX + dx;
                      const toeY = h.collarY + dy;
                      return (
                        <g key={h.id}>
                          {/* Hole trace line */}
                          <line
                            x1={h.collarX}
                            y1={h.collarY}
                            x2={toeX}
                            y2={toeY}
                            stroke="#d32f2f"
                            strokeWidth={strokeW * 2.5}
                            strokeLinecap="round"
                          />
                          {/* Collar point (filled) */}
                          <circle cx={h.collarX} cy={h.collarY} r={strokeW * 5} fill="#d32f2f" />
                          {/* Toe point (open) */}
                          <circle cx={toeX} cy={toeY} r={strokeW * 4} fill="none" stroke="#d32f2f" strokeWidth={strokeW * 1.5} />
                          {/* Direction arrow at midpoint */}
                          {horizLen > strokeW * 20 && (
                            <circle
                              cx={(h.collarX + toeX) / 2}
                              cy={(h.collarY + toeY) / 2}
                              r={strokeW * 2}
                              fill="#d32f2f"
                            />
                          )}
                        </g>
                      );
                    })()
                  ))}
                  {pendingXY && (
                    <circle
                      cx={pendingXY.x}
                      cy={pendingXY.y}
                      r={strokeW * 7}
                      fill="none"
                      stroke="#d32f2f"
                      strokeWidth={strokeW * 2}
                      strokeDasharray={`${strokeW * 4} ${strokeW * 3}`}
                    />
                  )}
                </g>
                {/* hole labels (unflipped) */}
                {planHoles.map(h => (
                  <g key={`t${h.id}`}>
                    <text
                      x={h.collarX + strokeW * 12}
                      y={-h.collarY}
                      fontSize={strokeW * 12}
                      fill="#d32f2f"
                      fontWeight="bold"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {h.holeId}
                    </text>
                    <text
                      x={h.collarX + strokeW * 12}
                      y={-h.collarY + strokeW * 14}
                      fontSize={strokeW * 9}
                      fill="#666"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {h.depth}m · az{h.azimuth}° / dip{h.dip}°
                    </text>
                  </g>
                ))}
              </svg>
            ) : (
              <div className="flex flex-col items-center justify-center h-96 text-sm text-muted-foreground gap-2 p-8 text-center">
                <Upload className="h-8 w-8 opacity-30" />
                <p>
                  Import a DXF plan (pit design, bench layout) to visualize it and place
                  drillholes. Supported entities: lines, polylines, circles, points, text.
                </p>
              </div>
            )}
          </div>
          {geometry && (
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground font-mono">
                {geometry.entityCount} entities · layers: {geometry.layers.slice(0, 6).join(", ")}
                {geometry.layers.length > 6 ? "…" : ""} · bounds E [{geometry.bounds.minX} –{" "}
                {geometry.bounds.maxX}] N [{geometry.bounds.minY} – {geometry.bounds.maxY}]
              </p>
              {cursorCoords && (
                <p className="text-xs font-mono font-bold">
                  E {cursorCoords.x} &nbsp; N {cursorCoords.y}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right column: hole form + list */}
        <div className="col-span-12 lg:col-span-5">
          <SectionLabel>Plan a drillhole</SectionLabel>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <Label className="swiss-label text-[11px]">Hole ID *</Label>
              <Input
                className="rounded-none border-foreground mt-1"
                placeholder="e.g. GT-2026-001"
                value={holeId}
                onChange={e => setHoleId(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Purpose</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger className="rounded-none border-foreground mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geotechnical">Geotechnical</SelectItem>
                  <SelectItem value="piezometer">Piezometer</SelectItem>
                  <SelectItem value="exploration">Exploration</SelectItem>
                  <SelectItem value="dewatering">Dewatering</SelectItem>
                  <SelectItem value="monitoring">Monitoring</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Collar X (E) *</Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={collarX}
                onChange={e => setCollarX(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Collar Y (N) *</Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={collarY}
                onChange={e => setCollarY(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Collar Z (m)</Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={collarZ}
                onChange={e => setCollarZ(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Depth (m) *</Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={depth}
                onChange={e => setDepth(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Azimuth (°)</Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={azimuth}
                onChange={e => setAzimuth(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Dip (°, −90 = vertical)</Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                value={dip}
                onChange={e => setDip(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label className="swiss-label text-[11px]">Notes</Label>
              <Textarea
                className="rounded-none border-foreground mt-1"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>
          <Button
            className="w-full rounded-none mt-4 font-bold uppercase tracking-wide"
            disabled={createHole.isPending}
            onClick={submitHole}
          >
            {createHole.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Drillhole
          </Button>

          <div className="mt-8">
            <SectionLabel>Planned holes ({(holes.data ?? []).length})</SectionLabel>
            <div className="border border-foreground divide-y divide-border mt-3 max-h-[320px] overflow-y-auto">
              {(holes.data ?? []).length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No drillholes planned yet.</p>
              )}
              {(holes.data ?? []).map(h => (
                <div key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="font-mono">
                    <span className="font-bold">{h.holeId}</span>{" "}
                    <span className="text-muted-foreground">
                      X{h.collarX} Y{h.collarY} · {h.depth} m · az {h.azimuth}° / dip {h.dip}°
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => deleteHole.mutate({ id: h.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
