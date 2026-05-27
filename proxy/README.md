# watchwhere-proxy

Cloudflare Worker that proxies TMDB calls so users of the CLI don't need
their own TMDB token. Caches per-endpoint in KV, rate-limits 100 req/hour
per IP.

## one-time setup

```
cd proxy
bun install
bunx wrangler login                          # opens browser
bunx wrangler kv namespace create CACHE      # prints id, paste into wrangler.toml
bunx wrangler secret put TMDB_TOKEN          # paste your TMDB v4 token
```

## deploy

```
bun run deploy
```

Wrangler prints the live URL (e.g. `https://watchwhere-proxy.<account>.workers.dev`).
Use it from the CLI:

```
WATCHWHERE_PROXY=https://watchwhere-proxy.<account>.workers.dev ww matrix
```

## local dev

```
bun run dev
```

Then point the CLI at it:

```
WATCHWHERE_PROXY=http://127.0.0.1:8787 ww matrix
```
