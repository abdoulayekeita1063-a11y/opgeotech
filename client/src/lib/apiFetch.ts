export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    response = await fetchImpl(cloneInput(input), { ...(init ?? {}), credentials: "include" });
    if (!isRetryableProxyResponse(response)) return response;
    if (attempt < maxAttempts && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw new Error(
    "The application gateway is temporarily unavailable. Please retry the analysis in a few seconds.",
  );
}
