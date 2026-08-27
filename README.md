# sqlc docs site

This repository builds and deploys <https://docs.sqlc.dev>. It contains **no
documentation content**. Content lives in
[sqlc-dev/sqlc](https://github.com/sqlc-dev/sqlc) under `docs/` as plain
GitHub-flavored Markdown; this repo ingests it, renders it with
[Fumadocs](https://fumadocs.dev) on Next.js, and publishes a fully static
site.

```
sqlc-dev/sqlc                          this repo
┌─────────────────────────┐            ┌──────────────────────────────┐
│ docs/*.md   (content)   │  checkout  │ ingest: md → content tree    │
│ docs/toc.yaml (nav)     │ ─────────► │ build:  Fumadocs / Next.js   │
│ internal/docs (Go lint) │            │ deploy: static files → CDN   │
└─────────────────────────┘            └──────────────────────────────┘
```

The split exists so that sqlc contributors never need a JavaScript toolchain:
the Go linter in `sqlc/internal/docs` (runs in sqlc's `go test ./...`)
enforces the content contract, and anything that passes it must render here.
If a change to this repo would reject content the linter accepts, that's a
bug in this repo — or a proposed contract change that goes to the linter
first.

## The content contract

Enforced upstream by `sqlc/internal/docs`:

- Plain CommonMark + GFM. No MDX, no JSX, no raw HTML except HTML comments.
- Every page starts with exactly one `#` heading — the page title.
- Admonitions use GitHub alert syntax: `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`.
- Relative links (`../reference/config.md#database`) resolve to real files;
  anchors match GitHub-style heading slugs.
- `docs/toc.yaml` lists every page exactly once: an `index`, titled
  `sections`, and `unlisted` (published, not in the sidebar).

Two implementation details here are load-bearing for that contract:

- Ingested pages keep their `.md` extension, so fumadocs-mdx compiles them as
  **Markdown, not MDX** — literal `{...}` and `<...>` in prose (which the
  linter rightly does not reject) render fine.
- `lib/remark-github-alerts.ts` maps `> [!NOTE]` blockquotes to Fumadocs
  `<Callout>` components, and `lib/relative-link.tsx` resolves relative `.md`
  links (bare ones included) to page routes at render time.

## Local development

```sh
npm ci
npm run ingest           # sparse-clones sqlc-dev/sqlc@main into .cache/
npm run dev
```

`npm run ingest -- --ref v1.30.0` builds another ref;
`npm run ingest -- --src ../sqlc/docs` uses a local checkout (CI does this).

The ingest step (`scripts/ingest.mjs`) writes `content/docs/`: it derives
each page's frontmatter `title` from its `#` heading and strips it, copies
the body verbatim, and converts `toc.yaml` into a Fumadocs `meta.json`
(sections become sidebar separators; `unlisted` pages get routes but stay out
of the sidebar). The one page-level transform: `reference/changelog.md` is
split into one page per release (`/en/latest/reference/changelog/v1.31.1.html`)
plus a release index at the original URL. Anything unexpected — an unknown `toc.yaml` field, a page
without a title — fails the build loudly: that's the contract-drift alarm.
`content/` is generated output; never commit or hand-edit it.

`npm run build` emits the static site to `out/`, then the postbuild scripts
align filenames with the `.html` routes (see below) and generate the
domain-root redirect objects in `out-root/`.

## URL scheme

The site keeps the Read the Docs URL scheme byte-for-byte, so existing links
never change or even redirect:

```
/en/latest/howto/select.html    the current docs (canonical)
/en/latest/                     section index
/en/v1.32.0/howto/select.html   versioned snapshots (same scheme RTD used for tags)
/en/stable/howto/select.html    RTD's newest-release alias; redirects into
                                the newest versioned snapshot
/                               redirects to /en/latest/
/en/latest/howto/upload.html    redirects to /en/latest/howto/push.html
                                (carried over from the old rediraffe config)
```

Page routes carry the `.html` suffix (a custom `url` in `lib/source.ts`), so
every internal link, search result, and sidebar entry points at the exact
legacy URL and the exported file *is* the page — no edge rewrite rules
needed. Next's export writes `<route>.html.html` plus a per-segment prefetch
directory squatting on the page's own path; `scripts/fix-html-ext.mjs`
renames the former and moves the latter to `out-segments/`, whose keys can
coexist with the page keys in object storage (flat keyspace) but not on a
filesystem. Hosts serving `out/` alone (local preview, GitHub Pages) still
work: the segment prefetch probes 404 and the client falls back to the
full-page `.txt` payload.

## Versioning

Versions are immutable build artifacts, not branches:

- `/en/latest` serves the current docs, rebuilt on every `main` docs change.
- A release build uses `NEXT_PUBLIC_BASE_PATH=/en/v1.32.0`
  (static export bakes absolute asset/link/search paths, so the prefix is a
  build-time setting) and is uploaded to the `en/v1.32.0/` prefix, once,
  forever.
- `versions.json` at the domain root, regenerated on every deploy, drives
  the version-switcher dropdown; every snapshot fetches it at runtime so old
  snapshots list new versions.
- Fumadocs versioning starts at the first tag that contains
  `docs/toc.yaml`. Every older tag the RTD site served (`v1.7.0` through
  `v1.31.1`, listed in `legacy-versions.json`) is rebuilt with **Sphinx**
  from that tag's own `docs/` and fully pinned `requirements.txt` — exactly
  as Read the Docs built it — so its `/en/vX.Y.Z/...` URLs keep resolving
  byte-for-byte. That list is frozen; new releases never go in it.

Non-latest builds, both kinds, carry an "older release" treatment:

- A banner at the top of every page linking to `/en/latest/`. Fumadocs
  snapshots bake it in at build time (`components/version-banner.tsx`,
  keyed off `NEXT_PUBLIC_BASE_PATH`); Sphinx snapshots get it injected
  post-build by `scripts/assemble-site.mjs`.
- Old releases stay out of search results the way docs.djangoproject.com
  does it: each Sphinx-snapshot page gets `rel=canonical` pointing at the
  same path under `/en/latest/` when that page still exists there (old
  inbound links keep passing ranking signal to the current docs), and
  `noindex` when it doesn't. Fumadocs snapshots set `noindex` at build time.

## CI and deployment

`ci.yml` runs ingest + build + typecheck on every PR and push to main, and
uploads the built site as a `site-preview` artifact (serve it locally with
`python3 -m http.server` and open `/en/latest/`).

`deploy.yml` builds the whole site and publishes it to **GitHub Pages**:

1. **latest** — ingest `sqlc-dev/sqlc@main` docs and build with Fumadocs
   (`out/` + the `out-root/` redirect objects). `out-segments/` is not
   deployed: its keys collide with page paths on a filesystem host, and the
   client falls back to full-page payloads (see "URL scheme").
2. **sphinx** — a matrix job per tag in `legacy-versions.json`, each
   building that tag's docs with its own pinned toolchain on Python 3.11.
   Snapshots are immutable, so the built HTML is cached per tag
   (`actions/cache`); a cache miss just rebuilds from source. Bump
   `CACHE_EPOCH` in the workflow to force a full rebuild.
3. **deploy** — `scripts/assemble-site.mjs` stitches the artifacts into one
   tree: root redirects, `en/latest/`, each `en/vX.Y.Z/` with the banner and
   canonical/noindex injected, `en/stable/` redirect stubs mirroring the
   newest snapshot's pages, `versions.json`, `robots.txt` + `sitemap.xml`
   (listing only the indexable `/en/latest/` pages), and a `404.html`. A missing
   snapshot fails the deploy — it would silently break published URLs.
   `actions/deploy-pages` publishes the tree.

It runs on pushes to main here, on a daily cron, and on a
`repository_dispatch` (`docs-updated`) — still to be wired up as a small
workflow in sqlc-dev/sqlc that fires on pushes to `main` touching `docs/**`.

One-time repo setup: Settings → Pages → source "GitHub Actions", custom
domain `docs.sqlc.dev`; cutover is pointing that DNS record at GitHub Pages
instead of Read the Docs.
