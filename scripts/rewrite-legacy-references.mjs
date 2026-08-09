/**
 * PHASE 2 — REWRITE STORED LEGACY REFERENCES. DRY RUN BY DEFAULT.
 *
 * ══ READ THIS BEFORE PASSING --apply ════════════════════════════════════════
 *
 * Without --apply this script opens the database READ-ONLY, writes nothing to
 * any collection including the backup one, and prints what it would do. That
 * is the intended mode and the only mode exercised so far.
 *
 * ── WHAT IT REWRITES ────────────────────────────────────────────────────────
 *
 *   https://www.9experttraining.com/sites/default/files/articles/cover/x.png
 *   → /sites/default/files/articles/cover/x.png
 *
 * Root-relative, legacy path shape preserved, no host, no transformation, no
 * query. The four classes and the reasoning behind each live in
 * ./lib/legacy-reference-rewrite.mjs — read that header, not this one, for why
 * a decision is made the way it is.
 *
 * ── HOW IT EDITS ────────────────────────────────────────────────────────────
 *
 * articles.content is rich HTML holding a dozen URLs per string. This uses the
 * SAME multi-pass extraction the audit uses (./lib/legacy-url-extract.mjs) and
 * splices only the matched character ranges. It never regex-replaces across a
 * body and never re-serialises HTML: a formatting-only diff in 479 article
 * bodies would be indistinguishable from a real change under audit.
 *
 * ── IDEMPOTENCE ─────────────────────────────────────────────────────────────
 *
 * Every rewritten form classifies as `already-root-relative` on a second pass
 * and produces no edit. The dry run PROVES this rather than asserting it: it
 * re-classifies each computed replacement and fails loudly if any second pass
 * would change something. See the idempotence check in the report.
 *
 * ── REVERSIBILITY ───────────────────────────────────────────────────────────
 *
 * --apply writes one document to `legacy_reference_rewrites` BEFORE touching
 * the source document, carrying collection, _id, field path, the EXACT
 * original string and the new one. A full revert is possible from that
 * collection alone, with no legacy server and no re-derivation — which matters
 * because the legacy server is going away and re-deriving would just re-run
 * the logic whose output we would be trying to undo.
 *
 * Resumability rides on the same record: a (runId, collection, _id, fieldPath)
 * already present is skipped, so an interrupted run continues where it stopped.
 *
 * ── LIVENESS DATA IS AN INPUT, NOT A GUESS ──────────────────────────────────
 *
 * A reference confirmed 404 is left ALONE. Rewriting it produces a tidy path
 * that still 404s, which is strictly worse than leaving it obviously broken —
 * the broken-ness is the signal that content needs fixing. Liveness comes from
 * a previous `audit-legacy-file-urls.mjs --check` run, passed with --checks.
 * The script refuses to run without it rather than defaulting to "assume
 * alive", and reports the file's age. BEFORE --apply, re-run the audit with
 * --check: a stale snapshot can both rewrite a newly-dead link and skip a
 * newly-alive one.
 *
 * Usage:
 *   node --env-file=.env.local scripts/rewrite-legacy-references.mjs \
 *     --checks reports/legacy-urls/legacy-file-urls-<stamp>.json
 */

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

import { pathOnly, resolveDerivative } from './lib/legacy-source-manifest.mjs';
import {
  MAX_DEPTH, decodePath, extractLegacyUrls, toPath, walkStrings,
} from './lib/legacy-url-extract.mjs';
import {
  CLASS, REWRITING_CLASSES, applyEdits, decideReference,
} from './lib/legacy-reference-rewrite.mjs';
import { REVERT, decideRevert, verifyReverted } from './lib/legacy-reference-revert.mjs';
import { APPENDED_FORMATS, IMAGE_EXTENSIONS } from '../src/lib/legacyTransforms.mjs';

// ── arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const argOf = (f, d = null) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

const APPLY = has('--apply');
const CHECKS = argOf('--checks');
/** `--revert <runId>` restores every field this run wrote. See runRevert(). */
const REVERT_RUN = argOf('--revert', null);
/** Revert is a dry run too, unless --commit is passed alongside it. */
const COMMIT = has('--commit');
const STAGE = argOf('--stage', null);
const SAMPLE_SIZE = Number(argOf('--samples', '20'));
/** Per-class sample cap, so a rare class is never crowded out by a common one. */
const SAMPLE_PER_CLASS = Number(argOf('--samples-per-class', '6'));

const BATCH_SIZE = 200;
/**
 * Where the revert reads its originals from.
 *
 * Overridable ONLY so the revert command itself can be rehearsed end-to-end
 * against throwaway collections without touching the real record — see
 * scripts/_rehearse-revert.mjs. Production runs must never pass this.
 */
const BACKUP_COLLECTION = argOf('--backup-collection', 'legacy_reference_rewrites');

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

