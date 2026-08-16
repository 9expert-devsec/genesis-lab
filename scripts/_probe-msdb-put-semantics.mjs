/**
 * DOES `PUT /public-course/<_id>` MERGE OR REPLACE? — settled by experiment.
 *
 * ── WHY THIS CANNOT BE ANSWERED BY READING ──────────────────────────────────
 * The repo already BETS on merge semantics in shipped code. `shapePayload`
 * emits `program: … || undefined` and deliberately omits four keys
 * (course_doc_paths, course_lab_paths, course_case_study_paths, exam_links),
 * with a comment asserting that "omitting the key leaves the stored value in
 * place" and that MSDB performs an unfiltered `findByIdAndUpdate(id, body)`.
 * That is a claim about someone else's server, written from the outside.
 *
 * If it is wrong, it is not a theoretical problem: every course save in
 * production has been blanking four fields that 74 of 77 courses carry.
 *
 * ── THE PROTOCOL, ENFORCED BY THIS FILE'S SHAPE ─────────────────────────────
 * Each step is a separate invocation, so "one write per step" is structural
 * rather than a promise:
 *
 *   --snapshot   READ  save the complete row verbatim. No write.
 *   --partial    WRITE exactly one PUT, one harmless field.
 *   --readback   READ  diff against the snapshot, field by field.
 *   --restore    WRITE exactly one PUT, the whole saved row.
 *   --verify     READ  diff against the snapshot; must be empty.
 *
 * Exactly one `msdbUpdate` call site exists below, reached by two mutually
 * exclusive flags, so no invocation can issue two writes.
 *
 * ── THE SUBJECT ─────────────────────────────────────────────────────────────
 * ZZTEST-EXCEL-01 ONLY, asserted before anything is sent. The code is pinned as
 * a constant and the id is derived from it — never passed in — so this cannot
 * be pointed at another course by an argument.
 */

import { register } from 'node:module';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

register(new URL('../test/loader.mjs', import.meta.url));

const { aiFetch } = await import('@/lib/api/client');
const { unwrap } = await import('@/lib/api/client');
const { msdbUpdate } = await import('@/lib/api/msdb-write');

/**
 * The ONLY course this script may touch. Constants, never arguments.
 *
 * ── THE SUBJECT IS NOT CALLED WHAT THE ROUND CALLS IT ──────────────────────
 * It was commissioned as ZZTEST-EXCEL-01. It is not upstream under that code
 * any more, and a `?course_id=ZZTEST-EXCEL-01` read returns nothing — so a
 * probe pinned on that string would simply have found no subject.
 *
 * Identity was established read-only before anything was sent, by two
 * independent signals that agree:
 *   · the genesis CourseExtension anchored to _id 6a7a97f0b830e289fc383406
 *     (the upstreamId backfilled 2026-08-16) carries courseId EXCEL-HR-01;
 *   · that same row's `formerCodes` is ["ZZTEST-EXCEL-01"].
 * So phase 1 DID run on this course and MSDB followed: both sides now agree on
 * EXCEL-HR-01, and ZZTEST-EXCEL-01 is its retired code. It also has 0
 * registrations, so no paid order references it.
 *
 * BOTH the code and the `_id` are pinned, and both are checked on every read.
 * The `_id` is the one that cannot drift: a rename between steps would move the
 * code and leave the id alone, and a probe that followed the code would then be
 * writing to whatever now answers to it.
 */
const SUBJECT = 'EXCEL-HR-01';
const SUBJECT_ID = '6a7a97f0b830e289fc383406';
const SUBJECT_FORMER = 'ZZTEST-EXCEL-01';

const SNAPSHOT = path.resolve(
  process.env.PROBE_DIR ?? '.',
  'zztest-excel-01.upstream.json'
);

const FLAGS = {
  snapshot: process.argv.includes('--snapshot'),
  partial: process.argv.includes('--partial'),
  readback: process.argv.includes('--readback'),
  restore: process.argv.includes('--restore'),
  verify: process.argv.includes('--verify'),
};
const chosen = Object.entries(FLAGS).filter(([, on]) => on).map(([k]) => k);
if (chosen.length !== 1) {
  console.error(`Pass exactly ONE step flag. Got: ${chosen.join(', ') || '(none)'}`);
  console.error('  --snapshot | --partial | --readback | --restore | --verify');
  process.exit(2);
}
const STEP = chosen[0];

/**
 * The row, read UNCACHED and by code.
 *
 * `?course_id=` is the only working per-course filter upstream (`?_id=` is
 * silently ignored and returns everything — curl-verified 2026-04-23), and the
 * list row has been measured byte-identical to the detail response across all
 * its keys. `revalidate: 0` because a cached read would make a write look like
 * it did not land, or like it did.
 */
