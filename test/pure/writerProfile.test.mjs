import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WRITER_ARTICLES_PER_PAGE,
  WRITER_ONLINE_COURSE_LIMIT,
  isProfilePageInRange,
  matchOnlineCourses,
  pagerPages,
  parseProfilePage,
  planWriterList,
  writerProfileLayout,
  writerRolePills,
  writerRouteAction,
  writerShortName,
  writerSitemapEntries,
} from '@/lib/writers/writerProfile';
import { DEFAULT_WRITER_PATH, writerImageUrl, writerPath } from '@/lib/writers/writerUrls';

// ── the route ───────────────────────────────────────────────────────────────

test('an unknown slug is a 404', () => {
  assert.equal(writerRouteAction(null), 'not-found');
});

test('an active writer renders', () => {
  assert.equal(writerRouteAction({ isActive: true }), 'render');
});

test('an inactive writer redirects', () => {
  assert.equal(writerRouteAction({ isActive: false }), 'redirect');
});

test('the default writer never redirects: it is the redirect target', () => {
  assert.equal(writerRouteAction({ isActive: false, isDefault: true }), 'render');
});

test('the redirect target is the 9Expert Academy profile', () => {
  assert.equal(DEFAULT_WRITER_PATH, '/writer/9expert-academy');
  assert.equal(writerPath('chalaivate'), '/writer/chalaivate');
});

// ── paging ──────────────────────────────────────────────────────────────────

test('no ?page= is page 1', () => {
  assert.equal(parseProfilePage(undefined), 1);
});

test('a whole positive number is that page', () => {
  assert.equal(parseProfilePage('3'), 3);
});

test('anything else is not a page', () => {
  for (const raw of ['0', '-1', '1.5', 'abc', '', '01', ['1', '2'], '99999999999999999999']) {
    assert.equal(parseProfilePage(raw), null, String(raw));
  }
});

test('page 1 exists even with no articles', () => {
  assert.equal(isProfilePageInRange(1, 0), true);
});

test('the last page holding an article is in range, and the next is not', () => {
  const per = WRITER_ARTICLES_PER_PAGE;
  assert.equal(isProfilePageInRange(2, per + 1), true);
  assert.equal(isProfilePageInRange(2, per), false);
  assert.equal(isProfilePageInRange(3, per * 2 + 1), true);
  assert.equal(isProfilePageInRange(4, per * 3), false);
});

test('pager: every page when there are few', () => {
  assert.deepEqual(pagerPages(2, 3), [1, 2, 3]);
});

test('pager: gaps stand for what is skipped, at the start', () => {
  assert.deepEqual(pagerPages(1, 42), [1, 2, null, 42]);
});

test('pager: and on both sides of the current page', () => {
  assert.deepEqual(pagerPages(20, 42), [1, null, 19, 20, 21, null, 42]);
});

test('pager: and at the end', () => {
  assert.deepEqual(pagerPages(42, 42), [1, null, 41, 42]);
});

// ── the /writer list ────────────────────────────────────────────────────────

const row = (id, over = {}) => ({ _id: id, displayName: id, isActive: true, ...over });

test('list: a writer with no published article is left out', () => {
  const list = planWriterList([row('a'), row('b')], new Map([['a', 1], ['b', 0]]));
  assert.deepEqual(list.map((w) => w._id), ['a']);
});

test('list: a writer missing from the counts is left out', () => {
  assert.deepEqual(planWriterList([row('a')], new Map()), []);
});

test('list: an inactive writer is left out, whatever it has', () => {
  assert.deepEqual(planWriterList([row('a', { isActive: false })], new Map([['a', 9]])), []);
});

test('list: the default writer comes first, even with fewer articles', () => {
  const list = planWriterList(
    [row('big'), row('home', { isDefault: true })],
    new Map([['big', 9], ['home', 1]]),
  );
  assert.deepEqual(list.map((w) => w._id), ['home', 'big']);
});

test('list: then most articles first', () => {
  const list = planWriterList([row('a'), row('b'), row('c')], new Map([['a', 1], ['b', 3], ['c', 2]]));
  assert.deepEqual(list.map((w) => w._id), ['b', 'c', 'a']);
});

test('list: equal counts fall back to the name', () => {
  const list = planWriterList([row('b'), row('a')], new Map([['a', 2], ['b', 2]]));
  assert.deepEqual(list.map((w) => w._id), ['a', 'b']);
});

test('list: each row carries its count', () => {
  assert.equal(planWriterList([row('a')], new Map([['a', 4]]))[0].articleCount, 4);
});

// ── names and pills ─────────────────────────────────────────────────────────

test('short name: the bracketed nickname', () => {
  assert.equal(writerShortName({ displayName: 'ชไลเวท พิพัฒพรรณวงศ์ (อ.เวท)' }), 'อ.เวท');
});

