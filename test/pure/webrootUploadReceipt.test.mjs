import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MINT, runMintFlow, readReceiptId, buildWebrootReceipt,
} from '@/lib/webroot/receiptFlow.mjs';
import {
  WEBROOT_DOCUMENTS, WEBROOT_RECEIPT_TTL_MS, webrootArchivePathname, webrootUploadTarget,
} from '@/lib/webrootDocuments.mjs';

/**
 * NO TOKEN WITHOUT A RECEIPT — proven by call count, not by message.
 *
 * The claim is negative in every case that matters: when the receipt is absent,
 * unknown, expired, spent, or bound to a different document, NO TOKEN WAS
 * MINTED. A test that checked the returned status could not tell "refused" from
 * "refused, having already signed a token" — and the difference is an overwrite
 * of a 42.6 MiB document with no archive behind it.
 *
 * So `mint` is a spy and every refusal asserts a call count of ZERO.
 *
 * ══ THE PAYLOADS DELIBERATELY CARRY A FILENAME ══════════════════════════════
 *
 * Every case below sends clientPayload as `{ receiptId, filename }`, even though
 * the flow ignores the filename. That is not padding — it is what makes the
 * control at the bottom able to fail.
 *
 * The implementation this step replaces read `clientPayload.filename` and minted
 * from it. If the fixtures sent only `{ receiptId }`, that old implementation
 * would refuse every case for want of a filename and would SATISFY every
 * zero-assertion here — the suite would go green over the exact defect it exists
 * to catch. Sending both means a receipt-blind route mints, and gets caught.
 */

const FILE_A = WEBROOT_DOCUMENTS[0];
const FILE_B = WEBROOT_DOCUMENTS[1];
const PATH_A = webrootUploadTarget(FILE_A).blobPathname;
const PATH_B = webrootUploadTarget(FILE_B).blobPathname;
const STAMP = '2026-08-10T01-00-00Z';
const NOW = 1_800_000_000_000;
const ID = 'receipt-for-A';

function receipt(over = {}) {
  return {
    receiptId: ID,
    filename: FILE_A,
    blobPathname: PATH_A,
    archivePathname: webrootArchivePathname(FILE_A, STAMP),
    stamp: STAMP,
    previousBytes: 44_695_000,
    issuedAt: new Date(NOW),
    issuedBy: 'tester',
    expiresAt: new Date(NOW + WEBROOT_RECEIPT_TTL_MS),
    usedAt: null,
    ...over,
  };
}

/**
 * A store whose burn is ATOMIC, standing in for the guarded findOneAndUpdate.
 *
 * The check and the set sit in one synchronous block with no `await` between
 * them, which on a single-threaded runtime is the same guarantee the Mongo
 * filter gives: a second caller cannot observe the pre-write state. The
 * non-atomic twin further down is what proves this file can tell the difference.
 */
function store(receipts = []) {
  const byId = new Map(receipts.map((r) => [r.receiptId, { ...r }]));
  const calls = { burn: 0, diagnose: 0, mint: 0, log: 0 };
  const logged = [];
  return {
    calls,
    logged,
    byId,
    deps: {
      burn: async (id, now) => {
        calls.burn += 1;
        const doc = byId.get(id);
        if (!doc) return null;
        if (doc.usedAt) return null;
        if (Number(new Date(doc.expiresAt)) <= Number(now)) return null;
        doc.usedAt = new Date(Number(now));
        return { ...doc };
      },
      diagnose: async (id) => {
        calls.diagnose += 1;
        const doc = byId.get(id);
        return doc ? { ...doc } : null;
      },
      mint: async ({ target }) => {
        calls.mint += 1;
        return { tokenFor: target.blobPathname };
      },
      log: async (entry) => { calls.log += 1; logged.push(entry); },
    },
  };
}

/** clientPayload as the admin page will send it — receipt AND a filename. */
const payload = (receiptId, filename) => JSON.stringify({ receiptId, filename });

