/**
 * REHEARSAL — prove the --revert COMMAND works, not just its logic.
 *
 * The unit tests in test/pure/legacyReferenceRevert.test.mjs pin every branch
 * of the decision. They cannot prove that the guarded `updateOne` actually
 * matches, that a dotted field path survives a real BSON round trip, or that
 * the verification pass reads back what it thinks it does. Those only fail
 * against a real database, and the revert gets exercised for real exactly once
 * — in Stage A — which is far too late to discover a query that never matches.
 *
 * ══ THIS TOUCHES NOTHING REAL ═══════════════════════════════════════════════
 *
 * Two throwaway collections, created and dropped by this script:
 *
 *     _rehearse_docs     stands in for `articles`
 *     _rehearse_backup   stands in for `legacy_reference_rewrites`
 *
 * The real backup collection is never opened — the driver is invoked with
 * --backup-collection so it reads the rehearsal record instead. No production
 * collection is read or written at any point.
 *
 * ── THE FOUR CASES IT STAGES ────────────────────────────────────────────────
 *   1. clean       field still holds newValue           → must RESTORE
 *   2. edited      someone changed it afterwards        → must CONFLICT, untouched
 *   3. deleted     the document is gone                 → must report MISSING
 *   4. nested      a dotted path several levels deep    → must RESTORE
 *
 * Then it reverts a SECOND time to prove idempotence, and asserts the edited
 * document is still byte-for-byte what the editor left.
 *
 * Usage: node --env-file=.env.local scripts/_rehearse-revert.mjs
 */

import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';

const DOCS = '_rehearse_docs';
const BACKUP = '_rehearse_backup';
const RUN_ID = 'rehearsal-run';

const ORIGINAL = '<p>a</p><img src="https://www.9experttraining.com/sites/default/files/articles/images/a%20b.png"><p>b</p>';
const REWRITTEN = '<p>a</p><img src="/sites/default/files/articles/images/a%20b.png"><p>b</p>';
const EDITOR_CHANGED = `${REWRITTEN}<p>an editor added this after the apply</p>`;

const NESTED_ORIGINAL = 'https://www.9experttraining.com/images/nested.png';
const NESTED_REWRITTEN = '/images/nested.png';

const ok = (b) => (b ? '✓' : '✖');
let failures = 0;
const check = (label, condition, detail = '') => {
  if (!condition) failures += 1;
  console.log(`     ${ok(condition)} ${label}${detail ? ` — ${detail}` : ''}`);
};

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('✖ MONGODB_URI not set'); process.exit(1); }

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });
const db = mongoose.connection.db;

// Start from clean throwaway collections every time.
for (const c of [DOCS, BACKUP]) {
  await db.collection(c).drop().catch(() => { /* did not exist */ });
}

console.log('');
console.log('══ REVERT REHEARSAL — throwaway collections only ══════════════════════════');
console.log('');

// ── stage the four cases ────────────────────────────────────────────────────
await db.collection(DOCS).insertMany([
  { _id: 'clean', content: REWRITTEN },
  { _id: 'edited', content: EDITOR_CHANGED },
  // 'deleted' is deliberately NOT inserted.
  { _id: 'nested', promo: { detail: { html: NESTED_REWRITTEN } } },
]);

await db.collection(BACKUP).insertMany([
  { runId: RUN_ID, collection: DOCS, documentId: 'clean', fieldPath: 'content', originalValue: ORIGINAL, newValue: REWRITTEN },
  { runId: RUN_ID, collection: DOCS, documentId: 'edited', fieldPath: 'content', originalValue: ORIGINAL, newValue: REWRITTEN },
  { runId: RUN_ID, collection: DOCS, documentId: 'deleted', fieldPath: 'content', originalValue: ORIGINAL, newValue: REWRITTEN },
  { runId: RUN_ID, collection: DOCS, documentId: 'nested', fieldPath: 'promo.detail.html', originalValue: NESTED_ORIGINAL, newValue: NESTED_REWRITTEN },
]);

console.log('  staged: clean, edited (by a human), deleted (document removed), nested (dotted path)');
console.log('');

/** Invoke the REAL driver, so this rehearses the shipped command. */
function revert(extraArgs) {
  const r = spawnSync(process.execPath, [
    '--env-file=.env.local',
    'scripts/rewrite-legacy-references.mjs',
    '--revert', RUN_ID,
    '--backup-collection', BACKUP,
    ...extraArgs,
  ], { encoding: 'utf8', cwd: process.cwd() });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}

// ── 1. dry run must decide correctly and write nothing ──────────────────────
console.log('── dry run ─────────────────────────────────────────────────────────────');
const dry = revert([]);
console.log(dry.split('\n').filter((l) => /restore|already-reverted|conflict|missing|Would restore/.test(l)).join('\n'));
const afterDry = await db.collection(DOCS).findOne({ _id: 'clean' });
check('dry run wrote NOTHING', afterDry.content === REWRITTEN);
console.log('');

// ── 2. commit ───────────────────────────────────────────────────────────────
console.log('── commit ──────────────────────────────────────────────────────────────');
const committed = revert(['--commit']);
console.log(committed.split('\n').filter((l) => /restored|lost the race|byte-identical|CONFLICT|MISSING|✓|✖/.test(l)).slice(0, 12).join('\n'));
console.log('');

console.log('── assertions ──────────────────────────────────────────────────────────');
const clean = await db.collection(DOCS).findOne({ _id: 'clean' });
check('clean document restored BYTE-IDENTICALLY', clean.content === ORIGINAL);

const edited = await db.collection(DOCS).findOne({ _id: 'edited' });
check('edited document NOT clobbered', edited.content === EDITOR_CHANGED,
  edited.content === EDITOR_CHANGED ? 'the human edit survived' : 'A HUMAN EDIT WAS DESTROYED');

const nested = await db.collection(DOCS).findOne({ _id: 'nested' });
check('nested dotted path restored', nested.promo.detail.html === NESTED_ORIGINAL);

check('deleted document reported, not recreated', (await db.collection(DOCS).findOne({ _id: 'deleted' })) === null);
check('verification pass ran and reported byte-identity', /byte-identical to originalValue/.test(committed));
console.log('');

// ── 3. idempotence — revert again ───────────────────────────────────────────
console.log('── second revert (idempotence) ─────────────────────────────────────────');
const second = revert(['--commit']);
console.log(second.split('\n').filter((l) => /restored|already-reverted|conflict|missing/.test(l)).slice(0, 6).join('\n'));

const cleanAgain = await db.collection(DOCS).findOne({ _id: 'clean' });
const editedAgain = await db.collection(DOCS).findOne({ _id: 'edited' });
check('second revert changed nothing on the clean document', cleanAgain.content === ORIGINAL);
check('second revert still did not touch the edited document', editedAgain.content === EDITOR_CHANGED);
check('second revert restored 0 fields', / {2}restored : 0/.test(second));
console.log('');

// ── tidy up ─────────────────────────────────────────────────────────────────
for (const c of [DOCS, BACKUP]) await db.collection(c).drop().catch(() => {});
const left = (await db.listCollections().toArray()).map((c) => c.name);
check('both throwaway collections dropped', !left.includes(DOCS) && !left.includes(BACKUP));

console.log('');
console.log(failures === 0
  ? '══ REHEARSAL PASSED — the revert command works against a real database. ═══'
  : `══ ✖ ${failures} REHEARSAL CHECK(S) FAILED ═══════════════════════════════════`);
console.log('');

await mongoose.disconnect();
process.exit(failures === 0 ? 0 : 1);
