import { c } from "../colors.ts";
import type { Config } from "../config.ts";
import { resolveLocale, t } from "../i18n.ts";
import { picker } from "../picker.ts";
import { editableInput } from "../prompts.ts";
import {
  getWatchProviders,
  searchAll,
  type MediaItem,
  type TmdbProvider,
} from "../tmdb.ts";

const PAGE_SIZE = 10;
const SOFT_LIMIT = 25;
const OVERVIEW_MAX = 140;

function year(date: string | null): string {
  return date && date.length >= 4 ? date.slice(0, 4) : "????";
}

function tag(type: MediaItem["mediaType"], m: ReturnType<typeof t>): string {
  return c.dim(`[${type === "tv" ? m.tagTv : m.tagMovie}]`);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function mark(owned: boolean): string {
  return owned ? c.green("✓") : c.red("✗");
}

function joinNames(providers: ReadonlyArray<TmdbProvider> | undefined): string {
  return providers?.map((p) => p.provider_name).join(", ") ?? "";
}

async function pickItem(
  results: ReadonlyArray<MediaItem>,
  m: ReturnType<typeof t>,
): Promise<MediaItem | null> {
  const visible = results.slice(0, SOFT_LIMIT);
  const dropped = results.length - visible.length;

  const choices = visible.map((mi) => ({
    name: `${tag(mi.mediaType, m)} ${mi.title} ${c.dim(`(${year(mi.date)})`)}${mi.title !== mi.originalTitle ? c.dim(` — ${mi.originalTitle}`) : ""}`,
    value: mi,
    description: mi.overview.slice(0, OVERVIEW_MAX),
  }));

  const headerParts: string[] = [m.whichOne];
  if (dropped > 0) {
    headerParts.push(c.dim(`(${visible.length}/${results.length})`));
  }

  return picker<MediaItem>({
    message: headerParts.join(" "),
    pageSize: PAGE_SIZE,
    choices,
    extraKeys: [["esc", "edit"]],
  });
}

function printOwnership(
  flat: ReadonlyArray<TmdbProvider>,
  owned: ReadonlySet<number>,
  m: ReturnType<typeof t>,
): void {
  if (flat.length === 0) return;
  const sorted = [...flat].sort((a, b) => {
    const ao = owned.has(a.provider_id) ? 0 : 1;
    const bo = owned.has(b.provider_id) ? 0 : 1;
    return ao - bo || a.provider_name.localeCompare(b.provider_name);
  });
  const width = Math.max(...sorted.map((p) => p.provider_name.length));
  for (const p of sorted) {
    const isOwned = owned.has(p.provider_id);
    const name = pad(p.provider_name, width);
    const status = isOwned ? c.green(m.owned) : c.dim(m.notOwned);
    console.log(`  ${c.dim(m.onPrefix)} ${name}  ${mark(isOwned)} ${status}`);
  }
}

async function displayItem(
  item: MediaItem,
  cfg: Config,
  m: ReturnType<typeof t>,
): Promise<void> {
  process.stdout.write(c.dim(`  ${m.fetchingProviders(cfg.region)}`));
  const providers = await getWatchProviders(item.id, item.mediaType, cfg.tmdbToken);
  console.log(c.dim(m.done));

  const regionData = providers.results[cfg.region];
  const owned = new Set(cfg.subscriptions);

  console.log();
  console.log(
    `  ${c.bold(item.title)} ${c.dim(`(${year(item.date)})`)}  ${tag(item.mediaType, m)}  ${c.dim(cfg.region)}`,
  );
  console.log();

  if (!regionData) {
    console.log(`  ${c.yellow(m.notAvailable(cfg.region))}`);
    console.log(c.dim(`  ${m.notAvailableHint}`));
    return;
  }

  const flat = regionData.flatrate ?? [];
  const ownedHits = flat.filter((p) => owned.has(p.provider_id));

  if (ownedHits.length > 0) {
    const names = ownedHits.map((p) => p.provider_name).join(", ");
    console.log(`  ${c.green("●")} ${m.onYourSubsPrefix} ${c.bold(names)}`);
  } else if (flat.length > 0) {
    console.log(`  ${c.yellow("●")} ${m.streamingNotOnSubs(cfg.region)}`);
  } else {
    console.log(`  ${c.yellow("●")} ${m.noStreamingSub(cfg.region)}`);
  }

  if (flat.length > 0) {
    console.log();
    printOwnership(flat, owned, m);
  }

  const free = regionData.free ?? [];
  if (free.length > 0) {
    console.log();
    console.log(c.dim(`  ${m.free}`));
    printOwnership(free, owned, m);
  }

  const ads = regionData.ads ?? [];
  if (ads.length > 0) {
    console.log();
    console.log(`  ${pad(m.ads, 10)}${joinNames(ads)}`);
  }

  const rent = regionData.rent ?? [];
  const buy = regionData.buy ?? [];
  if (rent.length > 0 || buy.length > 0) {
    if (ads.length === 0) console.log();
    if (rent.length > 0) console.log(`  ${pad(m.rent, 10)}${joinNames(rent)}`);
    if (buy.length > 0) console.log(`  ${pad(m.buy, 10)}${joinNames(buy)}`);
  }

  if (regionData.link) {
    console.log();
    console.log(`  ${c.dim(m.link)}  ${c.cyan(regionData.link)}`);
  }
}

export async function runSearch(query: string, cfg: Config): Promise<void> {
  const m = t(resolveLocale(cfg.language));
  let currentQuery = query.trim();
  if (!currentQuery) throw new Error(m.searchEmpty);

  // pipe mode: no prompts
  if (!process.stdin.isTTY) {
    process.stdout.write(c.dim(`  ${m.searching(currentQuery)}`));
    const results = await searchAll(currentQuery, cfg.tmdbToken, {
      region: cfg.region,
      language: cfg.language,
    });
    console.log(c.dim(m.resultsCount(results.length)));
    if (results.length === 0) throw new Error(m.noMatch);
    if (results.length > 1) throw new Error(m.ambiguousQuery(results.length));
    await displayItem(results[0]!, cfg, m);
    return;
  }

  while (true) {
    process.stdout.write(c.dim(`  ${m.searching(currentQuery)}`));
    const results = await searchAll(currentQuery, cfg.tmdbToken, {
      region: cfg.region,
      language: cfg.language,
    });
    console.log(c.dim(m.resultsCount(results.length)));

    let picked: MediaItem | null = null;
    if (results.length > 0) {
      picked = await pickItem(results, m);
    } else {
      console.log(`\n  ${m.noMatch}`);
    }

    if (picked !== null) {
      await displayItem(picked, cfg, m);
      return;
    }

    const next = (
      await editableInput({
        message: c.dim("ww"),
        prefill: currentQuery,
      })
    ).trim();
    if (!next) throw new Error(m.searchEmpty);
    currentQuery = next;
  }
}