// ── the six refusals and the two controls, as one table ─────────────────────
//
// A table so the SAME cases can be run against a second implementation below.
// Building the control by filtering these would be worthless: a control that
// fails whenever its subject fails is measuring the subject (the lesson from
// the rbacNavParity work). The control here is a DIFFERENT implementation put
// through the identical table.

const CASES = [
  {
    name: 'no receipt in clientPayload',
    receipts: [receipt()],
    payload: JSON.stringify({ filename: FILE_A }),
    pathname: PATH_A,
    now: NOW,
    expectMint: 0,
    expectStatus: MINT.NO_RECEIPT,
  },
  {
    name: 'clientPayload is not JSON at all',
    receipts: [receipt()],
    payload: 'receiptId=' + ID,
    pathname: PATH_A,
    now: NOW,
    expectMint: 0,
    expectStatus: MINT.BAD_PAYLOAD,
  },
  {
    name: 'unknown receipt id',
    receipts: [receipt()],
    payload: payload('some-other-id', FILE_A),
    pathname: PATH_A,
    now: NOW,
    expectMint: 0,
    expectStatus: MINT.UNKNOWN_RECEIPT,
  },
  {
    name: 'expired receipt',
    receipts: [receipt()],
    payload: payload(ID, FILE_A),
    pathname: PATH_A,
    now: NOW + WEBROOT_RECEIPT_TTL_MS,
    expectMint: 0,
    expectStatus: MINT.EXPIRED_RECEIPT,
  },
  {
    name: 'already-burned receipt',
    receipts: [receipt({ usedAt: new Date(NOW + 1) })],
    payload: payload(ID, FILE_A),
    pathname: PATH_A,
    now: NOW + 2,
    expectMint: 0,
    expectStatus: MINT.USED_RECEIPT,
  },
  {
    name: 'receipt for A, pathname for B',
    receipts: [receipt()],
    // The attacker names B, because a route that trusted clientPayload would
    // then derive B and mint. The flow must read A out of the receipt instead.
    payload: payload(ID, FILE_B),
    pathname: PATH_B,
    now: NOW,
    expectMint: 0,
    expectStatus: MINT.PATHNAME_MISMATCH,
  },
  {
    name: 'CONTROL: valid, fresh, unused receipt with a matching pathname',
    receipts: [receipt()],
    payload: payload(ID, FILE_A),
    pathname: PATH_A,
    now: NOW,
    expectMint: 1,
    expectStatus: MINT.MINTED,
  },
  {
    name: 'CONTROL: the same receipt one tick BEFORE expiry',
    receipts: [receipt()],
    payload: payload(ID, FILE_A),
    pathname: PATH_A,
    now: NOW + WEBROOT_RECEIPT_TTL_MS - 1,
    expectMint: 1,
    expectStatus: MINT.MINTED,
  },
];

for (const c of CASES) {
  test(`${c.name} → mint spy count ${c.expectMint}`, async () => {
    const s = store(c.receipts);
    const r = await runMintFlow(
      { pathname: c.pathname, clientPayload: c.payload, now: c.now },
      s.deps,
    );
    assert.equal(s.calls.mint, c.expectMint, `mint was called ${s.calls.mint} times`);
    assert.equal(r.status, c.expectStatus);
    assert.equal(r.minted, c.expectMint === 1);
  });
}

// ── THE EXPIRY TWIN. Same receipt, only the clock differs. ───────────────────
test('the SAME receipt mints one tick before expiry and not one tick after', async () => {
  // Two cases above already cover both sides, but separately — and separately
  // they could pass for two different reasons. Here the fixture is byte-identical
  // and the ONLY difference is `now`, so the assertion is proved to depend on the
  // expiry code and on nothing else about the receipt.
  const fixture = receipt();
  const expiry = Number(fixture.expiresAt);

  const before = store([fixture]);
  const rBefore = await runMintFlow(
    { pathname: PATH_A, clientPayload: payload(ID, FILE_A), now: expiry - 1 },
    before.deps,
  );

  const after = store([fixture]);
  const rAfter = await runMintFlow(
    { pathname: PATH_A, clientPayload: payload(ID, FILE_A), now: expiry },
    after.deps,
  );

  assert.equal(before.calls.mint, 1, 'one millisecond before expiry it must still mint');
  assert.equal(rBefore.status, MINT.MINTED);
  assert.equal(after.calls.mint, 0, 'at expiry it must not');
  assert.equal(rAfter.status, MINT.EXPIRED_RECEIPT);
});

