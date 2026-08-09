import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEARCH_MIN_CHARS,
  SEARCH_TYPES,
  courseHaystack,
  emptySearchCounts,
  normalizeSearchTerm,
  onlineCourseHaystack,
  searchCorpusFor,
} from '@/lib/search/matchSearch';
import {
  ALL_TAB,
  SEARCH_TABS,
  resolveActiveTab,
  tabCount,
  visibleSearchTabs,
} from '@/lib/search/searchTabs';

/**
 * /search's MATCHING RULES.
 *
 * The whole reason search moved to the server is that the searchable surface
 * used to be bounded by what the page could afford to ship. These tests are
 * where that claim is cashed: a course found by a word in its OUTLINE and an
 * article found by a word in its BODY are things the old shape could not do at
 * any price, because neither field was ever in the payload.
 *
 * Pure tier because the matcher is pure — it takes a corpus object and a
 * string. No fetch, no db, no DOM. Same seam as joinCourseSchedules.js.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const COURSE = {
  _id: 'c1',
  course_id: 'MSE-PBI',
  course_name: 'Power BI Desktop',
  program: { program_name: 'Data Analytics' },
  course_teaser: 'สร้าง Dashboard เชิงโต้ตอบสำหรับผู้บริหาร',
  course_objectives: ['เข้าใจการทำ Data Modeling', 'ใช้ DAX คำนวณค่าทางธุรกิจ'],
  training_topics: [
    { title: 'Power Query', bullets: ['การเชื่อมต่อ ODBC', 'Unpivot ข้อมูล'] },
  ],
};

const ONLINE = {
  _id: 'o1',
  o_course_id: 'ONL-EXC',
  o_course_name: 'Excel Essentials Online',
  o_course_teaser: 'เรียนรู้สูตร VLOOKUP และ PivotTable ด้วยตนเอง',
  o_number_lessons: 12,
  website_urls: ['https://academy.example/excel'],
  program: { program_name: 'Office' },
  skills: [{ skill_name: 'Spreadsheet' }],
};

const ARTICLE = {
  _id: 'a1',
  slug: 'thai-body',
  title: 'บทความตัวอย่าง',
  // No spaces around the target term — the Thai case the matcher exists for.
  excerpt: 'บทความนี้อธิบายการวิเคราะห์ข้อมูลด้วยเครื่องมือสมัยใหม่',
  tags: ['excel'],
  /**
   * The BODY, present on the fixture and expected to match NOTHING.
   *
   * Kept on the fixture on purpose: a matcher that quietly started reading a
   * body field again would have nothing to read if the fixture had none, and
   * the "bodies are not matched" test would pass vacuously forever.
   */
  contentText: 'ย่อหน้ากลางบทความกล่าวถึงคำว่าเอกซ์ตร้าเพียงผ่าน ๆ',
  content: '<p>ย่อหน้ากลางบทความกล่าวถึงคำว่าเอกซ์ตร้าเพียงผ่าน ๆ</p>',
};

const CAREER_PATH = { _id: 'cp1', title: 'Data Analyst', short_description: 'เส้นทางสายข้อมูล' };
const SCHEDULE = {
  _id: 's1',
  dates: ['2026-10-17'],
  course_ref: { _id: 'c1', course_id: 'MSE-PBI', course_name: 'Power BI Desktop', course_price: 9000 },
};
const PROMOTION = { _id: 'p1', promotion_id: 'PR1', title: 'ลดราคาปลายปี', detail_plain: 'ส่วนลด 20%', tags: [{ label: 'ลดราคา' }] };

const CORPUS = {
  courses: [COURSE],
  onlineCourses: [ONLINE],
  careerPaths: [CAREER_PATH],
  schedules: [SCHEDULE],
  promotions: [PROMOTION],
  articles: [ARTICLE],
};

const idsOf = (rows, key = '_id') => rows.map((r) => r[key]);

// ── THE TESTS THIS BATCH EXISTS FOR ─────────────────────────────────────────

test('a course is found by a word that appears ONLY in its TEASER', () => {
  /**
   * `course_teaser` lives on the upstream DETAIL response, never on the list
   * response the old client-side page shipped — so this is still the recall
   * that only a server-side search can have, and it is what survived the
   * narrowing.
   */
  const { results, counts } = searchCorpusFor(CORPUS, 'dashboard');
  assert.deepEqual(idsOf(results.courses), ['c1']);
  assert.equal(counts.courses, 1);
});

