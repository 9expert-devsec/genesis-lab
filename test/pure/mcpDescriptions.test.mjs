import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GET_COURSE_DETAIL_DESCRIPTION } from '../../src/lib/mcp/tools/getCourseDetail.js';
import { LIST_LIVE_PROMOTIONS_DESCRIPTION } from '../../src/lib/mcp/tools/listLivePromotions.js';
import { LIST_PROGRAMS_AND_SKILLS_DESCRIPTION } from '../../src/lib/mcp/tools/listProgramsAndSkills.js';
import { LIST_TRAINING_ROUNDS_DESCRIPTION } from '../../src/lib/mcp/tools/listTrainingRounds.js';
import { SEARCH_COURSES_DESCRIPTION } from '../../src/lib/mcp/tools/searchCourses.js';

/**
 * Tool descriptions are read by the model and can be repeated to the user —
 * the sales/CS team. Round 3 live testing had the model relay backend detail
 * word for word, so the descriptions must speak about the DATA THE MODEL
 * RECEIVES, never about the systems behind it.
 *
 * ── WHAT THIS GUARD CANNOT SEE ─────────────────────────────────────────────
 * It matches literal substrings. A paraphrase of an internal name ("the
 * back-office database", "the source system", "the nightly sync") passes it,
 * as does a new internal name nobody added to BANNED. It also sees only these
 * five constants — not the per-argument `.describe()` strings in
 * lib/mcp/register.js, and not text a tool puts in its OUTPUT at run time
 * (e.g. a `warning` field). Those still need a human read.
 */

const DESCRIPTIONS = {
  list_programs_and_skills: LIST_PROGRAMS_AND_SKILLS_DESCRIPTION,
  search_courses: SEARCH_COURSES_DESCRIPTION,
  get_course_detail: GET_COURSE_DETAIL_DESCRIPTION,
  list_training_rounds: LIST_TRAINING_ROUNDS_DESCRIPTION,
  list_live_promotions: LIST_LIVE_PROMOTIONS_DESCRIPTION,
};

/** Internal system / storage names the user never sees. Matched case-insensitively. */
const BANNED = [
  'MSDB', 'Mongo', 'mongoose', 'collection', 'genesis', 'corpus', 'upstream',
  'registered_count', 'is_active', 'is_published', 'signup_url', 'sign_up_url',
  'status=all', 'cache', 'webhook', 'drift',
];

/**
 * A banned word may stay only where it is the name of a field actually
 * present in that tool's OUTPUT. None is today; an entry here must name the
 * tool and the output field it corresponds to.
 */
const ALLOWED_OUTPUT_FIELDS = {
  // e.g. list_live_promotions: ['cache'],  // only if the output had a `cache` field
};

test('there are exactly five tool descriptions and none is empty', () => {
  assert.equal(Object.keys(DESCRIPTIONS).length, 5);
  for (const [name, text] of Object.entries(DESCRIPTIONS)) {
    assert.equal(typeof text, 'string', `${name} description must be a string`);
    assert.ok(text.length > 100, `${name} description is suspiciously short`);
  }
});

test('no tool description names an internal system or storage field', () => {
  const hits = [];
  for (const [name, text] of Object.entries(DESCRIPTIONS)) {
    const allowed = (ALLOWED_OUTPUT_FIELDS[name] ?? []).map((w) => w.toLowerCase());
    const lower = text.toLowerCase();
    for (const word of BANNED) {
      if (allowed.includes(word.toLowerCase())) continue;
      if (lower.includes(word.toLowerCase())) hits.push(`${name}: "${word}"`);
    }
  }
  assert.deepEqual(hits, [], `internal names in tool descriptions:\n  ${hits.join('\n  ')}`);
});

test('seat wording is a fact about the tool, never a company policy', () => {
  // Round 3: the model told a user "9Expert does not publish remaining seat
  // counts" — a policy nobody has confirmed. Every description that mentions
  // seats must frame it as this tool's data, and say not to call it policy.
  const mentioning = Object.entries(DESCRIPTIONS).filter(([, t]) => /seat/i.test(t));
  assert.ok(mentioning.length >= 2, 'at least the rounds and promotions tools must address seats');
  for (const [name, text] of mentioning) {
    assert.ok(text.includes('This tool has no seat-availability data.'), `${name}: must state the tool fact`);
    assert.ok(text.includes('Do not describe this as a company policy.'), `${name}: must forbid the policy framing`);
    assert.ok(!/publishes no seat/i.test(text), `${name}: must not assert what 9Expert publishes`);
  }
});
