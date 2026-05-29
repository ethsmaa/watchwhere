import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR = join(homedir(), ".watchwhere", "cache");
const CACHE_FILE = join(CACHE_DIR, "update.json");
const TTL_MS = 24 * 60 * 60 * 1000;
const REGISTRY_URL = "https://registry.npmjs.org/watchwhere/latest";
const FETCH_TIMEOUT_MS = 3000;

interface UpdateCache {
  checkedAt: string;
  latest: string;
}

function parseCache(raw: unknown): UpdateCache | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as { checkedAt?: unknown; latest?: unknown };
  if (typeof v.checkedAt !== "string" || typeof v.latest !== "string") return null;
  return { checkedAt: v.checkedAt, latest: v.latest };
}

async function readCache(): Promise<UpdateCache | null> {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    const parsed = parseCache(JSON.parse(raw) as unknown);
    if (!parsed) return null;
    const age = Date.now() - Date.parse(parsed.checkedAt);
    if (Number.isNaN(age) || age > TTL_MS || age < 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(latest: string): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
  const entry: UpdateCache = { checkedAt: new Date().toISOString(), latest };
  await writeFile(CACHE_FILE, JSON.stringify(entry), "utf8");
}

function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map((n) => Number.parseInt(n, 10));
  const b = current.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (Number.isNaN(ai) || Number.isNaN(bi)) return false;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}

export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  try {
    const cached = await readCache();
    if (cached) {
      return isNewer(cached.latest, currentVersion) ? cached.latest : null;
    }
    const res = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    if (typeof data.version !== "string") return null;
    writeCache(data.version).catch(() => {});
    return isNewer(data.version, currentVersion) ? data.version : null;
  } catch {
    return null;
  }
}
