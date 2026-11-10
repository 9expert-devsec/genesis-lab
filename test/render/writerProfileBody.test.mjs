import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WriterProfileBody } from '@/app/(public)/author/_components/WriterProfileBody';
import { writerProfileLayout } from '@/lib/writers/writerProfile';

const empty = { experience: [], education: [], certifications: [], recognition: [] };
const video = { videoId: 'dQw4w9WgXcQ', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Power BI in 10 minutes' };
const program = { name: 'Power BI', href: '/program/power-bi', iconUrl: '' };
const onlineCourse = { o_course_id: 'ONL-A', o_course_name: 'Course A', o_course_price: 0 };

function render({ sections = empty, programs = [], onlineCourses = [], videos = [], channelUrl = '', ...extra } = {}) {
  const layout = writerProfileLayout({ sections, programs, onlineCourses, videos });
  return renderToStaticMarkup(createElement(WriterProfileBody, {
    layout, programs, onlineCourses, videos, channelUrl, shortName: 'อ.เวท', ...extra,
  })).replace(/<!-- -->/g, '');
}

test('video card: hidden when there are no videos', () => {
  const html = render({ programs: [program] });
  assert.equal(html.includes('data-testid="writer-videos"'), false);
  assert.equal(html.includes('วิดีโอของ'), false);
});

test('video card: title, thumbnail from i.ytimg.com with the title as alt, new-tab link', () => {
  const html = render({ videos: [video] });
  assert.match(html, /<h2[^>]*>วิดีโอของ อ\.เวท<\/h2>/);
  assert.match(html, /<img src="https:\/\/i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/mqdefault\.jpg" alt="Power BI in 10 minutes" loading="lazy"/);
  assert.match(html, /<a href="https:\/\/youtu\.be\/dQw4w9WgXcQ" target="_blank" rel="noopener noreferrer"/);
  assert.equal(html.includes('/_next/image'), false, 'never through image optimisation');
});

test('video card: the channel footer only with a channel URL', () => {
  assert.equal(render({ videos: [video] }).includes('ดูทั้งหมดบน YouTube'), false);
  const html = render({ videos: [video], channelUrl: 'https://www.youtube.com/@9expert' });
  assert.match(html, /<a href="https:\/\/www\.youtube\.com\/@9expert" target="_blank" rel="noopener noreferrer"[^>]*>ดูทั้งหมดบน YouTube/);
});

test('aside order: เชี่ยวชาญด้าน → หลักสูตรออนไลน์ → วิดีโอ', () => {
  const html = render({ programs: [program], onlineCourses: [onlineCourse], videos: [video] });
  const at = ['writer-programs', 'writer-online-courses', 'writer-videos'].map((id) => html.indexOf(`data-testid="${id}"`));
  assert.ok(at.every((i) => i >= 0) && at[0] < at[1] && at[1] < at[2], String(at));
});

test('aside order: with no online courses the videos follow เชี่ยวชาญด้าน', () => {
  const html = render({ programs: [program], videos: [video] });
  assert.equal(html.includes('writer-online-courses'), false);
  assert.ok(html.indexOf('writer-programs') < html.indexOf('writer-videos'));
});

test('ปี column: a grid with a max-content period column and a bold period', () => {
  const html = render({ sections: { ...empty, experience: [{ period: '2013 – Present', text: 'A' }, { text: 'B' }] } });
  assert.match(html, /md:grid-cols-\[auto_max-content_1fr\]/);
  assert.match(html, /<span class="block font-semibold text-\[var\(--text-primary\)\] md:pr-1" data-testid="writer-section-period">2013 – Present<\/span>/);
  assert.equal((html.match(/md:grid-cols-subgrid/g) ?? []).length, 2);
});

test('ปี column, mixed section: a no-ปี row spans ปี + text; a ปี row does not', () => {
  const html = render({ sections: { ...empty, education: [{ period: '2009', text: 'WithYear' }, { text: 'NoYear' }] } });
  assert.match(html, /<span class="block min-w-0 md:col-span-2">NoYear<\/span>/);
  assert.match(html, /<span class="block min-w-0">WithYear<\/span>/);
  assert.equal((html.match(/md:col-span-2/g) ?? []).length, 1, 'only the no-ปี row spans');
  assert.equal(html.includes('hidden md:block'), false, 'no empty placeholder cell any more');
});

test('ปี column: absent when no row in the section has one', () => {
  const html = render({ sections: { ...empty, education: ['A', { text: 'B' }] } });
  assert.match(html, /md:grid-cols-\[auto_1fr\]/);
  assert.equal(html.includes('max-content'), false);
  assert.equal(html.includes('writer-section-period'), false);
  assert.equal(html.includes('md:col-span-2'), false, 'nothing to span without a ปี column');
});

// The class strings as they were before hasArticles existed: with articles the
// body must render exactly these.
const BODY_WIDE = 'mx-auto mt-8 grid max-w-[1200px] items-start gap-6 px-4 lg:px-6 ';
const BODY_ASIDE = 'mx-auto mt-8 grid max-w-[1200px] items-start gap-6 px-4 lg:px-6 lg:grid-cols-[minmax(0,1fr)_396px]';
const bodyClass = (html) => html.match(/<div class="([^"]*)" data-testid="writer-body"/)[1];
const certs = { ...empty, certifications: ['Cert A'] };

test('footer gap: with 0 articles the body carries pb-10 (the articles section\'s py-10 bottom)', () => {
  assert.equal(bodyClass(render({ sections: certs, hasArticles: false })), `${BODY_WIDE} pb-10`);
  assert.equal(bodyClass(render({ sections: certs, programs: [program], hasArticles: false })), `${BODY_ASIDE} pb-10`);
});

test('footer gap: with articles no pb-10, and the markup matches the prop left out', () => {
  for (const extra of [{}, { programs: [program] }]) {
    const html = render({ sections: certs, ...extra, hasArticles: true });
    assert.equal(html.includes('pb-10'), false);
    assert.equal(bodyClass(html), extra.programs ? BODY_ASIDE : BODY_WIDE);
    assert.equal(html, render({ sections: certs, ...extra }));
  }
});
