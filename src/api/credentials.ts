// Resolves the Instantly API key. Precedence (documented in the README):
//   1. env INSTANTLY_API_KEY
//   2. config file  $INSTANTLY_CONFIG  (if set)
//   3. config file  $XDG_CONFIG_HOME/instantly-axi/credentials
//   4. config file  ~/.config/instantly-axi/credentials
//
// The key is never logged, echoed, or included in any error message. A
// missing key is a structured, actionable error (AXI principle 6), not a
// crash.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AxiError } from "../output/errors.js";

const DASHBOARD_URL = "https://app.instantly.ai/app/settings/integrations";

/** Where credentials may live, in precedence order, for docs and errors. */
export function credentialPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const paths: string[] = [];
  if (env["INSTANTLY_CONFIG"]) paths.push(env["INSTANTLY_CONFIG"]);
  const xdg = env["XDG_CONFIG_HOME"];
  if (xdg) paths.push(join(xdg, "instantly-axi", "credentials"));
  paths.push(join(homedir(), ".config", "instantly-axi", "credentials"));
  return paths;
}

/**
 * Parses a credentials file. Accepts either a bare key on its own line or a
 * `INSTANTLY_API_KEY=...` assignment; blank lines and `#` comments ignored.
 */
export function parseCredentialsFile(text: string): string | undefined {
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq >= 0) {
      const name = line.slice(0, eq).trim();
      if (name === "INSTANTLY_API_KEY" || name === "api_key") {
        return stripQuotes(line.slice(eq + 1).trim());
      }
      continue;
    }
    return stripQuotes(line);
  }
  return undefined;
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    return s.slice(1, -1);
  }
  return s;
}

/** Resolves the key or returns undefined; pure over an injected env for tests. */
export function findApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromEnv = env["INSTANTLY_API_KEY"]?.trim();
  if (fromEnv) return fromEnv;
  for (const path of credentialPaths(env)) {
    try {
      const key = parseCredentialsFile(readFileSync(path, "utf8"));
      if (key) return key;
    } catch {
      // File missing or unreadable: fall through to the next candidate.
    }
  }
  return undefined;
}

/** Like findApiKey but throws the actionable missing-key error. */
export function requireApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = findApiKey(env);
  if (key) return key;
  const configPath = credentialPaths(env)[credentialPaths(env).length - 1]!;
  throw new AxiError(
    "no Instantly API key found",
    `set INSTANTLY_API_KEY, or write the key to ${configPath}. ` +
      `Create a key at ${DASHBOARD_URL}`,
  );
}

/** True when a key is available without disclosing it (for the home view). */
export function hasApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return findApiKey(env) !== undefined;
}
