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

function render({ sections = empty, programs = [], onlineCourses = [], videos = [], channelUrl = '' } = {}) {
  const layout = writerProfileLayout({ sections, programs, onlineCourses, videos });
  return renderToStaticMarkup(createElement(WriterProfileBody, {
    layout, programs, onlineCourses, videos, channelUrl, shortName: 'อ.เวท',
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

test('ปี column: a grid with a max-content period column, bold period, empty cell when absent', () => {
  const html = render({ sections: { ...empty, experience: [{ period: '2013 – Present', text: 'A' }, { text: 'B' }] } });
  assert.match(html, /md:grid-cols-\[auto_max-content_1fr\]/);
  assert.match(html, /<span class="block font-semibold text-\[var\(--text-primary\)\] md:pr-1" data-testid="writer-section-period">2013 – Present<\/span>/);
  assert.equal((html.match(/md:grid-cols-subgrid/g) ?? []).length, 2);
  assert.equal((html.match(/<span class="hidden md:block" aria-hidden="true"><\/span>/g) ?? []).length, 1, 'B keeps an empty ปี cell');
});

test('ปี column: absent when no row in the section has one', () => {
  const html = render({ sections: { ...empty, education: ['A', { text: 'B' }] } });
  assert.match(html, /md:grid-cols-\[auto_1fr\]/);
  assert.equal(html.includes('max-content'), false);
  assert.equal(html.includes('writer-section-period'), false);
  assert.equal(html.includes('hidden md:block'), false);
});
