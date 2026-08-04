import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  SITE_TIME_ZONE,
  SITE_UTC_OFFSET,
  formatSiteDateTime,
  fromLocalInput,
  siteDateParts,
  toLocalInput,
} from '@/lib/articlePublishTime';
import { parseArticleFormData } from '@/lib/articleFormPayload';
import { articleSchema } from '@/lib/schemas/article';
import { AMBIENT_PROBE, AMBIENT_TZ, withTZ, zoneProbe } from '../withTZ.mjs';

/**
 * THE INCIDENT (b-001): an admin in Bangkok picks 18:00 in the article form's
 * `<input type="datetime-local">`, saves, and the article comes back dated
 * 01:00 the NEXT DAY. Save again and it moves another 7 hours.
 *
 * `datetime-local` emits `YYYY-MM-DDTHH:mm` with no offset, which ECMAScript
 * reads in the RUNTIME's zone. The parser runs in a `'use server'` module — on
 * Vercel, TZ=UTC — so 18:00 Bangkok was stored as 18:00Z. The read side was
 * broken the other way (browser-local formatting inside SSR'd client
 * components), so the round trip drifted +7h per save and, for anything picked
 * at 17:00 or later, rolled the calendar date forward.
 *
 * ── WHAT MAKES THESE TESTS NON-VACUOUS ──────────────────────────────────────
 * A "timezone-independent" assertion proves nothing unless the timezone can
 * actually be varied in-process. `TZ_OBSERVABLE` below is the control for that:
 * it asserts the OLD expression DOES change between UTC and Asia/Bangkok. If
 * that ever goes green-by-agreement — a Node build that caches the zone at
 * startup, say — every `withTZ` test below is measuring nothing, and this file
 * says so out loud instead of reporting a false green.
 *
 * ── THE CONCURRENCY HAZARD ──────────────────────────────────────────────────
 * `process.env.TZ` is PROCESS-GLOBAL, and test/run.mjs drives the runner with
 * `isolation: 'none'` and `concurrency: true` — every tier shares one process.
 * So `withTZ` is strictly SYNCHRONOUS with a `finally` restore and contains no
 * `await`: the moment a mutation spans a microtask boundary it leaks into
 * whatever else is mid-flight, and the failure lands in an unrelated file.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * AMBIENT_TZ / zoneProbe / AMBIENT_PROBE / withTZ MOVED to test/withTZ.mjs and
 * are imported above. The mechanism and its rationale are unchanged — including
 * why the restore assigns the resolved ambient zone back rather than deleting
 * the variable — and the three CONTROLS at the bottom of this file still
 * exercise them, which is the point: the helper moved, its proof did not.
 *
 * It moved because a SECOND consumer appeared (test/pure/emailTemplateModels
 * .test.mjs, over the paid-receipt timestamp). Copying a restore that took an
 * incident to get right is how that incident comes back in a file nobody is
 * watching.
 */

const ZONES = ['UTC', 'Asia/Bangkok', 'America/Los_Angeles'];

/**
 * Wall-clock inputs that each encode a distinct way the old code went wrong.
 * `instant` is what 18:00 (etc.) in Bangkok actually IS.
 */
const CASES = [
  { local: '2026-07-30T18:00', instant: '2026-07-30T11:00:00.000Z', why: 'the reported case — evening pick' },
  { local: '2026-07-30T17:00', instant: '2026-07-30T10:00:00.000Z', why: 'the exact hour at which the old code rolled the DATE forward' },
  { local: '2026-07-30T16:59', instant: '2026-07-30T09:59:00.000Z', why: 'one minute below the roll-over — same day under both, so it is not a boundary' },
  { local: '2026-07-31T00:00', instant: '2026-07-30T17:00:00.000Z', why: 'midnight — the ICU hour-24 trap' },
  { local: '2026-07-30T23:59', instant: '2026-07-30T16:59:00.000Z', why: 'last minute of the day' },
  { local: '2024-02-29T12:00', instant: '2024-02-29T05:00:00.000Z', why: 'leap day' },
  { local: '2026-01-01T07:00', instant: '2026-01-01T00:00:00.000Z', why: '07:00 ICT is exactly midnight UTC — the offset laid bare' },
];

// ── 1. round-trip identity ───────────────────────────────────────────────────

