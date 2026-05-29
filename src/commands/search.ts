import { c } from "../colors.ts";
import type { Config } from "../config.ts";
import { resolveLocale, t } from "../i18n.ts";
import { picker } from "../picker.ts";
import { editableInput } from "../prompts.ts";
import {
  getReleaseDates,
  getWatchProviders,
  searchAll,
  type MediaItem,
  type TmdbProvider,
  type TmdbReleaseDate,
} from "../tmdb.ts";

const PAGE_SIZE = 10;
const SOFT_LIMIT = 25;
const OVERVIEW_MAX = 140;
const OLDEST_FILM_YEAR = 1888;

function parseQuery(input: string): { query: string; year?: number } {
  const match = input.match(/^(.+?)\s+(\d{4})$/);
  if (match && match[1] && match[2]) {
    const year = Number.parseInt(match[2], 10);
    const maxYear = new Date().getFullYear() + 2;
    if (year >= OLDEST_FILM_YEAR && year <= maxYear) {
      return { query: match[1].trim(), year };
    }
  }
  return { query: input };
}

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

// pick at most one entry per modern format (4k / blu-ray / dvd), latest first.
// older formats (laserdisc, vhs, steelbook, etc.) are dropped to keep output tight.
const PHYSICAL_FORMATS: ReadonlyArray<{ key: string; match: RegExp }> = [
  { key: "4k uhd", match: /\b(4k|uhd)\b/i },
  { key: "blu-ray", match: /blu.?ray/i },
  { key: "dvd", match: /\bdvd\b/i },
];

function printPhysical(
  releases: ReadonlyArray<TmdbReleaseDate>,
  region: string,
  m: ReturnType<typeof t>,
): void {
  const physical = releases
    .filter((r) => r.type === 5 && r.note.trim() !== "")
    .sort((a, b) => b.release_date.localeCompare(a.release_date));
  if (physical.length === 0) return;

  const byFormat = new Map<string, TmdbReleaseDate>();
  for (const r of physical) {
    for (const fmt of PHYSICAL_FORMATS) {
      if (fmt.match.test(r.note) && !byFormat.has(fmt.key)) {
        byFormat.set(fmt.key, r);
        break;
      }
    }
  }
  if (byFormat.size === 0) return;

  const ordered = PHYSICAL_FORMATS.map((fmt) => byFormat.get(fmt.key)).filter(
    (r): r is TmdbReleaseDate => r !== undefined,
  );

  console.log();
  console.log(c.dim(`  ${m.physicalLabel} (${region})`));
  const width = Math.max(
    ...PHYSICAL_FORMATS.filter((fmt) => byFormat.has(fmt.key)).map(
      (fmt) => fmt.key.length,
    ),
  );
  for (const r of ordered) {
    const key = PHYSICAL_FORMATS.find((fmt) => fmt.match.test(r.note))!.key;
    const label = pad(key, width + 2);
    const date = r.release_date.slice(0, 10);
    console.log(`  ${c.dim(label)}${date}`);
  }
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
  const [providers, releases] = await Promise.all([
    getWatchProviders(item.id, item.mediaType, cfg.tmdbToken),
    // physical releases only exist for movies; failures don't break the search
    item.mediaType === "movie"
      ? getReleaseDates(item.id, cfg.tmdbToken).catch(() => null)
      : Promise.resolve(null),
  ]);
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

  if (releases) {
    // physical release data on TMDB is sparse outside of US; if the user's
    // region has nothing labeled, fall back to US so the feature still works
    const inRegion =
      releases.results.find((r) => r.iso_3166_1 === cfg.region)?.release_dates ?? [];
    const hasLabeled = inRegion.some(
      (r) => r.type === 5 && r.note.trim() !== "",
    );
    if (hasLabeled) {
      printPhysical(inRegion, cfg.region, m);
    } else {
      const usReleases =
        releases.results.find((r) => r.iso_3166_1 === "US")?.release_dates ?? [];
      printPhysical(usReleases, "US", m);
    }
  }
}

export async function runSearch(query: string, cfg: Config): Promise<void> {
  const m = t(resolveLocale(cfg.language));
  let currentQuery = query.trim();
  if (!currentQuery) throw new Error(m.searchEmpty);

  const runSearchOnce = async (
    raw: string,
  ): Promise<ReadonlyArray<MediaItem>> => {
    const parsed = parseQuery(raw);
    const displayQ = parsed.year
      ? `${parsed.query} (${parsed.year})`
      : parsed.query;
    process.stdout.write(c.dim(`  ${m.searching(displayQ)}`));
    // no region: TMDB returns regional release dates with region param,
    // but year filter expects original release year
    const all = await searchAll(parsed.query, cfg.tmdbToken, {
      language: cfg.language,
    });
    const results = parsed.year
      ? all.filter((r) => r.date?.slice(0, 4) === String(parsed.year))
      : all;
    console.log(c.dim(m.resultsCount(results.length)));
    return results;
  };

  // pipe mode: no prompts
  if (!process.stdin.isTTY) {
    const results = await runSearchOnce(currentQuery);
    if (results.length === 0) throw new Error(m.noMatch);
    if (results.length > 1) throw new Error(m.ambiguousQuery(results.length));
    await displayItem(results[0]!, cfg, m);
    return;
  }

  while (true) {
    const results = await runSearchOnce(currentQuery);

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
