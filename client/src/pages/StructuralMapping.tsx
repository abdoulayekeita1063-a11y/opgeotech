import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, Trash2, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";

const STRUCTURE_TYPES = ["joint", "fault", "bedding", "foliation", "shear", "vein", "contact"];
const ALTERATIONS = ["fresh", "slightly weathered", "moderately weathered", "highly weathered", "decomposed"];
const INFILLS = ["none", "clean", "calcite", "quartz", "clay", "gouge", "breccia", "oxide"];
const ROUGHNESS = ["very rough", "rough", "slightly rough", "smooth", "slickensided"];

/** Map descriptive roughness to a default JRC when none is given. */
const ROUGHNESS_JRC: Record<string, number> = {
  "very rough": 16,
  rough: 12,
  "slightly rough": 8,
  smooth: 4,
  slickensided: 1,
};

export default function StructuralMapping() {
  const utils = trpc.useUtils();
  const csvRef = useRef<HTMLInputElement>(null);

  const [structureId, setStructureId] = useState("");
  const [zone, setZone] = useState("");
  const [structureType, setStructureType] = useState("joint");
  const [dip, setDip] = useState("");
  const [dipDirection, setDipDirection] = useState("");
  const [alteration, setAlteration] = useState("fresh");
  const [infill, setInfill] = useState("none");
  const [roughness, setRoughness] = useState("rough");
  const [jrc, setJrc] = useState("");

  const list = trpc.mapping.list.useQuery();

  const create = trpc.mapping.create.useMutation({
    onSuccess: () => {
      toast.success("Structure recorded");
      utils.mapping.list.invalidate();
      setStructureId("");
      setDip("");
      setDipDirection("");
      setJrc("");
    },
    onError: e => toast.error(e.message),
  });

  const importCsv = trpc.mapping.importCsv.useMutation({
    onSuccess: r => {
      toast.success(`${r.count} structures imported`);
      utils.mapping.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const remove = trpc.mapping.delete.useMutation({
    onSuccess: () => utils.mapping.list.invalidate(),
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    const d = parseFloat(dip);
    const dd = parseFloat(dipDirection);
    if (!Number.isFinite(d) || d < 0 || d > 90) return toast.error("Dip must be 0–90°");
    if (!Number.isFinite(dd) || dd < 0 || dd > 360) return toast.error("Dip direction must be 0–360°");
    create.mutate({
      structureId: structureId || undefined,
      zone: zone || undefined,
      structureType,
      dip: d,
      dipDirection: dd,
      alteration,
      infill,
      roughness,
      jrc: jrc ? parseFloat(jrc) : ROUGHNESS_JRC[roughness] ?? null,
    });
  };

  const handleCsv = async (f: File) => {
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return toast.error("CSV needs a header row and at least one data row");
    const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ""));
    const col = (names: string[]) => header.findIndex(h => names.includes(h));
    const iDip = col(["dip"]);
    const iDd = col(["dipdirection", "dip_direction", "dipdir", "dd"]);
    if (iDip < 0 || iDd < 0)
      return toast.error('CSV must contain "dip" and "dip_direction" columns');
    const iId = col(["id", "structureid", "structure_id"]);
    const iZone = col(["zone", "sector"]);
    const iType = col(["type", "structuretype", "structure_type"]);
    const iAlt = col(["alteration", "weathering"]);
    const iInf = col(["infill", "filling"]);
    const iRou = col(["roughness"]);
    const iJrc = col(["jrc"]);

    const rows = [];
    for (let i = 1; i < lines.length && rows.length < 2000; i++) {
      const c = lines[i].split(",").map(s => s.trim());
      const d = parseFloat(c[iDip]);
      const dd = parseFloat(c[iDd]);
      if (!Number.isFinite(d) || !Number.isFinite(dd)) continue;
      if (d < 0 || d > 90 || dd < 0 || dd > 360) continue;
      rows.push({
        structureId: iId >= 0 ? c[iId] || undefined : undefined,
        zone: iZone >= 0 ? c[iZone] || undefined : undefined,
        structureType: iType >= 0 && c[iType] ? c[iType].toLowerCase() : "joint",
        dip: d,
        dipDirection: dd,
        alteration: iAlt >= 0 ? c[iAlt] || undefined : undefined,
        infill: iInf >= 0 ? c[iInf] || undefined : undefined,
        roughness: iRou >= 0 ? c[iRou] || undefined : undefined,
        jrc: iJrc >= 0 && c[iJrc] ? parseFloat(c[iJrc]) : undefined,
      });
    }
    if (!rows.length) return toast.error("No valid rows found in the CSV");
    importCsv.mutate({ rows });
  };

  const downloadTemplate = () => {
    const csv =
      "id,zone,type,dip,dip_direction,alteration,infill,roughness,jrc\n" +
      "J-001,East wall,joint,55,120,fresh,none,rough,12\n" +
      "F-001,East wall,fault,70,265,moderately weathered,gouge,slickensided,2\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "structures_template.csv";
    a.click();
  };

  // ── stereonet (equal-angle, poles to planes) ──────────────────────
  const poles = useMemo(() => {
    return (list.data ?? []).map(s => {
      // pole trend = dipDir + 180, plunge = 90 - dip
      const trend = ((s.dipDirection + 180) % 360) * (Math.PI / 180);
      const plunge = (90 - s.dip) * (Math.PI / 180);
      // equal-angle projection: r = R * tan((90 - plunge)/2)
      const r = Math.tan((Math.PI / 2 - plunge) / 2);
      return {
        id: s.id,
        x: r * Math.sin(trend),
        y: -r * Math.cos(trend), // SVG y down; north up
        type: s.structureType,
      };
    });
  }, [list.data]);

  const typeColor = (t: string) =>
    t === "fault" ? "#d32f2f" : t === "bedding" ? "#1565c0" : t === "foliation" ? "#6a1b9a" : "#111";

  return (
    <div>
      <ModuleHeader
        index="07"
        title="Structural Mapping"
        description="Record discontinuity data — dip, dip direction, alteration, infill, roughness — manually or by CSV import, and review the pole distribution on a stereonet."
      />

      <div className="grid grid-cols-12 gap-8">
        {/* form */}
        <div className="col-span-12 lg:col-span-5">
          <SectionLabel>New structure</SectionLabel>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <Label className="swiss-label text-[11px]">Structure ID</Label>
              <Input
                className="rounded-none border-foreground mt-1"
                placeholder="e.g. J-014"
                value={structureId}
                onChange={e => setStructureId(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Zone / sector</Label>
              <Input
                className="rounded-none border-foreground mt-1"
                placeholder="e.g. East wall"
                value={zone}
                onChange={e => setZone(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Type</Label>
              <Select value={structureType} onValueChange={setStructureType}>
                <SelectTrigger className="rounded-none border-foreground mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRUCTURE_TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="swiss-label text-[11px]">JRC (0–20)</Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                placeholder="auto from roughness"
                value={jrc}
                onChange={e => setJrc(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Dip (°) *</Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                placeholder="0–90"
                value={dip}
                onChange={e => setDip(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Dip direction (°) *</Label>
              <Input
                type="number"
                className="rounded-none border-foreground mt-1"
                placeholder="0–360"
                value={dipDirection}
                onChange={e => setDipDirection(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Alteration</Label>
              <Select value={alteration} onValueChange={setAlteration}>
                <SelectTrigger className="rounded-none border-foreground mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALTERATIONS.map(a => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="swiss-label text-[11px]">Infill</Label>
              <Select value={infill} onValueChange={setInfill}>
                <SelectTrigger className="rounded-none border-foreground mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INFILLS.map(a => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="swiss-label text-[11px]">Roughness</Label>
              <Select value={roughness} onValueChange={setRoughness}>
                <SelectTrigger className="rounded-none border-foreground mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUGHNESS.map(a => (
                    <SelectItem key={a} value={a}>
                      {a} (JRC ≈ {ROUGHNESS_JRC[a]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="w-full rounded-none mt-4 font-bold uppercase tracking-wide"
            disabled={create.isPending}
            onClick={submit}
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Record Structure
          </Button>

          <div className="flex gap-2 mt-4">
            <input
              ref={csvRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleCsv(f);
                e.currentTarget.value = "";
              }}
            />
            <Button
              variant="outline"
              className="flex-1 rounded-none border-foreground"
              disabled={importCsv.isPending}
              onClick={() => csvRef.current?.click()}
            >
              {importCsv.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              Import CSV
            </Button>
            <Button
              variant="outline"
              className="rounded-none border-foreground"
              onClick={downloadTemplate}
            >
              <Download className="h-4 w-4 mr-1" />
              Template
            </Button>
          </div>
        </div>

        {/* stereonet + list */}
        <div className="col-span-12 lg:col-span-7">
          <SectionLabel>Stereonet — poles to planes (equal-angle, lower hemisphere)</SectionLabel>
          <div className="border border-foreground bg-white p-4 flex justify-center">
            <svg viewBox="-1.15 -1.15 2.3 2.3" className="w-full max-w-[420px] h-auto">
              <circle cx="0" cy="0" r="1" fill="none" stroke="#111" strokeWidth="0.012" />
              <line x1="0" y1="-1" x2="0" y2="-1.06" stroke="#111" strokeWidth="0.012" />
              <text x="0" y="-1.08" fontSize="0.09" textAnchor="middle" fontFamily="IBM Plex Mono">
                N
              </text>
              <line x1="-0.03" y1="0" x2="0.03" y2="0" stroke="#111" strokeWidth="0.008" />
              <line x1="0" y1="-0.03" x2="0" y2="0.03" stroke="#111" strokeWidth="0.008" />
              {[30, 60].map(a => (
                <circle
                  key={a}
                  cx="0"
                  cy="0"
                  r={Math.tan(((90 - a) * Math.PI) / 360)}
                  fill="none"
                  stroke="#ddd"
                  strokeWidth="0.006"
                />
              ))}
              {poles.map(p => (
                <circle key={p.id} cx={p.x} cy={p.y} r="0.028" fill={typeColor(p.type)} fillOpacity="0.75" />
              ))}
            </svg>
          </div>
          <div className="flex gap-4 mt-2 text-xs font-mono">
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#111" }} />joint</span>
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#d32f2f" }} />fault</span>
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#1565c0" }} />bedding</span>
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#6a1b9a" }} />foliation</span>
          </div>

          <div className="mt-6">
            <SectionLabel>Recorded structures ({(list.data ?? []).length})</SectionLabel>
            <div className="border border-foreground mt-2 max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-secondary">
                  <tr className="text-left border-b border-foreground">
                    <th className="px-2 py-1.5">ID</th>
                    <th className="px-2 py-1.5">Type</th>
                    <th className="px-2 py-1.5">Dip</th>
                    <th className="px-2 py-1.5">Dip dir</th>
                    <th className="px-2 py-1.5">JRC</th>
                    <th className="px-2 py-1.5">Alteration</th>
                    <th className="px-2 py-1.5">Infill</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {(list.data ?? []).map(s => (
                    <tr key={s.id} className="border-b border-border">
                      <td className="px-2 py-1">{s.structureId || `#${s.id}`}</td>
                      <td className="px-2 py-1">{s.structureType}</td>
                      <td className="px-2 py-1">{s.dip}°</td>
                      <td className="px-2 py-1">{s.dipDirection}°</td>
                      <td className="px-2 py-1">{s.jrc ?? "—"}</td>
                      <td className="px-2 py-1">{s.alteration || "—"}</td>
                      <td className="px-2 py-1">{s.infill || "—"}</td>
                      <td className="px-2 py-1 text-right">
                        <button
                          className="text-destructive hover:opacity-70"
                          onClick={() => remove.mutate({ id: s.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(list.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-4 text-muted-foreground">
                        No structures recorded yet. Add one or import a CSV.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
