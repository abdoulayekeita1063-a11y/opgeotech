import { and, desc, eq, inArray, like, ne, or } from "drizzle-orm";
import {
  collaborationAuditEvents,
  collaborationComments,
  collaborationInvitations,
  collaborationNotifications,
  collaborationProjects,
  collaborationSyncOperations,
  collaborationTeamMembers,
  collaborationTeams,
  collaborationVersions,
  collaborationWorkItems,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

export async function createTeam(values: { name: string; createdBy: number }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [teamResult] = await tx.insert(collaborationTeams).values(values);
    const teamId = Number(teamResult.insertId);
    await tx.insert(collaborationTeamMembers).values({
      teamId,
      userId: values.createdBy,
      role: "admin",
    });
    return teamId;
  });
}

export async function listTeamsForUser(userId: number) {
  const db = await requireDb();
  return db
    .select({ team: collaborationTeams, membership: collaborationTeamMembers })
    .from(collaborationTeamMembers)
    .innerJoin(
      collaborationTeams,
      eq(collaborationTeams.id, collaborationTeamMembers.teamId)
    )
    .where(eq(collaborationTeamMembers.userId, userId));
}

export async function getMembership(teamId: number, userId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(collaborationTeamMembers)
    .where(
      and(
        eq(collaborationTeamMembers.teamId, teamId),
        eq(collaborationTeamMembers.userId, userId)
      )
    )
    .limit(1);
  return rows[0];
}

export async function addTeamMember(values: {
  teamId: number;
  userId: number;
  role: "admin" | "manager" | "engineer" | "reviewer" | "viewer";
}) {
  const db = await requireDb();
  await db.insert(collaborationTeamMembers).values(values);
}

export async function listTeamMembers(teamId: number) {
  const db = await requireDb();
  return db
    .select({ membership: collaborationTeamMembers, user: users })
    .from(collaborationTeamMembers)
    .innerJoin(users, eq(users.id, collaborationTeamMembers.userId))
    .where(eq(collaborationTeamMembers.teamId, teamId));
}

export async function searchUsers(query: string, excludeUserId: number) {
  const db = await requireDb();
  const pattern = `%${query.trim()}%`;
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      and(
        or(like(users.name, pattern), like(users.email, pattern)),
        ne(users.id, excludeUserId)
      )
    )
    .limit(20);
}

export async function createInvitation(input: {
  teamId: number;
  invitedUserId: number;
  invitedBy: number;
  role: "manager" | "engineer" | "reviewer" | "viewer";
}) {
  const db = await requireDb();
  const [result] = await db.insert(collaborationInvitations).values(input);
  await db.insert(collaborationNotifications).values({
    teamId: input.teamId,
    userId: input.invitedUserId,
    type: "invitation",
    message: "You have been invited to join a geotechnical team.",
  });
  return Number(result.insertId);
}

export async function listInvitationsForUser(userId: number) {
  const db = await requireDb();
  return db
    .select({
      invitation: collaborationInvitations,
      team: collaborationTeams,
      inviter: users,
    })
    .from(collaborationInvitations)
    .innerJoin(
      collaborationTeams,
      eq(collaborationTeams.id, collaborationInvitations.teamId)
    )
    .innerJoin(users, eq(users.id, collaborationInvitations.invitedBy))
    .where(
      and(
        eq(collaborationInvitations.invitedUserId, userId),
        eq(collaborationInvitations.status, "pending")
      )
    )
    .orderBy(desc(collaborationInvitations.createdAt));
}

export async function respondToInvitation(input: {
  id: number;
  userId: number;
  accept: boolean;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(collaborationInvitations)
      .where(
        and(
          eq(collaborationInvitations.id, input.id),
          eq(collaborationInvitations.invitedUserId, input.userId),
          eq(collaborationInvitations.status, "pending")
        )
      )
      .limit(1);
    const invitation = rows[0];
    if (!invitation) return false;
    await tx
      .update(collaborationInvitations)
      .set({
        status: input.accept ? "accepted" : "declined",
        respondedAt: new Date(),
      })
      .where(eq(collaborationInvitations.id, input.id));
    if (input.accept) {
      await tx.insert(collaborationTeamMembers).values({
        teamId: invitation.teamId,
        userId: input.userId,
        role: invitation.role,
      });
    }
    return true;
  });
}

