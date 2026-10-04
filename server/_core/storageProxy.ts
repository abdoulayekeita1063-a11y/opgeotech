import type { Express } from "express";
import { Readable } from "node:stream";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      if (req.query.download === "1") {
        const fileResp = await fetch(url);
        if (!fileResp.ok || !fileResp.body) {
          res.status(502).send("Unable to download stored file");
          return;
        }
        const fileName = key.split("/").pop() || "download";
        res.set("Cache-Control", "no-store");
        res.set("Content-Type", fileResp.headers.get("content-type") || "application/octet-stream");
        const length = fileResp.headers.get("content-length");
        if (length) res.set("Content-Length", length);
        res.set("Content-Disposition", `attachment; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
        Readable.fromWeb(fileResp.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
