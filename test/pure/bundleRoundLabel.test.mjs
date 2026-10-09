import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bundleRoundLabel,
  BUNDLE_ROUND_GONE_LABEL,
} from '@/lib/pageBuilder/bundleRegistration';

/**
 * The one label for an offered round, and the raw-id fallback it removed.
 *
 * ── THE DEFECT, FROM THE LIVE DOCUMENT ───────────────────────────────────
 * The editor rendered `6a0578e52cf974910f88cdf8 (รอบเดิม)`. Read off the
 * stored page, that round's snapshot carries
 * `dates: ['2026-09-24','2026-09-25']` — the dates were there. What it lacked
 * was a LIVE row, because `listSchedulesByCourse` runs `excludeStartedRounds`
 * and those days are past. Every label site then fell back to the id.
 *
 * So the fixtures below are that exact shape, and the central claim is
 * negative: an ObjectId is never returned, for any input.
 */

const ID = '6a0578e52cf974910f88cdf8';
const SNAP_DATES = ['2026-09-24T00:00:00.000Z', '2026-09-25T00:00:00.000Z'];
const LIVE_DATES = ['2026-10-19T00:00:00.000Z', '2026-10-20T00:00:00.000Z'];

const withSnapshot = { id: ID, snapshot: { id: ID, dates: SNAP_DATES, type: 'classroom' } };
const bare = { id: ID };

test('a LIVE row dates the round', () => {
  const out = bundleRoundLabel(withSnapshot, { dates: LIVE_DATES });
  assert.equal(out.hasDates, true);
  assert.match(out.text, /19\s*-\s*20 ต\.ค\./);
});

test('the LIVE row WINS over the snapshot when both have dates', () => {
  // The snapshot is a fallback, never a second opinion: a round whose dates
  // were moved upstream must show the new ones.
  const out = bundleRoundLabel(withSnapshot, { dates: LIVE_DATES });
  assert.doesNotMatch(out.text, /ก\.ย\./, 'the stale snapshot dates won');
});

test('THE REPORTED CASE: no live row, snapshot HAS dates → the dates', () => {
  const out = bundleRoundLabel(withSnapshot, null);
  assert.equal(out.hasDates, true);
  assert.match(out.text, /24\s*-\s*25 ก\.ย\./);
  assert.doesNotMatch(out.text, new RegExp(ID), 'the raw id is back');
});

test('an EMPTY live row falls through to the snapshot', () => {
  // `{ dates: [] }` is what a live row with no days looks like, and it must not
  // beat a snapshot that can date the round.
  for (const live of [null, {}, { dates: [] }, { dates: null }]) {
    const out = bundleRoundLabel(withSnapshot, live);
    assert.equal(out.hasDates, true, `live=${JSON.stringify(live)}`);
    assert.match(out.text, /24\s*-\s*25 ก\.ย\./);
  }
});

test('NEITHER source has dates → the Thai sentence, never the id', () => {
  for (const live of [null, {}, { dates: [] }]) {
    const out = bundleRoundLabel(bare, live);
    assert.equal(out.hasDates, false);
    assert.equal(out.text, BUNDLE_ROUND_GONE_LABEL);
    assert.doesNotMatch(out.text, new RegExp(ID));
  }
});

test('THE CENTRAL CLAIM: no input produces an ObjectId-shaped label', () => {
  // Every broken shape a stored document or a fetch can produce. The label is
  // read by an author and by a customer; a 24-hex string tells neither of them
  // anything, which is why this is asserted over the whole input space rather
  // than for the one reported case.
  const inputs = [
    undefined, null, {}, { id: ID }, { id: ID, snapshot: null },
    { id: ID, snapshot: {} }, { id: ID, snapshot: { dates: [] } },
    { id: ID, snapshot: { dates: null } }, { id: ID, snapshot: { dates: ['nonsense'] } },
    { id: ID, snapshot: { dates: [null, undefined] } },
  ];
  for (const round of inputs) {
    for (const live of [undefined, null, {}, { dates: [] }, { dates: ['nope'] }]) {
      const { text } = bundleRoundLabel(round, live);
      assert.doesNotMatch(
        text, /[0-9a-f]{24}/,
        `an id reached the label for round=${JSON.stringify(round)} live=${JSON.stringify(live)}`,
      );
      assert.ok(text.trim().length > 0, 'the label must never be empty');
    }
  }
});

test('the fallback sentence says what the author has to do something about', () => {
  // Not just "never an id" — it has to be readable. Pinned so a later edit
  // cannot quietly turn it into a blank or an English string.
  assert.match(BUNDLE_ROUND_GONE_LABEL, /ไม่พบในตาราง/);
});
