import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codesMatchingCourseName, inhouseCourseCodes } from '@/lib/registrations/inhouseCourseSearch';
import { buildRegistrationFilter } from '@/lib/registrations/listFilter';

/**
 * IN-HOUSE SEARCH BY COURSE NAME, WHEN NO IN-HOUSE DOCUMENT HOLDS A NAME.
 *
 * The resolution is pure and the fetch is injected, so every behaviour that
 * matters is testable here without a network — including the two degrade paths,
 * which are the whole risk in this feature.
 *
 * WHAT THIS TIER CANNOT PROVE: that Mongo returns the right rows for the clauses
 * built here. There is no database in this suite. What is proved is the clause
 * SHAPE and the resolution, which is where every failure mode of this feature
 * lives — see the round's human checklist for the one live query.
 */

/** The catalogue, as `buildCourseNameMap` returns it: lowercased code → name. */
const MAP = {
  'pbi-101':  'Power BI Desktop',
  'pbi-301':  'Power BI Advanced',
  'excel-01': 'Excel for Business',
  'sql-pg-query': 'SQL PostgreSQL Query',
};

// ── 1. Resolving a term to codes ────────────────────────────────────────────

test('a name substring resolves to every course that contains it', () => {
  assert.deepEqual(codesMatchingCourseName('power bi', MAP), ['pbi-101', 'pbi-301']);
});

test('resolution is case-insensitive in both directions', () => {
  assert.deepEqual(codesMatchingCourseName('POWER Bi', MAP), ['pbi-101', 'pbi-301']);
  assert.deepEqual(codesMatchingCourseName('excel', MAP), ['excel-01']);
});

test('it is a SUBSTRING match, matching what the other four clauses do', () => {
  /**
   * The other in-house clauses are `{$regex: term, $options: 'i'}` — unanchored
   * and case-insensitive. Resolving by exact name would make หลักสูตร behave
   * differently from every other field in the same box.
   */
  assert.deepEqual(codesMatchingCourseName('desktop', MAP), ['pbi-101']);
  assert.deepEqual(codesMatchingCourseName('for business', MAP), ['excel-01']);
});

test('a term matching no course name resolves to nothing, and does not throw', () => {
  assert.deepEqual(codesMatchingCourseName('acme', MAP), []);
  assert.deepEqual(codesMatchingCourseName('', MAP), []);
  assert.deepEqual(codesMatchingCourseName('   ', MAP), []);
});

test('the term is matched as TEXT, never compiled as a pattern', () => {
  // A user typing regex metacharacters gets a literal search here, not a
  // pattern and not a throw.
  assert.deepEqual(codesMatchingCourseName('.*', MAP), []);
  assert.deepEqual(codesMatchingCourseName('(', MAP), []);
});

test('a missing or empty map resolves to nothing rather than throwing', () => {
  assert.deepEqual(codesMatchingCourseName('power bi', null), []);
  assert.deepEqual(codesMatchingCourseName('power bi', {}), []);
});

// ── 2. The fetching half, with the catalogue injected ───────────────────────

const loadMap = async () => MAP;

test('an in-house search resolves through the catalogue', async () => {
  assert.deepEqual(await inhouseCourseCodes({ q: 'power bi', source: 'inhouse' }, { loadMap }),
    ['pbi-101', 'pbi-301']);
});

test('a PUBLIC search resolves to nothing, and never reaches the catalogue', async () => {
  /**
   * Public registrations carry `courseName` denormalised, so they have a stored
   * name to regex and need no resolution. Asserted by making the loader THROW:
   * if it is called at all this fails, which is a stronger claim than checking
   * the return value.
   */
  const explode = async () => { throw new Error('the catalogue must not be fetched for a public search'); };
  assert.deepEqual(await inhouseCourseCodes({ q: 'power bi', source: 'public' }, { loadMap: explode }), []);
});

test('an EMPTY term never reaches the catalogue either', async () => {
  const explode = async () => { throw new Error('the catalogue must not be fetched for an empty term'); };
  assert.deepEqual(await inhouseCourseCodes({ q: '   ', source: 'inhouse' }, { loadMap: explode }), []);
});

test('AN OUTAGE DEGRADES TO CODE-ONLY SEARCH — it never throws and never empties', async () => {
  /**
   * The requirement, stated as a test: if the lookup fails entirely the search
   * must still work, falling back to what can be matched without names.
   */
  const down = async () => { throw new Error('upstream is down'); };
  assert.deepEqual(await inhouseCourseCodes({ q: 'power bi', source: 'inhouse' }, { loadMap: down }), []);
});

// ── 3. What the query actually asks, end to end ─────────────────────────────

