// Read-only campaign commands: list and detail. No safety gate needed.

import type { CommandModule } from "../cli/router.js";
import { createClient } from "../api/client.js";
import { selectFields, parseLimit } from "../cli/fields.js";
import { UsageError } from "../output/errors.js";
import { emitList, emitBlock, print } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { truncate, truncationNote } from "../output/truncate.js";
import {
  CAMPAIGN_STATUS_BY_NAME,
  campaignRow,
  campaignStatusLabel,
} from "../api/format.js";

const CAMPAIGN_FIELDS = ["id", "name", "status", "daily_limit"];

export const campaignsList: CommandModule = {
  spec: {
    name: "campaigns",
    summary: "List campaigns in the workspace",
    flags: [
      {
        name: "status",
        type: "string",
        values: Object.keys(CAMPAIGN_STATUS_BY_NAME),
        description: "filter by status",
      },
      { name: "search", type: "string", description: "filter by name substring" },
      { name: "limit", type: "string", default: "50", description: "page size (1-100)" },
      { name: "after", type: "string", description: "pagination cursor (next_starting_after)" },
      {
        name: "fields",
        type: "string",
        default: "id,name,status,daily_limit",
        description: `columns from: ${CAMPAIGN_FIELDS.join(", ")}`,
      },
    ],
    examples: [
      "instantly-axi campaigns --status active",
      "instantly-axi campaigns --fields id,name,status --limit 20",
    ],
  },
  async run(parsed) {
    const fields = selectFields(parsed.flags["fields"], CAMPAIGN_FIELDS);
    const status = parsed.flags["status"] as string | undefined;
    const limit = parseLimit(parsed.flags["limit"]);
    const client = createClient();
    const page = await client.listCampaigns({
      status: status ? CAMPAIGN_STATUS_BY_NAME[status] : undefined,
      search: parsed.flags["search"] as string | undefined,
      limit,
      starting_after: parsed.flags["after"] as string | undefined,
    });
    const items = page.items ?? [];

    if (items.length === 0) {
      const ctx = status ? ` with status '${status}'` : "";
      print(`campaigns: 0 campaigns found${ctx}`);
      print(helpBlock(["instantly-axi campaigns", "instantly-axi campaigns --status active"]));
      return 0;
    }

    print(emitList("campaigns", items.map(campaignRow), fields));
    const tips = [
      "instantly-axi campaign <id>",
      "instantly-axi analytics <campaign-id>",
    ];
    if (page.next_starting_after) {
      tips.push(`instantly-axi campaigns --after ${page.next_starting_after}`);
    }
    print(helpBlock(tips));
    return 0;
  },
};

export const campaignDetail: CommandModule = {
  spec: {
    name: "campaign",
    summary: "Show a campaign's status, schedule, and sequence steps",
    args: [{ name: "id", required: true, description: "campaign id (UUID)" }],
    flags: [{ name: "full", type: "boolean", description: "show untruncated sequence bodies" }],
    examples: [
      "instantly-axi campaign 01234567-89ab-cdef-0123-456789abcdef",
      "instantly-axi campaign <id> --full",
    ],
  },
  async run(parsed) {
    const id = parsed.positionals[0];
    if (!id) throw new UsageError("missing required argument <id>", "instantly-axi campaign <id>");
    const full = parsed.flags["full"] === true;
    const client = createClient();
    const c = await client.getCampaign(id);

    const seqs = Array.isArray(c?.sequences) ? c.sequences : [];
    const steps = seqs.flatMap((s: any) => (Array.isArray(s?.steps) ? s.steps : []));
    print(
      emitBlock("campaign", [
        `id: ${c?.id ?? id}`,
        `name: ${c?.name ?? ""}`,
        `status: ${campaignStatusLabel(c?.status)}`,
        `daily_limit: ${c?.daily_limit ?? ""}`,
        `sending_accounts: ${Array.isArray(c?.email_list) ? c.email_list.length : 0}`,
        `sequence_steps: ${steps.length}`,
      ]),
    );

    const sched = c?.campaign_schedule;
    if (sched && Array.isArray(sched.schedules) && sched.schedules.length > 0) {
      print(
        emitList(
          "schedule",
          sched.schedules.map((s: any) => ({
            name: s?.name ?? "",
            timezone: s?.timezone ?? "",
            from: s?.timing?.from ?? "",
            to: s?.timing?.to ?? "",
          })),
          ["name", "timezone", "from", "to"],
        ),
      );
    }

    if (steps.length > 0) {
      const rows = steps.map((step: any, i: number) => {
        const variant = Array.isArray(step?.variants) ? step.variants[0] : undefined;
        const subject = variant?.subject ?? step?.subject ?? "";
        return { step: i + 1, subject, wait_days: step?.delay ?? step?.wait ?? "" };
      });
      print(emitList("steps", rows, ["step", "subject", "wait_days"]));

      if (full) {
        steps.forEach((step: any, i: number) => {
          const variant = Array.isArray(step?.variants) ? step.variants[0] : undefined;
          const body = String(variant?.body ?? step?.body ?? "");
          const t = truncate(body, full ? Number.MAX_SAFE_INTEGER : 800);
          print(emitBlock(`step_${i + 1}_body`, t.text.split("\n")));
        });
      } else {
        const first = steps[0];
        const variant = Array.isArray(first?.variants) ? first.variants[0] : undefined;
        const body = String(variant?.body ?? first?.body ?? "");
        if (body) {
          const t = truncate(body, 800);
          const lines = t.text.split("\n");
          if (t.truncated) lines.push(truncationNote(t).trim());
          print(emitBlock("step_1_body", lines));
        }
      }
    }

    const tips = [
      full ? `instantly-axi campaign ${id}` : `instantly-axi campaign ${id} --full`,
      `instantly-axi analytics ${id}`,
      `instantly-axi campaign launch ${id}`,
    ];
    print(helpBlock(tips));
    return 0;
  },
};
