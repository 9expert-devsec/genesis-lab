import { test } from 'node:test';
import assert from 'node:assert/strict';

import { windowEndFromInput, toDateInput } from '@/lib/pageBuilder/publishWindow';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { SITE_TIME_ZONE } from '@/lib/articlePublishTime';
import { readSource } from '../sourceScan.mjs';

/**
 * ── previewSession IS IMPORTED DYNAMICALLY, AND THAT IS LOAD-BEARING ───────
 * It captures its HMAC secret at MODULE LOAD:
 *
 *     const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';
 *
 * The runner is `isolation: 'none'` — one process, one module graph — and
 * test/fs/pageBuilderDraftActions sets `AUTH_SECRET` from inside a test, at
 * line ~1318, long after the `pure` tier has finished. So whichever file
 * imports this module FIRST decides the secret for every file after it.
 *
 * A static import here would run during the pure tier with no secret set,
 * freeze `SECRET` at `''`, and make every preview-cookie check in the fs tier
 * return false — which surfaces as eight unrelated preview-route tests failing
 * with "a gate was returned for an authenticated request". That is exactly
 * what happened when this file was first written, and it is a leak of THIS
 * file's making rather than a defect in the code.
 *
 * So the secret is set first and the module is loaded after. `||` rather than
 * `=` in the fs file means it reuses whatever is already there, so the two
 * files agree whichever runs first — the value is irrelevant, only its
 * presence and its stability matter.
 */
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'round43-preview-secret';
const { signPreviewCookie, verifyPreviewCookie } = await import('@/lib/pageBuilder/previewSession');

/**
 * ROUND 43 — a preview link set to expire "today" is usable all of today.
 *
 * Round 42 reported this while fixing the publish window: `setPreviewExpiry`
 * ran `new Date(expireDate)` on the bare `YYYY-MM-DD` the dialog sends, and
 * the DATE-ONLY form parses as UTC midnight — so "28 Aug" died at 07:00 that
 * same Bangkok morning.
 *
 * The fix is a REUSE, not a second conversion: round 42's `windowEndFromInput`
 * already owns "the last instant of this named day, in the site's zone". Its
 * own behaviour is asserted in test/pure/publishWindow, unmodified this round;
 * what is asserted here is that THIS surface reaches for it, and what follows
 * for the three comparisons that read the value back.
 */

const ACTIONS = 'src/lib/actions/pageBuilder.js';
const DIALOG = 'src/components/pageBuilder/editor/PreviewDialog.jsx';

const DAY = '2026-08-28';
const LAST_VALID_UTC = '2026-08-28T16:59:59.999Z'; // = 28 Aug 23:59:59.999 +07:00
const FIRST_DEAD_UTC = '2026-08-28T17:00:00.000Z'; // = 29 Aug 00:00:00.000 +07:00
/** What the OLD line stored for the same typed day: UTC midnight. */
const OLD_STORED = '2026-08-28T00:00:00.000Z';     // = 28 Aug 07:00:00 +07:00

const at = (iso) => new Date(iso).getTime();

/**
 * THE COMPARISON, as all three sites make it.
 *
 * `verifyPreviewPassword`, the public preview route and `setPreviewExpiry`'s
 * own status stamp all test `stored < now`, which makes the stored instant the
 * LAST VALID one. Reproduced here because the first two need a database and a
 * bcrypt round; the reproduction is checked against source below.
 */
const isExpired = (stored, now) => new Date(stored).getTime() < now;

// ── H: the boundary, in both zones ────────────────────────────────────────

