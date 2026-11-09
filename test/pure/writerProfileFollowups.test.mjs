import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  YOUTUBE_MESSAGES,
  fetchYouTubeTitle,
  fillYouTubeTitles,
  isYouTubeChannelUrl,
  parseYouTubeVideoId,
  youtubeThumbnailUrl,
} from '@/lib/writers/youtube';
import { planWriterPeriodSplit, splitWriterPeriod } from '@/lib/writers/splitWriterPeriod';
import { selectOnlineCourses, toOnlineCourseOptions, writerProfileLayout } from '@/lib/writers/writerProfile';
import { normalizeSectionItem, normalizeWriter } from '@/lib/writers/writerFields';
import { writerFieldErrors, writerSchema } from '@/lib/schemas/writer';

/**
 * The writer-profile follow-ups of 2026-11-09: the YouTube card, the ปี column
 * and its migration, and the admin-picked online courses.
 */

const ID = 'dQw4w9WgXcQ';

// ── YouTube link → id ───────────────────────────────────────────────────────

for (const url of [
  `https://www.youtube.com/watch?v=${ID}`,
  `https://youtube.com/watch?v=${ID}&t=42s`,
  `https://m.youtube.com/watch?feature=share&v=${ID}`,
  `https://youtu.be/${ID}`,
  `https://youtu.be/${ID}?si=abc`,
  `https://www.youtube.com/shorts/${ID}`,
  `https://www.youtube.com/embed/${ID}`,
  `https://www.youtube.com/live/${ID}?feature=shared`,
  `  https://www.youtube.com/watch?v=${ID}  `,
]) {
  test(`youtube id: accepts ${url.trim()}`, () => {
    assert.equal(parseYouTubeVideoId(url), ID);
  });
}

for (const [why, url] of [
  ['empty', ''],
  ['not a URL', 'dQw4w9WgXcQ'],
  ['a channel', 'https://www.youtube.com/@9expert'],
  ['a playlist', 'https://www.youtube.com/playlist?list=PL123'],
  ['watch without v', 'https://www.youtube.com/watch?x=1'],
  ['an id of 10 chars', 'https://youtu.be/dQw4w9WgXc'],
  ['an id of 12 chars', 'https://www.youtube.com/watch?v=dQw4w9WgXcQQ'],
  ['a bad character', 'https://youtu.be/dQw4w9WgX$Q'],
  ['a look-alike host', `https://www.notyoutube.com/watch?v=${ID}`],
  ['a host suffix trick', `https://youtube.com.evil.test/watch?v=${ID}`],
  ['a javascript: URL', `javascript:alert(1)//youtu.be/${ID}`],
  ['an extra path segment', `https://youtu.be/${ID}/x`],
]) {
  test(`youtube id: rejects ${why}`, () => {
    assert.equal(parseYouTubeVideoId(url), null);
  });
}

test('channel URL: youtube.com only', () => {
  assert.equal(isYouTubeChannelUrl('https://www.youtube.com/@9expert'), true);
  assert.equal(isYouTubeChannelUrl('https://youtube.com/channel/UC123'), true);
  assert.equal(isYouTubeChannelUrl('https://youtu.be/abc'), false);
  assert.equal(isYouTubeChannelUrl('https://facebook.com/9expert'), false);
  assert.equal(isYouTubeChannelUrl('ftp://youtube.com/x'), false);
});

test('thumbnail: the medium 16:9 image straight from i.ytimg.com', () => {
  assert.equal(youtubeThumbnailUrl(ID), `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
});

// ── the oEmbed title, at save ───────────────────────────────────────────────

const okFetch = (title) => async () => ({ ok: true, json: async () => ({ title }) });

test('oEmbed: the title comes back trimmed, from the oembed endpoint', async () => {
  let asked = '';
  const title = await fetchYouTubeTitle(`https://youtu.be/${ID}`, {
    fetch: async (url) => { asked = url; return { ok: true, json: async () => ({ title: '  Hello  ' }) }; },
  });
  assert.equal(title, 'Hello');
  assert.ok(asked.startsWith('https://www.youtube.com/oembed?url=https%3A%2F%2Fyoutu.be%2F'));
  assert.ok(asked.endsWith('&format=json'));
});

test('oEmbed: a failure is an empty title, never a throw', async () => {
  assert.equal(await fetchYouTubeTitle('x', { fetch: async () => ({ ok: false }) }), '');
  assert.equal(await fetchYouTubeTitle('x', { fetch: async () => { throw new Error('timeout'); } }), '');
});

