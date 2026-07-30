import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describeListWindow } from '@/lib/adminListWindow';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * b-002 / b-003: /admin/articles fetched 200 rows out of 484 and said nothing.
 * `total` was computed by countDocuments and thrown away; the header rendered
 * `ทั้งหมด {rows.length}`, reporting the FETCH SIZE as the COLLECTION SIZE. 284
 * articles were invisible AND unfindable, because the search box filters the
 * rows already fetched.
 *
 * This module is the arithmetic behind the banner that makes that impossible to
 * miss. The tests below are mostly about `truncated` being DERIVED — a banner
 * that can never fire is the same defect wearing a warning label.
 *
 * ── THE PARAMETER IS `reachable`, NOT `shown` ───────────────────────────────
 * It counts rows this surface can GET THE USER TO, not rows painted right now.
 * The two are the same number today (one fetch, no pager, every fetched row
 * rendered), which is exactly why the wrong one is easy to pick. Under commit
 * 3's pagination they diverge: 12 painted, 484 reachable. Keying the banner off
 * the painted count would make it fire on every page forever, announcing 472
 * hidden articles that are one click away — and a banner that is wrong on every
 * page gets deleted, taking the only guard this commit installs with it.
 */

// ── the boundaries ───────────────────────────────────────────────────────────

test('total below the window → nothing hidden, not truncated', () => {
  const w = describeListWindow({ reachable: 37, total: 37 });
  assert.deepEqual(w, { reachable: 37, total: 37, hidden: 0, truncated: false });
});

test('total === reachable → the window exactly fits, still not truncated', () => {
  // The off-by-one that matters: when every row is reachable nothing is
  // missing, so a banner here would cry wolf on every collection that happens
  // to fit.
  const w = describeListWindow({ reachable: 200, total: 200 });
  assert.deepEqual(w, { reachable: 200, total: 200, hidden: 0, truncated: false });
});

test('total exceeds reachable by ONE → truncated, one row hidden', () => {
  const w = describeListWindow({ reachable: 200, total: 201 });
  assert.deepEqual(w, { reachable: 200, total: 201, hidden: 1, truncated: true });
});

// ── the incident ─────────────────────────────────────────────────────────────

test('b-003 REGRESSION: the real production shape — 200 reachable of 484', () => {
  const w = describeListWindow({ reachable: 200, total: 484 });
  assert.equal(w.hidden, 284, '284 articles were invisible to the admin list');
  assert.equal(w.truncated, true, 'the banner must fire for the exact shape that shipped');
  assert.equal(w.total, 484, 'the header must report the collection size, not the fetch size');
  assert.equal(w.reachable, 200);
});

// ── the next regime, pinned before it exists ─────────────────────────────────

test('silent once a pager makes every row reachable (commit 3 contract)', () => {
  // Commit 3 replaces the 200-row window with server-side pagination. Page 1
  // will PAINT 12 rows while all 484 remain one click away, so the caller
  // passes `reachable: total` and this banner goes SILENT.
  //
  // That is the correct outcome and this test exists to say so BEFORE the pager
  // lands, because there are two wrong ways to get there and both are tempting
  // when the banner starts firing on every page:
  //   · redefine `reachable` back to the painted count and delete the banner
  //     because it "does not work with pagination"
  //   · leave the banner up and let it announce 472 phantom missing articles
  // A pager makes rows reachable; it does not make them missing.
  const w = describeListWindow({ reachable: 484, total: 484 });
  assert.equal(w.hidden, 0, 'a paginated list hides nothing — every row is one click away');
  assert.equal(w.truncated, false, 'the banner must go SILENT under pagination, not fire forever');
  assert.deepEqual(w, { reachable: 484, total: 484, hidden: 0, truncated: false });
});

// ── controls ─────────────────────────────────────────────────────────────────

test('CONTROL: `truncated` is DERIVED — it takes both values across the inputs', () => {
  // A constant `false` would satisfy every "not truncated" case above, and a
  // constant `true` would satisfy the incident. Neither can satisfy both, so
  // assert both outcomes come out of the same function.
  const outcomes = new Set(
    [
      { reachable: 10, total: 10 },
      { reachable: 200, total: 200 },
      { reachable: 200, total: 201 },
      { reachable: 200, total: 484 },
      { reachable: 484, total: 484 },
    ].map((input) => describeListWindow(input).truncated)
  );
  assert.deepEqual(
    [...outcomes].sort(), [false, true],
    'truncated returned the same answer for every input — it is a constant, and ' +
    'the banner either never fires or always does',
  );
});