async function readRow() {
  const raw = await aiFetch('/public-course', {
    params: { course_id: SUBJECT },
    revalidate: 0,
  });
  const { items } = unwrap(raw);
  const row = items?.[0] ?? null;
  if (!row) throw new Error(`${SUBJECT} not found upstream — refusing to continue`);
  if (String(row.course_id) !== SUBJECT) {
    throw new Error(`read back "${row.course_id}", expected "${SUBJECT}" — refusing`);
  }
  // The id is the guard that survives a rename; the code alone is not enough.
  if (String(row._id) !== SUBJECT_ID) {
    throw new Error(
      `"${SUBJECT}" resolves to _id ${row._id}, expected ${SUBJECT_ID} — `
      + 'this is a DIFFERENT course. Refusing.'
    );
  }
  return row;
}

const load = () => JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

/** Stable, order-independent comparison of two rows. */
function diff(before, after) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const missing = [];   // present before, absent after
  const added = [];     // absent before, present after
  const changed = [];   // present in both, different value
  const same = [];
  for (const k of keys) {
    const inB = Object.prototype.hasOwnProperty.call(before, k);
    const inA = Object.prototype.hasOwnProperty.call(after, k);
    if (inB && !inA) { missing.push(k); continue; }
    if (!inB && inA) { added.push(k); continue; }
    const b = JSON.stringify(before[k]);
    const a = JSON.stringify(after[k]);
    if (b === a) same.push(k);
    else changed.push({ key: k, before: before[k], after: after[k] });
  }
  return { keys, missing, added, changed, same };
}

const brief = (v) => {
  const s = JSON.stringify(v);
  return s == null ? String(v) : s.length > 90 ? `${s.slice(0, 90)}…` : s;
};

function reportDiff(label, d, total) {
  console.log(`\n── ${label} ──`);
  console.log(`  unchanged : ${d.same.length} / ${total}`);
  console.log(`  changed   : ${d.changed.length}`);
  console.log(`  MISSING   : ${d.missing.length}`);
  console.log(`  added     : ${d.added.length}`);
  for (const c of d.changed) console.log(`    ~ ${c.key}: ${brief(c.before)}  →  ${brief(c.after)}`);
  for (const k of d.missing) console.log(`    - ${k}  (GONE)`);
  for (const k of d.added) console.log(`    + ${k}`);
}

/**
 * THE ONE FIELD THE PARTIAL PUT TOUCHES.
 *
 * Chosen at run time from the snapshot and printed with its reason, because
 * "least consequential" is a property of THIS row's data, not of the schema.
 * The candidates are ranked; the first one that exists on the row wins. Every
 * candidate is invisible to a customer and is not `course_id`.
 */
const CANDIDATES = [
  {
    key: 'sort_order',
    why: 'a numeric ordering hint. This repo does not read it — ordering comes '
       + 'from ProgramOrder/SkillOrder in genesis (see courseOrder.js) — and a '
       + 'ZZTEST course appears in no customer-facing list. Reversible to the '
       + 'exact prior integer.',
    mutate: (v) => (Number(v) || 0) + 1,
  },
  {
    key: 'course_levels',
    why: 'a level label with no rendering site in this repo.',
    mutate: (v) => (String(v) === '1' ? '2' : '1'),
  },
];

function pickField(row) {
  for (const c of CANDIDATES) {
    if (Object.prototype.hasOwnProperty.call(row, c.key)) return c;
  }
  throw new Error('no safe candidate field present on the row — stopping');
}

// ── Steps ───────────────────────────────────────────────────────────────────

if (STEP === 'snapshot') {
  const row = await readRow();
  writeFileSync(SNAPSHOT, JSON.stringify(row, null, 2), 'utf8');
  const keys = Object.keys(row).sort();
  console.log(`=== STEP 1: SNAPSHOT (read only) ===`);
  console.log(`subject : ${row.course_id}`);
  console.log(`_id     : ${row._id}`);
  console.log(`fields  : ${keys.length}`);
  console.log(`saved   : ${SNAPSHOT}`);
  console.log(`\nkeys:\n  ${keys.join('\n  ')}`);
  const pick = pickField(row);
  console.log(`\nthe partial PUT will change ONE field: ${pick.key}`);
  console.log(`  current value : ${brief(row[pick.key])}`);
  console.log(`  would become  : ${brief(pick.mutate(row[pick.key]))}`);
  console.log(`  why this one  : ${pick.why}`);
  process.exit(0);
}

if (!existsSync(SNAPSHOT)) {
  console.error(`No snapshot at ${SNAPSHOT}. Run --snapshot first.`);
  process.exit(2);
}
const saved = load();

