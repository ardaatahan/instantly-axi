// Email verification. This consumes billable Instantly credits, so it is
// gated behind --confirm even though it sends no email.

import type { CommandModule } from "../cli/router.js";
import { createClient } from "../api/client.js";
import { gate } from "../safety/gate.js";
import { UsageError } from "../output/errors.js";
import { emitBlock } from "../output/toon.js";

export const verify: CommandModule = {
  spec: {
    name: "verify",
    summary: "Verify an email address (consumes credits) - gated by --confirm",
    args: [{ name: "email", required: true, description: "email address to verify" }],
    flags: [{ name: "confirm", type: "boolean", description: "actually verify; without it, dry-run only" }],
    examples: ["instantly-axi verify jane@acme.com", "instantly-axi verify jane@acme.com --confirm"],
  },
  async run(parsed) {
    const email = parsed.positionals[0];
    if (!email) throw new UsageError("missing required argument <email>", "instantly-axi verify <email>");
    const confirm = parsed.flags["confirm"] === true;
    return gate(
      {
        effect: "starts an email verification; this consumes billable Instantly credits",
        method: "POST",
        endpoint: "/email-verification",
        summary: [["email", email]],
        confirmCommand: `instantly-axi verify ${email} --confirm`,
      },
      confirm,
      async () => {
        const r = await createClient().createEmailVerification(email);
        return {
          lines: [
            "verified: verification requested",
            emitBlock("verification", [
              `email: ${r?.email ?? email}`,
              `verification_status: ${r?.verification_status ?? ""}`,
              `catch_all: ${r?.catch_all ?? ""}`,
              `credits_used: ${r?.credits_used ?? ""}`,
              `credits_remaining: ${r?.credits ?? ""}`,
            ]),
          ],
        };
      },
    );
  },
};