test('a course is found by its PROGRAM name alone — deliberately kept', () => {
  /**
   * The one searchable-but-not-displayed field. A search for `Power BI` should
   * return every course in that program even when the course's own title does
   * not repeat the words, so the program name stays in the haystack while the
   * card stops printing it.
   */
  for (const field of ['course_name', 'course_id', 'course_teaser']) {
    assert.equal(
      String(COURSE[field]).toLowerCase().includes('data analytics'), false,
      `fixture guard: "${field}" must not contain the program name`,
    );
  }
  assert.deepEqual(idsOf(searchCorpusFor(CORPUS, 'data analytics').results.courses), ['c1']);
});

test('CONTROL: dropping the program name loses exactly that recall', () => {
  const withoutProgram = (c) =>
    [c.course_name, c.course_id, c.course_teaser].filter(Boolean).join('\n').toLowerCase();
  assert.equal(withoutProgram(COURSE).includes('data analytics'), false, 'it would be lost…');
  assert.ok(courseHaystack(COURSE).includes('data analytics'), '…and the real matcher keeps it');
  // …while every other kept term is unaffected by that field.
  for (const term of ['power bi', 'mse-pbi', 'dashboard']) {
    assert.ok(withoutProgram(COURSE).includes(term), `"${term}" does not depend on the program`);
  }
});

test('a term appearing ONLY in course_objectives or training_topics returns NOTHING', () => {
  /**
   * ── THE REVERSAL, AS A POSITIVE CLAIM ─────────────────────────────────────
   * These two fields WERE matched, on the argument that curriculum text is
   * structured rather than prose. In use that was wrong — not because the
   * matches were false, but because the visitor could not SEE why: a course
   * surfaced by a bullet twelve items down its outline reads as a stray
   * result, and the snippet added to explain it made every card longer without
   * making any of them convincing.
   *
   * Written as its own test rather than as a deleted one, so the narrowing is
   * something the suite asserts instead of something it stopped asserting.
   */
  for (const [term, where] of [
    ['dax', 'course_objectives'],
    ['unpivot', 'training_topics (a bullet)'],
    ['power query', 'training_topics (a title)'],
  ]) {
    const { results, counts, total } = searchCorpusFor(CORPUS, term);
    assert.deepEqual(results.courses, [], `"${term}" (${where}) must not surface the course`);
    assert.equal(counts.courses, 0);
    assert.equal(total, 0, 'and must not leak into another bucket either');
  }
});

test('CONTROL: re-adding either field WOULD return the course', () => {
  /**
   * Without this, "objectives are not matched" passes against a matcher that
   * matches nothing at all, or against a fixture whose objectives are empty.
   * Replays the implementation that was removed, field by field.
   */
  const withObjectives = (c) =>
    [c.course_name, c.course_id, c.program?.program_name, c.course_teaser,
      ...(c.course_objectives ?? [])].filter(Boolean).join('\n').toLowerCase();
  const withTopics = (c) =>
    [c.course_name, c.course_id, c.program?.program_name, c.course_teaser,
      ...(c.training_topics ?? []).flatMap((t) => [t.title, ...(t.bullets ?? [])])]
      .filter(Boolean).join('\n').toLowerCase();

  assert.ok(withObjectives(COURSE).includes('dax'), 'the old objectives rule DID reach it');
  assert.ok(withTopics(COURSE).includes('unpivot'), 'and the old topics rule DID too');
  assert.equal(courseHaystack(COURSE).includes('dax'), false, 'the real matcher does not');
  assert.equal(courseHaystack(COURSE).includes('unpivot'), false);

  // …and the fields that ARE matched still work, so this is a narrowing.
  for (const kept of ['power bi', 'mse-pbi', 'data analytics', 'dashboard']) {
    assert.ok(courseHaystack(COURSE).includes(kept), `"${kept}" must still match`);
  }
});

