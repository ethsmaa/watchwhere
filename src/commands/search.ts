import { c } from "../colors.ts";
import type { Config } from "../config.ts";
import { resolveLocale, t } from "../i18n.ts";
import { picker } from "../picker.ts";
import { editableInput } from "../prompts.ts";
import {
  discoverPersonFilms,
  getPersonCredits,
  getReleaseDates,
  getWatchProviders,
  searchAll,
  searchPeople,
  toFilmography,
  type CreditRole,
  type MediaItem,
  type PersonDepartment,
  type PersonItem,
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

type SearchHit =
  | { readonly kind: "title"; readonly item: MediaItem }
  | { readonly kind: "person"; readonly person: PersonItem };

// keep incidental name-collisions from flooding the list: searching "matrix"
// otherwise surfaces dozens of obscure people whose first name is Matrix.
const MAX_INCIDENTAL_PEOPLE = 5;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\s._-]+/g, " ")
    .trim();
}

// ordering: people whose full name you typed exactly lead (you clearly meant
// the person), then titles in their own relevance order, then a few incidental
// people whose name merely contains the query. titles and people sit on
// different popularity scales, so the two are never compared directly.
function rankHits(
  titles: ReadonlyArray<MediaItem>,
  people: ReadonlyArray<PersonItem>,
  query: string,
): ReadonlyArray<SearchHit> {
  const q = normalize(query);
  const isExactName = (p: PersonItem): boolean => normalize(p.name) === q;
  const named = people.filter(isExactName);
  const incidental = people
    .filter((p) => !isExactName(p))
    .slice(0, MAX_INCIDENTAL_PEOPLE);
  return [
    ...named.map((person): SearchHit => ({ kind: "person", person })),
    ...titles.map((item): SearchHit => ({ kind: "title", item })),
    ...incidental.map((person): SearchHit => ({ kind: "person", person })),
  ];
}

function deptLabel(d: PersonDepartment, m: ReturnType<typeof t>): string {
  if (d === "directing") return m.personDirector;
  if (d === "acting") return m.personActor;
  return m.personCrew;
}

function roleTag(role: CreditRole, m: ReturnType<typeof t>): string {
  return c.dim(`[${role === "directing" ? m.roleDir : m.roleAct}]`);
}

function titleChoiceName(mi: MediaItem, m: ReturnType<typeof t>): string {
  const orig = mi.title !== mi.originalTitle ? c.dim(` — ${mi.originalTitle}`) : "";
  return `${tag(mi.mediaType, m)} ${mi.title} ${c.dim(`(${year(mi.date)})`)}${orig}`;
}

function personChoiceName(p: PersonItem, m: ReturnType<typeof t>): string {
  const meta = [deptLabel(p.department, m), ...p.knownFor.slice(0, 2)]
    .filter((s) => s !== "")
    .join(" · ");
  return `${c.dim(`[${m.tagPerson}]`)} ${p.name} ${c.dim(`(${meta})`)}`;
}

function filmChoiceName(item: MediaItem, m: ReturnType<typeof t>): string {
  const prefix = item.role ? `${roleTag(item.role, m)} ` : "";
  const orig =
    item.originalTitle && item.title !== item.originalTitle
      ? c.dim(` — ${item.originalTitle}`)
      : "";
  return `${prefix}${item.title} ${c.dim(`(${year(item.date)})`)}${orig}`;
}

