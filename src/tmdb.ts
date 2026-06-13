const HOSTED_PROXY = "https://watchwhere-proxy.ethsmaa.workers.dev";
const proxyEnv = process.env.WATCHWHERE_PROXY;
const PROXY =
  proxyEnv === undefined
    ? HOSTED_PROXY
    : proxyEnv === "" || proxyEnv === "off"
      ? undefined
      : proxyEnv.replace(/\/$/, "");
const TMDB_BASE = PROXY ? `${PROXY}/tmdb` : "https://api.themoviedb.org/3";
const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_TMDB_LANGUAGE = "en-US";

export const usingProxy = PROXY !== undefined;

export type MediaType = "movie" | "tv";

export interface TmdbMovie {
  readonly id: number;
  readonly title: string;
  readonly original_title: string;
  readonly release_date: string | null;
  readonly overview: string;
  readonly popularity: number;
}

export interface TmdbTv {
  readonly id: number;
  readonly name: string;
  readonly original_name: string;
  readonly first_air_date: string | null;
  readonly overview: string;
  readonly popularity: number;
}

// how a person is credited on a title, used to tag filmography entries.
export type CreditRole = "acting" | "directing";

// a person's primary department on TMDB. drives whether we match them as
// cast or crew when discovering what's streamable.
export type PersonDepartment = "acting" | "directing" | "other";

export interface MediaItem {
  readonly id: number;
  readonly mediaType: MediaType;
  readonly title: string;
  readonly originalTitle: string;
  readonly date: string | null;
  readonly overview: string;
  readonly popularity: number;
  // set only on filmography results (person lookups); absent for title search.
  readonly role?: CreditRole;
}

export interface PersonItem {
  readonly id: number;
  readonly name: string;
  readonly department: PersonDepartment;
  readonly knownFor: ReadonlyArray<string>;
  readonly popularity: number;
}

export interface TmdbSearchResponse<T> {
  readonly results: ReadonlyArray<T>;
  readonly total_results: number;
}

export interface TmdbPerson {
  readonly id: number;
  readonly name: string;
  readonly known_for_department: string | null;
  readonly popularity: number;
  readonly profile_path: string | null;
  readonly known_for?: ReadonlyArray<{
    readonly title?: string;
    readonly name?: string;
  }>;
}

// one entry from /person/{id}/combined_credits. cast entries carry a
// `character`, crew entries carry a `job` ("Director", "Writer", …).
export interface TmdbPersonCredit {
  readonly id: number;
  readonly media_type: MediaType;
  readonly title?: string;
  readonly original_title?: string;
  readonly name?: string;
  readonly original_name?: string;
  readonly release_date?: string;
  readonly first_air_date?: string;
  readonly overview?: string;
  readonly popularity?: number;
  readonly character?: string;
  readonly job?: string;
}

export interface TmdbCombinedCreditsResponse {
  readonly id: number;
  readonly cast: ReadonlyArray<TmdbPersonCredit>;
  readonly crew: ReadonlyArray<TmdbPersonCredit>;
}

export interface TmdbDiscoverResponse {
  readonly page: number;
  readonly results: ReadonlyArray<TmdbMovie>;
  readonly total_results: number;
  readonly total_pages: number;
}

export interface TmdbProvider {
  readonly provider_id: number;
  readonly provider_name: string;
  readonly logo_path: string | null;
  readonly display_priority?: number;
}

export interface TmdbRegionProviders {
  readonly link: string;
  readonly flatrate?: ReadonlyArray<TmdbProvider>;
  readonly rent?: ReadonlyArray<TmdbProvider>;
  readonly buy?: ReadonlyArray<TmdbProvider>;
  readonly ads?: ReadonlyArray<TmdbProvider>;
  readonly free?: ReadonlyArray<TmdbProvider>;
}

export interface TmdbWatchProvidersResponse {
  readonly id: number;
  readonly results: Record<string, TmdbRegionProviders | undefined>;
}

