import { describe, expect, it } from "vitest";

describe("Supabase Storage server credentials", () => {
  it("can access the Storage bucket API with the server key", async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return;
    }

    const baseUrl = supabaseUrl
      .replace(/\/(?:rest|storage)\/v1\/?$/, "")
      .replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/storage/v1/bucket`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type") ?? "").toContain("json");
  }, 30_000);
});