test('round trip: toLocalInput(fromLocalInput(v)) === v for every case', () => {
  for (const { local, why } of CASES) {
    assert.equal(
      toLocalInput(fromLocalInput(local)), local,
      `${local} did not survive the round trip (${why}) — saving twice would drift the date`,
    );
  }
});

// ── 2. the reported regression, by name ──────────────────────────────────────

test('b-001: 18:00 picked in Bangkok stores 11:00Z, not 18:00Z', () => {
  assert.equal(
    fromLocalInput('2026-07-30T18:00'), '2026-07-30T11:00:00.000Z',
    'the wall-clock time must be read as Asia/Bangkok. 18:00:00.000Z is the OLD, ' +
    'buggy value — it is 01:00 on 31 July in Bangkok, which is what the admin saw.',
  );
});

test('b-001: every case maps to the instant a Bangkok reader means', () => {
  for (const { local, instant, why } of CASES) {
    assert.equal(fromLocalInput(local), instant, `${local} (${why})`);
  }
});

test('b-001: the calendar DATE no longer rolls forward at 17:00', () => {
  // The signature the admin actually reported: pick an evening time, read the
  // date back, get tomorrow. Reading back through the site formatter must
  // return the day that was typed.
  const stored = fromLocalInput('2026-07-30T18:00');
  const parts = siteDateParts(stored);
  assert.deepEqual(
    { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour },
    { year: 2026, month: 7, day: 30, hour: 18 },
  );
});

// ── 3. TZ-independence ───────────────────────────────────────────────────────

test('TZ-independence: the round trip holds under UTC, Asia/Bangkok and America/Los_Angeles', () => {
  for (const tz of ZONES) {
    withTZ(tz, () => {
      for (const { local, why } of CASES) {
        assert.equal(
          toLocalInput(fromLocalInput(local)), local,
          `round trip broke under TZ=${tz} for ${local} (${why})`,
        );
      }
    });
  }
});

test('TZ-independence: the stored instant is byte-identical under all three zones', () => {
  for (const { local, instant } of CASES) {
    for (const tz of ZONES) {
      const got = withTZ(tz, () => fromLocalInput(local));
      assert.equal(got, instant, `TZ=${tz} changed the stored instant for ${local}`);
    }
  }
});

test('TZ-independence: toLocalInput reads an instant the same way under all three zones', () => {
  const instant = '2026-07-30T11:00:00.000Z';
  for (const tz of ZONES) {
    assert.equal(withTZ(tz, () => toLocalInput(instant)), '2026-07-30T18:00', `TZ=${tz}`);
  }
});

test('TZ-independence: formatSiteDateTime is pinned to the site zone, not the runtime', () => {
  const instant = '2026-07-30T17:30:00.000Z'; // 31 Jul 00:30 in Bangkok
  const opts = { locale: 'en-CA', year: 'numeric', month: '2-digit', day: '2-digit' };
  for (const tz of ZONES) {
    assert.equal(withTZ(tz, () => formatSiteDateTime(instant, opts)), '2026-07-31', `TZ=${tz}`);
  }
});

test('b-001 REGRESSION: the REAL parser stores the Bangkok instant even when the server runs in UTC', () => {
  // ── THIS IS THE TEST THAT WOULD HAVE CAUGHT THE INCIDENT ──────────────────
  // Everything else in this file exercises articlePublishTime directly. This
  // one drives the actual server-action path — parseArticleFormData →
  // articleSchema — with the runtime zone forced, because that is the only
  // difference between a Bangkok laptop (where the bug is invisible) and a
  // Vercel lambda (where it is a 7-hour error on every save).
  //
  // Measured, not assumed: reverting src/lib/articleFormPayload.js to the old
  // `new Date(raw).toISOString()` leaves the ENTIRE suite green on a machine
  // whose system zone is Asia/Bangkok. Only this test reddens it. Any future
  // assertion about publishedAt that does not force the zone is decoration.
  for (const tz of ZONES) {
    const parsed = withTZ(tz, () => {
      const fd = new FormData();
      fd.set('title', 'T');
      fd.set('slug', 's');
      fd.set('content', '<p>c</p>');
      fd.set('publishedAt', '2026-07-30T18:00'); // what the admin picked
      fd.set('active', 'true');
      fd.set('jsonLd', '{}');
      return articleSchema.safeParse(parseArticleFormData(fd));
    });
    assert.ok(parsed.success, `schema rejected under TZ=${tz}: ${JSON.stringify(parsed.error?.issues)}`);
    assert.equal(
      parsed.data.publishedAt, '2026-07-30T11:00:00.000Z',
      `TZ=${tz} — the save path must not consult the runtime zone. ` +
      '2026-07-30T18:00:00.000Z here is the b-001 value: 01:00 on 31 July in Bangkok.',
    );
  }
});

