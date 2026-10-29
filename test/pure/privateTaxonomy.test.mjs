import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isHex6,
  validateTaxonomyInput,
  coursesReferencingTaxonomy,
  taxonomyDeleteRefusal,
} from '@/lib/courses/privateTaxonomyStore';
import { privateTaxonomyFields, exactlyOneProgram } from '@/lib/courses/privateProgramRule';
import { privateProgramView, toPrivateCourseView } from '@/lib/courses/privateCourseView';

/**
 * Custom PRIVATE programs/skills (round 2b): the input rule, the
 * one-program rule, the page seam, and the delete refusal.
 *
 * Fixtures are stored shapes: a `private_taxonomy` document as `.lean()`
 * returns it, `/programs` rows as MSDB returns them, and the course form's
 * real FormData (the `program` select value and `private_skills` inputs).
 */

const CUSTOM_PROGRAM = Object.freeze({
  _id: '6740dd0000000000000000d1',
  kind: 'program',
  name: 'ACME Academy',
  logoUrl: 'https://res.cloudinary.com/x/9exp-genesis/private-taxonomy/acme.png',
  color: '#AA3300',
  createdAt: '2026-10-29T03:00:00.000Z',
  updatedAt: '2026-10-29T03:00:00.000Z',
  __v: 0,
});

const MSDB_PROGRAMS = [
  { _id: '6650aa0000000000000000a1', program_id: 'EXCEL', program_name: 'Excel', programcolor: '#1D6F42', programiconurl: 'https://x/excel.svg' },
];

// ── the input rule ─────────────────────────────────────────────────────────

test('hex colours are #RRGGBB exactly', () => {
  for (const ok of ['#AA3300', '#aa3300', '#000000']) assert.equal(isHex6(ok), true, ok);
  for (const bad of ['#A30', 'AA3300', '#AA330', '#AA33000', '#GG0000', 'red', '', null]) {
    assert.equal(isHex6(bad), false, String(bad));
  }
});

test('a program needs a valid colour; a skill may omit it but not give a bad one', () => {
  assert.equal(validateTaxonomyInput({ kind: 'program', name: 'X' }).field, 'color');
  assert.equal(validateTaxonomyInput({ kind: 'program', name: 'X', color: '#abc' }).field, 'color');
  assert.equal(validateTaxonomyInput({ kind: 'skill', name: 'S' }).ok, true);
  assert.equal(validateTaxonomyInput({ kind: 'skill', name: 'S', color: 'blue' }).field, 'color');
  assert.equal(validateTaxonomyInput({ kind: 'course', name: 'X', color: '#AA3300' }).field, 'kind');
  assert.equal(validateTaxonomyInput({ kind: 'program', name: '  ', color: '#AA3300' }).field, 'name');
  const ok = validateTaxonomyInput({ kind: 'program', name: ' ACME ', color: '#aa3300', logoUrl: ' u ' });
  assert.deepEqual(ok, { ok: true, value: { kind: 'program', name: 'ACME', logoUrl: 'u', color: '#AA3300' } });
});

// ── exactly one program ────────────────────────────────────────────────────

function formWith(program, privateSkills = []) {
  const fd = new FormData();
  fd.set('program', program);
  for (const s of privateSkills) fd.append('private_skills', s);
  return fd;
}

test('a custom pick becomes privateProgram and clears program; an MSDB pick the reverse', () => {
  const custom = privateTaxonomyFields(
    { program: `private:${CUSTOM_PROGRAM._id}` },
    formWith(`private:${CUSTOM_PROGRAM._id}`, ['6740dd0000000000000000e1', '6740dd0000000000000000e1', 'junk'])
  );
  assert.deepEqual(custom, {
    program: '',
    privateProgram: CUSTOM_PROGRAM._id,
    privateSkills: ['6740dd0000000000000000e1'],
  }, 'deduped, and a non-id skill value dropped');
  assert.equal(exactlyOneProgram(custom), null);

  const msdb = privateTaxonomyFields({ program: MSDB_PROGRAMS[0]._id }, formWith(MSDB_PROGRAMS[0]._id));
  assert.deepEqual(msdb, { program: MSDB_PROGRAMS[0]._id, privateProgram: null, privateSkills: [] });
  assert.equal(exactlyOneProgram(msdb), null);
});

test('both, neither, or a malformed custom id is refused on the program field', () => {
  const both = exactlyOneProgram({ program: MSDB_PROGRAMS[0]._id, privateProgram: CUSTOM_PROGRAM._id });
  assert.equal(both.field, 'program');
  assert.match(both.error, /เพียงหนึ่ง/);
  assert.equal(exactlyOneProgram({ program: '', privateProgram: null }).field, 'program');
  assert.equal(exactlyOneProgram({ program: '', privateProgram: 'not-an-id' }).field, 'program');
});

// ── the page seam ──────────────────────────────────────────────────────────

test('privateProgramView prefers the custom program, else falls back to MSDB', () => {
  assert.deepEqual(privateProgramView(MSDB_PROGRAMS[0]._id, MSDB_PROGRAMS, CUSTOM_PROGRAM), {
    _id: CUSTOM_PROGRAM._id,
    program_name: 'ACME Academy',
    programiconurl: CUSTOM_PROGRAM.logoUrl,
    programcolor: '#AA3300',
  });
  assert.equal(privateProgramView(MSDB_PROGRAMS[0]._id, MSDB_PROGRAMS, null).programcolor, '#1D6F42');
  assert.equal(privateProgramView('', MSDB_PROGRAMS, null), null);
});

test('a private course on a custom program shows its colour and logo, and never its raw ids', () => {
  const stored = {
    course_id: 'ZZTEST-PRIVATE-01',
    course_name: 'Private',
    program: '',
    privateProgram: CUSTOM_PROGRAM._id,
    privateSkills: ['6740dd0000000000000000e1'],
  };
  const view = toPrivateCourseView(stored, { programs: [], customProgram: CUSTOM_PROGRAM });
  assert.equal(view.program.programcolor, '#AA3300');
  assert.equal(view.program.programiconurl, CUSTOM_PROGRAM.logoUrl);
  assert.ok(!('privateProgram' in view) && !('privateSkills' in view));
});

// ── delete refusal ─────────────────────────────────────────────────────────

test('deleting an item in use is refused, listing each course by code and name', async () => {
  let query = null;
  const courseModel = {
    find: (q) => {
      query = q;
      return { select: () => ({ lean: async () => [
        { _id: 'p1', course_id: 'ZZTEST-PRIVATE-01', course_name: 'Private Excel' },
        { _id: 'p2', course_id: 'ZZTEST-PRIVATE-02', course_name: 'Private Word' },
      ] }) };
    },
  };
  const refs = await coursesReferencingTaxonomy(CUSTOM_PROGRAM._id, { courseModel });
  assert.deepEqual(query, { $or: [{ privateProgram: CUSTOM_PROGRAM._id }, { privateSkills: CUSTOM_PROGRAM._id }] },
    'both the program and the skill reference are checked');
  const refusal = taxonomyDeleteRefusal(refs);
  assert.equal(refusal.ok, false);
  assert.match(refusal.error, /ZZTEST-PRIVATE-01 — Private Excel/);
  assert.match(refusal.error, /ZZTEST-PRIVATE-02 — Private Word/);
  assert.equal(refusal.courses.length, 2);
  assert.equal(taxonomyDeleteRefusal([]), null, 'CONTROL: nothing references it → no refusal');
});
