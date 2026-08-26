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
of the sidebar). Anything unexpected — an unknown `toc.yaml` field, a page
without a title — fails the build loudly: that's the contract-drift alarm.
`content/` is generated output; never commit or hand-edit it.

`npm run build` emits the static site to `out/` (plain HTML/CSS/JS, servable
from any static host that resolves `/howto/select` to `howto/select.html`),
then `scripts/redirects.mjs` adds redirect stubs for legacy URLs.

## URL scheme and redirects

Pages are mounted at the domain root: `docs.sqlc.dev/howto/select`. The old
Read the Docs URLs redirect:

```
/en/latest/<path>.html  →  /<path>       (301)
/en/latest/             →  /
/howto/upload           →  /howto/push   (carried over from the old rediraffe config)
```

These should be real 301s at the hosting edge (e.g. Cloudflare Bulk
Redirects). As a belt-and-braces fallback the build also emits meta-refresh
stubs (with canonical links and `noindex`) under `out/en/latest/`, so legacy
links work on any static host even before edge rules exist. Old RTD tag URLs
(`/en/v1.29.0/...`) can redirect to `/` until versioned builds cover them.

## Versioning

Versions are immutable build artifacts, not branches:

- The root serves latest, rebuilt on every `main` docs change.
- The release workflow builds a tag with `NEXT_PUBLIC_BASE_PATH=/v1.32.0`
  (static export bakes absolute asset/link/search paths, so the prefix is a
  build-time setting) and uploads it to the `/v1.32.0/` prefix, once, forever.
- `versions.json` at the domain root, appended by each release, drives the
  version-switcher dropdown; every snapshot fetches it at runtime so old
  snapshots list new versions.
- Versioned builds set `noindex` so stale versions never outrank current
  docs in search engines.
- Versioning starts at the first tag that contains `docs/toc.yaml`; older
  tags are not backfilled.

## CI

- **CI** (`ci.yml`): ingest + build + typecheck on every PR and push to main.
- **Deploy latest docs** (`deploy.yml`): runs on `repository_dispatch`
  (type `docs-updated`), manual dispatch, and a daily cron as a safety net.
  Ingests sqlc@main, builds, syncs `out/` to the R2 bucket root — excluding
  `v*/` and `versions.json`, which belong to releases.
- **Deploy versioned docs** (`release.yml`): takes a tag (manual input or
  `repository_dispatch` type `docs-release` with `{"tag": "v1.32.0"}`),
  builds it under its version prefix, syncs to that prefix, and appends the
  tag to `versions.json`.

Deploys need these repository secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Until they exist, the deploy step is
skipped and the workflows just prove the build is green.

The sqlc repo side is a tiny workflow that notifies this repo when docs
change. `DOCS_DISPATCH_TOKEN` is a fine-grained PAT scoped to this repo only,
with Contents read/write permission (what `repository_dispatch` requires):

```yaml
# .github/workflows/docs-dispatch.yml in sqlc-dev/sqlc
name: Notify docs site
on:
  push:
    branches: [main]
    paths: ['docs/**']
jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sS -X POST \
            -H "Authorization: Bearer ${{ secrets.DOCS_DISPATCH_TOKEN }}" \
            -H "Accept: application/vnd.github+json" \
            https://api.github.com/repos/sqlc-dev/docs/dispatches \
            -d '{"event_type": "docs-updated"}'
```

and the release equivalent sending
`{"event_type": "docs-release", "client_payload": {"tag": "${{ github.ref_name }}"}}`
on tag push.