// ── 4. CONTROLS ──────────────────────────────────────────────────────────────

test('CONTROL: process.env.TZ mutation IS observable in-process — otherwise the TZ tests measure nothing', () => {
  // The OLD expression, verbatim from src/lib/articleFormPayload.js before the
  // fix. If Node ever stops honouring a mid-process TZ change, this goes red
  // and tells you the three tests above are vacuous, rather than letting them
  // pass by agreeing with themselves.
  const utc = withTZ('UTC', () => new Date('2026-07-30T18:00').toISOString());
  const bkk = withTZ('Asia/Bangkok', () => new Date('2026-07-30T18:00').toISOString());

  assert.equal(utc, '2026-07-30T18:00:00.000Z', 'the buggy value the incident produced');
  assert.equal(bkk, '2026-07-30T11:00:00.000Z', 'what it should have been');
  assert.notEqual(
    utc, bkk,
    'process.env.TZ no longer affects Date parsing in this runtime, so every ' +
    'TZ-independence assertion in this file is green by construction. Fix the ' +
    'harness (a child process per zone) before trusting them again.',
  );
});

test('CONTROL: formatSiteDateTime WOULD drift if the timeZone pin were dropped', () => {
  // Proves the `timeZone: SITE_TIME_ZONE` in formatSiteDateTime is load-bearing
  // rather than decorative: the same instant, formatted WITHOUT the pin, really
  // does render two different CALENDAR DATES under two runtime zones — which is
  // the shape the incident took (the admin list showed tomorrow).
  //
  // The zone pair matters. UTC vs America/Los_Angeles would NOT show a
  // difference for this instant — 17:30Z is still the 30th in both — so it
  // would pass as "no drift" and quietly assert nothing. UTC vs Asia/Bangkok
  // straddles the date line for this instant, which is the whole point.
  const instant = new Date('2026-07-30T17:30:00.000Z'); // 31 Jul 00:30 in Bangkok
  const opts = { year: 'numeric', month: '2-digit', day: '2-digit' };
  const unpinnedUtc = withTZ('UTC', () => new Intl.DateTimeFormat('en-CA', opts).format(instant));
  const unpinnedBkk = withTZ('Asia/Bangkok', () => new Intl.DateTimeFormat('en-CA', opts).format(instant));
  assert.equal(unpinnedUtc, '2026-07-30', 'what an SSR render on Vercel produced');
  assert.equal(unpinnedBkk, '2026-07-31', 'what the same markup became after hydration in Bangkok');
  assert.notEqual(
    unpinnedUtc, unpinnedBkk,
    'if an unpinned formatter agrees across zones, the pin proves nothing',
  );
  assert.equal(formatSiteDateTime(instant, { locale: 'en-CA', ...opts }), '2026-07-31');
});

test('CONTROL: withTZ restores the ambient zone — otherwise this file corrupts the whole suite', () => {
  // test/run.mjs uses isolation:'none', so `process.env.TZ` is shared with every
  // other test in every tier. A restore that does not restore turns this file
  // into a source of failures somewhere else entirely — which is exactly what
  // `delete process.env.TZ` did before AMBIENT_TZ existed.
  for (const tz of ZONES) withTZ(tz, () => zoneProbe());
  assert.equal(
    zoneProbe(), AMBIENT_PROBE,
    'withTZ leaked a zone. Every test that runs after this file is now being ' +
    'evaluated under the wrong timezone.',
  );
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, AMBIENT_TZ, 'Intl leaked too');
});