const pad = (s, n) => String(s ?? '').padEnd(n);
const padL = (s, n) => String(s ?? '').padStart(n);
const ellipsis = (s, n) => (String(s).length <= n ? String(s) : `${String(s).slice(0, n - 1)}…`);

/**
 * STAGE A — the deliberately mixed slice.
 *
 * Not `--limit 20`. A blind limit takes whatever the cursor happens to yield
 * first, which here means twenty near-identical class-1 references out of one
 * article, proving only that the commonest case works. The rare classes — one
 * superseded reference in the whole database, three manifest-resolved — would
 * never appear, and they are exactly the ones whose logic is newest.
 *
 * So the slice is CONSTRUCTED to cover, at minimum:
 *   · one of every rewriting class, including manifest-resolved
 *   · a Thai filename        — non-ASCII through the whole pipeline
 *   · a percent-encoded name — the encoding must survive byte for byte
 *   · one article body with several references in ONE field, which is the only
 *     case that exercises multi-range splicing, and the only way to notice a
 *     range bug that eats a quote and destroys markup
 *
 * Each requirement names a specific failure this phase could plausibly have.
 */
const STAGE_A_REQUIREMENTS = [
  ['class: direct-absolute', (p) => p.edits.some((e) => e.cls === CLASS.DIRECT)],
  ['class: derivative', (p) => p.edits.some((e) => e.cls === CLASS.DERIVATIVE)],
  ['class: superseded', (p) => p.edits.some((e) => e.cls === CLASS.SUPERSEDED)],
  ['class: ampersand', (p) => p.edits.some((e) => e.cls === CLASS.AMPERSAND)],
  ['class: manifest-resolved', (p) => p.edits.some((e) => e.cls === CLASS.MANIFEST_RESOLVED)],
  // The range below is the Thai Unicode block U+0E00–U+0E7F, written as literal
  // characters. If this file is ever re-encoded and those two bytes mangle, the
  // range silently matches nothing and the requirement is dropped without a
  // sound — so if this line stops firing, check the file encoding before
  // concluding the data changed.
  //
  // MEASURED: it currently matches nothing, and that is correct. Every Thai
  // filename in the database is stored PERCENT-ENCODED, never literal. The
  // second requirement is the one that actually exercises Thai.
  ['Thai filename (literal non-ASCII)', (p) => p.edits.some((e) => /[฀-๿]/.test(e.after))],
  ['Thai filename (percent-encoded)', (p) => p.edits.some((e) => /%E0%B[89AB]%/i.test(e.after))],
  ['percent-encoded filename', (p) => p.edits.some((e) => /%[0-9A-F]{2}/i.test(e.after))],
  ['several references in ONE field', (p) => p.edits.length >= 3],
];

/**
 * Smallest set of planned field-changes covering every requirement.
 *
 * Greedy set cover: repeatedly take the change that satisfies the most
 * still-uncovered requirements. Small by design — Stage A is verified by
 * FETCHING each affected page and looking at whether the images render, and
 * that is human work.
 */
function selectStageA(plan) {
  const covered = new Set();
  const chosen = [];
  for (;;) {
    let best = null; let bestGain = 0;
    for (const item of plan) {
      if (chosen.includes(item)) continue;
      const gain = STAGE_A_REQUIREMENTS
        .filter(([label], i) => !covered.has(i) && STAGE_A_REQUIREMENTS[i][1](item)).length;
      if (gain > bestGain) { best = item; bestGain = gain; }
    }
    if (!best) break;
    chosen.push(best);
    STAGE_A_REQUIREMENTS.forEach(([, pred], i) => { if (pred(best)) covered.add(i); });
    if (covered.size === STAGE_A_REQUIREMENTS.length) break;
  }
  const missing = STAGE_A_REQUIREMENTS.filter((_, i) => !covered.has(i)).map(([label]) => label);
  return { chosen, missing };
}

/**
 * Collections deliberately NOT rewritten. Each exclusion is a judgment call
 * and is reported at the end with its reference count, because a silent
 * exclusion is indistinguishable from a collection nobody thought about.
 */
const EXCLUDED_COLLECTIONS = new Map([
  ['legacy_file_migrations',
    'the migration record itself — it stores the ORIGINAL legacy paths as the authority for what was uploaded where. Rewriting it would destroy the record this phase depends on for reversibility.'],
  [BACKUP_COLLECTION,
    'this phase\'s own backup. Rewriting it would corrupt the revert path.'],
  ['admin_audit_logs',
    'an append-only history of what admins did. A log that changes retroactively is not a log.'],
  ['page_audit_logs',
    'same — historical record, not live content.'],
  ['landing_cache',
    'derived cache, regenerated from source. Rewriting it would be overwritten anyway and could mask a source that was missed.'],
  ['nav_menu_cache',
    'derived cache, same reasoning.'],
  ['page_versions',
    'version history for the page builder. Restoring an old version SHOULD restore what it said at the time. Rewriting history here would silently rewrite the past.'],
  ['webhook_logs',
    'a verbatim record of payloads an EXTERNAL system sent us. Editing it would make the log disagree with what was actually received, destroying its only value — which is answering "what did they send?" during an incident. Nothing renders these; they are not site content.'],
]);

