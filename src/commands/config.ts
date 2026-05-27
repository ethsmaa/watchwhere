import { c } from "../colors.ts";
import { configPath, loadConfig } from "../config.ts";
import { resolveLocale, t } from "../i18n.ts";
import { getCachedRegionProviders } from "../cache.ts";

function redact(token: string): string {
  if (token.length <= 8) return "*".repeat(token.length);
  return `${"*".repeat(token.length - 4)}${token.slice(-4)}`;
}

function relativeTime(iso: string, m: ReturnType<typeof t>): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return m.relativeNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return m.relativeMinutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return m.relativeHours(hours);
  const days = Math.floor(hours / 24);
  return m.relativeDays(days);
}

export async function runConfig(): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg) {
    throw new Error(t(resolveLocale()).noConfigYet);
  }
  const m = t(resolveLocale(cfg.language));

  process.stdout.write(c.dim(`  ${m.resolvingNames}`));
  let subNames: ReadonlyArray<string> = [];
  try {
    const providers = await getCachedRegionProviders(cfg.region, cfg.tmdbToken);
    const byId = new Map(providers.map((p) => [p.provider_id, p.provider_name]));
    subNames = cfg.subscriptions.map((id) => byId.get(id) ?? `#${id}`);
    console.log(c.dim(m.done));
  } catch {
    subNames = cfg.subscriptions.map((id) => `#${id}`);
    console.log(c.yellow(m.offline));
  }

  console.log();
  console.log(`  ${c.bold(m.configTitle)}`);
  console.log();
  console.log(`    ${m.regionLabel.padEnd(13)} ${cfg.region}`);
  console.log(`    ${m.languageLabel.padEnd(13)} ${cfg.language}`);
  console.log(`    ${m.tokenLabel.padEnd(13)} ${c.dim(redact(cfg.tmdbToken))}`);
  console.log(`    ${m.updatedLabel.padEnd(13)} ${c.dim(relativeTime(cfg.updatedAt, m))}`);
  console.log(`    ${m.pathLabel.padEnd(13)} ${c.dim(configPath)}`);
  console.log();
  console.log(`  ${c.dim(`${m.subscriptionsLabel} (${subNames.length})`)}`);
  if (subNames.length === 0) {
    console.log(`    ${c.dim(m.noSubs)}`);
  } else {
    for (const name of subNames) console.log(`    ${c.green("●")} ${name}`);
  }
}
