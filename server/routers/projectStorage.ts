import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as collaborationDb from "../db/collaboration";
import {
  createProjectSignedUrl,
  initializeProjectFolders,
  listProjectFiles,
  PROJECT_STORAGE_FOLDERS,
  projectStorageBucket,
  safeProjectFolder,
  uploadProjectFile,
} from "../supabaseStorage";
import { protectedProcedure, router } from "../_core/trpc";

const folderSchema = z.enum(PROJECT_STORAGE_FOLDERS);

async function requireProjectAccess(
  teamId: number,
  projectId: number,
  userId: number
) {
  const membership = await collaborationDb.getMembership(teamId, userId);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this team.",
    });
  }
  const project = await collaborationDb.getProjectForTeam(projectId, teamId);
  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found in this team.",
    });
  }
  return {
    membership,
    project,
    projectFolder: safeProjectFolder(project.name, project.id),
  };
}

function canWrite(role: string) {
  return role !== "viewer";
}

export const projectStorageRouter = router({
  folders: protectedProcedure.query(() => PROJECT_STORAGE_FOLDERS),

  initialize: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        projectId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const access = await requireProjectAccess(
        input.teamId,
        input.projectId,
        ctx.user.id
      );
      if (!canWrite(access.membership.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Read-only users cannot initialize project storage.",
        });
      }
      const folders = await initializeProjectFolders(access.projectFolder);
      return {
        bucketReady: true,
        projectFolder: access.projectFolder,
        folders,
      };
    }),

  list: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        projectId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const access = await requireProjectAccess(
        input.teamId,
        input.projectId,
        ctx.user.id
      );
      const files = await listProjectFiles(access.projectFolder);
      return {
        bucket: projectStorageBucket(),
        projectFolder: access.projectFolder,
        folders: PROJECT_STORAGE_FOLDERS,
        files: files.filter(file => file.name !== ".keep"),
      };
    }),

  upload: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        projectId: z.number().int().positive(),
        folder: folderSchema,
        fileName: z.string().trim().min(1).max(255),
        mimeType: z
          .string()
          .trim()
          .max(160)
          .default("application/octet-stream"),
        dataBase64: z.string().min(1).max(70_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const access = await requireProjectAccess(
        input.teamId,
        input.projectId,
        ctx.user.id
      );
      if (!canWrite(access.membership.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Read-only users cannot upload project files.",
        });
      }
      const data = Buffer.from(input.dataBase64, "base64");
      if (data.byteLength > 50 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Project files must be 50 MB or smaller.",
        });
      }
      const uploaded = await uploadProjectFile({
        projectFolder: access.projectFolder,
        folder: input.folder,
        fileName: input.fileName,
        mimeType: input.mimeType,
        data,
      });
      return uploaded;
    }),

  download: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        projectId: z.number().int().positive(),
        path: z.string().trim().min(1).max(600),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const access = await requireProjectAccess(
        input.teamId,
        input.projectId,
        ctx.user.id
      );
      if (!input.path.startsWith(`${access.projectFolder}/`)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File path is outside the selected project.",
        });
      }
      return { url: await createProjectSignedUrl(input.path) };
    }),
});
