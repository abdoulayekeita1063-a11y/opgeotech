import { ZipArchive } from "archiver";
import { ENV } from "./_core/env";

export const PROJECT_STORAGE_FOLDERS = [
  "01_Project",
  "02_Drillholes/DXF",
  "02_Drillholes/CSV",
  "02_Drillholes/Excel",
  "03_Structural_Mapping",
  "04_Rock_Mass_Classification",
  "05_Kinematic_Analysis",
  "06_Slope_Stability",
  "07_Blast_Assessment",
  "08_Wall_Assessment",
  "09_Berm_Monitoring",
  "10_Piezometers",
  "11_Radar_Monitoring",
  "12_Reports",
  "13_Exports",
] as const;

export type ProjectStorageFolder = (typeof PROJECT_STORAGE_FOLDERS)[number];
export const projectStorageBucket = () => ENV.supabaseStorageBucket;

function requireConfig() {
  if (!ENV.supabaseUrl || !ENV.supabaseKey) {
    throw new Error(
      "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_KEY on the server."
    );
  }
  if (!ENV.supabaseServiceRoleKey) {
    console.warn(
      "SUPABASE_SERVICE_ROLE_KEY is not set; private Storage administration may be rejected."
    );
  }
  return {
    baseUrl: ENV.supabaseUrl
      .replace(/\/(?:rest|storage)\/v1\/?$/, "")
      .replace(/\/+$/, ""),
    key: ENV.supabaseServiceRoleKey || ENV.supabaseKey,
    bucket: ENV.supabaseStorageBucket,
  };
}

function apiHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function safeProjectFolder(name: string, projectId: number) {
  const safeName = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
  return `projects/${safeName || "project"}-${projectId}`;
}

export function projectObjectPath(
  projectFolder: string,
  folder: ProjectStorageFolder,
  fileName: string
) {
  const safeFileName = fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  if (!safeFileName) throw new Error("A valid filename is required.");
  return `${projectFolder}/${folder}/${safeFileName}`;
}

async function storageRequest(path: string, init?: RequestInit) {
  const { baseUrl, key } = requireConfig();
  const response = await fetch(`${baseUrl}/storage/v1${path}`, {
    ...init,
    headers: {
      ...apiHeaders(key),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Supabase Storage request failed (${response.status}): ${message}`
    );
  }
  return response;
}

export async function ensureProjectBucket() {
  const { baseUrl, key, bucket } = requireConfig();
  const response = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      ...apiHeaders(key),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: false,
      file_size_limit: 52428800,
    }),
  });
  const message = await response.text().catch(() => response.statusText);
  if (
    response.ok ||
    response.status === 409 ||
    message.includes("BucketAlreadyExists") ||
    message.includes("resource already exists")
  ) {
    return { bucket, created: response.ok };
  }
  throw new Error(
    `Supabase bucket setup failed (${response.status}): ${message}`
  );
}

export async function initializeProjectFolders(projectFolder: string) {
  await ensureProjectBucket();
  const results = [] as Array<{ folder: string; path: string }>;
  for (const folder of PROJECT_STORAGE_FOLDERS) {
    const path = `${projectFolder}/${folder}/.keep`;
    try {
      await storageRequest(
        `/object/${encodeURIComponent(ENV.supabaseStorageBucket)}/${encodePath(path)}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain", "x-upsert": "true" },
          body: "OPGeotech project folder",
        }
      );
      results.push({ folder, path });
    } catch (error) {
      throw new Error(
        `Could not initialize folder ${folder}: ${String(error)}`
      );
    }
  }
  return results;
}

