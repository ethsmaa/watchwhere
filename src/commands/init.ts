import { input, password } from "@inquirer/prompts";
import { c } from "../colors.ts";
import { filterableCheckbox } from "../checkbox.ts";
import { loadConfig, saveConfig } from "../config.ts";
import { resolveLocale, t } from "../i18n.ts";
import { getCachedRegionProviders } from "../cache.ts";
import {
  applyRegionPinning,
  isSubscriptionProvider,
  usingProxy,
  verifyToken,
} from "../tmdb.ts";
import { pickLanguage } from "./lang.ts";

export async function runInit(): Promise<void> {
  const existing = await loadConfig();
  const m = t(resolveLocale(existing?.language));

  if (existing) {
    console.log(c.dim(`  ${m.existingConfig(existing.region)}`));
    console.log();
  }

  let tmdbToken: string;
  if (usingProxy) {
    console.log(c.dim(`  ${m.usingProxyNotice}`));
    console.log();
    tmdbToken = existing?.tmdbToken ?? "proxy";
  } else {
    tmdbToken = await password({
      message: `${m.tokenPrompt} ${c.dim(`— ${m.tokenHint}`)}`,
      mask: "*",
      validate: (v) => (v.trim().length > 20 ? true : m.tokenTooShort),
    });

    process.stdout.write(c.dim(`  ${m.verifying}`));
    const ok = await verifyToken(tmdbToken.trim());
    if (!ok) {
      console.log(c.red(m.failed));
      throw new Error(m.invalidToken);
    }
    console.log(c.green(m.ok));
  }

  const region = (
    await input({
      message: m.regionPrompt,
      default: existing?.region ?? "TR",
      validate: (v) =>
        /^[A-Za-z]{2}$/.test(v.trim()) ? true : m.regionInvalid,
    })
  )
    .trim()
    .toUpperCase();

  const language = await pickLanguage(m, existing?.language);

  process.stdout.write(c.dim(`  ${m.loadingProviders(region)}`));
  const allProviders = await getCachedRegionProviders(region, tmdbToken.trim());
  const providers = applyRegionPinning(
    allProviders.filter(isSubscriptionProvider),
    region,
  );
  console.log(c.dim(m.providersFound(providers.length)));

  if (providers.length === 0) {
    throw new Error(m.noProviders(region));
  }

  const choices = providers.map((p) => ({
    name: p.provider_name,
    value: p.provider_id,
    checked: existing?.subscriptions.includes(p.provider_id) ?? false,
  }));

  const subscriptions = await filterableCheckbox<number>({
    message: `${m.yourSubsLabel(region)}:`,
    choices,
    pageSize: 15,
    hints: {
      navigate: m.hintNavigate,
      jump: m.hintJump,
      toggle: m.hintToggle,
      search: m.hintSearch,
      filter: m.hintFilter,
      apply: m.hintApply,
      clear: m.hintClear,
      save: m.hintSave,
      cancel: m.hintCancel,
      searchLabel: m.searchLabel,
      filterLabel: m.filterLabel,
      selectedCount: m.selectedCount,
      noMatch: m.noFilterMatch,
    },
  });

  // esc at the subs step cancels init entirely — never overwrite an
  // existing config with an empty subscription list.
  if (subscriptions === null) {
    console.log();
    console.log(`  ${c.dim(m.cancelled)}`);
    return;
  }

  const saved = await saveConfig({
    tmdbToken: tmdbToken.trim(),
    region,
    language,
    subscriptions,
  });

  const m2 = t(resolveLocale(language));
  console.log();
  console.log(`  ${c.green("✓")} ${m2.savedTo} ${c.dim("~/.watchwhere/config.json")}`);
  console.log(`    ${m2.regionLabel.padEnd(13)} ${saved.region}`);
  console.log(`    ${m2.languageLabel.padEnd(13)} ${saved.language}`);
  console.log(`    ${m2.subscriptionsLabel.padEnd(13)} ${saved.subscriptions.length}`);
}
