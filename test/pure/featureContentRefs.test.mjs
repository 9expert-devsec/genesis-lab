import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE_KINDS,
  collectFeatureRefs,
  indexCourses,
  pickCourse,
  resolveFeatureContentRefs,
  warnFeatureContentMisses,
} from '@/lib/home/featureContentRefs';
import { hiddenIdSet } from '@/lib/courses/hiddenCourses';
import { mapBannersToFeatureContent } from '@/lib/home/featureContentFromBanners';

/**
 * COURSE AND ARTICLE REFERENCES → THE REAL RECORD, OR NOTHING.
 *
 * ── WHY EVERY CASE HERE IS SYNTHETIC, AND WHY THAT IS NOT A WEAKNESS ────────
 * ZERO banner records of type `course` or `article` exist. Not few — none. So
 * there is no data-driven way to see any of this working, and there will not be
 * until the admin form can create one. Every path below is therefore exercised
 * over in-memory records, and the lookups are injected rather than mocked at
 * the module boundary, so what runs is the real resolver deciding against real
 * shapes.
 *
 * The shapes are not invented either. They are the field names measured off the
 * live feeds: `course_id`/`o_course_id`, `course_name`/`o_course_name`,
 * `course_teaser`/`o_course_teaser`, `course_cover_url`/`o_course_cover_url`.
 *
 * ── THE HAZARDS ARE MEASURED FACTS, NOT HYPOTHETICALS ───────────────────────
 * Read off the live feeds while writing this:
 *   · four in-class ids are mixed-case — SQL-PG-Query, SQL-ADM-Tuning,
 *     MS-SQL-19-Prov, SQL-ADM-Secure. `Power-Apps` is NOT among them any more;
 *     upstream renamed it to POWER-APPS, which is exactly the rename this
 *     module's case-folding exists to survive.
 *   · TWO online ids carry a leading space — " ONL-CYS" and " ONL-MSE-PQ-PM",
 *     not the one the schema comment records.
 *   · 488 articles, 488 of them active, 488 already published. So `active` and
 *     `publishedAt` BOTH currently exclude nothing, and neither filter can be
 *     observed working against production data. That is precisely why the
 *     inactive and future-dated cases are here.
 */

const COURSE = (over = {}) => ({
  _id: 'msdb-1',
  course_id: 'SQL-PG-Query',
  course_name: 'Querying Data with T-SQL',
  course_teaser: 'หลักสูตรนี้ มุ่งเน้นการสืบค้นฐานข้อมูล',
  course_cover_url: 'https://cdn/inclass.webp',
  course_levels: '3',
  course_trainingdays: 3,
  course_traininghours: 18,
  course_price: 11900,
  course_netprice: null,
  ...over,
});

const ONLINE = (over = {}) => ({
  _id: 'msdb-online-1',
  o_course_id: ' ONL-CYS',
  o_course_name: 'Cyber Security for Daily Life',
  o_course_teaser: 'เสริมเกราะป้องกันไซเบอร์',
  o_course_cover_url: 'https://cdn/online.png',
  o_course_levels: '2',
  o_number_lessons: 14,
  o_course_traininghours: 2,
  o_course_price: 290,
  o_course_netprice: null,
  website_urls: ['https://academy.9experttraining.com/courses/cyber'],
  ...over,
});

const ARTICLE = (over = {}) => ({
  slug: 'local-llm',
  title: 'Local LLM',
  excerpt: 'แรงจูงใจหลัก',
  coverUrl: 'https://cdn/article.png',
  publishedAt: new Date('2026-08-01T00:00:00Z'),
  active: true,
  ...over,
});

const courseBanner = (ref, over = {}) => ({
  _id: 'b-course', type: 'course', title: 'คอร์ส', active: true, weight: 0,
  course_ref: ref, ...over,
});
const articleBanner = (slug, over = {}) => ({
  _id: 'b-article', type: 'article', title: 'บทความ', active: true, weight: 0,
  article_slug: slug, ...over,
});

const NOW = new Date('2026-08-19T00:00:00Z');

