/**
 * LEGACY DRUPAL REGISTRATIONS → register_public / register_inhouse.
 *
 * ══ DRY RUN BY DEFAULT. NOTHING IS WRITTEN WITHOUT `--apply`. ═══════════════
 *
 * There is exactly ONE write call in this file — `Model.collection.insertMany`
 * — and it sits behind `if (APPLY)`. No update, no upsert, no delete, no $set,
 * and no write of any kind on the dry-run path. Run it with no flags as often
 * as you like; it reads, maps, validates in memory and prints.
 *
 * ══ THE IMPORT IS RE-RUNNABLE, AND THAT IS THE DESIGN, NOT A COURTESY ═══════
 *
 * It runs at least twice by plan: a bulk pass, then a CATCH-UP PASS ON CUTOVER
 * NIGHT that re-reads the same export plus whatever Drupal accepted in between.
 * The second run must insert only the new rows.
 *
 * `legacy.sid` is what makes that true. Before doing anything, this script reads
 * the set of `legacy.sid` values already in each collection and drops every row
 * whose sid is present. The unique partial index on `legacy.sid` (declared on
 * both models) is the backstop underneath: if two invocations ever overlapped,
 * the second insert fails rather than duplicating a customer.
 *
 * ══ WHY THE RAW DRIVER AND NOT MONGOOSE ════════════════════════════════════
 *
 * `Model.collection.insertMany` bypasses Mongoose validators, deliberately:
 *
 *   · `RegisterInhouse.participantsCount` declares `min: 15`, and real legacy
 *     enquiries hold values below it. Those rows are not wrong — the model's own
 *     header records that historical documents under the floor must still read,
 *     edit and save — but a validating write would refuse them.
 *   · Every admin write in this repo already goes through `findByIdAndUpdate`
 *     with `runValidators: false`, so validating here would make the import
 *     STRICTER than the screens that will edit these same documents.
 *
 * ── SO THE DRY RUN VALIDATES INSTEAD, AND ONLY TO LOOK ────────────────────
 * Every mapped document is fed to `new Model(doc).validateSync()` and the errors
 * are REPORTED BY PATH. Nothing is corrected, nothing is dropped for failing,
 * and the constructed model is thrown away — because `new Model(doc)` applies
 * defaults, casts types and would hand back a document subtly different from the
 * plain object that actually gets inserted. Inspect, do not let the validator
 * bend the data.
 *
 * ══ THE APPLY GUARD ════════════════════════════════════════════════════════
 * `--apply` re-counts both collections and REFUSES if either count differs from
 * what the dry run in the same invocation observed. A collection that moved
 * between the read and the write means something else is writing, and the
 * dedup set this run computed is already stale.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-legacy-registrations.mjs
 *   node --env-file=.env.local scripts/import-legacy-registrations.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import mongoose from 'mongoose';

import {
  DEAD_FIELDS,
  has,
  mapInhouseRow,
  mapPublicRow,
  t,
} from './lib/legacy-registration-map.mjs';

// The `@/` aliases are invisible to Node; the suite's loader resolves them. Used
// ONLY to import the two models, and only so the dry run can validate against
// the same schemas the application ships.
register(new URL('../test/loader.mjs', import.meta.url));
const { default: RegisterPublic } = await import('@/models/RegisterPublic');
const { default: RegisterInhouse } = await import('@/models/RegisterInhouse');

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const APPLY = process.argv.includes('--apply');

const die = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };
const n = (v) => String(v).padStart(6);

/** One .b64 file → the decoded rows. Line 1 is the literal header `b64`. */
function loadExport(file) {
  const abs = path.join(ROOT, 'docs', 'legacy', file);
  if (!fs.existsSync(abs)) die(`${abs} is missing — the export is gitignored and must be placed by hand`);
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/).filter((l) => l !== '');
  const header = lines.shift();
  if (t(header) !== 'b64') die(`${file}: line 1 is ${JSON.stringify(header)}, expected the literal 'b64'`);
  return lines.map((line, i) => {
    try {
      return JSON.parse(Buffer.from(line, 'base64').toString('utf8'));
    } catch (e) {
      die(`${file} line ${i + 2}: not base64-encoded JSON — ${e.message}`);
      return null;
    }
  });
}