// ── liveness input ──────────────────────────────────────────────────────────

/**
 * Decoded path-only strings CONFIRMED not to resolve on the legacy server.
 *
 * ══ ONLY 404/410 COUNTS AS DEAD. THIS IS NOT PEDANTRY. ══════════════════════
 *
 * Measured on 2026-08-07: a full --check sweep came back with 704 responses of
 * HTTP 429 Too Many Requests. The audit probes 8 at a time and the legacy box
 * throttles under that. An earlier, smaller sweep saw none.
 *
 * If "non-2xx" meant dead, those 704 rate-limited responses would have been
 * recorded as dead files and this phase would have SKIPPED 704 live references
 * — leaving them pointing at a host that is about to be switched off. The
 * failure would look exactly like success: a clean run, a tidy report, and a
 * few hundred images that break months later.
 *
 * So the ladder is:
 *   404 / 410     definitively gone. Skip, report, leave visibly broken.
 *   2xx           alive. Rewrite.
 *   anything else 403, 429, 5xx, timeouts, no result — UNKNOWN. Rewritten
 *                 (the reference has to point somewhere, and the legacy host
 *                 is going away regardless) but counted and reported loudly,
 *                 because an unknown is a question the check failed to answer,
 *                 not an answer.
 *
 * A derivative is judged on its SOURCE (`sourceCheck`): the derivative 404ing
 * while the source is fine is the normal case and is exactly what this phase
 * repairs.
 */
const DEAD_STATUSES = new Set([404, 410]);