test('a THAI term matching mid-word in an article EXCERPT returns that article', () => {
  /**
   * THE THAI CASE. `วิเคราะห์` sits inside `การวิเคราะห์ข้อมูลด้วย…` with no
   * space on either side, because Thai does not put spaces between words — so
   * any word-boundary or tokenising matcher misses it entirely.
   *
   * The field moved (excerpt, not body — see the test below) but the substring
   * requirement did not, and it is the requirement that matters: the same trap
   * applies to every Thai field in the corpus.
   */
  const { results, counts } = searchCorpusFor(CORPUS, 'วิเคราะห์');
  assert.deepEqual(idsOf(results.articles), ['a1']);
  assert.equal(counts.articles, 1);
});

test('a term appearing ONLY in an article body returns NOTHING', () => {
  /**
   * THE REVERSAL, stated as a positive claim rather than left as a deleted
   * test. Matching full bodies worked and produced bad results: an article that
   * mentions a term once in passing came back as a result "about" it, because
   * long prose is exactly where incidental mentions live.
   *
   * `เอกซ์ตร้า` is in this fixture's `contentText` and `content` and nowhere
   * else. It must find nothing.
   */
  const term = 'เอกซ์ตร้า';
  assert.ok(CORPUS.articles[0].contentText.includes(term), 'fixture guard: the body does contain it');
  assert.ok(CORPUS.articles[0].content.includes(term), 'and so does the raw html');

  const { results, counts, total } = searchCorpusFor(CORPUS, term);
  assert.deepEqual(results.articles, [], 'an incidental body mention is not a result');
  assert.equal(counts.articles, 0);
  assert.equal(total, 0, 'and it must not leak into any other bucket either');
});

test('CONTROL: re-adding the body to the haystack WOULD return it', () => {
  /**
   * Without this, "the body is not matched" passes against a matcher that
   * matches nothing at all, or against a fixture whose body is empty. Replays
   * the implementation that was removed.
   */
  const term = 'เอกซ์ตร้า';
  const withBody = (a) =>
    [a.title, a.excerpt, a.contentText, ...(a.tags ?? [])]
      .filter(Boolean).join('\n').toLowerCase();
  assert.ok(
    withBody(CORPUS.articles[0]).includes(term),
    'the old rule DID reach it — otherwise this proves nothing',
  );

  const withoutBody = (a) =>
    [a.title, a.excerpt, ...(a.tags ?? [])].filter(Boolean).join('\n').toLowerCase();
  assert.equal(withoutBody(CORPUS.articles[0]).includes(term), false, 'the new rule does not');

  // …and the fields that ARE matched still work, so this is a narrowing rather
  // than a break.
  for (const kept of ['บทความตัวอย่าง', 'วิเคราะห์', 'excel']) {
    assert.ok(withoutBody(CORPUS.articles[0]).includes(kept), `"${kept}" must still match`);
  }
});

test('CONTROL: a word-boundary matcher finds NOTHING for that same Thai term', () => {
  /**
   * The three implementations that all fail here, spelled out rather than
   * described: a `\b` regex, whitespace tokenisation with equality, and the
   * "starts a word" rule a `$text` index effectively applies. MongoDB has no
   * Thai analyser — the whole sentence is one token — so `$text` was rejected
   * for this reason before the index migration was even considered.
   */
  const term = 'วิเคราะห์';
  const text = ARTICLE.excerpt;

  const boundaryRe = new RegExp(`\\b${term}\\b`, 'i');
  assert.equal(boundaryRe.test(text), false, 'a \\b regex cannot find it');

  const tokens = text.split(/\s+/);
  assert.equal(tokens.includes(term), false, 'whitespace tokens cannot find it');
  assert.equal(
    tokens.some((t) => t.startsWith(term)), false,
    'nor can a starts-a-token rule — the term is mid-token',
  );

  // …and the substring matcher, which is what shipped, does find it.
  assert.ok(text.includes(term));
  assert.equal(searchCorpusFor(CORPUS, term).counts.articles, 1);
});

test('an English term still matches an article excerpt too', () => {
  // The Thai case is the hard one; this guards against "fixed Thai, broke ASCII".
  const corpus = { ...CORPUS, articles: [{ ...ARTICLE, excerpt: 'A guide to PivotTable basics' }] };
  assert.equal(searchCorpusFor(corpus, 'pivottable').counts.articles, 1);
  assert.equal(searchCorpusFor(corpus, 'PIVOTTABLE').counts.articles, 1, 'case-insensitive');
});

// ── The two course feeds cannot bleed into each other ───────────────────────