test('CONTROL: `truncated` is derived from `reachable` specifically, not from `total`', () => {
  // The two cheap wrong implementations, named:
  //
  //   `truncated: total > 0`  — passes the incident (484 > 0) AND every case
  //       where something is genuinely hidden, so it survives most of this file.
  //       It fails HERE, where total is large and everything is reachable.
  //   `truncated: total > SOME_CONSTANT` — same shape, same blind spot.
  //
  // Hold `total` fixed and move ONLY `reachable`. Any predicate that does not
  // read `reachable` must return the same answer for both, and these two
  // answers differ.
  const TOTAL = 484;
  const partial = describeListWindow({ reachable: 200, total: TOTAL });
  const full = describeListWindow({ reachable: TOTAL, total: TOTAL });

  assert.equal(partial.truncated, true);
  assert.equal(full.truncated, false);
  assert.notEqual(
    partial.truncated, full.truncated,
    'same total, different reachable, same verdict — the predicate is ignoring ' +
    '`reachable`, so it is measuring the collection size rather than what the ' +
    'admin can get to',
  );

  // …and symmetrically: hold `reachable` fixed, move `total`, and the verdict
  // must also change — otherwise the predicate ignores `total` instead.
  assert.equal(describeListWindow({ reachable: 200, total: 200 }).truncated, false);
  assert.equal(describeListWindow({ reachable: 200, total: 201 }).truncated, true);
});

test('CONTROL: `hidden` is measured, not a constant — it tracks total - reachable', () => {
  assert.equal(describeListWindow({ reachable: 5, total: 5 }).hidden, 0);
  assert.equal(describeListWindow({ reachable: 5, total: 6 }).hidden, 1);
  assert.equal(describeListWindow({ reachable: 5, total: 12 }).hidden, 7);
  assert.equal(describeListWindow({ reachable: 200, total: 484 }).hidden, 284);
});

test('CONTROL: truncation keys off what is REACHABLE, not off a window size', () => {
  // The rejected predicate is `total > limit` — the fetch cap. It agrees with
  // the real one only while `reachable === min(total, limit)`, i.e. only while
  // there is no pager and no server-side filter. Here 90 rows are unreachable
  // while `total (100) > limit (200)` is FALSE, so a limit-keyed banner would
  // report "nothing missing" — the original bug, rebuilt. `limit` is not even a
  // parameter any more, and this is why.
  const w = describeListWindow({ reachable: 10, total: 100 });
  assert.equal(w.truncated, true, 'total > reachable means rows are missing, whatever any cap says');
  assert.equal(w.hidden, 90);
  assert.equal(
    100 > 200, false,
    'and `total > limit` — the tempting alternative — is false for this case, ' +
    'which is exactly why it is not the rule',
  );
});

// ── degenerate inputs ────────────────────────────────────────────────────────

test('hidden never goes negative when a client has locally deleted rows', () => {
  // The delete handler removes a row and decrements BOTH counts; a stale or
  // mismatched pair must not render "ซ่อนอยู่ -3 บทความ".
  const w = describeListWindow({ reachable: 12, total: 9 });
  assert.equal(w.hidden, 0);
  assert.equal(w.truncated, false);
});

test('reachable above total → nothing hidden, no banner', () => {
  // Reaching more rows than the collection holds is a caller mismatch, not a
  // truncation. It must resolve to silence rather than a negative count.
  //
  // NOTE this replaces the old 'shown is clamped to limit' case, which expected
  // {shown: 200, hidden: 284} for {shown: 500, total: 484, limit: 200}. The
  // clamp existed only because `limit` was a parameter; with `limit` gone there
  // is nothing to clamp against, and "I can reach 500 of 484" correctly means
  // nothing is hidden. This is the one expectation the rename changed, and it
  // changed because `limit` was dropped, not because the predicate moved.
  const w = describeListWindow({ reachable: 500, total: 484 });
  assert.equal(w.reachable, 500);
  assert.equal(w.hidden, 0);
  assert.equal(w.truncated, false);
});

