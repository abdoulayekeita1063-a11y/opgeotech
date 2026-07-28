import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  ArrowUpRight,
  Bomb,
  ClipboardList,
  Layers,
  Mountain,
  Ruler,
} from "lucide-react";

const modules = [
  {
    index: "01",
    title: "Slope Stability",
    description:
      "Factor of safety computation using Bishop and Fellenius limit-equilibrium methods with critical circle search.",
    path: "/stability",
    icon: Mountain,
  },
  {
    index: "02",
    title: "Rock Classification",
    description:
      "Rock mass characterization through RMR, Q-system and GSI with automatic index calculation and interpretation.",
    path: "/classification",
    icon: Layers,
  },
  {
    index: "03",
    title: "Daily Inspections",
    description:
      "Field data entry with AI-generated structured professional inspection reports.",
    path: "/inspections",
    icon: ClipboardList,
  },
  {
    index: "04",
    title: "Post-Blast Assessment",
    description:
      "Before/after photo analysis by multimodal AI: fragmentation, overbreak detection and quantified quality score.",
    path: "/blast",
    icon: Bomb,
  },
  {
    index: "05",
    title: "Design Compliance",
    description:
      "As-built versus design verification: bench height, berm width and batter angle against tolerances.",
    path: "/compliance",
    icon: Ruler,
  },
];

export default function Home() {
  const { user } = useAuth();
  const stability = trpc.stability.list.useQuery(undefined, { enabled: !!user });
  const classification = trpc.classification.list.useQuery(undefined, { enabled: !!user });
  const inspections = trpc.inspection.list.useQuery(undefined, { enabled: !!user });
  const blasts = trpc.blast.list.useQuery(undefined, { enabled: !!user });
  const compliance = trpc.compliance.list.useQuery(undefined, { enabled: !!user });

  const counts = [
    { label: "Stability analyses", value: stability.data?.length },
    { label: "Classifications", value: classification.data?.length },
    { label: "Inspection reports", value: inspections.data?.length },
    { label: "Blast assessments", value: blasts.data?.length },
    { label: "Compliance checks", value: compliance.data?.length },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Hero — asymmetric Swiss grid */}
      <div className="grid grid-cols-12 gap-6 border-b-2 border-foreground pb-10 mb-10">
        <div className="col-span-12 md:col-span-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="swiss-square" />
            <span className="swiss-label">Geotechnical Engineering Platform</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold uppercase tracking-tight leading-[0.95]">
            GeoTech
            <br />
            <span className="text-primary">AI</span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-6 max-w-xl">
            Slope stability, rock mass classification, daily inspection
            reporting, post-blast assessment and design compliance — unified in
            one precision-driven workspace for open-pit operations.
          </p>
        </div>
        <div className="col-span-12 md:col-span-4 flex flex-col justify-end">
          <div className="border border-foreground divide-y divide-foreground">
            {counts.map(c => (
              <div key={c.label} className="flex items-center justify-between px-4 py-2.5">
                <span className="swiss-label">{c.label}</span>
                <span className="swiss-number font-semibold text-lg">
                  {c.value ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-foreground border border-foreground">
        {modules.map(m => (
          <Link
            key={m.path}
            href={m.path}
            className="group bg-background p-6 flex flex-col gap-4 hover:bg-secondary transition-colors min-h-[210px]"
          >
            <div className="flex items-start justify-between">
              <span className="swiss-number text-xs text-muted-foreground">{m.index}</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <m.icon className="h-7 w-7 text-primary" strokeWidth={1.5} />
            <div className="mt-auto">
              <h2 className="font-bold uppercase tracking-tight text-lg leading-tight">
                {m.title}
              </h2>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {m.description}
              </p>
            </div>
          </Link>
        ))}
        <Link
          href="/archive"
          className="group bg-foreground text-background p-6 flex flex-col gap-4 hover:bg-primary transition-colors min-h-[210px]"
        >
          <div className="flex items-start justify-between">
            <span className="swiss-number text-xs opacity-60">06</span>
            <ArrowUpRight className="h-4 w-4 opacity-60" />
          </div>
          <div className="mt-auto">
            <h2 className="font-bold uppercase tracking-tight text-lg leading-tight">
              Archive
            </h2>
            <p className="text-xs opacity-70 mt-2 leading-relaxed">
              Centralized history of all analyses, reports and assessments with
              PDF export.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
