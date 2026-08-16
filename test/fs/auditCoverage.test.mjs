import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readSourceForScanning, scrubSource } from '../sourceScan.mjs';
import { isValidPair } from '@/lib/audit/auditContract';
import { SWEPT_FILES } from '@/lib/audit/sweptMenus';

// Audit-coverage guard for the files the sweep has actually reached.
//
// I previously argued this guard would be vacuous. That was true with zero
// files swept; with one it is not, and prototyping the matcher against a single
// file is much cheaper than meeting 38 of them at once. SWEPT_FILES is the
// whole widening mechanism: rounds 2-6 add a line each.
//
// WHAT THIS GUARD CANNOT SEE, and no text scanner can:
//   · whether the call RUNS. This is a shape guard. An audit call inside an
//     `if (false)` branch, or after an early return, satisfies it.
//   · whether the recorded values are RIGHT — that recordId is the stored key
//     rather than the raw argument, that `before` was captured before the
//     delete, that `after` is the patch and not the whole document. Those are
//     §8.7's contract and they are checked by review, not here.
//   · a call reached through a helper in another file. The sweep's shape puts
//     the call in the action body, so today that is not a gap; the day someone
//     writes `logRoleChange()` in a helper, this guard reports a false red and
//     the fix is to teach it the helper name, not to delete the assertion.
//   · anything outside SWEPT_FILES. That is the point — an unswept file is
//     explicitly absent, never silently exempt.
//
// It reads through readSourceForScanning, which strips comments and imports.
// Six matcher defects in this repo all reduced to the same mistake: matching
// TEXT that is not CODE. The control below proves a `recordAdminAction` call
// written inside a comment does not satisfy this guard.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// SWEPT_FILES now lives in src/lib/audit/sweptMenus.js and is imported, not
// listed here. Phase 3b needed the same information at RUNTIME — the inline
// history widget must tell "no history for this record" apart from "this menu
// is not instrumented yet" — and src/ cannot import from test/. One list, two
// derived views; a second hand-kept copy is the failure mode this repo has hit
// twice already (the two classifiers in §8.9, the fourteen copies of refNo).

/** Exports in a swept file that are known NOT to mutate, and why. */
const READ_ONLY_EXPORTS = {
  'src/lib/actions/roles.js': ['listRolesFull'],
  'src/lib/actions/registrations.js': ['listRegistrations', 'getRegistrationById', 'getRegistrationStatusCounts'],
  // listInhouseRegistrations and getInhouseStatusCounts were deleted unused —
  // /admin/registrations lists both collections through registrations.js. The
  // CONTROL below asserts every exempted name still EXISTS, so a stale entry
  // here would go red rather than quietly exempt nothing.
  'src/lib/actions/inhouse-registrations.js': ['getInhouseRegistrationById'],
  'src/lib/actions/career-path-registrations.js': [
    'getCareerPathRegistrations', 'getCareerPathRegistrationById',
  ],
  'src/lib/actions/masterclass-registrations.js': [
    'listMasterclassRegistrations', 'getMasterclassRegStatusCounts', 'getMasterclassRegistrationById',
    'getMasterclassCourseOptions', 'getMasterclassBatchOptions',
  ],
  'src/lib/actions/schedules.js': ['getScheduleLocals'],
  'src/lib/actions/course-extensions.js': [
    'getCourseExtension', 'getCourseExtensionByAlias', 'listCourseExtensions',
  ],
};

/**
 * Mutating exports that are deliberately NOT logged, each with its reason.
 *
 * A LIST, never a pattern. A pattern grows silently — someone adds a matching
 * name and it is exempt before anyone reads the diff. Every entry here is a
 * decision someone made and can be argued with.
 */
const NOT_LOGGED = {
  'src/lib/actions/career-path-registrations.js': {
    createCareerPathRegistration:
      'NOT an admin action — a public visitor submitting the /career-path-register ' +
      'form (§4). There is no admin actor to record, and an admin log that contains ' +
      'visitor writes stops answering "who on the team did this".',
  },
};

/**
 * Exports whose `entity` is COMPUTED rather than a literal, with the complete
 * set of values the computation can produce.
 *
 * Not a waiver. A text guard cannot read `entity: entityForSource(source)`, but
 * the values that expression can yield are knowable and small, so they are
 * declared here and checked against the contract exactly like a literal would
 * be. The obligation moves from "the matcher can see it" to "a human wrote down
 * what it produces" — and if that list is wrong, the pair assertion below is
 * what says so.
 */
const COMPUTED_ENTITY = {
  'src/lib/actions/registrations.js': {
    // `source` selects the collection and therefore the entity. It arrives from
    // the client, so entityForSource() normalises it: 'inhouse' or 'public',
    // never anything else. That normalisation is the primary check; the
    // writer's fail-closed reduction is only the backstop.
    updateRegistrationStatus: ['public', 'inhouse'],
    updateRegistration:       ['public', 'inhouse'],
    deleteRegistration:       ['public', 'inhouse'],
  },
};

/**
 * Exports whose `menu` cannot be compared against a requireAdmin literal.
 *
 * A LIST with a reason each, for the same reason as NOT_LOGGED.
 */
const MENU_CHECK_EXEMPT = {
  'src/lib/actions/masterclass-registrations.js': {
    updateMasterclassRegistrationAttendees:
      'Calls BARE requireAdmin() with no page key, so there is no literal to ' +
      'compare against — any logged-in admin may edit attendee personal data here, ' +
      'while the two actions either side of it guard on mc_registrations. §4 flags ' +
      'this as a likely oversight, REPORTED AND NOT FIXED: tightening it could lock ' +
      'out someone who can do this today, which is a permissions decision rather ' +
      'than a drive-by in an audit commit. The menu is hardcoded at the call site.',
  },
};

/**
 * Split a scrubbed module into its top-level exported functions.
 *
 * Bounded by the NEXT `export ... function` (or end of file) rather than by a
 * brace match: brace counting on scrubbed text is the kind of cleverness that
 * fails on a template literal, and the sweep's actions are flat top-level
 * declarations. Returns `{ name, body }`.
 */
function exportedFunctions(src) {
  const re = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm;
  const heads = [...src.matchAll(re)].map((m) => ({ name: m[1], at: m.index }));
  return heads.map((h, i) => ({
    name: h.name,
    body: src.slice(h.at, i + 1 < heads.length ? heads[i + 1].at : src.length),
  }));
}

/** The pageKey literal passed to requireAdmin() inside one function body. */
function requireAdminKey(body) {
  const m = body.match(/requireAdmin\(\s*'([^']*)'\s*\)/);
  return m ? m[1] : null;
}

/**
 * Either audit entry point.
 *
 * `recordAdminActionAfter` is what call sites use; `recordAdminAction` is the
 * awaited writer underneath it. A matcher for `recordAdminAction(` does NOT
 * match `recordAdminActionAfter(` — the `After` sits between the name and the
 * paren — so this optional group is load-bearing, not defensive. Both are
 * accepted because a call site that legitimately needs to await (none today,
 * but round 6's route handlers may) is still instrumented.
 */