test('missing, junk and negative inputs degrade to zero rather than NaN', () => {
  assert.deepEqual(
    describeListWindow(),
    { reachable: 0, total: 0, hidden: 0, truncated: false },
  );
  assert.deepEqual(
    describeListWindow({ reachable: 'x', total: null }),
    { reachable: 0, total: 0, hidden: 0, truncated: false },
  );
  const w = describeListWindow({ reachable: -5, total: 484 });
  assert.equal(w.reachable, 0);
  assert.equal(w.hidden, 484, 'a nonsense row count must not shrink the hidden count');
});

test('a partial reach with no declared window is still measured', () => {
  // Nothing declares a cap to this function any more; the two numbers it is
  // given are the whole contract.
  const w = describeListWindow({ reachable: 300, total: 484 });
  assert.equal(w.reachable, 300);
  assert.equal(w.hidden, 184);
  assert.equal(w.truncated, true);
});

// ── the seam: the server page must actually hand the numbers over ────────────

test('SEAM: /admin/articles keeps BOTH items and total, and passes them to the client', () => {
  // The render tests hand these in as props, so they stay green even if the
  // page reverts to `const { items } = await getArticles(...)` and drops
  // `total` — which is the ENTIRE original bug. Nothing else in the suite
  // watches this one line. The page is an async RSC that awaits requirePage()
  // → next-auth, so it cannot be imported here; pin it at the source instead.
  const page = read('src/app/admin/articles/page.jsx');

  assert.match(
    page, /const \{ items, total \} = await getArticles\(/,
    '`total` is computed by countDocuments and must not be discarded again — ' +
    'discarding it is what made 284 missing articles invisible',
  );
  assert.match(
    page, /total=\{total\}/,
    'total must reach ArticlesAdminClient, or the banner has nothing to compare against',
  );
  assert.match(
    page, /select: ADMIN_LIST_FIELDS/,
    'the list read must be projected — without it every `content` HTML body ' +
    'ships to the browser, and so does the superadmin-only jsonLd.rawOverride',
  );
});

test('SEAM: the page passes `reachable` as the FETCHED ROW COUNT, not as `total`', () => {
  // Asserting the KEY alone is not enough. `reachable={total}` would satisfy a
  // grep for the word and would silence the banner completely — 484 reachable
  // of 484, nothing hidden — turning this commit into a no-op that still looks
  // wired. Today, with one fetch and no pager, the only correct expression is
  // the number of rows actually fetched.
  //
  // When commit 3 lands a pager, THIS is the line that changes, and it should
  // change to `total` deliberately, with this test rewritten to say so — not
  // silently, because `reachable` happened to accept it.
  const page = read('src/app/admin/articles/page.jsx');

  assert.match(
    page, /reachable=\{items\.length\}/,
    'reachable must be the fetched row count while this page fetches one window ' +
    'and paints all of it',
  );
  assert.equal(
    /reachable=\{total\}/.test(page), false,
    'reachable={total} claims every article is one click away. It is not — there ' +
    'is no pager yet — and it would silence the banner on a list hiding 284 rows.',
  );
});

test('SEAM: the admin client reads the header count from `total`, never from rows.length', () => {
  const client = read('src/app/admin/articles/_components/ArticlesAdminClient.jsx');
  assert.match(
    client, /ทั้งหมด \{total\}/,
    'the header must render the collection size. `ทั้งหมด {rows.length}` reported ' +
    'the fetch size as the collection size: authoritative, and wrong by 284.',
  );
  assert.match(
    client, /describeListWindow\(\{ reachable, total \}\)/,
    'the window must be measured against what the page can REACH — not `rows.length`, ' +
    'which is what it paints. Deriving reachable from the painted rows is what ' +
    'would make the banner fire on every page once a pager exists.',
  );
  assert.equal(
    /describeListWindow\(\{[^}]*\bshown\b/.test(client), false,
    'the `shown` parameter is gone — there is deliberately no alias, because an ' +
    'alias is how the paginated caller ends up passing the wrong one',
  );
});

test('the returned shape is exactly the four documented keys, and `shown` is not one of them', () => {
  // The banner destructures these; an extra key would invite a caller to depend
  // on something the contract does not promise. `shown` specifically must NOT
  // come back as a deprecated alias.
  const w = describeListWindow({ reachable: 1, total: 2 });
  assert.deepEqual(
    Object.keys(w).sort(),
    ['hidden', 'reachable', 'total', 'truncated'],
  );
  assert.equal('shown' in w, false, 'no alias — see the contract on describeListWindow');
});