export async function createProject(values: {
  teamId: number;
  name: string;
  description?: string;
  createdBy: number;
}) {
  const db = await requireDb();
  const [result] = await db.insert(collaborationProjects).values(values);
  return Number(result.insertId);
}

export async function deleteProject(input: {
  projectId: number;
  teamId: number;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const project = await tx
      .select({ id: collaborationProjects.id })
      .from(collaborationProjects)
      .where(
        and(
          eq(collaborationProjects.id, input.projectId),
          eq(collaborationProjects.teamId, input.teamId)
        )
      )
      .limit(1);
    if (!project[0]) return false;
    const items = await tx
      .select({ id: collaborationWorkItems.id })
      .from(collaborationWorkItems)
      .where(
        and(
          eq(collaborationWorkItems.projectId, input.projectId),
          eq(collaborationWorkItems.teamId, input.teamId)
        )
      );
    const ids = items.map(item => item.id);
    if (ids.length) {
      await tx
        .delete(collaborationNotifications)
        .where(inArray(collaborationNotifications.workItemId, ids));
      await tx
        .delete(collaborationComments)
        .where(inArray(collaborationComments.workItemId, ids));
      await tx
        .delete(collaborationVersions)
        .where(inArray(collaborationVersions.workItemId, ids));
      await tx
        .delete(collaborationAuditEvents)
        .where(inArray(collaborationAuditEvents.workItemId, ids));
      await tx
        .delete(collaborationSyncOperations)
        .where(inArray(collaborationSyncOperations.workItemId, ids));
      await tx
        .delete(collaborationWorkItems)
        .where(inArray(collaborationWorkItems.id, ids));
    }
    await tx
      .delete(collaborationProjects)
      .where(eq(collaborationProjects.id, input.projectId));
    return true;
  });
}

export async function deleteTeam(teamId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const team = await tx
      .select({ id: collaborationTeams.id })
      .from(collaborationTeams)
      .where(eq(collaborationTeams.id, teamId))
      .limit(1);
    if (!team[0]) return false;
    const items = await tx
      .select({ id: collaborationWorkItems.id })
      .from(collaborationWorkItems)
      .where(eq(collaborationWorkItems.teamId, teamId));
    const ids = items.map(item => item.id);
    if (ids.length) {
      await tx
        .delete(collaborationNotifications)
        .where(inArray(collaborationNotifications.workItemId, ids));
      await tx
        .delete(collaborationComments)
        .where(inArray(collaborationComments.workItemId, ids));
      await tx
        .delete(collaborationVersions)
        .where(inArray(collaborationVersions.workItemId, ids));
      await tx
        .delete(collaborationAuditEvents)
        .where(inArray(collaborationAuditEvents.workItemId, ids));
      await tx
        .delete(collaborationSyncOperations)
        .where(inArray(collaborationSyncOperations.workItemId, ids));
      await tx
        .delete(collaborationWorkItems)
        .where(inArray(collaborationWorkItems.id, ids));
    }
    await tx
      .delete(collaborationNotifications)
      .where(eq(collaborationNotifications.teamId, teamId));
    await tx
      .delete(collaborationAuditEvents)
      .where(eq(collaborationAuditEvents.teamId, teamId));
    await tx
      .delete(collaborationSyncOperations)
      .where(eq(collaborationSyncOperations.teamId, teamId));
    await tx
      .delete(collaborationInvitations)
      .where(eq(collaborationInvitations.teamId, teamId));
    await tx
      .delete(collaborationProjects)
      .where(eq(collaborationProjects.teamId, teamId));
    await tx
      .delete(collaborationTeamMembers)
      .where(eq(collaborationTeamMembers.teamId, teamId));
    await tx
      .delete(collaborationTeams)
      .where(eq(collaborationTeams.id, teamId));
    return true;
  });
}

export async function listProjectsForTeam(teamId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(collaborationProjects)
    .where(eq(collaborationProjects.teamId, teamId))
    .orderBy(desc(collaborationProjects.createdAt));
}

export async function getProjectForTeam(projectId: number, teamId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(collaborationProjects)
    .where(
      and(
        eq(collaborationProjects.id, projectId),
        eq(collaborationProjects.teamId, teamId)
      )
    )
    .limit(1);
  return rows[0];
}