test('an expiry of TODAY is valid all of today', async (t) => {
  const stored = windowEndFromInput(DAY);

  await t.test('the named day is stored as its LAST instant, not its first', () => {
    assert.equal(stored, LAST_VALID_UTC);
    assert.notEqual(stored, OLD_STORED, 'the expiry is still pinned to UTC midnight — the reported bug');
  });

  await t.test('valid at 23:59:59.999 Bangkok — the last valid instant', () => {
    assert.equal(isExpired(stored, at(LAST_VALID_UTC)), false);
  });

  await t.test('refused at 00:00:00.000 Bangkok the next day — the first dead instant', () => {
    assert.equal(isExpired(stored, at(FIRST_DEAD_UTC)), true);
  });

  await t.test('the two instants are 1ms apart and straddle Bangkok midnight', () => {
    assert.equal(at(FIRST_DEAD_UTC) - at(LAST_VALID_UTC), 1);
    const inBangkok = (iso) => new Intl.DateTimeFormat('en-CA', {
      timeZone: SITE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(iso));
    assert.match(inBangkok(LAST_VALID_UTC), /^2026-08-28, 23:59:59$/);
    assert.match(inBangkok(FIRST_DEAD_UTC), /^2026-08-29, 00:00:00$/);
  });

  await t.test('CONTROL: the OLD value died at 07:00 that same morning', () => {
    // The reported defect, reproduced rather than described. Without this the
    // cases above would pass for any value that happens to be in the future.
    assert.equal(isExpired(OLD_STORED, at('2026-08-28T00:00:00.000Z')), false,
      'precondition: valid AT its own instant');
    assert.equal(isExpired(OLD_STORED, at('2026-08-28T00:00:00.001Z')), true,
      'the old value did NOT die one millisecond later — the fixture does not reproduce the bug');
    // 07:00 Bangkok is 00:00Z; by 09:00 Bangkok the link was already gone.
    assert.equal(isExpired(OLD_STORED, at('2026-08-28T02:00:00.000Z')), true);
    assert.equal(isExpired(stored, at('2026-08-28T02:00:00.000Z')), false,
      'the FIXED value is dead at the same instant — the fix changes nothing');
  });
});

test('the cookie TTL follows the link to its new last instant', () => {
  /**
   * previewSession caps a 30-minute cookie at the link's own expiry, so the
   * fix has to reach it too — and it does, because the cap reads the stored
   * value rather than re-deriving a day.
   */
  const preview = { passwordHash: 'h', passwordUpdatedAt: new Date(0), expireDate: windowEndFromInput(DAY) };
  // Ten minutes before the link dies: the cookie is cut short to ten minutes.
  const tenBefore = at(LAST_VALID_UTC) - 10 * 60 * 1000;
  const cut = signPreviewCookie('s', preview, tenBefore);
  assert.ok(cut, 'no cookie was minted while the link is still valid');
  assert.equal(cut.maxAge, 600);
  assert.equal(verifyPreviewCookie(cut.value, 's', preview, tenBefore), true);

  // Past the end: refused outright.
  assert.equal(signPreviewCookie('s', preview, at(FIRST_DEAD_UTC)), null);

  // CONTROL: with the OLD value the same visitor at the same moment got nothing.
  assert.equal(signPreviewCookie('s', { ...preview, expireDate: OLD_STORED }, tenBefore), null,
    'the old value was still live ten minutes before Bangkok midnight — the fixture proves nothing');
});

// ── B: reuse, not a second conversion ─────────────────────────────────────

test('the action reaches for round 42’s conversion and defines none of its own', () => {
  const { code, withImports } = readSource(ACTIONS);
  assert.match(withImports, /import \{ windowEndFromInput \} from '@\/lib\/pageBuilder\/publishWindow'/,
    'the action no longer imports the shared conversion');
  assert.match(code, /const iso = windowEndFromInput\(expireDate\);/,
    'setPreviewExpiry no longer converts through the shared module');
  // The defective line, gone from the executed source rather than shadowed.
  assert.equal(code.includes('const d = new Date(expireDate);'), false,
    'the UTC-midnight parse is still in setPreviewExpiry');
});

test('CONTROL: the defective-line matcher recognises its subject', () => {
  assert.equal('  const d = new Date(expireDate);\n'.includes('const d = new Date(expireDate);'), true,
    'the matcher does not work, so the check above means nothing');
});

test('the timezone is restated NOWHERE on this surface', () => {
  /**
   * Round 42's rule, extended to this round's files. articlePublishTime.js owns
   * the site zone; publishWindow.js is its second caller and states why. A
   * third copy in an action or a dialog is the drift both headers were written
   * about — and it would be invisible, because it would agree with the others
   * until the day it did not.
   */
  /**
   * MATCHED WITHOUT REGARD TO QUOTING, and that is not fussiness — it is what
   * the control below found. A guard written as `code.includes("'+07:00'")`
   * sees a single-quoted string and nothing else, so it passes for
   * `` new Date(`${v}T23:59:59.999+07:00`) `` — which is the most natural way
   * to inline the offset and the exact shape this round is preventing. These
   * are patterns over the offset itself.
   */
  const ZONE_PATTERNS = Object.freeze([
    [/Asia\/Bangkok/, 'the zone NAME'],
    [/\+\s*07:?00/, 'the UTC offset'],
    [/\b25200000\b/, 'the offset in milliseconds'],
    [/\b7\s*\*\s*60\s*\*\s*60\s*\*\s*1000\b/, 'the offset as an arithmetic expression'],
  ]);

  for (const rel of [ACTIONS, DIALOG]) {
    const { code } = readSource(rel);
    for (const [pattern, what] of ZONE_PATTERNS) {
      assert.equal(pattern.test(code), false,
        `${rel} restates ${what} (${pattern}). The zone has one owner `
        + '(lib/articlePublishTime.js) and one reuser (lib/pageBuilder/publishWindow.js); a third '
        + 'copy drifts silently, because it agrees with the others until the day it does not.');
    }
  }
});

test('CONTROL: the zone patterns see the offset however it is written', () => {
  /**
   * Four spellings, because the first cut of the guard above matched only the
   * single-quoted one and a break that inlined the offset into a template
   * literal slipped straight past it. The control is what found that.
   */
  const PLANTED = [
    "const OFF = '+07:00';",
    'const d = new Date(`${v}T23:59:59.999+07:00`);',
    'const OFFSET_MS = 25200000;',
    'const OFFSET_MS = 7 * 60 * 60 * 1000;',
    "timeZone: 'Asia/Bangkok',",
  ];
  const patterns = [/Asia\/Bangkok/, /\+\s*07:?00/, /\b25200000\b/, /\b7\s*\*\s*60\s*\*\s*60\s*\*\s*1000\b/];
  for (const planted of PLANTED) {
    assert.equal(patterns.some((p) => p.test(planted)), true,
      `no zone pattern catches ${planted} — the guard above would let it through`);
  }
  // …and it does not fire on ordinary code.
  assert.equal(patterns.some((p) => p.test('const when = new Date(iso);')), false,
    'a zone pattern fires on code that names no zone');
});

// ── C: the round trip ─────────────────────────────────────────────────────

test('a saved expiry reads back as the SAME calendar day', () => {
  let v = windowEndFromInput(DAY);
  for (let i = 0; i < 5; i += 1) v = windowEndFromInput(toDateInput(v));
  assert.equal(v, LAST_VALID_UTC, 'the expiry drifted across five round trips');
  assert.equal(toDateInput(LAST_VALID_UTC), DAY);
});

test('the legacy value reads back as the day it was typed, too', () => {
  /**
   * C's verdict, asserted: the write and the read AGREED before this round and
   * they agree after it. `String(v).slice(0, 10)` took the UTC calendar date,
   * and for both values this surface can hold — UTC midnight from the old
   * writer, 16:59:59.999Z from the new one — the UTC day IS the Bangkok day
   * the author typed. There was no second defect here; unlike round 42's
   * publish window, nothing walked backwards.
   *
   * What changed is that the agreement is now by CONSTRUCTION rather than by
   * arithmetic that holds only for a positive offset and an end-of-day anchor.
   */
  const oldSlice = (v) => String(v).slice(0, 10);
  for (const stored of [OLD_STORED, LAST_VALID_UTC]) {
    assert.equal(oldSlice(stored), DAY, `the old read disagreed for ${stored}`);
    assert.equal(toDateInput(stored), DAY, `the new read disagreed for ${stored}`);
    assert.equal(toDateInput(stored), oldSlice(stored),
      'the two readings differ for a value this surface can actually hold — that would be a '
      + 'behaviour change, and round 43 claims this one is behaviour-preserving');
  }
});

test('CONTROL: the two readings DO differ for a value outside that set', () => {
  // Proves the agreement above is a fact about these values rather than about
  // a comparison that cannot fail. An instant late in the UTC evening is the
  // NEXT day in Bangkok, and only toDateInput says so.
  const evening = '2026-08-28T18:00:00.000Z';
  assert.equal(String(evening).slice(0, 10), '2026-08-28');
  assert.equal(toDateInput(evening), '2026-08-29');
});

test('the dialog reads through the shared module, not a hand-rolled slice', () => {
  const { code, withImports } = readSource(DIALOG);
  assert.match(withImports, /import \{ toDateInput \} from '@\/lib\/pageBuilder\/publishWindow'/,
    'the dialog no longer imports the shared reader');
  assert.match(code, /defaultValue=\{toDateInput\(state\?\.expireDate\)\}/,
    'the date box no longer reads through the shared module');
  assert.match(code, /หมดอายุ \$\{toDateInput\(state\.expireDate\)\}/,
    'the status line no longer reads through the shared module');
  assert.equal(/String\(state\??\.?expireDate\)\.slice\(0, 10\)/.test(code), false,
    'a hand-rolled UTC slice is still reading the expiry back');
});

// ── D: the comparison is untouched, in all three places ───────────────────

/**
 * Every place that asks "has this preview link expired", with the exact text
 * of the comparison. All three test `stored < now`, which makes the stored
 * instant the LAST VALID one — already the right rule once the value means the
 * end of the named day. Round 42 left `isPubliclyVisible` byte-identical for
 * exactly this reason, and the same holds here.
 */
const COMPARISON_SITES = Object.freeze([
  [ACTIONS, 'if (pv.expireDate && new Date(pv.expireDate).getTime() < now) {',
    'verifyPreviewPassword — the password gate'],
  ['src/app/(public)/preview/[slug]/page.jsx', 'if (expireAt !== null && !Number.isNaN(expireAt) && expireAt < now) {',
    'the public preview route — the terminal expired gate'],
  ['src/lib/pageBuilder/previewSession.js', 'if (linkExp !== null && !Number.isNaN(linkExp) && linkExp < exp) exp = linkExp;',
    'the cookie TTL cap — never outlive the link'],
]);

test('all three expiry comparisons are unchanged — the fix was NOT put in the rule', () => {
  for (const [rel, expression, what] of COMPARISON_SITES) {
    const { code } = readSource(rel);
    assert.ok(code.includes(expression),
      `${what} (${rel}) changed. Round 43 fixes the CONVERSION: \`stored < now\` is already right `
      + 'once the stored instant is the last valid one, and moving the fix into a comparison would '
      + 'make one of these three disagree with the other two.');
  }
  assert.equal(COMPARISON_SITES.length, 3, 'a fourth expiry comparison appeared');
});

test('CONTROL: the site reader would see an edited comparison', () => {
  // Without this, "all three present" would pass for a reader returning ''.
  const [rel, expression] = COMPARISON_SITES[0];
  const { code } = readSource(rel);
  assert.ok(code.length > 1000, 'the reader came back with almost nothing');
  assert.equal(code.includes(expression.replace('< now', '<= now')), false,
    'the reader cannot tell < from <=');
});

// ── F: the invalid-date trap ──────────────────────────────────────────────

test('a calendar date that does not exist is REFUSED, not rolled forward', () => {
  /**
   * Round 42's trap, live on this surface until now. `new Date('2026-02-31')`
   * is not Invalid Date — it rolls to 3 March — so the action's `Number.isNaN`
   * check accepted it and stored a day nobody typed. windowEndFromInput
   * round-trips through the site date parts and requires the same calendar day
   * back, so all of these are null and the action turns null into an error.
   */
  for (const impossible of ['2026-02-31', '2026-02-29', '2026-04-31', '2026-06-31']) {
    assert.equal(windowEndFromInput(impossible), null, `${impossible} was accepted`);
  }
  // …and the partials the old check also let through.
  for (const partial of ['2026-08', '2026', '2026-8-28', '', '   ', 'nonsense']) {
    assert.equal(windowEndFromInput(partial), null, `${partial} was accepted`);
  }
  // A real leap day still works.
  assert.equal(toDateInput(windowEndFromInput('2028-02-29')), '2028-02-29');
});

test('CONTROL: today’s NaN-only check WOULD have accepted every one of them', () => {
  // The measurement behind the paragraph above, held rather than restated.
  const oldCheck = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  assert.equal(oldCheck('2026-02-31'), '2026-03-03T00:00:00.000Z', 'V8 no longer rolls 31 February');
  assert.equal(oldCheck('2026-02-29'), '2026-03-01T00:00:00.000Z');
  assert.equal(oldCheck('2026-08'), '2026-08-01T00:00:00.000Z');
  assert.equal(oldCheck('2026'), '2026-01-01T00:00:00.000Z');
  // …and it did reject the two that are genuinely unparseable, which is why
  // the old check looked like it was doing its job.
  assert.equal(oldCheck('nonsense'), null);
  assert.equal(oldCheck('2026-13-01'), null);
});

test('the action turns a refused date into an error, not into "no expiry"', () => {
  /**
   * The branch that matters: an EMPTY box still means "no expiry", but a
   * non-empty box that cannot be a date must not silently clear the expiry —
   * that would extend a link the author was trying to shorten.
   */
  const { code } = readSource(ACTIONS);
  assert.match(code, /if \(!iso\) return \{ ok: false, error: 'วันหมดอายุไม่ถูกต้อง' \};/,
    'a refused date no longer produces an error');
  assert.match(code, /if \(expireDate\) \{/,
    'the empty-box branch that means "no expiry" is gone');
});
