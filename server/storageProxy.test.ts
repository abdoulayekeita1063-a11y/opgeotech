import express from "express";
import { createServer, get } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: { forgeApiUrl: "https://forge.test/", forgeApiKey: "test-key" },
}));

import { registerStorageProxy } from "./_core/storageProxy";

const request = (port: number, path: string) => new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
  // Use the built-in HTTP client so the mocked fetch remains available to the proxy itself.
  get({ hostname: "127.0.0.1", port, path }, response => {
    const chunks: Buffer[] = [];
    response.on("data", chunk => chunks.push(Buffer.from(chunk)));
    response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
  }).on("error", reject);
});

afterEach(() => vi.unstubAllGlobals());

describe("storage download proxy", () => {
  it("streams a stored installer with attachment headers", async () => {
    const app = express();
    registerStorageProxy(app);
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://signed.test/setup.exe" }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response("installer-bytes", { status: 200, headers: { "content-type": "application/octet-stream", "content-length": "15" } }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await request(port, "/manus-storage/OPGeotech-Setup.exe?download=1");
      expect(response.status).toBe(200);
      expect(response.headers["content-disposition"]).toBe('attachment; filename="OPGeotech-Setup.exe"');
      expect(response.headers["content-type"]).toContain("application/octet-stream");
      expect(response.body).toBe("installer-bytes");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
