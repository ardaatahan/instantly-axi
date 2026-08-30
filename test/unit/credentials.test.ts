// Credential resolution: env precedence, config-file parsing, and the
// actionable missing-key error (which must never disclose a key).

import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findApiKey,
  requireApiKey,
  hasApiKey,
  parseCredentialsFile,
} from "../../dist/api/credentials.js";

const tmpDirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "ins-cred-"));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("parseCredentialsFile", () => {
  it("reads a bare key line", () => {
    expect(parseCredentialsFile("my-secret-key\n")).toBe("my-secret-key");
  });
  it("reads an assignment and strips quotes", () => {
    expect(parseCredentialsFile('INSTANTLY_API_KEY="k123"\n')).toBe("k123");
  });
  it("ignores comments and blank lines", () => {
    expect(parseCredentialsFile("# comment\n\nkey-after-comment\n")).toBe("key-after-comment");
  });
});

describe("findApiKey precedence", () => {
  it("prefers the environment variable", () => {
    expect(findApiKey({ INSTANTLY_API_KEY: "env-key" } as any)).toBe("env-key");
  });

  it("falls back to INSTANTLY_CONFIG file", () => {
    const dir = tmp();
    const file = join(dir, "creds");
    writeFileSync(file, "file-key\n");
    expect(findApiKey({ INSTANTLY_CONFIG: file } as any)).toBe("file-key");
  });

  it("env wins over config file", () => {
    const dir = tmp();
    const file = join(dir, "creds");
    writeFileSync(file, "file-key\n");
    expect(findApiKey({ INSTANTLY_API_KEY: "env-key", INSTANTLY_CONFIG: file } as any)).toBe("env-key");
  });

  it("returns undefined when nothing is configured", () => {
    // Point HOME/XDG at an empty dir so no real user config leaks in.
    const dir = tmp();
    expect(findApiKey({ HOME: dir, XDG_CONFIG_HOME: dir } as any)).toBeUndefined();
  });
});

describe("requireApiKey", () => {
  it("throws an actionable error that does not contain any key", () => {
    const dir = tmp();
    let threw = false;
    try {
      requireApiKey({ HOME: dir, XDG_CONFIG_HOME: dir } as any);
    } catch (e: any) {
      threw = true;
      expect(e.message).toContain("no Instantly API key");
      expect(e.suggestion).toContain("INSTANTLY_API_KEY");
      expect(e.suggestion).toContain("app.instantly.ai");
      expect(e.exitCode).toBe(1);
    }
    expect(threw).toBe(true);
  });
});

describe("hasApiKey", () => {
  it("is true with env, false without", () => {
    expect(hasApiKey({ INSTANTLY_API_KEY: "x" } as any)).toBe(true);
    const dir = tmp();
    expect(hasApiKey({ HOME: dir, XDG_CONFIG_HOME: dir } as any)).toBe(false);
  });
});
