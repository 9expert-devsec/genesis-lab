import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MasterclassCard } from '@/app/(public)/masterclass/_components/MasterclassCard';

/**
 * A PUBLISHED MASTERCLASS WITH ZERO RENDERABLE BATCHES MUST NOT THROW.
 *
 * ══ THIS IS A LIVE INCIDENT, NOT A HYPOTHETICAL ════════════════════════════
 *
 * /masterclass returned HTTP 500 on the deployed dev app:
 *
 *   TypeError: Cannot read properties of undefined (reading 'effective_price')
 *       at MasterclassCard (MasterclassCard.jsx:111)
 *
 * `getPublishedMasterclasses` attaches only batches whose status is `open` or
 * `full` (getMasterclass.js:47-49). `mas-claude-ai-for-data-analyst` is
 * published and its two batches are `closed` and `draft`, so it arrives with
 * `batches: []`, `firstBatch` is undefined, and the card dereferences it.
 *
 * ── THE GUARD WAS NOT MISSING. IT WAS LEFT BEHIND. ────────────────────────
 * `{firstBatch ? (` still exists further down the same file, with the ORIGINAL
 * price block still commented out inside it. The live copy was lifted above the
 * guard during a layout edit; the guard stayed where it was. That is why the
 * fix is "put the block back inside the guard that is already there" rather
 * than "add a check" — adding one would leave two mechanisms for one rule and a
 * commented third copy for the next reader to trip over.
 *
 * ── WHY THE FIXTURE IS THE EMPTY ARRAY, NOT A MISSING KEY ─────────────────
 * `batches: []` is what the loader actually produces — it always sets the key,
 * defaulting to `[]` (getMasterclass.js:64). A fixture omitting `batches`
 * entirely would exercise the `?.` in `course.batches?.[0]`, which was never
 * the broken part, and would stay green against the defect. This suite has been
 * burned by exactly that: fixtures shaped like the fix rather than like the
 * data.
 *
 * ── WHAT THIS TEST DOES NOT DECIDE ────────────────────────────────────────
 * Whether a zero-batch course SHOULD appear in the listing at all, and what the
 * card should show when it does, is a product question and is deliberately not
 * asserted here. This file pins one thing only: it must not throw. The second
 * test pins that the fix did not achieve that by deleting the price for
 * everyone.
 */

const R = (el) => renderToStaticMarkup(el);

/** The live row, as `getPublishedMasterclasses` hands it over. */
const NO_BATCH_COURSE = {
  slug: 'mas-claude-ai-for-data-analyst',
  title_th: 'Claude AI for Data Analyst',
  subtitle_th: 'หลักสูตรวิเคราะห์ข้อมูลด้วย Claude',
  cover_image_url: 'https://example.invalid/cover.png',
  level: 'intermediate',
  duration_hours: 12,
  schedule_days: ['เสาร์', 'อาทิตย์'],
  time_start: '09:00',
  time_end: '16:00',
  batches: [],
};

/** The same course with one open batch — the ordinary path. */
const WITH_BATCH_COURSE = {
  ...NO_BATCH_COURSE,
  slug: 'mas-ai-dmc',
  batches: [{
    _id: 'b1',
    batch_no: 1,
    status: 'open',
    capacity: 20,
    registered_count: 5,
    effective_price: 9030,
    original_price: 12900,
    is_early_bird: true,
    early_bird_deadline: '2026-09-30T00:00:00.000Z',
    dates: [{ date: '2026-10-04T00:00:00.000Z', day_label: 'เสาร์ 4 ต.ค.' }],
  }],
};

test('a published masterclass with batches: [] renders instead of throwing', () => {
  let html;
  assert.doesNotThrow(
    () => { html = R(createElement(MasterclassCard, { course: NO_BATCH_COURSE })); },
    'MasterclassCard threw on a course with no open/full batches — this is the /masterclass 500'
  );
  // It rendered something recognisable as the card, not an empty string.
  assert.match(html, /mas-claude-ai-for-data-analyst/,
    'the card rendered but does not link to its course');
});

test('the fix did not achieve that by dropping the price for everyone', () => {
  const html = R(createElement(MasterclassCard, { course: WITH_BATCH_COURSE }));
  assert.match(html, /9,030/, 'a course WITH an open batch must still show its price');
  assert.match(html, /12,900/, 'the early-bird original price must still render');
});