test('short name: a name with no brackets stays whole', () => {
  assert.equal(writerShortName({ displayName: '9Expert Academy' }), '9Expert Academy');
});

test('pills: a linked instructor', () => {
  assert.deepEqual(writerRolePills({}, true), ['ผู้เขียน', 'วิทยากร 9Expert']);
});

test('pills: the default writer', () => {
  assert.deepEqual(writerRolePills({ isDefault: true }, false), ['ผู้เขียน', 'ผู้เขียนหลัก']);
});

test('pills: neither', () => {
  assert.deepEqual(writerRolePills({}, false), ['ผู้เขียน']);
});

// ── online courses ──────────────────────────────────────────────────────────

const course = (name) => ({ o_course_id: name, o_course_instructor_name: name });

test('online courses match the English name exactly', () => {
  const list = [course('Chalaivate Pipatpannawong'), course('Chalaivate'), course('chalaivate pipatpannawong')];
  assert.deepEqual(matchOnlineCourses(list, 'Chalaivate Pipatpannawong').map((c) => c.o_course_id), ['Chalaivate Pipatpannawong']);
});

test('online courses stop at the limit', () => {
  const list = Array.from({ length: WRITER_ONLINE_COURSE_LIMIT + 2 }, () => course('A'));
  assert.equal(matchOnlineCourses(list, 'A').length, WRITER_ONLINE_COURSE_LIMIT);
});

test('no English name matches nothing, not every course with a blank name', () => {
  assert.deepEqual(matchOnlineCourses([{ o_course_instructor_name: '' }, course('A')], ''), []);
  assert.deepEqual(matchOnlineCourses([course('A')], undefined), []);
});

// ── the collapse rules ──────────────────────────────────────────────────────

const empty = { experience: [], education: [], certifications: [], recognition: [] };

test('layout: an empty section is not rendered, and the order is fixed', () => {
  const { visibleSections } = writerProfileLayout({
    sections: { ...empty, recognition: ['r'], experience: ['e'] },
  });
  assert.deepEqual(visibleSections.map((s) => s.key), ['experience', 'recognition']);
});

test('layout: blank rows do not keep a section alive', () => {
  const { visibleSections, showBody } = writerProfileLayout({ sections: { ...empty, education: ['  ', ''] } });
  assert.deepEqual(visibleSections, []);
  assert.equal(showBody, false);
});

test('layout: all four sections render when each has items', () => {
  const { visibleSections } = writerProfileLayout({
    sections: { experience: ['a'], education: ['b'], certifications: ['c'], recognition: ['d'] },
  });
  assert.equal(visibleSections.length, 4);
});

test('layout: with sections but no aside, the aside is not rendered', () => {
  const layout = writerProfileLayout({ sections: { ...empty, education: ['b'] }, programs: [], onlineCourses: [] });
  assert.equal(layout.showAside, false);
  assert.equal(layout.showBody, true);
});

test('layout: programs alone keep the aside, and hide the course card', () => {
  const layout = writerProfileLayout({ sections: empty, programs: [{}], onlineCourses: [] });
  assert.deepEqual(
    [layout.showAside, layout.showPrograms, layout.showOnlineCourses, layout.showBody],
    [true, true, false, true],
  );
});

test('layout: online courses alone keep the aside, and hide the program card', () => {
  const layout = writerProfileLayout({ sections: empty, programs: [], onlineCourses: [{}] });
  assert.deepEqual(
    [layout.showAside, layout.showPrograms, layout.showOnlineCourses, layout.showBody],
    [true, false, true, true],
  );
});

test('layout: nothing at all skips the whole body', () => {
  const layout = writerProfileLayout({ sections: empty, programs: [], onlineCourses: [] });
  assert.equal(layout.showBody, false);
  assert.equal(layout.showAside, false);
});

test('layout: takes missing sections', () => {
  assert.equal(writerProfileLayout({}).showBody, false);
});

// ── sitemap and image ───────────────────────────────────────────────────────

test('sitemap: one row per writer, dated by the writer', () => {
  const updatedAt = '2026-11-01T00:00:00.000Z';
  const [entry] = writerSitemapEntries([{ slug: 'a', updatedAt }], 'https://x.test');
  assert.equal(entry.url, 'https://x.test/writer/a');
  assert.deepEqual(entry.lastModified, new Date(updatedAt));
});

test('image: an avatar is an absolute URL', () => {
  assert.match(writerImageUrl({ avatarPublicId: 'x/writers/a' }), /^https:\/\/res\.cloudinary\.com\/.+\/x\/writers\/a$/);
});

test('image: no avatar is null, never the bundled default', () => {
  assert.equal(writerImageUrl({ avatarPublicId: '' }), null);
  assert.equal(writerImageUrl({}), null);
});