test('fill titles: only empty ones are fetched; a typed title wins', async () => {
  let calls = 0;
  const res = await fillYouTubeTitles(
    [{ videoId: ID, url: 'a', title: 'Typed' }, { videoId: ID, url: 'b', title: '' }],
    { fetch: async () => { calls += 1; return { ok: true, json: async () => ({ title: 'Fetched' }) }; } },
  );
  assert.equal(res.ok, true);
  assert.deepEqual(res.videos.map((v) => v.title), ['Typed', 'Fetched']);
  assert.equal(calls, 1);
});

test('fill titles: oEmbed failing on an empty title is the "please type it" error', async () => {
  const res = await fillYouTubeTitles([{ videoId: ID, url: 'a', title: '' }], { fetch: okFetch('') });
  assert.deepEqual(res, { ok: false, error: YOUTUBE_MESSAGES.titleUnavailable });
});

// ── the schema ──────────────────────────────────────────────────────────────

const base = { slug: 'a', displayName: 'A' };
const parse = (extra) => writerSchema.safeParse({ ...base, ...extra });

test('schema: videos get their id from the link, blank slots are dropped', () => {
  const res = parse({ youtubeVideos: [{ url: `https://youtu.be/${ID}`, title: '' }, { url: '', title: '' }] });
  assert.equal(res.success, true);
  assert.deepEqual(res.data.youtubeVideos, [{ videoId: ID, url: `https://youtu.be/${ID}`, title: '' }]);
});

test('schema: a non-YouTube video link is refused in Thai', () => {
  const res = parse({ youtubeVideos: [{ url: 'https://vimeo.com/1', title: 'x' }] });
  assert.equal(res.success, false);
  assert.equal(writerFieldErrors(res.error).youtubeVideos, YOUTUBE_MESSAGES.badVideoUrl);
});

test('schema: more than three videos is refused', () => {
  const four = Array.from({ length: 4 }, () => ({ url: `https://youtu.be/${ID}`, title: 't' }));
  assert.equal(parse({ youtubeVideos: four }).success, false);
});

test('schema: the channel must be on youtube.com', () => {
  assert.equal(parse({ youtubeChannelUrl: 'https://www.youtube.com/@9expert' }).success, true);
  const bad = parse({ youtubeChannelUrl: 'https://facebook.com/9expert' });
  assert.equal(writerFieldErrors(bad.error).youtubeChannelUrl, YOUTUBE_MESSAGES.badChannelUrl);
});

test('schema: featured courses are de-duplicated and capped at three, server-side', () => {
  assert.deepEqual(parse({ featuredOnlineCourseIds: ['A', 'B', 'A'] }).data.featuredOnlineCourseIds, ['A', 'B']);
  assert.equal(parse({ featuredOnlineCourseIds: ['A', 'B', 'C', 'D'] }).success, false);
});

test('schema: a section row is { period?, text }, a string still reads as { text }', () => {
  const res = parse({ sections: { experience: [{ period: ' 2009 ', text: ' X ' }, { period: '', text: 'Y' }, 'Z', { period: '', text: '' }] } });
  assert.equal(res.success, true);
  assert.deepEqual(res.data.sections.experience, [{ period: '2009', text: 'X' }, { text: 'Y' }, { text: 'Z' }]);
});

test('schema: a ปี with no เนื้อหา is refused, not dropped', () => {
  assert.equal(parse({ sections: { education: [{ period: '2009', text: '' }] } }).success, false);
});

// ── legacy rows read the same ───────────────────────────────────────────────

test('normalise: a legacy string is { text }; objects are trimmed', () => {
  assert.deepEqual(normalizeSectionItem('  a  '), { text: 'a' });
  assert.deepEqual(normalizeSectionItem({ period: ' 2009 ', text: ' b ' }), { period: '2009', text: 'b' });
  assert.deepEqual(normalizeSectionItem({ period: '', text: 'c' }), { text: 'c' });
  assert.deepEqual(normalizeSectionItem(null), { text: '' });
});

test('normalise: a writer from before these fields reads them as empty', () => {
  const w = normalizeWriter({ slug: 'a', displayName: 'A', sections: { experience: ['x'] } });
  assert.deepEqual(w.sections.experience, [{ text: 'x' }]);
  assert.deepEqual([w.featuredOnlineCourseIds, w.youtubeVideos, w.youtubeChannelUrl], [[], [], '']);
});

// ── the ปี column ───────────────────────────────────────────────────────────

const empty = { experience: [], education: [], certifications: [], recognition: [] };

test('layout: a section has the ปี column only when some row has a ปี', () => {
  const { visibleSections } = writerProfileLayout({
    sections: { ...empty, experience: [{ period: '2009', text: 'a' }, 'b'], education: ['c', { text: 'd' }] },
  });
  assert.deepEqual(visibleSections.map((s) => [s.key, s.hasPeriods]), [['experience', true], ['education', false]]);
  assert.deepEqual(visibleSections[0].items, [{ period: '2009', text: 'a' }, { text: 'b' }]);
});

