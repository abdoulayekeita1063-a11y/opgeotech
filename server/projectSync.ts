import type { Express, Request, Response } from "express";
import * as collaborationDb from "./db/collaboration";
import {
  downloadProjectFile,
  listProjectFilesForExport,
  projectStorageBucket,
  safeProjectFolder,
} from "./supabaseStorage";

function getToken(request: Request) {
  const authorization = request.header("authorization");
  if (authorization?.startsWith("Bearer "))
    return authorization.slice(7).trim();
  return request.params.token?.trim();
}

async function authorize(request: Request, response: Response) {
  const token = getToken(request);
  if (!token) {
    response.status(401).json({ error: "A project sync token is required." });
    return undefined;
  }
  const access = await collaborationDb.getProjectBySyncToken(token);
  if (!access) {
    response
      .status(401)
      .json({ error: "Invalid or revoked project sync token." });
    return undefined;
  }
  return access;
}

export function registerProjectSyncRoutes(app: Express) {
  app.get("/api/project-sync/:token/manifest", async (request, response) => {
    try {
      const access = await authorize(request, response);
      if (!access) return;
      const projectFolder = safeProjectFolder(
        access.project.name,
        access.project.id
      );
      const files = await listProjectFilesForExport(projectFolder);
      response.json({
        project: {
          id: access.project.id,
          name: access.project.name,
          folder: projectFolder,
        },
        bucket: projectStorageBucket(),
        generatedAt: new Date().toISOString(),
        files,
      });
    } catch (error) {
      response.status(500).json({ error: String(error) });
    }
  });

  app.get("/api/project-sync/:token/file", async (request, response) => {
    try {
      const access = await authorize(request, response);
      if (!access) return;
      const path = String(request.query.path ?? "");
      const projectFolder = safeProjectFolder(
        access.project.name,
        access.project.id
      );
      if (!path.startsWith(`${projectFolder}/`)) {
        response
          .status(400)
          .json({ error: "File path is outside the project." });
        return;
      }
      const file = await downloadProjectFile(path);
      response.setHeader("Content-Type", "application/octet-stream");
      response.setHeader("Content-Length", file.byteLength);
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(path.split("/").at(-1) ?? "file")}"`
      );
      response.end(file);
    } catch (error) {
      response.status(500).json({ error: String(error) });
    }
  });
}
