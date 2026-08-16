import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE SEAMS THE PURE TESTS CANNOT REACH.
 *
 * test/pure/webrootUploadReceipt.test.mjs drives the mint decision with fakes
 * and proves it refuses without a receipt. Three things stay unproven by
 * construction, and each of them is where this feature would fail silently:
 *
 *   1. THE ROUTE ACTUALLY USES IT. A pure test of a function nobody calls is
 *      green forever. The route is `'use server'`-adjacent, imports
 *      @vercel/blob/client and next-auth, and cannot be imported here.
 *   2. THE BURN QUERY IS REALLY ATOMIC. The fake store implements "atomic" by
 *      not yielding; a read-then-write Mongo call would satisfy it exactly as
 *      well. Only the query text says which one shipped.
 *   3. THE STORE IS MONGO. An in-process Map passes every test in this suite —
 *      one process — and fails only on Vercel, where the action and the route
 *      can be different lambda instances. That is the false-green shape this
 *      repo keeps meeting, so it is guarded at the source.
 *
 * A shape guard, not a behaviour test.
 */

const ROUTE = 'src/app/api/admin/webroot-documents/upload/route.js';
const STORE = 'src/lib/webroot/receiptStore.js';
const FLOW = 'src/lib/webroot/receiptFlow.mjs';
const ACTION = 'src/lib/actions/webroot-documents.js';
const MODEL = 'src/models/WebrootUploadReceipt.js';
const CONSTS = 'src/lib/webrootDocuments.mjs';

const route = readSource(ROUTE);
const store = readSource(STORE);
const flow = readSource(FLOW);
const action = readSource(ACTION);
const model = readSource(MODEL);
const consts = readSource(CONSTS);

test('CONTROL: every file under scan was really read', () => {
  // Every assertion below is of the form "the source contains X" or "does not
  // contain Y". Against an empty string the second kind passes vacuously, so
  // the inputs are anchored first.
  for (const [rel, src] of [[ROUTE, route], [STORE, store], [FLOW, flow],
    [ACTION, action], [MODEL, model], [CONSTS, consts]]) {
    assert.ok(src.code.length > 200, `${rel} scanned to ${src.code.length} chars`);
  }
  assert.match(route.code, /onBeforeGenerateToken/, 'the route still has the hook this is about');
  assert.match(store.code, /findOneAndUpdate/, 'the store still has a burn');
});

// ── 1. the route delegates, and trusts nothing from the client ──────────────

test('the route mints THROUGH runMintFlow', () => {
  assert.match(
    route.withImports, /import\s*\{[^}]*runMintFlow[^}]*\}\s*from\s*'@\/lib\/webroot\/receiptFlow\.mjs'/,
    'the route must import the decision, not re-implement it'
  );
  assert.match(route.code, /runMintFlow\(/, 'and call it');
  assert.match(route.code, /burn:\s*burnWebrootReceipt/, 'wired to the real burn');
  assert.match(route.code, /result\.minted/, 'and it must branch on whether a token was minted');
});

