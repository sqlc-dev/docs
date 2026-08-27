#!/usr/bin/env node
// Assemble the complete docs.sqlc.dev tree for GitHub Pages.
//
// Inputs (see deploy.yml):
//
//   --latest <dir>   the Fumadocs build: <dir>/out (the /en/latest pages)
//                    and <dir>/out-root (domain-root redirect objects)
//   --sphinx <dir>   one subdirectory per legacy version — <dir>/v1.7.0 or
//                    <dir>/sphinx-v1.7.0 (the artifact name downloads under)
//   --out <dir>      the assembled site, ready for upload-pages-artifact
//
// Every version in legacy-versions.json must be present — a missing build
// would silently break published /en/vX.Y.Z/ URLs, so it fails the deploy.
//
// Legacy pages are served byte-for-byte as Sphinx built them, except for
// two injections into each page:
//
//   - an "old version" banner at the top of the content area, since these
//     snapshots no longer get the Read the Docs version flyout;
//   - a search-engine hint keeping old releases out of results, the way
//     docs.djangoproject.com does it: rel=canonical to the same page under
//     /en/latest/ when it still exists there (old inbound links keep
//     passing signal to the current docs), noindex when it doesn't.
//
// /en/stable/ (the Read the Docs alias for the newest release) becomes a
// tree of redirect stubs mirroring the newest legacy snapshot's pages, and
// versions.json at the domain root drives the /en/latest version switcher.
// The domain root also gets robots.txt and sitemap.xml (listing only the
// indexable /en/latest pages), replacing the ones Read the Docs served.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://docs.sqlc.dev';

function fail(msg) {
  console.error(`assemble-site: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { latest: null, sphinx: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in args) || argv[i + 1] === undefined) {
      fail(`usage: assemble-site.mjs --latest <dir> --sphinx <dir> --out <dir>`);
    }
    args[key] = path.resolve(argv[++i]);
  }
  for (const [key, value] of Object.entries(args)) {
    if (value === null) fail(`missing --${key}`);
  }
  return args;
}

// Newest-first semver order for versions.json and the stable alias.
function byVersionDesc(a, b) {
  const parse = (v) => v.slice(1).split('.').map(Number);
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
  return 0;
}

function htmlFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(p, base));
    else if (entry.name.endsWith('.html')) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

// Sphinx support directories whose .html files (raw sources, static assets)
// are not pages and get no banner.
function isSupportFile(rel) {
  return rel.startsWith('_sources/') || rel.startsWith('_static/');
}

function banner(version) {
  return (
    `<div style="margin:0 0 24px;padding:12px 16px;background:#fff3cd;` +
    `border:1px solid #e0c46c;border-radius:4px;color:#533f03;font-size:14px;line-height:1.5;">` +
    `You are viewing the documentation for <strong>${version}</strong>, an older release of sqlc. ` +
    `<a href="/en/latest/" style="color:#533f03;font-weight:600;">View the latest documentation.</a>` +
    `</div>`
  );
}

// Injects the banner and the search-engine hint into one Sphinx-built page.
// Every sphinx_rtd_theme page (0.5.1 through 3.1.0) has exactly one
// <div role="main" ...> wrapping the content — anything else is drift in
// what we're rebuilding, and must fail loudly rather than ship half-marked
// snapshots.
function injectIntoPage(file, version, headTag) {
  const src = fs.readFileSync(file, 'utf8');
  // Redirect stubs (sphinxext-rediraffe, e.g. howto/upload.html) have no
  // theme markup and need no banner — the target page carries it.
  if (/http-equiv="refresh"/i.test(src)) return false;
  const withMeta = src.replace(/<head([^>]*)>/, `<head$1>${headTag}`);
  if (withMeta === src) fail(`${file}: no <head> tag found`);
  const anchor = /<div role="main"[^>]*>/g;
  const matches = withMeta.match(anchor);
  if (!matches || matches.length !== 1) {
    fail(`${file}: expected exactly one <div role="main"> anchor, found ${matches ? matches.length : 0}`);
  }
  fs.writeFileSync(file, withMeta.replace(anchor, `$&${banner(version)}`));
  return true;
}