/** Injected lookups. Every test states exactly what the world contains. */
function deps({ inclass = [], online = [], articles = [], hidden = [] } = {}) {
  return {
    now: NOW,
    listCourses: async () => ({ items: inclass }),
    listOnline: async () => online,
    // Built through the REAL hiddenIdSet, which normalises on the way in --
    // production reads CourseExtension rows and never a bare string. A fixture
    // that hand-rolls the Set can assert a behaviour the system never promises,
    // which is exactly what happened on the first version of this file.
    loadHidden: async () => hiddenIdSet(hidden.map((courseId) => ({ courseId }))),
    findArticles: async (slugs, at) =>
      articles.filter(
        (a) => slugs.includes(a.slug) && a.active === true && a.publishedAt <= at
      ),
  };
}

// ── COLLECTION ─────────────────────────────────────────────────────────────

test('only course and article banners contribute references', () => {
  const refs = collectFeatureRefs([
    { _id: 'v', type: 'youtube', youtube_id: 'x' },
    { _id: 'i', type: 'image_desktop', image_url: 'u' },
    courseBanner({ courseId: 'ABC', kind: COURSE_KINDS.INCLASS }),
    articleBanner('slug-1'),
  ]);
  assert.deepEqual(refs.articleSlugs, ['slug-1']);
  assert.deepEqual(refs.inclassKeys, ['ABC']);
  assert.deepEqual(refs.onlineKeys, []);
});

test('N banners pointing at ONE course collect ONE reference', () => {
  const refs = collectFeatureRefs([
    courseBanner({ courseId: 'abc', kind: COURSE_KINDS.INCLASS }, { _id: 'a' }),
    courseBanner({ courseId: '  ABC ', kind: COURSE_KINDS.INCLASS }, { _id: 'b' }),
  ]);
  assert.deepEqual(refs.inclassKeys, ['ABC'], 'both spellings are one key');
});

// ── MATCHING ───────────────────────────────────────────────────────────────

test('a course resolves only AFTER case-folding', () => {
  const index = indexCourses([COURSE()], { idKey: 'course_id' });
  // The stored code is what an admin saved before upstream re-cased it.
  const hit = pickCourse(index, { courseId: 'sql-pg-query' });
  assert.ok(hit, 'a lower-cased code must still reach SQL-PG-Query');
  assert.equal(hit.course_id, 'SQL-PG-Query');
});

test('CONTROL: case-folding is what did it — a different code still misses', () => {
  // Without this, "case-folding resolves it" could be passing because the
  // index returns something for any input at all.
  const index = indexCourses([COURSE()], { idKey: 'course_id' });
  assert.equal(pickCourse(index, { courseId: 'sql-pg-querty' }), null);
});

test('an online course resolves only AFTER trimming — on the FEED side', () => {
  // The leading space is upstream's, not the admin's: the feed ships
  // " ONL-CYS" and the admin will have stored what they were shown.
  const index = indexCourses([ONLINE()], { idKey: 'o_course_id' });
  const hit = pickCourse(index, { courseId: 'ONL-CYS' });
  assert.ok(hit, 'a code with no leading space must reach " ONL-CYS"');
  assert.equal(hit.o_course_id, ' ONL-CYS');
});

test('and after trimming on the BANNER side too', () => {
  const index = indexCourses([COURSE()], { idKey: 'course_id' });
  assert.ok(pickCourse(index, { courseId: '   SQL-PG-Query   ' }));
});

test('upstreamId wins over a code that has since been renamed', () => {
  // The whole point of storing both: the code moved, the _id did not.
  const index = indexCourses([COURSE({ course_id: 'POWER-APPS' })], { idKey: 'course_id' });
  const hit = pickCourse(index, { upstreamId: 'msdb-1', courseId: 'Power-Apps-OLD' });
  assert.ok(hit, 'the stale code must not stop the stable id resolving');
  assert.equal(hit.course_id, 'POWER-APPS');
});