test('online courses match on their OWN field names', () => {
  // `skills` is deliberately NOT in this list any more — the narrowed scope is
  // name, id, program and teaser.
  for (const term of ['excel essentials', 'onl-exc', 'vlookup', 'office']) {
    const { results } = searchCorpusFor(CORPUS, term);
    assert.deepEqual(idsOf(results.onlineCourses), ['o1'], `"${term}" should match the online feed`);
  }
});

test('no PREFIXED field crosses between the two course feeds', () => {
  /**
   * The feeds use `course_*` and `o_course_*`. A generic "walk every string on
   * the object" haystack would make them indistinguishable — and the failure
   * would be silent, showing public courses under คอร์สออนไลน์ and sending
   * visitors off-site for a classroom course.
   *
   * ── `program` IS SHARED ON PURPOSE, AND IS NOT A PREFIXED FIELD ────────────
   * Both feeds carry the same `program: { program_name }` object, and a visitor
   * searching "Data Analytics" should find BOTH the classroom course and the
   * online one. So the extractors are stripped of that one shared field before
   * being compared here: the property being asserted is that no `course_*` name
   * is readable by the online extractor and no `o_course_*` name by the public
   * one — not that the two rows have nothing whatsoever in common. Deleting
   * `program` from either extractor to make a stronger-looking assertion pass
   * would be removing a real search field.
   */
  const noProgram = (row) => ({ ...row, program: undefined });

  assert.equal(
    onlineCourseHaystack(noProgram(COURSE)), '',
    'the online extractor must find no course_* field on a public-course row',
  );
  assert.equal(
    courseHaystack(noProgram(ONLINE)), '',
    'and the public extractor must find no o_course_* field on an online row',
  );

  // The shared field, asserted as shared rather than left implicit.
  assert.ok(onlineCourseHaystack(ONLINE).includes('office'));
  assert.ok(courseHaystack(COURSE).includes('data analytics'));
  assert.ok(
    onlineCourseHaystack(COURSE).includes('data analytics'),
    'program is readable from both — that is the intended behaviour',
  );

  // End to end: a term unique to each feed's TEASER lands in exactly one
  // bucket. (`unpivot` used to serve here from the topic list; that field is
  // no longer matched, so the public-course probe moved to its teaser.)
  const online = searchCorpusFor(CORPUS, 'vlookup');
  assert.equal(online.counts.onlineCourses, 1);
  assert.equal(online.counts.courses, 0);

  const public_ = searchCorpusFor(CORPUS, 'dashboard');
  assert.equal(public_.counts.courses, 1);
  assert.equal(public_.counts.onlineCourses, 0);

  // …and a term unique to a course NAME does not reach the other feed either.
  assert.equal(searchCorpusFor(CORPUS, 'power bi desktop').counts.onlineCourses, 0);
  assert.equal(searchCorpusFor(CORPUS, 'excel essentials').counts.courses, 0);
});

test('the online haystack is name / id / program / teaser — and NOT skills', () => {
  /**
   * The narrowed scope, pinned as an ABSENCE as well as a presence. `skills`
   * used to be in here; a term that appears only in a skill name must now find
   * nothing, or the narrowing exists only in the docstring.
   */
  assert.ok(ONLINE.skills.some((s) => s.skill_name === 'Spreadsheet'), 'fixture guard');
  assert.equal(
    searchCorpusFor(CORPUS, 'spreadsheet').counts.onlineCourses, 0,
    'a skill-only term must no longer match the online feed',
  );
  assert.equal(onlineCourseHaystack(ONLINE).includes('spreadsheet'), false);

  // …and the four fields that ARE in scope still work.
  for (const term of ['excel essentials', 'onl-exc', 'office', 'vlookup']) {
    assert.ok(onlineCourseHaystack(ONLINE).includes(term), `"${term}" must still match`);
  }
});

test('the COURSE projection carries course_cover_url across the trim', () => {
  /**
   * `course_cover_url` is a DETAIL-response field — it exists on a corpus row
   * only because the builder runs enrich-courses, and it is what the redesigned
   * card puts in its cover slot. Dropping it from the allowlist costs no error
   * and no test failure anywhere else: every course result would just silently
   * fall back to its placeholder icon.
   */
  const corpus = { ...CORPUS, courses: [{ ...COURSE, course_cover_url: 'https://cdn.example/c.jpg' }] };
  const [row] = searchCorpusFor(corpus, 'power bi').results.courses;
  assert.ok(row, 'no course matched — fixture drift');
  assert.equal(row.course_cover_url, 'https://cdn.example/c.jpg', 'the cover must survive the trim');
});

