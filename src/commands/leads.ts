// Lead commands: list (read-only, paginated), add (gated create), rm (gated
// delete). Lead lists can be huge, so list output is a single summarized page
// with a cursor for the next page rather than a raw dump (AXI principle 3).

import type { CommandModule } from "../cli/router.js";
import { createClient } from "../api/client.js";
import { gate } from "../safety/gate.js";
import { selectFields, parseLimit } from "../cli/fields.js";
import { UsageError } from "../output/errors.js";
import { emitList, emitBlock, print } from "../output/toon.js";
import { helpBlock } from "../output/suggest.js";
import { leadRow } from "../api/format.js";

const LEAD_FIELDS = ["id", "email", "first_name", "last_name", "company", "verification"];

export const leadsList: CommandModule = {
  spec: {
    name: "leads",
    summary: "List leads in a campaign or lead list (one summarized page)",
    flags: [
      { name: "campaign", type: "string", description: "filter by campaign id" },
      { name: "list", type: "string", description: "filter by lead-list id" },
      { name: "limit", type: "string", default: "25", description: "page size (1-100)" },
      { name: "after", type: "string", description: "pagination cursor (next_starting_after)" },
      {
        name: "fields",
        type: "string",
        default: "id,email,first_name,company",
        description: `columns from: ${LEAD_FIELDS.join(", ")}`,
      },
    ],
    examples: [
      "instantly-axi leads --campaign <id>",
      "instantly-axi leads --list <id> --fields id,email,verification",
    ],
  },
  async run(parsed) {
    const campaign = parsed.flags["campaign"] as string | undefined;
    const list = parsed.flags["list"] as string | undefined;
    if (!campaign && !list) {
      throw new UsageError(
        "leads requires a scope: --campaign <id> or --list <id>",
        "instantly-axi leads --campaign <id>",
      );
    }
    if (campaign && list) {
      throw new UsageError("pass only one of --campaign or --list", "instantly-axi leads --campaign <id>");
    }
    const fields = selectFields(parsed.flags["fields"], LEAD_FIELDS);
    const limit = parseLimit(parsed.flags["limit"]);
    const client = createClient();
    const page = await client.listLeads({
      campaign,
      list_id: list,
      limit,
      starting_after: parsed.flags["after"] as string | undefined,
    });
    const items = page.items ?? [];
    const scope = campaign ? `campaign ${campaign}` : `list ${list}`;

    if (items.length === 0) {
      print(`leads: 0 leads found in ${scope}`);
      print(helpBlock(["instantly-axi campaigns", "instantly-axi leads --list <id>"]));
      return 0;
    }

    print(emitList("leads", items.map(leadRow), fields));
    const tips = [`instantly-axi lead add --${campaign ? "campaign" : "list"} ${campaign ?? list} --email <email>`];
    if (page.next_starting_after) {
      const scopeFlag = campaign ? `--campaign ${campaign}` : `--list ${list}`;
      tips.push(`instantly-axi leads ${scopeFlag} --after ${page.next_starting_after}`);
    }
    print(helpBlock(tips));
    return 0;
  },
};

export const leadAdd: CommandModule = {
  spec: {
    name: "lead add",
    summary: "Add a lead to a campaign or list - gated by --confirm",
    flags: [
      { name: "campaign", type: "string", description: "target campaign id" },
      { name: "list", type: "string", description: "target lead-list id" },
      { name: "email", type: "string", description: "lead email address (required for a campaign)" },
      { name: "first-name", type: "string", description: "lead first name" },
      { name: "last-name", type: "string", description: "lead last name" },
      { name: "company", type: "string", description: "lead company name" },
      { name: "confirm", type: "boolean", description: "actually create; without it, dry-run only" },
    ],
    examples: [
      "instantly-axi lead add --campaign <id> --email jane@acme.com",
      "instantly-axi lead add --list <id> --email jane@acme.com --confirm",
    ],
  },
  async run(parsed) {
    const campaign = parsed.flags["campaign"] as string | undefined;
    const list = parsed.flags["list"] as string | undefined;
    const email = parsed.flags["email"] as string | undefined;
    if (!campaign && !list) {
      throw new UsageError("target a --campaign <id> or --list <id>", "instantly-axi lead add --campaign <id> --email <email>");
    }
    if (campaign && list) {
      throw new UsageError("pass only one of --campaign or --list", "instantly-axi lead add --campaign <id> --email <email>");
    }
    if (campaign && !email) {
      throw new UsageError("--email is required when adding to a campaign", "instantly-axi lead add --campaign <id> --email <email>");
    }
    if (list && !email && !parsed.flags["first-name"] && !parsed.flags["last-name"]) {
      throw new UsageError(
        "adding to a list needs at least --email, --first-name, or --last-name",
        "instantly-axi lead add --list <id> --email <email>",
      );
    }

    const body: Record<string, unknown> = {};
    if (campaign) body["campaign"] = campaign;
    if (list) body["list_id"] = list;
    if (email) body["email"] = email;
    if (parsed.flags["first-name"]) body["first_name"] = parsed.flags["first-name"];
    if (parsed.flags["last-name"]) body["last_name"] = parsed.flags["last-name"];
    if (parsed.flags["company"]) body["company_name"] = parsed.flags["company"];

    const target = campaign ? `campaign ${campaign}` : `list ${list}`;
    const confirm = parsed.flags["confirm"] === true;
    const scopeFlag = campaign ? `--campaign ${campaign}` : `--list ${list}`;
    return gate(
      {
        effect: campaign
          ? `adds this lead to ${target}; it becomes eligible to receive campaign email`
          : `adds this lead to ${target}`,
        method: "POST",
        endpoint: "/leads",
        summary: Object.entries(body).map(([k, v]) => [k, String(v)] as [string, string]),
        confirmCommand: `instantly-axi lead add ${scopeFlag}${email ? ` --email ${email}` : ""} --confirm`,
      },
      confirm,
      async () => {
        const l = await createClient().createLead(body);
        return {
          lines: [
            "added: lead created",
            emitBlock("lead", [`id: ${l?.id ?? ""}`, `email: ${l?.email ?? email ?? ""}`, `target: ${target}`]),
          ],
          suggestions: [`instantly-axi leads ${scopeFlag}`, `instantly-axi lead rm ${l?.id ?? "<id>"}`],
        };
      },
    );
  },
};

export const leadRemove: CommandModule = {
  spec: {
    name: "lead rm",
    summary: "Delete a lead permanently - gated by --confirm",
    args: [{ name: "id", required: true, description: "lead id (UUID)" }],
    flags: [{ name: "confirm", type: "boolean", description: "actually delete; without it, dry-run only" }],
    examples: ["instantly-axi lead rm <id>", "instantly-axi lead rm <id> --confirm"],
  },
  async run(parsed) {
    const id = parsed.positionals[0];
    if (!id) throw new UsageError("missing required argument <id>", "instantly-axi lead rm <id>");
    const confirm = parsed.flags["confirm"] === true;
    return gate(
      {
        effect: "permanently deletes the lead; this cannot be undone",
        method: "DELETE",
        endpoint: `/leads/${id}`,
        summary: [["lead_id", id]],
        confirmCommand: `instantly-axi lead rm ${id} --confirm`,
      },
      confirm,
      async () => {
        await createClient().deleteLead(id);
        return {
          lines: [`deleted: lead ${id} removed`],
          suggestions: ["instantly-axi leads --campaign <id>"],
        };
      },
    );
  },
};
