/**
 * ROUND 69 §H — is every STORED `icon_card` byte-identical after `imageSrc`?
 *
 * The commit adds a branch to a component the published site renders through,
 * and §H's claim is that absent `imageSrc` falls through to the unchanged icon
 * branch. "The guard is `.trim()`, so it must" is an argument; this is the
 * measurement. The pre-change file is read out of git, written beside the
 * current one so its `@/…` imports resolve to the same modules, and BOTH are
 * rendered over the same corpus. Every pair must match byte for byte.
 *
 * ── THE CORPUS IS THE DATABASE, NOT A GUESS ───────────────────────────────
 * Every `icon_card` stored anywhere the render path can reach it — live
 * `sections`, `draft.sections`, and `page_versions.snapshot.sections` — plus a
 * synthetic block covering the shapes the database may not happen to hold
 * (absent key, empty string, whitespace, null, unknown icon, every cardStyle).
 *
 * ── ROUND 50's TWO FALSE ZEROS ARE PRE-EMPTED, NOT TRUSTED ────────────────
 * 1. THE COLLECTION NAME. Round 50 queried `pagebuilders` — mongoose's default
 *    pluralisation — and read a confident ZERO out of a collection that does
 *    not exist. Every read here goes through `requireCollection`, which DIES on
 *    a missing name, because "no documents" and "no collection" print the same
 *    number and only one of them means anything. The real name is
 *    `page_builder_pages`.
 * 2. THE VERSION PATH. It then read snapshots at `content.sections` and got a
 *    second zero; they live at `snapshot.sections`. A non-empty `page_versions`
 *    that yields zero sections is a hard failure below, not a clean run.
 * 3. A TYPE HISTOGRAM, beyond both: a walk that resolved nothing reports zero
 *    of every type; a walk that works reports a spread.
 *
 * ── THE CONTROL, WHICH IS THE POINT ───────────────────────────────────────
 * "0 differing" and "the comparison never ran" print the same number. So the
 * same corpus is rendered a second time with `imageSrc` SET, and those pairs
 * must ALL differ. A run where both columns report zero is a broken harness,
 * and it says so.
 *
 * READ-ONLY. One find() per collection, a walk, one temp file under src/
 * removed in a finally. No updateOne, no bulkWrite, no $set in this file.
 *
 * Run:
 *   node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round69-icon-card-image.mjs
 *   BASE_REF=<sha> … (defaults to HEAD)
 */
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import mongoose from 'mongoose';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = process.cwd();
const BASE_REF = process.env.BASE_REF ?? 'HEAD';
const TARGET = 'src/components/pageBuilder/sections/icon_card.jsx';
const BASELINE = path.join(ROOT, 'src/components/pageBuilder/sections/_baseline_icon_card.jsx');

function die(msg) { console.error('X ' + msg); process.exit(1); }

/** Every slot a container nests children in (lib/pageBuilder/containerSlots). */
const SLOTS = ['children', 'left', 'right'];

function walk(sections, out, depth = 0) {
  if (!Array.isArray(sections) || depth > 12) return out;
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    out.walked += 1;
    out.types[s.type] = (out.types[s.type] ?? 0) + 1;
    if (s.type === 'icon_card') out.icon.push(s);
    if (s.type === 'stat_card') out.stat.push(s);
    if (s.type === 'instructor_card') out.instructor.push(s);
    for (const slot of SLOTS) walk(s?.content?.[slot], out, depth + 1);
  }
  return out;
}

async function requireCollection(db, name) {
  const found = await db.listCollections({ name }).toArray();
  if (!found.length) die(`collection "${name}" does not exist — a zero from it would be a lie`);
  return db.collection(name);
}

const bucket = () => ({ walked: 0, types: {}, icon: [], stat: [], instructor: [] });

// ── the synthetic corpus: shapes the database may not hold ─────────────────
// Every value of CARD_STYLES (base.js), plus absent, empty and unknown.
const STYLES = [undefined, {}, { cardStyle: 'plain' }, { cardStyle: 'border' },
  { cardStyle: 'shadow' }, { cardStyle: 'filled' }, { cardStyle: 'gradient' },
  { cardStyle: 'promo' }, { cardStyle: 'nope' }];
