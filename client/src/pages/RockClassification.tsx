import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type ClassResult = { score: number; rockClass: string; interpretation: string };

function ResultBlock({ result, label }: { result: ClassResult | null; label: string }) {
  if (!result)
    return (
      <div className="border border-dashed border-muted-foreground/40 p-8 text-center text-sm text-muted-foreground">
        Complete the form and compute to obtain the {label} index and its
        interpretation.
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px bg-foreground border border-foreground">
        <div className="bg-background p-6">
          <div className="swiss-label mb-2">{label} value</div>
          <div className="swiss-number text-5xl font-bold">
            {result.score < 0.01 && result.score > 0
              ? result.score.toExponential(2)
              : result.score}
          </div>
        </div>
        <div className="bg-background p-6">
          <div className="swiss-label mb-2">Rock mass class</div>
          <div className="font-bold text-xl leading-tight">{result.rockClass}</div>
        </div>
      </div>
      <div className="border-l-4 border-primary pl-4 text-sm leading-relaxed">
        {result.interpretation}
      </div>
      <p className="text-xs text-muted-foreground">Saved to archive.</p>
    </div>
  );
}

export default function RockClassification() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ModuleHeader
        index="03"
        title="Rock Classification"
        description="Rock mass characterization using three classification systems: RMR (Bieniawski 1989), Q-system (Barton) and GSI (Hoek). Each index is computed automatically with its engineering interpretation."
      />
      <Tabs defaultValue="rmr">
        <TabsList className="w-full justify-start rounded-none border border-foreground bg-background h-auto p-0">
          {[
            { v: "rmr", l: "RMR" },
            { v: "q", l: "Q-System" },
            { v: "gsi", l: "GSI" },
          ].map(t => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="rounded-none px-8 py-3 font-bold uppercase tracking-wider text-xs data-[state=active]:bg-foreground data-[state=active]:text-background"
            >
              {t.l}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="rmr" className="mt-8">
          <RMRForm />
        </TabsContent>
        <TabsContent value="q" className="mt-8">
          <QForm />
        </TabsContent>
        <TabsContent value="gsi" className="mt-8">
          <GSIForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>;
}

function TitleZone({
  title,
  zone,
  setTitle,
  setZone,
}: {
  title: string;
  zone: string;
  setTitle: (v: string) => void;
  setZone: (v: string) => void;
}) {
  return (
    <>
      <div>
        <Label className="swiss-label mb-1.5 block">Classification title *</Label>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Drill core BH-12 — 45–60 m"
        />
      </div>
      <div>
        <Label className="swiss-label mb-1.5 block">Zone / sector</Label>
        <Input value={zone} onChange={e => setZone(e.target.value)} placeholder="e.g. North pit" />
      </div>
    </>
  );
}

function TwoCol({ form, results }: { form: React.ReactNode; results: React.ReactNode }) {
  return (
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-12 lg:col-span-5 space-y-4">{form}</div>
      <div className="col-span-12 lg:col-span-7">
        <SectionLabel>Results</SectionLabel>
        {results}
      </div>
    </div>
  );
}

function RMRForm() {
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [ucs, setUcs] = useState("100");
  const [rqd, setRqd] = useState("75");
  const [spacing, setSpacing] = useState("0.6");
  const [condition, setCondition] = useState("20");
  const [groundwater, setGroundwater] = useState("10");
  const [orientation, setOrientation] = useState("-5");
  const [result, setResult] = useState<ClassResult | null>(null);

  const compute = trpc.classification.computeRMR.useMutation({
    onSuccess: d => {
      setResult(d);
      toast.success("RMR computed");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <TwoCol
      form={
        <>
          <SectionLabel>RMR Parameters (Bieniawski 1989)</SectionLabel>
          <TitleZone title={title} zone={zone} setTitle={setTitle} setZone={setZone} />
          <FieldGrid>
            <div>
              <Label className="swiss-label mb-1.5 block">UCS (MPa)</Label>
              <Input type="number" value={ucs} onChange={e => setUcs(e.target.value)} />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">RQD (%)</Label>
              <Input type="number" value={rqd} onChange={e => setRqd(e.target.value)} />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">Joint spacing (m)</Label>
              <Input type="number" step="0.01" value={spacing} onChange={e => setSpacing(e.target.value)} />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">Joint condition (0–30)</Label>
              <Input type="number" value={condition} onChange={e => setCondition(e.target.value)} />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">Groundwater (0–15)</Label>
              <Input type="number" value={groundwater} onChange={e => setGroundwater(e.target.value)} />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">Orientation adj. (−60–0)</Label>
              <Input type="number" value={orientation} onChange={e => setOrientation(e.target.value)} />
            </div>
          </FieldGrid>
          <Button
            className="w-full font-bold uppercase tracking-wider"
            disabled={compute.isPending}
            onClick={() => {
              if (!title.trim()) return toast.error("Please provide a title");
              compute.mutate({
                title: title.trim(),
                zone: zone.trim() || undefined,
                ucs: Number(ucs),
                rqd: Number(rqd),
                spacing: Number(spacing),
                conditionRating: Number(condition),
                groundwaterRating: Number(groundwater),
                orientationAdjustment: Number(orientation),
              });
            }}
          >
            {compute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Compute RMR"}
          </Button>
        </>
      }
      results={<ResultBlock result={result} label="RMR" />}
    />
  );
}

function QForm() {
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [rqd, setRqd] = useState("75");
  const [jn, setJn] = useState("9");
  const [jr, setJr] = useState("2");
  const [ja, setJa] = useState("1");
  const [jw, setJw] = useState("1");
  const [srf, setSrf] = useState("1");
  const [result, setResult] = useState<ClassResult | null>(null);

  const compute = trpc.classification.computeQ.useMutation({
    onSuccess: d => {
      setResult(d);
      toast.success("Q index computed");
    },
    onError: e => toast.error(e.message),
  });

  const selects: Array<{
    label: string;
    value: string;
    set: (v: string) => void;
    options: Array<{ v: string; l: string }>;
  }> = [
    {
      label: "Jn — joint sets",
      value: jn,
      set: setJn,
      options: [
        { v: "0.5", l: "0.5 — Massive, none/few joints" },
        { v: "2", l: "2 — One joint set" },
        { v: "4", l: "4 — Two joint sets" },
        { v: "9", l: "9 — Three joint sets" },
        { v: "12", l: "12 — Three sets + random" },
        { v: "15", l: "15 — Four or more sets" },
        { v: "20", l: "20 — Crushed rock" },
      ],
    },
    {
      label: "Jr — joint roughness",
      value: jr,
      set: setJr,
      options: [
        { v: "4", l: "4 — Discontinuous joints" },
        { v: "3", l: "3 — Rough, undulating" },
        { v: "2", l: "2 — Smooth, undulating" },
        { v: "1.5", l: "1.5 — Rough, planar" },
        { v: "1", l: "1 — Smooth, planar" },
        { v: "0.5", l: "0.5 — Slickensided, planar" },
      ],
    },
    {
      label: "Ja — joint alteration",
      value: ja,
      set: setJa,
      options: [
        { v: "0.75", l: "0.75 — Tightly healed" },
        { v: "1", l: "1 — Unaltered walls" },
        { v: "2", l: "2 — Slightly altered" },
        { v: "3", l: "3 — Silty/sandy coatings" },
        { v: "4", l: "4 — Clay coatings" },
        { v: "8", l: "8 — Clay filling < 5 mm" },
        { v: "12", l: "12 — Thick clay filling" },
      ],
    },
    {
      label: "Jw — water factor",
      value: jw,
      set: setJw,
      options: [
        { v: "1", l: "1 — Dry / minor inflow" },
        { v: "0.66", l: "0.66 — Medium inflow" },
        { v: "0.5", l: "0.5 — Large inflow, unfilled" },
        { v: "0.33", l: "0.33 — Large inflow, washed" },
        { v: "0.1", l: "0.1 — Exceptional inflow" },
      ],
    },
    {
      label: "SRF — stress reduction",
      value: srf,
      set: setSrf,
      options: [
        { v: "1", l: "1 — Medium stress, favorable" },
        { v: "2.5", l: "2.5 — Low stress, near surface" },
        { v: "5", l: "5 — Weakness zones / high stress" },
        { v: "10", l: "10 — Multiple weakness zones" },
      ],
    },
  ];

  return (
    <TwoCol
      form={
        <>
          <SectionLabel>Q-System Parameters (Barton)</SectionLabel>
          <TitleZone title={title} zone={zone} setTitle={setTitle} setZone={setZone} />
          <div>
            <Label className="swiss-label mb-1.5 block">RQD (%)</Label>
            <Input type="number" value={rqd} onChange={e => setRqd(e.target.value)} />
          </div>
          {selects.map(sel => (
            <div key={sel.label}>
              <Label className="swiss-label mb-1.5 block">{sel.label}</Label>
              <Select value={sel.value} onValueChange={sel.set}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sel.options.map(o => (
                    <SelectItem key={o.v} value={o.v}>
                      {o.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <Button
            className="w-full font-bold uppercase tracking-wider"
            disabled={compute.isPending}
            onClick={() => {
              if (!title.trim()) return toast.error("Please provide a title");
              compute.mutate({
                title: title.trim(),
                zone: zone.trim() || undefined,
                rqd: Number(rqd),
                jn: Number(jn),
                jr: Number(jr),
                ja: Number(ja),
                jw: Number(jw),
                srf: Number(srf),
              });
            }}
          >
            {compute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Compute Q"}
          </Button>
          <p className="text-xs text-muted-foreground swiss-number">
            Q = (RQD/Jn) × (Jr/Ja) × (Jw/SRF)
          </p>
        </>
      }
      results={<ResultBlock result={result} label="Q" />}
    />
  );
}

function GSIForm() {
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [structure, setStructure] = useState("70");
  const [surface, setSurface] = useState("60");
  const [result, setResult] = useState<ClassResult | null>(null);

  const compute = trpc.classification.computeGSI.useMutation({
    onSuccess: d => {
      setResult(d);
      toast.success("GSI computed");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <TwoCol
      form={
        <>
          <SectionLabel>GSI Parameters (Hoek)</SectionLabel>
          <TitleZone title={title} zone={zone} setTitle={setTitle} setZone={setZone} />
          <div>
            <Label className="swiss-label mb-1.5 block">
              Structure rating (0–100) — 100 = intact/massive, 0 = disintegrated
            </Label>
            <Input type="number" value={structure} onChange={e => setStructure(e.target.value)} />
          </div>
          <div>
            <Label className="swiss-label mb-1.5 block">
              Surface condition rating (0–100) — 100 = very good/fresh, 0 = very poor
            </Label>
            <Input type="number" value={surface} onChange={e => setSurface(e.target.value)} />
          </div>
          <Button
            className="w-full font-bold uppercase tracking-wider"
            disabled={compute.isPending}
            onClick={() => {
              if (!title.trim()) return toast.error("Please provide a title");
              compute.mutate({
                title: title.trim(),
                zone: zone.trim() || undefined,
                structureRating: Number(structure),
                surfaceRating: Number(surface),
              });
            }}
          >
            {compute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Compute GSI"}
          </Button>
        </>
      }
      results={<ResultBlock result={result} label="GSI" />}
    />
  );
}
