export type Locale = "en" | "tr";

const SUPPORTED: ReadonlySet<Locale> = new Set<Locale>(["en", "tr"]);
const DEFAULT_LOCALE: Locale = "en";

function head(input: string): string {
  // tr-TR / tr_TR.UTF-8 → tr
  return input.toLowerCase().split(/[-_.]/)[0] ?? "";
}

function fromEnv(): Locale {
  const raw = process.env.LANG ?? process.env.LC_ALL ?? "";
  const h = head(raw);
  return SUPPORTED.has(h as Locale) ? (h as Locale) : DEFAULT_LOCALE;
}

export function resolveLocale(input?: string): Locale {
  if (!input) return fromEnv();
  const h = head(input);
  return SUPPORTED.has(h as Locale) ? (h as Locale) : DEFAULT_LOCALE;
}

interface Catalog {
  // generic
  error: string;
  ok: string;
  done: string;
  offline: string;
  failed: string;

  // media tags
  tagMovie: string;
  tagTv: string;

  // search
  searchEmpty: string;
  searching: (query: string) => string;
  resultsCount: (n: number) => string;
  noMatch: string;
  whichOne: string;
  emptyResult: string;
  fetchingProviders: (region: string) => string;
  notAvailable: (region: string) => string;
  notAvailableHint: string;
  onYourSubsPrefix: string;
  streamingNotOnSubs: (region: string) => string;
  noStreamingSub: (region: string) => string;
  owned: string;
  notOwned: string;
  onPrefix: string;
  free: string;
  ads: string;
  rent: string;
  buy: string;
  link: string;

  // config (show)
  noConfigYet: string;
  resolvingNames: string;
  configTitle: string;
  regionLabel: string;
  languageLabel: string;
  tokenLabel: string;
  updatedLabel: string;
  pathLabel: string;
  subscriptionsLabel: string;
  noSubs: string;

  // init
  firstTimeSetup: string;
  configNotWritten: string;
  existingConfig: (region: string) => string;
  tokenPrompt: string;
  tokenHint: string;
  invalidToken: string;
  tokenTooShort: string;
  verifying: string;
  regionPrompt: string;
  regionInvalid: string;
  displayLanguagePrompt: string;
  loadingProviders: (region: string) => string;
  providersFound: (n: number) => string;
  noProviders: (region: string) => string;
  yourSubsLabel: (region: string) => string;
  toggleHintConfirm: string;
  toggleHintSave: string;
  savedTo: string;
  updatedConfigFile: string;

  // validation
  corruptConfig: (path: string) => string;

  // lang / region commands + cancellation
  languageUpdated: (code: string) => string;
  cancelled: string;
  currentLanguage: (code: string) => string;
  currentRegion: (code: string) => string;
  regionUpdated: (code: string) => string;
  regionHintReviewSubs: string;

  // usage / --help
  usageTagline: string;
  usageSectionUsage: string;
  usageSectionConfig: string;
  usageDescTitle: string;
  usageDescInit: string;
  usageDescSubs: string;
  usageDescLang: string;
  usageDescRegion: string;
  usageDescConfig: string;
  usageDescHelp: string;

  // routing / hints
  unknownOption: (opt: string) => string;
  unknownCommand: (cmd: string) => string;
  didYouMean: (cmd: string) => string;
  noConfigHint: string;
  tokenExpired: string;
  networkOffline: string;
  networkTimeout: string;
  relativeNow: string;
  relativeMinutes: (n: number) => string;
  relativeHours: (n: number) => string;
  relativeDays: (n: number) => string;

  // non-TTY
  ttyRequired: (cmd: string) => string;
  ambiguousQuery: (n: number) => string;
}

