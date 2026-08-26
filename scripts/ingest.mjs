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

  for (const rel of files) {
    const src = fs.readFileSync(path.join(srcDir, rel.split('/').join(path.sep)), 'utf8');
    const { title, body } = extractTitle(rel, src);
    const dest = path.join(OUT_DIR, rel.split('/').join(path.sep));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // JSON string literals are valid YAML, so this quoting is always safe.
    fs.writeFileSync(dest, `---\ntitle: ${JSON.stringify(title)}\n---\n\n${body}`);
  }

  // toc.yaml sections map 1:1 to sidebar separators; unlisted pages get
  // routes but stay out of the sidebar by not appearing in `pages`.
  const routeOf = (page) => page.replace(/\.md$/, '');
  const pages = [routeOf(toc.index)];
  for (const section of toc.sections) {
    pages.push(`---${section.title}---`);
    pages.push(...section.pages.map(routeOf));
  }
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify({ pages }, null, 2) + '\n');

  console.log(`ingest: wrote ${files.length} pages (${toc.unlisted.length} unlisted) from ${srcDir}`);
}

main();