function loadDeadPaths(file) {
  let json;
  try { json = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { die(`cannot read --checks file ${file}: ${err.message}`); }
  if (!json.checked) {
    die(`${file} was produced WITHOUT --check, so it carries no liveness data. Re-run: npm run audit:legacy-urls -- --check`);
  }

  const ok = (c) => Boolean(c) && c.status >= 200 && c.status < 300;
  const dead = new Set();
  const unknown = new Map();        // status -> count of distinct paths
  let unknownPaths = 0;

  for (const u of json.urls) {
    const target = u.derivative ? u.derivative.sourcePath : pathOnly(u.decodedPath);
    const check = u.derivative ? (u.sourceCheck ?? null) : u.check;

    // A derivative whose own URL answers 200 is alive regardless of the source
    // probe — some styles are still generated on demand.
    if (u.derivative && ok(u.check)) continue;
    if (ok(check)) continue;

    const status = check?.status ?? '(no result)';
    if (typeof status === 'number' && DEAD_STATUSES.has(status)) { dead.add(target); continue; }
    unknown.set(status, (unknown.get(status) ?? 0) + 1);
    unknownPaths += 1;
  }
  return { dead, unknown, unknownPaths, generatedAt: json.generatedAt, file };
}

// ── revert ──────────────────────────────────────────────────────────────────

/**
 * Restore every field written under one runId, from the backup collection ALONE.
 *
 * Three passes, deliberately separate:
 *
 *   1. DECIDE   read each document as it is now and classify: restore,
 *               already-reverted, conflict, or missing. Nothing is written.
 *   2. WRITE    restore only the `restore` set, and only with --commit. The
 *               update is guarded a SECOND time in the query itself
 *               (`{ [fieldPath]: newValue }`), so a change landing between the
 *               decision and the write loses the race safely rather than being
 *               overwritten.
 *   3. VERIFY   re-read every document from scratch and assert byte-identity
 *               with originalValue. A writer that reports its own success is
 *               how a revert comes to be believed without being true.
 */
async function runRevert(db, runId) {
  const backup = db.collection(BACKUP_COLLECTION);
  const records = await backup.find({ runId }).toArray();

  console.log('');
  console.log(`══ REVERT — run ${runId} ${COMMIT ? '' : '(DRY RUN)'} ═══════════════════════════`);
  console.log('');
  if (!records.length) {
    console.log(`  No records in ${BACKUP_COLLECTION} for runId ${runId}.`);
    console.log('  Nothing to revert. (Check the runId — this is not an error.)');
    console.log('');
    return;
  }
  console.log(`   records          : ${records.length}`);
  console.log(`   source of truth  : ${BACKUP_COLLECTION} ONLY — no manifest, no liveness, no re-derivation`);
  console.log(`   mode             : ${COMMIT ? 'COMMIT — will write' : 'DRY RUN — nothing will be written'}`);
  console.log('');

  // ── pass 1: decide ────────────────────────────────────────────────────────
  const decided = [];
  for (const rec of records) {
    const doc = await db.collection(rec.collection).findOne(
      { _id: rec.documentId },
      { projection: { [rec.fieldPath]: 1 } },
    );
    decided.push({ rec, ...decideRevert(rec, doc) });
  }

  const byAction = new Map();
  for (const d of decided) byAction.set(d.action, (byAction.get(d.action) ?? 0) + 1);

  console.log(`  ${pad('decision', 22)} ${padL('fields', 8)}`);
  console.log(`  ${'-'.repeat(22)} ${'-'.repeat(8)}`);
  for (const a of [REVERT.RESTORE, REVERT.ALREADY_REVERTED, REVERT.CONFLICT, REVERT.MISSING]) {
    console.log(`  ${pad(a, 22)} ${padL(byAction.get(a) ?? 0, 8)}`);
  }
  console.log('');

  const conflicts = decided.filter((d) => d.action === REVERT.CONFLICT);
  const missing = decided.filter((d) => d.action === REVERT.MISSING);
  if (conflicts.length) {
    console.log('  ⚠ CONFLICTS — edited after this run wrote them. NOT touched:');
    for (const c of conflicts) {
      console.log(`      ${c.rec.collection} _id=${c.rec.documentId} ${c.rec.fieldPath}`);
      console.log(`         ${c.reason}${c.currentLength !== undefined ? ` (now ${c.currentLength} chars, expected ${c.expectedLength})` : ''}`);
    }
    console.log('');
  }
  if (missing.length) {
    console.log('  ⚠ MISSING — document or field gone. NOT recreated:');
    for (const m of missing) console.log(`      ${m.rec.collection} _id=${m.rec.documentId} ${m.rec.fieldPath} — ${m.reason}`);
    console.log('');
  }

  const toRestore = decided.filter((d) => d.action === REVERT.RESTORE);

  if (!COMMIT) {
    console.log(`  Would restore ${toRestore.length} field(s). Re-run with --commit to write.`);
    console.log('');
    return;
  }

  // ── pass 2: write ─────────────────────────────────────────────────────────
  let restored = 0;
  let lostRace = 0;
  for (const d of toRestore) {
    const { rec } = d;
    const res = await db.collection(rec.collection).updateOne(
      // The guard is repeated IN THE QUERY. Between pass 1 and now, someone
      // could have saved that article; matching on the exact newValue means
      // such a write simply does not match, rather than being overwritten.
      { _id: rec.documentId, [rec.fieldPath]: rec.newValue },
      { $set: { [rec.fieldPath]: rec.originalValue } },
    );
    if (res.matchedCount === 1) restored += 1;
    else lostRace += 1;
  }
  console.log(`  restored : ${restored}`);
  if (lostRace) console.log(`  ⚠ lost the race on ${lostRace} field(s) — changed between decide and write, left alone`);
  console.log('');

  // ── pass 3: verify, from freshly-read documents ───────────────────────────
  //
  // ONLY the records this revert claims to have handled are asserted
  // byte-identical. A conflict was SKIPPED on purpose and a missing document
  // cannot match anything — counting those as verification failures would
  // print a red "STOP" on a run that did exactly the right thing, and the
  // first person to see that would either halt needlessly or, worse, learn to
  // ignore the warning.
  const expectOriginal = new Set(
    decided
      .filter((d) => d.action === REVERT.RESTORE || d.action === REVERT.ALREADY_REVERTED)
      .map((d) => d.rec._id?.toString() ?? `${d.rec.collection} ${d.rec.documentId} ${d.rec.fieldPath}`),
  );
  const idOf = (rec) => rec._id?.toString() ?? `${rec.collection} ${rec.documentId} ${rec.fieldPath}`;

  const failures = [];
  let verified = 0;
  let skipped = 0;
  for (const rec of records) {
    if (!expectOriginal.has(idOf(rec))) { skipped += 1; continue; }
    const doc = await db.collection(rec.collection).findOne(
      { _id: rec.documentId },
      { projection: { [rec.fieldPath]: 1 } },
    );
    const v = verifyReverted(rec, doc);
    if (v.ok) verified += 1;
    else failures.push({ rec, ...v });
  }

  console.log(`── VERIFICATION — re-read from the database ${'─'.repeat(31)}`);
  console.log('');
  console.log(`  byte-identical to originalValue : ${verified} / ${verified + failures.length}`);
  if (skipped) {
    console.log(`  not asserted                    : ${skipped} (conflict or missing — skipped ON PURPOSE)`);
  }
  if (failures.length) {
    console.log('');
    console.log('  ✖ NOT byte-identical:');
    for (const f of failures) {
      console.log(`      ${f.rec.collection} _id=${f.rec.documentId} ${f.rec.fieldPath}`);
      console.log(`         ${f.reason}${f.firstDifferenceAt !== undefined ? ` — first difference at byte ${f.firstDifferenceAt}` : ''}`);
    }
    console.log('');
    console.log('  STOP. Do not proceed to Stage B until this is understood.');
  } else {
    console.log('  ✓ every field this revert handled matches its recorded original, byte for byte.');
  }
  console.log('');
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass --env-file=.env.local');

  // ── REVERT runs before everything else and shares nothing with it ─────────
  // No --checks, no manifest, no classifier: a revert must work on the day the
  // legacy server is off and Cloudinary is suspended. See lib/legacy-reference-
  // revert.mjs for why re-deriving would be the wrong instinct.
  if (REVERT_RUN) {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });
    await runRevert(mongoose.connection.db, REVERT_RUN);
    await mongoose.disconnect();
    return;
  }

  if (!CHECKS) {
    die('pass --checks <audit json from a --check run>. This script will not assume a reference is alive.');
  }
  if (APPLY) {
    die('--apply is not enabled in this build. This task is dry-run only.');
  }

  const liveness = loadDeadPaths(CHECKS);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });
  const db = mongoose.connection.db;

  // ── resolved facts the classifier refuses to guess at ─────────────────────
  const migrations = db.collection('legacy_file_migrations');

  const supersededBy = new Map();
  for (const r of await migrations.find({ status: 'superseded' }, { projection: { sourcePath: 1, supersededBy: 1 } }).toArray()) {
    if (r.sourcePath && r.supersededBy) supersededBy.set(r.sourcePath, r.supersededBy);
  }
  // The superseded replacement is the ONE decoded value written back. If it
  // ever contains a character that would need encoding, that assumption breaks.
  for (const [from, to] of supersededBy) {
    if (encodeURI(to) !== to) {
      die(`superseded replacement needs encoding, which this script does not do: ${from} → ${to}`);
    }
  }

  /**
   * Class 4 is the AMPERSAND files specifically — not every substituted id.
   *
   * 12 files carry `publicIdSubstituted`, under two different rules: six had
   * `&` replaced with `and`, and six had trailing whitespace trimmed. Only the
   * first six need the resolver: Cloudinary trims a trailing space when
   * resolving an id by itself, so the whitespace six already hit the right
   * asset through the static rewrite and are ordinary class 1.
   *
   * Filtering on the rule rather than on `publicIdSubstituted` keeps the class
   * counts honest. Lumping them together labelled six trailing-space files as
   * ampersand files, which would have sent a reader looking for an `&` that
   * was never there.
   */
  const substituted = await migrations
    .find({ publicIdSubstituted: true }, { projection: { sourcePath: 1, substitutionRule: 1 } })
    .toArray();
  const ampersandPaths = new Set(
    substituted
      .filter((r) => {
        const rules = [r.substitutionRule].flat().filter(Boolean).map(String);
        // Fall back to the path itself if the record ever stops carrying a
        // rule — the `&` is the observable fact, the rule name is metadata.
        return rules.some((x) => /ampersand/i.test(x)) || String(r.sourcePath).includes('&');
      })
      .map((r) => r.sourcePath).filter(Boolean),
  );

  /**
   * The manifest layer's evidence: paths that were actually downloaded from
   * the legacy server and uploaded SUCCESSFULLY. A row that exists but failed
   * to upload is evidence of the opposite, so the status filter is the point.
   */
  const uploadedPaths = new Set(
    (await migrations.find({ status: 'uploaded' }, { projection: { sourcePath: 1 } }).toArray())
      .map((r) => r.sourcePath).filter(Boolean),
  );

  const ctx = {
    manifestHas: (p) => uploadedPaths.has(p),
    deadPaths: liveness.dead,
    supersededBy,
    ampersandPaths,
    appendedFormats: APPENDED_FORMATS,
    imageExtensions: IMAGE_EXTENSIONS,
  };

  // ── scan ──────────────────────────────────────────────────────────────────
  const collections = (await db.listCollections().toArray())
    .map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();

  const byClass = new Map();
  const byCollection = new Map();
  const byFieldPath = new Map();
  const excludedCounts = new Map();
  const unclassified = [];
  const deadByDoc = new Map();
  const samples = new Map();          // class -> sample rows
  const idempotenceFailures = [];
  const overlapFailures = [];
  /** Every field value that would change: the unit of both apply and revert. */
  const plan = [];

  const touchedDocs = new Set();
  let refsTotal = 0;
  let refsChanged = 0;
  let refsUnchanged = 0;
  let fieldsChanged = 0;
  const stats = { depthTruncations: 0 };

  const bump = (map, key, n = 1) => map.set(key, (map.get(key) ?? 0) + n);

  for (const name of collections) {
    const excluded = EXCLUDED_COLLECTIONS.has(name);
    const cursor = db.collection(name).find({}, { batchSize: BATCH_SIZE });

    for await (const doc of cursor) {
      const docKey = `${name} ${doc._id}`;
      const edits = new Map();          // fieldPath -> { original, edits[] }

      walkStrings(doc, '', (value, fieldPath) => {
        const hits = extractLegacyUrls(value);
        if (!hits.length) return;

        for (const hit of hits) {
          if (excluded) { bump(excludedCounts, name); continue; }

          refsTotal += 1;
          const result = decideReference(hit.url, ctx);
          bump(byClass, result.cls);
          bump(byCollection, `${name}|${result.cls}`);
          bump(byFieldPath, `${name}.${fieldPath}|${result.cls}`);

          if (result.cls === CLASS.UNCLASSIFIED) {
            unclassified.push({
              collection: name, _id: String(doc._id), fieldPath,
              raw: hit.url, reason: result.reason,
            });
          }
          if (result.cls === CLASS.DEAD) {
            const k = `${name} ${doc._id}`;
            if (!deadByDoc.has(k)) deadByDoc.set(k, new Map());
            bump(deadByDoc.get(k), result.targetPath);
          }

          if (!REWRITING_CLASSES.has(result.cls) || result.replacement === null) {
            refsUnchanged += 1;
            continue;
          }

          // IDEMPOTENCE, proven rather than claimed: the replacement must
          // classify as a no-op on a second pass.
          const second = decideReference(result.replacement, ctx);
          if (REWRITING_CLASSES.has(second.cls) && second.replacement !== null) {
            idempotenceFailures.push({
              collection: name, _id: String(doc._id), fieldPath,
              raw: hit.url, first: result.replacement, second: second.replacement,
            });
          }

          refsChanged += 1;
          touchedDocs.add(docKey);
          if (!edits.has(fieldPath)) edits.set(fieldPath, { original: value, list: [] });
          edits.get(fieldPath).list.push({
            start: hit.start, end: hit.end, replacement: result.replacement,
            cls: result.cls, before: hit.url,
          });

          // Bucket PER CLASS. A flat "first N" fills up on the two common
          // classes and never reaches `superseded` (there is exactly one in
          // the database) or `ampersand` (nine), which are precisely the
          // classes a reviewer most needs to see.
          if (!samples.has(result.cls)) samples.set(result.cls, []);
          const bucket = samples.get(result.cls);
          if (bucket.length < SAMPLE_PER_CLASS) {
            bucket.push({
              cls: result.cls, collection: name, _id: String(doc._id), fieldPath,
              before: hit.url, after: result.replacement, reason: result.reason,
            });
          }
        }
      }, 0, stats);

      // Build the new field values exactly as --apply would, so a range bug
      // surfaces in the dry run rather than in production.
      for (const [fieldPath, { original, list }] of edits) {
        try {
          const next = applyEdits(original, list);
          if (next === original) continue;
          fieldsChanged += 1;
          plan.push({
            collection: name,
            _id: doc._id,
            fieldPath,
            original,
            next,
            edits: list.map((e) => ({ cls: e.cls, before: e.before, after: e.replacement })),
          });
        } catch (err) {
          overlapFailures.push({ collection: name, _id: String(doc._id), fieldPath, error: err.message });
        }
      }
    }
  }

  // ── report ────────────────────────────────────────────────────────────────
  const line = (n = 74) => '─'.repeat(n);

  console.log('');
  console.log('══ PHASE 2 — LEGACY REFERENCE REWRITE ═════ DRY RUN, NOTHING WRITTEN ══════');
  console.log('');
  console.log(`   database        : ${db.databaseName}`);
  console.log(`   liveness input  : ${path.relative(process.cwd(), liveness.file)}`);
  console.log(`   ...generated at : ${liveness.generatedAt}`);
  console.log(`   dead paths      : ${liveness.dead.size}  (confirmed 404/410 only)`);
  if (liveness.unknownPaths) {
    const detail = [...liveness.unknown.entries()].sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s}×${n}`).join(', ');
    console.log(`   UNKNOWN liveness: ${liveness.unknownPaths}  — ${detail}`);
    console.log('                     these are rewritten but were NOT confirmed alive.');
    if (liveness.unknown.has(429)) {
      console.log('                     ⚠ 429 = the legacy server rate-limited the check.');
      console.log('                       Re-check at lower concurrency before --apply.');
    }
  }
  console.log(`   superseded map  : ${supersededBy.size}    ampersand files: ${ampersandPaths.size}`);
  console.log('');

  console.log(`── COUNTS BY CLASS ${line(56)}`);
  console.log('');
  const CLASS_ORDER = [
    [CLASS.DIRECT, '1. direct absolute/protocol-relative → root-relative'],
    [CLASS.DERIVATIVE, '2. Drupal styles/ derivative → source path'],
    [CLASS.SUPERSEDED, '3. superseded .jpeg → surviving .png'],
    [CLASS.AMPERSAND, '4. ampersand file → path unchanged, host stripped'],
    [CLASS.MANIFEST_RESOLVED, '5. pattern refused → resolved from the MANIFEST'],
    [CLASS.ALREADY_RELATIVE, '   already correct — left BYTE-IDENTICAL'],
    [CLASS.DEAD, '   confirmed dead — left untouched, deliberately'],
    [CLASS.NOT_A_FILE, '   page link, not a file — out of scope'],
    [CLASS.UNCLASSIFIED, '   COULD NOT CLASSIFY — never guessed at'],
  ];
  console.log(`  ${pad('class', 52)} ${padL('refs', 8)}`);
  console.log(`  ${'-'.repeat(52)} ${'-'.repeat(8)}`);
  for (const [cls, label] of CLASS_ORDER) {
    console.log(`  ${pad(label, 52)} ${padL(byClass.get(cls) ?? 0, 8)}`);
  }
  console.log(`  ${'-'.repeat(52)} ${'-'.repeat(8)}`);
  console.log(`  ${pad('TOTAL references examined', 52)} ${padL(refsTotal, 8)}`);
  console.log('');
  console.log(`  documents that would be touched : ${touchedDocs.size}`);
  console.log(`  field values that would change  : ${fieldsChanged}`);
  console.log(`  references changed              : ${refsChanged}`);
  console.log(`  references left alone           : ${refsUnchanged}`);
  console.log('');

  console.log(`── BY COLLECTION ${line(58)}`);
  console.log('');
  const collSet = [...new Set([...byCollection.keys()].map((k) => k.split('|')[0]))].sort();
  console.log(`  ${pad('collection', 26)} ${CLASS_ORDER.map(([c]) => padL(c.slice(0, 7), 8)).join('')}`);
  console.log(`  ${'-'.repeat(26)} ${CLASS_ORDER.map(() => '-'.repeat(8)).join('')}`);
  for (const c of collSet) {
    const cells = CLASS_ORDER.map(([cls]) => padL(byCollection.get(`${c}|${cls}`) ?? 0, 8)).join('');
    console.log(`  ${pad(c, 26)} ${cells}`);
  }
  console.log('');

  console.log(`── BY FIELD PATH (rewriting classes only) ${line(33)}`);
  console.log('');
  const fieldRows = [...byFieldPath.entries()]
    .filter(([k]) => REWRITING_CLASSES.has(k.split('|')[1]))
    .reduce((m, [k, n]) => { const f = k.split('|')[0]; m.set(f, (m.get(f) ?? 0) + n); return m; }, new Map());
  console.log(`  ${pad('collection.fieldPath', 56)} ${padL('refs', 8)}`);
  console.log(`  ${'-'.repeat(56)} ${'-'.repeat(8)}`);
  for (const [f, n] of [...fieldRows.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(ellipsis(f, 56), 56)} ${padL(n, 8)}`);
  }
  console.log('');

  // ── samples, covering every class ─────────────────────────────────────────
  console.log(`── SAMPLE BEFORE / AFTER — every rewriting class ${line(26)}`);
  console.log('');
  // Round-robin across classes so the printed set covers every class before it
  // spends its budget on the biggest one.
  const chosen = [];
  const buckets = [...REWRITING_CLASSES].map((c) => samples.get(c) ?? []);
  for (let i = 0; chosen.length < SAMPLE_SIZE; i += 1) {
    const before = chosen.length;
    for (const b of buckets) if (b[i] && chosen.length < SAMPLE_SIZE) chosen.push(b[i]);
    if (chosen.length === before) break;
  }
  for (const [i, s] of chosen.entries()) {
    console.log(`  ${padL(i + 1, 3)}. [${s.cls}]  ${s.collection} _id=${s._id} ${s.fieldPath}`);
    console.log(`       before : ${ellipsis(s.before, 100)}`);
    console.log(`       after  : ${ellipsis(s.after, 100)}`);
    console.log('');
  }
  const missing = CLASS_ORDER.filter(([c]) => REWRITING_CLASSES.has(c))
    .filter(([c]) => !chosen.some((s) => s.cls === c));
  if (missing.length) {
    console.log(`  ⚠ no sample available for: ${missing.map(([c]) => c).join(', ')}`);
    console.log('');
  }

  // ── dead links, grouped by document ───────────────────────────────────────
  console.log(`── DEAD LINKS — NOT REWRITTEN ${line(45)}`);
  console.log('');
  console.log('  Rewriting these would produce a tidy-looking path that still 404s,');
  console.log('  which is worse than leaving them obviously broken. Content decision.');
  console.log('');
  const PROMOTION_CALLOUT = '69f84c1aaac437056dfc0053';
  const deadRows = [...deadByDoc.entries()]
    .map(([k, m]) => ({ doc: k, refs: [...m.values()].reduce((a, b) => a + b, 0), paths: m }))
    .sort((a, b) => b.refs - a.refs);
  const callout = deadRows.filter((r) => r.doc.includes(PROMOTION_CALLOUT));
  const rest = deadRows.filter((r) => !r.doc.includes(PROMOTION_CALLOUT));

  const deadSources = new Set();
  for (const r of deadRows) for (const p of r.paths.keys()) deadSources.add(p);
  console.log(`  ${deadSources.size} distinct dead sources across ${deadRows.reduce((a, r) => a + r.refs, 0)} references, in ${deadRows.length} documents.`);
  console.log('');

  if (callout.length) {
    console.log('  ⚠ CALLED OUT SEPARATELY — a content cleanup decision, not a migration step:');
    for (const r of callout) {
      console.log(`      ${r.doc}  —  ${r.refs} references, ${r.paths.size} distinct dead files`);
      for (const [p, n] of [...r.paths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
        console.log(`         ${padL(n, 4)} × ${ellipsis(p, 84)}`);
      }
      if (r.paths.size > 6) console.log(`         … and ${r.paths.size - 6} more distinct files`);
    }
    console.log('');
  }

  console.log(`  ${pad('document', 46)} ${padL('refs', 6)} ${padL('files', 6)}`);
  console.log(`  ${'-'.repeat(46)} ${'-'.repeat(6)} ${'-'.repeat(6)}`);
  for (const r of rest) {
    console.log(`  ${pad(r.doc, 46)} ${padL(r.refs, 6)} ${padL(r.paths.size, 6)}`);
  }
  console.log('');

  // ── everything the script refused to decide ───────────────────────────────
  console.log(`── UNCLASSIFIED — listed in full, never guessed at ${line(24)}`);
  console.log('');
  if (!unclassified.length) {
    console.log('  none.');
  } else {
    for (const u of unclassified) {
      console.log(`  ${u.collection} _id=${u._id} ${u.fieldPath}`);
      console.log(`     raw    : ${u.raw}`);
      console.log(`     reason : ${u.reason}`);
    }
  }
  console.log('');

  // ── excluded collections ──────────────────────────────────────────────────
  console.log(`── COLLECTIONS DELIBERATELY NOT REWRITTEN ${line(33)}`);
  console.log('');
  for (const [name, why] of EXCLUDED_COLLECTIONS) {
    const n = excludedCounts.get(name) ?? 0;
    console.log(`  ${pad(name, 26)} ${padL(n, 7)} refs`);
    console.log(`     ${why}`);
  }
  console.log('');

  // ── the stage A slice ─────────────────────────────────────────────────────
  const { chosen: stageA, missing: stageAMissing } = selectStageA(plan);
  console.log(`── STAGE A SLICE — what --stage a would write ${line(29)}`);
  console.log('');
  console.log('  Constructed to cover every rewriting class plus the encoding and');
  console.log('  multi-reference cases, NOT the first N the cursor happened to yield.');
  console.log('');
  console.log(`  ${stageA.length} field value(s) across ${new Set(stageA.map((p2) => `${p2.collection} ${p2._id}`)).size} document(s), ${stageA.reduce((a, p2) => a + p2.edits.length, 0)} references.`);
  console.log('');
  for (const [i, item] of stageA.entries()) {
    const covers = STAGE_A_REQUIREMENTS.filter(([, pred]) => pred(item)).map(([l]) => l);
    console.log(`  ${padL(i + 1, 3)}. ${item.collection} _id=${item._id} ${item.fieldPath}  (${item.edits.length} refs)`);
    console.log(`       covers : ${covers.join(' · ')}`);
    for (const e of item.edits.slice(0, 3)) {
      console.log(`       [${e.cls}] ${ellipsis(e.before, 86)}`);
      console.log(`         → ${ellipsis(e.after, 86)}`);
    }
    if (item.edits.length > 3) console.log(`       … and ${item.edits.length - 3} more references in this field`);
    console.log('');
  }
  if (stageAMissing.length) {
    console.log(`  ⚠ NO plan item satisfies: ${stageAMissing.join(', ')}`);
    console.log('    Stage A cannot demonstrate those cases; verify them by hand.');
    console.log('');
  } else {
    console.log('  ✓ every requirement is covered by the slice above.');
    console.log('');
  }

  // ── the checks that would abort an --apply ────────────────────────────────
  console.log(`── PRE-APPLY GATES ${line(56)}`);
  console.log('');
  console.log(`  idempotence : ${idempotenceFailures.length === 0 ? '✓ every replacement is a no-op on a second pass' : `✖ ${idempotenceFailures.length} FAILURES`}`);
  for (const f of idempotenceFailures.slice(0, 10)) {
    console.log(`      ${f.collection} ${f._id} ${f.fieldPath}: ${f.first} → ${f.second}`);
  }
  console.log(`  range safety: ${overlapFailures.length === 0 ? '✓ no overlapping edits in any field' : `✖ ${overlapFailures.length} FAILURES`}`);
  for (const f of overlapFailures.slice(0, 10)) {
    console.log(`      ${f.collection} ${f._id} ${f.fieldPath}: ${f.error}`);
  }
  if (stats.depthTruncations) {
    console.log(`  ⚠ ${stats.depthTruncations} document subtrees deeper than ${MAX_DEPTH} were not walked.`);
  }
  console.log('');

  const stale = (Date.now() - Date.parse(liveness.generatedAt)) / 86_400_000;
  console.log('══ NOTHING WAS WRITTEN. No collection was created or modified. ════════════');
  console.log('');
  console.log(`  Before --apply: re-run the audit with --check. The liveness snapshot used`);
  console.log(`  here is ${stale.toFixed(1)} day(s) old, and a stale one both rewrites newly-dead links`);
  console.log(`  and skips newly-alive ones.`);
  console.log('');

  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
