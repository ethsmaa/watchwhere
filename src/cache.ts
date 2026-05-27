import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getRegionProviders, type TmdbProvider } from "./tmdb.ts";

const CACHE_DIR = join(homedir(), ".watchwhere", "cache");
const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  fetchedAt: string;
  providers: ReadonlyArray<TmdbProvider>;
}

function cachePath(region: string): string {
  return join(CACHE_DIR, `providers-${region.toUpperCase()}.json`);
}

function parseEntry(raw: unknown): CacheEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as { fetchedAt?: unknown; providers?: unknown };
  if (typeof v.fetchedAt !== "string" || !Array.isArray(v.providers)) return null;
  return { fetchedAt: v.fetchedAt, providers: v.providers as TmdbProvider[] };
}

async function readCache(region: string): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(cachePath(region), "utf8");
    const parsed = parseEntry(JSON.parse(raw) as unknown);
    if (!parsed) return null;
    const age = Date.now() - Date.parse(parsed.fetchedAt);
    if (Number.isNaN(age) || age > TTL_MS || age < 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(region: string, providers: ReadonlyArray<TmdbProvider>): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
  const entry: CacheEntry = { fetchedAt: new Date().toISOString(), providers };
  const path = cachePath(region);
  const tmp = `${path}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(entry), "utf8");
  await rename(tmp, path);
}

export async function getCachedRegionProviders(
  region: string,
  token: string,
  language?: string,
): Promise<ReadonlyArray<TmdbProvider>> {
  const cached = await readCache(region);
  if (cached) return cached.providers;
  const fresh = await getRegionProviders(region, token, language);
  writeCache(region, fresh).catch(() => {});
  return fresh;
}

export async function isCacheFresh(region: string): Promise<boolean> {
  try {
    const s = await stat(cachePath(region));
    return Date.now() - s.mtimeMs < TTL_MS;
  } catch {
    return false;
  }
}
