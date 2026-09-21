import { useLocation } from "wouter";
import { ArrowUpRight, Drill, FileSpreadsheet } from "lucide-react";
import { ModuleHeader, SectionLabel } from "@/components/ModuleHeader";

const modules = [
  {
    title: "Drillhole Planning",
    description: "Import DXF plans in their original coordinates, place collars and review planned hole traces.",
    path: "/drilling/planning",
    icon: Drill,
    index: "01",
  },
  {
    title: "Logging Data",
    description: "Capture rock mass, soil and discontinuity logging by interval using the HOLEID workbook structure.",
    path: "/drilling/logging",
    icon: FileSpreadsheet,
    index: "02",
  },
];

export default function Drilling() {
  const [, setLocation] = useLocation();

  return (
    <div>
      <ModuleHeader
        index="06"
        title="Drilling"
        description="Plan geotechnical drillholes and manage interval-based geological logging in one drilling workspace."
      />
      <SectionLabel>Drilling modules</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 max-w-5xl">
        {modules.map(({ title, description, path, icon: Icon, index }) => (
          <button
            key={path}
            type="button"
            onClick={() => setLocation(path)}
            className="text-left border border-foreground bg-background p-6 min-h-56 transition-colors hover:bg-primary hover:text-primary-foreground group"
          >
            <div className="flex items-start justify-between">
              <span className="font-mono text-xs tracking-widest opacity-70">{index}</span>
              <ArrowUpRight className="h-5 w-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
            </div>
            <Icon className="h-9 w-9 mt-8 mb-5 text-primary group-hover:text-primary-foreground" />
            <h2 className="text-2xl font-black uppercase tracking-tight">{title}</h2>
            <p className="text-sm mt-2 max-w-md opacity-75">{description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export { modules as drillingModules };
