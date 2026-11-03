import { and, desc, eq } from "drizzle-orm";
import {
  collaborationAuditEvents,
  collaborationProjects,
  collaborationSyncOperations,
  collaborationTeamMembers,
  collaborationTeams,
  collaborationVersions,
  collaborationWorkItems,
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

export async function listProjectsForTeam(teamId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(collaborationProjects)
    .where(eq(collaborationProjects.teamId, teamId))
    .orderBy(desc(collaborationProjects.createdAt));
}

export async function createWorkItem(values: {
  teamId: number;
  projectId: number;
  module: string;
  title: string;
  assignedTo?: number;
  payload: unknown;
  createdBy: number;
}) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [result] = await tx.insert(collaborationWorkItems).values({
      ...values,
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