test('CONTROL: the trim really does drop fields it is not told to keep', () => {
  // Without the test above, "the cover survives" could be true because the
  // projection copies everything — which would defeat the trim's purpose.
  const corpus = {
    ...CORPUS,
    courses: [{ ...COURSE, course_cover_url: 'https://cdn.example/c.jpg', secret_internal_note: 'nope' }],
  };
  const [row] = searchCorpusFor(corpus, 'power bi').results.courses;
  assert.equal('secret_internal_note' in row, false, 'unlisted fields must not cross the wire');
  assert.equal('course_objectives' in row, false, 'nor the large ones the matcher reads');
  assert.equal('training_topics' in row, false);
  assert.ok('course_cover_url' in row, '…but the allowlisted one does');
});

test('CONTROL: a generic object-walking haystack WOULD confuse them', () => {
  // The implementation the explicit extractors exist to rule out.
  const generic = (o) =>
    JSON.stringify(o ?? {}).toLowerCase();
  assert.ok(generic(ONLINE).includes('excel essentials'));
  assert.ok(generic(COURSE).includes('power bi'));
  // …and it also matches the field NAMES, which nothing should.
  assert.ok(generic(ONLINE).includes('o_course_name'), 'a generic walker matches keys too');
  assert.equal(
    onlineCourseHaystack(ONLINE).includes('o_course_name'), false,
    'the real extractor matches VALUES only',
  );
});

// ── Other buckets, and the shape of the answer ──────────────────────────────

test('each bucket matches on the fields it is supposed to', () => {
  const cases = [
    ['data analyst', 'careerPaths', 'cp1'],
    ['power bi desktop', 'schedules', 's1'],
    ['ลดราคา', 'promotions', 'p1'],
    ['บทความตัวอย่าง', 'articles', 'a1'],
  ];
  for (const [term, bucket, id] of cases) {
    const { results } = searchCorpusFor(CORPUS, term);
    assert.deepEqual(idsOf(results[bucket]), [id], `"${term}" → ${bucket}`);
  }
});

test('counts ALWAYS carry every type, with an explicit zero', () => {
  /**
   * The contract, chosen over "absent when zero": an absent key forces every
   * consumer to write `?? 0`, and makes "found nothing" indistinguishable from
   * "this build forgot this type". Hiding a zero tab is a render decision made
   * FROM the value.
   */
  const { counts, results } = searchCorpusFor(CORPUS, 'zzzz-nothing-matches');
  assert.deepEqual(Object.keys(counts).sort(), [...SEARCH_TYPES].sort());
  for (const type of SEARCH_TYPES) {
    assert.equal(counts[type], 0, `${type} must be present and zero`);
    assert.deepEqual(results[type], [], `${type} must be an empty array, not undefined`);
  }
  assert.deepEqual(emptySearchCounts(), counts);
});

test('a term below the minimum is INACTIVE, not empty', () => {
  // "type more" and "nothing found" are different states; the flag is what lets
  // the page tell them apart.
  const short = searchCorpusFor(CORPUS, 'p');
  assert.equal(short.active, false);
  assert.equal(short.total, 0);
  const real = searchCorpusFor(CORPUS, 'po');
  assert.equal(real.active, true);
  assert.equal(SEARCH_MIN_CHARS, 2);
});

test('the projection drops the article body even when a row still carries one', () => {
  /**
   * Belt as well as braces. The body is no longer in the corpus at all (the
   * builder does not select it), so this is the second line of defence: even
   * handed a row that has one, the projection must not put it on the wire.
   */
  const { results } = searchCorpusFor(CORPUS, 'วิเคราะห์');
  const [article] = results.articles;
  assert.ok(article, 'no article matched — fixture drift');
  assert.equal('contentText' in article, false, 'the body must not cross the wire');
  assert.equal('content' in article, false);
  assert.equal(article.slug, 'thai-body', 'but the card fields must survive');
  assert.equal(article.title, 'บทความตัวอย่าง');
});