// ── SINGLE USE, INCLUDING UNDER CONCURRENCY ─────────────────────────────────

test('a second use of the same receipt mints nothing', async () => {
  const s = store([receipt()]);
  const input = { pathname: PATH_A, clientPayload: payload(ID, FILE_A), now: NOW };
  const first = await runMintFlow(input, s.deps);
  const second = await runMintFlow(input, s.deps);
  assert.equal(first.status, MINT.MINTED);
  assert.equal(second.status, MINT.USED_RECEIPT);
  assert.equal(s.calls.mint, 1, 'one receipt, one token — the second use minted another');
});

test('two CONCURRENT mints on one receipt → exactly ONE succeeds', async () => {
  const s = store([receipt()]);
  const input = { pathname: PATH_A, clientPayload: payload(ID, FILE_A), now: NOW };
  const results = await Promise.all([runMintFlow(input, s.deps), runMintFlow(input, s.deps)]);
  const won = results.filter((r) => r.minted);
  assert.equal(won.length, 1, 'both callers were authorised off ONE archive');
  assert.equal(s.calls.mint, 1);
});

test('CONTROL: a READ-THEN-WRITE store lets BOTH concurrent callers through', async () => {
  // This is the implementation R6.5-c forbids — check `usedAt` in code, then
  // write it — and the only difference from `store()` is the yield between the
  // two. Without this control the concurrency test above would pass for a flow
  // that never had a race to lose, and the guarded query would be decorative.
  const doc = receipt();
  let mints = 0;
  const racy = {
    burn: async (id, now) => {
      if (doc.receiptId !== id) return null;
      const used = doc.usedAt;                    // read
      const expired = Number(new Date(doc.expiresAt)) <= Number(now);
      await Promise.resolve();                    // …the window…
      if (used || expired) return null;
      doc.usedAt = new Date(Number(now));         // write
      return { ...doc, usedAt: null };
    },
    diagnose: async () => ({ ...doc }),
    mint: async () => { mints += 1; return {}; },
    log: async () => {},
  };
  const input = { pathname: PATH_A, clientPayload: payload(ID, FILE_A), now: NOW };
  const results = await Promise.all([runMintFlow(input, racy), runMintFlow(input, racy)]);
  assert.equal(results.filter((r) => r.minted).length, 2,
    'the read-then-write store must let both through, or this file cannot tell the '
    + 'atomic burn from the racy one and the concurrency test proves nothing');
  assert.equal(mints, 2);
});

// ── THE BURN IS SPENT EVEN WHEN THE MINT IS REFUSED ─────────────────────────
test('a pathname mismatch still SPENDS the receipt', async () => {
  // Deliberate, and worth pinning: the burn is the mutual-exclusion primitive so
  // it runs first. A replay pointed at the wrong document therefore cannot be
  // retried against a third one — it costs the attacker the receipt and gains
  // them nothing.
  const s = store([receipt()]);
  await runMintFlow({ pathname: PATH_B, clientPayload: payload(ID, FILE_B), now: NOW }, s.deps);
  assert.equal(s.calls.mint, 0);
  assert.ok(s.byId.get(ID).usedAt, 'the receipt must be spent');

  const retry = await runMintFlow(
    { pathname: PATH_A, clientPayload: payload(ID, FILE_A), now: NOW },
    s.deps,
  );
  assert.equal(retry.status, MINT.USED_RECEIPT);
  assert.equal(s.calls.mint, 0, 'a correctly-aimed retry on a spent receipt still mints nothing');
});

// ── REFUSALS ARE LOGGED, SUCCESSES ARE NOT ──────────────────────────────────

