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
 */

// ── the boundaries ───────────────────────────────────────────────────────────

test('total < limit → nothing hidden, not truncated', () => {
  const w = describeListWindow({ shown: 37, total: 37, limit: 200 });
  assert.deepEqual(w, { shown: 37, total: 37, hidden: 0, truncated: false });
});

test('total === limit → the window exactly fits, still not truncated', () => {
  // The off-by-one that matters: at exactly `limit` rows nothing is missing, so
  // a banner here would cry wolf on every collection that happens to be round.
  const w = describeListWindow({ shown: 200, total: 200, limit: 200 });
  assert.deepEqual(w, { shown: 200, total: 200, hidden: 0, truncated: false });
});

test('total > limit by ONE → truncated, one row hidden', () => {
  const w = describeListWindow({ shown: 200, total: 201, limit: 200 });
  assert.deepEqual(w, { shown: 200, total: 201, hidden: 1, truncated: true });
});

// ── the incident ─────────────────────────────────────────────────────────────

test('b-003 REGRESSION: the real production shape — 200 shown of 484', () => {
  const w = describeListWindow({ shown: 200, total: 484, limit: 200 });
  assert.equal(w.hidden, 284, '284 articles were invisible to the admin list');
  assert.equal(w.truncated, true, 'the banner must fire for the exact shape that shipped');
  assert.equal(w.total, 484, 'the header must report the collection size, not the fetch size');
  assert.equal(w.shown, 200);
});

// ── controls ─────────────────────────────────────────────────────────────────

test('CONTROL: `truncated` is DERIVED — it takes both values across the inputs', () => {
  // A constant `false` would satisfy every "not truncated" case above, and a
  // constant `true` would satisfy the incident. Neither can satisfy both, so
  // assert both outcomes come out of the same function.
  const outcomes = new Set(
    [
      { shown: 10, total: 10, limit: 200 },
      { shown: 200, total: 200, limit: 200 },
      { shown: 200, total: 201, limit: 200 },
      { shown: 200, total: 484, limit: 200 },
    ].map((input) => describeListWindow(input).truncated)
  );
  assert.deepEqual(
    [...outcomes].sort(), [false, true],
    'truncated returned the same answer for every input — it is a constant, and ' +
    'the banner either never fires or always does',
  );
});

test('CONTROL: `hidden` is measured, not a constant — it tracks total - shown', () => {
  assert.equal(describeListWindow({ shown: 5, total: 5, limit: 200 }).hidden, 0);
  assert.equal(describeListWindow({ shown: 5, total: 6, limit: 200 }).hidden, 1);
  assert.equal(describeListWindow({ shown: 5, total: 12, limit: 200 }).hidden, 7);
  assert.equal(describeListWindow({ shown: 200, total: 484, limit: 200 }).hidden, 284);
});

test('CONTROL: truncation keys off the ROW COUNT, not the limit', () => {
  // These two agree on the current admin page (no server-side filter, so
  // shown === min(total, limit)) and come apart the moment a read returns fewer
  // rows than its limit for some other reason. Keying off `limit` would report
  // "not truncated" here while 90 rows are missing — the original bug, rebuilt.
  const w = describeListWindow({ shown: 10, total: 100, limit: 200 });
  assert.equal(w.truncated, true, 'total > shown means rows are missing, whatever the limit says');
  assert.equal(w.hidden, 90);
  assert.equal(
    100 > 200, false,
    'and `total > limit` — the tempting alternative — is false for this case, ' +
    'which is exactly why it is not the rule',
  );
});

// ── degenerate inputs ────────────────────────────────────────────────────────

test('hidden never goes negative when a client has locally deleted rows', () => {
  // The delete handler removes a row and decrements `total`; a stale or
  // mismatched pair must not render "ซ่อนอยู่ -3 บทความ".
  const w = describeListWindow({ shown: 12, total: 9, limit: 200 });
  assert.equal(w.hidden, 0);
  assert.equal(w.truncated, false);
});

test('shown is clamped to limit — a row count above its own query is a caller bug', () => {
  const w = describeListWindow({ shown: 500, total: 484, limit: 200 });
  assert.equal(w.shown, 200, 'trusting shown here would report 16 rows hidden that are not');
  assert.equal(w.hidden, 284);
  assert.equal(w.truncated, true);
});

test('missing, junk and negative inputs degrade to zero rather than NaN', () => {
  assert.deepEqual(
    describeListWindow(),
    { shown: 0, total: 0, hidden: 0, truncated: false },
  );
  assert.deepEqual(
    describeListWindow({ shown: 'x', total: null, limit: undefined }),
    { shown: 0, total: 0, hidden: 0, truncated: false },
  );
  const w = describeListWindow({ shown: -5, total: 484, limit: 200 });
  assert.equal(w.shown, 0);
  assert.equal(w.hidden, 484, 'a nonsense row count must not shrink the hidden count');
});

test('a zero limit means "no window declared" and does not clamp', () => {
  // Callers that do not pass a limit (or pass 0) still get a truthful comparison
  // between the rows they hold and the collection size.
  const w = describeListWindow({ shown: 300, total: 484, limit: 0 });
  assert.equal(w.shown, 300);
  assert.equal(w.hidden, 184);
  assert.equal(w.truncated, true);
});

// ── the seam: the server page must actually hand `total` over ────────────────

test('SEAM: /admin/articles keeps BOTH items and total, and passes total to the client', () => {
  // The render tests hand `total` in as a prop, so they stay green even if the
  // page reverts to `const { items } = await getArticles(...)` and drops it —
  // which is the ENTIRE original bug. Nothing else in the suite watches this
  // one line. The page is an async RSC that awaits requirePage() → next-auth,
  // so it cannot be imported here; pin it at the source instead.
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
    page, /limit=\{ADMIN_LIST_LIMIT\}/,
    'the client needs the window size it was fetched with',
  );
  assert.match(
    page, /select: ADMIN_LIST_FIELDS/,
    'the list read must be projected — without it every `content` HTML body ' +
    'ships to the browser, and so does the superadmin-only jsonLd.rawOverride',
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
    client, /describeListWindow\(\{ shown: rows\.length, total, limit \}\)/,
    'the window must be measured over the rows the SERVER sent — not `filtered` ' +
    'or `pageRows`, which are the admin\'s own narrowing and are visible to them',
  );
});

test('the returned shape is exactly the four documented keys', () => {
  // The banner destructures these; an extra key would invite a caller to depend
  // on something the contract does not promise.
  assert.deepEqual(
    Object.keys(describeListWindow({ shown: 1, total: 2, limit: 3 })).sort(),
    ['hidden', 'shown', 'total', 'truncated'],
  );
});
