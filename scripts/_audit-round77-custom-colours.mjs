/**
 * ROUND 77 §A — every author-entered colour actually stored, with its exact
 * value, where it lives and which renderer reads it.
 *
 * Round 77's brief names `#ffcb5c → #fff8e0` as a colour the author has used.
 * This script does not assume it exists: it enumerates what IS stored and
 * reports whether that pair is among it, so §C's worked examples run on real
 * values rather than remembered ones.
 *
 * ── ROUND 50's TWO FALSE ZEROS ARE PRE-EMPTED, NOT TRUSTED ────────────────
 * 1. THE COLLECTION is `page_builder_pages`, not mongoose's default
 *    `pagebuilders`. `requireCollection` DIES on a missing name, because "no
 *    documents" and "no collection" print the same zero.
 * 2. THE VERSION PATH is `snapshot.sections`, not `content.sections`. A
 *    non-empty `page_versions` yielding zero sections is a hard failure here.
 * Both live pages and version snapshots are walked, and reported SEPARATELY —
 * round 75's single histogram summed them, which is why its 233 `default`
 * looked nothing like the 63 that are actually live.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * A walker that never descends prints "no custom colours" — the same output as
 * a corpus that has none. So the run asserts it visited sections and reports
 * the nesting depth it reached; zero visits is a hard failure.
 *
 * READ-ONLY. One find() per collection. No updateOne, no bulkWrite, no $set.
 *
 * Run: node --env-file=.env.local scripts/_audit-round77-custom-colours.mjs
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

const CHILD_KEYS = ['children', 'left', 'right', 'items', 'cards', 'tabs', 'columns', 'sections'];

function makeWalk() {
  const state = { visited: 0, maxDepth: 0, backgrounds: [], accents: [] };
  function walk(nodes, depth, where) {
    if (!Array.isArray(nodes)) return;
    for (const s of nodes) {
      if (!s || typeof s !== 'object') continue;
      state.visited += 1;
      if (depth > state.maxDepth) state.maxDepth = depth;
      const st = s.settings ?? {};
      const sy = s.style ?? {};
      if (st.backgroundMode === 'custom' && st.backgroundCustom) {
        state.backgrounds.push({
          where, depth, type: s.type,
          from: st.backgroundCustom.from ?? null,
          to: st.backgroundCustom.to ?? null,
          direction: st.backgroundCustom.direction ?? null,
          // The PRESET key stored beside it — inert while mode is custom,
          // because backgroundClassFor() suppresses the class entirely.
          inertPresetKey: st.background ?? null,
        });
      }
      if (sy.accentMode === 'custom') {
        state.accents.push({ where, depth, type: s.type, value: sy.accentCustom ?? null, inertPresetKey: sy.accentColor ?? null });
      }
      const c = s.content ?? {};
      for (const k of CHILD_KEYS) if (Array.isArray(c[k])) walk(c[k], depth + 1, where);
      if (Array.isArray(c.tabs)) for (const t of c.tabs) if (Array.isArray(t?.children)) walk(t.children, depth + 1, where);
    }
  }
  return { state, walk };
}

const pagesCol = await requireCollection('page_builder_pages');
const versCol = await requireCollection('page_versions');

const live = makeWalk();
const pages = await pagesCol.find({}).toArray();
for (const p of pages) live.walk(p.sections, 0, `${p.slug}(${p.status})`);

const snap = makeWalk();
const versions = await versCol.find({}).toArray();
let vTop = 0;
for (const v of versions) {
  const s = v.snapshot?.sections;
  if (Array.isArray(s)) { vTop += s.length; snap.walk(s, 0, `version:${v.pageId ?? '?'}#${v.version ?? '?'}`); }
}
if (versions.length > 0 && vTop === 0) die('page_versions non-empty but snapshot.sections yielded zero — the false-zero path');
if (pages.length > 0 && live.state.visited === 0) die('pages exist but the walker visited zero sections');

/** Distinct colour values, so §C's worked examples cover each once. */
function distinct(list, keyFn) {
  const m = new Map();
  for (const x of list) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, { value: k, count: 0, seenAt: [] });
    const e = m.get(k); e.count += 1;
    if (e.seenAt.length < 4) e.seenAt.push(`${x.where} ${x.type}@d${x.depth}`);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

const gradientKey = (b) => (b.to ? `${b.from} → ${b.to} [${b.direction}]` : `${b.from} (flat)`);

// Did the brief's named pair turn up anywhere?
const NAMED = ['#ffcb5c', '#fff8e0'];
const allHexes = new Set();
for (const b of [...live.state.backgrounds, ...snap.state.backgrounds]) {
  if (b.from) allHexes.add(b.from.toLowerCase());
  if (b.to) allHexes.add(b.to.toLowerCase());
}
for (const a of [...live.state.accents, ...snap.state.accents]) if (a.value) allHexes.add(a.value.toLowerCase());

console.log(JSON.stringify({
  database: (uri.match(/@([^/]+)\//) || [])[1] + ' / ' + process.env.MONGODB_DB_NAME,
  corpus: {
    pages: pages.length, versions: versions.length,
    liveSectionsVisited: live.state.visited, liveMaxDepth: live.state.maxDepth,
    snapshotSectionsVisited: snap.state.visited, snapshotMaxDepth: snap.state.maxDepth,
  },
  '-- CUSTOM BACKGROUND --': '',
  liveCustomBackgroundSections: live.state.backgrounds.length,
  snapshotCustomBackgroundSections: snap.state.backgrounds.length,
  distinctLiveGradients: distinct(live.state.backgrounds, gradientKey),
  '-- CUSTOM ACCENT --': '',
  liveCustomAccentSections: live.state.accents.length,
  snapshotCustomAccentSections: snap.state.accents.length,
  distinctLiveAccents: distinct(live.state.accents.filter((a) => a.value), (a) => a.value),
  '-- THE BRIEF S NAMED PAIR --': '',
  briefNamed: NAMED,
  briefNamedPresentInCorpus: NAMED.map((h) => ({ hex: h, present: allHexes.has(h.toLowerCase()) })),
  everyDistinctAuthorHexInCorpus: [...allHexes].sort(),
}, null, 2));

await mongoose.disconnect();