test('every refusal logs exactly once, with the reason', async () => {
  for (const c of CASES.filter((x) => x.expectMint === 0)) {
    const s = store(c.receipts);
    await runMintFlow({ pathname: c.pathname, clientPayload: c.payload, now: c.now }, s.deps);
    assert.equal(s.calls.log, 1, `${c.name}: expected one log entry, got ${s.calls.log}`);
    assert.equal(s.logged[0].status, c.expectStatus, `${c.name}: logged the wrong reason`);
    assert.ok(s.logged[0].detail, `${c.name}: a refusal with no detail is a shrug`);
  }
});

test('a SUCCESSFUL mint logs nothing — and the log spy provably works', async () => {
  const ok = store([receipt()]);
  await runMintFlow({ pathname: PATH_A, clientPayload: payload(ID, FILE_A), now: NOW }, ok.deps);
  assert.equal(ok.calls.mint, 1);
  assert.equal(ok.calls.log, 0, 'the replacement record already covers a success');

  // CONTROL for the line above: a zero from a spy that never records is not a
  // finding. The same spy, same store shape, one refusal.
  const refused = store([]);
  await runMintFlow({ pathname: PATH_A, clientPayload: payload(ID, FILE_A), now: NOW }, refused.deps);
  assert.equal(refused.calls.log, 1, 'the log spy does not record, so the zero above proves nothing');
});

// ── THE BATTERY, AND THE IMPLEMENTATION IT MUST REJECT ──────────────────────

/**
 * Run the whole table against one implementation and return the case names it
 * got wrong. The shipped flow must get none wrong; a receipt-blind one must get
 * every refusal wrong.
 */
async function battery(impl) {
  const failures = [];
  for (const c of CASES) {
    const s = store(c.receipts);
    try {
      await impl({ pathname: c.pathname, clientPayload: c.payload, now: c.now }, s.deps);
    } catch {
      // An implementation that throws still counts: what is measured is whether
      // a token was minted, not how the refusal was expressed.
    }
    if (s.calls.mint !== c.expectMint) failures.push(c.name);
  }
  return failures;
}

/**
 * The route as it stood BEFORE this step: derive from clientPayload.filename,
 * compare against the requested pathname, mint. It is not a strawman — it is the
 * shipped code from commit 9e5e464, and it is safe against a bad pathname while
 * being completely blind to whether an archive was ever taken.
 */
async function receiptBlindMint({ pathname, clientPayload }, deps) {
  const intended = JSON.parse(String(clientPayload ?? '{}'))?.filename ?? null;
  const target = webrootUploadTarget(intended);
  if (!target.ok) return { status: 'refused', minted: false };
  if (String(pathname) !== target.blobPathname) return { status: 'refused', minted: false };
  const token = await deps.mint({ target, receipt: {} });
  return { status: MINT.MINTED, minted: true, token };
}

/**
 * A flow that burns the receipt correctly and then trusts the pathname anyway.
 *
 * It is receipt-AWARE — it would satisfy "no token without a receipt" in full —
 * and it is still exploitable: hold a valid receipt for the company profile,
 * ask for the catalog's pathname, and it signs a token that destroys the
 * catalog with the company profile's archive as the only backup.
 *
 * It exists so the pathname comparison has a control of its own. The
 * receipt-blind implementation below cannot supply one, because it happens to
 * compare pathnames too — it just compares against a CLIENT-supplied filename.
 */
async function pathnameTrustingMint({ pathname, clientPayload, now }, deps) {
  const read = readReceiptId(clientPayload);
  if (!read.ok) return { status: read.status, minted: false };
  const receipt = await deps.burn(read.receiptId, now);
  if (!receipt) return { status: MINT.UNKNOWN_RECEIPT, minted: false };
  const token = await deps.mint({ target: { filename: receipt.filename, blobPathname: pathname }, receipt });
  return { status: MINT.MINTED, minted: true, token };
}

test('the shipped mint flow passes every case in the table', async () => {
  assert.deepEqual(await battery(runMintFlow), []);
});

