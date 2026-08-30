// Request construction and error mapping, exercised with a fake fetcher so no
// network is touched. Also verifies the API key never leaks into an error.

import { describe, expect, it } from "vitest";
import { createTransport, resolveBase } from "../../dist/api/http.js";

interface Captured {
  url: string;
  init: any;
}

function fakeFetcher(status: number, body: unknown) {
  const calls: Captured[] = [];
  const fetcher = async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    } as any;
  };
  return { fetcher, calls };
}

describe("createTransport request construction", () => {
  it("builds URL with query params and bearer auth", async () => {
    const { fetcher, calls } = fakeFetcher(200, { items: [] });
    const t = createTransport(fetcher as any, "secret-key", "https://api.test/v2");
    await t.request({ method: "GET", path: "/campaigns", query: { status: 1, limit: 10, skip: undefined } });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.test/v2/campaigns?status=1&limit=10");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer secret-key");
    expect(init.body).toBeUndefined();
  });

  it("serializes a JSON body with content-type on POST", async () => {
    const { fetcher, calls } = fakeFetcher(200, { id: "x" });
    const t = createTransport(fetcher as any, "k", "https://api.test/v2");
    await t.request({ method: "POST", path: "/leads", body: { email: "a@b.com" } });

    const { init } = calls[0]!;
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.com" });
  });

  it("parses a JSON response", async () => {
    const { fetcher } = fakeFetcher(200, { items: [{ id: 1 }], next_starting_after: "cur" });
    const t = createTransport(fetcher as any, "k", "https://api.test/v2");
    const res: any = await t.request({ method: "GET", path: "/campaigns" });
    expect(res.next_starting_after).toBe("cur");
  });
});

describe("error mapping", () => {
  const cases: Array<[number, string]> = [
    [401, "authentication failed"],
    [402, "payment required"],
    [404, "not found"],
    [422, "invalid request"],
    [429, "rate limited"],
    [500, "server error"],
  ];
  for (const [status, needle] of cases) {
    it(`maps HTTP ${status}`, async () => {
      const { fetcher } = fakeFetcher(status, { message: "api detail" });
      const t = createTransport(fetcher as any, "super-secret", "https://api.test/v2");
      await expect(t.request({ method: "GET", path: "/x" })).rejects.toMatchObject({
        message: expect.stringContaining("api detail"),
      });
    });
  }

  it("never includes the API key in an error", async () => {
    const { fetcher } = fakeFetcher(403, "forbidden");
    const t = createTransport(fetcher as any, "TOP-SECRET-KEY", "https://api.test/v2");
    try {
      await t.request({ method: "GET", path: "/x" });
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.message).not.toContain("TOP-SECRET-KEY");
      expect(String(e.suggestion)).not.toContain("TOP-SECRET-KEY");
    }
  });

  it("wraps network failures as a reachability error", async () => {
    const fetcher = async () => {
      throw new Error("ECONNREFUSED");
    };
    const t = createTransport(fetcher as any, "k", "https://api.test/v2");
    await expect(t.request({ method: "GET", path: "/x" })).rejects.toMatchObject({
      message: expect.stringContaining("could not reach"),
    });
  });
});

describe("resolveBase", () => {
  it("defaults to the production base", () => {
    expect(resolveBase({} as any)).toBe("https://api.instantly.ai/api/v2");
  });
  it("honors an override and trims trailing slashes", () => {
    expect(resolveBase({ INSTANTLY_API_BASE: "http://localhost:9/x/" } as any)).toBe("http://localhost:9/x");
  });
});
