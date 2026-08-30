import { dispatch, type Registry } from "./cli/router.js";
import { homeCommand } from "./commands/home.js";
import { rootHelpText } from "./skill/content.js";
import { campaignsList, campaignDetail } from "./commands/campaigns.js";
import { campaignLaunch, campaignPause } from "./commands/campaign_lifecycle.js";
import { leadsList, leadAdd, leadRemove } from "./commands/leads.js";
import { accountsList } from "./commands/accounts.js";
import { analytics } from "./commands/analytics.js";
import { verify } from "./commands/verify.js";
import { webhooksList, webhookAdd, webhookRemove } from "./commands/webhooks.js";

const registry: Registry = {
  tool: "instantly-axi",
  root: homeCommand,
  rootHelp: rootHelpText,
  commands: {
    campaigns: campaignsList,
    campaign: campaignDetail,
    "campaign launch": campaignLaunch,
    "campaign pause": campaignPause,
    leads: leadsList,
    "lead add": leadAdd,
    "lead rm": leadRemove,
    accounts: accountsList,
    analytics,
    verify,
    webhooks: webhooksList,
    "webhooks add": webhookAdd,
    "webhooks rm": webhookRemove,
  },
  aliases: {},
};

const code = await dispatch(registry, process.argv.slice(2));
process.exit(code);
