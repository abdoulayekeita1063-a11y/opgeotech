import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db/collaboration";
import {
  initializeProjectFolders,
  safeProjectFolder,
} from "../supabaseStorage";
import { protectedProcedure, router } from "../_core/trpc";

const roleSchema = z.enum([
  "admin",
  "manager",
  "engineer",
  "reviewer",
  "viewer",
]);
const statusSchema = z.enum([
  "draft",
  "in_progress",
  "completed",
  "waiting_review",
  "returned",
  "reviewed",
  "approved",
  "archived",
]);
const jsonPayload = z.record(z.string(), z.unknown());

async function requireMembership(teamId: number, userId: number) {
  const membership = await db.getMembership(teamId, userId);
  if (!membership)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this team.",
    });
  return membership;
}

function canEdit(role: string) {
  return role !== "viewer";
}

function canManage(role: string) {
  return role === "admin" || role === "manager";
}

export const collaborationRouter = router({
  createTeam: protectedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(255) }))
    .mutation(async ({ ctx, input }) => ({
      id: await db.createTeam({ name: input.name, createdBy: ctx.user.id }),
    })),

  listMyTeams: protectedProcedure.query(({ ctx }) =>
    db.listTeamsForUser(ctx.user.id)
  ),

  deleteTeam: protectedProcedure
    .input(z.object({ teamId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canManage(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only team managers can delete a team.",
        });
      const deleted = await db.deleteTeam(input.teamId);
      if (!deleted)
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
      return { success: true } as const;
    }),

  addMember: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        userId: z.number().int().positive(),
        role: roleSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canManage(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only team managers can add members.",
        });
      await db.addTeamMember(input);
      return { success: true } as const;
    }),

  createProject: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        name: z.string().trim().min(2).max(255),
        description: z.string().max(5000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canManage(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only team managers can create projects.",
        });
      const id = await db.createProject({ ...input, createdBy: ctx.user.id });
      let storageReady = false;
      try {
        await initializeProjectFolders(safeProjectFolder(input.name, id));
        storageReady = true;
      } catch (error) {
        console.warn(
          "Project created but Storage folders were not initialized",
          error
        );
      }
      return { id, storageReady };
    }),

  listSyncTokens: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        projectId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireMembership(input.teamId, ctx.user.id);
      const project = await db.getProjectForTeam(input.projectId, input.teamId);
      if (!project)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found in this team.",
        });
      return db.listProjectSyncTokens(input.teamId, input.projectId);
    }),

  createSyncToken: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        projectId: z.number().int().positive(),
        label: z.string().trim().min(2).max(120).default("Windows sync"),
        mode: z
          .enum(["download_only", "bidirectional"])
          .default("download_only"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canManage(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only team managers can create Windows sync tokens.",
        });
      const project = await db.getProjectForTeam(input.projectId, input.teamId);
      if (!project)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found in this team.",
        });
      return db.createProjectSyncToken({ ...input, createdBy: ctx.user.id });
    }),

  revokeSyncToken: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        id: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canManage(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only team managers can revoke Windows sync tokens.",
        });
      const revoked = await db.revokeProjectSyncToken(input);
      if (!revoked)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sync token not found.",
        });
      return { success: true } as const;
    }),

  listProjects: protectedProcedure
    .input(z.object({ teamId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireMembership(input.teamId, ctx.user.id);
      return db.listProjectsForTeam(input.teamId);
    }),

  deleteProject: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        projectId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canManage(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only team managers can delete a project.",
        });
      const deleted = await db.deleteProject(input);
      if (!deleted)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found in this team.",
        });
      return { success: true } as const;
    }),

  listMembers: protectedProcedure
    .input(z.object({ teamId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireMembership(input.teamId, ctx.user.id);
      return db.listTeamMembers(input.teamId);
    }),

  searchUsers: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        query: z.string().trim().min(2).max(120),
      })
    )
    .query(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canManage(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only team managers can invite members.",
        });
      return db.searchUsers(input.query, ctx.user.id);
    }),

  inviteMember: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        invitedUserId: z.number().int().positive(),
        role: z.enum(["manager", "engineer", "reviewer", "viewer"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canManage(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only team managers can invite members.",
        });
      return {
        id: await db.createInvitation({ ...input, invitedBy: ctx.user.id }),
      };
    }),

  invitations: protectedProcedure.query(({ ctx }) =>
    db.listInvitationsForUser(ctx.user.id)
  ),

  respondToInvitation: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await db.respondToInvitation({
        ...input,
        userId: ctx.user.id,
      });
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation is no longer available.",
        });
      return { success: true } as const;
    }),

  createWorkItem: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        projectId: z.number().int().positive(),
        module: z.string().trim().min(1).max(64),
        title: z.string().trim().min(1).max(255),
        assignedTo: z.number().int().positive().optional(),
        status: statusSchema.optional(),
        payload: jsonPayload,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canEdit(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Read-only users cannot create work.",
        });
      return {
        id: await db.createWorkItem({ ...input, createdBy: ctx.user.id }),
      };
    }),

  listWorkItems: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        projectId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireMembership(input.teamId, ctx.user.id);
      return db.listWorkItems(input.teamId, input.projectId);
    }),

  getWorkItem: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        id: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireMembership(input.teamId, ctx.user.id);
      const item = await db.getWorkItem(input.id, input.teamId);
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Work item not found.",
        });
      return item;
    }),

  assignWorkItem: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        workItemId: z.number().int().positive(),
        assignedTo: z.number().int().positive().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canManage(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only team managers can assign work.",
        });
      const updated = await db.assignWorkItem({
        id: input.workItemId,
        teamId: input.teamId,
        assignedTo: input.assignedTo,
        userId: ctx.user.id,
      });
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Work item not found.",
        });
      return { success: true } as const;
    }),

  addComment: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        workItemId: z.number().int().positive(),
        body: z.string().trim().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canEdit(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Read-only users cannot comment.",
        });
      return { id: await db.addComment({ ...input, userId: ctx.user.id }) };
    }),

  comments: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        workItemId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireMembership(input.teamId, ctx.user.id);
      return db.listComments(input.teamId, input.workItemId);
    }),

  updateWorkItem: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        id: z.number().int().positive(),
        expectedVersion: z.number().int().positive(),
        payload: jsonPayload,
        title: z.string().trim().min(1).max(255).optional(),
        status: statusSchema.optional(),
        assignedTo: z.number().int().positive().nullable().optional(),
        changeSummary: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canEdit(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Read-only users cannot update work.",
        });
      if (
        input.status === "approved" &&
        !["admin", "manager", "reviewer"].includes(membership.role)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only reviewers or managers can approve work.",
        });
      }
      const result = await db.updateWorkItemOptimistic({
        ...input,
        userId: ctx.user.id,
      });
      if (result.kind === "not_found")
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Work item not found.",
        });
      if (result.kind === "conflict") {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This work was changed by another user. Refresh and merge the versions.",
          cause: result.current,
        });
      }
      return result;
    }),

  history: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        workItemId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireMembership(input.teamId, ctx.user.id);
      return db.listVersions(input.workItemId);
    }),

  audit: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        workItemId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canManage(membership.role) && input.workItemId === undefined)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can view the full team audit.",
        });
      return db.listAuditEvents(input.teamId, input.workItemId);
    }),

  queueOfflineOperation: protectedProcedure
    .input(
      z.object({
        operationId: z.string().trim().min(8).max(128),
        teamId: z.number().int().positive(),
        workItemId: z.number().int().positive().nullable().optional(),
        operationType: z.enum(["create", "update"]),
        baseVersion: z.number().int().positive().nullable().optional(),
        payload: jsonPayload,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(input.teamId, ctx.user.id);
      if (!canEdit(membership.role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Read-only users cannot synchronize changes.",
        });
      await db.enqueueSyncOperation({
        ...input,
        userId: ctx.user.id,
        workItemId: input.workItemId ?? null,
        baseVersion: input.baseVersion ?? null,
      });
      return { queued: true } as const;
    }),

  pendingOfflineOperations: protectedProcedure
    .input(z.object({ teamId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireMembership(input.teamId, ctx.user.id);
      return db.listPendingSyncOperations(ctx.user.id, input.teamId);
    }),

  markOfflineOperation: protectedProcedure
    .input(
      z.object({
        operationId: z.string().min(8).max(128),
        status: z.enum(["applied", "conflict", "rejected"]),
        errorMessage: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.updateSyncStatus(
        input.operationId,
        input.status,
        input.errorMessage
      );
      return { success: true } as const;
    }),

  notifications: protectedProcedure.query(({ ctx }) =>
    db.listNotifications(ctx.user.id)
  ),

  markNotificationRead: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db.markNotificationRead(input.id, ctx.user.id);
      return { success: true } as const;
    }),
});
