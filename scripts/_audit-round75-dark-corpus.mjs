/**
 * ROUND 75 §I — the blast radius of any dark-mode fix, read-only.
 *
 * Counts, over the WHOLE stored corpus, how many pages and sections carry an
 * author-chosen (custom) colour versus a preset one, per page.theme, and which
 * cardStyle values are actually in use. §G's four options each hit a different
 * one of these buckets, so the counts are what makes those options comparable.
 *
 * ── ROUND 50's TWO FALSE ZEROS ARE PRE-EMPTED, NOT TRUSTED ────────────────
 * 1. THE COLLECTION is `page_builder_pages`, not mongoose's default
 *    `pagebuilders`. `requireCollection` DIES on a missing name, because "no
 *    documents" and "no collection" print the same zero.
 * 2. THE VERSION PATH is `snapshot.sections`, not `content.sections`. A
 *    non-empty `page_versions` yielding zero sections is a hard failure here.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * A walker that never descends prints zero customs and looks clean. So the
 * walk also counts TOTAL sections and total nested children; a corpus with
 * sections but zero visited nodes dies.
 *
 * READ-ONLY. One find() per collection. No updateOne, no bulkWrite, no $set.
 *
 * Run:
 *   node --env-file=.env.local scripts/_audit-round75-dark-corpus.mjs
 */
import mongoose from 'mongoose';

function die(msg) { console.error('X ' + msg); process.exit(1); }

const uri = process.env.MONGODB_URI;
if (!uri) die('MONGODB_URI missing — run with --env-file=.env.local');

await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
const db = mongoose.connection.db;

async function requireCollection(name) {
  const found = await db.listCollections({ name }).toArray();
  if (!found.length) die(`collection "${name}" does not exist — a zero from it would be a false zero`);
  return db.collection(name);
}

const pagesCol = await requireCollection('page_builder_pages');
const versCol = await requireCollection('page_versions');

const CHILD_KEYS = ['children', 'left', 'right', 'items', 'cards', 'tabs', 'columns', 'sections'];

const acc = {
  pages: 0, published: 0,
  sectionsVisited: 0, nestedVisited: 0,
  customBg: 0, customAccent: 0,
  presetBgNonDefault: 0, presetAccent: 0,
  bgHistogram: {}, accentHistogram: {}, cardStyleHistogram: {},
  themeHistogram: {},
  pagesWithAnyCustom: 0, pagesAllCustomBg: 0, pagesWithAnyPresetBg: 0,
  gradientCustoms: 0, flatCustoms: 0,
};

function walk(nodes, depth, perPage) {
  if (!Array.isArray(nodes)) return;
  for (const s of nodes) {
    if (!s || typeof s !== 'object') continue;
    acc.sectionsVisited += 1;
    if (depth > 0) acc.nestedVisited += 1;
    const st = s.settings ?? {};
    const sy = s.style ?? {};
    if (st.backgroundMode === 'custom') {
      acc.customBg += 1; perPage.custom += 1;
      if (st.backgroundCustom?.to) acc.gradientCustoms += 1; else acc.flatCustoms += 1;
    } else if (st.background && st.background !== 'default') {
      acc.presetBgNonDefault += 1; perPage.presetBg += 1;
    }
    if (st.background) acc.bgHistogram[st.background] = (acc.bgHistogram[st.background] ?? 0) + 1;
    if (sy.accentMode === 'custom') { acc.customAccent += 1; perPage.custom += 1; }
    else if (sy.accentColor) { acc.presetAccent += 1; acc.accentHistogram[sy.accentColor] = (acc.accentHistogram[sy.accentColor] ?? 0) + 1; }
    if (sy.cardStyle) acc.cardStyleHistogram[sy.cardStyle] = (acc.cardStyleHistogram[sy.cardStyle] ?? 0) + 1;
    const c = s.content ?? {};
    for (const k of CHILD_KEYS) {
      if (Array.isArray(c[k])) walk(c[k], depth + 1, perPage);
      else if (Array.isArray(c[k]?.children)) walk(c[k].children, depth + 1, perPage);
    }
    if (Array.isArray(c.tabs)) for (const t of c.tabs) if (Array.isArray(t?.children)) walk(t.children, depth + 1, perPage);
  }
}

const pages = await pagesCol.find({}).toArray();
const perPageRows = [];
for (const p of pages) {
  acc.pages += 1;
  if (p.status === 'published') acc.published += 1;
  const theme = p.theme || 'default';
  acc.themeHistogram[theme] = (acc.themeHistogram[theme] ?? 0) + 1;
  const perPage = { custom: 0, presetBg: 0 };
  walk(p.sections, 0, perPage);
  if (perPage.custom > 0) acc.pagesWithAnyCustom += 1;
  if (perPage.presetBg > 0) acc.pagesWithAnyPresetBg += 1;
  if (perPage.custom > 0 && perPage.presetBg === 0) acc.pagesAllCustomBg += 1;
  perPageRows.push({ slug: p.slug, status: p.status, theme, custom: perPage.custom, presetBg: perPage.presetBg,
    sections: Array.isArray(p.sections) ? p.sections.length : 0 });
}

// Versions: same walk, so a snapshot-only custom colour is not a false zero.
const versions = await versCol.find({}).toArray();
let versionSections = 0;
const vAcc = { custom: 0 };
for (const v of versions) {
  const snap = v.snapshot?.sections;
  if (Array.isArray(snap)) {
    versionSections += snap.length;
    const per = { custom: 0, presetBg: 0 };
    walk(snap, 0, per);
    vAcc.custom += per.custom;
  }
}
if (versions.length > 0 && versionSections === 0) die('page_versions non-empty but snapshot.sections yielded zero — the false-zero path');

if (acc.pages > 0 && acc.sectionsVisited === 0) die('pages exist but the walker visited zero sections — walker is broken');

console.log(JSON.stringify({
  '-- CORPUS --': '',
  pages: acc.pages, published: acc.published,
  versions: versions.length, versionTopLevelSections: versionSections,
  sectionsVisited: acc.sectionsVisited, ofWhichNested: acc.nestedVisited,
  '-- COLOUR AUTHORITY --': '',
  customBackgroundSections: acc.customBg,
  ofWhichGradient: acc.gradientCustoms, ofWhichFlat: acc.flatCustoms,
  customAccentSections: acc.customAccent,
  presetNonDefaultBackgroundSections: acc.presetBgNonDefault,
  presetAccentSections: acc.presetAccent,
  customInVersionSnapshotsToo: vAcc.custom,
  '-- PER PAGE --': '',
  pagesWithAnyCustomColour: acc.pagesWithAnyCustom,
  pagesWithAnyPresetBackground: acc.pagesWithAnyPresetBg,
  pagesEntirelyCustomBackgrounds: acc.pagesAllCustomBg,
  '-- HISTOGRAMS --': '',
  theme: acc.themeHistogram,
  background: acc.bgHistogram,
  accentColor: acc.accentHistogram,
  cardStyle: acc.cardStyleHistogram,
  '-- PAGES --': '',
  rows: perPageRows,
}, null, 2));

await mongoose.disconnect();
