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
ww init       # asks for region + subscriptions
ww matrix     # search a movie
```

That's it. No TMDB token, no signup — calls go through a hosted proxy by
default.

## with your own TMDB token

Don't want to use the hosted proxy? Get a free v4 Read Access Token from
[themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
(the **v4 Read Access Token**, not the v3 API key), then:

```bash
WATCHWHERE_PROXY=off ww init   # asks for token, region, subs
ww matrix
```

Or point at your own self-hosted proxy:

```bash
export WATCHWHERE_PROXY=https://your-proxy.example.com
ww init
```

## commands

```
ww <title>       search and show providers
ww init          set up region, subscriptions (and token, if not using proxy)
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