const AUDIT_CALL = /recordAdminAction(?:After)?\(/;

/** Does this function body call either audit entry point? */
function callsAudit(body) {
  return AUDIT_CALL.test(body);
}

/** The menu literal passed to the audit call inside one function body. */
function recordedMenu(body) {
  const m = body.match(/recordAdminAction(?:After)?\(\{[\s\S]*?menu:\s*'([^']*)'/);
  return m ? m[1] : null;
}

/** The entity literal passed to the audit call inside one function body. */
function recordedEntity(body) {
  const m = body.match(/recordAdminAction(?:After)?\(\{[\s\S]*?entity:\s*'([^']*)'/);
  return m ? m[1] : null;
}

/**
 * A direct write: Mongo, OR MSDB over HTTP.
 *
 * THE MSDB HALF WAS MISSING AND IT WAS A SILENT FALSE-GREEN. `courses.js`
 * writes exclusively through `msdbCreate/msdbUpdate/msdbDelete` and never
 * touches Mongo, so all three of its exports were classified NON-MUTATING and
 * skipped by the coverage assertion — it would have reported full coverage over
 * a `courses` sweep that instrumented nothing.
 *
 * Note where the pattern came from: §6 of docs/admin-audit-log-plan.md already
 * lists the MSDB writers in ITS classifier. The doc's walker saw them; this one
 * did not. Two classifiers that have to agree, written at different times, with
 * nothing forcing agreement — so the count assertion further down now pins this
 * one's result and states the gap, rather than leaving the two to drift again.
 */
const WRITE_CALL =
  /\.(?:create|insertMany|updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|findOneAndReplace|findOneAndDelete|findByIdAndDelete|deleteOne|deleteMany|bulkWrite|replaceOne|save)\s*\(|\b(?:msdbCreate|msdbUpdate|msdbDelete)\s*\(/;

/**
 * Every top-level function, exported or not, bounded like exportedFunctions().
 * The non-exported ones matter only as write-carrying helpers.
 */
function allFunctions(src) {
  const re = /^(export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm;
  const heads = [...src.matchAll(re)].map((m) => ({
    exported: Boolean(m[1]), name: m[2], at: m.index,
  }));
  return heads.map((h, i) => ({
    ...h,
    body: src.slice(h.at, i + 1 < heads.length ? heads[i + 1].at : src.length),
  }));
}

/**
 * Every function in a module — exported or not — that writes DIRECTLY or
 * through a LOCAL helper in the same file.
 *
 * §6's heuristic. The local-helper clause is load-bearing: without it
 * `pageBuilder.js`'s ten section/preview actions read as inert, because they
 * write through `saveSections` / `setPreview`. Fixed point rather than one
 * pass, so a helper that calls a helper resolves.
 */
const mutFnCache = new Map();
function mutatingFunctions(rel) {
  if (mutFnCache.has(rel)) return mutFnCache.get(rel);
  const fns = allFunctions(scanned(rel));
  const mutates = new Set(fns.filter((f) => WRITE_CALL.test(f.body)).map((f) => f.name));

  let grew = true;
  while (grew) {
    grew = false;
    for (const f of fns) {
      if (mutates.has(f.name)) continue;
      for (const other of fns) {
        if (other.name === f.name || !mutates.has(other.name)) continue;
        if (new RegExp(`\\b${other.name}\\s*\\(`).test(f.body)) {
          mutates.add(f.name);
          grew = true;
          break;
        }
      }
    }
  }

  mutFnCache.set(rel, mutates);
  return mutates;
}

// ── the imported-helper walk ────────────────────────────────────────
//
// THE BLIND SPOT THIS CLOSES. Everything above stops at the file boundary, so
// an export writing only through an IMPORTED helper reads as inert and the
// coverage assertion skips it — green, and the file never gets swept. That is
// the same failure as WRITE_CALL before the MSDB fix, and that one was caught
// by luck: somebody happened to know `createCourse` calls `msdbCreate`. §6 has
// carried the gap in prose since it was written, and §2 papers over it by
// HARDCODING three helper names.
//
// ── IT RESOLVES THE SYMBOL, NOT THE MODULE, AND THAT IS THE WHOLE DESIGN ────
// The question asked is "does THIS imported function write", never "does the
// module it came from contain a write somewhere". Getting that wrong in the
// loose direction is worse than the blind spot: every export importing anything
// from a module that happens to contain a writer would classify as mutating,
// the guard would start demanding audit calls inside read-only exports, and the
// first person to meet that turns the guard off. `pageBuilder.js` is the live
// proof that the distinction is real — `verifyPreviewPassword` writes and
// `getPageBuilderPageBySlugAny` does not, and previewAccess.js imports both.

/** Resolve an import specifier to a repo-relative path, or null if it is not ours. */
function resolveSpec(spec, fromRel) {
  let base;
  if (spec.startsWith('@/')) base = path.join('src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.join(path.dirname(fromRel), spec);
  else return null; // bare: next/*, mongoose, bcryptjs, crypto, next-auth
  base = base.split(path.sep).join('/');
  for (const cand of [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`, `${base}/index.jsx`]) {
    if (/\.(js|jsx)$/.test(cand) && existsSync(path.join(ROOT, cand))) return cand;
  }
  return null;
}

/**
 * `localName -> {rel, imported}` for every NAMED import of an in-repo module.
 *
 * Read with imports KEPT (the default reader strips them — they are normally
 * noise, and here they are the subject). `import { x as y }` maps `y` back to
 * the EXPORTED name `x`, because that is what the target file declares.
 *
 * DEFAULT and NAMESPACE imports are not followed. Measured, not assumed: all 56
 * default imports across the action modules target `@/models/*`, which are the
 * objects WRITE_CALL matches methods on rather than helpers to evaluate, and
 * there are no namespace imports at all. A default-exported helper function
 * would be a real gap — there simply is not one today, and the control below
 * pins that.
 */
/**
 * `{ a, b as c }` → [{imported:'a', local:'a'}, {imported:'b', local:'c'}].
 *
 * SPLIT OUT SO THE ALIAS BRANCH IS TESTABLE, and that was not a guess: a control
 * that broke the alias handling — resolving the LOCAL name instead of the
 * exported one — reddened NOTHING, because no action module aliases an import
 * today and the logic could only be reached through real source. A pure function
 * can be handed the shape that does not exist yet, which is the only way to know
 * it works before it does.
 */
function parseNamedSpecifiers(clause) {
  const braces = clause.match(/\{([\s\S]*)\}/);
  if (!braces) return [];
  const out = [];
  for (const piece of braces[1].split(',')) {
    const t = piece.trim();
    if (!t) continue;
    const [imported, alias] = t.split(/\s+as\s+/).map((x) => x.trim());
    const local = alias ?? imported;
    if (/^[A-Za-z0-9_$]+$/.test(local) && /^[A-Za-z0-9_$]+$/.test(imported)) {
      out.push({ imported, local });
    }
  }
  return out;
}

const importCache = new Map();
function namedImports(rel) {
  if (importCache.has(rel)) return importCache.get(rel);
  const out = new Map();
  const src = readSourceForScanning(path.join(ROOT, rel), { stripImports: false });
  for (const m of src.matchAll(/^[ \t]*import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/gm)) {
    const target = resolveSpec(m[2], rel);
    if (!target) continue;
    for (const { imported, local } of parseNamedSpecifiers(m[1])) {
      out.set(local, { rel: target, imported });
    }
  }
  importCache.set(rel, out);
  return out;
}

/**
 * How many import hops the walk will make.
 *
 * ONE, and the number is measured rather than picked. At depth 1 the classifier
 * finds four exports the file-local heuristic misses; at depth 2 and depth 3 it
 * finds exactly the same four. Nothing in this repo currently needs a second
 * hop, so paying for one would buy a slower walk over `src/lib/**` and more
 * chances to over-fire on something like `dbConnect`. The assertion below pins
 * that deeper is not different, so the day it becomes different the guard says
 * so instead of quietly under-reporting.
 */
const IMPORT_WALK_DEPTH = 1;

/**
 * Does the imported symbol `rel#symbol` write, within `depth` further hops?
 *
 * `seen` breaks import cycles. A symbol that is not a top-level `function`
 * declaration in the target — an arrow const, a class, a re-export, a binding
 * destructured from a call like NextAuth() — cannot be evaluated and returns
 * false. That is stated rather than hidden: see the blind-spot test.
 */
function symbolWrites(rel, symbol, depth = IMPORT_WALK_DEPTH - 1, seen = new Set()) {
  const key = `${rel}#${symbol}`;
  if (seen.has(key)) return false;
  seen.add(key);

  const fn = allFunctions(scanned(rel)).find((f) => f.name === symbol);
  if (!fn) return false;                       // not a function declaration here
  if (mutatingFunctions(rel).has(symbol)) return true;
  if (depth <= 0) return false;

  for (const [local, target] of namedImports(rel)) {
    if (!new RegExp(`\\b${local}\\s*\\(`).test(fn.body)) continue;
    if (symbolWrites(target.rel, target.imported, depth - 1, seen)) return true;
  }
  return false;
}

/**
 * The names of every MUTATING export in one module — direct, via a local
 * helper, or via an IMPORTED one.
 *
 * WHAT IT STILL CANNOT SEE: a computed model or method name; a write performed
 * by a route handler (§5.3); anything reaching the collection from outside this
 * repo; and — the one this walk adds to the list — a helper that is not a
 * top-level `function` declaration in its own module. `whyMutating` is exported
 * shape so the delta can be reported per export rather than as a number.
 */
function whyMutating(rel, depth = IMPORT_WALK_DEPTH) {
  const local = mutatingFunctions(rel);
  const imports = namedImports(rel);
  const out = new Map();

  for (const f of allFunctions(scanned(rel)).filter((x) => x.exported)) {
    if (local.has(f.name)) { out.set(f.name, 'local'); continue; }
    if (depth < 1) continue;
    for (const [localName, target] of imports) {
      if (!new RegExp(`\\b${localName}\\s*\\(`).test(f.body)) continue;
      if (symbolWrites(target.rel, target.imported, depth - 1)) {
        out.set(f.name, `${localName} -> ${target.rel}#${target.imported}`);
        break;
      }
    }
  }
  return out;
}

function mutatingExports(rel, depth = IMPORT_WALK_DEPTH) {
  return [...whyMutating(rel, depth).keys()];
}

const scanCache = new Map();
function scanned(relPath) {
  if (!scanCache.has(relPath)) scanCache.set(relPath, readSourceForScanning(path.join(ROOT, relPath)));
  return scanCache.get(relPath);
}

function actionModules() {
  return readdirSync(path.join(ROOT, 'src', 'lib', 'actions'))
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => `src/lib/actions/${f}`);
}

// ── the guard ──────────────────────────────────────────────────────

test('SWEPT_FILES is non-empty and every entry is scannable', () => {
  // A guard whose input list quietly emptied would pass every assertion below
  // by iterating nothing. This is the meta-control for the whole file.
  assert.ok(SWEPT_FILES.length > 0, 'the sweep has reached at least one file');
  for (const rel of SWEPT_FILES) {
    const src = scanned(rel);
    assert.ok(src.length > 0, `${rel} is empty or unreadable`);
    assert.ok(
      exportedFunctions(src).length > 0,
      `${rel} has no exported functions — wrong path, or the matcher broke`
    );
  }
});

// The parse check that used to live here has MOVED to test/fs/actionsParse.test.mjs
// and now covers every src/lib/actions module, not just the swept ones. Scoping
// it to SWEPT_FILES was fixing the symptom in one file: nothing in this suite
// imports ANY action module, so a syntax error in an unswept one was equally
// invisible. It is not audit-log work and no longer lives in an audit guard.

// ── the classifier itself, tested WITHOUT going through SWEPT_FILES ──
//
// The MSDB blind spot survived because the classifier was only ever observed
// through the swept files, and no swept file contains an MSDB write. A guard
// component that can only be exercised via its consumers has no controls of its
// own — so these two assertions run it over an UNSWEPT file on purpose.

test('the classifier sees MSDB writes — courses.js is mutating despite touching no Mongo', () => {
  // `courses.js` is UNSWEPT (round 3) and is the exact file the blind spot hid.
  // All three of its exports write only through msdbCreate/msdbUpdate/msdbDelete
  // over HTTP, so before the pattern gained those names they read as inert and
  // the coverage assertion skipped them silently.
  const mutating = mutatingExports('src/lib/actions/courses.js');
  for (const name of ['createCourse', 'updateCourse', 'deleteCourse']) {
    assert.ok(
      mutating.includes(name),
      `courses.js::${name} must classify as mutating — it writes to MSDB. If this ` +
      'reddens, the coverage guard is skipping the round-3 files while reporting ' +
      'full coverage'
    );
  }
});

test('CONTROL: those three are invisible to the Mongo half of the pattern alone', () => {
  // Proves the assertion above is carried by the MSDB alternation rather than
  // passing for some other reason — `courses.js` genuinely contains no Mongo
  // write call, so a Mongo-only matcher finds nothing in it.
  const MONGO_ONLY =
    /\.(?:create|insertMany|updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|findOneAndReplace|findOneAndDelete|findByIdAndDelete|deleteOne|deleteMany|bulkWrite|replaceOne|save)\s*\(/;
  const src = scanned('src/lib/actions/courses.js');
  assert.equal(MONGO_ONLY.test(src), false, 'courses.js contains no Mongo write at all');
  assert.ok(WRITE_CALL.test(src), 'but the real pattern does match it');
});

/**
 * The count this classifier produces over all action modules.
 *
 * MEASURED: 161 = 157 file-local + 4 reached through an IMPORTED helper.
 *
 * ── WHAT MOVED IT ───────────────────────────────────────────────────────────
 * The imported-helper walk. Before it, this number was 157 and the four below
 * were invisible — classified inert, skipped by the coverage assertion, and
 * therefore able to be swept green without a single audit call:
 *
 *   career-paths.js::syncCareerPathsAction  -> career-paths/syncCareerPaths.js#syncCareerPaths
 *   faqs.js::syncFaqsAction                 -> faqs/syncFaqs.js#syncFaqs
 *   promotions.js::syncPromotionsAction     -> promotions/syncPromotions.js#syncPromotions
 *   previewAccess.js::submitPreviewPassword -> actions/pageBuilder.js#verifyPreviewPassword
 *
 * The walk only ADDS: no export lost its classification, which is asserted
 * below rather than assumed — an export that stopped being mutating would mean
 * the walk had broken the file-local heuristic it wraps.
 *
 * ── RECONCILIATION WITH §2's 159 ────────────────────────────────────────────
 * §2 was written before the article rework, which was net +1 (three ordering
 * exports retired, four added). So §2's basis today is 160, not 159.
 *
 * The remaining difference is ONE, in this classifier's favour, and it is
 * `previewAccess.js::submitPreviewPassword` — which neither §2 nor §6 lists.
 * §2 counted the three `sync*Action` exports only because §6 HARDCODES their
 * helper names; it never had a mechanism, so it caught the three someone
 * happened to know about and missed the fourth. The walk finds all four
 * structurally, which is the point: §6's hardcoded list is now redundant, and
 * removing it is a follow-up rather than part of this change.
 *
 * NOT reconciled by bending either side. 161 is what the classifier measured
 * when that paragraph was written; 160 is what §2 would say today; the gap is
 * the finding, and it is unchanged by anything since.
 *
 * ── 161 → 162: moveArticleToRank ────────────────────────────────────────────
 * ONE new export in articles.js — move an article to a rank the admin typed. It
 * mutates through the file-local `applyPlan` helper, so the FILE-LOCAL
 * classifier sees it and the depth-0 figure in W2-b moves with it, 157 → 158.
 * Both numbers had to move or the two would disagree by construction: 162 is
 * 158 plus the four exports only the import walk can see, and W2-b asserts
 * exactly that sum. Bumping only the total would have left the delta assertion
 * red and taught the next reader that the sum is decorative.
 *
 * Pinned rather than floored: a number nobody wrote down is one nobody notices
 * drifting. When the sweep adds or removes an action, this moves deliberately in
 * that commit.
 *
 * (This used to cite EXPECTED_TESTS in test/run.mjs as the precedent. That
 * control is a FLOOR now, so it is no longer an argument for pinning — the
 * reasoning above stands on its own.)
 *
 * ── 162 → 163: deleteMediaFile ──────────────────────────────────────────────
 * ONE new export in media.js — /admin/media v2's per-file delete. It writes
 * directly (LegacyFileMigration.updateOne, marking a migration row `deleted`
 * rather than removing it), so the FILE-LOCAL classifier sees it
 * and the depth-0 figure in W2-b moves with it, 158 → 159. Both numbers move
 * together for the same reason the articles.js change did: 163 is 159 plus the
 * four exports only the import walk can see, and W2-b asserts exactly that sum.
 *
 * media.js is NOT in SWEPT_FILES and that is deliberate, not an oversight — it
 * DOES record an audit row. See the note at the foot of src/lib/audit/
 * sweptMenus.js for why a file written instrumented from the start is absent
 * from a list that tracks a retrofit.
 *
 * ── 163 → 164: course-outlines.js ──────────────────────────────────────────
 * The new module src/lib/actions/course-outlines.js adds TWO exports, and only
 * ONE of them moves this number:
 *
 *   recordCourseOutlineUpload  writes Mongo directly (CourseOutlineFile
 *                              .findOneAndUpdate, recording which bytes landed
 *                              and bumping the version counter), so the
 *                              FILE-LOCAL classifier sees it → +1 here and +1
 *                              in W2-b's depth-0 figure, 159 → 160.
 *   signCourseOutlineUpload    signs a browser-direct Cloudinary upload and
 *                              writes NOTHING — not Mongo, not MSDB. It is
 *                              correctly classified read-only and is absent
 *                              from both counts, even though it does record an
 *                              audit row (signing a destructive overwrite is an
 *                              event worth logging whether or not it mutates
 *                              our own storage).
 *
 * ── 164 → 165: webroot-documents.js ────────────────────────────────────────
 * The site-root PDF replacement module adds THREE exports, and again only ONE
 * moves the number:
 *
 *   recordWebrootReplacement   WebrootDocumentFile.create() — append-only, one
 *                              row per replacement → +1 here, and +1 in W2-b's
 *                              depth-0 figure, 160 → 161.
 *   prepareWebrootReplacement  archives the previous bytes to Blob and returns
 *                              authorisation. It writes to the BLOB STORE, not
 *                              to Mongo or MSDB, so the classifier does not see
 *                              it — correctly, since the classifier is about
 *                              OUR databases. It records an audit row anyway,
 *                              because destroying-then-replacing a public
 *                              document is an event regardless of where the
 *                              bytes live.
 *   listWebrootReplacements    read-only.
 *
 * Both numbers still differ by exactly the four REACHED_THROUGH_IMPORT exports.
 *
 * ── 164 → 165, and W2-b's depth-0 figure 160 → 161, for cache-console.js ───
 *
 *   applyMirrorReset      calls Model.deleteMany, so the FILE-LOCAL classifier
 *                         sees it. It is the only export in this repo whose
 *                         purpose is to DELETE rows in bulk, which is why it
 *                         carries three separate refusal gates before the call.
 *   previewMirrorReset    reads and computes; writes nothing. Correctly
 *                         classified read-only and absent from both counts —
 *                         and that absence is load-bearing rather than
 *                         incidental, since a preview that mutated anything
 *                         would defeat the preview-before-apply ruling.
 *   listMirrorResetKeys   returns a constant list. Read-only.
 *
 * ── prepareWebrootReplacement gains a Mongo write ──────────────────────────
 * The upload route refuses to mint a Blob token without a single-use receipt,
 * and `prepareWebrootReplacement` is what issues one — so the export that
 * previously touched only the Blob store now writes to Mongo as well.
 *
 * IT MOVES THE DEPTH-1 TOTAL AND NOT THE DEPTH-0 FIGURE, which is the whole
 * reason the walk exists. The write is `WebrootUploadReceipt.create(...)` inside
 * `issueWebrootReceipt`, in src/lib/webroot/receiptStore.js — an IMPORTED
 * helper. The file-local classifier sees `issueWebrootReceipt(doc)` and reads it
 * as an ordinary call, exactly as it read `syncFaqsAction` before the walk.
 *
 * That this entry is a live one matters: the four before it were all found
 * during the walk's own construction, so none of them tested whether the walk
 * still works on code written afterwards. This one was.
 *
 * (receiptStore.js is deliberately `.js` and not `.mjs`. resolveSpec below only
 * follows `.js`/`.jsx`, so a `.mjs` helper would be invisible to the walk and
 * this export would keep reading as non-mutating while writing to Mongo — a hole
 * in the guard, dressed as a file-extension preference. The store's own header
 * says so too.)
 */
// 165 → 166 for round 4's applySnapshotOverride. It writes the snapshot through
// syncLandingData, which it imports STATICALLY for exactly this reason: this
// walk resolves static imports only, so a dynamic one classified a mutating,
// snapshot-writing export as read-only — and "every mutating export records an
// audit row" then skipped it in silence. The classification was correct by luck
// rather than by the guard, which is the state this file exists to prevent.
// previewSnapshotOverride reads the stored refusal and writes nothing.
//
// Then saveProgramCourseOrder (program-order.js — the /admin/courses
// drag-reorder write, ProgramOrder.findOneAndUpdate) and renameCourseCodePhase1
// (course-rename.js — the genesis-side half of a course-code rename across
// twelve Mongo stores). Both are file-local and direct, so each lands in W2-b's
// depth-0 figure too and neither changes the delta between the two figures.
// `inspectRenameState` only re-runs the read-only preview and stays out.
//
// ══ MERGED 2026-08-17: dev + wip/root-files ═══════════════════════════════
// Both branches moved this pin (dev to 168, wip/root-files to 166), so neither
// side's number describes the merged tree and the conflict could not be
// resolved by taking a side.
//
// IT IS ALSO NOT THE SUM, and that was demonstrated rather than assumed: the
// obvious arithmetic gives 171, and the walk run against the merged tree
// reports 170. The two lines of work overlap — recordWebrootReplacement is
// counted in both branches' figures — so adding the deltas double-counts it.
// A pin is a measurement, not a sum: 170 and the depth-0 figure 164 were both
// read back off the mechanism with the pins set to deliberately-wrong
// placeholders. 170 − 164 = 6, which is exactly the six entries now in
// REACHED_THROUGH_IMPORT.
const MUTATING_EXPORT_COUNT = 170;

/** The exports only the import walk can see, and the chain that decides each. */
const REACHED_THROUGH_IMPORT = Object.freeze({
  'src/lib/actions/career-paths.js': { syncCareerPathsAction: 'src/lib/career-paths/syncCareerPaths.js#syncCareerPaths' },
  'src/lib/actions/faqs.js': { syncFaqsAction: 'src/lib/faqs/syncFaqs.js#syncFaqs' },
  'src/lib/actions/promotions.js': { syncPromotionsAction: 'src/lib/promotions/syncPromotions.js#syncPromotions' },
  'src/lib/actions/previewAccess.js': { submitPreviewPassword: 'src/lib/actions/pageBuilder.js#verifyPreviewPassword' },
  // Round 4. `applySnapshotOverride` writes nothing itself — it re-runs the
  // landing sync with the downgrade guard bypassed for one call, so the write
  // is syncLandingData's. The import is STATIC precisely so this walk can see
  // it; with a dynamic import the export read as read-only and the "every
  // mutating export records an audit row" check skipped it in silence.
  'src/lib/actions/cache-console.js': { applySnapshotOverride: 'src/lib/landing/syncLandingData.js#syncLandingData' },
  // ══ MERGED: this is a UNION, not a choice ═══════════════════════════════
  // Each branch added a different entry and BOTH are true of the merged tree —
  // `applySnapshotOverride` reaches syncLandingData, `prepareWebrootReplacement`
  // reaches issueWebrootReceipt, and each is a real import-crossing write that
  // the file-local classifier cannot see. Taking either side alone would delete
  // a live entry and the delta assertion below would then disagree with the
  // measured counts by construction.
  'src/lib/actions/webroot-documents.js': { prepareWebrootReplacement: 'src/lib/webroot/receiptStore.js#issueWebrootReceipt' },
});

test('the mutating-export count across every action module is pinned', () => {
  const total = actionModules()
    .reduce((n, rel) => n + mutatingExports(rel).length, 0);
  assert.equal(
    total, MUTATING_EXPORT_COUNT,
    'the number of mutating exports changed. If you added or removed an action ' +
    'that is expected — bump the constant in the same commit and update the note ' +
    'above. If you did not, a classifier change moved it, and that is the bug'
  );
});

test('CONTROL: the count is over every module, not a subset that happens to sum right', () => {
  // A count assertion is satisfiable by iterating the wrong list. Anchor the
  // input the same way actionsParse does: named modules that must be present,
  // and a total larger than any single file could contribute.
  const modules = actionModules();
  for (const anchor of ['src/lib/actions/courses.js', 'src/lib/actions/roles.js', 'src/lib/actions/pageBuilder.js']) {
    assert.ok(modules.includes(anchor), `${anchor} missing from the scanned set`);
  }
  assert.ok(modules.length >= 40, `only ${modules.length} action modules found`);
  const perFile = modules.map((rel) => mutatingExports(rel).length);
  assert.ok(Math.max(...perFile) < MUTATING_EXPORT_COUNT, 'no single file supplies the whole count');
  assert.ok(perFile.filter((n) => n > 0).length > 20, 'the count is spread across many files');
});

// ── the imported-helper walk, tested on its own ──────────────────────
//
// Same discipline as the MSDB fix: the walk gets controls of its own rather
// than being observable only through the count, which is exactly how the last
// blind spot survived review.

test('W1-a — an export reached through an imported WRITER is classified mutating', () => {
  for (const [rel, expected] of Object.entries(REACHED_THROUGH_IMPORT)) {
    const why = whyMutating(rel);
    for (const [name, chain] of Object.entries(expected)) {
      assert.ok(
        why.has(name),
        `${rel}::${name} writes through an imported helper and must classify as ` +
        'mutating. Without the walk it reads as inert and the coverage assertion ' +
        'skips it — the file can then be swept green with no audit call in it.'
      );
      assert.equal(
        why.get(name).split(' -> ')[1], chain,
        `${rel}::${name} is mutating for a DIFFERENT reason than expected. The chain ` +
        'is part of the claim: if it changed, either the helper moved or the walk is ' +
        'firing on something else.'
      );
    }
  }
});

test('W1-b — CONTROL: the walk resolves the SYMBOL, not the module', () => {
  // THE CONTROL THAT MATTERS. Getting this loose is worse than the blind spot:
  // every export importing anything from a module that happens to contain a
  // write would classify as mutating, the guard would demand audit calls inside
  // readers, and the first person to meet that turns it off.
  //
  // `pageBuilder.js` is the live proof, and it is the module the walk actually
  // follows for previewAccess.js — one of its exports writes and another does
  // not, and previewAccess imports BOTH.
  const rel = 'src/lib/actions/pageBuilder.js';
  assert.equal(
    symbolWrites(rel, 'verifyPreviewPassword'), true,
    'verifyPreviewPassword writes: it resets failedAttempts / sets lockedUntil'
  );
  assert.equal(
    symbolWrites(rel, 'getPageBuilderPageBySlugAny'), false,
    'getPageBuilderPageBySlugAny is a READER in the same module. If this reads as ' +
    'a writer the walk is module-scoped, and the guard is about to start demanding ' +
    'audit calls in read-only exports.'
  );
  assert.equal(symbolWrites(rel, 'thisSymbolDoesNotExist'), false, 'an unknown symbol is not a writer');
});

test('W1-c — CONTROL: an export that only imports FROM a writing module stays read-only', () => {
  // The export-level half of W1-b. roles.js imports recordAdminActionAfter from
  // a module that also holds recordAdminAction, which writes; listRolesFull
  // calls neither and must stay classified read-only.
  const why = whyMutating('src/lib/actions/roles.js');
  assert.equal(
    why.has('listRolesFull'), false,
    'listRolesFull is a read-only export in a file that imports from a module ' +
    'containing a writer. Classifying it mutating is the over-fire this walk must ' +
    'not commit.'
  );
  assert.ok(why.has('createRole'), 'while the real mutators in the same file are still seen');
  // …and the import really is there, so this is not passing for want of an edge.
  assert.ok(
    namedImports('src/lib/actions/roles.js').has('recordAdminActionAfter'),
    'roles.js must genuinely import from that module, or this control proves nothing'
  );
  assert.ok(
    mutatingFunctions('src/lib/audit/recordAdminAction.js').has('recordAdminAction'),
    'and that module must genuinely contain a writer'
  );
});

test('W1-d — the resolver maps `import { x as y }` back to the exported name, and skips bare specifiers', () => {
  // An alias resolved to the LOCAL name would look up a symbol the target file
  // does not declare, and silently return "does not write" for every aliased
  // import in the repo.
  const imports = namedImports('src/lib/actions/previewAccess.js');
  assert.equal(imports.get('verifyPreviewPassword')?.imported, 'verifyPreviewPassword');
  assert.equal(imports.get('verifyPreviewPassword')?.rel, 'src/lib/actions/pageBuilder.js');

  assert.equal(resolveSpec('next/cache', 'src/lib/actions/roles.js'), null, 'bare specifier');
  assert.equal(resolveSpec('mongoose', 'src/lib/actions/roles.js'), null, 'bare specifier');
  assert.equal(
    resolveSpec('@/lib/audit/recordAdminAction', 'src/lib/actions/roles.js'),
    'src/lib/audit/recordAdminAction.js',
    'an @/ specifier resolves to a repo path'
  );
  assert.equal(resolveSpec('@/lib/nope/missing', 'src/lib/actions/roles.js'), null, 'and a missing one is null');

  // THE ALIAS BRANCH HAS NO LIVE INSTANCE — no action module aliases an import
  // today — so it is proved on the parser directly. Discovered by running the
  // control: resolving the LOCAL name instead of the exported one reddened
  // nothing at all while this logic was only reachable through real source.
  assert.deepEqual(
    parseNamedSpecifiers('{ syncFaqs as doTheSync }'),
    [{ imported: 'syncFaqs', local: 'doTheSync' }],
    'an alias must resolve to the EXPORTED name — looking up the local one finds no ' +
    'declaration in the target and silently answers "does not write"'
  );
  assert.deepEqual(
    parseNamedSpecifiers('{ a, b as c, d }'),
    [{ imported: 'a', local: 'a' }, { imported: 'b', local: 'c' }, { imported: 'd', local: 'd' }],
    'mixed plain and aliased specifiers'
  );
  assert.deepEqual(parseNamedSpecifiers('Default'), [], 'a default import yields no named specifier');
  assert.deepEqual(parseNamedSpecifiers('* as ns'), [], 'nor does a namespace import');
  assert.deepEqual(parseNamedSpecifiers('Model, { helper }'), [{ imported: 'helper', local: 'helper' }],
    'and a mixed default+named import contributes only its named half');

  assert.equal(
    actionModules().flatMap((rel) => [...namedImports(rel)]).filter(([local, t]) => local !== t.imported).length,
    0,
    'if an action module ever DOES alias an import, delete this assertion and let the ' +
    'real edge carry the branch instead of the synthetic one'
  );
});

test('W2-a — the walk depth is 1, and going deeper classifies IDENTICALLY', () => {
  // The bound, measured rather than asserted by fiat. If a second hop ever
  // changes the answer this reddens, and the choice gets re-made deliberately
  // instead of the guard quietly under-reporting.
  assert.equal(IMPORT_WALK_DEPTH, 1);
  const at = (d) => actionModules().map((rel) => `${rel}:${mutatingExports(rel, d).sort().join(',')}`).join('|');
  const one = at(1);
  assert.equal(at(2), one, 'depth 2 finds nothing depth 1 does not');
  assert.equal(at(3), one, 'nor does depth 3');
});

test('W2-b — CONTROL: the depth parameter is live, and depth 0 reproduces the pre-walk count', () => {
  // Without this, W2-a passes for a walk that ignores `depth` entirely.
  const zero = actionModules().reduce((n, rel) => n + mutatingExports(rel, 0).length, 0);
  assert.equal(
    zero, 164,
    'depth 0 must reproduce the file-local classifier exactly. 157 was the pinned ' +
    'count before this walk existed; it then moved for moveArticleToRank ' +
    '(articles.js, mutates through a file-local helper), deleteMediaFile ' +
    '(media.js, writes directly), recordCourseOutlineUpload (course-outlines.js, ' +
    'CourseOutlineFile.findOneAndUpdate), applyMirrorReset (cache-console.js, ' +
    'Model.deleteMany), recordWebrootReplacement (webroot-documents.js, ' +
    'WebrootDocumentFile.create), saveProgramCourseOrder (program-order.js, ' +
    'ProgramOrder.findOneAndUpdate) and renameCourseCodePhase1 (course-rename.js). ' +
    'Deliberately NOT in this figure: previewMirrorReset and listMirrorResetKeys ' +
    '(a preview that mutated would defeat its own ruling), signCourseOutlineUpload, ' +
    'and prepareWebrootReplacement — the last writes Mongo only through an ' +
    'IMPORTED helper, which is precisely what depth 0 cannot see. ' +
    'MERGED 2026-08-17: both branches moved this pin, so the value below was ' +
    'MEASURED against the merged tree rather than summed'
  );
  assert.equal(
    zero + Object.values(REACHED_THROUGH_IMPORT).reduce((n, m) => n + Object.keys(m).length, 0),
    MUTATING_EXPORT_COUNT,
    'and the delta is exactly the exports named in REACHED_THROUGH_IMPORT. '
    + 'Both applySnapshotOverride (→ syncLandingData) and prepareWebrootReplacement '
    + '(→ receiptStore.js#issueWebrootReceipt) reach their write across an import, '
    + 'so both are in that map and neither is in the depth-0 figure. If only one of '
    + 'the two numbers moved, they now disagree by construction and one is wrong'
  );
});

test('W3-b — the walk only ADDS: no export lost its mutating classification', () => {
  // Both directions, as asked. An export that WAS mutating and now is not means
  // the walk broke the file-local heuristic it wraps, which would be a far worse
  // regression than the gap it closes.
  for (const rel of actionModules()) {
    const before = new Set(mutatingExports(rel, 0));
    const after = new Set(mutatingExports(rel, IMPORT_WALK_DEPTH));
    for (const name of before) {
      assert.ok(after.has(name), `${rel}::${name} was mutating and is no longer — the walk is subtracting`);
    }
  }
});

test('W3-c — the three sync*Action exports are found STRUCTURALLY, not by naming their helpers', () => {
  // §6 counts these three only because it HARDCODES `syncFaqs`,
  // `syncCareerPaths` and `syncPromotions` in its own walker. The claim here is
  // that this classifier needs none of that: it follows the import statement.
  //
  // THE CLAIM IS ABOUT THE MATCHER, not about this file's text. A first draft
  // asserted the guard's source contains none of the three names and defeated
  // itself immediately — to check that the names are absent you have to write
  // them down, and the loop's own `['syncFaqs', …]` array satisfied the very
  // pattern it was searching for. What actually matters is that the thing doing
  // the classifying does not know them.
  for (const helper of ['syncFaqs', 'syncCareerPaths', 'syncPromotions', 'verifyPreviewPassword']) {
    assert.equal(
      WRITE_CALL.source.includes(helper), false,
      `WRITE_CALL names '${helper}'. The walk must reach it by resolving the import, ` +
      'or this is §6\'s hardcode with extra steps.'
    );
  }

  // REACHED_THROUGH_IMPORT is an EXPECTATION, like §2's inventory — never an
  // input. Proof: the classifier reaches the same verdict from a module path
  // alone, with the map nowhere in the call.
  for (const rel of ['src/lib/actions/faqs.js', 'src/lib/actions/career-paths.js', 'src/lib/actions/promotions.js']) {
    const found = [...whyMutating(rel)].filter(([, why]) => why !== 'local');
    assert.equal(found.length, 1, `${rel} must have exactly one import-reached export`);
    assert.match(found[0][0], /^sync\w+Action$/, `${rel}: ${found[0][0]} is the sync action`);
    assert.match(
      found[0][1], /^sync\w+ -> src\/lib\/[\w-]+\/sync\w+\.js#sync\w+$/,
      `${rel}: the chain is resolved from the import, not asserted from a list`
    );
  }
});

test('W-t — TRIPWIRE: the audit writer is not a DOMAIN write', () => {
  // `recordAdminAction` writes (Model.create), and every swept action file
  // imports `recordAdminActionAfter` from that module. If the scheduler ever
  // reads as a writer, EVERY export that merely logs becomes "mutating" — the
  // guard would then require an audit call in an export whose only write IS the
  // audit call, which is circular, and would classify a read-only export that
  // logs as a mutator.
  //
  // It does not today: the scheduler passes `recordAdminAction` as a default
  // parameter value and calls it through a local `record` binding, so the
  // local-helper matcher does not fire. That is a fact about the current shape,
  // not a guarantee — hence a tripwire rather than an exemption list, which
  // would be dead weight while the answer is already correct.
  const rel = 'src/lib/audit/recordAdminAction.js';
  assert.equal(symbolWrites(rel, 'recordAdminAction'), true, 'the awaited writer does write');
  assert.equal(
    symbolWrites(rel, 'recordAdminActionAfter'), false,
    'the SCHEDULER now reads as a writer. Decide deliberately: either exclude it ' +
    'from the walk with a stated reason, or accept that every logging export is ' +
    'classified mutating. Do not just bump the count.'
  );
});

test('every mutating export in a swept file records an audit row', () => {
  for (const rel of SWEPT_FILES) {
    const src = scanned(rel);
    const exempt = READ_ONLY_EXPORTS[rel] ?? [];
    const notLogged = NOT_LOGGED[rel] ?? {};
    // ONE classifier, shared with the count assertion above. Asking "does this
    // body contain a write" separately here is how the two walkers drifted in
    // the first place.
    const mutating = new Set(mutatingExports(rel));
    for (const { name, body } of exportedFunctions(src)) {
      if (exempt.includes(name)) continue;
      if (name in notLogged) continue;
      if (!mutating.has(name)) continue;
      assert.ok(
        callsAudit(body),
        `${rel}::${name} mutates but never calls recordAdminAction — this is ` +
        'the escape route Option A leaves open, and closing it is what this ' +
        'guard exists for'
      );
    }
  }
});

test('CONTROL: the read-only exempt list is real, not a blanket', () => {
  // Without this, listing every export as read-only would make the test above
  // vacuous. Prove each exempted export genuinely contains no write call.
  for (const [rel, names] of Object.entries(READ_ONLY_EXPORTS)) {
    const src = scanned(rel);
    const present = new Set(exportedFunctions(src).map((f) => f.name));
    const mutating = new Set(mutatingExports(rel));
    for (const name of names) {
      assert.ok(present.has(name), `${rel}::${name} is exempted but does not exist`);
      assert.ok(
        !mutating.has(name),
        `${rel}::${name} is on the read-only list but the classifier says it mutates`
      );
    }
  }
});

test('CONTROL: the write-call matcher finds the writes that are really there', () => {
  // If WRITE_CALL matched nothing, "every mutating export records a row" would
  // pass by skipping every function. Assert the known mutators are detected.
  const src = scanned('src/lib/actions/roles.js');
  const byName = new Map(exportedFunctions(src).map((f) => [f.name, f.body]));
  for (const name of ['createRole', 'updateRole', 'deleteRole']) {
    assert.ok(byName.has(name), `roles.js::${name} not found`);
    assert.ok(WRITE_CALL.test(byName.get(name)), `${name} must read as mutating`);
  }
});

test('the recorded menu matches the requireAdmin literal in the same function', () => {
  // Two copies of the same string typed independently is how the menu and the
  // guard drift apart — and a row filed under the wrong menu is invisible to
  // the permission clamp that uses that field.
  for (const rel of SWEPT_FILES) {
    const exemptMenu = MENU_CHECK_EXEMPT[rel] ?? {};
    for (const { name, body } of exportedFunctions(scanned(rel))) {
      if (!callsAudit(body)) continue;
      if (name in exemptMenu) continue;
      const guard = requireAdminKey(body);
      const menu = recordedMenu(body);
      assert.ok(guard, `${rel}::${name} logs but has no requireAdmin literal`);
      assert.ok(menu, `${rel}::${name} calls recordAdminAction with no menu literal`);
      assert.equal(
        menu, guard,
        `${rel}::${name} guards on '${guard}' but logs menu '${menu}'`
      );
    }
  }
});

test('CONTROL: every exemption names a real export, and has a stated reason', () => {
  // The failure mode of an exemption list is that it outlives the thing it
  // exempts, or that it grows an entry nobody justified. Both turn it into a
  // hole. Every key must resolve to an export that still exists, and every
  // reason must be substantial enough to have been written on purpose.
  const lists = [['NOT_LOGGED', NOT_LOGGED], ['MENU_CHECK_EXEMPT', MENU_CHECK_EXEMPT]];
  for (const [listName, list] of lists) {
    for (const [rel, entries] of Object.entries(list)) {
      assert.ok(SWEPT_FILES.includes(rel), `${listName} names ${rel}, which is not swept`);
      const present = new Set(exportedFunctions(scanned(rel)).map((f) => f.name));
      for (const [fn, reason] of Object.entries(entries)) {
        assert.ok(present.has(fn), `${listName}: ${rel}::${fn} no longer exists`);
        assert.ok(
          typeof reason === 'string' && reason.length > 40,
          `${listName}: ${rel}::${fn} has no real reason — an exemption without ` +
          'one is a hole, not a decision'
        );
      }
    }
  }
});

test('CONTROL: the menu-check exemption is narrow — its neighbours are still checked', () => {
  // The exempted action sits between two that DO guard on a literal. If the
  // exemption were file-wide rather than per-export, those two would stop being
  // compared and the drift this assertion exists to catch would go unnoticed on
  // the very file that motivated the exemption.
  const rel = 'src/lib/actions/masterclass-registrations.js';
  const byName = new Map(exportedFunctions(scanned(rel)).map((f) => [f.name, f.body]));
  for (const name of ['updateMasterclassRegistrationStatus', 'deleteMasterclassRegistration']) {
    const body = byName.get(name);
    assert.ok(body, `${name} not found`);
    assert.equal(name in (MENU_CHECK_EXEMPT[rel] ?? {}), false, `${name} must NOT be exempt`);
    assert.equal(requireAdminKey(body), 'mc_registrations', `${name} guards on a literal`);
    assert.equal(recordedMenu(body), 'mc_registrations', 'and logs the same one');
  }
  // And the exempted one genuinely has no literal to compare against.
  const exempted = byName.get('updateMasterclassRegistrationAttendees');
  assert.ok(exempted, 'the exempted action must exist');
  assert.equal(
    requireAdminKey(exempted), null,
    'if this ever gains a page key, DELETE the exemption rather than keeping it'
  );
  assert.equal(recordedMenu(exempted), 'mc_registrations', 'the hardcoded menu is still asserted');
});

test('every recorded (menu, entity) pair is legal under the contract', () => {
  // Ties the call sites to src/lib/audit/auditContract.js. `entity` is
  // free-form in the schema, so this is the only thing standing between a typo
  // and rows the inline history widget can never find.
  for (const rel of SWEPT_FILES) {
    const computed = COMPUTED_ENTITY[rel] ?? {};
    for (const { name, body } of exportedFunctions(scanned(rel))) {
      if (!callsAudit(body)) continue;
      const menu = recordedMenu(body);

      // A computed entity is checked against its DECLARED value set instead of
      // a literal — every value it can produce must be a contract pair.
      if (name in computed) {
        for (const entity of computed[name]) {
          assert.ok(
            isValidPair(menu, entity),
            `${rel}::${name} can compute entity '${entity}', and ${menu}|${entity} ` +
            'is not a contract pair'
          );
        }
        continue;
      }

      const entity = recordedEntity(body);
      assert.ok(entity, `${rel}::${name} records no entity literal`);
      assert.ok(
        isValidPair(menu, entity),
        `${rel}::${name} records ${menu}|${entity}, which is not a contract pair`
      );
    }
  }
});

test('the `courses` menu records BOTH key spaces, from two different files', () => {
  // Round 3 is the first sweep round to exercise the dual-key-space decision
  // (§8.7 ruling (e)): courses.js logs an MSDB ObjectId under `courses|course`,
  // course-extensions.js logs the `course_id` CODE under `courses|extension`.
  // Both pairs must be legal, or the writer's fail-closed reduction would strip
  // half the menu's payloads to act_only and warn on every save.
  const seen = new Map();
  for (const rel of ['src/lib/actions/courses.js', 'src/lib/actions/course-extensions.js']) {
    for (const { name, body } of exportedFunctions(scanned(rel))) {
      if (!callsAudit(body)) continue;
      const menu = recordedMenu(body);
      const entity = recordedEntity(body);
      assert.equal(menu, 'courses', `${rel}::${name} must file under the courses menu`);
      assert.ok(isValidPair(menu, entity), `${menu}|${entity} is not a contract pair`);
      seen.set(entity, (seen.get(entity) ?? 0) + 1);
    }
  }
  assert.deepEqual(
    [...seen.keys()].sort(), ['course', 'extension'],
    'both entities must be present — one file alone exercises only one key space, ' +
    'which is exactly why course-extensions.js was pulled into round 3'
  );
});

test('CONTROL: round 3 records entities as LITERALS, so COMPUTED_ENTITY is not needed', () => {
  // The test above reads entity literals. If any round-3 action computed its
  // entity the way registrations.js does, recordedEntity() would return null,
  // isValidPair(menu, null) would be false, and that test would redden for a
  // confusing reason. Assert the literal-ness directly so the failure is legible.
  for (const rel of ['src/lib/actions/courses.js', 'src/lib/actions/schedules.js', 'src/lib/actions/course-extensions.js']) {
    assert.equal(
      rel in COMPUTED_ENTITY, false,
      `${rel} is in COMPUTED_ENTITY — if an entity there became computed, declare ` +
      'its value set rather than leaving the pair assertion to fail obscurely'
    );
    for (const { name, body } of exportedFunctions(scanned(rel))) {
      if (!callsAudit(body)) continue;
      assert.ok(
        recordedEntity(body),
        `${rel}::${name} records no entity LITERAL — it is computed, and needs a ` +
        'COMPUTED_ENTITY declaration'
      );
    }
  }
});

test('the deleteCourse label read is UNCACHED', () => {
  // A cached read logs the course's name from BEFORE a rename, and the row then
  // asserts the wrong thing about a record that no longer exists to correct it.
  // resolveIds.js:26 caches for 300 s with no tag; getPublicCourse is tagged at
  // 1 h. Neither is safe for this. `revalidate: 0` is client.js's documented
  // no-store signal and is the only acceptable form here.
  const src = scanned('src/lib/actions/courses.js');
  const fn = allFunctions(src).find((f) => f.name === 'readCourseUncached');
  assert.ok(fn, 'readCourseUncached must exist — it is the label read');
  assert.match(
    fn.body, /revalidate:\s*0\b/,
    'the label read must pass revalidate: 0 (cache: no-store). Without it a ' +
    'renamed course is logged under its old name at the moment it is deleted'
  );
  assert.doesNotMatch(
    fn.body, /params:\s*\{\s*_id:/,
    'must filter on `course`, never `_id` — upstream silently ignores `_id` and ' +
    'returns the entire course list, so the label would be some other course'
  );
});

test('CONTROL: the cache assertion rejects the shapes it is meant to', () => {
  // Without this, /revalidate:\s*0/ could be satisfied by any text and the
  // assertion above would be decorative.
  const CACHE_OK = /revalidate:\s*0\b/;
  for (const bad of [
    "aiFetch('/public-course', { params: { course: id } })",
    "aiFetch('/public-course', { params: { course: id }, revalidate: 300 })",
    'resolveCourseObjectId(code)',
  ]) {
    assert.equal(CACHE_OK.test(bad), false, `"${bad}" must not read as uncached`);
  }
  assert.ok(CACHE_OK.test("aiFetch('/x', { revalidate: 0 })"), 'and the real form must');
});

test('an audit call never re-parses an overloaded signature — RULING 2', () => {
  // updateSchedule(idOrFormData, maybeFormData) resolves its id once, into a
  // local. The audit call must reuse that local and must NOT mention the raw
  // parameters: two parsers of one overload can disagree, and when they do the
  // row names a record nobody touched, with the write succeeding and no symptom
  // anywhere. Stated as a general rule because ~148 sites remain.
  const OVERLOAD_PARAMS = /\b(idOrFormData|maybeFormData)\b/;
  for (const rel of SWEPT_FILES) {
    for (const { name, body } of exportedFunctions(scanned(rel))) {
      if (!callsAudit(body)) continue;
      const call = body.slice(body.search(AUDIT_CALL));
      assert.doesNotMatch(
        call, OVERLOAD_PARAMS,
        `${rel}::${name} references a raw overload parameter inside its audit ` +
        'call. Log the value the action USED, not a second reading of the args'
      );
    }
  }
});

test('CONTROL: updateSchedule really is overloaded, so the rule above has a subject', () => {
  // If the signature were ever normalised, the assertion above would pass by
  // having nothing to catch — and nobody would notice it had stopped meaning
  // anything.
  const fn = allFunctions(scanned('src/lib/actions/schedules.js'))
    .find((f) => f.name === 'updateSchedule');
  assert.ok(fn, 'updateSchedule must exist');
  assert.match(fn.body, /\bidOrFormData\b/, 'it is still the overloaded form');
  assert.match(fn.body, /instanceof FormData/, 'and still discriminates on the arg type');
});

test('CONTROL: a computed-entity declaration is not an escape hatch', () => {
  // Two ways this list could go quietly wrong: it names an export that does not
  // compute its entity (so a real literal stops being checked), or it declares
  // an empty set (so the loop above iterates nothing and passes). Both would
  // read as coverage.
  for (const [rel, entries] of Object.entries(COMPUTED_ENTITY)) {
    assert.ok(SWEPT_FILES.includes(rel), `COMPUTED_ENTITY names ${rel}, which is not swept`);
    const byName = new Map(exportedFunctions(scanned(rel)).map((f) => [f.name, f.body]));
    for (const [fn, values] of Object.entries(entries)) {
      const body = byName.get(fn);
      assert.ok(body, `COMPUTED_ENTITY: ${rel}::${fn} no longer exists`);
      assert.ok(values.length > 0, `${rel}::${fn} declares no values — nothing would be checked`);
      assert.equal(
        recordedEntity(body), null,
        `${rel}::${fn} DOES record an entity literal — remove it from COMPUTED_ENTITY ` +
        'so the literal is checked directly'
      );
    }
  }
});

test('CONTROL: a recordAdminAction call inside a COMMENT does not satisfy the guard', () => {
  // The defect this whole suite keeps relearning: matching TEXT that is not
  // CODE. Six guards in this repo have shipped with it. `readSourceForScanning`
  // strips comments, so a commented-out call must be invisible — otherwise a
  // developer could satisfy the coverage guard by describing the call they did
  // not write.
  // Both spellings, so widening the matcher to accept recordAdminActionAfter
  // cannot accidentally make comments count again.
  const fake = [
    'export async function deleteThing(id) {',
    "  await requireAdmin('roles');",
    '  await Thing.deleteOne({ _id: id });',
    '  // TODO: recordAdminAction({ menu: \'roles\', entity: \'role\' })',
    '  /* recordAdminActionAfter({ menu: \'roles\' }) — not written yet */',
    '  return { ok: true };',
    '}',
  ].join('\n');

  assert.ok(callsAudit(fake), 'the raw text DOES mention it');

  const scrubbedSrc = scrubSource(fake);
  assert.ok(
    !callsAudit(scrubbedSrc),
    'after scrubbing, a commented-out call must be gone — a guard that counted ' +
    'it would be satisfiable by a comment'
  );

  const [fn] = exportedFunctions(scrubbedSrc);
  assert.equal(fn.name, 'deleteThing');
  assert.ok(WRITE_CALL.test(fn.body), 'and it still reads as mutating');
  assert.ok(
    !callsAudit(fn.body),
    'so this function would correctly FAIL the coverage assertion'
  );
});

test('CONTROL: the widened matcher accepts BOTH names and still rejects neither', () => {
  // Widening a matcher is where guards go quietly permissive. `recordAdminAction(`
  // does not match `recordAdminActionAfter(` — the `After` sits between the name
  // and the paren — so the optional group is load-bearing. Prove it accepts both
  // real spellings and rejects a body that calls neither, plus the near-misses
  // that must NOT count.
  assert.ok(callsAudit('recordAdminAction({ menu: 1 })'), 'the awaited writer counts');
  assert.ok(callsAudit('recordAdminActionAfter({ menu: 1 })'), 'the scheduler counts');
  for (const miss of [
    'await Thing.deleteOne({});',
    'recordAudit({ pageId: 1 })',
    'recordAdminActionLater({})',
    'myRecordAdminAction',
  ]) {
    assert.ok(!callsAudit(miss), `"${miss}" must not satisfy the guard`);
  }
});

test('CONTROL: the menu matcher reads the literal, not merely its presence', () => {
  // A mismatch has to be detectable, or the comparison test above passes for
  // every file forever. Feed it a body whose guard and log disagree.
  const mismatched = [
    "export async function x() { const s = await requireAdmin('roles');",
    "  await Role.deleteOne({});",
    "  recordAdminAction({ menu: 'articles', entity: 'role' });",
    '}',
  ].join('\n');
  assert.equal(requireAdminKey(mismatched), 'roles');
  assert.equal(recordedMenu(mismatched), 'articles');
  assert.notEqual(requireAdminKey(mismatched), recordedMenu(mismatched));
});
