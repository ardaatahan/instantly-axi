// End-to-end tests against a local mock Instantly API. The CLI runs as a real
// subprocess (as an agent would invoke it), pointed at the mock via
// INSTANTLY_API_BASE. These prove request construction, response
// summarization, AND — most importantly — that gated commands hit the network
// only with --confirm.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AddressInfo } from "node:net";

const bin = fileURLToPath(new URL("../../bin/instantly-axi.js", import.meta.url));

interface Recorded {
  method: string;
  url: string;
  auth: string | undefined;
  body: string;
}

let server: Server;
let base: string;
let requests: Recorded[] = [];
// Per-path canned responses; default 200 {}.
let responder: (req: IncomingMessage, body: string) => { status: number; json: unknown };

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({
        method: req.method ?? "",
        url: req.url ?? "",
        auth: req.headers["authorization"] as string | undefined,
        body,
      });
      const { status, json } = responder(req, body);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  requests = [];
  responder = () => ({ status: 200, json: {} });
});

interface Result {
  status: number | null;
  stdout: string;
  stderr: string;
}

// Async spawn is REQUIRED here: the mock server runs in this same process, and
// spawnSync would block the event loop and deadlock (the server could never
// answer the child's request).
function run(args: string[], env: Record<string, string> = {}): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [bin, ...args], {
      env: { ...process.env, INSTANTLY_API_BASE: base, INSTANTLY_API_KEY: "test-key", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`CLI timed out: ${args.join(" ")}`));
    }, 15_000);
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

describe("read commands hit the API and summarize", () => {
  it("campaigns lists and decodes status", async () => {
    responder = () => ({
      status: 200,
      json: { items: [{ id: "c1", name: "Spring Blast", status: 1, daily_limit: 40 }] },
    });
    const r = await run(["campaigns", "--status", "active"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("campaigns[");
    expect(r.stdout).toContain("Spring Blast");
    expect(r.stdout).toContain("active");
    expect(requests[0]!.url).toContain("/campaigns");
    expect(requests[0]!.url).toContain("status=1");
    expect(requests[0]!.auth).toBe("Bearer test-key");
  });

  it("accounts lists with warmup + active summary", async () => {
    responder = () => ({
      status: 200,
      json: { items: [{ email: "s@x.com", status: 1, warmup_status: 1, stat_warmup_score: 90 }] },
    });
    const r = await run(["accounts"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("s@x.com");
    expect(r.stdout).toContain("summary: 1 of 1 shown accounts active");
  });

  it("analytics summarizes rates", async () => {
    responder = () => ({
      status: 200,
      json: [{ campaign_name: "Q1", emails_sent_count: 100, open_count: 50, reply_count: 10, bounced_count: 2 }],
    });
    const r = await run(["analytics", "c1"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("open_rate: 50.0%");
    expect(r.stdout).toContain("reply_rate: 10.0%");
  });
});

describe("gated commands: NO network without --confirm", () => {
  const gated: Array<[string, string[]]> = [
    ["campaign launch", ["campaign", "launch", "c1"]],
    ["lead add", ["lead", "add", "--campaign", "c1", "--email", "a@b.com"]],
    ["lead rm", ["lead", "rm", "l1"]],
    ["verify", ["verify", "a@b.com"]],
    ["webhooks add", ["webhooks", "add", "https://x.com/h", "--events", "reply_received"]],
    ["webhooks rm", ["webhooks", "rm", "w1"]],
  ];

  for (const [label, args] of gated) {
    it(`${label} dry-runs and makes ZERO requests`, async () => {
      const r = await run(args);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("dry-run: no request sent");
      expect(r.stderr.trim()).toBe("");
      // The proof: the mock server saw nothing at all.
      expect(requests).toHaveLength(0);
    });
  }
});

describe("gated commands: execute WITH --confirm", () => {
  it("campaign launch --confirm POSTs to /activate", async () => {
    responder = () => ({ status: 200, json: { id: "c1", status: 1 } });
    const r = await run(["campaign", "launch", "c1", "--confirm"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("launched: campaign activated");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toContain("/campaigns/c1/activate");
  });

  it("lead rm --confirm DELETEs the lead", async () => {
    responder = () => ({ status: 200, json: { id: "l1" } });
    const r = await run(["lead", "rm", "l1", "--confirm"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("deleted: lead l1 removed");
    expect(requests[0]!.method).toBe("DELETE");
    expect(requests[0]!.url).toContain("/leads/l1");
  });

  it("verify --confirm POSTs to /email-verification with the email", async () => {
    responder = () => ({ status: 200, json: { email: "a@b.com", verification_status: "verified", credits_used: 1, credits: 99 } });
    const r = await run(["verify", "a@b.com", "--confirm"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("credits_used: 1");
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toContain("/email-verification");
    expect(JSON.parse(requests[0]!.body)).toEqual({ email: "a@b.com" });
  });

  it("pause is NOT gated: POSTs to /pause with no --confirm", async () => {
    responder = () => ({ status: 200, json: { id: "c1", status: 2 } });
    const r = await run(["campaign", "pause", "c1"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("paused: campaign paused");
    expect(requests[0]!.url).toContain("/campaigns/c1/pause");
  });
});

describe("error handling", () => {
  it("read command without a key exits 1 with an actionable error", async () => {
    // No key, and HOME/XDG pointed away from any real config.
    const r = await run(["campaigns"], {
      INSTANTLY_API_KEY: "",
      INSTANTLY_CONFIG: "",
      HOME: "/nonexistent-xyz",
      XDG_CONFIG_HOME: "/nonexistent-xyz",
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("error: no Instantly API key");
    expect(r.stdout).toContain("suggestion:");
    expect(requests).toHaveLength(0);
  });

  it("maps a 404 to a structured error", async () => {
    responder = () => ({ status: 404, json: { message: "campaign not found" } });
    const r = await run(["campaign", "missing"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("error:");
    expect(r.stdout).toContain("not found");
  });
});
