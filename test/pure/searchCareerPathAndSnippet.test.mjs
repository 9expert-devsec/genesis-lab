import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  careerPathCourseStrings,
  careerPathHaystack,
  matchSnippet,
  searchCorpusFor,
  snippetAround,
  SNIPPET_RADIUS,
} from '@/lib/search/matchSearch';

/**
 * TWO rules that were added together and answer the same complaint.
 *
 * The complaint was "search returns things that are not about my term". It had
 * two halves, and they need opposite fixes:
 *
 *   · TOO MUCH — article bodies matched on incidental mentions. Removed (see
 *     searchMatch.test.mjs).
 *   · TOO LITTLE, AND ILLEGIBLE — a career path whose COURSES cover the term
 *     was unfindable, and a course that matched on an outline bullet rendered
 *     as a title with no highlight, which reads as a wrong result even when it
 *     is a good one.
 *
 * This file covers the second half: reaching the courses inside a path, and
 * showing WHY a result matched when the reason is not in its title.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A path whose only mention of "Tableau" is a SYNCED curriculum course, and
 * whose only mention of "ปฏิบัติการเชิงลึก" is an ADMIN-ADDED local course.
 * Neither string appears in the path's own title or description.
 */
const PATH = {
  _id: 'cp1',
  title: 'Data Analyst',
  short_description: 'เส้นทางสู่การเป็นนักวิเคราะห์ข้อมูล',
  tagline: 'เริ่มจากศูนย์จนทำงานได้จริง',
  objectives: ['อ่านและตีความข้อมูลเชิงธุรกิจ'],
  suitable_for: ['ผู้เริ่มต้นสายข้อมูล'],
  description_html: '<div class="wrapper"><span>เนื้อหาแบบยาว</span></div>',
  curriculum: [
    {
      kind: 'section',
      title: 'ขั้นพื้นฐาน',
      items: [
        { kind: 'course', snap: { code: 'MSE-TAB', name: 'Tableau for Beginners' } },
      ],
    },
  ],
  localCourses: [
    { courseName: 'เวิร์กชอปปฏิบัติการเชิงลึก', schedules: [] },
  ],
};

const corpusWith = (careerPaths) => ({
  courses: [],
  onlineCourses: [],
  careerPaths,
  schedules: [],
  promotions: [],
  articles: [],
});

const CORPUS = corpusWith([PATH]);
const ids = (rows) => rows.map((r) => r._id);

// ── The courses inside a path ───────────────────────────────────────────────

test('a term found ONLY in a synced curriculum course name returns that path', () => {
  /**
   * "Tableau" is in `curriculum[0].items[0].snap.name` and nowhere else on the
   * path. Before this, a visitor searching for a tool taught by a path could
   * not find the path that teaches it.
   */
  for (const field of ['title', 'short_description', 'tagline']) {
    assert.equal(
      String(PATH[field]).toLowerCase().includes('tableau'), false,
      `fixture guard: "${field}" must not contain the term`,
    );
  }
  const { results, counts } = searchCorpusFor(CORPUS, 'tableau');
  assert.deepEqual(ids(results.careerPaths), ['cp1']);
  assert.equal(counts.careerPaths, 1);
});

test('a term found ONLY in a course code returns the path too', () => {
  assert.equal(searchCorpusFor(CORPUS, 'mse-tab').counts.careerPaths, 1);
});

test('a term found ONLY in an admin-added localCourses name returns that path', () => {
  const term = 'ปฏิบัติการเชิงลึก';
  assert.equal(
    JSON.stringify(PATH.curriculum).includes(term), false,
    'fixture guard: the term must NOT be in the synced curriculum',
  );
  assert.deepEqual(ids(searchCorpusFor(CORPUS, term).results.careerPaths), ['cp1']);
});

