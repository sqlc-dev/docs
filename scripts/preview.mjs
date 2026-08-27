#!/usr/bin/env node
// Local preview of the built site, mapping URLs exactly like production:
//
//   /en/latest/...  →  out/ (pages), then out-segments/ (prefetch payloads)
//   everything else →  out-root/ (domain-root redirects)
//
// No clean-URL rewriting: /en/latest/howto/select.html serves the file of
// that name, as the real host does. Usage: npm start [-- <port>]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const SEGMENTS = path.join(ROOT, 'out-segments');
const OUT_ROOT = path.join(ROOT, 'out-root');
const PREFIX = process.env.NEXT_PUBLIC_BASE_PATH ?? '/en/latest';
const PORT = Number(process.argv[2] ?? 8000);

if (!fs.existsSync(OUT)) {
  console.error('preview: out/ not found — run `npm run ingest && npm run build` first');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function resolveFile(base, rel) {
  const file = path.join(base, ...rel.split('/').filter(Boolean));
  if (!file.startsWith(base)) return null;
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat?.isDirectory()) return resolveFile(base, `${rel}/index.html`);
  return stat?.isFile() ? file : null;
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file;
    if (url === PREFIX || url.startsWith(`${PREFIX}/`)) {
      const rel = url.slice(PREFIX.length) || '/';
      file = resolveFile(OUT, rel) ?? resolveFile(SEGMENTS, rel);
    } else {
      file = resolveFile(OUT_ROOT, url);
    }
    if (!file) {
      const notFound = resolveFile(OUT, '/404.html');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(notFound ? fs.readFileSync(notFound) : 'Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`preview: http://localhost:${PORT}${PREFIX}/`);
  });