/** A tally that prints in count order. */
function tally() {
  const m = new Map();
  return {
    add: (k, by = 1) => m.set(k, (m.get(k) ?? 0) + by),
    entries: () => [...m].sort((a, b) => b[1] - a[1]),
    size: () => m.size,
    total: () => [...m.values()].reduce((a, b) => a + b, 0),
  };
}

/**
 * Map one collection's rows and gather everything the report needs.
 *
 * NOTE THE ORDER: a row already imported is counted as `skippedImported` and is
 * NOT also mapped. `rows read === would insert + already imported + skipped` is
 * asserted by the caller rather than eyeballed.
 */
function planCollection({ rows, mapRow, existingSids, courseMap, now, Model, label }) {
  const inserts = [];
  const skipReasons = tally();
  const noteCounts = tally();
  const statusDist = tally();
  const unmatchedBranches = tally();
  const validationPaths = tally();
  const validationExamples = new Map();
  /**
   * A mapped status the COLLECTION'S OWN ENUM does not contain.
   *
   * Counted separately from the validateSync tally, and read off
   * `schema.path('status').enumValues` rather than restated here, because this
   * is the one finding that has to be impossible to skim past: a stored value
   * outside the live vocabulary is invisible on read (reads never validate) and
   * shows up later as rows no status filter can reach and no summary card counts.
   */
  const enumValues = Model.schema.path('status')?.enumValues ?? [];
  const statusOutsideEnum = tally();
  let skippedImported = 0;
  let zeroAttendees = 0;
  const requiredEmpty = [];
  const noClassDate = [];

  for (const row of rows) {
    if (existingSids.has(row.sid)) { skippedImported++; continue; }

    const { doc, skip, notes } = mapRow(row, { courseMap, now });
    for (const note of notes) {
      // Notes are bucketed by their SHAPE, not their text, so 456 zero-attendee
      // rows are one line and not 456.
      if (note.startsWith('zero attendees')) { zeroAttendees++; noteCounts.add('zero attendees'); }
      else if (note.startsWith('quantity ')) noteCounts.add('quantity disagrees with the attendee name count');
      else if (note.startsWith('unmatched invoice_branch')) {
        noteCounts.add('unmatched invoice_branch');
        unmatchedBranches.add(note.replace('unmatched invoice_branch: ', ''));
      } else if (note.startsWith('class_title has no')) { noteCounts.add('class_title has no parenthesised date'); noClassDate.push(row.sid); }
      else if (note.startsWith('course nid')) noteCounts.add(note);
      else if (note.startsWith('participants ')) noteCounts.add('participants not 1..500 — field omitted, default applies');
      else noteCounts.add(note);
    }

    if (skip) { skipReasons.add(skip); continue; }

    statusDist.add(doc.status);
    if (!enumValues.includes(doc.status)) statusOutsideEnum.add(doc.status);

    // ── VALIDATE TO LOOK, NEVER TO CORRECT ──────────────────────────────
    // The constructed model is discarded; `doc` is what gets inserted.
    const err = new Model(doc).validateSync();
    if (err) {
      for (const [p, e] of Object.entries(err.errors)) {
        validationPaths.add(`${p} — ${e.kind ?? e.name}`);
        if (!validationExamples.has(p)) validationExamples.set(p, { sid: row.sid, message: e.message });
      }
    }

    // A required path that ends up empty is worth its own line: the validator
    // catches it too, but this says WHICH ROW and is printed even when the
    // schema happens not to mark the path required.
    for (const [p, v] of Object.entries(label === 'public'
      ? { 'coordinator.firstName': doc.coordinator.firstName, 'coordinator.lastName': doc.coordinator.lastName, 'coordinator.email': doc.coordinator.email, 'coordinator.phone': doc.coordinator.phone, classId: doc.classId }
      : { contactFirstName: doc.contactFirstName, contactLastName: doc.contactLastName, contactEmail: doc.contactEmail, contactPhone: doc.contactPhone, companyName: doc.companyName })) {
      if (!has(v)) requiredEmpty.push(`sid ${row.sid}: ${p} is empty`);
    }

    inserts.push(doc);
  }

  return {
    rowsRead: rows.length,
    inserts,
    skippedImported,
    skipReasons,
    noteCounts,
    statusDist,
    unmatchedBranches,
    validationPaths,
    validationExamples,
    zeroAttendees,
    requiredEmpty,
    noClassDate,
    statusOutsideEnum,
    enumValues,
  };
}