export async function createWorkItem(values: {
  teamId: number;
  projectId: number;
  module: string;
  title: string;
  assignedTo?: number;
  status?:
    | "draft"
    | "in_progress"
    | "completed"
    | "waiting_review"
    | "returned"
    | "reviewed"
    | "approved"
    | "archived";
  payload: unknown;
  createdBy: number;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [result] = await tx.insert(collaborationWorkItems).values({
      ...values,
      status: values.status ?? "draft",
      payload: values.payload,
      updatedBy: values.createdBy,
    });
    const id = Number(result.insertId);
    await tx.insert(collaborationVersions).values({
      workItemId: id,
      versionNumber: 1,
      userId: values.createdBy,
      payload: values.payload,
      changeSummary: "Initial version",
    });
    await tx.insert(collaborationAuditEvents).values({
      teamId: values.teamId,
      projectId: values.projectId,
      workItemId: id,
      userId: values.createdBy,
      action: "created",
      afterPayload: values.payload,
    });
    return id;
  });
}

export async function listWorkItems(teamId: number, projectId?: number) {
  const db = await requireDb();
  const where =
    projectId === undefined
      ? eq(collaborationWorkItems.teamId, teamId)
      : and(
          eq(collaborationWorkItems.teamId, teamId),
          eq(collaborationWorkItems.projectId, projectId)
        );
  return db
    .select()
    .from(collaborationWorkItems)
    .where(where)
    .orderBy(desc(collaborationWorkItems.updatedAt));
}

export async function getWorkItem(id: number, teamId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(collaborationWorkItems)
    .where(
      and(
        eq(collaborationWorkItems.id, id),
        eq(collaborationWorkItems.teamId, teamId)
      )
    )
    .limit(1);
  return rows[0];
}

export async function assignWorkItem(input: {
  id: number;
  teamId: number;
  assignedTo: number | null;
  userId: number;
}) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(collaborationWorkItems)
    .where(
      and(
        eq(collaborationWorkItems.id, input.id),
        eq(collaborationWorkItems.teamId, input.teamId)
      )
    )
    .limit(1);
  const item = rows[0];
  if (!item) return false;
  await db
    .update(collaborationWorkItems)
    .set({ assignedTo: input.assignedTo, updatedBy: input.userId })
    .where(eq(collaborationWorkItems.id, input.id));
  if (input.assignedTo && input.assignedTo !== input.userId) {
    await db.insert(collaborationNotifications).values({
      teamId: input.teamId,
      userId: input.assignedTo,
      workItemId: input.id,
      type: "assignment",
      message: `You were assigned work item: ${item.title}`,
    });
  }
  return true;
}

export async function updateWorkItemOptimistic(input: {
  id: number;
  teamId: number;
  userId: number;
  expectedVersion: number;
  payload: unknown;
  title?: string;
  status?:
    | "draft"
    | "in_progress"
    | "completed"
    | "waiting_review"
    | "returned"
    | "reviewed"
    | "approved"
    | "archived";
  assignedTo?: number | null;
  changeSummary?: string;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const currentRows = await tx
      .select()
      .from(collaborationWorkItems)
      .where(
        and(
          eq(collaborationWorkItems.id, input.id),
          eq(collaborationWorkItems.teamId, input.teamId)
        )
      )
      .limit(1);
    const current = currentRows[0];
    if (!current) return { kind: "not_found" as const };
    if (current.versionNumber !== input.expectedVersion) {
      return { kind: "conflict" as const, current };
    }

    const nextVersion = current.versionNumber + 1;
    const result = await tx
      .update(collaborationWorkItems)
      .set({
        payload: input.payload,
        title: input.title ?? current.title,
        status: input.status ?? current.status,
        assignedTo:
          input.assignedTo === undefined
            ? current.assignedTo
            : input.assignedTo,
        versionNumber: nextVersion,
        updatedBy: input.userId,
      })
      .where(
        and(
          eq(collaborationWorkItems.id, input.id),
          eq(collaborationWorkItems.teamId, input.teamId),
          eq(collaborationWorkItems.versionNumber, input.expectedVersion)
        )
      );

    if (result[0].affectedRows !== 1)
      return { kind: "conflict" as const, current };
    await tx.insert(collaborationVersions).values({
      workItemId: input.id,
      versionNumber: nextVersion,
      userId: input.userId,
      payload: input.payload,
      changeSummary: input.changeSummary,
    });
    await tx.insert(collaborationAuditEvents).values({
      teamId: input.teamId,
      projectId: current.projectId,
      workItemId: input.id,
      userId: input.userId,
      action: "updated",
      beforePayload: current.payload,
      afterPayload: input.payload,
    });
    if (input.status && input.status !== current.status) {
      const nextStatus = input.status;
      const members = await tx
        .select({ userId: collaborationTeamMembers.userId })
        .from(collaborationTeamMembers)
        .where(eq(collaborationTeamMembers.teamId, input.teamId));
      const recipients = members
        .map(member => member.userId)
        .filter(userId => userId !== input.userId);
      if (recipients.length) {
        await tx.insert(collaborationNotifications).values(
          recipients.map(userId => ({
            teamId: input.teamId,
            userId,
            workItemId: input.id,
            type: "status_change",
            message: `Work item status changed to ${nextStatus.replaceAll("_", " ")}.`,
          }))
        );
      }
    }
    return { kind: "updated" as const, versionNumber: nextVersion };
  });
}