const en: Catalog = {
  error: "error",
  ok: "ok",
  done: "done",
  offline: "offline",
  failed: "failed",

  tagMovie: "movie",
  tagTv: "tv",

  searchEmpty: "search title is empty",
  searching: (q) => `searching "${q}"… `,
  resultsCount: (n) => `${n} result${n === 1 ? "" : "s"}`,
  noMatch: "no match. try a different spelling or original title.",
  whichOne: "which one?",
  emptyResult: "empty result",
  fetchingProviders: (region) => `fetching providers (${region})… `,
  notAvailable: (region) => `not available in ${region}.`,
  notAvailableHint:
    "(TMDB has no data for this region — VPN to another region may help.)",
  onYourSubsPrefix: "on your subs:",
  streamingNotOnSubs: (region) =>
    `streaming in ${region}, but not on your subs.`,
  noStreamingSub: (region) => `no streaming subscription in ${region}.`,
  owned: "owned",
  notOwned: "not owned",
  onPrefix: "on",
  free: "free",
  ads: "ads",
  rent: "rent",
  buy: "buy",
  link: "link",

  noConfigYet: "no config yet — run `ww init` first.",
  resolvingNames: "resolving subscription names… ",
  configTitle: "watchwhere config",
  regionLabel: "region",
  languageLabel: "language",
  tokenLabel: "token",
  updatedLabel: "updated",
  pathLabel: "path",
  subscriptionsLabel: "subscriptions",
  noSubs: "none — run `ww subs` to add some",

  firstTimeSetup: "first-time setup",
  configNotWritten: "config not written",
  existingConfig: (region) =>
    `existing config found (${region}) — will overwrite`,
  tokenPrompt: "TMDB Read Access Token (v4)",
  tokenHint: "themoviedb.org/settings/api",
  invalidToken: "invalid TMDB token. use the v4 'Read Access Token'.",
  tokenTooShort: "token looks too short",
  verifying: "verifying token… ",
  regionPrompt: "region code (ISO-3166-1, e.g. TR / US / DE):",
  regionInvalid: "two-letter region code (e.g. TR)",
  displayLanguagePrompt: "display language:",
  loadingProviders: (region) => `loading providers for ${region}… `,
  providersFound: (n) => `${n} found`,
  noProviders: (region) =>
    `no providers found for region ${region}. check the code.`,
  yourSubsLabel: (region) => `your subscriptions in ${region}`,
  toggleHintConfirm: "(space to toggle, enter to confirm)",
  toggleHintSave: "(space to toggle, enter to save)",
  savedTo: "saved to",
  updatedConfigFile: "updated",

  corruptConfig: (path) => `corrupt config file: ${path}`,

  languageUpdated: (code) => `language updated to ${code}`,
  cancelled: "cancelled",
  currentLanguage: (code) => `current: ${code}`,
  currentRegion: (code) => `current: ${code}`,
  regionUpdated: (code) => `region updated to ${code}`,
  regionHintReviewSubs: "providers vary by region — run `ww subs` to review your list.",

  usageTagline: "where can I stream it?",
  usageSectionUsage: "usage",
  usageSectionConfig: "config",
  usageDescTitle: "search a movie or show in your region",
  usageDescInit: "set up token, region, language, subscriptions",
  usageDescSubs: "edit your subscriptions only",
  usageDescLang: "change display language",
  usageDescRegion: "change region",
  usageDescConfig: "show current config",
  usageDescHelp: "this message",

  unknownOption: (opt) => `unknown option: ${opt}. run \`ww --help\`.`,
  unknownCommand: (cmd) => `unknown command: ${cmd}`,
  didYouMean: (cmd) => `did you mean \`ww ${cmd}\`?`,
  noConfigHint: "no config yet — run `ww init` to get started.",
  tokenExpired: "TMDB token rejected (401). run `ww init` to re-enter it.",
  networkOffline: "couldn't reach TMDB. check your internet connection.",
  networkTimeout: "TMDB request timed out. try again, or check your connection.",
  relativeNow: "just now",
  relativeMinutes: (n) => `${n} min ago`,
  relativeHours: (n) => `${n} hr ago`,
  relativeDays: (n) => `${n} day${n === 1 ? "" : "s"} ago`,

  ttyRequired: (cmd) => `\`ww ${cmd}\` is interactive — run it in a terminal, not a pipe.`,
  ambiguousQuery: (n) => `${n} matches — query is ambiguous. refine, or run interactively.`,
};

