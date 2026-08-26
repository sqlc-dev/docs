#!/usr/bin/env node
// Post-build step: align exported filenames with the .html routes.
//
// Page routes carry the legacy Read the Docs .html suffix
// (/en/latest/howto/select.html). For such a route Next's static export
// writes:
//
//   howto/select.html.html   the page HTML (export appends ".html" blindly)
//   howto/select.html.txt    the full-page RSC payload for client navigation
//   howto/select.html/       per-segment prefetch payloads (__next.*.txt)
//
// The page must be served from the exact path the segment directory
// occupies. A filesystem can't hold both, but object storage can (keys are
// flat), so: rename the page file to the key the URL names, and move the
// segment directories aside into out-segments/ — the deploy workflows upload
// both trees into the same prefix. On hosts serving out/ alone (local
// preview, GitHub Pages) the segment prefetch probes 404 and the client
// falls back to the full-page .txt payload; navigation still works.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'out');
const SEGMENTS_DIR = path.join(ROOT, 'out-segments');

if (!fs.existsSync(OUT_DIR)) {
  console.error('fix-html-ext: out/ not found — run next build first');
  process.exit(1);
}

fs.rmSync(SEGMENTS_DIR, { recursive: true, force: true });

let renamed = 0;
let moved = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.html')) {
        const dest = path.join(SEGMENTS_DIR, path.relative(OUT_DIR, p));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(p, dest);
        moved++;
      } else {
        walk(p);
      }
    } else if (entry.name.endsWith('.html.html')) {
      fs.renameSync(p, p.slice(0, -'.html'.length));
      renamed++;
    }
  }
})(OUT_DIR);

console.log(`fix-html-ext: renamed ${renamed} pages, moved ${moved} segment dirs to out-segments/`);