function redirectStub(target) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Redirecting…</title>
<link rel="canonical" href="${target}">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${target}">
</head>
<body>
<p>This page has moved to <a href="${target}">${target}</a>.</p>
</body>
</html>
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const versions = JSON.parse(fs.readFileSync(path.join(ROOT, 'legacy-versions.json'), 'utf8'))
    .sphinx.sort(byVersionDesc);

  fs.rmSync(args.out, { recursive: true, force: true });

  // Domain root: redirect objects (/ and /en/ → /en/latest/).
  const outRoot = path.join(args.latest, 'out-root');
  if (!fs.existsSync(path.join(outRoot, 'index.html'))) fail(`${outRoot}/index.html not found`);
  fs.cpSync(outRoot, args.out, { recursive: true });

  // The current docs, straight from the Fumadocs export.
  const latestOut = path.join(args.latest, 'out');
  if (!fs.existsSync(path.join(latestOut, 'index.html'))) fail(`${latestOut}/index.html not found`);
  fs.cpSync(latestOut, path.join(args.out, 'en', 'latest'), { recursive: true });

  // Which legacy page paths still exist under /en/latest/ decides each
  // page's search-engine hint: canonical to its successor, else noindex.
  const latestPages = new Set(htmlFiles(latestOut));
  const headTagFor = (rel) =>
    latestPages.has(rel)
      ? `<link rel="canonical" href="${SITE}/en/latest/${rel === 'index.html' ? '' : rel}">`
      : `<meta name="robots" content="noindex">`;

  // Legacy Sphinx snapshots, with banner + search hint injected per page.
  for (const version of versions) {
    const src = [version, `sphinx-${version}`]
      .map((name) => path.join(args.sphinx, name))
      .find((dir) => fs.existsSync(path.join(dir, 'index.html')));
    if (!src) fail(`no Sphinx build found for ${version} under ${args.sphinx}`);

    const dest = path.join(args.out, 'en', version);
    fs.cpSync(src, dest, { recursive: true });
    let pages = 0;
    let canonical = 0;
    let redirects = 0;
    for (const rel of htmlFiles(dest)) {
      if (isSupportFile(rel)) continue;
      const headTag = headTagFor(rel);
      if (!injectIntoPage(path.join(dest, ...rel.split('/')), version, headTag)) {
        redirects++;
        continue;
      }
      pages++;
      if (headTag.startsWith('<link')) canonical++;
    }
    console.log(
      `assemble-site: en/${version}: ${pages} pages ` +
        `(${canonical} canonical, ${pages - canonical} noindex, ${redirects} redirect stubs)`,
    );
  }

  // /en/stable/ — the Read the Docs alias for the newest release. Mirror
  // the newest snapshot's page tree as redirect stubs so every deep link
  // lands on the page it always did.
  const stable = versions[0];
  let stubs = 0;
  for (const rel of htmlFiles(path.join(args.out, 'en', stable))) {
    if (isSupportFile(rel)) continue;
    const stub = path.join(args.out, 'en', 'stable', ...rel.split('/'));
    fs.mkdirSync(path.dirname(stub), { recursive: true });
    fs.writeFileSync(stub, redirectStub(`/en/${stable}/${rel}`));
    stubs++;
  }
  console.log(`assemble-site: en/stable: ${stubs} redirect stubs → en/${stable}`);

  // versions.json drives the version-switcher dropdown in every build.
  fs.writeFileSync(
    path.join(args.out, 'versions.json'),
    JSON.stringify({ latest: stable, versions }, null, 2) + '\n',
  );

  // robots.txt + sitemap.xml at the domain root, replacing the ones Read
  // the Docs autogenerated. The sitemap lists only /en/latest pages: every
  // other version is canonical/noindex by design (see above), so listing
  // it would contradict the per-page search-engine hints. Redirect stubs,
  // noindex pages, and the export's 404.html stay out for the same reason.
  const sitemapUrls = [];
  for (const rel of htmlFiles(path.join(args.out, 'en', 'latest'))) {
    if (rel === '404.html') continue;
    const src = fs.readFileSync(path.join(args.out, 'en', 'latest', ...rel.split('/')), 'utf8');
    if (/http-equiv="refresh"/i.test(src)) continue;
    if (/name="robots"[^>]*noindex/i.test(src)) continue;
    sitemapUrls.push(`${SITE}/en/latest/${rel === 'index.html' ? '' : rel}`);
  }
  fs.writeFileSync(
    path.join(args.out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      sitemapUrls.map((u) => `  <url><loc>${u}</loc></url>\n`).join('') +
      `</urlset>\n`,
  );
  fs.writeFileSync(
    path.join(args.out, 'robots.txt'),
    `User-agent: *\nDisallow:\n\nSitemap: ${SITE}/sitemap.xml\n`,
  );
  console.log(`assemble-site: sitemap.xml (${sitemapUrls.length} URLs) + robots.txt`);

  // GitHub Pages serves this for any path that doesn't exist.
  fs.writeFileSync(
    path.join(args.out, '404.html'),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found — sqlc</title>
<meta name="robots" content="noindex">
</head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:15vh auto;padding:0 1rem;line-height:1.6;">
<h1>Page not found</h1>
<p>This page doesn't exist. It may have moved in a newer release.</p>
<p><a href="/en/latest/">Go to the latest sqlc documentation</a></p>
</body>
</html>
`,
  );

  console.log(`assemble-site: done — ${versions.length} legacy versions + en/latest in ${args.out}`);
}

main();