test('CONTROL: with NO upstreamId that same stale code resolves to nothing', () => {
  // Proves the test above passed via upstreamId and not because the code
  // happened to match anyway.
  const index = indexCourses([COURSE({ course_id: 'POWER-APPS' })], { idKey: 'course_id' });
  assert.equal(pickCourse(index, { courseId: 'Power-Apps-OLD' }), null);
});

// ── RESOLUTION, END TO END ─────────────────────────────────────────────────

test('a resolvable in-class course produces an item with course slots filled', async () => {
  const banners = [courseBanner({ courseId: 'sql-pg-query', kind: COURSE_KINDS.INCLASS })];
  const { resolved, misses } = await resolveFeatureContentRefs(banners, deps({ inclass: [COURSE()] }));
  assert.equal(misses.length, 0);
  const [item] = mapBannersToFeatureContent(banners, { now: NOW, resolved });
  assert.ok(item, 'the banner was dropped');
  assert.equal(item.type, 'course');
  assert.equal(item.subtitle, 'Querying Data with T-SQL', 'course_name is the subtitle');
  assert.match(item.description, /^หลักสูตรนี้/, 'course_teaser is the long body');
  assert.equal(item.image, 'https://cdn/inclass.webp');
  assert.equal(item.href, '/sql-pg-query-training-course');
  assert.deepEqual(item.price, { prefix: 'ราคา', now: '11,900 .-', was: null });
  assert.deepEqual(item.meta, [
    { icon: 'Award', line1: 'ระดับ', line2: 'Advanced' },
    { icon: 'Zap', line1: 'ระยะเวลา', line2: '3 วัน (18 ชม.)' },
  ]);
});

test('an online course uses its own field names and its outbound URL', async () => {
  const banners = [courseBanner({ courseId: 'ONL-CYS', kind: COURSE_KINDS.ONLINE })];
  const { resolved, misses } = await resolveFeatureContentRefs(banners, deps({ online: [ONLINE()] }));
  assert.equal(misses.length, 0);
  const [item] = mapBannersToFeatureContent(banners, { now: NOW, resolved });
  assert.equal(item.subtitle, 'Cyber Security for Daily Life');
  assert.equal(item.image, 'https://cdn/online.png');
  assert.equal(item.href, 'https://academy.9experttraining.com/courses/cyber');
  assert.equal(item.linkKind, 'external');
  assert.deepEqual(item.meta.map((m) => m.line1), ['ระดับ', 'บทเรียน', 'ระยะเวลา']);
});

test('a course reference that resolves to NOTHING is dropped, with a reason', async () => {
  const banners = [courseBanner({ courseId: 'NOPE', kind: COURSE_KINDS.INCLASS })];
  const { resolved, misses } = await resolveFeatureContentRefs(banners, deps({ inclass: [COURSE()] }));
  assert.equal(misses.length, 1);
  assert.equal(misses[0].id, 'b-course');
  assert.match(misses[0].reason, /no course with that id or code/);
  assert.match(misses[0].ref, /NOPE/, 'the warning must name the unresolved reference');
  assert.deepEqual(mapBannersToFeatureContent(banners, { now: NOW, resolved }), [],
    'never a dead link, never a placeholder');
});

test('the warning names the record AND the reference', () => {
  const lines = [];
  warnFeatureContentMisses(
    [{ id: 'b-9', type: 'course', ref: 'inclass:NOPE', reason: 'no course with that id or code' }],
    (m) => lines.push(m)
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /b-9/);
  assert.match(lines[0], /inclass:NOPE/);
});

test('a HIDDEN course is not featurable, and says so distinctly', async () => {
  // The upstream list is asked WITHOUT hidden courses, so a hidden one is
  // normally simply absent. This fixture puts it in the list anyway — which is
  // what a future caller passing includeHidden, or the never-filtered online
  // feed, would do — and the explicit check is what stops it.
  const banners = [courseBanner({ courseId: 'SQL-PG-Query', kind: COURSE_KINDS.INCLASS })];
  const { resolved, misses } = await resolveFeatureContentRefs(
    banners,
    deps({ inclass: [COURSE()], hidden: ['SQL-PG-QUERY'] })
  );
  assert.equal(misses.length, 1);
  assert.match(misses[0].reason, /hidden/, 'a hidden course needs a different fix from a missing one');
  assert.deepEqual(mapBannersToFeatureContent(banners, { now: NOW, resolved }), []);
});

