#!/usr/bin/env node
// Post-build step for the /en/latest build.
//
// The site keeps the Read the Docs URL scheme, so pages already live at
// their historical URLs (/en/latest/<path>.html) — no legacy redirects
// needed. What's left:
//
//   - out/howto/upload.html: the one page-level redirect carried over from
//     the old rediraffe config (upload was renamed to push).
//   - out-root/: objects deployed to the domain root, outside the /en/latest
//     prefix — redirects from / and /en/ into /en/latest/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'out');
const OUT_ROOT_DIR = path.join(ROOT, 'out-root');

// from (under /en/latest) → to (site-absolute); carried over from the old
// rediraffe config.
const EXTRA_REDIRECTS = {
  'howto/upload': '/en/latest/howto/push.html',
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/en/latest';
if (basePath !== '/en/latest') {
  console.log('redirects: versioned build, skipping');
  process.exit(0);
}
if (!fs.existsSync(OUT_DIR)) {
  console.error('redirects: out/ not found — run next build first');
  process.exit(1);
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

function writeStub(dir, rel, target) {
  const file = path.join(dir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stub(target));
}

for (const [from, to] of Object.entries(EXTRA_REDIRECTS)) {
  writeStub(OUT_DIR, `${from}.html`, to);
  writeStub(OUT_DIR, `${from}/index.html`, to);
}

// Domain-root objects, deployed outside the /en/latest prefix.
fs.rmSync(OUT_ROOT_DIR, { recursive: true, force: true });
writeStub(OUT_ROOT_DIR, 'index.html', '/en/latest/');
writeStub(OUT_ROOT_DIR, 'en/index.html', '/en/latest/');

console.log('redirects: wrote upload→push stubs and out-root/ redirects');
