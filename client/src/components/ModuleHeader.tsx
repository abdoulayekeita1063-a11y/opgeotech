/**
 * Swiss-style module header: red square, uppercase mono index,
 * bold headline, fine bottom rule.
 */
import SaveToTeamWorkspace from "@/components/SaveToTeamWorkspace";
import { useEffect, useState } from "react";

type ResumeSnapshot = {
  id: number;
  title: string;
  module: string;
  payload?: { route?: string; fields?: Record<string, string | boolean> };
};

export function ModuleHeader({
  index,
  title,
  description,
  module,
}: {
  index: string;
  title: string;
  description: string;
  module?: string;
}) {
  const [resume, setResume] = useState<ResumeSnapshot | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("opgeotech:resume-work-item");
      if (!saved) return;
      const candidate = JSON.parse(saved) as ResumeSnapshot;
      if (candidate.payload?.route !== window.location.pathname) return;
      setResume(candidate);
      const fields = candidate.payload?.fields ?? {};
      const controls = Array.from(
        document.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >("main input, main select, main textarea")
      );
      controls.forEach((control, index) => {
        const key =
          control.name ||
          control.id ||
          control.getAttribute("aria-label") ||
          `field_${index + 1}`;
        const value = fields[key];
        if (value === undefined) return;
        if (
          control instanceof HTMLInputElement &&
          control.type === "checkbox"
        ) {
          control.checked = value === true || value === "true";
        } else {
          control.value = String(value);
        }
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      });
    } catch {
      localStorage.removeItem("opgeotech:resume-work-item");
    }
  }, []);

  function dismissResume() {
    localStorage.removeItem("opgeotech:resume-work-item");
    setResume(null);
  }

  return (
    <header className="border-b-2 border-foreground pb-6 mb-8">
      <div className="flex flex-col gap-4 mb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="swiss-square" />
          <span className="swiss-label">Module {index}</span>
        </div>
        {module && <SaveToTeamWorkspace module={module} title={title} />}
      </div>
      <h1 className="text-3xl md:text-4xl font-extrabold uppercase tracking-tight leading-none">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
        {description}
      </p>
      {resume && (
        <div className="mt-5 flex flex-col justify-between gap-3 border border-primary bg-primary/5 p-3 text-sm sm:flex-row sm:items-center">
          <p>
            <strong>Shared work resumed:</strong> {resume.title} · Work item #
            {resume.id}. Matching saved fields were restored where possible.
          </p>
          <button
            type="button"
            onClick={dismissResume}
            className="shrink-0 text-xs font-bold uppercase tracking-wider underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </header>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span
        className="swiss-square"
        style={{ width: "0.5rem", height: "0.5rem" }}
      />
      <span className="swiss-label">{children}</span>
    </div>
  );
}
