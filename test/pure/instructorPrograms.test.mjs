import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PROGRAMS,
  PROGRAMS_PRESENT_KEY,
  appendProgramsToForm,
  initialProgramIds,
  toProgramOptions,
  resolveInstructorPrograms,
  resolveSubmittedPrograms,
  programCardHref,
  instructorProgramLinks,
} from '@/lib/instructors/instructorPrograms';

/**
 * Programs per instructor (MSDB program _ids). See
 * src/lib/instructors/instructorPrograms.js — above all the NEVER-WIPE rule:
 * the old form sent `programs: []` on every save.
 */

const VALID = new Set(['p1', 'p2', 'p3', 'p4']);

test('payload: an untouched picker re-sends exactly what MSDB holds, in order', () => {
  // MSDB returns populated program objects; the picker starts from their ids.
  const upstream = { programs: [{ _id: 'p3', program_name: 'C' }, { _id: 'p1', program_name: 'A' }] };
  const start = initialProgramIds({ local: { programs: [] }, upstream });
  assert.deepEqual(start, ['p3', 'p1']);
  const fd = appendProgramsToForm(new FormData(), start);
  assert.equal(fd.get(PROGRAMS_PRESENT_KEY), '1');
  assert.deepEqual(fd.getAll('programs'), ['p3', 'p1']);
  // …and the server keeps it unchanged.
  assert.deepEqual(
    resolveSubmittedPrograms({ present: true, submitted: fd.getAll('programs'), current: [], validIds: VALID }),
    { ok: true, programs: ['p3', 'p1'] },
  );
});

test('payload: an unlinked instructor starts from the local list', () => {
  assert.deepEqual(initialProgramIds({ local: { programs: ['p2'] }, upstream: null }), ['p2']);
  assert.deepEqual(initialProgramIds({ local: {}, upstream: undefined }), []);
});

test('server: a save WITHOUT the marker keeps the stored list — never []', () => {
  assert.deepEqual(
    resolveSubmittedPrograms({ present: false, submitted: [], current: ['p2', 'p4'], validIds: VALID }),
    { ok: true, programs: ['p2', 'p4'] },
  );
});

test('server: with the marker, an empty picker is an intentional clear', () => {
  assert.deepEqual(
    resolveSubmittedPrograms({ present: true, submitted: [], current: ['p2'], validIds: VALID }),
    { ok: true, programs: [] },
  );
});

test('server: unknown ids are rejected, duplicates removed in first-seen order', () => {
  const bad = resolveSubmittedPrograms({ present: true, submitted: ['p1', 'nope'], current: [], validIds: VALID });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /nope/);
  assert.deepEqual(
    resolveSubmittedPrograms({ present: true, submitted: ['p2', 'p1', 'p2', 'p1'], current: [], validIds: VALID }),
    { ok: true, programs: ['p2', 'p1'] },
  );
});

test(`server: more than ${MAX_PROGRAMS} distinct programs are rejected`, () => {
  const many = Array.from({ length: MAX_PROGRAMS + 1 }, (_, i) => `x${i}`);
  const all = new Set(many);
  assert.equal(resolveSubmittedPrograms({ present: true, submitted: many, current: [], validIds: all }).ok, false);
  assert.equal(
    resolveSubmittedPrograms({ present: true, submitted: many.slice(0, MAX_PROGRAMS), current: [], validIds: all }).ok,
    true,
  );
});

test('server: if the program list cannot be read, only an unchanged list is accepted', () => {
  assert.deepEqual(
    resolveSubmittedPrograms({ present: true, submitted: ['p1'], current: ['p1'], validIds: null }),
    { ok: true, programs: ['p1'] },
  );
  assert.equal(resolveSubmittedPrograms({ present: true, submitted: ['p2'], current: ['p1'], validIds: null }).ok, false);
});

test('loader: ids resolve to name + icon in stored order; missing ids are dropped', () => {
  const options = toProgramOptions([
    { _id: 'p1', program_name: 'Power BI', programiconurl: 'https://x/pbi.png' },
    { _id: 'p2', program_name: 'Excel', programiconurl: 'https://x/xl.png' },
    { _id: 'p3', program_name: 'No icon', programiconurl: '' },
  ]);
  assert.deepEqual(resolveInstructorPrograms(['p2', 'gone', 'p1', 'p3'], options), [
    { name: 'Excel', iconUrl: 'https://x/xl.png' },
    { name: 'Power BI', iconUrl: 'https://x/pbi.png' },
  ]);
  assert.deepEqual(resolveInstructorPrograms([], options), []);
  assert.deepEqual(resolveInstructorPrograms(['p1'], []), []);
});

// ── the card icon links (AB-2f) ─────────────────────────────────────────────
// Linkability is getPageLinkability()'s shape: slug maps keyed by the
// lower-cased id or code, and the ids whose page is explicitly unpublished.

const PBI = { _id: '68d3c5b02c6a2f1315c0bce5', program_id: 'POWER-BI', program_name: 'Power BI', programiconurl: 'https://x/pbi.png' };
const XL = { _id: '68d3c5b02c6a2f1315c0bce4', program_id: 'MSE', program_name: 'Microsoft Excel', programiconurl: 'https://x/xl.png' };
const linkability = (over = {}) => ({ programSlugs: {}, programBlocked: new Set(), ...over });

test('a program with a page links to it — its slug, matched by code or by _id', () => {
  const [pbi] = toProgramOptions([PBI]);
  assert.equal(programCardHref(pbi, linkability({ programSlugs: { 'power-bi': 'power-bi-all-courses' } })), '/power-bi-all-courses');
  assert.equal(programCardHref(pbi, linkability({ programSlugs: { [PBI._id]: 'pbi-by-id' } })), '/pbi-by-id');
  assert.equal(programCardHref(pbi, linkability()), '/program/power-bi', 'no config → the legacy path the site resolves');
});

test('a program whose page is unpublished gets no link (null)', () => {
  const [pbi] = toProgramOptions([PBI]);
  assert.equal(programCardHref(pbi, linkability({ programBlocked: new Set(['power-bi']) })), null);
  assert.equal(programCardHref(pbi, linkability({ programBlocked: new Set([PBI._id]) })), null);
  assert.equal(programCardHref(pbi, null), null, 'no linkability → no link');
});

test('instructorProgramLinks: stored order, icons only, each with its href or null', () => {
  const options = toProgramOptions([PBI, XL, { _id: 'p3', program_name: 'No icon', programiconurl: '' }]);
  const links = instructorProgramLinks([XL._id, 'gone', PBI._id, 'p3'], options,
    linkability({ programSlugs: { 'power-bi': 'power-bi-all-courses' }, programBlocked: new Set(['mse']) }));
  assert.deepEqual(links, [
    { name: 'Microsoft Excel', iconUrl: 'https://x/xl.png', href: null },
    { name: 'Power BI', iconUrl: 'https://x/pbi.png', href: '/power-bi-all-courses' },
  ]);
});
