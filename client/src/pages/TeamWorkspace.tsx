import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  FolderKanban,
  RefreshCw,
  Plus,
  Search,
  Clock3,
  ShieldCheck,
  GitBranch,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  waiting_review: "Waiting for Review",
  returned: "Returned for Correction",
  reviewed: "Reviewed",
  approved: "Approved",
  archived: "Archived",
};

const statusClasses: Record<string, string> = {
  draft: "border-slate-400 bg-slate-50 text-slate-700",
  in_progress: "border-sky-500 bg-sky-50 text-sky-800",
  waiting_review: "border-amber-500 bg-amber-50 text-amber-800",
  returned: "border-red-500 bg-red-50 text-red-800",
  reviewed: "border-violet-500 bg-violet-50 text-violet-800",
  approved: "border-emerald-500 bg-emerald-50 text-emerald-800",
  archived: "border-slate-500 bg-slate-100 text-slate-700",
};

export default function TeamWorkspace() {
  const utils = trpc.useUtils();
  const [teamId, setTeamId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [teamName, setTeamName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);

  const teams = trpc.collaboration.listMyTeams.useQuery();
  const projects = trpc.collaboration.listProjects.useQuery(
    { teamId: teamId ?? 0 },
    { enabled: teamId !== null }
  );
  const work = trpc.collaboration.listWorkItems.useQuery(
    { teamId: teamId ?? 0, projectId: projectId ?? undefined },
    { enabled: teamId !== null }
  );
  const pending = trpc.collaboration.pendingOfflineOperations.useQuery(
    { teamId: teamId ?? 0 },
    { enabled: teamId !== null }
  );

  const createTeam = trpc.collaboration.createTeam.useMutation({
    onSuccess: result => {
      setTeamName("");
      setShowTeamForm(false);
      setTeamId(result.id);
      void utils.collaboration.listMyTeams.invalidate();
      toast.success("Team created");
    },
    onError: error => toast.error(error.message),
  });
  const createProject = trpc.collaboration.createProject.useMutation({
    onSuccess: result => {
      setProjectName("");
      setShowProjectForm(false);
      setProjectId(result.id);
      if (teamId !== null)
        void utils.collaboration.listProjects.invalidate({ teamId });
      toast.success("Project created");
    },
    onError: error => toast.error(error.message),
  });

  const selectedTeam = teams.data?.find(item => item.team.id === teamId)?.team;
  const selectedProject = projects.data?.find(item => item.id === projectId);
  const filteredWork = useMemo(
    () =>
      (work.data ?? []).filter(item => {
        const matchesStatus =
          statusFilter === "all" || item.status === statusFilter;
        const needle = search.trim().toLowerCase();
        return (
          matchesStatus &&
          (!needle ||
            `${item.title} ${item.module} ${item.status}`
              .toLowerCase()
              .includes(needle))
        );
      }),
    [work.data, search, statusFilter]
  );

  function selectTeam(id: number) {
    setTeamId(id);
    setProjectId(null);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-8">
        <header className="flex flex-col justify-between gap-5 border-b border-foreground pb-6 lg:flex-row lg:items-end">
          <div>
            <p className="swiss-label mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Collaboration
            </p>
            <h1 className="text-4xl font-black tracking-tight md:text-6xl">
              Team Workspace
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Continue shared geotechnical work across teams, projects and
              modules without creating personal copies.
            </p>
          </div>
          <div className="flex items-center gap-2 border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-600" /> Online ·
            shared data enabled
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="rounded-none border-foreground shadow-none">
            <CardHeader className="border-b border-foreground px-4 py-4">
              <CardTitle className="flex items-center justify-between text-sm uppercase tracking-widest">
                My teams{" "}
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 rounded-none border-foreground"
                  onClick={() => setShowTeamForm(value => !value)}
                  aria-label="Create team"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 py-4">
              {showTeamForm && (
                <form
                  className="space-y-2 border border-foreground p-3"
                  onSubmit={event => {
                    event.preventDefault();
                    if (teamName.trim())
                      createTeam.mutate({ name: teamName.trim() });
                  }}
                >
                  <input
                    autoFocus
                    className="w-full border border-foreground bg-background px-2 py-2 text-sm"
                    placeholder="Team name"
                    value={teamName}
                    onChange={event => setTeamName(event.target.value)}
                  />
                  <Button
                    className="w-full rounded-none"
                    size="sm"
                    disabled={createTeam.isPending}
                  >
                    {createTeam.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Create team"
                    )}
                  </Button>
                </form>
              )}
              {teams.isLoading && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
              {!teams.isLoading && !teams.data?.length && (
                <p className="text-sm text-muted-foreground">
                  No team yet. Create one to start shared work.
                </p>
              )}
              {(teams.data ?? []).map(({ team, membership }) => (
                <button
                  key={team.id}
                  onClick={() => selectTeam(team.id)}
                  className={`w-full border p-3 text-left transition-colors ${teamId === team.id ? "border-primary bg-primary/5" : "border-border hover:border-foreground"}`}
                >
                  <span className="block font-bold">{team.name}</span>
                  <span className="mt-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    {membership.role} · Team {team.id}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-none border-foreground shadow-none">
              <CardHeader className="flex-row items-center justify-between border-b border-foreground px-4 py-4">
                <div>
                  <CardTitle className="text-sm uppercase tracking-widest">
                    {selectedTeam?.name ?? "Select a team"}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Projects shared with your team
                  </p>
                </div>
                {teamId !== null && (
                  <Button
                    variant="outline"
                    className="rounded-none border-foreground"
                    onClick={() => setShowProjectForm(value => !value)}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add project
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-4 py-4">
                {showProjectForm && teamId !== null && (
                  <form
                    className="mb-4 flex flex-col gap-2 border border-foreground p-3 sm:flex-row"
                    onSubmit={event => {
                      event.preventDefault();
                      if (projectName.trim())
                        createProject.mutate({
                          teamId,
                          name: projectName.trim(),
                        });
                    }}
                  >
                    <input
                      autoFocus
                      className="flex-1 border border-foreground bg-background px-3 py-2 text-sm"
                      placeholder="Project name"
                      value={projectName}
                      onChange={event => setProjectName(event.target.value)}
                    />
                    <Button
                      className="rounded-none"
                      disabled={createProject.isPending}
                    >
                      {createProject.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Create project"
                      )}
                    </Button>
                  </form>
                )}
                {!teamId && (
                  <p className="text-sm text-muted-foreground">
                    Choose a team on the left to see its projects and shared
                    work.
                  </p>
                )}
                {teamId && (
                  <div className="flex flex-wrap gap-2">
                    {(projects.data ?? []).map(project => (
                      <button
                        key={project.id}
                        onClick={() => setProjectId(project.id)}
                        className={`flex items-center gap-2 border px-3 py-2 text-sm ${projectId === project.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-foreground"}`}
                      >
                        <FolderKanban className="h-4 w-4" />
                        {project.name}
                      </button>
                    ))}
                    {!projects.isLoading && !projects.data?.length && (
                      <p className="text-sm text-muted-foreground">
                        No projects in this team yet.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                icon={<GitBranch />}
                label="Shared work"
                value={String(work.data?.length ?? 0)}
              />
              <Metric
                icon={<Clock3 />}
                label="Pending sync"
                value={String(pending.data?.length ?? 0)}
              />
              <Metric
                icon={<ShieldCheck />}
                label="Current scope"
                value={selectedProject?.name ?? "All projects"}
              />
            </div>

            <Card className="rounded-none border-foreground shadow-none">
              <CardHeader className="gap-4 border-b border-foreground px-4 py-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <CardTitle className="text-sm uppercase tracking-widest">
                      {selectedProject?.name ?? "Team work"}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Every update is versioned and attributed to its author.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-none border-foreground"
                    onClick={() => {
                      void work.refetch();
                      void pending.refetch();
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                  </Button>
                </div>
                <div className="flex flex-col gap-2 md:flex-row">
                  <label className="flex flex-1 items-center gap-2 border border-border px-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      className="w-full bg-transparent py-2 text-sm outline-none"
                      placeholder="Search work, module or title…"
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                    />
                  </label>
                  <select
                    className="border border-border bg-background px-3 py-2 text-sm"
                    value={statusFilter}
                    onChange={event => setStatusFilter(event.target.value)}
                  >
                    <option value="all">All statuses</option>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-foreground bg-muted/40 text-xs uppercase tracking-widest">
                      <tr>
                        <th className="px-4 py-3">Work item</th>
                        <th className="px-4 py-3">Module</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Version</th>
                        <th className="px-4 py-3">Last edited</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWork.map(item => (
                        <tr
                          key={item.id}
                          className="border-b border-border last:border-0 hover:bg-muted/20"
                        >
                          <td className="px-4 py-4">
                            <p className="font-bold">{item.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              #{item.id} · Updated by user {item.updatedBy}
                            </p>
                          </td>
                          <td className="px-4 py-4 font-mono text-xs uppercase">
                            {item.module}
                          </td>
                          <td className="px-4 py-4">
                            <Badge
                              className={`rounded-none border ${statusClasses[item.status] ?? ""}`}
                            >
                              {statusLabels[item.status] ?? item.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 font-mono">
                            v{item.versionNumber}
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground">
                            {new Date(item.updatedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {!filteredWork.length && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-12 text-center text-sm text-muted-foreground"
                          >
                            {teamId
                              ? "No shared work matches the current filters."
                              : "Select a team to load shared work."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-foreground bg-background p-4">
      <div className="flex items-center justify-between text-primary">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-3 truncate text-xl font-black">{value}</p>
    </div>
  );
}
