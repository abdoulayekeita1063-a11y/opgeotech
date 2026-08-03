import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileDown, Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";
import { escapeHtml, exportRecordAsPdf, markdownToHtml } from "@/lib/exportPdf";

type Category = "all" | "stability" | "classification" | "inspection" | "blast" | "compliance";

interface ArchiveRecord {
  key: string;
  category: Exclude<Category, "all">;
  categoryLabel: string;
  title: string;
  zone?: string | null;
  date: Date;
  summary: string;
  detail: React.ReactNode;
  pdfBody: () => string;
  pdfTitle: string;
}

const catLabel: Record<Exclude<Category, "all">, string> = {
  stability: "Slope Stability",
  classification: "Rock Classification",
  inspection: "Daily Inspection",
  blast: "Blast",
  compliance: "Design Compliance",
};

function kv(rows: Array<[string, string]>): string {
  return `<table>${rows
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td class="metric">${escapeHtml(v)}</td></tr>`)
    .join("")}</table>`;
}

export default function Archive() {
  const [cat, setCat] = useState<Category>("all");
  const [selected, setSelected] = useState<ArchiveRecord | null>(null);

  const stability = trpc.stability.list.useQuery();
  const classification = trpc.classification.list.useQuery();
  const inspections = trpc.inspection.list.useQuery();
  const blasts = trpc.blast.list.useQuery();
  const compliance = trpc.compliance.list.useQuery();

  const loading =
    stability.isLoading ||
    classification.isLoading ||
    inspections.isLoading ||
    blasts.isLoading ||
    compliance.isLoading;

  const records: ArchiveRecord[] = useMemo(() => {
    const out: ArchiveRecord[] = [];

    for (const r of stability.data ?? []) {
      out.push({
        key: `st-${r.id}`,
        category: "stability",
        categoryLabel: catLabel.stability,
        title: r.title,
        zone: r.zone,
        date: new Date(r.createdAt),
        summary: `FS Bishop ${r.fsBishop.toFixed(2)} · FS Fellenius ${r.fsFellenius.toFixed(2)}`,
        pdfTitle: r.title,
        pdfBody: () =>
          `<h1>${escapeHtml(r.title)}</h1><h2>Slope Stability Analysis</h2>` +
          kv([
            ["Zone", r.zone || "—"],
            ["Date", new Date(r.createdAt).toLocaleString()],
            ["Cohesion c′", `${r.cohesion} kPa`],
            ["Friction angle φ′", `${r.frictionAngle} °`],
            ["Unit weight γ", `${r.unitWeight} kN/m³`],
            ["Slope height H", `${r.slopeHeight} m`],
            ["Slope angle β", `${r.slopeAngle} °`],
            ["Groundwater", r.waterCondition],
            ["FS — Bishop", r.fsBishop.toFixed(3)],
            ["FS — Fellenius", r.fsFellenius.toFixed(3)],
          ]) +
          `<h2>Interpretation</h2><p>${escapeHtml(r.interpretation || "")}</p>`,
        detail: (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-px bg-foreground border border-foreground">
              <div className="bg-background p-4">
                <div className="swiss-label mb-1">FS Bishop</div>
                <div className="swiss-number text-3xl font-bold">{r.fsBishop.toFixed(2)}</div>
              </div>
              <div className="bg-background p-4">
                <div className="swiss-label mb-1">FS Fellenius</div>
                <div className="swiss-number text-3xl font-bold">{r.fsFellenius.toFixed(2)}</div>
              </div>
            </div>
            <table className="w-full text-sm border border-foreground">
              <tbody>
                {[
                  ["Cohesion c′", `${r.cohesion} kPa`],
                  ["Friction angle φ′", `${r.frictionAngle} °`],
                  ["Unit weight γ", `${r.unitWeight} kN/m³`],
                  ["Height H / Angle β", `${r.slopeHeight} m / ${r.slopeAngle} °`],
                  ["Groundwater", r.waterCondition],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-foreground last:border-b-0">
                    <td className="px-3 py-1.5 swiss-label">{k}</td>
                    <td className="px-3 py-1.5 swiss-number text-right">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-l-4 border-primary pl-4 text-sm">{r.interpretation}</div>
          </div>
        ),
      });
    }

    for (const r of classification.data ?? []) {
      out.push({
        key: `cl-${r.id}`,
        category: "classification",
        categoryLabel: catLabel.classification,
        title: r.title,
        zone: r.zone,
        date: new Date(r.createdAt),
        summary: `${r.system} = ${r.score} · ${r.rockClass ?? ""}`,
        pdfTitle: r.title,
        pdfBody: () =>
          `<h1>${escapeHtml(r.title)}</h1><h2>Rock Mass Classification — ${r.system}</h2>` +
          kv([
            ["Zone", r.zone || "—"],
            ["Date", new Date(r.createdAt).toLocaleString()],
            ["System", r.system],
            ["Index value", String(r.score)],
            ["Rock class", r.rockClass || "—"],
            ["Inputs", JSON.stringify(r.inputs)],
          ]) +
          `<h2>Interpretation</h2><p>${escapeHtml(r.interpretation || "")}</p>`,
        detail: (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-px bg-foreground border border-foreground">
              <div className="bg-background p-4">
                <div className="swiss-label mb-1">{r.system} value</div>
                <div className="swiss-number text-3xl font-bold">{r.score}</div>
              </div>
              <div className="bg-background p-4">
                <div className="swiss-label mb-1">Class</div>
                <div className="font-bold">{r.rockClass}</div>
              </div>
            </div>
            <div className="border-l-4 border-primary pl-4 text-sm">{r.interpretation}</div>
          </div>
        ),
      });
    }

    for (const r of inspections.data ?? []) {
      out.push({
        key: `in-${r.id}`,
        category: "inspection",
        categoryLabel: catLabel.inspection,
        title: r.title,
        zone: r.zones,
        date: new Date(r.createdAt),
        summary: `${r.inspectionDate} · ${r.inspector || "Inspector n/a"}`,
        pdfTitle: r.title,
        pdfBody: () => markdownToHtml(r.generatedReport || `# ${r.title}\n\nNo generated report.`),
        detail: (
          <div className="prose prose-sm max-w-none">
            <Streamdown>{r.generatedReport || "_No generated report._"}</Streamdown>
          </div>
        ),
      });
    }

    for (const r of blasts.data ?? []) {
      out.push({
        key: `bl-${r.id}`,
        category: "blast",
        categoryLabel: catLabel.blast,
        title: r.title,
        zone: r.zone,
        date: new Date(r.createdAt),
        summary: `Score ${r.qualityScore ?? "—"}/100 · ${r.fragmentationRating ?? ""}`,
        pdfTitle: r.title,
        pdfBody: () =>
          markdownToHtml(r.generatedReport || `# ${r.title}\n\nNo generated report.`) +
          kv([
            ["Quality score", `${r.qualityScore ?? "—"}/100`],
            ["Fragmentation", r.fragmentationRating || "—"],
            ["Break control", r.overbreakDetected || "—"],
          ]),
        detail: (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-px bg-foreground border border-foreground">
              <div className="bg-background p-4">
                <div className="swiss-label mb-1">Score</div>
                <div className="swiss-number text-2xl font-bold">{r.qualityScore ?? "—"}/100</div>
              </div>
              <div className="bg-background p-4">
                <div className="swiss-label mb-1">Fragmentation</div>
                <div className="font-bold text-sm">{r.fragmentationRating ?? "—"}</div>
              </div>
              <div className="bg-background p-4">
                <div className="swiss-label mb-1">Break control</div>
                <div className="font-bold text-sm">{r.overbreakDetected ?? "—"}</div>
              </div>
            </div>
            {(r.beforePhotoUrl || r.afterPhotoUrl) && (
              <div className="grid grid-cols-2 gap-2">
                {r.beforePhotoUrl && (
                  <figure>
                    <img src={r.beforePhotoUrl} alt="Before blast" className="border border-foreground w-full" />
                    <figcaption className="swiss-label mt-1">Before</figcaption>
                  </figure>
                )}
                {r.afterPhotoUrl && (
                  <figure>
                    <img src={r.afterPhotoUrl} alt="After blast" className="border border-foreground w-full" />
                    <figcaption className="swiss-label mt-1">After</figcaption>
                  </figure>
                )}
              </div>
            )}
            <div className="prose prose-sm max-w-none">
              <Streamdown>{r.generatedReport || "_No generated report._"}</Streamdown>
            </div>
          </div>
        ),
      });
    }

    for (const r of compliance.data ?? []) {
      out.push({
        key: `co-${r.id}`,
        category: "compliance",
        categoryLabel: catLabel.compliance,
        title: r.title,
        zone: r.zone,
        date: new Date(r.createdAt),
        summary: `${r.compliant ? "Compliant" : "Non-compliant"} · ${r.compliancePct}%`,
        pdfTitle: r.title,
        pdfBody: () =>
          `<h1>${escapeHtml(r.title)}</h1><h2>Design Compliance Check</h2>` +
          kv([
            ["Zone", r.zone || "—"],
            ["Date", new Date(r.createdAt).toLocaleString()],
            ["Verdict", r.compliant ? "COMPLIANT" : "NON-COMPLIANT"],
            ["Compliance", `${r.compliancePct}%`],
            ["Bench height (design / as-built)", `${r.designBenchHeight} / ${r.actualBenchHeight} m`],
            ["Berm width (design / as-built)", `${r.designBermWidth} / ${r.actualBermWidth} m`],
            ["Batter angle (design / as-built)", `${r.designBatterAngle} / ${r.actualBatterAngle} °`],
          ]) +
          `<h2>Interpretation</h2><p>${escapeHtml(r.interpretation || "")}</p>`,
        detail: (
          <div className="space-y-4">
            <div
              className={`px-3 py-2 font-bold uppercase tracking-wider text-sm ${
                r.compliant ? "bg-foreground text-background" : "bg-primary text-primary-foreground"
              }`}
            >
              {r.compliant ? "Compliant" : "Non-compliant"} — {r.compliancePct}%
            </div>
            <table className="w-full text-sm border border-foreground">
              <tbody>
                {[
                  ["Bench height", `${r.designBenchHeight} m → ${r.actualBenchHeight} m`],
                  ["Berm width", `${r.designBermWidth} m → ${r.actualBermWidth} m`],
                  ["Batter angle", `${r.designBatterAngle} ° → ${r.actualBatterAngle} °`],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-foreground last:border-b-0">
                    <td className="px-3 py-1.5 swiss-label">{k}</td>
                    <td className="px-3 py-1.5 swiss-number text-right">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-l-4 border-primary pl-4 text-sm">{r.interpretation}</div>
          </div>
        ),
      });
    }

    out.sort((a, b) => b.date.getTime() - a.date.getTime());
    return out;
  }, [stability.data, classification.data, inspections.data, blasts.data, compliance.data]);

  const filtered = cat === "all" ? records : records.filter(r => r.category === cat);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ModuleHeader
        index="06"
        title="Archive"
        description="Centralized history of all analyses, classifications, inspection reports, blast assessments and compliance checks. Open any record to review it and export it as PDF."
      />
      <Tabs value={cat} onValueChange={v => setCat(v as Category)}>
        <TabsList className="w-full justify-start rounded-none border border-foreground bg-background h-auto p-0 flex-wrap">
          {(
            [
              ["all", "All"],
              ["stability", "Stability"],
              ["classification", "Classification"],
              ["inspection", "Inspections"],
              ["blast", "Blast"],
              ["compliance", "Compliance"],
            ] as Array<[Category, string]>
          ).map(([v, l]) => (
            <TabsTrigger
              key={v}
              value={v}
              className="rounded-none px-5 py-2.5 font-bold uppercase tracking-wider text-xs data-[state=active]:bg-foreground data-[state=active]:text-background"
            >
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-8">
        <SectionLabel>
          {filtered.length} record{filtered.length === 1 ? "" : "s"}
        </SectionLabel>
        {loading && (
          <div className="border border-foreground p-10 flex items-center justify-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading archive…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="border border-dashed border-muted-foreground/40 p-10 text-center text-sm text-muted-foreground">
            No records yet. Results from every module are automatically
            archived here.
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="border border-foreground divide-y divide-foreground">
            {filtered.map(r => (
              <div
                key={r.key}
                className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-secondary transition-colors cursor-pointer"
                onClick={() => setSelected(r)}
              >
                <div className="col-span-12 md:col-span-2">
                  <span className="swiss-label">{r.categoryLabel}</span>
                </div>
                <div className="col-span-12 md:col-span-4 font-semibold text-sm truncate">
                  {r.title}
                </div>
                <div className="col-span-6 md:col-span-3 text-xs text-muted-foreground truncate">
                  {r.summary}
                </div>
                <div className="col-span-4 md:col-span-2 swiss-number text-xs text-muted-foreground">
                  {r.date.toLocaleDateString()}
                </div>
                <div className="col-span-2 md:col-span-1 flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Export PDF"
                    onClick={e => {
                      e.stopPropagation();
                      exportRecordAsPdf(r.pdfTitle, r.pdfBody());
                    }}
                  >
                    <FileDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-none border-2 border-foreground">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <span className="swiss-square" style={{ width: "0.5rem", height: "0.5rem" }} />
                  <span className="swiss-label">{selected.categoryLabel}</span>
                </div>
                <DialogTitle className="text-xl font-extrabold uppercase tracking-tight">
                  {selected.title}
                </DialogTitle>
                <p className="swiss-number text-xs text-muted-foreground">
                  {selected.zone ? `${selected.zone} · ` : ""}
                  {selected.date.toLocaleString()}
                </p>
              </DialogHeader>
              <div className="mt-2">{selected.detail}</div>
              <div className="mt-4 flex justify-end">
                <Button
                  className="font-bold uppercase tracking-wider"
                  onClick={() => exportRecordAsPdf(selected.pdfTitle, selected.pdfBody())}
                >
                  <FileDown className="h-4 w-4" /> Export PDF
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