test('CONTROL: reading only `curriculum` misses the localCourses case', () => {
  /**
   * The trap, as a check. `localCourses` is admin-edited and NEVER synced from
   * upstream, so an implementation that walks only the synced structure makes
   * paths findable inconsistently — the same query finds the path whose courses
   * happen to be synced and misses the one whose courses were typed in, with
   * nothing on screen to say which case you are in.
   */
  const curriculumOnly = (cp) => {
    const out = [];
    for (const s of cp.curriculum ?? []) {
      for (const i of s.items ?? []) if (i?.snap) out.push(i.snap.name, i.snap.code);
    }
    return out.filter(Boolean).join('\n').toLowerCase();
  };
  assert.ok(curriculumOnly(PATH).includes('tableau'), 'it does find the synced one…');
  assert.equal(
    curriculumOnly(PATH).includes('ปฏิบัติการเชิงลึก'), false,
    '…and misses the local one, which is the defect',
  );
  assert.ok(careerPathCourseStrings(PATH).includes('เวิร์กชอปปฏิบัติการเชิงลึก'));
});

test('CONTROL: reading only `localCourses` misses the curriculum case', () => {
  const localOnly = (cp) =>
    (cp.localCourses ?? []).map((c) => c?.courseName).filter(Boolean).join('\n').toLowerCase();
  assert.ok(localOnly(PATH).includes('ปฏิบัติการเชิงลึก'), 'it does find the local one…');
  assert.equal(localOnly(PATH).includes('tableau'), false, '…and misses the synced one');
  assert.ok(careerPathCourseStrings(PATH).some((s) => s === 'Tableau for Beginners'));
});

test('the path’s tagline and short description are matched', () => {
  for (const [term, where] of [
    ['เริ่มจากศูนย์', 'tagline'],
    ['นักวิเคราะห์ข้อมูล', 'short_description'],
  ]) {
    assert.equal(searchCorpusFor(CORPUS, term).counts.careerPaths, 1, `${where} should match`);
  }
});

test('a term ONLY in objectives or suitable_for returns nothing', () => {
  /**
   * The same reversal the course objectives got, for the same reason: a path
   * surfaced by an item in a bulleted list nobody can see on the card is a
   * result the visitor cannot evaluate. The courses INSIDE the path stay,
   * because they are the one invisible field with a visible explanation — the
   * card renders a `หลักสูตรในเส้นทาง` snippet naming the course that matched.
   */
  for (const [term, where] of [
    ['ตีความข้อมูล', 'objectives'],
    ['ผู้เริ่มต้นสายข้อมูล', 'suitable_for'],
  ]) {
    assert.equal(
      searchCorpusFor(CORPUS, term).counts.careerPaths, 0,
      `${where} must no longer surface the path`,
    );
  }
});

test('CONTROL: re-adding objectives / suitable_for WOULD return the path', () => {
  // Without this, "objectives are not matched" passes against an empty fixture.
  const withThem = (cp) =>
    [cp.title, cp.tagline, cp.short_description,
      ...(cp.objectives ?? []), ...(cp.suitable_for ?? [])]
      .filter(Boolean).join('\n').toLowerCase();
  assert.ok(withThem(PATH).includes('ตีความข้อมูล'), 'the old rule DID reach objectives');
  assert.ok(withThem(PATH).includes('ผู้เริ่มต้นสายข้อมูล'), 'and suitable_for');
  assert.equal(careerPathHaystack(PATH).includes('ตีความข้อมูล'), false, 'the real one does not');
  assert.equal(careerPathHaystack(PATH).includes('ผู้เริ่มต้นสายข้อมูล'), false);
  // …and everything kept still matches.
  for (const kept of ['data analyst', 'เริ่มจากศูนย์', 'tableau', 'ปฏิบัติการเชิงลึก']) {
    assert.ok(careerPathHaystack(PATH).includes(kept.toLowerCase()), `"${kept}" must still match`);
  }
});

test('the วัตถุประสงค์ snippet disappears with the field, not by special case', () => {
  // It was a SNIPPET_FIELDS entry fed by `objectives`. Once objectives leave
  // the haystack the term never matches, so the snippet can never be reached —
  // no card-level suppression required.
  assert.equal(matchSnippet('careerPaths', PATH, 'ตีความข้อมูล'), null);
  assert.equal(searchCorpusFor(CORPUS, 'ตีความข้อมูล').counts.careerPaths, 0);
});

