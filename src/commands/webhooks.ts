// Webhook commands: list (read-only), add (gated create), rm (gated delete).

import type { CommandModule } from "../cli/router.js";
import { createClient } from "../api/client.js";
import { gate } from "../safety/gate.js";
import { parseLimit } from "../cli/fields.js";
import { UsageError } from "../output/errors.js";
import { emitList, emitBlock, print } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";

const WEBHOOK_FIELDS = ["id", "name", "event_type", "target_hook_url", "status"];

export const webhooksList: CommandModule = {
  spec: {
    name: "webhooks",
    summary: "List configured webhooks",
    flags: [
      { name: "limit", type: "string", default: "50", description: "page size (1-100)" },
      { name: "after", type: "string", description: "pagination cursor (next_starting_after)" },
    ],
    examples: ["instantly-axi webhooks"],
  },
  async run(parsed) {
    const limit = parseLimit(parsed.flags["limit"]);
    const page = await createClient().listWebhooks({
      limit,
      starting_after: parsed.flags["after"] as string | undefined,
    });
    const items = page.items ?? [];

    if (items.length === 0) {
      print("webhooks: 0 webhooks configured");
      print(helpBlock(["instantly-axi webhooks add <url> --events <event>"]));
      return 0;
    }

    print(
      emitList(
        "webhooks",
        items.map((w: any) => ({
          id: w?.id ?? "",
          name: w?.name ?? "",
          event_type: w?.event_type ?? "",
          target_hook_url: w?.target_hook_url ?? "",
          status: w?.status ?? "",
        })),
        WEBHOOK_FIELDS,
      ),
    );
    const tips = ["instantly-axi webhooks add <url> --events <event>", "instantly-axi webhooks rm <id>"];
    if (page.next_starting_after) tips.push(`instantly-axi webhooks --after ${page.next_starting_after}`);
    print(helpBlock(tips));
    return 0;
  },
};

export const webhookAdd: CommandModule = {
  spec: {
    name: "webhooks add",
    summary: "Create a webhook - gated by --confirm",
    args: [{ name: "url", required: true, description: "target hook URL (https)" }],
    flags: [
      { name: "events", type: "string", description: "event type to subscribe to" },
      { name: "name", type: "string", description: "webhook display name" },
      { name: "campaign", type: "string", description: "scope to a campaign id" },
      { name: "confirm", type: "boolean", description: "actually create; without it, dry-run only" },
    ],
    examples: [
      "instantly-axi webhooks add https://example.com/hook --events email_sent",
      "instantly-axi webhooks add https://example.com/hook --events reply_received --confirm",
    ],
  },
  async run(parsed) {
    const url = parsed.positionals[0];
    if (!url) throw new UsageError("missing required argument <url>", "instantly-axi webhooks add <url> --events <event>");
    const body: Record<string, unknown> = { target_hook_url: url };
    if (parsed.flags["events"]) body["event_type"] = parsed.flags["events"];
    if (parsed.flags["name"]) body["name"] = parsed.flags["name"];
    if (parsed.flags["campaign"]) body["campaign"] = parsed.flags["campaign"];
    const confirm = parsed.flags["confirm"] === true;
    return gate(
      {
        effect: "registers a webhook that will POST workspace events to the target URL",
        method: "POST",
        endpoint: "/webhooks",
        summary: Object.entries(body).map(([k, v]) => [k, String(v)] as [string, string]),
        confirmCommand: `instantly-axi webhooks add ${url}${parsed.flags["events"] ? ` --events ${parsed.flags["events"]}` : ""} --confirm`,
      },
      confirm,
      async () => {
        const w = await createClient().createWebhook(body);
        return {
          lines: [
            "added: webhook created",
            emitBlock("webhook", [`id: ${w?.id ?? ""}`, `target_hook_url: ${w?.target_hook_url ?? url}`, `event_type: ${w?.event_type ?? ""}`]),
          ],
          suggestions: ["instantly-axi webhooks", `instantly-axi webhooks rm ${w?.id ?? "<id>"}`],
        };
      },
    );
  },
};

export const webhookRemove: CommandModule = {
  spec: {
    name: "webhooks rm",
    summary: "Delete a webhook permanently - gated by --confirm",
    args: [{ name: "id", required: true, description: "webhook id (UUID)" }],
    flags: [{ name: "confirm", type: "boolean", description: "actually delete; without it, dry-run only" }],
    examples: ["instantly-axi webhooks rm <id>", "instantly-axi webhooks rm <id> --confirm"],
  },
  async run(parsed) {
    const id = parsed.positionals[0];
    if (!id) throw new UsageError("missing required argument <id>", "instantly-axi webhooks rm <id>");
    const confirm = parsed.flags["confirm"] === true;
    return gate(
      {
        effect: "permanently deletes the webhook; event delivery to its URL stops",
        method: "DELETE",
        endpoint: `/webhooks/${id}`,
        summary: [["webhook_id", id]],
        confirmCommand: `instantly-axi webhooks rm ${id} --confirm`,
      },
      confirm,
      async () => {
        await createClient().deleteWebhook(id);
        return { lines: [`deleted: webhook ${id} removed`], suggestions: ["instantly-axi webhooks"] };
      },
    );
  },
};
