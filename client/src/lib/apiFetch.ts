export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
import { captureApiOperation, latestOfflineResult, parseApiPayload } from "./offlineStore";
import { runOfflineEngine } from "./offlineEngines";

export function isRetryableProxyResponse(response: Response) {
  const explicitlyRetryable = response.headers.get("x-e2b-retryable") === "true";
  const transientStatus = [502, 503, 504].includes(response.status);
  const contentType = response.headers.get("content-type") ?? "";
  return explicitlyRetryable || (transientStatus && contentType.includes("text/html"));
}

function cloneInput(input: RequestInfo | URL) {
  return typeof Request !== "undefined" && input instanceof Request ? input.clone() : input;
}

export async function fetchWithTransientRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: { fetchImpl?: FetchLike; maxAttempts?: number; delayMs?: number } = {},
) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const delayMs = Math.max(0, options.delayMs ?? 350);
  let response: Response | undefined;
  const requestUrl = new URL(typeof input === "string" ? input : input.toString(), typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const isApiRequest = requestUrl.pathname.startsWith("/api/trpc");
  const isMutation = (init?.method ?? "GET").toUpperCase() !== "GET";
  const shouldCapture = isApiRequest && isMutation;
  const shouldCacheQuery = isApiRequest && !isMutation;
  const payload = shouldCapture ? parseApiPayload(init?.body) : undefined;
  const operation = requestUrl.pathname.replace(/^\/api\/trpc\//, "");

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const localResult = shouldCapture ? await runOfflineEngine(operation, payload) : await latestOfflineResult(operation);
    if (localResult) {
      if (shouldCapture) void captureApiOperation(operation, payload, localResult);
      const cachedResponse = shouldCapture ? [{ result: { data: { json: localResult } } }] : localResult;
      return new Response(JSON.stringify(cachedResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetchImpl(cloneInput(input), { ...(init ?? {}), credentials: "include" });
    } catch (error) {
      if (shouldCapture) {
        void captureApiOperation(requestUrl.pathname, payload, undefined, error instanceof Error ? error.message : "Network unavailable");
      }
      throw error;
    }
    if (!isRetryableProxyResponse(response)) {
      if (shouldCapture || shouldCacheQuery) {
        void response.clone().json().then(result => captureApiOperation(operation, payload, result)).catch(() => undefined);
      }
      return response;
    }
    if (attempt < maxAttempts && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }

  if (shouldCapture) {
    void captureApiOperation(requestUrl.pathname, payload, undefined, `Gateway returned ${response?.status ?? "an unavailable response"}`);
  }
  throw new Error(
    "The application gateway is temporarily unavailable. Please retry the analysis in a few seconds.",
  );
}