test('`description_html` is NOT matched — a query for `div` finds nothing', () => {
  /**
   * It is HTML. Matching it means `div`, `span`, `class` and `href` return
   * every path that has any formatting at all — a result set no visitor could
   * explain. Plain-text long-form would need a stripped field, which is a
   * different change.
   */
  assert.ok(PATH.description_html.includes('div'), 'fixture guard: the html does contain it');
  for (const markup of ['div', 'span', 'class=', 'wrapper']) {
    assert.equal(
      searchCorpusFor(CORPUS, markup).counts.careerPaths, 0,
      `"${markup}" must not match through description_html`,
    );
  }
  // …and the visible copy inside that html is not reachable either, which is
  // the accepted cost of leaving it out.
  assert.equal(searchCorpusFor(CORPUS, 'เนื้อหาแบบยาว').counts.careerPaths, 0);
});

// ── Malformed data must skip, not throw ─────────────────────────────────────

test('a malformed curriculum or localCourses entry skips rather than throwing', () => {
  /**
   * Both fields are `Mixed` on the model, so the schema guarantees NOTHING
   * about their shape. A throw here takes down the WHOLE search — every type,
   * not just career paths — for one bad row an editor saved months ago.
   */
  const broken = {
    _id: 'cp2',
    title: 'Broken Path',
    curriculum: [
      null,
      'a string where a section should be',
      { kind: 'section' },                                  // no items
      { items: null },                                      // items not an array
      { items: [null, 'string', {}, { snap: null }, { snap: 'nope' }] },
      { items: [{ snap: { name: 'Survivor Course', code: 'SUR-1' } }] }, // …still read
    ],
    localCourses: [null, 'string', {}, { courseName: 'Local Survivor' }],
  };

  assert.doesNotThrow(() => careerPathCourseStrings(broken));
  assert.doesNotThrow(() => careerPathHaystack(broken));

  const strings = careerPathCourseStrings(broken);
  assert.ok(strings.includes('Survivor Course'), 'a good entry AFTER bad ones still counts');
  assert.ok(strings.includes('SUR-1'));
  assert.ok(strings.includes('Local Survivor'));

  // End to end, alongside a healthy path: the bad row must not break the query.
  const mixed = corpusWith([broken, PATH]);
  assert.doesNotThrow(() => searchCorpusFor(mixed, 'tableau'));
  assert.deepEqual(ids(searchCorpusFor(mixed, 'tableau').results.careerPaths), ['cp1']);
  assert.deepEqual(ids(searchCorpusFor(mixed, 'survivor').results.careerPaths), ['cp2']);
});

test('CONTROL: a naive walker DOES throw on the same fixture', () => {
  // Without this, "does not throw" passes against any implementation, including
  // one that returns nothing at all.
  const naive = (cp) =>
    cp.curriculum.flatMap((s) => s.items.map((i) => i.snap.name));
  const broken = { curriculum: [{ items: [{ snap: null }] }] };
  assert.throws(() => naive(broken), 'the unguarded version really does explode');
  assert.doesNotThrow(() => careerPathCourseStrings(broken));
});

test('a path with neither field is simply not findable by course', () => {
  const bare = { _id: 'cp3', title: 'Bare', short_description: '' };
  assert.deepEqual(careerPathCourseStrings(bare), []);
  assert.equal(searchCorpusFor(corpusWith([bare]), 'tableau').counts.careerPaths, 0);
  assert.equal(searchCorpusFor(corpusWith([bare]), 'bare').counts.careerPaths, 1);
});

// ── Why-it-matched snippets ─────────────────────────────────────────────────

