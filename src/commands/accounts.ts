// Read-only: list connected sending accounts with health and warmup status.

import type { CommandModule } from "../cli/router.js";
import { createClient } from "../api/client.js";
import { selectFields, parseLimit } from "../cli/fields.js";
import { emitList, print } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { accountRow } from "../api/format.js";

const ACCOUNT_FIELDS = ["email", "status", "warmup", "warmup_score"];

export const accountsList: CommandModule = {
  spec: {
    name: "accounts",
    summary: "List connected sending accounts with health and warmup status",
    flags: [
      { name: "search", type: "string", description: "filter by email substring" },
      { name: "limit", type: "string", default: "50", description: "page size (1-100)" },
      { name: "after", type: "string", description: "pagination cursor (next_starting_after)" },
      {
        name: "fields",
        type: "string",
        default: "email,status,warmup,warmup_score",
        description: `columns from: ${ACCOUNT_FIELDS.join(", ")}`,
      },
    ],
    examples: ["instantly-axi accounts", "instantly-axi accounts --search acme.com"],
  },
  async run(parsed) {
    const fields = selectFields(parsed.flags["fields"], ACCOUNT_FIELDS);
    const limit = parseLimit(parsed.flags["limit"]);
    const page = await createClient().listAccounts({
      search: parsed.flags["search"] as string | undefined,
      limit,
      starting_after: parsed.flags["after"] as string | undefined,
    });
    const items = page.items ?? [];

    if (items.length === 0) {
      print("accounts: 0 sending accounts connected");
      print(helpBlock(["instantly-axi campaigns"]));
      return 0;
    }

    const rows = items.map(accountRow);
    const active = rows.filter((r) => r.status === "active").length;
    print(emitList("accounts", rows, fields));
    print(`summary: ${active} of ${rows.length} shown accounts active`);
    const tips = ["instantly-axi campaigns"];
    if (page.next_starting_after) tips.push(`instantly-axi accounts --after ${page.next_starting_after}`);
    print(helpBlock(tips));
    return 0;
  },
};
