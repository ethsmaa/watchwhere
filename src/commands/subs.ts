import { checkbox } from "@inquirer/prompts";
import { c } from "../colors.ts";
import { loadConfig, saveConfig } from "../config.ts";
import { resolveLocale, t } from "../i18n.ts";
import { getCachedRegionProviders } from "../cache.ts";
import { applyRegionPinning, isSubscriptionProvider } from "../tmdb.ts";

export async function runSubs(): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg) {
    throw new Error(t(resolveLocale()).noConfigYet);
  }
  const m = t(resolveLocale(cfg.language));

  process.stdout.write(c.dim(`  ${m.loadingProviders(cfg.region)}`));
  const allProviders = await getCachedRegionProviders(cfg.region, cfg.tmdbToken);
  const providers = applyRegionPinning(
    allProviders.filter(isSubscriptionProvider),
    cfg.region,
  );
  console.log(c.dim(m.providersFound(providers.length)));

  if (providers.length === 0) {
    throw new Error(m.noProviders(cfg.region));
  }

  const current = new Set(cfg.subscriptions);

  const subscriptions = await checkbox<number>({
    message: `${m.yourSubsLabel(cfg.region)} ${c.dim(m.toggleHintSave)}:`,
    choices: providers.map((p) => ({
      name: p.provider_name,
      value: p.provider_id,
      checked: current.has(p.provider_id),
    })),
    pageSize: 15,
    loop: false,
  });

  const added = subscriptions.filter((id) => !current.has(id)).length;
  const removed = cfg.subscriptions.filter((id) => !subscriptions.includes(id)).length;

  const saved = await saveConfig({
    tmdbToken: cfg.tmdbToken,
    region: cfg.region,
    language: cfg.language,
    subscriptions,
  });

  console.log();
  console.log(`  ${c.green("✓")} ${m.updatedConfigFile} ${c.dim("~/.watchwhere/config.json")}`);
  console.log(`    ${m.subscriptionsLabel.padEnd(13)} ${saved.subscriptions.length} ${c.dim(`(+${added} / -${removed})`)}`);
}
