# watchwhere

CLI to check which of your streaming subs has a movie, in your region.

![demo](docs/demo.gif)

## why

I have a handful of streaming subs and I always forget which one has what.
Got tired of opening JustWatch every time — or clicking through each app
one by one to search. Terminal version of that lookup.

## quick start

Needs [Bun](https://bun.sh) (≥ 1.1).

```bash
bun install -g watchwhere
export WATCHWHERE_PROXY=https://watchwhere-proxy.ethsmaa.workers.dev
ww init       # asks for region + your subscriptions
ww matrix     # search a movie
```

That's it. The hosted proxy handles TMDB calls — **no API token needed**.

To make the proxy stick across terminal sessions, add the `export` line to
your `~/.zshrc` or `~/.bashrc`.

## with your own TMDB token (no proxy)

Prefer to talk to TMDB directly? Get a free v4 Read Access Token from
[themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
(pick the **v4 Read Access Token**, not the v3 API key), then:

```bash
bun install -g watchwhere
ww init       # paste your token, then region + subs
ww matrix
```

## commands

```
ww <title>       search and show providers
ww init          set up token, region, subscriptions
ww subs          edit subscriptions
ww lang          change UI language (en / tr)
ww region        change region
ww config        show current config
ww --help
ww --version
```

## notes

- config lives in `~/.watchwhere/config.json`
- ui defaults to english, turkish available via `ww lang`
- self-host your own proxy from [`proxy/`](./proxy) if you'd rather not use
  the hosted one

## license

MIT
