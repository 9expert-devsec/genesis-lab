/**
 * ROUND 59 §H/§K — every REAL stored price_card, rendered against the
 * pre-change component, classified.
 *
 * Rounds 50/57's method: pull the baseline out of git into a temp file beside
 * the current one (so its aliased imports resolve to the same modules), render
 * both over the same shapes, and count. The shapes are not invented — they are
 * read out of the database, so "stored" means stored.
 *
 * ── THE CLASSIFICATION, WHICH IS THE POINT FOR COMMITS 1 AND 2 ────────────
 * Round 58 §D's byte-identity claim is about shapes the change is NOT meant to
 * touch. Commits 1 and 2 deliberately change how a ribbon and a footnote look,
 * so a stored card carrying one MUST differ. Reporting a single "differing"
 * count would therefore be unreadable. Each stored shape is classified:
 *
 *   UNCHANGED  — identical, and required to be
 *   EXPECTED   — differs, and carries the field this commit changes
 *   UNEXPECTED — differs without carrying it. This is the number that must be 0.
 *
 * ── THE CONTROL ──────────────────────────────────────────────────────────
 * "0 unexpected" and "the comparison never ran" print the same number. So a
 * fixture set that MUST differ is rendered too, and `controlDiscriminates` is
 * true only when those all differ. Per round 41: that flag is meaningless
 * unless the unexpected count is 0, so it is reported next to it and the
 * summary says so in words.
 *
 * ── ROUND 50'S TWO FALSE ZEROS ───────────────────────────────────────────
 * 1. COLLECTION NAME — `pagebuilders` does not exist; the real name is
 *    `page_builder_pages`. Every read goes through requireCollection, which
 *    EXITS non-zero on a missing name rather than returning an empty cursor.
 * 2. VERSION PATH — snapshots live at `snapshot.sections`, not
 *    `content.sections`. A non-empty page_versions that walks to zero sections
 *    fails the run.
 * Plus the third control: a TYPE HISTOGRAM, so "no card carries a ribbon" is
 * distinguishable from "the walk never resolved a section".
 *
 * READ-ONLY apart from one temp file under src/, removed in a finally.
 *
 * Run:
 *   FIELD=ribbon node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round59-price-card.mjs
 *   FIELD=footnote  BASE_REF=<sha>  ... (commit 2)
 *   FIELD=none      BASE_REF=<sha>  ... (commit 3: nothing may differ at all)
 */
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import mongoose from 'mongoose';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = process.cwd();
const TARGET = 'src/components/pageBuilder/sections/price_card.jsx';
const BASE_REF = process.env.BASE_REF ?? 'HEAD';
const BASELINE = path.join(ROOT, 'src/components/pageBuilder/sections/_baseline_price_card.jsx');
/** The content key this commit is allowed to change the look of. */
const FIELD = process.env.FIELD ?? 'none';

const die = (m) => { console.error('✖ ' + m); process.exit(1); };
const SLOTS = ['children', 'left', 'right'];

async function requireCollection(db, name) {
  const found = await db.listCollections({ name }).toArray();
  if (!found.length) die(`collection "${name}" does not exist — a zero from it would be a lie`);
  return db.collection(name);
}

function walk(sections, where, out, depth = 0) {
  if (!Array.isArray(sections) || depth > 12) return;
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    out.walked += 1;
    out.types[s.type] = (out.types[s.type] ?? 0) + 1;
    if (s.type === 'price_card') {
      out.cards.push({ where: `${where}#${out.cards.length}`, content: s.content ?? {}, style: s.style ?? undefined });
    }
    for (const slot of SLOTS) walk(s?.content?.[slot], where, out, depth + 1);
  }
}

async function readStoredCards() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;
  const out = { walked: 0, types: {}, cards: [] };

  const pages = await (await requireCollection(db, 'page_builder_pages')).find({}).toArray();
  const versions = await (await requireCollection(db, 'page_versions')).find({}).toArray();
  for (const d of pages) {
    walk(d.sections, `live:${d.slug}`, out);
    walk(d?.draft?.sections, `draft:${d.slug}`, out);
  }
  const before = out.walked;
  for (const v of versions) walk(v?.snapshot?.sections, `v${v.versionNumber}:${v.pageId}`, out);
  if (versions.length > 0 && out.walked === before) {
    die(`page_versions has ${versions.length} docs but the walk found 0 sections — wrong path, not a real zero`);
  }
  await mongoose.disconnect();
  return out;
}

