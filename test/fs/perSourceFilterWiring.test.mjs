import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { PER_SOURCE_PARAMS } from '@/lib/registrations/filterScope';

/**
 * THE SEAM THE PURE TIER CANNOT SEE: THAT THE SCREEN USES THE MECHANISM.
 *
 * test/pure/perSourceFilters proves the namespace helpers preserve each source's
 * values. It cannot prove that page.jsx READS both namespaces or that
 * RegistrationsClient WRITES through them — and that is exactly where this
 * screen's defects have always lived. `range` reached the counts and not the
 * list; `q` reached the list and not the cards. Both modules were internally
 * correct and the screen showed two answers.
 *
 * `page.jsx` is an async server component and RegistrationsClient's navigators
 * need a router, so neither can be invoked from this runner. A source scan is
 * the available proof and it is a real one: it fails the moment either side
 * stops going through `lib/registrations/filterScope`.
 *
 * Read through sourceScan, which strips comments and imports — so the prose in
 * these files explaining the wiring cannot satisfy a matcher, and neither can
 * the import line that names the helpers.
 */

const PAGE    = readSource('src/app/admin/registrations/page.jsx').code;
const CLIENT  = readSource('src/app/admin/registrations/_components/RegistrationsClient.jsx').code;
const ACTIONS = readSource('src/lib/actions/registrations.js').code;
const FILTERS = readSource('src/lib/registrations/listFilter.js').code;

// ════════════════════════════════════════════════════════════════════════════
// 1. THE PAGE READS BOTH NAMESPACES
// ════════════════════════════════════════════════════════════════════════════

