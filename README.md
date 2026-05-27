# watchwhere

CLI to check which of your streaming subs has a movie, in your region.

## why

I have a handful of streaming subs and I always forget which one has what.
Got tired of opening JustWatch every time — or clicking through each app
one by one to search. Terminal version of that lookup.

## install

Needs [Bun](https://bun.sh) (≥ 1.1).

```
bun install -g watchwhere
ww init
```

You'll need a free TMDB v4 Read Access Token — grab one at
[themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).
Pick the **v4 Read Access Token**, not the v3 API key.

## commands

```
ww <title>       search and show providers
ww init          set up token, region, subs
ww subs          edit subscriptions
ww lang          change UI language (en / tr)
ww region        change region
ww config        show current config
ww --help
ww --version
```

## notes

- config (incl. token) lives in `~/.watchwhere/config.json`
- ui defaults to english, turkish available via `ww lang`

## license

MIT
