import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MirrorPanel } from '@/app/admin/cache/_components/MirrorPanel';

/**
 * RULING 3 AT THE SURFACE: the apply control is ABSENT until a preview exists.
 *
 * The server refuses regardless — that is tested in test/pure/applyReset, which
 * is where the guarantee lives. This is about what the screen offers, because a
 * disabled-but-present destructive button teaches people the action is one
 * click away and invites hunting for the state that enables it.
 *
 * renderToStaticMarkup only, no React root: the runner is isolation:'none' and
 * a createRoot over jsdom leaks globalThis.window into every other render test.
 * That means only the INITIAL state is observable here — which is exactly the
 * state under test, since the initial state is the one with no preview.
 */

const strip = (html) => html.replace(/<[^>]*>/g, ' ');

const MIRRORS = {
  ok: true,
  data: [
    { key: 'faqs', label: 'faqs', sync: 'syncFaqs', count: 40, newest: '2026-08-12T03:00:00.000Z', staleRows: 1, neverSynced: 0 },
  ],
};

const TARGETS = [
  { key: 'faqs', label: 'FAQ', idField: 'faq_id' },
  { key: 'instructors', label: 'วิทยากร', idField: 'instructor_id' },
];

function render(props) {
  return strip(renderToStaticMarkup(h(MirrorPanel, { mirrors: MIRRORS, ...props })));
}

test('with no preview run, there is NO apply/confirm control on the page', () => {
  const html = render({ resetTargets: TARGETS });
  // The two labels that fire a delete. Neither may exist in the initial render.
  assert.ok(!/ยืนยันลบ/.test(html), 'no confirm-delete button');
  assert.ok(!/ลบ \d+ แถวที่ถูกลบไปแล้ว/.test(html), 'no plain delete button');
});

test('what IS offered initially is the preview, once per collection', () => {
  // The other half — otherwise "no delete button" would pass against a panel
  // that rendered no controls at all.
  const html = render({ resetTargets: TARGETS });
  const previews = html.match(/ดูตัวอย่างการล้างแถวที่ถูกลบต้นทาง/g) ?? [];
  assert.equal(previews.length, TARGETS.length, 'one preview control per collection');
});

test('there is NO control that resets every collection at once', () => {
  // A single button firing every destructive path is the artifact this round
  // exists to avoid: its confirmation would be a dialog about four collections
  // whose numbers nobody can hold at once.
  const html = render({ resetTargets: TARGETS });
  for (const banned of [/ล้างทั้งหมด/, /reset all/i, /ทั้งหมดพร้อมกัน/]) {
    assert.ok(!banned.test(html), `a bulk control matching ${banned} exists`);
  }
});

test('the destructive section says permanent loss, in words, before any control', () => {
  const html = render({ resetTargets: TARGETS });
  assert.match(html, /ทำให้ข้อมูลหายถาวร/);
  assert.match(html, /ต้องกดดูตัวอย่างก่อนทุกครั้ง/);
  assert.match(html, /ถ้าชุดข้อมูลใหม่ว่างเปล่า ระบบจะปฏิเสธเสมอ/);
});

test('each collection names the field its purge is computed on', () => {
  // The field is the load-bearing value in the whole round — an admin reading
  // a confirmation should be able to see which key was compared.
  const html = render({ resetTargets: TARGETS });
  assert.match(html, /faq_id/);
  assert.match(html, /instructor_id/);
});

test('CONTROL: without resetTargets the panel renders NO destructive section', () => {
  // Pins that the section comes from the prop rather than being unconditional —
  // and keeps the read-only shape of round 2 available.
  const html = render({});
  assert.ok(!/ทำให้ข้อมูลหายถาวร/.test(html));
  assert.ok(!/ดูตัวอย่างการล้างแถวที่ถูกลบต้นทาง/.test(html));
  // …while the read-only half is untouched.
  assert.match(html, /ไม่มี sync ตัวไหนลบแถว/);
});

test('the read-only panel content survives alongside the new section', () => {
  const html = render({ resetTargets: TARGETS });
  assert.match(html, /รอบที่ล้มเหลวกับรอบที่ไม่ได้รันเลย แยกจากกันไม่ได้/);
  assert.match(html, /max\(synced_at\)/);
});