/**
 * ── THE SNIPPET NOW HAS EXACTLY TWO CONSUMERS ───────────────────────────────
 * Course, online-course and article cards lost their snippet when matching
 * narrowed to fields those cards already print. What is left is the two types
 * whose match can genuinely be invisible:
 *
 *   · careerPaths — the match may be a course name INSIDE the path;
 *   · promotions  — `detail_plain` is matched and is rendered nowhere.
 *
 * So every test below is written against those two. A snippet for any other
 * type is not "unused", it is a bug — asserted directly.
 */

const PROMOTION = {
  _id: 'p1',
  promotion_id: 'PR1',
  title: 'ลดราคาปลายปี',
  detail_plain: 'รับส่วนลดพิเศษสำหรับหลักสูตรวิเคราะห์ข้อมูล',
  tags: [{ label: 'ของแถมพิเศษ' }],
};

test('a non-title match returns the matching field’s text, labelled', () => {
  const snip = matchSnippet('careerPaths', PATH, 'tableau');
  assert.ok(snip, 'a curriculum-course match must produce a snippet');
  assert.equal(snip.label, 'หลักสูตรในเส้นทาง', 'labelled by the field it came from');
  assert.equal(snip.text, 'Tableau for Beginners', 'and quotes that field, whole');
});

test('the snippet names the right field when several could match', () => {
  assert.equal(matchSnippet('careerPaths', PATH, 'เริ่มจากศูนย์').label, 'รายละเอียด');
  assert.equal(matchSnippet('careerPaths', PATH, 'ปฏิบัติการเชิงลึก').label, 'หลักสูตรในเส้นทาง');
  assert.equal(matchSnippet('promotions', PROMOTION, 'ส่วนลดพิเศษ').label, 'รายละเอียด');
  assert.equal(matchSnippet('promotions', PROMOTION, 'ของแถม').label, 'แท็ก');
});

test('the types whose fields are all on the card produce NO snippet, ever', () => {
  /**
   * The structural half of removing the snippet from three cards: it is not
   * that those cards stopped rendering one, it is that one is never produced.
   * A card cannot re-grow an explanation for a match the visitor can already
   * see.
   */
  const COURSE = {
    course_name: 'Power BI Desktop',
    course_id: 'MSE-PBI',
    course_teaser: 'สร้าง Dashboard เชิงโต้ตอบ',
    program: { program_name: 'Data Analytics' },
  };
  const ONLINE = { o_course_name: 'Excel Online', o_course_teaser: 'เรียนรู้ PivotTable' };
  const ARTICLE = { title: 'บทความ', excerpt: 'สรุปเรื่องข้อมูล', tags: ['excel'] };

  assert.equal(matchSnippet('courses', COURSE, 'dashboard'), null, 'teaser is on the card');
  assert.equal(matchSnippet('onlineCourses', ONLINE, 'pivottable'), null);
  assert.equal(matchSnippet('articles', ARTICLE, 'ข้อมูล'), null, 'excerpt is on the card');
  assert.equal(matchSnippet('articles', ARTICLE, 'excel'), null, 'and tags are a chip row now');
  assert.equal(matchSnippet('schedules', { course_ref: { course_name: 'x' } }, 'x'), null);
});

test('CONTROL: those same terms DO match — they just carry no snippet', () => {
  /**
   * Without this, "no snippet" would be satisfied by a term that matches
   * nothing at all, which proves the opposite of the intended claim.
   */
  const corpus = {
    ...corpusWith([PATH]),
    courses: [{
      _id: 'c1', course_name: 'Power BI Desktop', course_id: 'MSE-PBI',
      course_teaser: 'สร้าง Dashboard เชิงโต้ตอบ',
      program: { program_name: 'Data Analytics' },
    }],
  };
  const [row] = searchCorpusFor(corpus, 'dashboard').results.courses;
  assert.ok(row, 'the course really is a result');
  assert.equal(row.snippet, null, 'it simply ships no snippet');
});

