import { select } from "@inquirer/prompts";
import { c } from "../colors.ts";
import { loadConfig, saveConfig } from "../config.ts";
import { resolveLocale, t } from "../i18n.ts";

export const LANGUAGE_PRESETS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "tr-TR", label: "Türkçe" },
  { code: "en-US", label: "English" },
];

export async function pickLanguage(
  m: ReturnType<typeof t>,
  current?: string,
): Promise<string> {
  return select<string>({
    message: m.displayLanguagePrompt,
    choices: LANGUAGE_PRESETS.map((l) => ({
      name: `${l.label} ${c.dim(`(${l.code})`)}`,
      value: l.code,
    })),
    default: current ?? "en-US",
  });
}

export async function runLang(): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg) {
    throw new Error(t(resolveLocale()).noConfigYet);
  }
  const m = t(resolveLocale(cfg.language));

  console.log(c.dim(`  ${m.currentLanguage(cfg.language)}`));
  console.log();

  const language = await pickLanguage(m, cfg.language);

  if (language === cfg.language) {
    console.log();
    console.log(c.dim(`  ${m.currentLanguage(language)}`));
    return;
  }

  await saveConfig({
    tmdbToken: cfg.tmdbToken,
    region: cfg.region,
    language,
    subscriptions: cfg.subscriptions,
  });

  const m2 = t(resolveLocale(language));
  console.log();
  console.log(`  ${c.green("✓")} ${m2.languageUpdated(language)}`);
}
