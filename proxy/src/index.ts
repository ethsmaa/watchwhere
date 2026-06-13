import { Hono } from "hono";

type Env = {
  CACHE: KVNamespace;
  TMDB_TOKEN: string;
};

const TMDB_BASE = "https://api.themoviedb.org/3";

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_SEC = 3600;
const MAX_URL_LENGTH = 512;

// strict whitelist — only the endpoints the watchwhere CLI actually uses
const ALLOWED_PATHS: ReadonlyArray<RegExp> = [
  /^\/search\/(movie|tv|person)$/,
  /^\/(movie|tv)\/\d+\/watch\/providers$/,
  /^\/movie\/\d+\/release_dates$/,
  /^\/person\/\d+\/combined_credits$/,
  /^\/discover\/movie$/,
  /^\/watch\/providers\/(movie|tv)$/,
  /^\/authentication$/,
];

const CACHE_TTL: ReadonlyArray<[string, number]> = [
  ["/watch/providers", 24 * 60 * 60],
  ["/search/", 60 * 60],
  ["/discover/", 60 * 60],
  ["/movie/", 60 * 60],
  ["/tv/", 60 * 60],
  ["/person/", 60 * 60],
  ["/authentication", 0],
];

function ttlFor(path: string): number {
  for (const [prefix, ttl] of CACHE_TTL) {
    if (path.startsWith(prefix)) return ttl;
  }
  return 60 * 60;
}

function isAllowedPath(path: string): boolean {
  return ALLOWED_PATHS.some((r) => r.test(path));
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
  c.text(
    "watchwhere proxy — see https://github.com/ethsmaa/watchwhere\n" +
      `endpoints under /tmdb/*, GET only, rate-limited ${RATE_LIMIT_MAX}/hour per IP\n`,
  ),
);

app.get("/tmdb/*", async (c) => {
  if (c.req.url.length > MAX_URL_LENGTH) {
    return c.json({ error: "url too long" }, 414);
  }

  const ip =
    c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "unknown";

  const url = new URL(c.req.url);
  const tmdbPath = url.pathname.replace(/^\/tmdb/, "");

  if (!isAllowedPath(tmdbPath)) {
    return c.json({ error: "endpoint not allowed" }, 403);
  }

  // rate limit
  const rlKey = `rl:${ip}`;
  const current = await c.env.CACHE.get(rlKey);
  const count = current ? Number.parseInt(current, 10) : 0;
  if (count >= RATE_LIMIT_MAX) {
    return c.json(
      { error: `rate limit exceeded — ${RATE_LIMIT_MAX}/hour per IP` },
      429,
    );
  }
  await c.env.CACHE.put(rlKey, String(count + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_SEC,
  });

  const cacheKey = `c:${tmdbPath}${url.search}`;
  const ttl = ttlFor(tmdbPath);

  if (ttl > 0) {
    const cached = await c.env.CACHE.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${ttl}`,
          "x-cache": "HIT",
        },
      });
    }
  }

  const tmdbUrl = `${TMDB_BASE}${tmdbPath}${url.search}`;
  const upstream = await fetch(tmdbUrl, {
    headers: {
      Authorization: `Bearer ${c.env.TMDB_TOKEN}`,
      Accept: "application/json",
    },
  });

  const body = await upstream.text();

  if (!upstream.ok) {
    return new Response(body, {
      status: upstream.status,
      headers: { "content-type": "application/json", "x-cache": "MISS" },
    });
  }

  if (ttl > 0) {
    c.executionCtx.waitUntil(
      c.env.CACHE.put(cacheKey, body, { expirationTtl: ttl }),
    );
  }

  return new Response(body, {
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${ttl}`,
      "x-cache": "MISS",
    },
  });
});

// any other method or path → 404
app.all("*", (c) => c.json({ error: "not found" }, 404));

export default app;
