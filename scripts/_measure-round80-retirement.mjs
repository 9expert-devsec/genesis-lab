/**
 * ROUND 80 §J/§K — every stored `highlight_grid`, counted and rendered
 * byte-for-byte against the pre-change component.
 *
 * The claim a retirement rests on: stored pages render EXACTLY as they did.
 * Round 80 touched a schema file, the picker and two test files — none of them
 * the renderer — so the expected answer is zero differing. That is precisely
 * why it has to be measured rather than argued: "I did not touch the renderer"
 * is the kind of statement that is true right up until an import moved.
 *
 * ── ROUND 50's TWO FALSE ZEROS ARE PRE-EMPTED, NOT TRUSTED ────────────────
 * The collection is `page_builder_pages`, not mongoose's default
 * `pagebuilders`, and the version path is `snapshot.sections`, not
 * `content.sections`. Both are required to exist; a missing one DIES rather
 * than printing a clean zero. Live pages and version snapshots are counted
 * SEPARATELY, because a single summed histogram is what made round 75's 233
 * look nothing like the 63 that are actually live.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * "Zero differing" is also what a comparison that never ran prints. So:
 *   1. the run DIES if it found no stored `highlight_grid` at all;
 *   2. it renders each shape a SECOND time with one setting changed, and every
 *      one of those must DIFFER — proving the comparison can see a difference.
 *
 * The pre-change component is read out of git (`BASE_REF`, default HEAD) into a
 * shadow tree, so both columns come from one harness rather than two runs.
 *
 * Nothing is written into public/.
 *
 * Run:
 *   node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round80-retirement.mjs
 */
import { writeFileSync, rmSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASE_REF = process.env.BASE_REF ?? 'HEAD';
const SHADOW = path.join(ROOT, 'src/components/_round80_baseline');
function die(m) { console.error('X ' + m); process.exit(1); }

// ── the corpus ────────────────────────────────────────────────────────────
const uri = process.env.MONGODB_URI;
if (!uri) die('MONGODB_URI missing — run with --env-file=.env.local');
await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
const db = mongoose.connection.db;
for (const name of ['page_builder_pages', 'page_versions']) {
  if (!(await db.listCollections({ name }).toArray()).length) {
    die(`collection "${name}" does not exist — a zero from it would be a false zero`);
  }
}
const pages = await db.collection('page_builder_pages').find({}).toArray();
const versions = await db.collection('page_versions').find({}).toArray();
await mongoose.disconnect();

const CHILD_KEYS = ['children', 'left', 'right', 'items', 'cards', 'tabs', 'columns', 'sections'];
const found = { live: [], snapshot: [] };
let visited = 0;
function walk(nodes, depth, bucket, where) {
  if (!Array.isArray(nodes)) return;
  for (const s of nodes) {
    if (!s || typeof s !== 'object') continue;
    visited += 1;
    if (s.type === 'highlight_grid') found[bucket].push({ where, depth, section: s });
    const c = s.content ?? {};
    for (const k of CHILD_KEYS) if (Array.isArray(c[k])) walk(c[k], depth + 1, bucket, where);
    if (Array.isArray(c.tabs)) for (const t of c.tabs) if (Array.isArray(t?.children)) walk(t.children, depth + 1, bucket, where);
  }
}
for (const p of pages) walk(p.sections, 0, 'live', `${p.slug}(${p.status})`);
let snapTop = 0;
for (const v of versions) {
  const s = v.snapshot?.sections;
  if (Array.isArray(s)) { snapTop += s.length; walk(s, 0, 'snapshot', `version:${v._id}`); }
}
if (versions.length > 0 && snapTop === 0) die('page_versions non-empty but snapshot.sections yielded zero — the false-zero path');
if (pages.length > 0 && visited === 0) die('pages exist but the walker visited zero sections');

const shapes = [...found.live, ...found.snapshot];
// CONTROL 1 — nothing to compare means nothing is proved.
if (shapes.length === 0) die('no stored highlight_grid found — there is nothing for this measurement to be about');

// ── render both sides ─────────────────────────────────────────────────────
let Before;
try {
  rmSync(SHADOW, { recursive: true, force: true });
  mkdirSync(path.dirname(SHADOW), { recursive: true });
  cpSync(path.join(ROOT, 'src/components/pageBuilder'), path.join(SHADOW, 'pageBuilder'), { recursive: true });
  for (const rel of [
    'src/components/pageBuilder/SectionRenderer.jsx',
    'src/components/pageBuilder/sections/highlight_grid.jsx',
  ]) {
    writeFileSync(
      path.join(SHADOW, rel.replace('src/components/', '')),
      execFileSync('git', ['show', `${BASE_REF}:${rel}`], { encoding: 'utf8', cwd: ROOT }),
      'utf8',
    );
  }
  ({ SectionRenderer: Before } = await import('@/components/_round80_baseline/pageBuilder/SectionRenderer'));
  const { SectionRenderer: After } = await import('@/components/pageBuilder/SectionRenderer');

  const render = (C, section) => renderToStaticMarkup(
    createElement(C, { section, depth: 0, resolvedData: {} }));

  const rows = [];
  let differing = 0;
  for (const [i, s] of shapes.entries()) {
    const before = render(Before, s.section);
    const after = render(After, s.section);
    const same = before === after;
    if (!same) differing += 1;
    rows.push({ i, where: s.where, depth: s.depth, bytes: after.length, identical: same });
  }

  // CONTROL 2 — the comparison must be able to SEE a difference.
  let perturbedDiffering = 0;
  for (const s of shapes) {
    const perturbed = { ...s.section, layout: { ...(s.section.layout ?? {}), columns: 4 },
      settings: { ...(s.section.settings ?? {}), spacingTop: 'xl' } };
    if (render(Before, s.section) !== render(After, perturbed)) perturbedDiffering += 1;
  }

  const out = {
    database: (uri.match(/@([^/]+)\//) || [])[1] + ' / ' + process.env.MONGODB_DB_NAME,
    baseRef: BASE_REF,
    corpus: { pages: pages.length, versions: versions.length, sectionsWalked: visited },
    storedHighlightGrid: {
      live: found.live.length,
      snapshot: found.snapshot.length,
      total: shapes.length,
      liveLocations: found.live.map((f) => `${f.where} @depth ${f.depth}`),
    },
    BYTE_IDENTICAL: differing === 0,
    shapesCompared: shapes.length,
    differing,
    control_perturbedShapesThatDiffer: perturbedDiffering,
    rows,
  };
  if (perturbedDiffering !== shapes.length) {
    die(`the control perturbed ${shapes.length} shapes but only ${perturbedDiffering} differed — the comparison cannot reliably see a change, so the zero above means nothing`);
  }
  console.log(JSON.stringify(out, null, 2));
} finally {
  if (existsSync(SHADOW)) rmSync(SHADOW, { recursive: true, force: true });
}
