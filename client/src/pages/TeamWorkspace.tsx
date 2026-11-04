import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
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
  MessageSquare,
  Bell,
  ExternalLink,
  UserPlus,
  FileText,
  Download as DownloadIcon,
} from "lucide-react";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  completed: "Completed",
  waiting_review: "Waiting for Review",
  returned: "Returned for Correction",
  reviewed: "Reviewed",
  approved: "Approved",
  archived: "Archived",
};

const statusClasses: Record<string, string> = {
  draft: "border-slate-400 bg-slate-50 text-slate-700",
  in_progress: "border-sky-500 bg-sky-50 text-sky-800",
  completed: "border-emerald-500 bg-emerald-50 text-emerald-800",
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
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<number | null>(
    null
  );
  const [openedWorkItemId, setOpenedWorkItemId] = useState<number | null>(null);
  const [pdfFilename, setPdfFilename] = useState("opgeotech-shared-work");
  const [commentBody, setCommentBody] = useState("");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteRole, setInviteRole] = useState<
    "manager" | "engineer" | "reviewer" | "viewer"
  >("engineer");
  const [inviteUserId, setInviteUserId] = useState<number | null>(null);

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
  const members = trpc.collaboration.listMembers.useQuery(
    { teamId: teamId ?? 0 },
    { enabled: teamId !== null }
  );
  const notifications = trpc.collaboration.notifications.useQuery(undefined, {
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });
  const invitations = trpc.collaboration.invitations.useQuery(undefined, {
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });
  const userSearch = trpc.collaboration.searchUsers.useQuery(
    { teamId: teamId ?? 0, query: inviteSearch },
    {
      enabled:
        teamId !== null && showInviteForm && inviteSearch.trim().length >= 2,
    }
  );
  const comments = trpc.collaboration.comments.useQuery(
    { teamId: teamId ?? 0, workItemId: selectedWorkItemId ?? 0 },
    { enabled: teamId !== null && selectedWorkItemId !== null }
  );
  const versions = trpc.collaboration.history.useQuery(
    { teamId: teamId ?? 0, workItemId: selectedWorkItemId ?? 0 },
    { enabled: teamId !== null && selectedWorkItemId !== null }
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
  const assign = trpc.collaboration.assignWorkItem.useMutation({
    onSuccess: () => {
      if (teamId !== null)
        void utils.collaboration.listWorkItems.invalidate({
          teamId,
          projectId: projectId ?? undefined,
        });
      toast.success("Work item assigned");
    },
    onError: error => toast.error(error.message),
  });
  const addComment = trpc.collaboration.addComment.useMutation({
    onSuccess: () => {
      setCommentBody("");
      if (teamId !== null && selectedWorkItemId !== null)
        void utils.collaboration.comments.invalidate({
          teamId,
          workItemId: selectedWorkItemId,
        });
      void utils.collaboration.notifications.invalidate();
      toast.success("Comment added");
    },
    onError: error => toast.error(error.message),
  });
  const markNotificationRead =
    trpc.collaboration.markNotificationRead.useMutation({
      onSuccess: () => void utils.collaboration.notifications.invalidate(),
    });
  const inviteMember = trpc.collaboration.inviteMember.useMutation({
    onSuccess: () => {
      setInviteSearch("");
      setInviteUserId(null);
      setShowInviteForm(false);
      void utils.collaboration.notifications.invalidate();
      toast.success("Invitation sent");
    },
    onError: error => toast.error(error.message),
  });
  const respondToInvitation =
    trpc.collaboration.respondToInvitation.useMutation({
      onSuccess: () => {
        void utils.collaboration.invitations.invalidate();
        void utils.collaboration.listMyTeams.invalidate();
        toast.success("Invitation response saved");
      },
      onError: error => toast.error(error.message),
    });
  const restoreVersion = trpc.collaboration.updateWorkItem.useMutation({
    onSuccess: () => {
      if (teamId !== null)
        void utils.collaboration.listWorkItems.invalidate({
          teamId,
          projectId: projectId ?? undefined,
        });
      toast.success("Version restored as a new version");
    },
    onError: error => toast.error(error.message),
  });

  const selectedTeam = teams.data?.find(item => item.team.id === teamId)?.team;
  const selectedProject = projects.data?.find(item => item.id === projectId);
  const selectedWorkItem = work.data?.find(
    item => item.id === selectedWorkItemId
  );
  const openedWorkItem = work.data?.find(item => item.id === openedWorkItemId);
  const openedPayload = openedWorkItem?.payload as
    | {
        route?: string;
        module?: string;
        savedAt?: string;
        fields?: Record<string, unknown>;
        note?: string;
      }
    | undefined;
  useEffect(() => {
    if (openedWorkItem) {
      setPdfFilename(safePdfFilename(openedWorkItem.title));
    }
  }, [openedWorkItem]);
  const memberById = useMemo(
    () =>
      new Map(
        (members.data ?? []).map(member => [member.user.id, member.user])
      ),
    [members.data]
  );
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

  function continueWork(item: NonNullable<typeof work.data>[number]) {
    const payload = item.payload as { route?: string };
    localStorage.setItem(
      "opgeotech:resume-work-item",
      JSON.stringify({
        id: item.id,
        teamId,
        title: item.title,
        module: item.module,
        payload: item.payload,
      })
    );
    toast.success("Shared snapshot loaded. Opening the source module.");
    window.location.href = payload.route || "/";
  }

  function openWorkFile(item: NonNullable<typeof work.data>[number]) {
    setOpenedWorkItemId(item.id);
    toast.success(`Opened shared file: ${item.title}`);
  }

  function downloadOpenedPdf() {
    if (!openedWorkItem) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 18;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 20;
    const ensureSpace = (height: number) => {
      if (y + height > pageHeight - 18) {
        doc.addPage();
        y = 20;
      }
    };
    const addWrapped = (text: string, x: number, width: number, size = 10) => {
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, width) as string[];
      ensureSpace(lines.length * 5 + 3);
      doc.text(lines, x, y);
      y += lines.length * 5 + 3;
    };

    doc.setFillColor(211, 47, 47);
    doc.rect(margin, y - 5, 5, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("OPGeotech", margin + 9, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(new Date().toLocaleString(), pageWidth - margin, y, {
      align: "right",
    });
    y += 12;
    doc.setDrawColor(20, 20, 20);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    addWrapped(openedWorkItem.title, margin, pageWidth - margin * 2, 20);
    doc.setFont("helvetica", "normal");
    addWrapped("Shared work file", margin, pageWidth - margin * 2, 10);

    const metadata: Array<[string, string]> = [
      ["Module", openedWorkItem.module],
      ["Status", statusLabels[openedWorkItem.status] ?? openedWorkItem.status],
      ["Version", `v${openedWorkItem.versionNumber}`],
      ["Work item", `#${openedWorkItem.id}`],
      ["Saved route", openedPayload?.route ?? "Not specified"],
      [
        "Last saved",
        openedPayload?.savedAt
          ? new Date(openedPayload.savedAt).toLocaleString()
          : new Date(openedWorkItem.updatedAt).toLocaleString(),
      ],
    ];
    doc.setFont("helvetica", "normal");
    metadata.forEach(([label, value]) => {
      ensureSpace(10);
      doc.setFillColor(246, 246, 246);
      doc.rect(margin, y - 5, 48, 9, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(label, margin + 3, y + 1);
      doc.setFont("helvetica", "normal");
      addWrapped(value, margin + 52, pageWidth - margin * 2 - 52, 9);
    });
    y += 5;
    doc.setFont("helvetica", "bold");
    addWrapped("Saved form fields", margin, pageWidth - margin * 2, 13);
    doc.setFont("helvetica", "normal");
    Object.entries(openedPayload?.fields ?? {}).forEach(([field, value]) => {
      ensureSpace(10);
      const formatted = formatSharedValue(value);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(field, margin, y);
      doc.setFont("helvetica", "normal");
      addWrapped(formatted, margin + 55, pageWidth - margin * 2 - 55, 9);
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y + 1, pageWidth - margin, y + 1);
    });
    if (openedPayload?.note) {
      y += 5;
      doc.setFont("helvetica", "italic");
      addWrapped(openedPayload.note, margin, pageWidth - margin * 2, 9);
    }
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `OPGeotech · Shared work file · ${page}/${pages}`,
        margin,
        pageHeight - 9
      );
      doc.setTextColor(0, 0, 0);
    }
    doc.save(`${safePdfFilename(pdfFilename || openedWorkItem.title)}.pdf`);
    toast.success("Shared work PDF downloaded");
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

        {!!invitations.data?.length && (
          <Card className="rounded-none border-primary shadow-none">
            <CardHeader className="border-b border-primary px-4 py-4">
              <CardTitle className="text-sm uppercase tracking-widest">
                Pending invitations
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border px-4 py-0">
              {invitations.data.map(entry => (
                <div
                  key={entry.invitation.id}
                  className="flex flex-col justify-between gap-3 py-4 md:flex-row md:items-center"
                >
                  <div>
                    <p className="font-bold">{entry.team.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited by{" "}
                      {entry.inviter.name ||
                        entry.inviter.email ||
                        "Team administrator"}{" "}
                      · proposed role: {entry.invitation.role}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="rounded-none"
                      disabled={respondToInvitation.isPending}
                      onClick={() =>
                        respondToInvitation.mutate({
                          id: entry.invitation.id,
                          accept: true,
                        })
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-none border-foreground"
                      disabled={respondToInvitation.isPending}
                      onClick={() =>
                        respondToInvitation.mutate({
                          id: entry.invitation.id,
                          accept: false,
                        })
                      }
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="rounded-none border-foreground"
                      onClick={() => setShowInviteForm(value => !value)}
                    >
                      <UserPlus className="mr-2 h-4 w-4" /> Invite member
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-none border-foreground"
                      onClick={() => setShowProjectForm(value => !value)}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add project
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="px-4 py-4">
                {showInviteForm && teamId !== null && (
                  <div className="mb-4 border-2 border-primary bg-primary/5 p-4">
                    <p className="mb-3 text-sm font-bold uppercase tracking-widest">
                      Invite member
                    </p>
                    <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
                      <input
                        className="border border-foreground bg-background px-3 py-2 text-sm"
                        placeholder="Search by name or email"
                        value={inviteSearch}
                        onChange={event => {
                          setInviteSearch(event.target.value);
                          setInviteUserId(null);
                        }}
                      />
                      <select
                        className="border border-foreground bg-background px-3 py-2 text-sm"
                        value={inviteRole}
                        onChange={event =>
                          setInviteRole(event.target.value as typeof inviteRole)
                        }
                      >
                        <option value="manager">Manager</option>
                        <option value="engineer">Engineer</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <Button
                        className="rounded-none"
                        disabled={
                          inviteUserId === null || inviteMember.isPending
                        }
                        onClick={() =>
                          inviteUserId !== null &&
                          inviteMember.mutate({
                            teamId,
                            invitedUserId: inviteUserId,
                            role: inviteRole,
                          })
                        }
                      >
                        {inviteMember.isPending
                          ? "Sending…"
                          : "Send invitation"}
                      </Button>
                    </div>
                    {inviteSearch.trim().length >= 2 && (
                      <div className="mt-2 divide-y divide-border border border-border bg-background">
                        {(userSearch.data ?? []).map(user => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => {
                              setInviteUserId(user.id);
                              setInviteSearch(
                                user.name || user.email || `User ${user.id}`
                              );
                            }}
                            className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted ${inviteUserId === user.id ? "bg-primary/10" : ""}`}
                          >
                            <UserAvatar
                              name={user.name}
                              email={user.email}
                              avatarUrl={user.avatarUrl}
                            />
                            <span>
                              <strong>{user.name || "Unnamed user"}</strong>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {user.email || `User ${user.id}`}
                              </span>
                            </span>
                          </button>
                        ))}
                        {!userSearch.isLoading && !userSearch.data?.length && (
                          <p className="px-3 py-3 text-xs text-muted-foreground">
                            No matching user found.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
            {teamId !== null && (
              <Card className="rounded-none border-foreground shadow-none">
                <CardHeader className="border-b border-foreground px-4 py-4">
                  <CardTitle className="text-sm uppercase tracking-widest">
                    Team members
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3 px-4 py-4">
                  {(members.data ?? []).map(member => (
                    <div
                      key={member.user.id}
                      className="flex items-center gap-2 border border-border px-3 py-2"
                    >
                      <UserAvatar
                        name={member.user.name}
                        email={member.user.email}
                        avatarUrl={member.user.avatarUrl}
                      />
                      <div>
                        <p className="text-sm font-bold">
                          {member.user.name || "Unnamed user"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {member.user.email || `User ${member.user.id}`} ·{" "}
                          {member.membership.role}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

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
                        <th className="px-4 py-3">Assigned to</th>
                        <th className="px-4 py-3">Last edited</th>
                        <th className="px-4 py-3">Actions</th>
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
                              #{item.id} · Updated by{" "}
                              {memberById.get(item.updatedBy)?.name ||
                                memberById.get(item.updatedBy)?.email ||
                                `User ${item.updatedBy}`}
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
                          <td className="px-4 py-4">
                            <select
                              className="border border-border bg-background px-2 py-1 text-xs"
                              value={item.assignedTo ?? ""}
                              onChange={event =>
                                assign.mutate({
                                  teamId: teamId!,
                                  workItemId: item.id,
                                  assignedTo: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                              disabled={teamId === null || assign.isPending}
                            >
                              <option value="">Unassigned</option>
                              {(members.data ?? []).map(member => (
                                <option
                                  key={member.user.id}
                                  value={member.user.id}
                                >
                                  {member.user.name ||
                                    member.user.email ||
                                    `User ${member.user.id}`}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground">
                            {new Date(item.updatedAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-none border-foreground"
                                onClick={() => openWorkFile(item)}
                              >
                                <FileText className="mr-1 h-3.5 w-3.5" /> Open
                                file
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-none border-foreground"
                                onClick={() => continueWork(item)}
                              >
                                <ExternalLink className="mr-1 h-3.5 w-3.5" />{" "}
                                Continue
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-none border-foreground"
                                onClick={() => setSelectedWorkItemId(item.id)}
                              >
                                <MessageSquare className="mr-1 h-3.5 w-3.5" />{" "}
                                Comments
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!filteredWork.length && (
                        <tr>
                          <td
                            colSpan={7}
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
            {openedWorkItemId !== null && teamId !== null && openedWorkItem && (
              <Card className="rounded-none border-primary shadow-none">
                <CardHeader className="flex-row items-start justify-between gap-4 border-b border-primary bg-primary/5 px-4 py-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest">
                      <FileText className="h-4 w-4 text-primary" /> Opened
                      shared file
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {openedWorkItem.title} · {openedWorkItem.module} · version{" "}
                      {openedWorkItem.versionNumber}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="rounded-none"
                    onClick={() => continueWork(openedWorkItem)}
                  >
                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open in module
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4 px-4 py-4">
                  <div className="grid gap-3 text-xs sm:grid-cols-3">
                    <div className="border border-border p-3">
                      <span className="block uppercase tracking-widest text-muted-foreground">
                        Status
                      </span>
                      <strong className="mt-1 block text-sm">
                        {statusLabels[openedWorkItem.status] ??
                          openedWorkItem.status}
                      </strong>
                    </div>
                    <div className="border border-border p-3">
                      <span className="block uppercase tracking-widest text-muted-foreground">
                        Saved route
                      </span>
                      <strong className="mt-1 block break-all text-sm">
                        {openedPayload?.route ?? "Not specified"}
                      </strong>
                    </div>
                    <div className="border border-border p-3">
                      <span className="block uppercase tracking-widest text-muted-foreground">
                        Last saved
                      </span>
                      <strong className="mt-1 block text-sm">
                        {openedPayload?.savedAt
                          ? new Date(openedPayload.savedAt).toLocaleString()
                          : new Date(openedWorkItem.updatedAt).toLocaleString()}
                      </strong>
                    </div>
                  </div>
                  {openedPayload?.fields &&
                  Object.keys(openedPayload.fields).length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-widest">
                        Saved form fields
                      </p>
                      <div className="grid max-h-72 gap-2 overflow-y-auto border border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(openedPayload.fields).map(
                          ([field, value]) => (
                            <div
                              key={field}
                              className="min-w-0 border-b border-border pb-2"
                            >
                              <span className="block truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                                {field}
                              </span>
                              <span className="mt-1 block break-words text-sm">
                                {formatSharedValue(value)}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This shared file has no captured form fields.
                    </p>
                  )}
                  <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end">
                    <label className="min-w-0 flex-1 text-xs font-bold uppercase tracking-widest">
                      PDF filename
                      <input
                        className="mt-1 w-full border border-foreground bg-background px-3 py-2 text-sm font-normal"
                        value={pdfFilename}
                        onChange={event => setPdfFilename(event.target.value)}
                        placeholder="opgeotech-shared-work"
                      />
                    </label>
                    <Button
                      type="button"
                      className="rounded-none"
                      onClick={downloadOpenedPdf}
                    >
                      <DownloadIcon className="mr-2 h-4 w-4" /> Download PDF
                    </Button>
                  </div>
                  {openedPayload?.note && (
                    <p className="text-xs text-muted-foreground">
                      {openedPayload.note}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {selectedWorkItemId !== null && teamId !== null && (
              <Card className="rounded-none border-foreground shadow-none">
                <CardHeader className="border-b border-foreground px-4 py-4">
                  <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest">
                    <MessageSquare className="h-4 w-4 text-primary" /> Comments
                    · Work item #{selectedWorkItemId}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 py-4">
                  {(comments.data ?? []).map(comment => (
                    <div
                      key={comment.comment.id}
                      className="border-l-2 border-primary bg-muted/30 px-3 py-2 text-sm"
                    >
                      <p>{comment.comment.body}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                        {comment.user.name ||
                          comment.user.email ||
                          `User ${comment.user.id}`}{" "}
                        · {new Date(comment.comment.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {!comments.data?.length && (
                    <p className="text-sm text-muted-foreground">
                      No comments yet.
                    </p>
                  )}
                  <form
                    className="flex gap-2"
                    onSubmit={event => {
                      event.preventDefault();
                      if (commentBody.trim())
                        addComment.mutate({
                          teamId,
                          workItemId: selectedWorkItemId,
                          body: commentBody.trim(),
                        });
                    }}
                  >
                    <input
                      className="min-w-0 flex-1 border border-foreground bg-background px-3 py-2 text-sm"
                      placeholder="Write a comment for the team…"
                      value={commentBody}
                      onChange={event => setCommentBody(event.target.value)}
                    />
                    <Button
                      className="rounded-none"
                      disabled={addComment.isPending}
                    >
                      Comment
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
            {selectedWorkItemId !== null &&
              teamId !== null &&
              selectedWorkItem && (
                <Card className="rounded-none border-amber-600 shadow-none">
                  <CardHeader className="border-b border-amber-600 bg-amber-50 px-4 py-4">
                    <CardTitle className="text-sm uppercase tracking-widest">
                      Conflict resolution · #{selectedWorkItemId}
                    </CardTitle>
                    <p className="mt-1 text-xs text-amber-900">
                      Choose a saved version to restore it as a new version. The
                      current version is never deleted.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 py-4">
                    {(versions.data ?? []).map(version => (
                      <div
                        key={version.id}
                        className="flex flex-col justify-between gap-3 border border-border p-3 sm:flex-row sm:items-center"
                      >
                        <div>
                          <p className="font-bold">
                            Version {version.versionNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Edited by{" "}
                            {memberById.get(version.userId)?.name ||
                              memberById.get(version.userId)?.email ||
                              `User ${version.userId}`}{" "}
                            · {new Date(version.createdAt).toLocaleString()} ·{" "}
                            {version.changeSummary || "No change summary"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-none border-foreground"
                          disabled={
                            restoreVersion.isPending ||
                            version.versionNumber ===
                              selectedWorkItem.versionNumber
                          }
                          onClick={() =>
                            restoreVersion.mutate({
                              teamId,
                              id: selectedWorkItem.id,
                              expectedVersion: selectedWorkItem.versionNumber,
                              payload: version.payload as Record<
                                string,
                                unknown
                              >,
                              changeSummary: `Restored version ${version.versionNumber}`,
                            })
                          }
                        >
                          {version.versionNumber ===
                          selectedWorkItem.versionNumber
                            ? "Current version"
                            : "Restore this version"}
                        </Button>
                      </div>
                    ))}
                    {!versions.data?.length && (
                      <p className="text-sm text-muted-foreground">
                        No version history available.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            {!!notifications.data?.length && (
              <Card className="rounded-none border-foreground shadow-none">
                <CardHeader className="border-b border-foreground px-4 py-4">
                  <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest">
                    <Bell className="h-4 w-4 text-primary" /> Notifications
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border px-4 py-0">
                  {notifications.data.slice(0, 8).map(notification => (
                    <div
                      key={notification.id}
                      className={`flex items-center justify-between gap-4 py-3 text-sm ${notification.readAt ? "opacity-60" : "font-semibold"}`}
                    >
                      <span>{notification.message}</span>
                      {!notification.readAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-none border-foreground"
                          onClick={() =>
                            markNotificationRead.mutate({ id: notification.id })
                          }
                        >
                          Mark read
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
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

function UserAvatar({
  name,
  email,
  avatarUrl,
}: {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}) {
  const initials = (name || email || "U")
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={name || "User avatar"}
      className="h-9 w-9 rounded-full border border-foreground object-cover"
    />
  ) : (
    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground bg-primary text-xs font-black text-primary-foreground">
      {initials}
    </span>
  );
}

function safePdfFilename(value: string) {
  const cleaned = value
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "opgeotech-shared-work";
}

function formatSharedValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
