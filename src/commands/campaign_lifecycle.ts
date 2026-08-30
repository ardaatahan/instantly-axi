// Campaign lifecycle mutations. `launch` is send-triggering and gated behind
// --confirm; `pause` reduces sending and is not gated (per the safety model).

import type { CommandModule } from "../cli/router.js";
import { createClient } from "../api/client.js";
import { gate } from "../safety/gate.js";
import { UsageError } from "../output/errors.js";
import { print, emitBlock } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { campaignStatusLabel } from "../api/format.js";

export const campaignLaunch: CommandModule = {
  spec: {
    name: "campaign launch",
    summary: "Activate a campaign (starts sending live email) - gated by --confirm",
    args: [{ name: "id", required: true, description: "campaign id (UUID)" }],
    flags: [{ name: "confirm", type: "boolean", description: "actually activate; without it, dry-run only" }],
    examples: [
      "instantly-axi campaign launch <id>",
      "instantly-axi campaign launch <id> --confirm",
    ],
  },
  async run(parsed) {
    const id = parsed.positionals[0];
    if (!id) throw new UsageError("missing required argument <id>", "instantly-axi campaign launch <id>");
    const confirm = parsed.flags["confirm"] === true;
    return gate(
      {
        effect: "activates the campaign; Instantly begins sending live cold email per its schedule",
        method: "POST",
        endpoint: `/campaigns/${id}/activate`,
        summary: [["campaign_id", id]],
        confirmCommand: `instantly-axi campaign launch ${id} --confirm`,
      },
      confirm,
      async () => {
        const c = await createClient().activateCampaign(id);
        return {
          lines: [
            "launched: campaign activated",
            emitBlock("campaign", [
              `id: ${c?.id ?? id}`,
              `status: ${campaignStatusLabel(c?.status)}`,
            ]),
          ],
          suggestions: [`instantly-axi campaign ${id}`, `instantly-axi campaign pause ${id}`],
        };
      },
    );
  },
};

export const campaignPause: CommandModule = {
  spec: {
    name: "campaign pause",
    summary: "Pause a campaign (stops further sending); reversible, no --confirm needed",
    args: [{ name: "id", required: true, description: "campaign id (UUID)" }],
    flags: [],
    examples: ["instantly-axi campaign pause <id>"],
  },
  async run(parsed) {
    const id = parsed.positionals[0];
    if (!id) throw new UsageError("missing required argument <id>", "instantly-axi campaign pause <id>");
    const c = await createClient().pauseCampaign(id);
    print("paused: campaign paused");
    print(emitBlock("campaign", [`id: ${c?.id ?? id}`, `status: ${campaignStatusLabel(c?.status)}`]));
    print(helpBlock([`instantly-axi campaign ${id}`, `instantly-axi campaign launch ${id}`]));
    return 0;
  },
};
