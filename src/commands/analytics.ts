// Read-only: campaign analytics summary (opens, replies, bounces, rates).

import type { CommandModule } from "../cli/router.js";
import { createClient } from "../api/client.js";
import { UsageError } from "../output/errors.js";
import { emitBlock, print } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { analyticsRows } from "../api/format.js";

export const analytics: CommandModule = {
  spec: {
    name: "analytics",
    summary: "Show a campaign's engagement analytics (opens, replies, bounces)",
    args: [{ name: "campaign-id", required: true, description: "campaign id (UUID)" }],
    flags: [
      { name: "start", type: "string", description: "start date (YYYY-MM-DD)" },
      { name: "end", type: "string", description: "end date (YYYY-MM-DD)" },
    ],
    examples: [
      "instantly-axi analytics <campaign-id>",
      "instantly-axi analytics <campaign-id> --start 2026-01-01 --end 2026-01-31",
    ],
  },
  async run(parsed) {
    const id = parsed.positionals[0];
    if (!id) throw new UsageError("missing required argument <campaign-id>", "instantly-axi analytics <campaign-id>");
    const result = await createClient().campaignAnalytics({
      id,
      start_date: parsed.flags["start"] as string | undefined,
      end_date: parsed.flags["end"] as string | undefined,
    });
    const row = Array.isArray(result) ? result[0] : result;

    if (!row) {
      print(`analytics: no analytics found for campaign ${id}`);
      print(helpBlock([`instantly-axi campaign ${id}`, "instantly-axi campaigns"]));
      return 0;
    }

    print(emitBlock("analytics", analyticsRows(row).map(([k, v]) => `${k}: ${v}`)));
    print(helpBlock([`instantly-axi campaign ${id}`, "instantly-axi campaigns --status active"]));
    return 0;
  },
};
