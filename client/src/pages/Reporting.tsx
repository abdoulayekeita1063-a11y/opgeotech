import { useEffect, useState } from "react";
import { ClipboardList, FileBarChart, TableProperties } from "lucide-react";
import { ModuleHeader } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import DailyInspections from "./DailyInspections";
import FailureRecords from "./FailureRecords";
import FailureReportDashboard from "@/components/FailureReportDashboard";

type ReportingTab = "inspections" | "failures" | "analysis";
const validTabs: ReportingTab[] = ["inspections", "failures", "analysis"];

function tabFromHash(): ReportingTab {
  const value = window.location.hash.replace("#", "") as ReportingTab;
  return validTabs.includes(value) ? value : "inspections";
}

export default function Reporting() {
  const [tab, setTab] = useState<ReportingTab>(() => tabFromHash());
  const { data: failures = [] } = trpc.reporting.failures.list.useQuery();
  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const selectTab = (next: ReportingTab) => {
    window.location.hash = next;
    setTab(next);
  };
  const tabs = [
    {
      id: "inspections" as const,
      label: "Daily Inspections",
      icon: ClipboardList,
    },
    {
      id: "failures" as const,
      label: "Failure Records",
      icon: TableProperties,
    },
    { id: "analysis" as const, label: "Failure Analysis", icon: FileBarChart },
  ];
  return (
    <div className="max-w-[1500px] mx-auto px-4 py-8">
      <ModuleHeader
        index="01"
        title="Reporting"
        description="Central reporting workspace for AI-assisted daily inspections, fall-of-ground incident records and interactive trend analysis."
        module="Reporting"
      />
      <div className="flex flex-wrap border border-foreground w-fit mb-8 no-print">
        {tabs.map(item => (
          <Button
            key={item.id}
            variant="ghost"
            onClick={() => selectTab(item.id)}
            className={`rounded-none h-12 border-r border-foreground last:border-r-0 px-6 ${tab === item.id ? "bg-black text-white hover:bg-black hover:text-white" : ""}`}
          >
            <item.icon className="h-4 w-4" /> {item.label}
          </Button>
        ))}
      </div>
      {tab === "inspections" && <DailyInspections embedded />}
      {tab === "failures" && <FailureRecords />}
      {tab === "analysis" && <FailureReportDashboard rows={failures} />}
    </div>
  );
}
