import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Check, FolderKanban, Save, Users, X } from "lucide-react";
import { toast } from "sonner";

export default function SaveToTeamWorkspace({
  module,
  title,
}: {
  module: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const teams = trpc.collaboration.listMyTeams.useQuery(undefined, {
    enabled: open,
  });
  const projects = trpc.collaboration.listProjects.useQuery(
    { teamId: teamId ?? 0 },
    { enabled: open && teamId !== null }
  );
  const save = trpc.collaboration.createWorkItem.useMutation({
    onSuccess: result => {
      setOpen(false);
      toast.success(`Saved to Team Workspace · Work item #${result.id}`);
    },
    onError: error => toast.error(error.message),
  });

  function saveWork() {
    if (teamId === null || projectId === null) return;
    save.mutate({
      teamId,
      projectId,
      module,
      title,
      payload: {
        source: "module-header",
        module,
        route: window.location.pathname,
        savedAt: new Date().toISOString(),
        note: "Shared workspace snapshot created from the module header.",
      },
    });
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        className="rounded-none border-foreground"
        onClick={() => setOpen(value => !value)}
      >
        <Save className="mr-2 h-4 w-4" /> Save to Team Workspace
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(360px,calc(100vw-2rem))] border-2 border-foreground bg-background p-4 shadow-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold">
                <Users className="h-4 w-4 text-primary" /> Save shared work
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose where other team members can continue this module.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {!teams.data?.length && !teams.isLoading ? (
            <p className="border border-amber-600 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              No team is available. Create a team first in{" "}
              <a className="font-bold underline" href="/team-workspace">
                Team Workspace
              </a>
              .
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider">
                Team
                <select
                  className="mt-1 w-full border border-foreground bg-background px-2 py-2 text-sm font-normal"
                  value={teamId ?? ""}
                  onChange={event => {
                    setTeamId(Number(event.target.value));
                    setProjectId(null);
                  }}
                >
                  <option value="">Select a team</option>
                  {(teams.data ?? []).map(({ team }) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider">
                Project
                <select
                  className="mt-1 w-full border border-foreground bg-background px-2 py-2 text-sm font-normal"
                  value={projectId ?? ""}
                  onChange={event => setProjectId(Number(event.target.value))}
                  disabled={teamId === null}
                >
                  <option value="">Select a project</option>
                  {(projects.data ?? []).map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FolderKanban className="h-3.5 w-3.5" /> {module}
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-none"
                  disabled={
                    teamId === null || projectId === null || save.isPending
                  }
                  onClick={saveWork}
                >
                  {save.isPending ? (
                    "Saving…"
                  ) : (
                    <>
                      <Check className="mr-1 h-4 w-4" /> Save shared work
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
