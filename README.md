# instantly-axi

An [AXI](https://axi.md)-compliant CLI for the [Instantly.ai](https://instantly.ai)
cold-email API. It lets an agent (or a human) inspect and manage campaigns, leads, and
sending accounts from the terminal, with a **dry-run/`--confirm` safety gate** on every
action that could send real email, spend credits, or delete data.

Built by [axi-axi](https://github.com/CodyEngel/axi-axi) against AXI spec
`axi/1.0-2026-07`. Output is [TOON](https://axi.md) on stdout; exit codes are `0`
success/no-op, `1` error, `2` usage error.

## Safety model (read this first)

This tool talks to an API that can send real cold email to real people and spend your
sending reputation and credits. Every command that **sends email, spends credits, or
irreversibly changes your workspace** is *gated*:

1. Without `--confirm`, a gated command prints a **dry-run plan** - the exact HTTP method,
   endpoint, and payload it *would* send - and makes **no API call** (exit `0`).
2. With `--confirm`, it executes.
3. A bare invocation of a gated subcommand can never send or destroy anything.

Read-only commands (`campaigns`, `campaign`, `leads`, `accounts`, `analytics`,
`webhooks`) need no flag.

| Command | Gated | Why |
|---|---|---|
| `campaign launch <id>` | yes | activates a campaign - **starts sending live email** |
| `campaign pause <id>` | no | only reduces sending; reversible |
| `lead add ...` | yes | adds a lead to the sending pipeline |
| `lead rm <id>` | yes | permanent delete |
| `verify <email>` | yes | **consumes billable credits** (no email is sent) |
| `webhooks add ...` | yes | registers an outbound event delivery |
| `webhooks rm <id>` | yes | permanent delete |

Example dry-run (no key needed, no request made):

```
$ instantly-axi campaign launch 0e2b...
dry-run: no request sent (add --confirm to execute)
plan[4]:
  effect: activates the campaign; Instantly begins sending live cold email per its schedule
  method: POST
  endpoint: /campaigns/0e2b.../activate
  campaign_id: 0e2b...
help[1]:
  instantly-axi campaign launch 0e2b... --confirm
```

## Install

Requires Node.js >= 20.

```sh
# Run without installing (recommended for agents)
npx -y github:ardaatahan/instantly-axi campaigns

# Or install globally from the GitHub repo
npm install -g github:ardaatahan/instantly-axi
instantly-axi --help
```

To hack on it locally, see [Develop](#develop) below.

## API key setup

instantly-axi never embeds, logs, or echoes your API key. Provide it one of two ways, in
this precedence order:

1. **Environment variable** (preferred): `export INSTANTLY_API_KEY=sk_...`
2. **Config file**: write the key to `~/.config/instantly-axi/credentials`
   (or set `INSTANTLY_CONFIG=/path/to/file`, or `XDG_CONFIG_HOME`). The file may contain
   a bare key on one line, or `INSTANTLY_API_KEY=...`; `#` comments and blank lines are
   ignored.

```sh
mkdir -p ~/.config/instantly-axi
printf 'INSTANTLY_API_KEY=sk_your_key_here\n' > ~/.config/instantly-axi/credentials
chmod 600 ~/.config/instantly-axi/credentials
```

Create a key in the Instantly dashboard under **Settings > Integrations**
(<https://app.instantly.ai/app/settings/integrations>). Keys can be scope-limited; a
read-only key is enough for the list/get/analytics commands.

If no key is configured, read commands fail with a clear, actionable error (they never
crash), and the no-args home view shows a command + auth overview instead of live data.

`INSTANTLY_API_BASE` overrides the API base URL (default
`https://api.instantly.ai/api/v2`); it is used by the test suite and for self-hosted
proxies.

## Commands

Every command supports `--help` with its flags, defaults, and examples. Run with no
arguments for a live overview (credential status plus a few campaign/account summaries).

### Read-only

```sh
# List campaigns, optionally filtered by status
instantly-axi campaigns
instantly-axi campaigns --status active
instantly-axi campaigns --fields id,name,status --limit 20 --after <cursor>

# Campaign detail: status, schedule, and sequence steps (first body truncated;
# --full shows every step body)
instantly-axi campaign <id>
instantly-axi campaign <id> --full

# List leads in a campaign or lead list (one summarized page; use --after to page)
instantly-axi leads --campaign <id>
instantly-axi leads --list <id> --fields id,email,verification

# Connected sending accounts with health and warmup status
instantly-axi accounts
instantly-axi accounts --search acme.com

# Campaign engagement analytics (opens, replies, bounces, and derived rates)
instantly-axi analytics <campaign-id>
instantly-axi analytics <campaign-id> --start 2026-01-01 --end 2026-01-31

# Configured webhooks
instantly-axi webhooks
```

### Gated (require `--confirm` to execute)

```sh
# Activate a campaign - STARTS SENDING LIVE EMAIL
instantly-axi campaign launch <id>            # dry-run
instantly-axi campaign launch <id> --confirm  # execute

# Pause a campaign (NOT gated - reversible, stops further sending)
instantly-axi campaign pause <id>

# Add a lead to a campaign or list
instantly-axi lead add --campaign <id> --email jane@acme.com --confirm
instantly-axi lead add --list <id> --email jane@acme.com --first-name Jane --confirm

# Delete a lead permanently
instantly-axi lead rm <id> --confirm

# Verify an email address - CONSUMES CREDITS
instantly-axi verify jane@acme.com --confirm

# Create / delete a webhook
instantly-axi webhooks add https://example.com/hook --events reply_received --confirm
instantly-axi webhooks rm <id> --confirm
```

## Credit-consuming and sending endpoints

- `verify <email>` calls `POST /email-verification`, which **spends Instantly credits**
  (typically one per address) and requires an active paid plan. It is gated for this
  reason even though it sends no email. `lead add` with Instantly's import-time
  verification would also spend credits; this CLI does not enable that flag.
- `campaign launch` begins live sending subject to the campaign's schedule.

## Agent integration

Two complementary, optional paths:

- **Skill** (on-demand): [`skills/instantly-axi/SKILL.md`](skills/instantly-axi/SKILL.md)
  is generated from the same content as the home view and states the safety model for an
  agent reader. Regenerate with `npm run skill:gen`; CI runs `npm run skill:check` so it
  cannot drift.
- **Session hook** (ambient live state): `npx -y axi-axi setup hooks --dir .` installs a
  SessionStart hook that loads the home view at session start.

## Develop

```sh
npm install
npm run build
node bin/instantly-axi.js          # home view
npm test                           # offline suite (unit + e2e against a mock API)
npm run skill:gen                  # regenerate SKILL.md (commit it)

npx -y axi-axi validate "node bin/instantly-axi.js" --dir .
```

The test suite runs fully offline: request construction, response summarization, and the
safety gate are exercised against a local mock HTTP server and injected fetchers. In
particular, `test/e2e/server.test.ts` proves that every gated command makes **zero
network requests** without `--confirm`, and `test/unit/gate.test.ts` proves the gate never
invokes its executor on the dry-run path.

### Live smoke test (post-key)

Once you have a real key, sanity-check read paths against the live API:

```sh
export INSTANTLY_API_KEY=sk_...
instantly-axi                      # home view with live campaign/account summaries
instantly-axi campaigns
instantly-axi accounts
```

Gated writes should first be run without `--confirm` to inspect the dry-run plan.

## Structure

- `src/cli/`, `src/output/` - shared AXI plumbing (strict flag parsing, TOON output,
  structured errors), from the axi-axi scaffold.
- `src/api/` - credentials resolution, the `fetch`-based HTTP transport, typed endpoint
  wrappers, and response summarizers.
- `src/safety/gate.ts` - the single choke point for every gated action.
- `src/commands/` - one module per resource.
- `src/skill/content.ts` - single source for the home view, root `--help`, and
  `SKILL.md`.

## License

[MIT](LICENSE)
