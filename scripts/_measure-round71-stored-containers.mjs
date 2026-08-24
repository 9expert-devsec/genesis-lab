/**
 * ROUND 71 §F — how many containers are stored, and does every one of them
 * render byte-identically?
 *
 * The claim is that `spacingBetween` is invisible until an author picks a
 * value: absent resolves to `gap-8`, the class that was hardcoded, so a page
 * nobody edits does not move. "The fallback is the same class" is an argument;
 * this is the measurement. The pre-change components are read out of git into a
 * shadow tree so their `@/…` imports resolve to the same modules, and BOTH are
 * rendered over every stored container shape.
 *
 * ── ROUND 50's TWO FALSE ZEROS ARE PRE-EMPTED, NOT TRUSTED ────────────────
 * 1. THE COLLECTION NAME is `page_builder_pages`, not mongoose's default
 *    `pagebuilders`. Every read goes through `requireCollection`, which DIES on
 *    a missing name, because "no documents" and "no collection" print the same
 *    number and only one of them means anything.
 * 2. THE VERSION PATH is `snapshot.sections`, not `content.sections`. A
 *    non-empty `page_versions` that yields zero sections is a hard failure
 *    below, not a clean run.
 * 3. A TYPE HISTOGRAM beyond both, SUMMED across the three buckets rather than
 *    spread-merged — round 70 found the spread form is last-writer-wins and
 *    silently disagreed with the totals beside it.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * Zero differences and a comparison that never ran print the same number. So
 * the same corpus is rendered a second time with `spacingBetween` SET to a
 * value that is not the incumbent, and every one of those must DIFFER.
 *
 * READ-ONLY. One find() per collection, a walk, one shadow tree removed in a
 * finally. No updateOne, no bulkWrite, no $set in this file.
 *
 * Run:
 *   node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round71-stored-containers.mjs
 *   BASE_REF=<sha> … (defaults to HEAD)
 */
import { writeFileSync, rmSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import mongoose from 'mongoose';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = process.cwd();
const BASE_REF = process.env.BASE_REF ?? 'HEAD';
const SHADOW = path.join(ROOT, 'src/components/_round71_baseline');
const TYPES = ['container', 'full_width'];
const TRACKED = TYPES.map((t) => `src/components/pageBuilder/sections/${t}.jsx`);

function die(msg) { console.error('X ' + msg); process.exit(1); }

const SLOTS = ['children', 'left', 'right'];

function walk(sections, out, depth = 0) {
  if (!Array.isArray(sections) || depth > 12) return out;
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    out.walked += 1;
    out.types[s.type] = (out.types[s.type] ?? 0) + 1;
    if (TYPES.includes(s.type)) out.boxes.push(s);
    for (const slot of SLOTS) walk(s?.content?.[slot], out, depth + 1);
  }
  return out;
}

async function requireCollection(db, name) {
  const found = await db.listCollections({ name }).toArray();
  if (!found.length) die(`collection "${name}" does not exist — a zero from it would be a lie`);
  return db.collection(name);
}

const bucket = () => ({ walked: 0, types: {}, boxes: [] });

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
    container: (await import('@/components/pageBuilder/sections/container')).ContainerSection,
    full_width: (await import('@/components/pageBuilder/sections/full_width')).FullWidthSection,
  };
  const then = {
    container: (await import('@/components/_round71_baseline/pageBuilder/sections/container')).ContainerSection,
    full_width: (await import('@/components/_round71_baseline/pageBuilder/sections/full_width')).FullWidthSection,
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

  report['-- STORED COUNTS --'] = '';
  const all = [...live.boxes, ...draft.boxes, ...versioned.boxes];
  for (const t of TYPES) {
    report[t] = {
      stored: all.filter((s) => s.type === t).length,
      byBucket: `${live.boxes.filter((s) => s.type === t).length} live / `
        + `${draft.boxes.filter((s) => s.type === t).length} draft / `
        + `${versioned.boxes.filter((s) => s.type === t).length} versions`,
      carryingTheNewKey: all.filter((s) => s.type === t
        && Object.hasOwn(s.settings ?? {}, 'spacingBetween')).length,
    };
  }

  // ── the comparison ───────────────────────────────────────────────────────
  // Two real children, so any wrapper-class change is the only thing that can
  // move the markup — which is exactly what this round touches.
  const KIDS = [createElement('p', { key: 'a' }, 'a'), createElement('p', { key: 'b' }, 'b')];
  const render = (C, settings) => {
    try { return renderToStaticMarkup(C({ children: KIDS, settings })); }
    catch (e) { return 'THREW: ' + e.message; }
  };

  const SYNTH = [undefined, {}, { containerWidth: 'large', spacingTop: 'medium', spacingBottom: 'medium' }];
  let differing = 0; let compared = 0; const detail = [];
  for (const t of TYPES) {
    const shapes = [
      ...all.filter((s) => s.type === t).map((s) => s.settings),
      ...SYNTH,
    ];
    for (const settings of shapes) {
      compared += 1;
      const a = render(then[t], settings); const b = render(now[t], settings);
      if (a !== b) { differing += 1; if (detail.length < 4) detail.push({ type: t, settings, then: a, now: b }); }
    }
  }

  // CONTROL: the same corpus with a NON-incumbent value must differ everywhere.
  let controlDiffering = 0; let controlCompared = 0;
  for (const t of TYPES) {
    const shapes = [
      ...all.filter((s) => s.type === t).map((s) => s.settings),
      ...SYNTH,
    ];
    for (const settings of shapes) {
      controlCompared += 1;
      const s2 = { ...(settings ?? {}), spacingBetween: 'none' };
      if (render(then[t], s2) !== render(now[t], s2)) controlDiffering += 1;
    }
  }

  report['-- THE ANSWER --'] = '';
  report.shapesCompared = compared;
  report.DIFFERING = differing;
  if (detail.length) report.differingDetail = detail;
  report.sampleMarkup = render(now.container, undefined);
  report.sampleMarkupHEAD = render(then.container, undefined);

  report['-- CONTROL: the comparison CAN report a difference --'] = '';
  report.withSpacingBetweenSet_compared = controlCompared;
  report.withSpacingBetweenSet_differing = controlDiffering;
  report.controlDiscriminates = controlDiffering === controlCompared && controlCompared > 0;
} finally {
  if (existsSync(SHADOW)) rmSync(SHADOW, { recursive: true, force: true });
  await mongoose.disconnect().catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
