// No-args home view (AXI principle 8): live, decision-relevant content when a
// key is configured; a compact command + auth overview otherwise. Always
// exits 0 and never dumps a usage manual.

import type { CommandModule } from "../cli/router.js";
import { print, emitList, emitBlock } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { hasApiKey } from "../api/credentials.js";
import { createClient } from "../api/client.js";
import { campaignRow, accountRow } from "../api/format.js";
import { DESCRIPTION, collapseHome, overview } from "../skill/content.js";

const VERSION = "0.1.0";

export const homeCommand: CommandModule = {
  spec: {
    name: "",
    summary: "Home view: live content first (AXI principle 8)",
    flags: [{ name: "version", type: "boolean", description: "print the tool version" }],
    examples: ["instantly-axi", "instantly-axi --version"],
  },
  async run(parsed) {
    if (parsed.flags["version"]) {
      print(`instantly-axi: ${VERSION}`);
      return 0;
    }

    const binPath = collapseHome(process.argv[1] ?? "instantly-axi");
    print(`instantly-axi: ${binPath} - ${DESCRIPTION}`);

    if (!hasApiKey()) {
      print("credentials: not configured");
      print(overview("instantly-axi"));
      return 0;
    }

    print("credentials: configured (INSTANTLY_API_KEY or config file)");
    try {
      const client = createClient();
      const [campaigns, accounts] = await Promise.all([
        client.listCampaigns({ limit: 5 }),
        client.listAccounts({ limit: 5 }),
      ]);
      const cItems = campaigns.items ?? [];
      const aItems = accounts.items ?? [];

      if (cItems.length === 0) {
        print("campaigns: 0 campaigns found");
      } else {
        print(emitList("campaigns", cItems.map(campaignRow), ["id", "name", "status"]));
      }
      const aRows = aItems.map(accountRow);
      if (aRows.length === 0) {
        print("accounts: 0 sending accounts connected");
      } else {
        const active = aRows.filter((r) => r.status === "active").length;
        print(emitList("accounts", aRows, ["email", "status", "warmup"]));
        print(`summary: ${active} of ${aRows.length} shown accounts active`);
      }
      print(helpBlock(["instantly-axi campaigns --status active", "instantly-axi accounts", "instantly-axi campaign <id>"]));
    } catch (err) {
      // Live fetch failed: stay content-first with an actionable note, exit 0.
      const msg = err instanceof Error ? err.message : String(err);
      print(emitBlock("note", [`could not load live content: ${msg}`]));
      print(overview("instantly-axi"));
    }
    return 0;
  },
};

export function rootHelp(): string {
  // Re-exported for the registry; the router calls rootHelpText via index.
  return "";
}
