// The most important tests in the suite: prove that the safety gate never
// executes (never touches the network) unless --confirm is passed, and that
// it does execute when it is.

import { describe, expect, it, vi } from "vitest";
import { gate, type DryRunPlan } from "../../dist/safety/gate.js";

const PLAN: DryRunPlan = {
  effect: "does the dangerous thing",
  method: "POST",
  endpoint: "/campaigns/abc/activate",
  summary: [["campaign_id", "abc"]],
  confirmCommand: "instantly-axi campaign launch abc --confirm",
};

describe("safety gate", () => {
  it("does NOT invoke execute when confirm is false", async () => {
    const execute = vi.fn(async () => ({ lines: ["should not run"] }));
    const logs: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((s: any) => {
      logs.push(String(s));
      return true;
    });

    const code = await gate(PLAN, false, execute);
    spy.mockRestore();

    expect(execute).not.toHaveBeenCalled();
    expect(code).toBe(0);
    const out = logs.join("");
    expect(out).toContain("dry-run: no request sent");
    expect(out).toContain("POST");
    expect(out).toContain("/campaigns/abc/activate");
    expect(out).toContain("--confirm");
  });

  it("invokes execute exactly once when confirm is true", async () => {
    const execute = vi.fn(async () => ({ lines: ["did the thing"], suggestions: ["next"] }));
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const code = await gate(PLAN, true, execute);
    spy.mockRestore();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(code).toBe(0);
  });

  it("surfaces execute output only on the confirm path", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((s: any) => {
      logs.push(String(s));
      return true;
    });
    await gate(PLAN, true, async () => ({ lines: ["launched: campaign activated"] }));
    spy.mockRestore();
    expect(logs.join("")).toContain("launched: campaign activated");
  });
});
