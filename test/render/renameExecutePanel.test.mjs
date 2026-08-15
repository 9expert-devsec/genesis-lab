import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RenameExecutePanel } from '@/app/admin/courses/rename/_components/RenameExecutePanel';
import { buildRenamePreview, RENAME_STORES } from '@/lib/courses/renameCoursePreview';

/**
 * The execute panel's FIRST render — the state an admin actually arrives in.
 *
 * ── WHAT THIS TIER CAN AND CANNOT CARRY ────────────────────────────────────
 * `renderToStaticMarkup` gives one render with initial state and no events, so
 * what is checkable here is: the button starts DISABLED, both confirmations are
 * present and distinct, the alias step is a step rather than a footnote, and
 * the MSDB obligation is on screen before anything is clicked.
 *
 * NOT checkable here: that typing the code enables the button, that the write
 * fires, that the post-run state renders. Those need a DOM and an event loop,
 * which this suite forbids. The RULES behind them are pure and are driven for
 * real in test/pure/renameExecuteGate; the wiring between the rules and the
 * markup is asserted from source in test/fs/renameExecuteWiring. Said plainly
 * rather than implied, because a render test that claimed the click path would
 * be claiming something it never exercised.
 */

const preview = (over = {}) => {
  const matches = Object.fromEntries(RENAME_STORES.map((s) => [s.key, []]));
  return buildRenamePreview({
    oldCode: 'ZZTEST-EXCEL-01',
    newCode: 'EXCEL-HR-01',
    msdbCodes: ['ZZTEST-EXCEL-01', 'MSE-L2'],
    extensionCodes: ['ZZTEST-EXCEL-01'],
    urlAlias: '',
    ...over,
    matches: { ...matches, courseExtension: [{ courseId: 'ZZTEST-EXCEL-01' }], ...(over.matches ?? {}) },
  });
};

const render = (p) => renderToStaticMarkup(createElement(RenameExecutePanel, { preview: p }));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// ── When it is not offered at all ───────────────────────────────────────────

test('no preview → no execute panel', () => {
  assert.equal(render(null), '');
});

test('A BLOCKED preview offers no execute panel at all', () => {
  // Not a disabled button on a collision — nothing. A refused rename has no
  // "are you sure".
  assert.equal(render(preview({ newCode: 'MSE-L2' })), '');
});

// ── The confirmation ────────────────────────────────────────────────────────

test('THE BUTTON STARTS DISABLED', () => {
  const html = render(preview());
  const btn = /<button[^>]*>(?:(?!<\/button>)[\s\S])*เปลี่ยนรหัส[\s\S]*?<\/button>/.exec(html)?.[0];
  assert.ok(btn, 'the rename button did not render');
  assert.match(btn, /disabled/, 'the rename button is enabled on first render');
});

test('THE CONFIRMATION IS TYPED — a text input expecting the new code', () => {
  const html = render(preview());
  const input = /<input[^>]*id="confirm-code"[^>]*>/.exec(html)?.[0];
  assert.ok(input, 'there is no typed confirmation');
  assert.match(input, /type="text"/);
  assert.match(input, /placeholder="EXCEL-HR-01"/, 'the field does not show which code to type');
  assert.match(text(html), /พิมพ์รหัสใหม่อีกครั้ง/);
  // and it tells the admin WHY — the mis-selected course is what this catches
  assert.match(text(html), /เลือกหลักสูตรถูกตัว/);
});

test('THE MSDB ACKNOWLEDGEMENT IS A SEPARATE CONTROL', () => {
  const html = render(preview());
  assert.match(html, /<input[^>]*type="checkbox"/, 'there is no separate acknowledgement');
  // Two controls, not one: a typed field AND a checkbox.
  assert.equal((html.match(/<input/g) ?? []).length, 2, 'expected exactly two confirmation controls');
  assert.match(text(html), /แก้ course_id ที่ MSDB ด้วยตนเองทันที/);
});

test('the acknowledgement names the hidden-course consequence', () => {
  // The specific thing an admin would not guess: this interval can un-hide a
  // course that was deliberately hidden.
  assert.match(text(render(preview())), /ซ่อนไว้อาจกลับมาแสดงต่อสาธารณะ/);
});

// ── The alias as step one ───────────────────────────────────────────────────

test('A DERIVED url renders the alias as STEP ONE, before the write', () => {
  const html = render(preview({ urlAlias: '' }));
  const step = /<li[^>]*data-testid="alias-step"[\s\S]*?<\/li>/.exec(html)?.[0];
  assert.ok(step, 'the alias is not rendered as a step');
  assert.match(step, /ขั้นที่ 1/, 'the alias is not step one');
  assert.match(step, /zztest-excel-01-training-course/);
  assert.match(step, /404/, 'the consequence of skipping it is not stated');
  // and the write is step two
  assert.match(text(html), /ขั้นที่ 2 — เปลี่ยนรหัสในระบบนี้/);
});

test('an ALIASED url has no alias step, and the write becomes step one', () => {
  const html = render(preview({ urlAlias: '/excel-hr' }));
  assert.ok(!/data-testid="alias-step"/.test(html), 'an aliased course was told an alias will be created');
  assert.match(text(html), /ขั้นที่ 1 — เปลี่ยนรหัสในระบบนี้/);
});

test('the MSDB step is always the LAST step, and is attributed to the admin', () => {
  assert.match(text(render(preview())), /คุณแก้ course_id ที่ MSDB เอง/);
});

// ── The obligation is on screen before anything is clicked ──────────────────

test('the MSDB obligation renders BEFORE any write, with both codes', () => {
  const html = render(preview());
  assert.match(html, /data-testid="msdb-obligation"/, 'the obligation is only shown after the write');
  const t = text(html);
  assert.match(t, /ZZTEST-EXCEL-01/);
  assert.match(t, /EXCEL-HR-01/);
});

// ── Nothing has run yet ─────────────────────────────────────────────────────

test('no post-run state is rendered before anything has run', () => {
  const html = render(preview());
  assert.ok(!/data-testid="rename-state"/.test(html), 'a post-run state appeared before the run');
  assert.ok(!/data-testid="rename-stale"/.test(html));
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the panel renders something substantial for a runnable preview', () => {
  // Every negative above passes over an empty render.
  const html = render(preview());
  assert.ok(html.length > 800, `the panel rendered ${html.length} chars`);
  assert.match(html, /data-testid="rename-execute"/);
});

test('CONTROL: a runnable and a blocked preview differ completely', () => {
  assert.notEqual(render(preview()), render(preview({ newCode: 'MSE-L2' })));
  assert.equal(render(preview({ newCode: 'MSE-L2' })), '');
});
