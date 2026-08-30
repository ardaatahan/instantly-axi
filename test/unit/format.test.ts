// Response summarization: status decoding, rate math, and row shaping.

import { describe, expect, it } from "vitest";
import {
  campaignStatusLabel,
  accountStatusLabel,
  warmupStatusLabel,
  campaignRow,
  leadRow,
  accountRow,
  analyticsRows,
  rate,
} from "../../dist/api/format.js";

describe("status labels", () => {
  it("decodes campaign statuses", () => {
    expect(campaignStatusLabel(0)).toBe("draft");
    expect(campaignStatusLabel(1)).toBe("active");
    expect(campaignStatusLabel(2)).toBe("paused");
    expect(campaignStatusLabel(3)).toBe("completed");
    expect(campaignStatusLabel(-99)).toBe("account-suspended");
  });
  it("falls back gracefully for unknown codes", () => {
    expect(campaignStatusLabel(42)).toBe("status-42");
    expect(campaignStatusLabel(undefined)).toBe("unknown");
  });
  it("decodes account and warmup statuses", () => {
    expect(accountStatusLabel(1)).toBe("active");
    expect(accountStatusLabel(-1)).toBe("connection-error");
    expect(warmupStatusLabel(1)).toBe("active");
    expect(warmupStatusLabel(null)).toBe("none");
  });
});

describe("rate", () => {
  it("computes a percentage string", () => {
    expect(rate(25, 100)).toBe("25.0%");
    expect(rate(1, 3)).toBe("33.3%");
  });
  it("returns '-' when the denominator is zero", () => {
    expect(rate(5, 0)).toBe("-");
  });
});

describe("row shaping", () => {
  it("maps a campaign", () => {
    expect(campaignRow({ id: "c1", name: "Q1", status: 1, daily_limit: 50 })).toEqual({
      id: "c1",
      name: "Q1",
      status: "active",
      daily_limit: 50,
    });
  });
  it("maps a lead with company fallback", () => {
    const r = leadRow({ id: "l1", email: "a@b.com", company_name: "Acme", verification_status: "verified" });
    expect(r.email).toBe("a@b.com");
    expect(r.company).toBe("Acme");
    expect(r.verification).toBe("verified");
  });
  it("maps an account", () => {
    const r = accountRow({ email: "s@x.com", status: 1, warmup_status: 1, stat_warmup_score: 88 });
    expect(r).toMatchObject({ email: "s@x.com", status: "active", warmup: "active", warmup_score: 88 });
  });
});

describe("analyticsRows", () => {
  it("derives open/reply/bounce rates from sent count", () => {
    const rows = analyticsRows({
      campaign_name: "Q1",
      emails_sent_count: 100,
      open_count: 40,
      reply_count: 10,
      bounced_count: 5,
    });
    const map = Object.fromEntries(rows);
    expect(map["emails_sent"]).toBe(100);
    expect(map["open_rate"]).toBe("40.0%");
    expect(map["reply_rate"]).toBe("10.0%");
    expect(map["bounce_rate"]).toBe("5.0%");
  });
});