test('searching by NAME reaches the query as an $in of resolved codes', async () => {
  const courseCodes = await inhouseCourseCodes({ q: 'power bi', source: 'inhouse' }, { loadMap });
  const clauses = buildRegistrationFilter({ q: 'power bi', source: 'inhouse', courseCodes }).$or;

  const byName = clauses.find((c) => c.coursesInterested?.$in);
  assert.ok(byName, 'a resolved name never reaches the query');
  assert.deepEqual(byName.coursesInterested.$in, ['pbi-101', 'pbi-301']);
});

test('searching by CODE reaches the query as a regex on the stored field', async () => {
  const courseCodes = await inhouseCourseCodes({ q: 'ZZTEST-EXCEL-01', source: 'inhouse' }, { loadMap });
  assert.deepEqual(courseCodes, [], 'a bare code should resolve to no NAME — it is not in the catalogue');

  const clauses = buildRegistrationFilter({ q: 'ZZTEST-EXCEL-01', source: 'inhouse', courseCodes }).$or;
  const raw = clauses.find((c) => c.coursesInterested?.$regex);
  assert.ok(raw, 'a typed code has nothing to match against');
  assert.equal(raw.coursesInterested.$regex, 'ZZTEST-EXCEL-01');
});

test('A NAME THAT RESOLVES TO NOTHING IS NO MATCH ON THAT TERM, NOT AN ERROR', async () => {
  /**
   * ══ THE REQUIRED DEGRADE, AND THE ONE MOST LIKELY TO BE GOT WRONG ══════════
   *
   * The tempting implementation emits `{$in: []}` for an unresolved term. Inside
   * an `$or` that is harmless — but the shape that would be REALLY wrong is
   * emitting it as an `$and`, or short-circuiting the whole query. Either turns
   * "no course is called acme" into "no registrations exist", and an empty table
   * reads as lost data.
   *
   * So: the other four clauses must survive intact, and the query must be
   * exactly what a plain company/contact search would have been.
   */
  const courseCodes = await inhouseCourseCodes({ q: 'acme', source: 'inhouse' }, { loadMap });
  assert.deepEqual(courseCodes, []);

  const filter = buildRegistrationFilter({ q: 'acme', source: 'inhouse', courseCodes });
  assert.deepEqual(
    filter.$or.map((c) => Object.keys(c)[0]),
    ['companyName', 'contactFirstName', 'contactLastName', 'contactEmail', 'coursesInterested'],
  );
  assert.equal(filter.$or.some((c) => c.coursesInterested?.$in), false,
    'an unresolved term still emitted an $in clause');
  // Nothing has been added OUTSIDE the $or that could empty the result.
  assert.deepEqual(Object.keys(filter), ['$or']);
});

test('THE STATED LIMIT: a course with no resolvable name is findable by code ONLY', async () => {
  /**
   * ZZTEST-EXCEL-01 is the live case — in the registrations, not in the
   * catalogue — so no name for it exists anywhere in this system. Typing "Excel"
   * cannot find it, and this test says so rather than leaving the gap implied.
   *
   * Note what it DOES do: "Excel" still resolves EXCEL-01, so the search returns
   * that course's enquiries. The unresolvable one is missing from the name path
   * and reachable from the code path, which is the honest best available.
   */
  const codes = await inhouseCourseCodes({ q: 'excel', source: 'inhouse' }, { loadMap });
  assert.deepEqual(codes, ['excel-01'], 'the resolvable Excel course was not found');
  assert.equal(codes.includes('zztest-excel-01'), false,
    'an unresolvable code somehow resolved — this test is not measuring what it claims');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the resolution probe would fire on a map that DOES contain the term', () => {
  // Six "resolves to nothing" assertions above pass on a resolver that always
  // returns []. It does not.
  assert.deepEqual(codesMatchingCourseName('acme', { 'acme-01': 'Acme Masterclass' }), ['acme-01']);
  assert.ok(codesMatchingCourseName('power bi', MAP).length > 0, 'the resolver returns nothing for anything');
});

test('CONTROL: matching CODES instead of names is the defect, and looks like this', () => {
  /**
   * The trap this module exists to avoid, built explicitly: a resolver that
   * matched the term against the KEY rather than the value. Typing "Excel" then
   * finds EXCEL-01 by accident of naming and misses "Power BI Desktop" entirely,
   * which is the silent-failure shape the brief names.
   */
  const byCode = (term, map) => Object.keys(map).filter((c) => c.includes(term.toLowerCase()));
  assert.deepEqual(byCode('power bi', MAP), [], 'the code-matching resolver finds a name — the control is wrong');
  assert.deepEqual(codesMatchingCourseName('power bi', MAP), ['pbi-101', 'pbi-301']);
});
