// The public /masterclass listing card shows NOTHING about seats.
//
// No "รับจำกัด N ที่นั่ง", no "ว่าง N ที่นั่ง", no progress bar — whatever the
// batch's capacity and registered_count say. The only seat-derived thing the
// card keeps is the CTA, and that reads `batch.status` (maintained by the seat
// writers), not the numbers: a `full` batch still shows a disabled "เต็มแล้ว"
// instead of "เปิดรับสมัคร", so removing the display removed no behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { MasterclassCard } from '@/app/(public)/masterclass/_components/MasterclassCard';

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const COURSE = {
  _id: 'c1', slug: 'mas-ai-dmc', title_th: 'AI Digital Marketing Creator', subtitle_th: 'x',
  cover_image_url: '', level: 'intermediate', duration_days: 1, duration_hours: 7,
  schedule_days: ['เสาร์'], is_published: true,
};
const batch = (over) => ({
  _id: 'b1', batch_no: 1, status: 'open', capacity: 20, registered_count: 5,
  effective_price: 9030, original_price: 12900, is_early_bird: false, early_bird_deadline: null,
  dates: [{ date: '2026-10-04T00:00:00.000Z', day_label: 'เสาร์ 4 ต.ค.' }],
  ...over,
});
const render = (b) => renderToStaticMarkup(createElement(MasterclassCard, { course: { ...COURSE, batches: [b] } }));

const SEAT_WORDS = /รับจำกัด|ว่าง \d|ที่นั่ง/;

test('open batch, seats available: no seat label, no ว่าง figure, no progress bar; CTA is เปิดรับสมัคร', () => {
  const html = render(batch({ capacity: 20, registered_count: 5 }));
  assert.doesNotMatch(html, SEAT_WORDS);
  const doc = docOf(html);
  // Visible TEXT, not markup: Tailwind class names carry numbers of their own.
  assert.doesNotMatch(doc.body.textContent, /\b20\b/, 'the capacity number is not rendered as text');
  assert.doesNotMatch(doc.body.textContent, /\b15\b/, 'the seats-left number is not rendered as text');
  assert.equal(doc.querySelector('[style*="width"]'), null, 'no width-driven progress bar');
  assert.equal(doc.querySelector('.h-1\\.5'), null, 'no bar track');
  assert.match(doc.body.textContent, /เปิดรับสมัคร/);
  assert.doesNotMatch(doc.body.textContent, /เต็มแล้ว/);
});

test('full batch: still no seat row, and the CTA still reads เต็มแล้ว from batch.status', () => {
  const html = render(batch({ status: 'full', capacity: 20, registered_count: 20 }));
  assert.doesNotMatch(html, SEAT_WORDS);
  const doc = docOf(html);
  assert.equal(doc.querySelector('[style*="width"]'), null);
  assert.match(doc.body.textContent, /เต็มแล้ว/, 'the sold-out CTA is decided by status, and it survives the removal');
  assert.doesNotMatch(doc.body.textContent, /เปิดรับสมัคร/);
});

test('the status decides, the numbers do not: registered_count at capacity with status open still says เปิดรับสมัคร', () => {
  // This is what "display removed, behaviour untouched" means: the card never
  // derived the sold-out state from the numbers — the seat writers flip
  // `status` to full at capacity, and that flag is the whole rule here.
  const doc = docOf(render(batch({ status: 'open', capacity: 20, registered_count: 20 })));
  assert.match(doc.body.textContent, /เปิดรับสมัคร/);
  assert.doesNotMatch(doc.body.textContent, SEAT_WORDS);
});

test('CONTROL: the seat-word probe fires on what the card used to render', () => {
  assert.equal(SEAT_WORDS.test('รับจำกัด 20 ที่นั่ง'), true);
  assert.equal(SEAT_WORDS.test('ว่าง 15 ที่นั่ง'), true);
  assert.equal(SEAT_WORDS.test('เปิดรับสมัคร'), false);
  assert.equal(SEAT_WORDS.test('เต็มแล้ว'), false);
});
