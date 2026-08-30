// Low-level HTTP against the Instantly API v2, built on the platform `fetch`
// (Node >=20, no runtime deps). The fetcher and base URL are injectable so
// tests exercise request construction and error mapping without the network.
//
// The API key is sent only in the Authorization header. It is never placed in
// a URL, a log line, or an error message.

import { AxiError } from "../output/errors.js";

export const DEFAULT_BASE = "https://api.instantly.ai/api/v2";

export type Fetcher = typeof fetch;

export interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path under the base, e.g. "/campaigns" or "/campaigns/abc/activate". */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export interface Transport {
  request<T = unknown>(opts: RequestOptions): Promise<T>;
}

/** Resolves the base URL, honoring an override for tests / self-hosting. */
export function resolveBase(env: NodeJS.ProcessEnv = process.env): string {
  const override = env["INSTANTLY_API_BASE"]?.trim();
  return (override || DEFAULT_BASE).replace(/\/+$/, "");
}

function buildUrl(base: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(base + (path.startsWith("/") ? path : "/" + path));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/**
 * Maps a non-2xx response to a structured AxiError with an actionable
 * suggestion. The response body (never the key) is mined for a message.
 */
function errorForStatus(status: number, bodyText: string): AxiError {
  let apiMessage = "";
  try {
    const parsed = JSON.parse(bodyText);
    apiMessage =
      (parsed?.message as string) ||
      (parsed?.error as string) ||
      (typeof parsed?.detail === "string" ? parsed.detail : "");
  } catch {
    apiMessage = bodyText.slice(0, 200);
  }
  const detail = apiMessage ? `: ${apiMessage}` : "";
  switch (status) {
    case 401:
    case 403:
      return new AxiError(
        `authentication failed (HTTP ${status})${detail}`,
        "check that INSTANTLY_API_KEY is valid and has the required scope",
      );
    case 402:
      return new AxiError(
        `payment required (HTTP 402)${detail}`,
        "this action needs an active paid plan or available credits in Instantly",
      );
    case 404:
      return new AxiError(
        `not found (HTTP 404)${detail}`,
        "verify the id - list the resource first to get a valid id",
      );
    case 422:
      return new AxiError(
        `invalid request (HTTP 422)${detail}`,
        "check the required fields for this endpoint",
      );
    case 429:
      return new AxiError(
        `rate limited (HTTP 429)${detail}`,
        "wait a moment and retry",
      );
    default:
      return new AxiError(
        `Instantly API error (HTTP ${status})${detail}`,
        status >= 500 ? "the Instantly API had a server error; retry shortly" : "check the request and try again",
      );
  }
}

/** Creates a Transport bound to a key + base, using the given fetcher. */
export function createTransport(fetcher: Fetcher, key: string, base: string): Transport {
  return {
    async request<T>(opts: RequestOptions): Promise<T> {
      const url = buildUrl(base, opts.path, opts.query);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      };
      const init: RequestInit = { method: opts.method, headers };
      if (opts.body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(opts.body);
      }

      let res: Response;
      try {
        res = await fetcher(url, init);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new AxiError(
          `could not reach the Instantly API: ${msg}`,
          "check your network connection and INSTANTLY_API_BASE if set",
        );
      }

      const text = await res.text();
      if (!res.ok) throw errorForStatus(res.status, text);
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new AxiError(
          "Instantly API returned a non-JSON response",
          "retry; report if it persists",
        );
      }
    },
  };
}