// ── the migration rule ──────────────────────────────────────────────────────

for (const [before, period, text] of [
  ['2009 · Ramkhamhaeng University — MS Windows Server', '2009', 'Ramkhamhaeng University — MS Windows Server'],
  ['2013 – Present · 9Expert Co., Ltd. — A · B', '2013 – Present', '9Expert Co., Ltd. — A · B'],
  ['2007 – 2009 · MICT — IT Training', '2007 – 2009', 'MICT — IT Training'],
  ['2004-2005 · Rangsit University', '2004-2005', 'Rangsit University'],
  ['2020 — ปัจจุบัน · บริษัท', '2020 — ปัจจุบัน', 'บริษัท'],
]) {
  test(`split: "${before}"`, () => {
    assert.deepEqual(splitWriterPeriod(before), { action: 'split', item: { period, text } });
  });
}

for (const before of [
  'Generative AI for Everyone — Prompt Engineering · ChatGPT',
  '2009 Ramkhamhaeng University',           // no separator
  '2009· tight separator',                  // no space before ·
  '209 · three digits',
  '2013 – Soon · not a period word',
  'Since 2013 · the year is not leading',
]) {
  test(`split: leaves "${before}" as { text }`, () => {
    assert.deepEqual(splitWriterPeriod(before), { action: 'keep', item: { text: before } });
  });
}

test('split: an object-shaped row is skipped', () => {
  const item = { period: '2009', text: 'x' };
  assert.deepEqual(splitWriterPeriod(item), { action: 'skip', item });
});

test('split plan: idempotent — a second run over its own output changes nothing', () => {
  const writer = { slug: 'w', sections: { experience: ['2009 · A', 'B'], education: [], certifications: ['2010 – 2013 · C'], recognition: [] } };
  const first = planWriterPeriodSplit(writer);
  assert.equal(first.changed, true);
  assert.deepEqual(first.sections.experience, [{ period: '2009', text: 'A' }, { text: 'B' }]);
  assert.deepEqual(first.rows.map((r) => r.action), ['split', 'keep', 'split']);
  const second = planWriterPeriodSplit({ ...writer, sections: first.sections });
  assert.equal(second.changed, false);
  assert.deepEqual(second.rows, []);
  assert.deepEqual(second.sections, first.sections);
});

// ── the online-course card ──────────────────────────────────────────────────

const course = (id, name = id) => ({ o_course_id: id, o_course_name: name, o_course_instructor_name: name });
const catalogue = [course('A', 'Ann'), course(' B', 'Ann'), course('C', 'Ann'), course('D', 'Ann'), course('E', 'Bob')];

test('online courses: the picks win, in the admin order', () => {
  assert.deepEqual(selectOnlineCourses(catalogue, ['E', 'A'], 'Ann').map((c) => c.o_course_id), ['E', 'A']);
});

test('online courses: a pick that no longer exists is skipped silently; ids are trimmed', () => {
  assert.deepEqual(selectOnlineCourses(catalogue, ['GONE', 'B', 'C'], null).map((c) => c.o_course_id), [' B', 'C']);
});

test('online courses: no picks falls back to the instructor match, capped at 3', () => {
  const picked = selectOnlineCourses(catalogue, [], 'Ann');
  assert.deepEqual(picked.map((c) => c.o_course_id), ['A', ' B', 'C']);
});

test('online courses: never more than 3, picks included', () => {
  assert.equal(selectOnlineCourses(catalogue, ['A', 'B', 'C', 'D'], null).length, 3);
});

test('online courses: nothing picked and no instructor is an empty card', () => {
  assert.deepEqual(selectOnlineCourses(catalogue, [], undefined), []);
});

test('picker options: every course by its trimmed stable id', () => {
  assert.deepEqual(toOnlineCourseOptions([course(' B', 'Bee'), { o_course_id: '', o_course_name: 'x' }]), [
    { id: 'B', name: 'Bee', coverUrl: '' },
  ]);
});

// ── the video card ──────────────────────────────────────────────────────────

test('layout: no videos, no video card', () => {
  const layout = writerProfileLayout({ sections: empty, programs: [], onlineCourses: [], videos: [] });
  assert.deepEqual([layout.showVideos, layout.showAside, layout.showBody], [false, false, false]);
});

test('layout: videos alone keep the aside', () => {
  const layout = writerProfileLayout({ sections: empty, programs: [], onlineCourses: [], videos: [{ videoId: ID }] });
  assert.deepEqual([layout.showVideos, layout.showOnlineCourses, layout.showAside], [true, false, true]);
});