test('CONTROL: a flow that burns correctly but TRUSTS the pathname fails one case', async () => {
  // Exactly one, and it must be the replay case. If this came back empty, the
  // pathname comparison in the shipped flow could be deleted with the suite
  // still green; if it came back with more, the table would be rejecting this
  // implementation for reasons that have nothing to do with pathnames.
  assert.deepEqual(await battery(pathnameTrustingMint), ['receipt for A, pathname for B']);
});

test('CONTROL: a route that mints WITHOUT consulting the receipt fails the same table', async () => {
  // If this ever comes back empty, the table is measuring the wrong thing: it
  // would mean the cases are satisfied by an implementation with no receipt in
  // it, and every zero above would be an accident of the fixtures.
  const failed = await battery(receiptBlindMint);
  assert.deepEqual(
    failed.sort(),
    [
      'already-burned receipt',
      'expired receipt',
      'no receipt in clientPayload',
      'receipt for A, pathname for B',
      'unknown receipt id',
    ],
    'a receipt-blind route must mint on exactly the five cases that carry a usable '
    + 'filename, and must NOT fail the two positive controls — if it fails those too, '
    + 'the table is rejecting everything and proves nothing'
  );
});

// ── the pure pieces ─────────────────────────────────────────────────────────

test('readReceiptId takes the id and refuses everything else', () => {
  assert.deepEqual(readReceiptId(JSON.stringify({ receiptId: ' abc ' })), { ok: true, receiptId: 'abc' });
  assert.equal(readReceiptId(JSON.stringify({ filename: FILE_A })).status, MINT.NO_RECEIPT);
  assert.equal(readReceiptId(JSON.stringify({ receiptId: '' })).status, MINT.NO_RECEIPT);
  assert.equal(readReceiptId(JSON.stringify({ receiptId: 42 })).status, MINT.NO_RECEIPT);
  assert.equal(readReceiptId(undefined).status, MINT.NO_RECEIPT);
  assert.equal(readReceiptId('{oops').status, MINT.BAD_PAYLOAD);
  assert.equal(readReceiptId('"a string"').status, MINT.NO_RECEIPT);
});

test('buildWebrootReceipt expires exactly one TTL after it is issued', () => {
  const doc = buildWebrootReceipt({
    receiptId: 'r1',
    target: webrootUploadTarget(FILE_A),
    archivePathname: webrootArchivePathname(FILE_A, STAMP),
    stamp: STAMP,
    previousBytes: 10,
    issuedBy: 'someone',
    now: NOW,
  });
  assert.equal(doc.filename, FILE_A);
  assert.equal(doc.blobPathname, PATH_A);
  assert.equal(doc.archivePathname, webrootArchivePathname(FILE_A, STAMP));
  assert.equal(doc.usedAt, null, 'a fresh receipt must be burnable');
  assert.equal(Number(doc.expiresAt) - Number(doc.issuedAt), WEBROOT_RECEIPT_TTL_MS);
});

test('CONTROL: the TTL is a real window, not an arithmetic coincidence', () => {
  // Both halves matter. If TTL_MS were 0 the test above would still pass — the
  // difference would be zero on both sides — and every expiry case in this file
  // would refuse for the wrong reason.
  assert.ok(WEBROOT_RECEIPT_TTL_MS > 0, 'a zero TTL expires before the browser can use it');
  assert.equal(WEBROOT_RECEIPT_TTL_MS, 5 * 60 * 1000, 'the anchored value — see the comment on the constant');
  const a = buildWebrootReceipt({ receiptId: 'r', target: webrootUploadTarget(FILE_A), archivePathname: 'x', stamp: STAMP, now: NOW });
  const b = buildWebrootReceipt({ receiptId: 'r', target: webrootUploadTarget(FILE_A), archivePathname: 'x', stamp: STAMP, now: NOW + 1000 });
  assert.equal(Number(b.expiresAt) - Number(a.expiresAt), 1000, 'expiry must track the issue time');
});