export async function listVersions(workItemId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(collaborationVersions)
    .where(eq(collaborationVersions.workItemId, workItemId))
    .orderBy(desc(collaborationVersions.versionNumber));
}

export async function listAuditEvents(teamId: number, workItemId?: number) {
  const db = await requireDb();
  const where =
    workItemId === undefined
      ? eq(collaborationAuditEvents.teamId, teamId)
      : and(
          eq(collaborationAuditEvents.teamId, teamId),
          eq(collaborationAuditEvents.workItemId, workItemId)
        );
  return db
    .select()
    .from(collaborationAuditEvents)
    .where(where)
    .orderBy(desc(collaborationAuditEvents.createdAt));
}

export async function addComment(input: {
  teamId: number;
  workItemId: number;
  userId: number;
  body: string;
}) {
  const db = await requireDb();
  const [result] = await db.insert(collaborationComments).values(input);
  const members = await db
    .select({ userId: collaborationTeamMembers.userId })
    .from(collaborationTeamMembers)
    .where(eq(collaborationTeamMembers.teamId, input.teamId));
  const recipients = members
    .map(member => member.userId)
    .filter(userId => userId !== input.userId);
  if (recipients.length) {
    await db.insert(collaborationNotifications).values(
      recipients.map(userId => ({
        teamId: input.teamId,
        userId,
        workItemId: input.workItemId,
        type: "comment",
        message: "A teammate added a comment to shared work.",
      }))
    );
  }
  return Number(result.insertId);
}

export async function listComments(teamId: number, workItemId: number) {
  const db = await requireDb();
  return db
    .select({ comment: collaborationComments, user: users })
    .from(collaborationComments)
    .innerJoin(users, eq(users.id, collaborationComments.userId))
    .where(
      and(
        eq(collaborationComments.teamId, teamId),
        eq(collaborationComments.workItemId, workItemId)
      )
    )
    .orderBy(collaborationComments.createdAt);
}

export async function listNotifications(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(collaborationNotifications)
    .where(eq(collaborationNotifications.userId, userId))
    .orderBy(desc(collaborationNotifications.createdAt));
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await requireDb();
  await db
    .update(collaborationNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(collaborationNotifications.id, id),
        eq(collaborationNotifications.userId, userId)
      )
    );
}

export async function enqueueSyncOperation(
  values: typeof collaborationSyncOperations.$inferInsert
) {
  const db = await requireDb();
  await db
    .insert(collaborationSyncOperations)
    .values(values)
    .onDuplicateKeyUpdate({ set: { status: "pending", errorMessage: null } });
}

export async function listPendingSyncOperations(
  userId: number,
  teamId: number
) {
  const db = await requireDb();
  return db
    .select()
    .from(collaborationSyncOperations)
    .where(
      and(
        eq(collaborationSyncOperations.userId, userId),
        eq(collaborationSyncOperations.teamId, teamId),
        eq(collaborationSyncOperations.status, "pending")
      )
    )
    .orderBy(collaborationSyncOperations.createdAt);
}

export async function updateSyncStatus(
  operationId: string,
  status: "applied" | "conflict" | "rejected",
  errorMessage?: string
) {
  const db = await requireDb();
  await db
    .update(collaborationSyncOperations)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      appliedAt: status === "applied" ? new Date() : null,
    })
    .where(eq(collaborationSyncOperations.operationId, operationId));
}
