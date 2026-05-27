import { input } from "@inquirer/prompts";
import { c } from "../colors.ts";
import { loadConfig, saveConfig } from "../config.ts";
import { resolveLocale, t } from "../i18n.ts";

export async function runRegion(): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg) {
    throw new Error(t(resolveLocale()).noConfigYet);
  }
  const m = t(resolveLocale(cfg.language));

  console.log(c.dim(`  ${m.currentRegion(cfg.region)}`));
  console.log();

  const region = (
    await input({
      message: m.regionPrompt,
      default: cfg.region,
      validate: (v) =>
        /^[A-Za-z]{2}$/.test(v.trim()) ? true : m.regionInvalid,
    })
  )
    .trim()
    .toUpperCase();

  if (region === cfg.region) {
    console.log();
    console.log(c.dim(`  ${m.currentRegion(region)}`));
    return;
  }

  // subs are kept — some provider IDs may not exist in the new region
  // but ww subs lets the user prune; don't destroy data silently
  await saveConfig({
    tmdbToken: cfg.tmdbToken,
    region,
    language: cfg.language,
    subscriptions: cfg.subscriptions,
  });

  console.log();
  console.log(`  ${c.green("✓")} ${m.regionUpdated(region)}`);
  console.log(c.dim(`  ${m.regionHintReviewSubs}`));
}
