/**
 * ROUND 70 §J — WHICH STORED CARDS CHANGE ON DEPLOY, AND HOW?
 *
 * Round 70 is deliberately NOT a byte-identical round: a card inside a grid is
 * SUPPOSED to grow to its row's height, and `icon_card` is supposed to centre
 * and draw bigger art. §J's requirement is therefore the honest one — every
 * card whose appearance moves must be REPORTED here rather than discovered on
 * the site. So this counts what is stored, splits it by whether it sits in a
 * track-sharing parent, and diffs the pre- and post-change markup shape by
 * shape.
 *
 * ── ROUND 50's TWO FALSE ZEROS ARE PRE-EMPTED, NOT TRUSTED ────────────────
 * 1. THE COLLECTION NAME is `page_builder_pages`, not mongoose's default
 *    `pagebuilders`; every read goes through `requireCollection`, which DIES on
 *    a missing name because "no documents" and "no collection" print the same
 *    number.
 * 2. THE VERSION PATH is `snapshot.sections`, not `content.sections`; a
 *    non-empty `page_versions` yielding zero sections is a hard failure.
 * 3. A TYPE HISTOGRAM beyond both: a walk that resolved nothing reports zero of
 *    everything, a walk that works reports a spread.
 *
 * ── THE PARENT MATTERS, SO THE WALK CARRIES IT ────────────────────────────
 * `h-full` on a card surface is INERT unless an ancestor has a definite height,
 * and round 70 gives one only to a child of `card_grid` / `highlight_grid`. So
 * every card is tagged with its parent type: cards under one of those two can
 * change height, cards anywhere else cannot, and the counts are reported apart.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * Markup equality is compared both ways: shapes that must be identical
 * (`price_card`, whose class list did not move) and shapes that must differ
 * (`icon_card`, `stat_card`, `instructor_card`, which each gained classes). A
 * run reporting zero differences everywhere would mean the comparison never
 * ran, and it says so.
 *
 * READ-ONLY. One find() per collection, a walk, one temp tree removed in a
 * finally. No updateOne, no bulkWrite, no $set in this file.
 *
 * Run:
 *   node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round70-stored-cards.mjs
 *   BASE_REF=<sha> … (defaults to HEAD)
 */
import { writeFileSync, rmSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import mongoose from 'mongoose';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = process.cwd();
const BASE_REF = process.env.BASE_REF ?? 'HEAD';
const SHADOW = path.join(ROOT, 'src/components/_round70_stored');
const TRACKED = ['icon_card', 'price_card', 'stat_card', 'instructor_card']
  .map((t) => `src/components/pageBuilder/sections/${t}.jsx`);

function die(msg) { console.error('X ' + msg); process.exit(1); }

const SLOTS = ['children', 'left', 'right'];
const TRACK_PARENTS = new Set(['card_grid', 'highlight_grid']);
const CARD_TYPES = ['icon_card', 'price_card', 'stat_card', 'instructor_card'];

function walk(sections, out, parentType = null, depth = 0) {
  if (!Array.isArray(sections) || depth > 12) return out;
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    out.walked += 1;
    out.types[s.type] = (out.types[s.type] ?? 0) + 1;
    if (CARD_TYPES.includes(s.type)) out.cards.push({ section: s, parentType });
    for (const slot of SLOTS) walk(s?.content?.[slot], out, s.type, depth + 1);
  }
  return out;
}

async function requireCollection(db, name) {
  const found = await db.listCollections({ name }).toArray();
  if (!found.length) die(`collection "${name}" does not exist — a zero from it would be a lie`);
  return db.collection(name);
}

const bucket = () => ({ walked: 0, types: {}, cards: [] });