const CONTENTS = [
  {},
  { icon: 'Rocket' },
  { icon: 'Rocket', title: 'ก', description: 'ข' },
  { icon: '', title: 'ก' },
  { icon: '   ', title: 'ก' },
  { icon: 'NotAnIcon', title: 'ก' },
  { title: 'ก' },
  { description: 'ข' },
  { icon: 'Rocket', title: '', description: '' },
  { icon: 'Rocket', title: 'ก', description: 'ข', imageSrc: undefined },
  { icon: 'Rocket', title: 'ก', description: 'ข', imageSrc: '' },
  { icon: 'Rocket', title: 'ก', description: 'ข', imageSrc: '   ' },
  { icon: 'Rocket', title: 'ก', description: 'ข', imageSrc: null },
];
const SYNTHETIC = [];
for (const style of STYLES) for (const content of CONTENTS) SYNTHETIC.push({ content, style });

const report = { baseRef: BASE_REF };
try {
  writeFileSync(BASELINE, execFileSync('git', ['show', `${BASE_REF}:${TARGET}`], { encoding: 'utf8' }), 'utf8');

  const { IconCardSection: Now } = await import('@/components/pageBuilder/sections/icon_card');
  const { IconCardSection: Then } = await import('@/components/pageBuilder/sections/_baseline_icon_card');

  // ── the database half ────────────────────────────────────────────────────
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

  const storedIconCards = [...live.icon, ...draft.icon, ...versioned.icon];
  const spread = Object.entries({ ...live.types, ...draft.types, ...versioned.types });

  report['-- THE WALK, AND ITS THREE FALSE-ZERO CONTROLS --'] = '';
  report.database = mongoose.connection.name ?? '(default)';
  report.pagesScanned = pages.length;
  report.versionsScanned = versions.length;
  report.sectionsWalked = `${live.walked} live / ${draft.walked} draft / ${versioned.walked} versions`;
  report.CONTROL_distinctTypesSeen = spread.length;
  report.CONTROL_typeHistogram = Object.fromEntries(spread.sort((a, b) => b[1] - a[1]));
  report.walkResolvedNothing = spread.length === 0;

  report['-- SS-H COUNTS, RE-MEASURED (round 58 SS-E said 0 icon_card / 4 stat_card) --'] = '';
  report.stored_icon_card = storedIconCards.length;
  report.stored_stat_card = [...live.stat, ...draft.stat, ...versioned.stat].length;
  report.stored_instructor_card = [...live.instructor, ...draft.instructor, ...versioned.instructor].length;
  report.stored_icon_card_carrying_imageSrc =
    storedIconCards.filter((s) => Object.hasOwn(s.content ?? {}, 'imageSrc')).length;

  // ── the comparison ───────────────────────────────────────────────────────
  const corpus = [
    ...storedIconCards.map((s, i) => ({ label: `stored#${i}`, content: s.content ?? {}, style: s.style })),
    ...SYNTHETIC.map((c, i) => ({ label: `synthetic#${i}`, ...c })),
  ];

  const render = (C, props) => {
    try { return renderToStaticMarkup(C(props)); } catch (e) { return 'THREW: ' + e.message; }
  };

  const differing = [];
  for (const row of corpus) {
    const props = { content: row.content, style: row.style };
    const a = render(Then, props);
    const b = render(Now, props);
    if (a !== b) differing.push({ label: row.label, then: a.slice(0, 220), now: b.slice(0, 220) });
  }

  // CONTROL: the same corpus with imageSrc SET must differ on every row. A row
  // whose baseline is '' still differs, because the new guard makes an
  // image-only card render where the old one returned null.
  const controlDiffs = [];
  const controlSame = [];
  for (const row of corpus) {
    const content = { ...row.content, imageSrc: 'https://res.cloudinary.com/x/image/upload/v1/a.png' };
    const props = { content, style: row.style };
    (render(Then, props) !== render(Now, props) ? controlDiffs : controlSame).push(row.label);
  }

  report['-- THE ANSWER --'] = '';
  report.corpusSize = corpus.length;
  report.storedShapesCompared = storedIconCards.length;
  report.syntheticShapesCompared = SYNTHETIC.length;
  report.DIFFERING = differing.length;
  if (differing.length) report.differingDetail = differing.slice(0, 5);

  report['-- CONTROL: the comparison CAN report a difference --'] = '';
  report.withImageSrcSet_differing = controlDiffs.length;
  report.withImageSrcSet_identical = controlSame.length;
  report.controlDiscriminates = controlDiffs.length === corpus.length;

  report['-- SAMPLE MARKUP --'] = '';
  report.iconBranch = render(Now, { content: { icon: 'Rocket', title: 'ก' }, style: {} });
  report.imageBranch = render(Now, {
    content: { icon: 'Rocket', title: 'ก', imageSrc: 'https://res.cloudinary.com/x/image/upload/v1/a.png' },
    style: {},
  });
} finally {
  rmSync(BASELINE, { force: true });
  await mongoose.disconnect().catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
