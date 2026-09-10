import { describe, expect, it, vi } from "vitest";
import { fetchWithTransientRetry, isRetryableProxyResponse } from "../client/src/lib/apiFetch";

describe("transient tRPC gateway retry", () => {
  it("recognizes the retryable HTML 502 response reported by the preview proxy", () => {
    const response = new Response("<!doctype html>", {
      status: 502,
      headers: { "content-type": "text/html", "x-e2b-retryable": "true" },
    });
    expect(isRetryableProxyResponse(response)).toBe(true);
  });

  it("retries a transient HTML 502 and returns the following JSON response", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("<!doctype html>", {
        status: 502,
        headers: { "content-type": "text/html", "x-e2b-retryable": "true" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    const response = await fetchWithTransientRetry("/api/trpc/kinematics.run", undefined, {
      fetchImpl,
      maxAttempts: 3,
      delayMs: 0,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: "ok" });
  });

  it("throws a readable error after retryable proxy failures are exhausted", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<!doctype html>", {
      status: 502,
      headers: { "content-type": "text/html", "x-e2b-retryable": "true" },
    }));

    await expect(fetchWithTransientRetry("/api/trpc/kinematics.run", undefined, {
      fetchImpl,
      maxAttempts: 2,
      delayMs: 0,
    })).rejects.toThrow("gateway is temporarily unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