function reportCollection(label, plan) {
  console.log('');
  console.log(`══ ${label} ${'═'.repeat(Math.max(0, 66 - label.length))}`);
  console.log('');
  console.log(`  rows read                   ${n(plan.rowsRead)}`);
  console.log(`  would insert                ${n(plan.inserts.length)}`);
  console.log(`  skipped — already imported  ${n(plan.skippedImported)}`);
  console.log(`  skipped — with a reason     ${n(plan.skipReasons.total())}`);
  for (const [reason, count] of plan.skipReasons.entries()) {
    console.log(`        ${n(count)}  ${reason}`);
  }

  // ── THE RECONCILIATION IS ASSERTED, NOT PRINTED FOR THE READER TO CHECK ──
  const accounted = plan.inserts.length + plan.skippedImported + plan.skipReasons.total();
  if (accounted !== plan.rowsRead) {
    die(`${label}: ${plan.rowsRead} rows read but ${accounted} accounted for `
      + `(${plan.inserts.length} insert + ${plan.skippedImported} imported + ${plan.skipReasons.total()} skipped). `
      + 'A row went missing between reading and planning.');
  }
  console.log(`  ── reconciles: ${plan.inserts.length} + ${plan.skippedImported} + ${plan.skipReasons.total()} = ${plan.rowsRead} ✓`);

  console.log('');
  console.log('  status distribution of what would be written:');
  for (const [s, c] of plan.statusDist.entries()) console.log(`        ${n(c)}  ${s}`);

  console.log('');
  console.log('  per-row observations (not blocking):');
  if (plan.noteCounts.size() === 0) console.log('        (none)');
  for (const [note, c] of plan.noteCounts.entries()) console.log(`        ${n(c)}  ${note}`);

  if (plan.unmatchedBranches.size()) {
    console.log('');
    console.log(`  distinct UNMATCHED invoice_branch values (${plan.unmatchedBranches.size()}) — kept in legacy.raw.invoiceBranch,`);
    console.log('  branchType/branchCode left at their schema defaults:');
    for (const [v, c] of plan.unmatchedBranches.entries()) console.log(`        ${n(c)}  ${v}`);
  }

  console.log('');
  console.log('  validateSync (INSPECTION ONLY — the raw driver is what writes):');
  if (plan.validationPaths.size() === 0) {
    console.log('        every document would pass Mongoose validation as written');
  } else {
    for (const [p, c] of plan.validationPaths.entries()) {
      const path0 = p.split(' — ')[0];
      const ex = plan.validationExamples.get(path0);
      console.log(`        ${n(c)}  ${p}`);
      if (ex) console.log(`                e.g. sid ${ex.sid}: ${ex.message}`);
    }
  }

  console.log('');
  if (plan.requiredEmpty.length === 0) {
    console.log('  required paths that would end up empty: none');
  } else {
    console.log(`  required paths that would end up EMPTY (${plan.requiredEmpty.length}):`);
    for (const line of plan.requiredEmpty.slice(0, 20)) console.log(`        ${line}`);
    if (plan.requiredEmpty.length > 20) console.log(`        … ${plan.requiredEmpty.length - 20} more`);
  }

  if (label === 'register_public') {
    console.log('');
    console.log(`  rows that would have ZERO attendees: ${plan.zeroAttendees}`);
    if (plan.noClassDate.length) {
      console.log(`  rows with NO parenthesised class date (classDate = null): ${plan.noClassDate.length}`);
      console.log(`        sids: ${plan.noClassDate.slice(0, 20).join(', ')}${plan.noClassDate.length > 20 ? ' …' : ''}`);
    } else {
      console.log('  rows with NO parenthesised class date: 0');
    }
  }
}