async function pickHit(
  hits: ReadonlyArray<SearchHit>,
  m: ReturnType<typeof t>,
): Promise<SearchHit | null> {
  const visible = hits.slice(0, SOFT_LIMIT);
  const dropped = hits.length - visible.length;

  const choices = visible.map((hit) => ({
    name:
      hit.kind === "person"
        ? personChoiceName(hit.person, m)
        : titleChoiceName(hit.item, m),
    value: hit,
    description:
      hit.kind === "person"
        ? hit.person.knownFor.join(", ")
        : hit.item.overview.slice(0, OVERVIEW_MAX),
  }));

  const headerParts: string[] = [m.whichOne];
  if (dropped > 0) {
    headerParts.push(c.dim(`(${visible.length}/${hits.length})`));
  }

  return picker<SearchHit>({
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

type FilmChoice =
  | { readonly kind: "film"; readonly item: MediaItem }
  | { readonly kind: "full" }
  | { readonly kind: "subs" };

async function pickFilm(
  films: ReadonlyArray<MediaItem>,
  total: number,
  header: string,
  action: { readonly value: FilmChoice; readonly label: string } | null,
  m: ReturnType<typeof t>,
): Promise<FilmChoice | null> {
  const visible = films.slice(0, SOFT_LIMIT);
  // `total` can exceed films.length when the source is paginated (discover
  // returns one page); never report fewer than we actually hold.
  const grandTotal = Math.max(total, films.length);

  const choices = visible.map((item) => ({
    name: filmChoiceName(item, m),
    value: { kind: "film", item } as FilmChoice,
    description: item.overview.slice(0, OVERVIEW_MAX),
  }));
  if (action) {
    choices.push({ name: c.dim(`› ${action.label}`), value: action.value, description: "" });
  }

  const headerParts: string[] = [header];
  if (grandTotal > visible.length) {
    headerParts.push(c.dim(`(${visible.length}/${grandTotal})`));
  }

  return picker<FilmChoice>({
    message: headerParts.join(" "),
    pageSize: PAGE_SIZE,
    choices,
    extraKeys: [["esc", "back"]],
  });
}

// a person opens to two views: what's on your subs right now (one discover
// call, region- and provider-filtered server-side) and their full filmography
// (combined credits). you can flip between them; picking a film drops into the
// usual provider breakdown.
async function runPerson(
  person: PersonItem,
  cfg: Config,
  m: ReturnType<typeof t>,
): Promise<void> {
  const hasSubs = cfg.subscriptions.length > 0;
  let view: "subs" | "full" = hasSubs ? "subs" : "full";
  if (!hasSubs) {
    console.log();
    console.log(c.dim(`  ${m.personNoSubsConfigured}`));
  }

  // fetched lazily, then reused as you flip between views.
  let onSubs: { films: ReadonlyArray<MediaItem>; total: number } | null = null;
  let filmography: ReadonlyArray<MediaItem> | null = null;

  while (true) {
    if (view === "subs") {
      if (onSubs === null) {
        process.stdout.write(c.dim(`  ${m.loadingFilms(person.name)}`));
        onSubs = await discoverPersonFilms({
          personId: person.id,
          department: person.department,
          region: cfg.region,
          providerIds: cfg.subscriptions,
          token: cfg.tmdbToken,
          language: cfg.language,
        });
        console.log(c.dim(m.resultsCount(onSubs.films.length)));
      }
      if (onSubs.films.length === 0) {
        console.log();
        console.log(
          `  ${c.yellow("●")} ${m.personSubsEmpty(person.name, cfg.region)}`,
        );
        view = "full";
        continue;
      }
      const picked = await pickFilm(
        onSubs.films,
        onSubs.total,
        m.personSubsTitle(person.name, cfg.region),
        { value: { kind: "full" }, label: m.personSeeFull },
        m,
      );
      if (picked === null) return;
      if (picked.kind === "film") {
        await displayItem(picked.item, cfg, m);
        return;
      }
      view = "full";
      continue;
    }

    if (filmography === null) {
      process.stdout.write(c.dim(`  ${m.loadingFilms(person.name)}`));
      const credits = await getPersonCredits(person.id, cfg.tmdbToken, {
        language: cfg.language,
      });
      filmography = toFilmography(credits, person.department);
      console.log(c.dim(m.resultsCount(filmography.length)));
    }
    if (filmography.length === 0) {
      console.log();
      console.log(`  ${m.personNoCredits(person.name)}`);
      return;
    }
    // only offer "back to your subs" when there's actually something there.
    const canReturnToSubs =
      hasSubs && onSubs !== null && onSubs.films.length > 0;
    const picked = await pickFilm(
      filmography,
      filmography.length,
      m.personFullTitle(person.name),
      canReturnToSubs ? { value: { kind: "subs" }, label: m.personSeeSubs } : null,
      m,
    );
    if (picked === null) return;
    if (picked.kind === "film") {
      await displayItem(picked.item, cfg, m);
      return;
    }
    view = "subs";
    continue;
  }
}

async function searchTitles(
  raw: string,
  cfg: Config,
  m: ReturnType<typeof t>,
): Promise<ReadonlyArray<MediaItem>> {
  const parsed = parseQuery(raw);
  const displayQ = parsed.year ? `${parsed.query} (${parsed.year})` : parsed.query;
  process.stdout.write(c.dim(`  ${m.searching(displayQ)}`));
  const all = await searchAll(parsed.query, cfg.tmdbToken, {
    language: cfg.language,
  });
  const results = parsed.year
    ? all.filter((r) => r.date?.slice(0, 4) === String(parsed.year))
    : all;
  console.log(c.dim(m.resultsCount(results.length)));
  return results;
}

async function searchUnified(
  raw: string,
  cfg: Config,
  m: ReturnType<typeof t>,
): Promise<ReadonlyArray<SearchHit>> {
  const parsed = parseQuery(raw);
  const displayQ = parsed.year ? `${parsed.query} (${parsed.year})` : parsed.query;
  process.stdout.write(c.dim(`  ${m.searching(displayQ)}`));
  const [titlesAll, people] = await Promise.all([
    searchAll(parsed.query, cfg.tmdbToken, { language: cfg.language }),
    // a trailing year filters titles; people don't have one, so the person
    // lookup ignores it but still runs on the bare query.
    searchPeople(parsed.query, cfg.tmdbToken, { language: cfg.language }),
  ]);
  const titles = parsed.year
    ? titlesAll.filter((r) => r.date?.slice(0, 4) === String(parsed.year))
    : titlesAll;
  const hits = rankHits(titles, people, parsed.query);
  console.log(c.dim(m.resultsCount(hits.length)));
  return hits;
}

export async function runSearch(query: string, cfg: Config): Promise<void> {
  const m = t(resolveLocale(cfg.language));
  let currentQuery = query.trim();
  if (!currentQuery) throw new Error(m.searchEmpty);

  // pipe mode: deterministic, titles only. person lookups are interactive.
  if (!process.stdin.isTTY) {
    const results = await searchTitles(currentQuery, cfg, m);
    if (results.length === 0) throw new Error(m.noMatch);
    if (results.length > 1) throw new Error(m.ambiguousQuery(results.length));
    await displayItem(results[0]!, cfg, m);
    return;
  }

  while (true) {
    const hits = await searchUnified(currentQuery, cfg, m);

    let picked: SearchHit | null = null;
    if (hits.length > 0) {
      picked = await pickHit(hits, m);
    } else {
      console.log(`\n  ${m.noMatch}`);
    }

    if (picked !== null) {
      if (picked.kind === "person") await runPerson(picked.person, cfg, m);
      else await displayItem(picked.item, cfg, m);
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