test('CONTROL: the fixture row really does carry a body to be dropped', () => {
  // Without this, "contentText is absent from the projection" passes because it
  // was never on the input either.
  assert.ok(CORPUS.articles[0].contentText.length > 20);
  assert.ok(CORPUS.articles[0].content.length > 20);
  assert.equal(searchCorpusFor(CORPUS, 'วิเคราะห์').counts.articles, 1, 'and the row does match');
});

test('normalizeSearchTerm is the one place case and padding are decided', () => {
  assert.equal(normalizeSearchTerm('  Power BI '), 'power bi');
  assert.equal(normalizeSearchTerm(null), '');
  assert.equal(normalizeSearchTerm(undefined), '');
  assert.equal(searchCorpusFor(CORPUS, '  POWER BI  ').counts.courses, 1);
});

test('two adjacent fields cannot form a phrase that is in neither', () => {
  // The haystack joins on \n rather than ' ', so "analytics สร้าง" — the tail of
  // the program name plus the head of the teaser — must not match.
  assert.equal(courseHaystack(COURSE).includes('analytics สร้าง'), false);
  assert.ok(courseHaystack(COURSE).includes('data analytics'));
});

// ── Tabs ────────────────────────────────────────────────────────────────────

test('every result type has exactly one tab, plus ทั้งหมด', () => {
  const keys = SEARCH_TABS.map((t) => t.key);
  assert.equal(keys[0], ALL_TAB, 'ทั้งหมด comes first');
  assert.deepEqual([...keys.slice(1)].sort(), [...SEARCH_TYPES].sort(), 'one tab per bucket');
  // คอร์สออนไลน์ sits directly after หลักสูตร.
  assert.deepEqual(keys.slice(1, 3), ['courses', 'onlineCourses']);
});

test('zero-count tabs are not visible; ทั้งหมด always is', () => {
  const counts = { ...emptySearchCounts(), courses: 3, articles: 1 };
  const visible = visibleSearchTabs(counts, 4).map((t) => t.key);
  assert.deepEqual(visible, [ALL_TAB, 'courses', 'articles']);

  // Even with nothing at all, the way back is still rendered.
  assert.deepEqual(visibleSearchTabs(emptySearchCounts(), 0).map((t) => t.key), [ALL_TAB]);
});

test('the active tab falls back to ทั้งหมด when its own count reaches 0', () => {
  /**
   * The transition this exists for: the user is on โปรโมชัน, types one more
   * character, and that count drops to 0. Without the fallback the tab row has
   * no active tab and the panel below is empty for a reason the page never
   * states.
   */
  const withPromos = { ...emptySearchCounts(), promotions: 2, courses: 5 };
  assert.equal(resolveActiveTab('promotions', withPromos, 7), 'promotions');

  const without = { ...emptySearchCounts(), courses: 5 };
  assert.equal(resolveActiveTab('promotions', without, 5), ALL_TAB, 'must fall back');

  // …and the choice is REMEMBERED, not overwritten: deleting the character
  // brings the count back and the user returns to the tab they picked.
  assert.equal(resolveActiveTab('promotions', withPromos, 7), 'promotions');
});

test('resolveActiveTab refuses a key that is not a real bucket', () => {
  assert.equal(resolveActiveTab('nonsense', { ...emptySearchCounts(), courses: 1 }, 1), ALL_TAB);
  assert.equal(resolveActiveTab(undefined, emptySearchCounts(), 0), ALL_TAB);
  assert.equal(resolveActiveTab(ALL_TAB, emptySearchCounts(), 0), ALL_TAB);
});

test('tabCount reads the total for ทั้งหมด and the bucket for everything else', () => {
  const counts = { ...emptySearchCounts(), courses: 3 };
  assert.equal(tabCount(ALL_TAB, counts, 9), 9, 'all shows the grand total, not a bucket');
  assert.equal(tabCount('courses', counts, 9), 3);
  assert.equal(tabCount('promotions', counts, 9), 0);
});

test('CONTROL: the tab helpers DO discriminate — they are not constant', () => {
  // Without this, `visibleSearchTabs` returning everything (or only `all`)
  // would satisfy the assertions above in one direction each.
  const none = visibleSearchTabs(emptySearchCounts(), 0);
  const some = visibleSearchTabs({ ...emptySearchCounts(), schedules: 1 }, 1);
  assert.equal(none.length, 1);
  assert.equal(some.length, 2);
  assert.notDeepEqual(none.map((t) => t.key), some.map((t) => t.key));
});