/** What the deliberately-unmapped source fields actually hold. */
function reportDeadFields(label, rows) {
  console.log('');
  console.log(`  dead fields in ${label} — present in the source, NOT mapped to any genesis path.`);
  console.log('  Every one of these is UNCONSUMED, so it rides into legacy.raw verbatim:');
  for (const key of DEAD_FIELDS) {
    const present = rows.filter((r) => r.data?.[key] !== undefined).length;
    if (present === 0) { console.log(`        ${key.padEnd(38)} absent on all rows`); continue; }
    const values = new Set(rows.map((r) => t(r.data?.[key])).filter((v) => v !== ''));
    const shown = [...values].slice(0, 3).map((v) => JSON.stringify(v.slice(0, 24))).join(', ');
    console.log(`        ${key.padEnd(38)} present=${present} nonEmptyDistinct=${values.size}${values.size ? ` e.g. ${shown}` : ' (all empty)'}`);
  }
  const a10 = rows.filter((r) => Object.keys(r.data ?? {}).some((k) => /^a10_/.test(k)));
  console.log(`        ${'a10_*'.padEnd(38)} rows carrying any a10 key: ${a10.length}`
    + (a10.length ? '  ← EXPECTED 0; the fold stops at a9' : '  ✓ asserted, not assumed'));
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');

  const courseMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'legacy', 'course-match-map.json'), 'utf8'));
  const publicRows = loadExport('public.b64');
  const inhouseRows = loadExport('inhouse.b64');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  console.log('');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(APPLY
    ? '  LEGACY REGISTRATION IMPORT — --apply, THIS WILL WRITE'
    : '  LEGACY REGISTRATION IMPORT — DRY RUN, NOTHING WILL BE WRITTEN');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  database                    ${db.databaseName}`);
  console.log(`  host                        ${mongoose.connection.host}`);
  console.log(`  course match map            ${Object.keys(courseMap).length} entries`);

  // ── THE BEFORE COUNTS. Read once, printed, and re-checked under --apply. ──
  const before = {
    register_public: await db.collection('register_public').countDocuments({}),
    register_inhouse: await db.collection('register_inhouse').countDocuments({}),
  };
  console.log(`  register_public             ${n(before.register_public)} documents now`);
  console.log(`  register_inhouse            ${n(before.register_inhouse)} documents now`);

  // ── THE DEDUP SET, READ BEFORE ANYTHING ELSE ────────────────────────────
  const sidsOf = async (name) => new Set(
    (await db.collection(name)
      .find({ 'legacy.sid': { $exists: true } }, { projection: { 'legacy.sid': 1 } })
      .toArray()).map((d) => d.legacy.sid)
  );
  const existing = {
    register_public: await sidsOf('register_public'),
    register_inhouse: await sidsOf('register_inhouse'),
  };
  console.log(`  legacy.sid already present  ${n(existing.register_public.size)} public / ${existing.register_inhouse.size} in-house`);

  const now = new Date();

  const plans = {
    register_public: planCollection({
      rows: publicRows, mapRow: mapPublicRow, existingSids: existing.register_public,
      courseMap, now, Model: RegisterPublic, label: 'public',
    }),
    register_inhouse: planCollection({
      rows: inhouseRows, mapRow: mapInhouseRow, existingSids: existing.register_inhouse,
      courseMap, now, Model: RegisterInhouse, label: 'inhouse',
    }),
  };

  reportCollection('register_public', plans.register_public);
  reportDeadFields('register_public', publicRows);
  reportCollection('register_inhouse', plans.register_inhouse);
  reportDeadFields('register_inhouse', inhouseRows);

  console.log('');
  console.log('══ TOTALS ════════════════════════════════════════════════════════════');
  const totalRead = plans.register_public.rowsRead + plans.register_inhouse.rowsRead;
  const totalInsert = plans.register_public.inserts.length + plans.register_inhouse.inserts.length;
  const totalImported = plans.register_public.skippedImported + plans.register_inhouse.skippedImported;
  const totalSkipped = plans.register_public.skipReasons.total() + plans.register_inhouse.skipReasons.total();
  console.log(`  rows read ${totalRead}  =  insert ${totalInsert} + already imported ${totalImported} + skipped ${totalSkipped}`);
  if (totalRead !== totalInsert + totalImported + totalSkipped) {
    die('the grand total does not reconcile');
  }

  /**
   * ══ THE ONE THING THAT MUST NOT BE SKIMMED PAST ═══════════════════════════
   *
   * A status this run would WRITE that the target collection's own enum does not
   * contain. It is separated from the validateSync tally and printed last,
   * loudly, because it is the only finding here that is invisible after the
   * fact: Mongoose reads never validate, so the documents load and render
   * normally, and the damage shows up as rows no status filter reaches and no
   * summary card counts — the exact shape the RegisterInhouse status header
   * warns about, where the fix is a migration and not an edit.
   *
   * It does NOT block --apply. The mapping is the one that was specified, and
   * guessing a different target value would be the greater sin — see the note
   * printed below. This is a decision for a human, made in the open.
   */
  const enumTrouble = Object.entries(plans).filter(([, p]) => p.statusOutsideEnum.size() > 0);
  if (enumTrouble.length) {
    console.log('');
    console.log('══ ⚠ DECISION REQUIRED BEFORE --apply ════════════════════════════════');
    for (const [name, p] of enumTrouble) {
      console.log('');
      console.log(`  ${name}.status enum is [${p.enumValues.join(' | ')}]`);
      for (const [value, count] of p.statusOutsideEnum.entries()) {
        console.log(`  → this run would write ${count} documents with status '${value}', which is NOT in it.`);
      }
      console.log('');
      console.log('  The mapping is the one that was specified (wait→pending, confirm→confirmed,');
      console.log('  cancel→cancelled) and it is applied literally rather than adjusted, because');
      console.log("  choosing a different target — 'quoted' is the only other in-house value — is a");
      console.log('  semantic call about what a legacy "confirm" meant, and this script must not');
      console.log('  make it. Nothing is blocked; the number is put in front of you instead.');
      console.log('');
      console.log('  WHAT IT COSTS IF WRITTEN AS-IS: reads never validate, so these documents load');
      console.log('  and render normally — but `storedValuesForFilter` maps the LIVE vocabulary, so');
      console.log('  no status chip on /admin/registrations reaches them and no summary card counts');
      console.log('  them. See the status header on models/RegisterInhouse.js, which records that');
      console.log('  round 2 narrowed this enum deliberately and that the way back is a migration.');
    }
    console.log('');
    console.log('══════════════════════════════════════════════════════════════════════');
  }

  if (!APPLY) {
    console.log('');
    console.log('  DRY RUN — NOTHING WAS WRITTEN. Re-run with --apply to insert.');
    console.log('');
    await mongoose.disconnect();
    return;
  }

  // ══ THE ONLY WRITE PATH IN THIS FILE ══════════════════════════════════════
  console.log('');
  console.log('══ APPLYING ══════════════════════════════════════════════════════════');

  for (const name of ['register_public', 'register_inhouse']) {
    const nowCount = await db.collection(name).countDocuments({});
    if (nowCount !== before[name]) {
      die(`${name} held ${before[name]} documents when this run planned and holds ${nowCount} now. `
        + 'Something else wrote while this script was thinking, so the dedup set it computed is stale. '
        + 'NOTHING HAS BEEN WRITTEN — re-run the dry run and read it again.');
    }
  }

  const Models = { register_public: RegisterPublic, register_inhouse: RegisterInhouse };
  for (const name of ['register_public', 'register_inhouse']) {
    const docs = plans[name].inserts;
    if (docs.length === 0) { console.log(`  ${name}: nothing to insert`); continue; }
    // `ordered: false` so one rejected document does not abandon the rest — the
    // unique index on legacy.sid is the thing most likely to reject one, and it
    // rejecting is the dedup working, not a failure of the run.
    const res = await Models[name].collection.insertMany(docs, { ordered: false });
    console.log(`  ${name}: inserted ${res.insertedCount} of ${docs.length}`);
    const after = await db.collection(name).countDocuments({});
    console.log(`  ${name}: ${before[name]} → ${after} documents`);
  }

  console.log('');
  console.log('  Run the DRY RUN again: it must now report 0 to insert and all rows already imported.');
  console.log('');
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