/** Ways a route can be reading the client's mind instead of a receipt. */
function trustProblems(code) {
  const problems = [];
  if (/JSON\.parse\(String\(clientPayload/.test(code)) problems.push('parses clientPayload itself');
  if (/webrootUploadTarget\(/.test(code)) problems.push('derives a target of its own');
  if (!/runMintFlow\(/.test(code)) problems.push('does not go through the mint flow');
  return problems;
}

test('the route reads NO filename and NO pathname from the client', () => {
  assert.deepEqual(trustProblems(route.code), [],
    'the receipt id is the only value the route may take from clientPayload, and '
    + 'readReceiptId in receiptFlow.mjs is what takes it. A derivation here is a '
    + 'second thing to keep in agreement — and the one that can be handed a client value'
  );
});

test('CONTROL: the same checks REJECT the route as it stood before this step', () => {
  // Verbatim from commit 9e5e464 — not a strawman. It is safe against a bad
  // pathname and completely blind to whether an archive was ever taken, and if
  // the checks above cannot tell it apart from what shipped, they are decoration.
  const before = `
    let intended = null;
    try {
      intended = JSON.parse(String(clientPayload ?? '{}'))?.filename ?? null;
    } catch {
      throw new Error('clientPayload must be JSON carrying { filename }');
    }
    const target = webrootUploadTarget(intended);
    if (!target.ok) throw new Error(target.reason);
    if (pathname !== target.blobPathname) throw new Error('mismatch');
    return { tokenPayload: JSON.stringify({ filename: target.filename }) };`;

  assert.deepEqual(trustProblems(before).sort(), [
    'derives a target of its own',
    'does not go through the mint flow',
    'parses clientPayload itself',
  ]);
});

test('the token payload is built inside the mint dep, so a refusal cannot reach it', () => {
  const hook = route.code.slice(route.code.indexOf('onBeforeGenerateToken'));
  const mintAt = hook.indexOf('mint:');
  const payloadAt = hook.indexOf('tokenPayload');
  assert.ok(mintAt > -1, 'the mint dependency must exist');
  assert.ok(payloadAt > mintAt,
    'tokenPayload is built before/outside the mint callback, so the token options '
    + 'exist on paths that refuse');
});

// ── 2. the burn is one guarded query ────────────────────────────────────────

/** The body of one exported function in the store, bounded by the next export. */
function fn(src, name) {
  const at = src.indexOf(`export async function ${name}`);
  assert.notEqual(at, -1, `${name} not found`);
  const rest = src.slice(at + 1);
  const next = rest.indexOf('\nexport ');
  return next === -1 ? rest : rest.slice(0, next);
}

const burn = fn(store.code, 'burnWebrootReceipt');

/**
 * Every way a burn can fail to be a single guarded claim, as a list of problems.
 *
 * A FUNCTION rather than inline assertions, because the only honest way to show
 * these can go red is to run the SAME checks over source that is genuinely
 * wrong. Deleting a clause from the shipped file, watching the suite redden and
 * putting it back proves it once, for whoever was watching; this proves it on
 * every run, forever, without the repo ever being in the broken state.
 */
function burnProblems(body) {
  const problems = [];
  if ((body.match(/findOneAndUpdate\(/g) || []).length !== 1) {
    problems.push('not exactly one findOneAndUpdate');
  }
  if (/findOne\(|\.find\(/.test(body)) {
    problems.push('reads before it writes');
  }
  const filter = body.slice(body.indexOf('findOneAndUpdate('), body.indexOf('$set'));
  if (!/usedAt:\s*null/.test(filter)) problems.push('single-use not in the filter');
  if (!/expiresAt:\s*\{\s*\$gt:/.test(filter)) problems.push('expiry not in the filter');
  if (!/usedAt:/.test(body.slice(body.indexOf('$set')))) problems.push('the set does not mark it used');
  return problems;
}

test('the burn is a SINGLE findOneAndUpdate with both guards in the FILTER', () => {
  assert.deepEqual(burnProblems(burn), [],
    'single-use and expiry are enforced by the filter or not at all. Two callers '
    + 'holding one receipt both read a null usedAt, both pass, and both get a token '
    + 'off ONE archive — the second overwrite destroys the first with no backup');
});

test('CONTROL: the same checks REJECT an unguarded and a read-then-write burn', () => {
  // Three implementations that are wrong in three different ways. If any of
  // these came back clean, the assertion above would be passing on a file that
  // merely happens to contain the right words somewhere.
  const unguarded = `
    const at = new Date(now);
    return WebrootUploadReceipt.findOneAndUpdate(
      { receiptId: String(receiptId) },
      { $set: { usedAt: at } },
    ).lean();`;
  const noExpiry = `
    const at = new Date(now);
    return WebrootUploadReceipt.findOneAndUpdate(
      { receiptId: String(receiptId), usedAt: null },
      { $set: { usedAt: at } },
    ).lean();`;
  const readThenWrite = `
    const doc = await WebrootUploadReceipt.findOne({ receiptId }).lean();
    if (!doc || doc.usedAt || doc.expiresAt <= now) return null;
    return WebrootUploadReceipt.findOneAndUpdate(
      { receiptId }, { $set: { usedAt: new Date(now) } },
    ).lean();`;

  assert.deepEqual(burnProblems(unguarded).sort(),
    ['expiry not in the filter', 'single-use not in the filter']);
  assert.deepEqual(burnProblems(noExpiry), ['expiry not in the filter']);
  assert.ok(burnProblems(readThenWrite).includes('reads before it writes'),
    'the read-then-write shape is the race R6.5-c forbids and must be caught even '
    + 'though its guarded update looks correct in isolation');
});

test('CONTROL: the guard clauses are specific to the burn, not just present in the file', () => {
  // Without this, the assertions above would pass for a file that mentioned
  // `usedAt: null` anywhere at all — including in the unguarded diagnostic read.
  const diagnose = fn(store.code, 'readWebrootReceipt');
  assert.equal(/usedAt:\s*null/.test(diagnose), false,
    'the diagnostic read must be UNGUARDED — it exists to say WHY the burn missed, '
    + 'and a guarded version could not tell "expired" from "used"');
  assert.equal(/\$gt/.test(diagnose), false);
  assert.equal(/findOneAndUpdate/.test(diagnose), false, 'and it must not write');
});

test('the diagnostic read is only ever reached AFTER the burn returns nothing', () => {
  // Scoped to runMintFlow's body on purpose: `whyBurnMissed` is DECLARED near
  // the top of the file, so an indexOf over the whole module would find the
  // declaration and compare the wrong two positions.
  const body = flow.code.slice(flow.code.indexOf('export async function runMintFlow'));
  const burnAt = body.indexOf('await burn(');
  const diagAt = body.indexOf('whyBurnMissed(');
  assert.ok(burnAt > -1, 'runMintFlow must burn');
  assert.ok(diagAt > burnAt,
    'diagnose must come after the burn in the flow. Read-then-decide-then-write is '
    + 'the race the guarded query exists to remove');
});

// ── 3. the store is Mongo, and there is no in-process path ─────────────────

test('no module-level Map, cache or global stands in for the collection', () => {
  for (const [rel, src] of [[FLOW, flow], [STORE, store], [ROUTE, route], [ACTION, action]]) {
    assert.equal(/new Map\(|new Set\(|globalThis\.[A-Za-z_$]*[Cc]ache/.test(src.code), false,
      `${rel} holds an in-process store. On Vercel the action and the route can run in `
      + 'DIFFERENT lambda instances, so this passes every test here and fails only in '
      + 'production — see R6.5-b');
  }
  assert.match(store.withImports, /from '@\/models\/WebrootUploadReceipt'/, 'the store is the collection');
  assert.match(store.code, /await dbConnect\(\)/, 'and it connects');
});

test('the model carries no TTL index posing as the expiry guard', () => {
  // R6.5-d allows a janitorial TTL index. It does NOT allow one to be mistaken
  // for the check — Mongo's TTL monitor runs on roughly a 60 s cycle, so an
  // expired document is still readable for up to a minute. This guard stays
  // correct either way: no index, or an index that says what it is.
  if (/expireAfterSeconds/.test(model.code)) {
    assert.match(model.code, /janitorial/i,
      'a TTL index was added without saying it is janitorial and not the guard');
  }
  assert.match(model.code, /usedAt/, 'the single-use field exists');
  assert.match(model.code, /expiresAt/, 'and the expiry field');
});

// ── the receipt id, and the constant ───────────────────────────────────────

test('the receipt id is random, and is not derived from anything visible', () => {
  assert.match(action.withImports, /import\s*\{\s*randomUUID\s*\}\s*from\s*'node:crypto'/);
  assert.match(action.code, /receiptId:\s*randomUUID\(\)/,
    'the id must be unguessable — an _id, a counter or the stamp are all derivable '
    + 'from things an admin can already see');
  assert.equal(/receiptId:\s*(String\()?(stamp|_id|result\._id)/.test(action.code), false);
});

test('the receipt is issued INSIDE authorise, which only a verified archive reaches', () => {
  const prepare = action.code.slice(action.code.indexOf('export async function prepareWebrootReplacement'));
  const authoriseAt = prepare.indexOf('authorise:');
  const issueAt = prepare.indexOf('issueWebrootReceipt(');
  assert.ok(authoriseAt > -1 && issueAt > authoriseAt,
    'the receipt must be minted inside the authorise dependency. Minting it after '
    + 'runReplaceFlow returns would put it outside the ordering the replaceFlow tests '
    + 'prove, and those tests are the whole evidence that no archive means no token');
});

test('the TTL constant is named, anchored, and called a tripwire', () => {
  assert.match(consts.code, /export const WEBROOT_RECEIPT_TTL_MS\s*=/);
  // THE SUBJECT HERE IS A COMMENT, so it is read from `raw`. `code` and
  // `withImports` are both scrubbed — the assertion would be vacuous against
  // either, which is the failure mode the reader's own docstring warns about.
  const at = consts.raw.indexOf('export const WEBROOT_RECEIPT_TTL_MS');
  assert.notEqual(at, -1);
  const comment = consts.raw.slice(Math.max(0, at - 2400), at);
  assert.match(comment, /TRIPWIRE/, 'the same wording pattern as WEBROOT_MAX_BYTES and ADMIN_LIST_LIMIT');
  assert.match(comment, /round trip/i, 'and it must say what window it covers');
  assert.match(comment, /replay/i, 'and what being past it means');
});

test('CONTROL: the comment guard is reading unscrubbed text', () => {
  // Without this the test above could pass for the wrong reason — or, worse,
  // a future edit could point it at `code` and it would fail loudly rather than
  // silently, but only if someone knows the two differ. They do:
  assert.match(consts.raw, /TRIPWIRE/, 'the raw file carries the comment');
  assert.equal(/TRIPWIRE/.test(consts.code), false,
    'the scrubbed form must NOT — if it does, scrubSource stopped stripping comments '
    + 'and every "this file does not mention X" guard in the suite just got weaker');
});

// ── orphans are visible ────────────────────────────────────────────────────

test('listWebrootReplacements reports prepared-but-never-completed SEPARATELY', () => {
  const list = action.code.slice(action.code.indexOf('export async function listWebrootReplacements'));
  assert.match(list, /listPreparedWebrootReceipts\(/, 'it must read the unused receipts');
  assert.match(list, /prepared:/, 'and return them under their own key');
  const prepared = list.slice(list.indexOf('prepared:'));
  for (const field of ['bytes', 'sha256', 'version']) {
    assert.equal(new RegExp(`\\b${field}\\b`).test(prepared.slice(0, prepared.indexOf('}))'))), false,
      `a prepared entry carries ${field}, so it can read as if bytes changed. Nothing landed`);
  }
  assert.equal(/receiptId/.test(prepared), false,
    'an unused, unexpired receipt is a live credential — a listing must not print one');
});

test('the store excludes receiptId from the orphan projection too', () => {
  const listing = fn(store.code, 'listPreparedWebrootReceipts');
  assert.match(listing, /usedAt:\s*null/, 'prepared means never burned');
  assert.match(listing, /receiptId:\s*0/, 'and the projection drops the credential');
});
