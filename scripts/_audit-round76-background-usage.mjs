/**
 * ROUND 76 §I — how many pages and sections each `settings.background` preset
 * key actually covers. Read-only.
 *
 * Round 50's two false zeros are pre-empted rather than trusted: the collection
 * is `page_builder_pages` (NOT mongoose's default `pagebuilders`) and the
 * version path is `snapshot.sections` (NOT `content.sections`). Both are
 * required to exist; a missing one DIES rather than printing a clean zero.
 *
 * The walker's own reach is asserted too — a walker that never descends prints
 * "every key unused", which is the same output as a corpus that uses none.
 *
 * Run: node --env-file=.env.local scripts/_audit-round76-background-usage.mjs
 */
import mongoose from 'mongoose';

function die(m) { console.error('X ' + m); process.exit(1); }
const uri = process.env.MONGODB_URI;
if (!uri) die('MONGODB_URI missing — run with --env-file=.env.local');
await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
const db = mongoose.connection.db;
async function requireCollection(name) {
  const f = await db.listCollections({ name }).toArray();
  if (!f.length) die(`collection "${name}" does not exist — a zero from it would be a false zero`);
  return db.collection(name);
}
const pagesCol = await requireCollection('page_builder_pages');
const versCol = await requireCollection('page_versions');

const CHILD_KEYS = ['children', 'left', 'right', 'items', 'cards', 'tabs', 'columns', 'sections'];
let visited = 0; let nested = 0;

function walk(nodes, depth, hit) {
  if (!Array.isArray(nodes)) return;
  for (const s of nodes) {
    if (!s || typeof s !== 'object') continue;
    visited += 1; if (depth > 0) nested += 1;
    const st = s.settings ?? {};
    // An EXPLICIT key only. An absent `background` is not `default` stored —
    // it is nothing stored, and conflating them would inflate `default`.
    if (st.background != null) hit(String(st.background), st.backgroundMode === 'custom');
    const c = s.content ?? {};
    for (const k of CHILD_KEYS) if (Array.isArray(c[k])) walk(c[k], depth + 1, hit);
    if (Array.isArray(c.tabs)) for (const t of c.tabs) if (Array.isArray(t?.children)) walk(t.children, depth + 1, hit);
  }
}

const sections = {}; const pagesPerKey = {}; const suppressedByCustom = {};
const pages = await pagesCol.find({}).toArray();
for (const p of pages) {
  const seen = new Set();
  walk(p.sections, 0, (key, isCustom) => {
    sections[key] = (sections[key] ?? 0) + 1;
    seen.add(key);
    // A section whose backgroundMode is 'custom' has its preset class
    // SUPPRESSED by backgroundClassFor() — the stored key is inert.
    if (isCustom) suppressedByCustom[key] = (suppressedByCustom[key] ?? 0) + 1;
  });
  for (const k of seen) {
    pagesPerKey[k] = pagesPerKey[k] ?? { pages: 0, slugs: [] };
    pagesPerKey[k].pages += 1; pagesPerKey[k].slugs.push(`${p.slug}(${p.status})`);
  }
}

const vSections = {};
let vTop = 0;
const versions = await versCol.find({}).toArray();
for (const v of versions) {
  const snap = v.snapshot?.sections;
  if (Array.isArray(snap)) { vTop += snap.length; walk(snap, 0, (k) => { vSections[k] = (vSections[k] ?? 0) + 1; }); }
}
if (versions.length > 0 && vTop === 0) die('page_versions non-empty but snapshot.sections yielded zero — the false-zero path');
if (pages.length > 0 && visited === 0) die('pages exist but the walker visited zero sections');

console.log(JSON.stringify({
  database: (process.env.MONGODB_URI.match(/@([^/]+)\//) || [])[1] + ' / ' + process.env.MONGODB_DB_NAME,
  pages: pages.length, versions: versions.length,
  sectionsVisited: visited, ofWhichNested: nested,
  perKey_liveSections: sections,
  perKey_pages: pagesPerKey,
  perKey_inertBecauseBackgroundModeIsCustom: suppressedByCustom,
  perKey_versionSnapshotSections: vSections,
}, null, 2));
await mongoose.disconnect();
