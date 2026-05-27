import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveLocale, t } from "./i18n.ts";

export interface Config {
  readonly tmdbToken: string;
  readonly region: string;
  readonly language: string;
  readonly subscriptions: ReadonlyArray<number>;
  readonly updatedAt: string;
}

const DEFAULT_LANGUAGE = "en-US";

const CONFIG_DIR = join(homedir(), ".watchwhere");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export const configPath = CONFIG_FILE;

interface RawConfig {
  tmdbToken: unknown;
  region: unknown;
  language?: unknown;
  subscriptions: unknown;
  updatedAt?: unknown;
}

function parseConfig(value: unknown): Config | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as RawConfig;
  if (
    typeof v.tmdbToken !== "string" ||
    typeof v.region !== "string" ||
    !Array.isArray(v.subscriptions) ||
    !v.subscriptions.every((n) => typeof n === "number")
  ) {
    return null;
  }
  return {
    tmdbToken: v.tmdbToken,
    region: v.region,
    language: typeof v.language === "string" ? v.language : DEFAULT_LANGUAGE,
    subscriptions: v.subscriptions,
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : new Date(0).toISOString(),
  };
}

export async function loadConfig(): Promise<Config | null> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    const cfg = parseConfig(JSON.parse(raw) as unknown);
    if (!cfg) throw new Error(t(resolveLocale()).corruptConfig(CONFIG_FILE));
    return cfg;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveConfig(
  cfg: Omit<Config, "updatedAt">,
): Promise<Config> {
  const full: Config = { ...cfg, updatedAt: new Date().toISOString() };
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });

  // write to tmp then rename — avoids half-written config on crash
  const tmp = `${CONFIG_FILE}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(full, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  if (process.platform !== "win32") {
    // windows ignores chmod
    await chmod(tmp, 0o600);
  }
  await rename(tmp, CONFIG_FILE);
  return full;
}
