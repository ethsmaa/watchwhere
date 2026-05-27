# watchwhere

CLI to check which of your streaming subs has a movie, in your region.

```
$ ww shining
  searching "shining"… 40 results
? which one?
> [movie] The Shining (1980)
  [tv] Shining Time Station (1989)
  ...

  The Shining (1980)  [movie]  TR

  ● on your subs: Netflix
```

## why

I have a handful of streaming subs and I always forget which one has what.
Got tired of opening JustWatch every time. Terminal version of that lookup.

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
ww config        show current config
ww --help
ww --version
```

## notes

- token + subscription list live in `~/.watchwhere/config.json` (0600 on posix)
- provider list cached 24h per region in `~/.watchwhere/cache/`
- ui is in english by default, turkish supported. movie titles come back in
  whatever language you set (any BCP-47 code TMDB supports)
- esc in the picker drops back to an editable query — re-edit instead of retyping
- ctrl+c exits cleanly with code 130

## license

MIT
