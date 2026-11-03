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

type ClassResult = {
  score: number;
  rockClass: string;
  interpretation: string;
  governingJointSet?: 1 | 2;
};

function ResultBlock({
  result,
  label,
}: {
  result: ClassResult | null;
  label: string;
}) {
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
          <div className="font-bold text-xl leading-tight">
            {result.rockClass}
          </div>
        </div>
      </div>
      <div className="border-l-4 border-primary pl-4 text-sm leading-relaxed">
        {result.interpretation}
      </div>
      {result.governingJointSet && label === "SMR" && (
        <div className="border border-foreground p-4 text-sm">
          <span className="swiss-label mr-2">Governing joint set</span>
          Joint Set {result.governingJointSet} — lower SMR score controls the
          classification.
        </div>
      )}
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
        module="Rock Classification"
        description="Rock mass characterization using four classification systems: RMR (Bieniawski 1989), SMR (Romana), Q-system (Barton) and GSI (Hoek). Each index is computed automatically with its engineering interpretation."
      />
      <Tabs defaultValue="rmr">
        <TabsList className="w-full justify-start rounded-none border border-foreground bg-background h-auto p-0">
          {[
            { v: "rmr", l: "RMR" },
            { v: "q", l: "Q-System" },
            { v: "gsi", l: "GSI" },
            { v: "smr", l: "SMR" },
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
        <TabsContent value="smr" className="mt-8">
          <SMRForm />
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
        <Label className="swiss-label mb-1.5 block">
          Classification title *
        </Label>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Drill core BH-12 — 45–60 m"
        />
      </div>
      <div>
        <Label className="swiss-label mb-1.5 block">Zone / sector</Label>
        <Input
          value={zone}
          onChange={e => setZone(e.target.value)}
          placeholder="e.g. North pit"
        />
      </div>
    </>
  );
}

function TwoCol({
  form,
  results,
}: {
  form: React.ReactNode;
  results: React.ReactNode;
}) {
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
          <TitleZone
            title={title}
            zone={zone}
            setTitle={setTitle}
            setZone={setZone}
          />
          <FieldGrid>
            <div>
              <Label className="swiss-label mb-1.5 block">UCS (MPa)</Label>
              <Input
                type="number"
                value={ucs}
                onChange={e => setUcs(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">RQD (%)</Label>
              <Input
                type="number"
                value={rqd}
                onChange={e => setRqd(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">
                Joint spacing (m)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={spacing}
                onChange={e => setSpacing(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">
                Joint condition (0–30)
              </Label>
              <Input
                type="number"
                value={condition}
                onChange={e => setCondition(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">
                Groundwater (0–15)
              </Label>
              <Input
                type="number"
                value={groundwater}
                onChange={e => setGroundwater(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">
                Orientation adj. (−60–0)
              </Label>
              <Input
                type="number"
                value={orientation}
                onChange={e => setOrientation(e.target.value)}
              />
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
            {compute.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Compute RMR"
            )}
          </Button>
        </>
      }
      results={<ResultBlock result={result} label="RMR" />}
    />
  );
}

function SMRForm() {
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [rmrBasic, setRmrBasic] = useState("69");
  const [jointDip, setJointDip] = useState("65");
  const [jointDipDirection, setJointDipDirection] = useState("120");
  const [jointDip2, setJointDip2] = useState("45");
  const [jointDipDirection2, setJointDipDirection2] = useState("220");
  const [slopeDip, setSlopeDip] = useState("70");
  const [slopeDipDirection, setSlopeDipDirection] = useState("120");
  const [excavationMethod, setExcavationMethod] = useState(
    "production-blasting"
  );
  const [result, setResult] = useState<ClassResult | null>(null);

  const compute = trpc.classification.computeSMR.useMutation({
    onSuccess: d => {
      setResult(d);
      toast.success("SMR computed");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <TwoCol
      form={
        <>
          <SectionLabel>SMR Parameters (Romana)</SectionLabel>
          <p className="text-sm text-muted-foreground leading-relaxed">
            SMR = RMRbasic + (F1 × F2 × F3) + F4. Enter two joint sets; both are
            evaluated independently and the lower governing SMR controls the
            classification.
          </p>
          <TitleZone
            title={title}
            zone={zone}
            setTitle={setTitle}
            setZone={setZone}
          />
          <div>
            <Label className="swiss-label mb-1.5 block">
              Basic RMR (0–100)
            </Label>
            <Input
              type="number"
              value={rmrBasic}
              onChange={e => setRmrBasic(e.target.value)}
            />
          </div>
          <FieldGrid>
            <div className="col-span-2 border-l-4 border-primary pl-4">
              <div className="swiss-label mb-3">Joint Set 1</div>
              <FieldGrid>
                <div>
                  <Label className="swiss-label mb-1.5 block">
                    Joint dip (°)
                  </Label>
                  <Input
                    type="number"
                    value={jointDip}
                    onChange={e => setJointDip(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="swiss-label mb-1.5 block">
                    Joint dip direction (°)
                  </Label>
                  <Input
                    type="number"
                    value={jointDipDirection}
                    onChange={e => setJointDipDirection(e.target.value)}
                  />
                </div>
              </FieldGrid>
            </div>
            <div className="col-span-2 border-l-4 border-muted-foreground pl-4">
              <div className="swiss-label mb-3">Joint Set 2</div>
              <FieldGrid>
                <div>
                  <Label className="swiss-label mb-1.5 block">
                    Joint dip (°)
                  </Label>
                  <Input
                    type="number"
                    value={jointDip2}
                    onChange={e => setJointDip2(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="swiss-label mb-1.5 block">
                    Joint dip direction (°)
                  </Label>
                  <Input
                    type="number"
                    value={jointDipDirection2}
                    onChange={e => setJointDipDirection2(e.target.value)}
                  />
                </div>
              </FieldGrid>
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">Slope dip (°)</Label>
              <Input
                type="number"
                value={slopeDip}
                onChange={e => setSlopeDip(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">
                Slope dip direction (°)
              </Label>
              <Input
                type="number"
                value={slopeDipDirection}
                onChange={e => setSlopeDipDirection(e.target.value)}
              />
            </div>
          </FieldGrid>
          <div>
            <Label className="swiss-label mb-1.5 block">
              Excavation method (F4)
            </Label>
            <Select
              value={excavationMethod}
              onValueChange={setExcavationMethod}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="natural">Natural slope (+15)</SelectItem>
                <SelectItem value="pre-splitting">
                  Pre-splitting (+10)
                </SelectItem>
                <SelectItem value="smooth-blasting">
                  Smooth blasting (+8)
                </SelectItem>
                <SelectItem value="mechanical">
                  Mechanical excavation (0)
                </SelectItem>
                <SelectItem value="production-blasting">
                  Production blasting (−8)
                </SelectItem>
                <SelectItem value="poor-blasting">
                  Poor blasting (−12)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full font-bold uppercase tracking-wider"
            disabled={compute.isPending}
            onClick={() => {
              if (!title.trim()) return toast.error("Please provide a title");
              compute.mutate({
                title: title.trim(),
                zone: zone.trim() || undefined,
                rmrBasic: Number(rmrBasic),
                jointDip: Number(jointDip),
                jointDipDirection: Number(jointDipDirection),
                jointDip2: Number(jointDip2),
                jointDipDirection2: Number(jointDipDirection2),
                slopeDip: Number(slopeDip),
                slopeDipDirection: Number(slopeDipDirection),
                excavationMethod: excavationMethod as
                  | "natural"
                  | "pre-splitting"
                  | "smooth-blasting"
                  | "mechanical"
                  | "production-blasting"
                  | "poor-blasting",
              });
            }}
          >
            {compute.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Compute SMR"
            )}
          </Button>
        </>
      }
      results={<ResultBlock result={result} label="SMR" />}
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
          <TitleZone
            title={title}
            zone={zone}
            setTitle={setTitle}
            setZone={setZone}
          />
          <div>
            <Label className="swiss-label mb-1.5 block">RQD (%)</Label>
            <Input
              type="number"
              value={rqd}
              onChange={e => setRqd(e.target.value)}
            />
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
            {compute.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Compute Q"
            )}
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

function GSIChartPreview({
  structure,
  surface,
}: {
  structure: number;
  surface: number;
}) {
  // The chart-only asset has its plotting grid in the right/lower portion of the image.
  // Surface quality moves left → right; decreasing interlocking moves top → bottom.
  const markerLeft = Math.max(52, Math.min(96, 52 + (100 - surface) * 0.46));
  const markerTop = Math.max(43, Math.min(94, 43 + (100 - structure) * 0.56));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>GSI Selection Chart</SectionLabel>
        <span className="text-xs font-mono text-muted-foreground">
          Selected: {Math.round((structure + surface) / 2)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Use the chart as a visual guide. Choose the closest structure and
        surface-condition categories, then refine the numeric ratings if
        required.
      </p>
      <div className="relative overflow-hidden border border-foreground bg-white">
        <img
          src="/manus-storage/gsi-chart-only-clean_514a5417.png"
          alt="Chart-only Geological Strength Index diagram showing structure and surface-condition ratings"
          className="block w-full h-auto"
        />
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-[0_0_0_2px_rgba(0,0,0,0.7)]"
          style={{
            left: `${markerLeft}%`,
            top: `${markerTop}%`,
            width: 14,
            height: 14,
          }}
          aria-label={`Selected GSI position: structure ${structure}, surface ${surface}`}
        />
      </div>
    </div>
  );
}

function GSIForm() {
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [structure, setStructure] = useState("70");
  const [surface, setSurface] = useState("60");
  const [result, setResult] = useState<ClassResult | null>(null);

  const structureOptions = [
    { value: "90", label: "Intact / massive — 90" },
    { value: "80", label: "Blocky — 80" },
    { value: "65", label: "Very blocky — 65" },
    { value: "50", label: "Blocky / disturbed — 50" },
    { value: "30", label: "Disintegrated — 30" },
    { value: "15", label: "Laminated / sheared — 15" },
  ];
  const surfaceOptions = [
    { value: "90", label: "Very good / fresh — 90" },
    { value: "80", label: "Good — 80" },
    { value: "65", label: "Fair — 65" },
    { value: "50", label: "Poor — 50" },
    { value: "30", label: "Very poor — 30" },
    { value: "15", label: "Extremely poor — 15" },
  ];

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
          <p className="text-sm text-muted-foreground leading-relaxed">
            Select the closest structure and surface-condition description from
            the supplied GSI chart. The numeric values remain editable for
            engineering judgement.
          </p>
          <TitleZone
            title={title}
            zone={zone}
            setTitle={setTitle}
            setZone={setZone}
          />
          <div>
            <Label className="swiss-label mb-1.5 block">
              Rock-mass structure
            </Label>
            <Select value={structure} onValueChange={setStructure}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {structureOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="swiss-label mb-1.5 block">
              Surface condition
            </Label>
            <Select value={surface} onValueChange={setSurface}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {surfaceOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FieldGrid>
            <div>
              <Label className="swiss-label mb-1.5 block">
                Structure rating (0–100)
              </Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={structure}
                onChange={e => setStructure(e.target.value)}
              />
            </div>
            <div>
              <Label className="swiss-label mb-1.5 block">
                Surface rating (0–100)
              </Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={surface}
                onChange={e => setSurface(e.target.value)}
              />
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
                structureRating: Number(structure),
                surfaceRating: Number(surface),
              });
            }}
          >
            {compute.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Compute GSI"
            )}
          </Button>
        </>
      }
      results={
        <div className="space-y-8">
          <GSIChartPreview
            structure={Number(structure)}
            surface={Number(surface)}
          />
          <ResultBlock result={result} label="GSI" />
        </div>
      }
    />
  );
}