test('the snippet carries only what a card renders — label and text', () => {
  /**
   * `field` USED TO BE HERE and is gone with its last consumer.
   *
   * It existed so the course and online cards could tell whether the snippet
   * had been cut from the teaser they also print, and suppress the duplicate.
   * Those cards no longer render a snippet at all, so nothing reads it — and a
   * key in a response with no reader is payload plus temptation, the same rule
   * that removed `contentText`, `publishedAt` and the objectives arrays.
   */
  const snip = matchSnippet('careerPaths', PATH, 'tableau');
  assert.deepEqual(Object.keys(snip).sort(), ['label', 'text'], 'exactly two keys');
  assert.equal(typeof snip.label, 'string');
  assert.equal(typeof snip.text, 'string');
});

test('a TITLE match returns no snippet', () => {
  /**
   * The card already highlights its own title; repeating it underneath is
   * noise. Null is the signal for "the reason is already visible".
   */
  assert.equal(matchSnippet('careerPaths', PATH, 'data analyst'), null);
  assert.equal(matchSnippet('promotions', PROMOTION, 'ลดราคาปลายปี'), null);
  // …and a term in BOTH the title and a body field still yields nothing: the
  // title is what the visitor sees first.
  assert.equal(
    matchSnippet('careerPaths', { ...PATH, tagline: 'Data Analyst ขั้นสูง' }, 'data analyst'),
    null,
  );
});

test('a career-path course name comes back as its own labelled snippet', () => {
  const snip = matchSnippet('careerPaths', PATH, 'tableau');
  assert.equal(snip?.label, 'หลักสูตรในเส้นทาง');
  assert.equal(snip?.text, 'Tableau for Beginners');
});

test('the snippet travels on the projected row, and only when earned', () => {
  const corpus = corpusWith([PATH]);
  const onCourse = searchCorpusFor(corpus, 'tableau').results.careerPaths[0];
  assert.equal(onCourse.snippet?.text, 'Tableau for Beginners');

  const onTitle = searchCorpusFor(corpus, 'data analyst').results.careerPaths[0];
  assert.equal(onTitle.snippet, null, 'a title match ships no snippet');

  // The fields the snippet was cut FROM never travel with it.
  assert.equal('curriculum' in onCourse, false);
  assert.equal('localCourses' in onCourse, false);
});

test('snippetAround windows long text around the hit without eating the term', () => {
  /**
   * COMPARED AS WHOLE STRINGS, never with `includes` — an off-by-one here
   * truncates the term itself, and a truncated string is a SUBSTRING of the
   * correct one, so an `includes` assertion passes on the broken output. That
   * trap has already cost a red run in this repo.
   */
  const long = `${'ก'.repeat(200)}วิเคราะห์${'ข'.repeat(200)}`;
  const out = snippetAround(long, 'วิเคราะห์');
  assert.equal(
    out,
    `…${'ก'.repeat(SNIPPET_RADIUS)}วิเคราะห์${'ข'.repeat(SNIPPET_RADIUS)}…`,
    'exactly one radius each side, ellipsised at both ends',
  );

  // Short text is returned whole, with no ellipses at all.
  assert.equal(snippetAround('Unpivot ข้อมูล', 'unpivot'), 'Unpivot ข้อมูล');
  // A hit at the very start gets no leading ellipsis.
  assert.equal(snippetAround(`วิเคราะห์${'ข'.repeat(200)}`, 'วิเคราะห์').startsWith('…'), false);
});

test('CONTROL: the whole-string comparison DOES reject a truncated term', () => {
  // The exact failure `includes` would miss.
  const correct = '…กกกวิเคราะห์ขขข…';
  const truncated = '…กกกวิเคราะ…';
  assert.ok(correct.includes('วิเคราะ'), 'an includes-based probe accepts the broken output');
  assert.notEqual(truncated, correct, 'equality does not');
});

test('an empty or unmatched term produces no snippet rather than an empty one', () => {
  assert.equal(matchSnippet('careerPaths', PATH, ''), null);
  assert.equal(matchSnippet('careerPaths', PATH, 'nothing-here'), null);
  assert.equal(matchSnippet('schedules', { course_ref: { course_name: 'x' } }, 'zzz'), null);
});
