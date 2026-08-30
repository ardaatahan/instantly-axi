// Response summarization: maps raw Instantly API JSON into compact,
// decision-relevant rows (AXI principles 2 and 4). Status codes are decoded
// to human labels so agents never have to memorize numeric enums.

// Verified against the Instantly campaign status enum.
export const CAMPAIGN_STATUS: Record<number, string> = {
  0: "draft",
  1: "active",
  2: "paused",
  3: "completed",
  4: "running-subsequences",
  [-1]: "accounts-unhealthy",
  [-2]: "bounce-protect",
  [-99]: "account-suspended",
};

// Named campaign statuses accepted by the --status filter.
export const CAMPAIGN_STATUS_BY_NAME: Record<string, number> = {
  draft: 0,
  active: 1,
  paused: 2,
  completed: 3,
};

export function campaignStatusLabel(code: unknown): string {
  const n = Number(code);
  return CAMPAIGN_STATUS[n] ?? (Number.isFinite(n) ? `status-${n}` : "unknown");
}

// Account connection status (subset of documented codes; unknowns pass through).
export const ACCOUNT_STATUS: Record<number, string> = {
  1: "active",
  2: "paused",
  [-1]: "connection-error",
  [-2]: "soft-bounce-error",
  [-3]: "sending-error",
};

export function accountStatusLabel(code: unknown): string {
  const n = Number(code);
  return ACCOUNT_STATUS[n] ?? (Number.isFinite(n) ? `status-${n}` : "unknown");
}

export const WARMUP_STATUS: Record<number, string> = {
  0: "paused",
  1: "active",
  [-1]: "banned",
  [-2]: "spam",
  [-3]: "suspended",
};

export function warmupStatusLabel(code: unknown): string {
  if (code == null || code === "") return "none";
  const n = Number(code);
  return WARMUP_STATUS[n] ?? (Number.isFinite(n) ? `warmup-${n}` : "none");
}

export interface CampaignRow {
  [key: string]: unknown;
  id: string;
  name: string;
  status: string;
  daily_limit: string | number;
}

export function campaignRow(c: any): CampaignRow {
  return {
    id: c?.id ?? "",
    name: c?.name ?? "",
    status: campaignStatusLabel(c?.status),
    daily_limit: c?.daily_limit ?? "",
  };
}

export interface LeadRow {
  [key: string]: unknown;
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  verification: string;
}

export function leadRow(l: any): LeadRow {
  return {
    id: l?.id ?? "",
    email: l?.email ?? "",
    first_name: l?.first_name ?? "",
    last_name: l?.last_name ?? "",
    company: l?.company_name ?? "",
    verification: l?.verification_status ?? "",
  };
}

export interface AccountRow {
  [key: string]: unknown;
  email: string;
  status: string;
  warmup: string;
  warmup_score: string | number;
}

export function accountRow(a: any): AccountRow {
  return {
    email: a?.email ?? "",
    status: accountStatusLabel(a?.status),
    warmup: warmupStatusLabel(a?.warmup_status),
    warmup_score: a?.stat_warmup_score ?? "",
  };
}

/** Flattens a single campaign-analytics object into label/value rows. */
export function analyticsRows(a: any): Array<[string, unknown]> {
  const sent = num(a?.emails_sent_count);
  const opens = num(a?.open_count);
  const replies = num(a?.reply_count);
  const bounces = num(a?.bounced_count);
  return [
    ["campaign", a?.campaign_name ?? a?.campaign_id ?? ""],
    ["leads_total", num(a?.leads_count)],
    ["contacted", num(a?.contacted_count)],
    ["emails_sent", sent],
    ["opens", opens],
    ["opens_unique", num(a?.open_count_unique)],
    ["open_rate", rate(opens, sent)],
    ["link_clicks", num(a?.link_click_count)],
    ["replies", replies],
    ["reply_rate", rate(replies, sent)],
    ["bounces", bounces],
    ["bounce_rate", rate(bounces, sent)],
    ["unsubscribes", num(a?.unsubscribed_count)],
    ["opportunities", num(a?.total_opportunities)],
  ];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Percentage of part/whole as a "12.3%" string; "-" when whole is 0. */
export function rate(part: number, whole: number): string {
  if (!whole) return "-";
  return `${((part / whole) * 100).toFixed(1)}%`;
}
