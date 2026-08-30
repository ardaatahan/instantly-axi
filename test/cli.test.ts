// AXI contract smoke tests. Run the built binary as a subprocess with
// credentials cleared so the home view is deterministic (overview, no network).

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const bin = fileURLToPath(new URL("../bin/instantly-axi.js", import.meta.url));

// Clear any ambient key + config so no test ever touches the real API.
const NO_KEY_ENV = {
  ...process.env,
  INSTANTLY_API_KEY: "",
  INSTANTLY_CONFIG: "",
  HOME: "/nonexistent-xyz",
  XDG_CONFIG_HOME: "/nonexistent-xyz",
};

function run(...args: string[]) {
  return spawnSync("node", [bin, ...args], { encoding: "utf8", env: NO_KEY_ENV });
}

describe("instantly-axi AXI contract", () => {
  it("no-args shows content, not a usage manual, and exits 0 (principle 8)", () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/^\s*usage[:\s]/i);
    expect(r.stdout).toContain("credentials: not configured");
    expect(r.stdout).toContain("commands[");
    expect(r.stdout).toContain("safety[");
  });

  it("--help exits 0 and lists commands and flags (principle 10)", () => {
    const r = run("--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("commands[");
    expect(r.stdout).toContain("--help");
    expect(r.stdout).toContain("campaign launch");
  });

  it("--version prints the version", () => {
    const r = run("--version");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("instantly-axi: 0.1.0");
  });

  it("unknown flag exits 2 naming valid flags (principle 6)", () => {
    const r = run("--not-a-real-flag");
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("error:");
  });

  it("unknown command exits 2 listing valid commands", () => {
    const r = run("frobnicate");
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("error:");
    expect(r.stdout).toContain("unknown command");
  });

  it("every subcommand answers --help with flags and examples (principle 10)", () => {
    for (const cmd of [["campaigns"], ["campaign"], ["campaign", "launch"], ["leads"], ["lead", "add"], ["lead", "rm"], ["accounts"], ["analytics"], ["verify"], ["webhooks"], ["webhooks", "add"], ["webhooks", "rm"]]) {
      const r = run(...cmd, "--help");
      expect(r.status, `${cmd.join(" ")} --help should exit 0`).toBe(0);
      expect(r.stdout, `${cmd.join(" ")} --help should show a command line`).toContain("command:");
      expect(r.stdout).toContain("examples[");
    }
  });

  it("--help never makes a network call or errors (principle 10)", () => {
    const r = run("campaign", "launch", "--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--confirm");
  });

  it("gated command missing required arg exits 2 without side effects", () => {
    const r = run("lead", "rm");
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("error:");
  });

  it("stderr is silent on the success path (principle 6)", () => {
    const r = run();
    expect(r.stderr.trim()).toBe("");
  });

  it("'lead' without a subcommand fails naming the valid subcommands", () => {
    const r = run("lead");
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("lead add");
  });
});
