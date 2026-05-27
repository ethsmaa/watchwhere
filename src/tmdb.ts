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

export interface MediaItem {
  readonly id: number;
  readonly mediaType: MediaType;
  readonly title: string;
  readonly originalTitle: string;
  readonly date: string | null;
  readonly overview: string;
  readonly popularity: number;
}

export interface TmdbSearchResponse<T> {
  readonly results: ReadonlyArray<T>;
  readonly total_results: number;
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