/** Fixtures that MUST differ — the control. Keyed by the field under test. */
const CONTROL = {
  ribbon: {
    'short ribbon': { title: 'x', price: '1', ribbon: '20%' },
    'long ribbon':  { title: 'x', price: '1', ribbon: 'Early Bird ลด 20% วันนี้เท่านั้น' },
  },
  footnote: {
    'footnote alone':          { title: 'x', price: '1', footnote: '* ยังไม่รวม VAT 7%' },
    'footnote above features': { title: 'x', price: '1', footnote: '* ยังไม่รวม VAT 7%', features: ['ก', 'ข'] },
  },
  none: {
    'cardStyle promo': { content: { title: 'x', price: '1' }, style: { cardStyle: 'promo' } },
  },
};

const stored = await readStoredCards();
writeFileSync(BASELINE, execFileSync('git', ['show', `${BASE_REF}:${TARGET}`], { encoding: 'utf8' }), 'utf8');

const report = { baseRef: BASE_REF, fieldUnderTest: FIELD };
try {
  const { PriceCardSection: Now } = await import('@/components/pageBuilder/sections/price_card');
  const { PriceCardSection: Then } = await import('@/components/pageBuilder/sections/_baseline_price_card');
  const draw = (C, content, style) => renderToStaticMarkup(C({ content, style }));

  report['── THE WALK, AND ITS THREE CONTROLS ──'] = '';
  report.sectionsWalked = stored.walked;
  report.typeHistogram = stored.types;
  report.storedPriceCards = stored.cards.length;
  report.storedCardStyles = stored.cards.map((c) => (c.style?.cardStyle === undefined
    ? '<absent>' : String(c.style.cardStyle)));
  report.storedCarryingField = FIELD === 'none' ? []
    : stored.cards.filter((c) => String(c.content?.[FIELD] ?? '').trim()).map((c) => c.where);

  const unchanged = []; const expected = []; const unexpected = [];
  const rows = {};
  for (const c of stored.cards) {
    const a = draw(Then, c.content, c.style);
    const b = draw(Now, c.content, c.style);
    const carries = FIELD !== 'none' && String(c.content?.[FIELD] ?? '').trim() !== '';
    const same = a === b;
    rows[c.where] = { bytesBefore: Buffer.byteLength(a, 'utf8'), bytesAfter: Buffer.byteLength(b, 'utf8'),
                      identical: same, carriesField: carries };
    if (same) unchanged.push(c.where);
    else if (carries) expected.push(c.where);
    else unexpected.push(c.where);
  }

  report['── EVERY STORED SHAPE, CLASSIFIED ──'] = '';
  report.perStored = rows;
  report.UNCHANGED = unchanged.length;
  report.EXPECTED_DIFFERING = expected;
  report.UNEXPECTED_DIFFERING = unexpected;

  const controlRows = {}; const failedToDiffer = [];
  for (const [name, fixture] of Object.entries(CONTROL[FIELD] ?? {})) {
    const content = fixture.content ?? fixture;
    const style = fixture.style ?? undefined;
    const a = draw(Then, content, style);
    const b = draw(Now, content, style);
    controlRows[name] = { differs: a !== b, bytesBefore: Buffer.byteLength(a, 'utf8'),
                          bytesAfter: Buffer.byteLength(b, 'utf8') };
    if (a === b) failedToDiffer.push(name);
  }
  report['── CONTROL: the comparison CAN report a difference ──'] = '';
  report.controlFixtures = controlRows;
  report.controlFixturesThatFailedToDiffer = failedToDiffer;
  report.controlDiscriminates = failedToDiffer.length === 0;
  report.controlIsMeaningful = unexpected.length === 0
    ? 'yes — the unexpected count is 0, so the control flag carries information'
    : 'NO — unexpected differences exist, so controlDiscriminates says nothing (round 41)';
} finally {
  rmSync(BASELINE, { force: true });
}

console.log(JSON.stringify(report, null, 2));
