#!/usr/bin/env bun
import pkg from "../package.json" with { type: "json" };
import { c } from "./colors.ts";
import { loadConfig } from "./config.ts";
import { resolveLocale, t } from "./i18n.ts";
import { runInit } from "./commands/init.ts";
import { runSearch } from "./commands/search.ts";
import { runConfig } from "./commands/config.ts";
import { runSubs } from "./commands/subs.ts";
import { runLang } from "./commands/lang.ts";
import { runRegion } from "./commands/region.ts";
import { TmdbError } from "./tmdb.ts";
import { checkForUpdate } from "./update-check.ts";

function usage(m: ReturnType<typeof t>): string {
  return [
    `  ${c.bold("ww")} ${c.dim(`/ watchwhere — ${m.usageTagline}`)}`,
    ``,
    `  ${c.dim(m.usageSectionUsage)}`,
    `    ww ${c.dim("<title>")}     ${m.usageDescTitle}`,
    `    ww init        ${m.usageDescInit}`,
    `    ww subs        ${m.usageDescSubs}`,
    `    ww lang        ${m.usageDescLang}`,
    `    ww region      ${m.usageDescRegion}`,
    `    ww config      ${m.usageDescConfig}`,
    `    ww --help      ${m.usageDescHelp}`,
    ``,
    `  ${c.dim(m.usageSectionConfig)} ~/.watchwhere/config.json`,
  ].join("\n");
}

const COMMANDS = ["init", "subs", "lang", "region", "config"] as const;
type Command = (typeof COMMANDS)[number];
const INTERACTIVE_COMMANDS: ReadonlySet<Command> = new Set(["init", "subs", "lang", "region"]);

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[a.length]![b.length]!;
}

function nearestCommand(input: string): Command | null {
  let best: { cmd: Command; dist: number } | null = null;
  for (const cmd of COMMANDS) {
    const d = levenshtein(input, cmd);
    if (d <= 2 && (best === null || d < best.dist)) {
      best = { cmd, dist: d };
    }
  }
  return best?.cmd ?? null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const first = args[0];

  let cfg = await loadConfig();
  const m = t(resolveLocale(cfg?.language));

  if (first === "--version" || first === "-v") {
    console.log(`watchwhere ${pkg.version}`);
    return;
  }

  if (!first || first === "--help" || first === "-h") {
    console.log(usage(m));
    if (!cfg) console.log(`\n  ${c.yellow("›")} ${m.noConfigHint}`);
    return;
  }

  if (first.startsWith("-")) {
    throw new Error(m.unknownOption(first));
  }

  if ((COMMANDS as ReadonlyArray<string>).includes(first)) {
    const cmd = first as Command;
    if (INTERACTIVE_COMMANDS.has(cmd) && !process.stdin.isTTY) {
      throw new Error(m.ttyRequired(cmd));
    }
    switch (cmd) {
      case "init":
        return runInit();
      case "subs":
        return runSubs();
      case "lang":
        return runLang();
      case "region":
        return runRegion();
      case "config":
        return runConfig();
    }
  }

  if (args.length === 1 && !first.includes(" ")) {
    const suggestion = nearestCommand(first);
    if (suggestion && first.length <= suggestion.length + 1 && first !== suggestion) {
      console.log(c.dim(`  ${c.yellow("›")} ${m.didYouMean(suggestion)}`));
      console.log();
    }
  }

  if (!cfg) {
    console.log(c.dim(`  ${m.firstTimeSetup}\n`));
    await runInit();
    cfg = await loadConfig();
    if (!cfg) throw new Error(m.configNotWritten);
    console.log();
  }

  await runSearch(args.join(" "), cfg);
}

async function maybeNotifyUpdate(): Promise<void> {
  // skip on quick lookups, only show after real work
  const first = process.argv[2];
  if (
    !first ||
    first === "--version" ||
    first === "-v" ||
    first === "--help" ||
    first === "-h"
  ) {
    return;
  }
  try {
    const newer = await checkForUpdate(pkg.version);
    if (!newer) return;
    const cfg = await loadConfig().catch(() => null);
    const m = t(resolveLocale(cfg?.language));
    console.log();
    console.log(`  ${c.yellow("›")} ${c.dim(m.updateAvailable(newer))}`);
  } catch {
    // best-effort, never block exit
  }
}

main().then(maybeNotifyUpdate).catch(async (err: unknown) => {
  const cfg = await loadConfig().catch(() => null);
  const m = t(resolveLocale(cfg?.language));

  if (err instanceof Error && err.name === "ExitPromptError") {
    console.log(c.dim(`\n  ${m.cancelled}`));
    process.exit(130);
  }

  let displayMsg = err instanceof Error ? err.message : String(err);
  if (err instanceof TmdbError) {
    if (err.status === 401) displayMsg = m.tokenExpired;
    else if (err.status === 429) displayMsg = m.rateLimited;
    else if (err.status === 0 && err.message.includes("timed out")) {
      displayMsg = m.networkTimeout;
    } else if (err.status === 0) {
      displayMsg = m.networkOffline;
    }
  }

  console.error(`\n  ${c.red(m.error)} ${displayMsg}`);
  process.exit(1);
});
