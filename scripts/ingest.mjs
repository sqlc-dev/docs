#!/usr/bin/env node
// Ingest: sqlc-dev/sqlc docs/ (plain GitHub-flavored Markdown + toc.yaml)
// → content/docs/ (Fumadocs content tree: .md files with frontmatter +
// meta.json for the sidebar).
//
// The transform is mechanical and lossless: derive the frontmatter title from
// the page's single `#` heading and strip it, copy everything else verbatim.
// Relative .md links are left untouched — the site resolves them at render
// time. Never hand-edit anything under content/.
//
// The content contract is enforced upstream by the Go linter in
// sqlc/internal/docs (runs in sqlc's `go test ./...`). Anything unexpected
// here means contract drift, and the build must fail loudly.
//
// Usage:
//   node scripts/ingest.mjs --src <path-to-sqlc-checkout-docs-dir>
//   node scripts/ingest.mjs [--ref <git-ref>]   # sparse-clones sqlc-dev/sqlc into .cache/
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'content', 'docs');
const SQLC_REPO = 'https://github.com/sqlc-dev/sqlc';

function fail(msg) {
  console.error(`ingest: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { src: null, ref: 'main' };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--src':
        args.src = argv[++i];
        break;
      case '--ref':
        args.ref = argv[++i];
        break;
      default:
        fail(`unknown argument ${argv[i]} (expected --src <dir> or --ref <git-ref>)`);
    }
  }
  return args;
}

// Clones the docs/ directory of sqlc-dev/sqlc at ref into .cache/sqlc.
function cloneDocs(ref) {
  const dir = path.join(ROOT, '.cache', 'sqlc');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  console.log(`ingest: cloning ${SQLC_REPO}@${ref} (sparse: docs/)`);
  execFileSync(
    'git',
    ['clone', '--depth', '1', '--branch', ref, '--filter=blob:none', '--sparse', SQLC_REPO, dir],
    { stdio: 'inherit' },
  );
  execFileSync('git', ['-C', dir, 'sparse-checkout', 'set', 'docs'], { stdio: 'inherit' });
  return path.join(dir, 'docs');
}

// Strict toc.yaml parse: any unknown structure is contract drift.
function readTOC(srcDir) {
  const tocPath = path.join(srcDir, 'toc.yaml');
  if (!fs.existsSync(tocPath)) fail(`${tocPath} not found`);
  const doc = parseDocument(fs.readFileSync(tocPath, 'utf8'));
  if (doc.errors.length > 0) fail(`toc.yaml: ${doc.errors[0].message}`);
  const toc = doc.toJS();

  for (const key of Object.keys(toc)) {
    if (!['index', 'sections', 'unlisted'].includes(key)) {
      fail(`toc.yaml: unknown top-level field ${JSON.stringify(key)}`);
    }
  }
  if (typeof toc.index !== 'string') fail('toc.yaml: "index" must be a string');
  if (!Array.isArray(toc.sections)) fail('toc.yaml: "sections" must be a list');
  for (const section of toc.sections) {
    for (const key of Object.keys(section)) {
      if (!['title', 'pages'].includes(key)) {
        fail(`toc.yaml: unknown section field ${JSON.stringify(key)}`);
      }
    }
    if (typeof section.title !== 'string') fail('toc.yaml: every section needs a "title"');
    if (!Array.isArray(section.pages) || section.pages.length === 0) {
      fail(`toc.yaml: section ${JSON.stringify(section.title)} needs a non-empty "pages" list`);
    }
  }
  if (toc.unlisted !== undefined && !Array.isArray(toc.unlisted)) {
    fail('toc.yaml: "unlisted" must be a list');
  }
  return { index: toc.index, sections: toc.sections, unlisted: toc.unlisted ?? [] };
}

function markdownFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(p, base));
    else if (entry.name.endsWith('.md')) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

// Splits a page into its title (the single leading `#` heading the contract
// mandates) and the rest of its body.
function extractTitle(rel, src) {
  const match = /^#[ \t]+(.+?)[ \t]*(?:#+[ \t]*)?\r?\n/.exec(src);
  if (!match) fail(`${rel}: page does not start with a "# Title" heading`);
  // Frontmatter titles are plain text (sidebar, <title>, h1), so flatten
  // inline code the way the linter's nodeText does.
  const title = match[1].replace(/`([^`]*)`/g, '$1');
  return { title, body: src.slice(match[0].length).replace(/^\r?\n/, '') };
}

// The changelog is one long page upstream; render it as one URL per release
// (reference/changelog/v1.31.1.html) with reference/changelog.html as the
// release index. Sections look like:
//
//   ## [1.31.1](https://github.com/sqlc-dev/sqlc/releases/tag/v1.31.1)
//   Released 2026-04-22
//   ### Bug Fixes
//   - ...
//
// Anything else is contract drift and fails the build.
function splitChangelog(rel, body) {
  // Leftover MyST anchor targets ("(v1-31-1)=") from the old toolchain
  // render as literal text; drop them.
  const lines = body.split('\n').filter((l) => !/^\([a-z0-9._-]+\)=\s*$/i.test(l));

  const sections = [];
  let intro = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const m = /^## \[v?([^\]]+)\]\((https:\/\/github\.com\/[^)]+)\)\s*$/.exec(line);
      if (!m) fail(`${rel}: unrecognized release heading: ${line}`);
      current = { version: `v${m[1]}`, url: m[2], date: null, body: [] };
      sections.push(current);
    } else if (current === null) {
      intro.push(line);
    } else {
      const released = /^Released (\d{4}-\d{2}-\d{2})\s*$/.exec(line);
      if (released && current.date === null) {
        current.date = released[1];
        current.body.push(`Released ${released[1]} · [View on GitHub](${current.url})`);
      } else {
        // Promote subsections: the release heading became the page title.
        current.body.push(line.startsWith('### ') ? line.slice(1) : line);
      }
    }
  }
  if (sections.length === 0) fail(`${rel}: no release sections found`);

  const pages = [];
  for (const s of sections) {
    if (s.date === null) fail(`${rel}: release ${s.version} has no "Released YYYY-MM-DD" line`);
    pages.push({
      rel: `reference/changelog/${s.version}.md`,
      title: s.version,
      body: s.body.join('\n').trim() + '\n',
    });
  }

  const index = [
    ...intro.join('\n').trim().split('\n'),
    '',
    ...sections.map((s) => `- [${s.version}](changelog/${s.version}.md) — released ${s.date}`),
    '',
  ];
  pages.push({ rel, title: 'Changelog', body: index.join('\n') });
  return pages;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const srcDir = args.src ? path.resolve(args.src) : cloneDocs(args.ref);
  if (!fs.existsSync(srcDir)) fail(`source directory ${srcDir} not found`);

  const toc = readTOC(srcDir);
  const files = markdownFiles(srcDir);

  // Cross-check toc.yaml against the files on disk, exactly like the linter
  // does: every page listed exactly once, every entry a real page.
  const listed = new Map();
  const addListed = (entry) => listed.set(entry, (listed.get(entry) ?? 0) + 1);
  addListed(toc.index);
  for (const section of toc.sections) for (const page of section.pages) addListed(page);
  for (const page of toc.unlisted) addListed(page);
  for (const [entry, count] of listed) {
    if (count > 1) fail(`toc.yaml: ${entry} is listed ${count} times`);
    if (!files.includes(entry)) fail(`toc.yaml: ${entry} is listed but does not exist`);
  }
  for (const file of files) {
    if (!listed.has(file)) fail(`toc.yaml: ${file} is not listed`);
  }

  // Write the content tree from scratch — no stale pages.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  const writePage = (rel, title, body) => {
    const dest = path.join(OUT_DIR, rel.split('/').join(path.sep));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // JSON string literals are valid YAML, so this quoting is always safe.
    fs.writeFileSync(dest, `---\ntitle: ${JSON.stringify(title)}\n---\n\n${body}`);
    written++;
  };

  for (const rel of files) {
    const src = fs.readFileSync(path.join(srcDir, rel.split('/').join(path.sep)), 'utf8');
    const { title, body } = extractTitle(rel, src);
    if (rel === 'reference/changelog.md') {
      for (const page of splitChangelog(rel, body)) writePage(page.rel, page.title, page.body);
    } else {
      writePage(rel, title, body);
    }
  }

  // toc.yaml sections map 1:1 to sidebar separators; unlisted pages get
  // routes but stay out of the sidebar by not appearing in `pages`.
  // Fumadocs resolves an extensionless meta.json item to a folder first, so
  // a page shadowed by a same-named folder (reference/changelog next to the
  // split-out reference/changelog/ releases) needs its explicit .md path.
  const routeOf = (page) => {
    const route = page.replace(/\.md$/, '');
    return fs.existsSync(path.join(OUT_DIR, route.split('/').join(path.sep))) ? page : route;
  };
  const pages = [routeOf(toc.index)];
  for (const section of toc.sections) {
    pages.push(`---${section.title}---`);
    pages.push(...section.pages.map(routeOf));
  }
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify({ pages }, null, 2) + '\n');

  console.log(`ingest: wrote ${written} pages (${toc.unlisted.length} unlisted) from ${srcDir}`);
}

main();