test('page.jsx reads each source\'s filters through the shared reader', () => {
  /**
   * TWO calls, not one. The active source's values drive the table and the
   * cards; the OTHER source's drive its toggle badge. A page reading only the
   * active set would have to invent the other badge's filters, which is the
   * disagreement this screen keeps producing.
   */
  const calls = [...PAGE.matchAll(/readSourceFilters\(\s*sp\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(calls, ['source', 'otherSource'],
    'page.jsx does not read exactly the two namespaces, in that order');
});

test('page.jsx derives no filter from a BARE searchParams key any more', () => {
  /**
   * ── THE HALF-DONE VERSION OF THIS CHANGE, AND IT IS THE LIKELY ONE ────────
   * A `sp.q` or `sp.course` left behind reads PUBLIC's value on an in-house
   * render — silently, because public's keys are the bare ones. The page would
   * look converted and one filter would still cross over.
   *
   * `sp.source` is the exception and must stay: `source` is not per-source.
   */
  for (const name of PER_SOURCE_PARAMS) {
    assert.equal(new RegExp(`\\bsp\\.${name}\\b`).test(PAGE), false,
      `page.jsx still reads the bare \`sp.${name}\` — on an in-house render that is public's value`);
  }
  assert.match(PAGE, /\bsp\.source\b/, '`source` is no longer read from the URL at all');
});

test('the other source\'s badge counts under the OTHER source\'s filters', () => {
  /**
   * ══ REVERSED IN ROUND 10, AND THE OLD BEHAVIOUR WAS DELIBERATE ═════════════
   *
   * The badge used to take the ACTIVE source's filters so it could not disagree
   * with the cards beside it. With per-source filters that inverts: the badge is
   * a promise about what a click produces, and a click now shows the other side
   * under its OWN remembered filters.
   *
   * Each dimension is checked to come from `other`, which is what makes this a
   * claim about the VALUES rather than about the call existing.
   */
  const call = /getRegistrationTotal\(\{([\s\S]*?)\}\)/.exec(PAGE);
  assert.ok(call, 'getRegistrationTotal call not found in page.jsx');
  const args = call[1];

  assert.match(args, /source:\s*otherSource/, 'the badge does not ask for the other collection');

  /**
   * ── EVERY SPELLING OF "FROM THE OTHER SOURCE" IS ACCEPTED. THIS WAS A BUG. ──
   *
   * This read `range:\s*otherRange` and `${dim}:\s*other\.${dim}` — bound to the
   * exact spelling each value happens to have today. The `badge-other-range-spelling`
   * control changes `otherRange` to `other.range`, which PRESERVES the property
   * and must therefore redden nothing, and this assertion went red.
   *
   * That is face TWO of defect 7 (see test/sourceScan.mjs): a guard bound so
   * tightly to a name that it forbids a correct reformulation. It appeared here
   * while I was fixing face THREE in registrationsFilterWiring, in the test
   * written to replace it — which is worth recording, because the two faces are
   * opposite errors and the fix for one is the cause of the other if you are not
   * watching. The re-pointed assertion over there accepts both spellings and
   * stayed green; this one did not, and only the control could tell them apart.
   *
   * The property is "the value is derived from the OTHER source's filters".
   * `other.q` and a normalised local `otherQ` both satisfy it; the active
   * source's bare `q` does not. So both spellings are accepted and the active
   * shorthand is rejected explicitly.
   */
  for (const dim of ['q', 'from', 'to', 'course', 'range']) {
    const Dim = dim[0].toUpperCase() + dim.slice(1);
    assert.match(args, new RegExp(`${dim}:\\s*(?:other\\.${dim}|other${Dim})\\b`),
      `the badge takes \`${dim}\` from the ACTIVE source — it would count a set no click can produce`);
    assert.doesNotMatch(args, new RegExp(`(?:^|[{,\\s])${dim}\\s*(?:,|\\}|$)`),
      `the badge takes \`${dim}\` by shorthand — that is the ACTIVE source's value`);
  }
});

test('CONTROL: the badge probes accept a reformulation and reject the active value', () => {
  /**
   * The discrimination form, per the procedure face three added: the two shapes
   * as literals, with the probe shown to separate them. It cannot itself go
   * quiet, because it fails the moment the two stop being distinguishable.
   */
  const active = 'q, range, source: otherSource, from, to, course';
  const local  = 'q: other.q, range: otherRange, source: otherSource';
  const raw    = 'q: other.q, range: other.range, source: otherSource';

  const OTHER = /range:\s*(?:other\.range|otherRange)\b/;
  assert.equal(OTHER.test(active), false, 'the probe passes the ACTIVE source\'s range');
  assert.ok(OTHER.test(local), 'the probe rejects the normalised local');
  assert.ok(OTHER.test(raw), 'the probe rejects a correct reformulation — that is face two');

  const SHORTHAND = /(?:^|[{,\s])range\s*(?:,|\}|$)/;
  assert.ok(SHORTHAND.test(active), 'the shorthand probe cannot see an active-source shorthand');
  assert.equal(SHORTHAND.test(local), false, 'the shorthand probe fires on a correct shape');
  assert.equal(SHORTHAND.test(raw), false, 'the shorthand probe fires on a correct reformulation');
});

test('the badge call names every dimension and SPREADS none', () => {
  /**
   * ── DEFECT 7, PRE-EMPTED RATHER THAN DISCOVERED ──────────────────────────
   *
   * `{ ...other, source: otherSource }` is shorter, behaves identically, and
   * would make fs/registrationsFilterWiring VACUOUS — that file reads this
   * call's object literal looking for each SCOPE_PARAM by name, and a spread
   * satisfies the property while defeating the matcher. The guard would go quiet
   * without going red, which is the failure sourceScan's header names.
   *
   * So the spread is forbidden HERE, at the site, rather than left to be
   * noticed later.
   */
  const call = /getRegistrationTotal\(\{([\s\S]*?)\}\)/.exec(PAGE);
  assert.ok(call);
  assert.equal(/\.\.\./.test(call[1]), false,
    'the badge call spreads its arguments — fs/registrationsFilterWiring reads this literal by name '
    + 'and a spread makes it match nothing while still passing');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. THE CLIENT WRITES THROUGH THE NAMESPACE
// ════════════════════════════════════════════════════════════════════════════

test('navigate writes every key through filterParamKey, never bare', () => {
  const nav = CLIENT.slice(CLIENT.indexOf('const navigate = useCallback'));
  const body = nav.slice(0, nav.indexOf('const switchSource'));
  assert.ok(body.length > 200, 'the navigate body did not parse');

  assert.match(body, /filterParamKey\(\s*name\s*,\s*source\s*\)/,
    'navigate does not namespace its keys — every write would land in public\'s');
  // The key is what params.set/delete receives, so a bare `name` cannot slip in.
  assert.equal(/params\.(?:set|delete)\(\s*name\b/.test(body), false,
    'navigate writes a bare parameter name somewhere — that is public\'s namespace');
  assert.match(body, /params\.set\(key,/, 'navigate does not write the namespaced key');
  assert.match(body, /params\.delete\(key\)/, 'navigate does not clear the namespaced key');
});

test('navigate no longer serialises `source`, and switchSource does', () => {
  /**
   * The split this round introduced. `navigate` writes the CURRENT source's
   * namespace, so asking it to change `source` at the same time would write this
   * side's values while the page renders the other side.
   */
  const next = /const next = \{([^}]*)\}/.exec(CLIENT);
  assert.ok(next, 'navigate\'s next-object not found');
  assert.equal(/\bsource\b/.test(next[1]), false,
    'navigate still serialises `source` — a toggle click would write the wrong namespace');

  assert.match(CLIENT, /const switchSource = useCallback/, 'there is no dedicated source navigator');
});

test('switchSource touches ONE parameter, and no filter key', () => {
  /**
   * ══ THE PROPERTY THE WHOLE DESIGN WAS CHOSEN FOR ═══════════════════════════
   *
   * Keying the namespace on source IDENTITY rather than on active/inactive means
   * a toggle click moves NO value. If `switchSource` ever writes a filter key,
   * that property is gone and every value is in flight on every switch — which
   * is the alternative design, and the one that can lose a filter silently.
   */
  const at = CLIENT.indexOf('const switchSource = useCallback');
  assert.notEqual(at, -1, 'switchSource is gone');
  const body = CLIENT.slice(at, CLIENT.indexOf('};', at));

  const written = [...body.matchAll(/params\.(?:set|delete)\(\s*'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(written)], ['source'],
    `switchSource writes ${written.join(', ')} — it must write only \`source\``);
  assert.equal(/filterParamKey/.test(body), false,
    'switchSource reaches into a filter namespace — switching must move no value');
});

test('the toggle calls switchSource, not navigate', () => {
  assert.match(CLIENT, /onClick=\{\(\) => switchSource\(s\.value\)\}/,
    'the source toggle does not go through switchSource');
  assert.equal(/navigate\(\{\s*source:/.test(CLIENT), false,
    'something still navigates by overriding `source`');
});

// ════════════════════════════════════════════════════════════════════════════
// 2b. THE IN-HOUSE OPTION JOIN — FOUND MISSING BY ITS OWN CONTROLS
// ════════════════════════════════════════════════════════════════════════════
//
// ── HOW THIS SECTION CAME TO EXIST, BECAUSE IT IS THE ARGUMENT FOR CONTROLS ──
//
// `render/inhouseCourseOptions` asserts that an unresolvable code still appears
// and that no label ever becomes a value. Two round-10 controls break exactly
// those properties in page.jsx — `drop-unresolvable` and `label-as-value` — and
// BOTH LEFT THE ENTIRE SUITE GREEN. 5574 passed, 0 failed, twice.
//
// The reason is structural. The render test hands `courseOptions` straight to
// RegistrationsClient, so it proves what the PANEL does with options it is
// given, and page.jsx — an async server component this runner cannot render — is
// where the join actually happens. Nothing observed it.
//
// Worse than the gap: that file's header CLAIMED the join was "asserted at
// source in fs/perSourceFilterWiring". It was not. A pointer to coverage that
// does not exist is more harmful than a stated absence, because it stops the
// next reader looking. The claim is now true, and it is true because two
// controls were run rather than assumed.

test('the in-house join never DROPS an option it cannot name', () => {
  /**
   * THE ONE THAT HIDES ROWS WHILE LOOKING COMPLETE. `ZZTEST-EXCEL-01` is in the
   * registrations and not in the catalogue; an option list that filtered it out
   * would leave its enquiries unreachable by any filter, with nothing on screen
   * saying so. Round 6 measured the general shape at 26 of 39 registrations
   * holding a round the schedule endpoint would not return.
   *
   * Asserted as the ABSENCE OF A FILTER over the option list, which is the one
   * thing a text scan can see here — `.map` transforms, `.filter` removes.
   */
  const join = /const labelledCourseOptions =([\s\S]*?);\n/.exec(PAGE);
  assert.ok(join, 'the in-house option join is gone or has been reshaped');
  const body = join[1];

  assert.equal(/courseOptions\s*\.\s*filter\(/.test(body), false,
    'the option join filters the list — a code the catalogue cannot name would vanish, '
    + 'and its registrations would become unreachable by filter');
  assert.match(body, /courseOptions\.map\(/, 'the join no longer maps the options at all');
});

test('the in-house join changes the LABEL and never the value', () => {
  /**
   * `code` is what the documents hold, what `?course=` means and what
   * `courseClause` matches. A join that wrote the resolved name into `code`
   * would break every existing link and every bookmark, and the filter would
   * then match nothing.
   */
  const join = /const labelledCourseOptions =([\s\S]*?);\n/.exec(PAGE);
  assert.ok(join);
  const body = join[1];

  assert.match(body, /label:\s*courseNames\[/, 'the label is not resolved from the course map');
  assert.equal(/\bcode:\s*courseNames\[/.test(body), false,
    'the join writes a resolved NAME into `code` — every ?course= link and bookmark breaks');
  // The spread is what carries `code` through untouched.
  assert.match(body, /\.\.\.o\b/, 'the original option is not spread through — `code` may not survive');
});

test('the in-house join falls back to the CODE, and only for in-house', () => {
  const join = /const labelledCourseOptions =([\s\S]*?);\n/.exec(PAGE);
  assert.ok(join);
  const body = join[1];

  assert.match(body, /\|\|\s*o\.code/, 'there is no fallback — an unresolved code would render blank');
  assert.match(body, /source === 'inhouse'/, 'the join is not gated on the source');
  // Public already carries `courseName` denormalised, so its labels are the
  // registrations' own and must not be overwritten from the catalogue.
  assert.match(body, /:\s*courseOptions\b/, 'a public render does not pass the options through untouched');
});

test('the join reuses the map already fetched — it adds NO lookup', () => {
  /**
   * The cost claim, made checkable. `buildCourseNameMap` is one
   * `listPublicCourses()` covering the whole catalogue and it is ALREADY in the
   * page's `Promise.all` for the in-house table's course column. The join reads
   * that value; it must not introduce a second fetch, and it must certainly not
   * introduce one per code.
   */
  assert.equal((PAGE.match(/buildCourseNameMap\(/g) ?? []).length, 1,
    'the course map is built more than once on one render');
  assert.equal(/getCourseByCode/.test(PAGE), false,
    'the page reaches for a per-code lookup — that is one upstream request per distinct code');

  // And it is inside the Promise.all, not a serial await bolted on after it.
  const all = /Promise\.all\(\[([\s\S]*?)\]\)/.exec(PAGE);
  assert.ok(all, 'page.jsx no longer has a Promise.all to join');
  assert.match(all[1], /buildCourseNameMap\(\)/,
    'the course map is fetched outside the Promise.all — a serial round trip for a label');
});

test('CONTROL: the join probes can see both defects when they are present', () => {
  /**
   * Four `=== false` claims above, all of which pass on a regex that matched
   * nothing. Pointed at the two breaks as the controls actually write them.
   */
  const dropped = "courseOptions.filter((o) => courseNames[String(o.code).toLowerCase()]).map((o) => ({";
  assert.ok(/courseOptions\s*\.\s*filter\(/.test(dropped), 'the drop probe is blind');

  const swapped = "code: courseNames[String(o.code).toLowerCase()],";
  assert.ok(/\bcode:\s*courseNames\[/.test(swapped), 'the label-as-value probe is blind');

  // …and the real join is non-trivial, so its clean result means something.
  const join = /const labelledCourseOptions =([\s\S]*?);\n/.exec(PAGE);
  assert.ok(join && join[1].length > 80, 'the join parsed to almost nothing');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE COURSE-NAME RESOLUTION REACHES ALL THREE QUERY ACTIONS
// ════════════════════════════════════════════════════════════════════════════

test('all three query actions resolve the term and pass the codes to the builder', () => {
  /**
   * ── THE SAME INVARIANT `SCOPE_PARAMS` GUARDS, ON A DERIVED VALUE ─────────
   *
   * `courseCodes` is not a SCOPE_PARAM: it is `q` RESOLVED, computed inside the
   * actions from the course catalogue, and the page never sees it — so the guard
   * that asserts "the page passes every dimension" cannot cover it.
   *
   * The invariant is identical though. An action that resolves and one that does
   * not produce different answers to the same search, which is this screen's
   * recurring defect with a new dimension. Asserted over the same three actions.
   */
  for (const action of ['listRegistrations', 'getRegistrationStatusCounts', 'getRegistrationTotal']) {
    const at = ACTIONS.indexOf(`export async function ${action}(`);
    assert.notEqual(at, -1, `${action} not found`);
    const next = ACTIONS.indexOf('export async function ', at + 1);
    const body = next === -1 ? ACTIONS.slice(at) : ACTIONS.slice(at, next);

    assert.match(body, /await inhouseCourseCodes\(\{ q, source \}\)/,
      `${action} does not resolve the search term — an in-house name search would miss it`);
    assert.match(body, /\bcourseCodes\b[^;]*\)/,
      `${action} resolves the codes and never passes them to the builder`);
  }
});

test('the resolution has exactly ONE derivation site', () => {
  // Three call sites of one function, not three implementations. The `q` leak
  // happened because the derivation was written more than once.
  assert.equal((ACTIONS.match(/inhouseCourseCodes\(/g) ?? []).length, 3,
    'the number of resolution call sites is not the number of query actions');
  assert.equal(/codesMatchingCourseName/.test(ACTIONS), false,
    'an action reaches past the shared resolver into its internals');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. THE PLACEHOLDER PROMISES WHAT THE QUERY DELIVERS
// ════════════════════════════════════════════════════════════════════════════

test('the in-house placeholder names หลักสูตร only because the clause exists', () => {
  /**
   * ── A PLACEHOLDER IS A PROMISE, AND THIS ONE WAS KEPT HONEST FOR A ROUND ──
   *
   * หลักสูตร was deliberately ABSENT from the in-house box because
   * `coursesInterested` holds codes and no clause could match a typed name. The
   * two facts are asserted TOGETHER here so they cannot drift apart in either
   * direction: adding the word without the clause, or removing the clause and
   * leaving the word.
   *
   * The field → Thai-word mapping is read by a human, not derived — there is no
   * machine-readable link between `contactEmail` and อีเมล. What IS derived is
   * that the course clause exists in the builder.
   */
  assert.ok(CLIENT.includes('ค้นหาบริษัท / ชื่อ / อีเมล / หลักสูตร'),
    'the in-house placeholder does not name the four fields it searches');

  const inhouseBranch = FILTERS.slice(FILTERS.indexOf('const clauses = ['));
  for (const field of ['companyName', 'contactFirstName', 'contactLastName', 'contactEmail', 'coursesInterested']) {
    assert.ok(inhouseBranch.includes(field),
      `the placeholder promises a field the in-house clause list does not hold: ${field}`);
  }
});

test('the public placeholder is unchanged — it was always accurate', () => {
  assert.ok(CLIENT.includes('ค้นหาชื่อ / อีเมล / หลักสูตร'),
    'the public placeholder changed; public has a stored courseName and always searched it');
});

// ════════════════════════════════════════════════════════════════════════════
// CONTROLS
// ════════════════════════════════════════════════════════════════════════════

test('CONTROL: every scanned file is real, and the probes can see what is there', () => {
  /**
   * This file makes several `=== false` claims, and all of them pass on an
   * empty read. Each source is measured, and each negative probe is shown to
   * fire on text that DOES contain the shape.
   */
  for (const [name, src] of Object.entries({ PAGE, CLIENT, ACTIONS, FILTERS })) {
    assert.ok(src.length > 2000, `${name} parsed to ${src.length} chars — too short to be real`);
  }

  const guilty = "const next = { page: '1', status, q, source, range };"
    + " params.set(name, v); navigate({ source: s.value });";
  assert.ok(/\bsource\b/.test(/const next = \{([^}]*)\}/.exec(guilty)[1]),
    'the next-object probe cannot see `source` even when it is there');
  assert.ok(/params\.(?:set|delete)\(\s*name\b/.test(guilty), 'the bare-key probe is blind');
  assert.ok(/navigate\(\{\s*source:/.test(guilty), 'the navigate-by-source probe is blind');
});

test('CONTROL: the bare-searchParams probe fires on a page that still reads one', () => {
  const guilty = "const q = sp.q ?? ''; const course = sp.course;";
  assert.ok(/\bsp\.q\b/.test(guilty), 'the probe cannot see a bare sp.q');
  assert.ok(/\bsp\.course\b/.test(guilty), 'the probe cannot see a bare sp.course');
  // …and the real page does not contain them, which is the assertion above.
  assert.equal(/\bsp\.q\b/.test(PAGE), false);
});
