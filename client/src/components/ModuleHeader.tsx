/**
 * Swiss-style module header: red square, uppercase mono index,
 * bold headline, fine bottom rule.
 */
import SaveToTeamWorkspace from "@/components/SaveToTeamWorkspace";

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