test('CONTROL: the same course with the hidden set EMPTY does resolve', () => {
  // Proves the test above failed on hiddenness and not on the fixture.
  return resolveFeatureContentRefs(
    [courseBanner({ courseId: 'SQL-PG-Query', kind: COURSE_KINDS.INCLASS })],
    deps({ inclass: [COURSE()], hidden: [] })
  ).then(({ misses }) => assert.equal(misses.length, 0));
});

test('hiding survives a three-way casing mismatch', async () => {
  // The realistic shape of this hazard: the admin saved the banner with one
  // casing, upstream ships another, and the CourseExtension row that hides it
  // carries a third. All three must still be the same course.
  const banners = [courseBanner({ courseId: '  sql-pg-query  ', kind: COURSE_KINDS.INCLASS })];
  const { misses } = await resolveFeatureContentRefs(
    banners,
    deps({ inclass: [COURSE({ course_id: 'SQL-PG-Query' })], hidden: ['Sql-Pg-Query'] })
  );
  assert.equal(misses.length, 1, 'a differently-cased hidden id must still hide');
  assert.match(misses[0].reason, /hidden/);
});

// ── ARTICLES ───────────────────────────────────────────────────────────────

test('an article resolves by slug and takes its description from excerpt', async () => {
  const banners = [articleBanner('local-llm')];
  const { resolved, misses } = await resolveFeatureContentRefs(banners, deps({ articles: [ARTICLE()] }));
  assert.equal(misses.length, 0);
  const [item] = mapBannersToFeatureContent(banners, { now: NOW, resolved });
  assert.equal(item.type, 'article');
  assert.equal(item.description, 'แรงจูงใจหลัก');
  assert.equal(item.href, '/articles/local-llm');
  assert.equal(item.price, null, 'only courses carry a price');
});

test('an article with NO excerpt leaves the description EMPTY, never truncated', async () => {
  // ~68% of articles reach this with no excerpt. Slicing `content` to a length
  // would cut mid-word: Thai has no inter-word spaces, so there is no safe
  // boundary and the result is a broken syllable rather than a teaser.
  const banners = [articleBanner('local-llm')];
  const { resolved } = await resolveFeatureContentRefs(
    banners, deps({ articles: [ARTICLE({ excerpt: '' })] })
  );
  const [item] = mapBannersToFeatureContent(banners, { now: NOW, resolved });
  assert.ok(item, 'a missing excerpt must not drop the item');
  assert.equal(item.description, null, 'null collapses the element; "" would not');
});

test('an article not yet published does not resolve', async () => {
  const banners = [articleBanner('local-llm')];
  const { resolved, misses } = await resolveFeatureContentRefs(
    banners,
    deps({ articles: [ARTICLE({ publishedAt: new Date('2099-01-01T00:00:00Z') })] })
  );
  assert.equal(misses.length, 1);
  assert.match(misses[0].reason, /published/);
  assert.deepEqual(mapBannersToFeatureContent(banners, { now: NOW, resolved }), []);
});

test('an INACTIVE article does not resolve either', async () => {
  const banners = [articleBanner('local-llm')];
  const { misses } = await resolveFeatureContentRefs(
    banners, deps({ articles: [ARTICLE({ active: false })] })
  );
  assert.equal(misses.length, 1);
});

test('CONTROL: the same article, active and published, DOES resolve', async () => {
  // Both filters currently exclude zero real records, so without this control
  // the two tests above would also pass against a resolver that returned
  // nothing for every article.
  const { misses, resolved } = await resolveFeatureContentRefs(
    [articleBanner('local-llm')], deps({ articles: [ARTICLE()] })
  );
  assert.equal(misses.length, 0);
  assert.equal(resolved.size, 1);
});

