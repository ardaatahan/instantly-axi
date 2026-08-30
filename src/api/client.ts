// Typed wrappers over the Instantly API v2 endpoints used by the CLI. Every
// method is a thin, verified mapping to a documented endpoint
// (https://developer.instantly.ai/). Credentials are resolved lazily, so a
// gated dry-run never needs a key.

import { requireApiKey } from "./credentials.js";
import { createTransport, resolveBase, type Fetcher, type Transport } from "./http.js";

export interface Page<T> {
  items: T[];
  next_starting_after?: string;
}

export interface InstantlyClient {
  listCampaigns(q: { status?: number; limit?: number; starting_after?: string; search?: string }): Promise<Page<any>>;
  getCampaign(id: string): Promise<any>;
  activateCampaign(id: string): Promise<any>;
  pauseCampaign(id: string): Promise<any>;
  listLeads(body: { campaign?: string; list_id?: string; limit?: number; starting_after?: string }): Promise<Page<any>>;
  createLead(body: Record<string, unknown>): Promise<any>;
  deleteLead(id: string): Promise<any>;
  listAccounts(q: { limit?: number; starting_after?: string; search?: string }): Promise<Page<any>>;
  campaignAnalytics(q: { id?: string; start_date?: string; end_date?: string }): Promise<any[]>;
  createEmailVerification(email: string): Promise<any>;
  listWebhooks(q: { limit?: number; starting_after?: string }): Promise<Page<any>>;
  createWebhook(body: Record<string, unknown>): Promise<any>;
  deleteWebhook(id: string): Promise<any>;
}

/** Wraps a Transport in the endpoint methods. */
export function clientFromTransport(t: Transport): InstantlyClient {
  return {
    listCampaigns: (q) => t.request({ method: "GET", path: "/campaigns", query: q }),
    getCampaign: (id) => t.request({ method: "GET", path: `/campaigns/${encodeURIComponent(id)}` }),
    activateCampaign: (id) => t.request({ method: "POST", path: `/campaigns/${encodeURIComponent(id)}/activate` }),
    pauseCampaign: (id) => t.request({ method: "POST", path: `/campaigns/${encodeURIComponent(id)}/pause` }),
    listLeads: (body) => t.request({ method: "POST", path: "/leads/list", body }),
    createLead: (body) => t.request({ method: "POST", path: "/leads", body }),
    deleteLead: (id) => t.request({ method: "DELETE", path: `/leads/${encodeURIComponent(id)}` }),
    listAccounts: (q) => t.request({ method: "GET", path: "/accounts", query: q }),
    campaignAnalytics: (q) => t.request({ method: "GET", path: "/campaigns/analytics", query: q }),
    createEmailVerification: (email) => t.request({ method: "POST", path: "/email-verification", body: { email } }),
    listWebhooks: (q) => t.request({ method: "GET", path: "/webhooks", query: q }),
    createWebhook: (body) => t.request({ method: "POST", path: "/webhooks", body }),
    deleteWebhook: (id) => t.request({ method: "DELETE", path: `/webhooks/${encodeURIComponent(id)}` }),
  };
}

/**
 * Builds a live client from the environment. Throws the actionable missing-key
 * error when no credentials are configured. Call this only when a real request
 * is about to be made (read commands, or the --confirm execute path).
 */
export function createClient(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: Fetcher = fetch,
): InstantlyClient {
  const key = requireApiKey(env);
  const transport = createTransport(fetcher, key, resolveBase(env));
  return clientFromTransport(transport);
}