export interface TmdbProvidersListResponse {
  readonly results: ReadonlyArray<TmdbProvider>;
}

export interface TmdbReleaseDate {
  readonly certification: string;
  readonly iso_639_1: string;
  readonly note: string;
  readonly release_date: string;
  readonly type: number;
}

export interface TmdbReleaseDatesByRegion {
  readonly iso_3166_1: string;
  readonly release_dates: ReadonlyArray<TmdbReleaseDate>;
}

export interface TmdbReleaseDatesResponse {
  readonly id: number;
  readonly results: ReadonlyArray<TmdbReleaseDatesByRegion>;
}

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

async function tmdbFetch<T>(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    // timeout → TimeoutError, otherwise DNS/offline/etc.
    const name = err instanceof Error ? err.name : "Error";
    const msg = err instanceof Error ? err.message : String(err);
    if (name === "TimeoutError") {
      throw new TmdbError(`TMDB ${path} timed out after ${FETCH_TIMEOUT_MS}ms`, 0);
    }
    throw new TmdbError(`TMDB ${path} network error: ${msg}`, 0);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TmdbError(
      `TMDB ${path} failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
      res.status,
    );
  }

  return (await res.json()) as T;
}

function assertResultsArray(
  data: unknown,
  path: string,
): asserts data is { results: ReadonlyArray<unknown> } {
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as { results?: unknown }).results)
  ) {
    throw new TmdbError(`TMDB ${path} returned unexpected shape (no results[])`, 0);
  }
}

export function searchMovie(
  query: string,
  token: string,
  opts: { language?: string; region?: string } = {},
): Promise<TmdbSearchResponse<TmdbMovie>> {
  return tmdbFetch<TmdbSearchResponse<TmdbMovie>>("/search/movie", token, {
    query,
    include_adult: "false",
    language: opts.language ?? DEFAULT_TMDB_LANGUAGE,
    ...(opts.region ? { region: opts.region } : {}),
  });
}

export function searchTv(
  query: string,
  token: string,
  opts: { language?: string } = {},
): Promise<TmdbSearchResponse<TmdbTv>> {
  return tmdbFetch<TmdbSearchResponse<TmdbTv>>("/search/tv", token, {
    query,
    include_adult: "false",
    language: opts.language ?? DEFAULT_TMDB_LANGUAGE,
  });
}

export function getWatchProviders(
  id: number,
  mediaType: MediaType,
  token: string,
): Promise<TmdbWatchProvidersResponse> {
  return tmdbFetch<TmdbWatchProvidersResponse>(
    `/${mediaType}/${id}/watch/providers`,
    token,
  );
}

export function getReleaseDates(
  id: number,
  token: string,
): Promise<TmdbReleaseDatesResponse> {
  return tmdbFetch<TmdbReleaseDatesResponse>(
    `/movie/${id}/release_dates`,
    token,
  );
}

export function toMediaItem(
  item: TmdbMovie | TmdbTv,
  mediaType: MediaType,
): MediaItem {
  if (mediaType === "movie") {
    const m = item as TmdbMovie;
    return {
      id: m.id,
      mediaType: "movie",
      title: m.title,
      originalTitle: m.original_title,
      date: m.release_date,
      overview: m.overview,
      popularity: m.popularity,
    };
  }
  const t = item as TmdbTv;
  return {
    id: t.id,
    mediaType: "tv",
    title: t.name,
    originalTitle: t.original_name,
    date: t.first_air_date,
    overview: t.overview,
    popularity: t.popularity,
  };
}

export async function searchAll(
  query: string,
  token: string,
  opts: { language?: string; region?: string } = {},
): Promise<ReadonlyArray<MediaItem>> {
  const [movies, tv] = await Promise.all([
    searchMovie(query, token, opts),
    searchTv(query, token, opts),
  ]);
  assertResultsArray(movies, "/search/movie");
  assertResultsArray(tv, "/search/tv");
  const items: MediaItem[] = [
    ...movies.results.map((m) => toMediaItem(m, "movie")),
    ...tv.results.map((t) => toMediaItem(t, "tv")),
  ];
  return items.sort((a, b) => b.popularity - a.popularity);
}

function toPersonDepartment(knownForDepartment: string | null): PersonDepartment {
  switch ((knownForDepartment ?? "").toLowerCase()) {
    case "acting":
      return "acting";
    case "directing":
      return "directing";
    default:
      return "other";
  }
}

function toPersonItem(p: TmdbPerson): PersonItem {
  const knownFor = (p.known_for ?? [])
    .map((k) => k.title ?? k.name ?? "")
    .filter((s) => s !== "");
  return {
    id: p.id,
    name: p.name,
    department: toPersonDepartment(p.known_for_department),
    knownFor,
    popularity: p.popularity,
  };
}

export async function searchPeople(
  query: string,
  token: string,
  opts: { language?: string } = {},
): Promise<ReadonlyArray<PersonItem>> {
  const data = await tmdbFetch<TmdbSearchResponse<TmdbPerson>>(
    "/search/person",
    token,
    {
      query,
      include_adult: "false",
      language: opts.language ?? DEFAULT_TMDB_LANGUAGE,
    },
  );
  assertResultsArray(data, "/search/person");
  return data.results
    .map(toPersonItem)
    .sort((a, b) => b.popularity - a.popularity);
}

function creditToMediaItem(credit: TmdbPersonCredit, role: CreditRole): MediaItem {
  const isMovie = credit.media_type === "movie";
  return {
    id: credit.id,
    mediaType: credit.media_type,
    title: (isMovie ? credit.title : credit.name) ?? "",
    originalTitle: (isMovie ? credit.original_title : credit.original_name) ?? "",
    date: (isMovie ? credit.release_date : credit.first_air_date) ?? null,
    overview: credit.overview ?? "",
    popularity: credit.popularity ?? 0,
    role,
  };
}

export function getPersonCredits(
  id: number,
  token: string,
  opts: { language?: string } = {},
): Promise<TmdbCombinedCreditsResponse> {
  return tmdbFetch<TmdbCombinedCreditsResponse>(
    `/person/${id}/combined_credits`,
    token,
    { language: opts.language ?? DEFAULT_TMDB_LANGUAGE },
  );
}

// a person's filmography, scoped to their primary role so the list stays
// coherent: a director gets the films they directed, an actor gets the films
// they acted in. people with no clear department get both, and when someone
// directed and acted in the same title the directing credit wins.
export function toFilmography(
  credits: TmdbCombinedCreditsResponse,
  department: PersonDepartment,
): ReadonlyArray<MediaItem> {
  const byKey = new Map<string, MediaItem>();
  const put = (item: MediaItem): void => {
    const key = `${item.mediaType}:${item.id}`;
    const existing = byKey.get(key);
    // directing overrides a prior acting credit; never the reverse.
    if (!existing || existing.role === "acting") byKey.set(key, item);
  };
  if (department !== "directing") {
    for (const credit of credits.cast ?? []) {
      put(creditToMediaItem(credit, "acting"));
    }
  }
  if (department !== "acting") {
    for (const credit of credits.crew ?? []) {
      if (credit.job === "Director") put(creditToMediaItem(credit, "directing"));
    }
  }
  return [...byKey.values()].sort((a, b) => b.popularity - a.popularity);
}

// what of a person's work is streamable on the given subs, in one request.
// TMDB's discover endpoint filters by provider + region server-side, so we
// avoid a watch/providers call per title. actors are matched as cast,
// everyone else (directors, writers) as crew. movies only — discover has no
// reliable person filter for tv.
//
// returns the first page (up to 20) plus the true total, so the caller can
// show "20 of N". providerIds must be non-empty: an empty list makes TMDB
// drop the provider filter and return everything.
export async function discoverPersonFilms(opts: {
  personId: number;
  department: PersonDepartment;
  region: string;
  providerIds: ReadonlyArray<number>;
  token: string;
  language?: string;
}): Promise<{ films: ReadonlyArray<MediaItem>; total: number }> {
  const personParam = opts.department === "acting" ? "with_cast" : "with_crew";
  const data = await tmdbFetch<TmdbDiscoverResponse>(
    "/discover/movie",
    opts.token,
    {
      [personParam]: String(opts.personId),
      watch_region: opts.region,
      with_watch_providers: opts.providerIds.join("|"),
      with_watch_monetization_types: "flatrate",
      sort_by: "popularity.desc",
      include_adult: "false",
      language: opts.language ?? DEFAULT_TMDB_LANGUAGE,
    },
  );
  assertResultsArray(data, "/discover/movie");
  return {
    films: data.results.map((m) => toMediaItem(m, "movie")),
    total: data.total_results ?? data.results.length,
  };
}

export async function getRegionProviders(
  region: string,
  token: string,
  language = DEFAULT_TMDB_LANGUAGE,
): Promise<ReadonlyArray<TmdbProvider>> {
  const data = await tmdbFetch<TmdbProvidersListResponse>(
    "/watch/providers/movie",
    token,
    { watch_region: region, language },
  );
  assertResultsArray(data, "/watch/providers/movie");
  return [...data.results].sort(
    (a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999),
  );
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await tmdbFetch<{ success: boolean }>("/authentication", token);
    return true;
  } catch {
    return false;
  }
}

// rental-only storefronts on TMDB. these aren't subscriptions, so they
// shouldn't pollute the "your subs" picker. they still appear correctly
// under rent/buy sections for individual movies.
const RENTAL_ONLY_IDS: ReadonlySet<number> = new Set([
  2,   // Apple TV (storefront, not Apple TV+)
  3,   // Google Play Movies
  7,   // Fandango at Home (formerly Vudu)
  10,  // Amazon Video (a-la-carte rental, separate from Prime Video)
  68,  // Microsoft Store
  192, // YouTube (rental, separate from YouTube Premium)
]);

export function isSubscriptionProvider(provider: TmdbProvider): boolean {
  return !RENTAL_ONLY_IDS.has(provider.provider_id);
}

// per-region pin order. provider ids listed here float to the top in the
// listed order; everything else falls back to TMDB's display_priority.
// regions not listed use TMDB order unchanged.
const REGION_PIN_ORDER: Record<string, ReadonlyArray<number>> = {
  TR: [
    8,    // Netflix
    119,  // Amazon Prime Video
    337,  // Disney Plus
    1899, // Max (HBO Max)
    11,   // MUBI
    188,  // YouTube Premium
  ],
  US: [
    8,    // Netflix
    9,    // Amazon Prime Video
    1899, // HBO Max
    337,  // Disney Plus
    15,   // Hulu
    350,  // Apple TV+
    386,  // Peacock Premium
    2303, // Paramount Plus Premium
    43,   // Starz
    526,  // AMC+
  ],
};

export function applyRegionPinning(
  providers: ReadonlyArray<TmdbProvider>,
  region: string,
): ReadonlyArray<TmdbProvider> {
  const pinned = REGION_PIN_ORDER[region];
  if (!pinned || pinned.length === 0) return providers;
  const orderById = new Map(pinned.map((id, i) => [id, i]));
  const top: TmdbProvider[] = [];
  const rest: TmdbProvider[] = [];
  for (const p of providers) {
    if (orderById.has(p.provider_id)) top.push(p);
    else rest.push(p);
  }
  top.sort((a, b) => orderById.get(a.provider_id)! - orderById.get(b.provider_id)!);
  return [...top, ...rest];
}
