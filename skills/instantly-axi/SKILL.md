---
name: instantly-axi
description: "Inspect and manage Instantly.ai cold-email campaigns, leads, and sending accounts from the terminal"
---

# instantly-axi

Inspect and manage Instantly.ai cold-email campaigns, leads, and sending accounts from the terminal (built against AXI spec axi/1.0-2026-07). Run the commands below with npx - no install needed.

## Safety model (read this first)

Every command that sends live email, spends credits, or deletes data is **gated**: it
requires an explicit `--confirm` flag. Without `--confirm` these commands print a dry-run
plan - the exact method, endpoint, and payload that *would* be sent - and make **no API
call** (exit 0). A bare invocation can never send email or destroy data. Read-only
commands (list/get/analytics) need no flag.

Gated commands: `campaign launch`, `lead add`, `lead rm`, `verify`, `webhooks add`,
`webhooks rm`. Note `campaign pause` is *not* gated (it only reduces sending).

## Commands

```
run: prefix each command with npx -y instantly-axi (e.g. npx -y instantly-axi campaigns)
commands[13]{command,gated,summary}:
  campaigns,no,List campaigns (--status active|paused|draft|completed)
  campaign <id>,no,"Show a campaign's status, schedule, and sequence steps"
  campaign launch <id>,yes (--confirm),Activate a campaign - starts sending live email
  campaign pause <id>,no,Pause a campaign (reversible)
  leads --campaign <id>|--list <id>,no,List leads in a campaign or list
  lead add --campaign <id> --email <email>,yes (--confirm),Add a lead
  lead rm <id>,yes (--confirm),Delete a lead permanently
  accounts,no,List sending accounts with health and warmup status
  analytics <campaign-id>,no,"Opens, replies, bounces, and rates for a campaign"
  verify <email>,yes (--confirm),Verify an email address - consumes credits
  webhooks,no,List configured webhooks
  webhooks add <url> --events <event>,yes (--confirm),Create a webhook
  webhooks rm <id>,yes (--confirm),Delete a webhook
safety[3]:
  Commands marked gated=yes never call the API without --confirm.
  Without --confirm they print a dry-run plan (method, endpoint, payload) and exit 0.
  Gated actions send live email, spend credits, or delete data.
help[4]:
  npx -y instantly-axi campaigns --status active
  npx -y instantly-axi accounts
  npx -y instantly-axi campaign <id>
  npx -y instantly-axi campaign launch <id> --confirm
auth[2]:
  Set INSTANTLY_API_KEY, or write the key to ~/.config/instantly-axi/credentials.
  Create a key at https://app.instantly.ai/app/settings/integrations
```

## Auth

Set `INSTANTLY_API_KEY` (preferred) or write the key to
`~/.config/instantly-axi/credentials`. Create a key in the Instantly dashboard under
Settings > Integrations. The key is never logged or echoed.

Every command supports `--help`. Exit codes: 0 success/no-op, 1 error, 2 usage error.
All output is TOON on stdout.