const tr: Catalog = {
  error: "hata",
  ok: "tamam",
  done: "tamam",
  offline: "çevrimdışı",
  failed: "başarısız",

  tagMovie: "film",
  tagTv: "dizi",

  searchEmpty: "aranacak başlık boş",
  searching: (q) => `"${q}" aranıyor… `,
  resultsCount: (n) => `${n} sonuç`,
  noMatch: "eşleşme yok. farklı bir yazım veya orijinal başlık deneyin.",
  whichOne: "hangisi?",
  emptyResult: "boş sonuç",
  fetchingProviders: (region) =>
    `sağlayıcılar getiriliyor (${region})… `,
  notAvailable: (region) => `${region} bölgesinde mevcut değil.`,
  notAvailableHint:
    "(TMDB'de bu bölge için veri yok — başka bir bölgeye VPN yardımcı olabilir.)",
  onYourSubsPrefix: "aboneliklerinde:",
  streamingNotOnSubs: (region) =>
    `${region} bölgesinde yayında, ama aboneliklerinde yok.`,
  noStreamingSub: (region) =>
    `${region} bölgesinde streaming aboneliği yok.`,
  owned: "var",
  notOwned: "yok",
  onPrefix: "şurada",
  free: "ücretsiz",
  ads: "reklamlı",
  rent: "kirala",
  buy: "satın al",
  link: "bağlantı",

  noConfigYet: "henüz config yok — önce `ww init` çalıştır.",
  resolvingNames: "abonelik isimleri çözümleniyor… ",
  configTitle: "watchwhere config",
  regionLabel: "bölge",
  languageLabel: "dil",
  tokenLabel: "token",
  updatedLabel: "güncellendi",
  pathLabel: "yol",
  subscriptionsLabel: "abonelikler",
  noSubs: "yok — eklemek için `ww subs` çalıştır",

  firstTimeSetup: "ilk kurulum",
  configNotWritten: "config yazılmadı",
  existingConfig: (region) =>
    `mevcut config bulundu (${region}) — üzerine yazılacak`,
  tokenPrompt: "TMDB Read Access Token (v4)",
  tokenHint: "themoviedb.org/settings/api",
  invalidToken: "geçersiz TMDB token. v4 'Read Access Token' kullanın.",
  tokenTooShort: "token çok kısa görünüyor",
  verifying: "token doğrulanıyor… ",
  regionPrompt: "bölge kodu (ISO-3166-1, örn. TR / US / DE):",
  regionInvalid: "iki harfli bölge kodu (örn. TR)",
  displayLanguagePrompt: "görüntüleme dili:",
  loadingProviders: (region) =>
    `${region} için sağlayıcılar yükleniyor… `,
  providersFound: (n) => `${n} bulundu`,
  noProviders: (region) =>
    `${region} bölgesi için sağlayıcı bulunamadı. kodu kontrol edin.`,
  yourSubsLabel: (region) => `${region} bölgesindeki aboneliklerin`,
  toggleHintConfirm: "(seçmek için space, onaylamak için enter)",
  toggleHintSave: "(seçmek için space, kaydetmek için enter)",
  savedTo: "kaydedildi:",
  updatedConfigFile: "güncellendi",

  corruptConfig: (path) => `bozuk config dosyası: ${path}`,

  languageUpdated: (code) => `dil ${code} olarak güncellendi`,
  cancelled: "iptal edildi",
  currentLanguage: (code) => `mevcut: ${code}`,
  currentRegion: (code) => `mevcut: ${code}`,
  regionUpdated: (code) => `bölge ${code} olarak güncellendi`,
  regionHintReviewSubs: "sağlayıcılar bölgeye göre değişir — `ww subs` ile gözden geçir.",

  usageTagline: "nerede izleyebilirim?",
  usageSectionUsage: "kullanım",
  usageSectionConfig: "config",
  usageDescTitle: "bölgendeki bir film veya diziyi ara",
  usageDescInit: "token, bölge, dil ve abonelikleri ayarla",
  usageDescSubs: "sadece abonelikleri düzenle",
  usageDescLang: "görüntüleme dilini değiştir",
  usageDescRegion: "bölgeyi değiştir",
  usageDescConfig: "mevcut config'i göster",
  usageDescHelp: "bu mesaj",

  unknownOption: (opt) => `bilinmeyen seçenek: ${opt}. \`ww --help\` çalıştır.`,
  unknownCommand: (cmd) => `bilinmeyen komut: ${cmd}`,
  didYouMean: (cmd) => `\`ww ${cmd}\` mi demek istedin?`,
  noConfigHint: "henüz config yok — başlamak için `ww init` çalıştır.",
  tokenExpired: "TMDB token reddedildi (401). yenilemek için `ww init` çalıştır.",
  networkOffline: "TMDB'ye ulaşılamadı. internet bağlantını kontrol et.",
  networkTimeout: "TMDB isteği zaman aşımına uğradı. tekrar dene veya bağlantını kontrol et.",
  relativeNow: "şimdi",
  relativeMinutes: (n) => `${n} dk önce`,
  relativeHours: (n) => `${n} saat önce`,
  relativeDays: (n) => `${n} gün önce`,

  ttyRequired: (cmd) => `\`ww ${cmd}\` interaktif — pipe'da değil, terminalde çalıştır.`,
  ambiguousQuery: (n) => `${n} eşleşme var — sorgu belirsiz. daralt veya interaktif çalıştır.`,
};

const CATALOGS: Record<Locale, Catalog> = { en, tr };

export function t(locale: Locale): Catalog {
  return CATALOGS[locale];
}