const report = { baseRef: BASE_REF };
try {
  rmSync(SHADOW, { recursive: true, force: true });
  mkdirSync(SHADOW, { recursive: true });
  cpSync(path.join(ROOT, 'src/components/pageBuilder'), path.join(SHADOW, 'pageBuilder'), { recursive: true });
  for (const rel of TRACKED) {
    writeFileSync(path.join(SHADOW, rel.replace('src/components/', '')),
      execFileSync('git', ['show', `${BASE_REF}:${rel}`], { encoding: 'utf8' }), 'utf8');
  }

  const now = {
    icon_card: (await import('@/components/pageBuilder/sections/icon_card')).IconCardSection,
    price_card: (await import('@/components/pageBuilder/sections/price_card')).PriceCardSection,
    stat_card: (await import('@/components/pageBuilder/sections/stat_card')).StatCardSection,
    instructor_card: (await import('@/components/pageBuilder/sections/instructor_card')).InstructorCardSection,
  };
  const then = {
    icon_card: (await import('@/components/_round70_stored/pageBuilder/sections/icon_card')).IconCardSection,
    price_card: (await import('@/components/_round70_stored/pageBuilder/sections/price_card')).PriceCardSection,
    stat_card: (await import('@/components/_round70_stored/pageBuilder/sections/stat_card')).StatCardSection,
    instructor_card: (await import('@/components/_round70_stored/pageBuilder/sections/instructor_card')).InstructorCardSection,
  };

  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  const pages = await (await requireCollection(db, 'page_builder_pages'))
    .find({}, { projection: { slug: 1, sections: 1, draft: 1 } }).toArray();
  const versions = await (await requireCollection(db, 'page_versions'))
    .find({}, { projection: { snapshot: 1 } }).toArray();

  const live = bucket(); const draft = bucket(); const versioned = bucket();
  for (const d of pages) { walk(d.sections, live); walk(d?.draft?.sections, draft); }
  for (const v of versions) walk(v?.snapshot?.sections, versioned);
  if (versions.length > 0 && versioned.walked === 0) {
    die('page_versions holds documents but the walk found no sections — the snapshot path is wrong again');
  }

  const all = [...live.cards, ...draft.cards, ...versioned.cards];
  const merged = {};
  for (const b of [live, draft, versioned]) {
    for (const [t, n] of Object.entries(b.types)) merged[t] = (merged[t] ?? 0) + n;
  }
  const spread = Object.entries(merged);

  report['-- THE WALK, AND ITS FALSE-ZERO CONTROLS --'] = '';
  report.database = mongoose.connection.name ?? '(default)';
  report.pagesScanned = pages.length;
  report.versionsScanned = versions.length;
  report.sectionsWalked = `${live.walked} live / ${draft.walked} draft / ${versioned.walked} versions`;
  report.CONTROL_distinctTypesSeen = spread.length;
  report.CONTROL_typeHistogram = Object.fromEntries(spread.sort((a, b) => b[1] - a[1]));
  report.walkResolvedNothing = spread.length === 0;

  report['-- STORED COUNTS, RE-MEASURED --'] = '';
  for (const t of CARD_TYPES) {
    const rows = all.filter((r) => r.section.type === t);
    const inTrack = rows.filter((r) => TRACK_PARENTS.has(r.parentType));
    report[t] = {
      stored: rows.length,
      byBucket: `${live.cards.filter((r) => r.section.type === t).length} live / `
        + `${draft.cards.filter((r) => r.section.type === t).length} draft / `
        + `${versioned.cards.filter((r) => r.section.type === t).length} versions`,
      inCardGridOrHighlightGrid: inTrack.length,
      elsewhere: rows.length - inTrack.length,
      parents: [...new Set(rows.map((r) => r.parentType ?? '(top level)'))],
    };
  }

  // ── markup diff, per stored shape plus a synthetic floor ────────────────
  const SYNTH = {
    icon_card: [{ icon: 'Rocket', title: 'ก', description: 'ข' }, { imageSrc: 'https://res.cloudinary.com/x/a.png', title: 'ก' }],
    price_card: [{ title: 'ก', price: '฿1', features: ['ข'] }],
    stat_card: [{ value: '10', label: 'ก', icon: 'Rocket' }],
    instructor_card: [{}],
  };
  const DATA = { name: 'ก', title: 'ข', bio: 'ค', image_url: '', specialties: [] };
  const render = (C, section) => {
    try {
      return renderToStaticMarkup(C({
        content: section.content ?? {}, style: section.style ?? {},
        data: section.type === 'instructor_card' ? DATA : undefined,
      }));
    } catch (e) { return 'THREW: ' + e.message; }
  };

  report['-- MARKUP: BEFORE vs AFTER, PER TYPE --'] = '';
  for (const t of CARD_TYPES) {
    const shapes = [
      ...all.filter((r) => r.section.type === t).map((r) => r.section),
      ...SYNTH[t].map((content) => ({ type: t, content, style: {} })),
    ];
    let differing = 0;
    let sampleThen = null; let sampleNow = null;
    for (const s of shapes) {
      const a = render(then[t], s); const b = render(now[t], s);
      if (a !== b) { differing += 1; if (!sampleThen) { sampleThen = a.slice(0, 200); sampleNow = b.slice(0, 200); } }
    }
    report[`${t}_markup`] = {
      shapesCompared: shapes.length,
      differing,
      verdict: differing === 0 ? 'BYTE-IDENTICAL' : 'CHANGED',
      sampleThen, sampleNow,
    };
  }

  report['-- CONTROL: the comparison can go both ways --'] = '';
  report.identicalTypes = CARD_TYPES.filter((t) => report[`${t}_markup`].differing === 0);
  report.changedTypes = CARD_TYPES.filter((t) => report[`${t}_markup`].differing > 0);
  report.controlDiscriminates = report.identicalTypes.length > 0 && report.changedTypes.length > 0;
} finally {
  if (existsSync(SHADOW)) rmSync(SHADOW, { recursive: true, force: true });
  await mongoose.disconnect().catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
