#!/usr/bin/env node
// Post-build step: emit redirect pages for legacy URLs into out/.
//
// docs.sqlc.dev used to be served by Read the Docs at /en/latest/<path>.html;
// the README and many external links still point there. True 301s belong at
// the hosting edge (see README), but these meta-refresh stubs — each with a
// canonical link to the new URL — make every legacy URL work on any static
// host, edge rules or not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'docs');
const OUT_DIR = path.join(ROOT, 'out');

// Carried over from the old rediraffe config.
const EXTRA_REDIRECTS = {
  'howto/upload': 'howto/push',
};

if (process.env.NEXT_PUBLIC_BASE_PATH) {
  console.log('redirects: versioned build, skipping legacy redirect stubs');
  process.exit(0);
}
if (!fs.existsSync(OUT_DIR)) {
  console.error('redirects: out/ not found — run next build first');
  process.exit(1);
}

function routes(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routes(p, base));
    else if (entry.name.endsWith('.md')) {
      out.push(path.relative(base, p).split(path.sep).join('/').replace(/\.md$/, ''));
    }
  }
  return out;
}

function stub(target) {
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

function writeStub(rel, target) {
  const file = path.join(OUT_DIR, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stub(target));
}

let count = 0;
for (const route of routes(CONTENT_DIR)) {
  const target = route === 'index' ? '/' : `/${route}`;
  const legacy = route === 'index' ? 'index' : route;
  // RTD served both /en/latest/<path>.html and /en/latest/<path>/.
  writeStub(`en/latest/${legacy}.html`, target);
  writeStub(`en/latest/${legacy}/index.html`, target);
  count += 2;
}
for (const [from, to] of Object.entries(EXTRA_REDIRECTS)) {
  writeStub(`${from}.html`, `/${to}`);
  writeStub(`${from}/index.html`, `/${to}`);
  count += 2;
}

console.log(`redirects: wrote ${count} redirect stubs`);