test('CONTROL: empty in, empty out — a draft still reaches buildModelData as falsy', () => {
  for (const empty of ['', '   ', null, undefined]) {
    assert.equal(fromLocalInput(empty), '', `fromLocalInput(${JSON.stringify(empty)})`);
  }

  // …and all the way through the real parse path the server action uses.
  const fd = new FormData();
  fd.set('title', 'T');
  fd.set('slug', 's');
  fd.set('content', '<p>c</p>');
  fd.set('publishedAt', '');
  fd.set('active', 'true');
  fd.set('jsonLd', '{}');
  const parsed = articleSchema.safeParse(parseArticleFormData(fd));
  assert.ok(parsed.success, `schema rejected an empty publishedAt: ${JSON.stringify(parsed.error?.issues)}`);
  assert.equal(parsed.data.publishedAt, '');
  assert.ok(!parsed.data.publishedAt, 'must be FALSY, not merely equal to empty string');

  // buildModelData lives in a `'use server'` module and is not exported, so the
  // branch it takes on that falsy value is pinned at the source instead of
  // called. Without this, "falsy" would be an assertion about nothing.
  const actions = readFileSync(path.join(ROOT, 'src/lib/actions/articles.js'), 'utf8');
  assert.match(
    actions, /if \(data\.publishedAt\) \{[\s\S]*?\} else \{\s*out\.publishedAt = null;/,
    'buildModelData no longer writes null for a falsy publishedAt — a draft would ' +
    'get an Invalid Date and sort unpredictably in the admin cascade',
  );
});

test('CONTROL: the round-trip check has teeth — a deliberately wrong inverse fails it', () => {
  // `toLocalInput(fromLocalInput(v)) === v` would also hold if BOTH functions
  // were the identity, or if both were wrong by the same amount. Show the
  // equality is sensitive by feeding it an inverse that is off by the offset.
  const brokenInverse = (iso) => new Date(iso).toISOString().slice(0, 16);
  assert.notEqual(
    brokenInverse(fromLocalInput('2026-07-30T18:00')), '2026-07-30T18:00',
    'a UTC-slicing inverse must NOT satisfy the round trip, or the round-trip ' +
    'test would pass for a pair of functions that both ignore the site timezone',
  );
});

// ── 5. edges the callers actually hit ────────────────────────────────────────

test('an instant that already carries a zone is NOT re-read as wall clock', () => {
  // ArticleForm calls fromLocalInput on its wall-clock state, but the same
  // helper guards the "stamp publishedAt=now" path, which starts from an ISO
  // instant. A prefix-matching regex would shift it another 7h.
  assert.equal(fromLocalInput('2026-07-30T11:00:00.000Z'), '2026-07-30T11:00:00.000Z');
  assert.equal(fromLocalInput('2026-07-30T18:00:00+07:00'), '2026-07-30T11:00:00.000Z');
});

test('datetime-local with seconds (a `step` attribute) is accepted', () => {
  assert.equal(fromLocalInput('2026-07-30T18:00:30'), '2026-07-30T11:00:30.000Z');
});

test('unparseable input degrades to empty rather than Invalid Date', () => {
  for (const junk of ['not-a-date', '2026-13-45T99:99', 'null']) {
    assert.equal(fromLocalInput(junk), '', `fromLocalInput(${junk})`);
  }
  for (const junk of ['', 'not-a-date', null, undefined]) {
    assert.equal(toLocalInput(junk), '', `toLocalInput(${JSON.stringify(junk)})`);
    assert.equal(formatSiteDateTime(junk), '', `formatSiteDateTime(${JSON.stringify(junk)})`);
    assert.equal(siteDateParts(junk), null, `siteDateParts(${JSON.stringify(junk)})`);
  }
});

test('siteDateParts returns a 1-12 month, not a 0-11 index', () => {
  // SearchClient indexes MONTH_TH with `month - 1`. If this ever changes to a
  // JS month index, every Thai month label on /search shifts by one.
  const p = siteDateParts('2026-01-01T00:00:00.000Z'); // 07:00 on 1 Jan in Bangkok
  assert.deepEqual(p, { year: 2026, month: 1, day: 1, hour: 7, minute: 0, second: 0 });
});

test('the two constants describe the same offset', () => {
  // fromLocalInput uses the literal offset; toLocalInput uses the zone name.
  // The round trip is only meaningful while they agree, and they agree only
  // because Thailand has never observed DST. Check both a January and a July
  // date, which is where a DST-observing zone would part company.
  assert.equal(SITE_TIME_ZONE, 'Asia/Bangkok');
  assert.equal(SITE_UTC_OFFSET, '+07:00');
  for (const iso of ['2026-01-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z']) {
    const shifted = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
    assert.equal(
      toLocalInput(iso), shifted.toISOString().slice(0, 16),
      `${SITE_TIME_ZONE} is not a flat ${SITE_UTC_OFFSET} at ${iso} — fromLocalInput ` +
      'and toLocalInput no longer invert each other',
    );
  }
});