export async function uploadProjectFile(input: {
  projectFolder: string;
  folder: ProjectStorageFolder;
  fileName: string;
  mimeType: string;
  data: Buffer;
}) {
  await ensureProjectBucket();
  const path = projectObjectPath(
    input.projectFolder,
    input.folder,
    input.fileName
  );
  await storageRequest(
    `/object/${encodeURIComponent(ENV.supabaseStorageBucket)}/${encodePath(path)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": input.mimeType || "application/octet-stream",
        "x-upsert": "false",
      },
      body: input.data as unknown as BodyInit,
    }
  );
  return { path, bucket: ENV.supabaseStorageBucket };
}

export async function uploadProjectObject(input: {
  projectFolder: string;
  relativePath: string;
  mimeType: string;
  data: Buffer;
}) {
  const relativePath = input.relativePath.replace(/\\/g, "/");
  const isAllowed = PROJECT_STORAGE_FOLDERS.some(
    folder =>
      relativePath.startsWith(`${folder}/`) && !relativePath.includes("..")
  );
  if (!isAllowed || relativePath.endsWith("/.keep")) {
    throw new Error("The file path is outside the allowed project folders.");
  }
  const path = `${input.projectFolder}/${relativePath}`;
  await storageRequest(
    `/object/${encodeURIComponent(ENV.supabaseStorageBucket)}/${encodePath(path)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": input.mimeType || "application/octet-stream",
        "x-upsert": "true",
      },
      body: input.data as unknown as BodyInit,
    }
  );
  return { path, bucket: ENV.supabaseStorageBucket };
}

export async function listProjectFiles(projectFolder: string) {
  await ensureProjectBucket();
  const response = await storageRequest(
    `/object/list/${encodeURIComponent(ENV.supabaseStorageBucket)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prefix: projectFolder,
        limit: 1000,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      }),
    }
  );
  return (await response.json()) as Array<{
    name: string;
    id?: string;
    metadata?: Record<string, unknown>;
  }>;
}

type ListedStorageFile = {
  path: string;
  relativePath: string;
  size: number | null;
  etag: string | null;
  updatedAt: string | null;
};

async function listStoragePrefix(prefix: string) {
  const response = await storageRequest(
    `/object/list/${encodeURIComponent(ENV.supabaseStorageBucket)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prefix,
        limit: 1000,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      }),
    }
  );
  return (await response.json()) as Array<{
    name: string;
    id?: string;
    metadata?: {
      size?: number;
      eTag?: string;
      etag?: string;
      updated_at?: string;
      lastModified?: string;
    };
  }>;
}

export async function downloadProjectFile(path: string) {
  const response = await storageRequest(
    `/object/${encodeURIComponent(ENV.supabaseStorageBucket)}/${encodePath(path)}`
  );
  return Buffer.from(await response.arrayBuffer());
}

export async function listProjectFilesForExport(projectFolder: string) {
  const files: ListedStorageFile[] = [];
  for (const folder of PROJECT_STORAGE_FOLDERS) {
    const prefix = `${projectFolder}/${folder}`;
    const entries = await listStoragePrefix(prefix);
    for (const entry of entries) {
      const relativePath = `${folder}/${entry.name}`;
      files.push({
        path: `${projectFolder}/${relativePath}`,
        relativePath,
        size: entry.metadata?.size ?? null,
        etag: entry.metadata?.eTag ?? entry.metadata?.etag ?? null,
        updatedAt:
          entry.metadata?.updated_at ?? entry.metadata?.lastModified ?? null,
      });
    }
  }
  return files;
}

export async function createProjectZip(projectFolder: string) {
  await ensureProjectBucket();
  const files = await listProjectFilesForExport(projectFolder);
  const chunks: Buffer[] = [];
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const completed = new Promise<void>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    archive.on("end", () => resolve());
    archive.on("error", reject);
  });

  for (const file of files) {
    archive.append(await downloadProjectFile(file.path), {
      name: file.relativePath,
    });
  }
  await archive.finalize();
  await completed;
  return Buffer.concat(chunks);
}

export async function createProjectSignedUrl(path: string, expiresIn = 3600) {
  const response = await storageRequest(
    `/object/sign/${encodeURIComponent(ENV.supabaseStorageBucket)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [path], expiresIn }),
    }
  );
  const payload = (await response.json()) as Array<{
    signedURL?: string;
    signedUrl?: string;
  }>;
  const signedUrl = payload[0]?.signedURL ?? payload[0]?.signedUrl;
  if (!signedUrl)
    throw new Error("Supabase did not return a signed download URL.");
  const baseUrl = ENV.supabaseUrl
    .replace(/\/(?:rest|storage)\/v1\/?$/, "")
    .replace(/\/+$/, "");
  return signedUrl.startsWith("http")
    ? signedUrl
    : `${baseUrl}/storage/v1${signedUrl}`;
}
