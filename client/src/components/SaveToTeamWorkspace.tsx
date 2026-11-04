import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Check, FolderKanban, Save, Users, X } from "lucide-react";
import { toast } from "sonner";

const workStatuses = [
  ["draft", "Draft"],
  ["in_progress", "In Progress"],
  ["completed", "Completed"],
  ["waiting_review", "Waiting for Review"],
  ["returned", "Returned for Correction"],
  ["reviewed", "Reviewed"],
  ["approved", "Approved"],
  ["archived", "Archived"],
] as const;
type WorkStatus = (typeof workStatuses)[number][0];

type ResumeRef = { id: number; teamId: number };

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
  const [status, setStatus] = useState<WorkStatus>("draft");
  const [resume, setResume] = useState<ResumeRef | null>(null);

  const teams = trpc.collaboration.listMyTeams.useQuery(undefined, {
    enabled: open,
  });
  const projects = trpc.collaboration.listProjects.useQuery(
    { teamId: teamId ?? 0 },
    { enabled: open && teamId !== null }
  );
  useEffect(() => {
    try {
      const saved = localStorage.getItem("opgeotech:resume-work-item");
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        id?: number;
        teamId?: number;
        payload?: { route?: string };
      };
      if (
        parsed.id &&
        parsed.teamId &&
        parsed.payload?.route === window.location.pathname
      ) {
        setResume({ id: parsed.id, teamId: parsed.teamId });
        setTeamId(parsed.teamId);
      }
    } catch {
      // ModuleHeader handles cleanup of malformed resume snapshots.
    }
  }, []);
  const resumedItem = trpc.collaboration.getWorkItem.useQuery(
    { teamId: resume?.teamId ?? 0, id: resume?.id ?? 0 },
    { enabled: open && resume !== null }
  );
  useEffect(() => {
    if (resumedItem.data) setStatus(resumedItem.data.status as WorkStatus);
  }, [resumedItem.data]);

  const save = trpc.collaboration.createWorkItem.useMutation({
    onSuccess: result => {
      setOpen(false);
      toast.success(`Saved to Team Workspace · Work item #${result.id}`);
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.collaboration.updateWorkItem.useMutation({
    onSuccess: result => {
      setOpen(false);
      toast.success(`Work status updated · version ${result.versionNumber}`);
    },
    onError: error => toast.error(error.message),
  });

  function saveWork() {
    if (teamId === null || (projectId === null && !resumedItem.data)) return;
    const fields = Array.from(
      document.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("main input, main select, main textarea")
    ).reduce<Record<string, string | boolean>>((snapshot, field, index) => {
      if (field.type === "file") return snapshot;
      const baseKey =
        field.name ||
        field.id ||
        field.getAttribute("aria-label") ||
        `field_${index + 1}`;
      const key =
        snapshot[baseKey] === undefined ? baseKey : `${baseKey}_${index + 1}`;
      snapshot[key] =
        field instanceof HTMLInputElement && field.type === "checkbox"
          ? field.checked
          : field.value;
      return snapshot;
    }, {});
    const payload = {
      source: "module-header",
      module,
      route: window.location.pathname,
      savedAt: new Date().toISOString(),
      fields,
      note: "Shared workspace snapshot captured from the visible module form.",
    };
    if (resumedItem.data && resume) {
      update.mutate({
        teamId: resume.teamId,
        id: resume.id,
        expectedVersion: resumedItem.data.versionNumber,
        payload,
        status,
        changeSummary: `Status changed to ${status}`,
      });
      return;
    }
    save.mutate({
      teamId,
      projectId: projectId!,
      module,
      title,
      status,
      payload,
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
                Choose a status so the team can track progress.
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
          {!teams.data?.length && !teams.isLoading && !resume ? (
            <p className="border border-amber-600 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              No team is available. Create a team first in{" "}
              <a className="font-bold underline" href="/team-workspace">
                Team Workspace
              </a>
              .
            </p>
          ) : (
            <div className="space-y-3">
              {!resumedItem.data && (
                <>
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
                      onChange={event =>
                        setProjectId(Number(event.target.value))
                      }
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
                </>
              )}
              <label className="block text-xs font-bold uppercase tracking-wider">
                Work status
                <select
                  className="mt-1 w-full border border-foreground bg-background px-2 py-2 text-sm font-normal"
                  value={status}
                  onChange={event =>
                    setStatus(event.target.value as WorkStatus)
                  }
                >
                  {workStatuses.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
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
                    teamId === null ||
                    (projectId === null && !resumedItem.data) ||
                    save.isPending ||
                    update.isPending ||
                    resumedItem.isLoading
                  }
                  onClick={saveWork}
                >
                  {save.isPending || update.isPending ? (
                    "Saving…"
                  ) : (
                    <>
                      <Check className="mr-1 h-4 w-4" />{" "}
                      {resumedItem.data ? "Update status" : "Save shared work"}
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