if (STEP === 'readback' || STEP === 'verify') {
  const now = await readRow();
  reportDiff(
    STEP === 'readback' ? 'STEP 3: AFTER THE PARTIAL PUT, vs snapshot' : 'STEP 5: AFTER RESTORE, vs snapshot',
    diff(saved, now),
    Object.keys(saved).length
  );
  if (STEP === 'verify') {
    const d = diff(saved, now);
    /**
     * `updatedAt` CANNOT BE RESTORED BY ANY CLIENT, and its drift is not a
     * failed restore.
     *
     * Upstream's schema uses Mongoose `timestamps`, which stamps `updatedAt` on
     * every write and ignores whatever the body says. So the only way to leave
     * it untouched is to never write — which is not available once step 2 has
     * run. Counting it as damage would make a correct restore unreportable, and
     * excluding it silently would hide a field that genuinely did move. It is
     * therefore separated and printed, not dropped.
     *
     * Everything else must match exactly.
     */
    const SERVER_STAMPED = new Set(['updatedAt']);
    const realChanged = d.changed.filter((c) => !SERVER_STAMPED.has(c.key));
    const stamped = d.changed.filter((c) => SERVER_STAMPED.has(c.key));
    const clean = realChanged.length === 0 && d.missing.length === 0 && d.added.length === 0;

    console.log(`\n  restorable fields differing : ${realChanged.length}`);
    console.log(`  server-stamped, not settable : ${stamped.map((c) => c.key).join(', ') || '(none)'}`);
    console.log(
      `\nRESTORE ${clean
        ? `COMPLETE — all ${d.same.length} restorable fields match the snapshot; only the server's own updatedAt moved.`
        : 'INCOMPLETE — a restorable field did not come back. See above.'}`
    );
    process.exit(clean ? 0 : 1);
  }
  process.exit(0);
}

// ── The two write steps. ONE msdbUpdate call site, below. ───────────────────
let body;
let label;

if (STEP === 'partial') {
  const pick = pickField(saved);
  body = { [pick.key]: pick.mutate(saved[pick.key]) };
  label = `PARTIAL — one key: ${pick.key}`;
} else {
  /**
   * RESTORE — the snapshot's values for exactly the keys that moved.
   *
   * ── WHY NOT THE WHOLE SNAPSHOT VERBATIM ────────────────────────────────
   * THE READ SHAPE IS NOT THE WRITE SHAPE. Upstream returns `previous_course`,
   * `related_courses`, `skills` and `program` POPULATED — full objects with
   * `_id`, `course_id`, names, icon URLs — while the write side expects
   * ObjectIds. That asymmetry is why `resolveCourseRefs` exists in
   * lib/actions/courses.js at all.
   *
   * So echoing the snapshot back key-for-key would push populated objects into
   * ObjectId paths, and the outcomes range from a silent re-cast to a rejected
   * write to a mangled ref. On a row that step 3 proved lost NOTHING, that is a
   * new risk with no upside: the restore would be the first thing in this
   * experiment capable of causing damage.
   *
   * The snapshot remains the source of truth for every VALUE — this sends the
   * saved value for each key that differs — and step 5 still verifies the whole
   * row field-for-field against it. Anything the delta failed to put back shows
   * up there.
   *
   * ── AND IT REFUSES RATHER THAN GUESS ───────────────────────────────────
   * If a populated-ref key is among the ones that moved, the delta cannot be
   * sent safely either, and this stops with the keys named instead of
   * improvising a cast.
   */
  const SERVER_MANAGED = new Set(['_id', '__v', 'createdAt', 'updatedAt']);
  const POPULATED_REFS = new Set(['previous_course', 'related_courses', 'skills', 'program']);

  const now = await readRow();
  const moved = diff(saved, now).changed
    .map((c) => c.key)
    .filter((k) => !SERVER_MANAGED.has(k));

  const unsafe = moved.filter((k) => POPULATED_REFS.has(k));
  if (unsafe.length) {
    console.error(
      `REFUSING: these changed keys are populated refs and cannot be echoed back `
      + `without resolveCourseRefs: ${unsafe.join(', ')}`
    );
    process.exit(3);
  }
  if (moved.length === 0) {
    console.log('Nothing to restore — the row already matches the snapshot.');
    process.exit(0);
  }

  body = Object.fromEntries(moved.map((k) => [k, saved[k]]));
  label = `RESTORE — ${moved.length} key(s) back to their snapshot values`;
}

console.log(`=== ${STEP === 'partial' ? 'STEP 2' : 'STEP 4'}: ${label} ===`);
console.log(`PUT /public-course/${saved._id}`);
console.log(`body keys: ${Object.keys(body).join(', ')}`);

const res = await msdbUpdate('public-course', saved._id, body);
console.log(`\nupstream said: ok=${res?.ok} item._id=${res?.item?._id ?? '(none)'}`);
console.log(`item keys in the response: ${res?.item ? Object.keys(res.item).length : 0}`);
console.log('\nDone. Read it back with the next step — the response is not the row.');
