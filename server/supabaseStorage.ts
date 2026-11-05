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
  if (response.ok || response.status === 409)
    return { bucket, created: response.ok };
  const message = await response.text().catch(() => response.statusText);
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