// ── THE POOL AS A WHOLE ────────────────────────────────────────────────────

test('all four types survive one pass together', async () => {
  const banners = [
    { _id: 'v', type: 'youtube', title: 'v', youtube_id: 'abc', active: true, weight: 0 },
    { _id: 'i', type: 'image_desktop', title: 'i', image_url: 'https://cdn/i.jpg', active: true, weight: 1 },
    courseBanner({ courseId: 'sql-pg-query', kind: COURSE_KINDS.INCLASS }, { _id: 'c', weight: 2 }),
    articleBanner('local-llm', { _id: 'a', weight: 3 }),
  ];
  const { resolved } = await resolveFeatureContentRefs(
    banners, deps({ inclass: [COURSE()], articles: [ARTICLE()] })
  );
  const items = mapBannersToFeatureContent(banners, { now: NOW, resolved });
  assert.deepEqual(items.map((i) => i.type), ['video', 'image', 'course', 'article']);
  assert.deepEqual(items.map((i) => i.badge), [
    'วิดีโอแนะนำ', 'แนะนำสำหรับคุณ', 'คอร์สแนะนำ', 'บทความแนะนำ',
  ]);
});

test('a pool with no course or article records does no lookups at all', async () => {
  let called = 0;
  const { resolved, misses } = await resolveFeatureContentRefs(
    [{ _id: 'v', type: 'youtube', youtube_id: 'x' }],
    {
      now: NOW,
      listCourses: async () => { called += 1; return { items: [] }; },
      listOnline: async () => { called += 1; return []; },
      loadHidden: async () => { called += 1; return new Set(); },
      findArticles: async () => { called += 1; return []; },
    }
  );
  assert.equal(called, 0, 'todays pool must cost nothing');
  assert.equal(resolved.size, 0);
  assert.equal(misses.length, 0);
});

test('title_line2 and title_highlight reach the view model', async () => {
  // Both have been on the model since the four-type rework with no reader.
  const banners = [courseBanner(
    { courseId: 'sql-pg-query', kind: COURSE_KINDS.INCLASS },
    { title_line2: 'บรรทัดสอง', title_highlight: 'ไฮไลต์' }
  )];
  const { resolved } = await resolveFeatureContentRefs(banners, deps({ inclass: [COURSE()] }));
  const [item] = mapBannersToFeatureContent(banners, { now: NOW, resolved });
  assert.equal(item.titleAccent, 'บรรทัดสอง');
  assert.equal(item.titleHighlight, 'ไฮไลต์');
});

test('description ?? slide_text still wins over the resolved record', async () => {
  const banners = [courseBanner(
    { courseId: 'sql-pg-query', kind: COURSE_KINDS.INCLASS },
    { slide_text: 'ข้อความจากแบนเนอร์' }
  )];
  const { resolved } = await resolveFeatureContentRefs(banners, deps({ inclass: [COURSE()] }));
  const [item] = mapBannersToFeatureContent(banners, { now: NOW, resolved });
  assert.equal(item.description, 'ข้อความจากแบนเนอร์', 'the admin overrides the course teaser');
});

test('a discounted course shows the struck-through list price, an undiscounted one does not', async () => {
  const run = async (over) => {
    const banners = [courseBanner({ courseId: 'sql-pg-query', kind: COURSE_KINDS.INCLASS })];
    const { resolved } = await resolveFeatureContentRefs(banners, deps({ inclass: [COURSE(over)] }));
    return mapBannersToFeatureContent(banners, { now: NOW, resolved })[0].price;
  };
  assert.deepEqual(await run({ course_netprice: 9900 }), { prefix: 'ราคา', now: '9,900 .-', was: '11,900 .-' });
  // A netprice at or above list is not a saving; struck through next to itself
  // it reads as a promotion that is not happening.
  assert.deepEqual(await run({ course_netprice: 11900 }), { prefix: 'ราคา', now: '11,900 .-', was: null });
  assert.deepEqual(await run({ course_price: 0, course_netprice: null }), { prefix: null, now: 'Inhouse Only', was: null });
});
