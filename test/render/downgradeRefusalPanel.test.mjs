import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DowngradeRefusalPanel } from '@/app/admin/cache/_components/DowngradeRefusalPanel';

/**
 * What the blocked-sync panel puts on screen.
 *
 * renderToStaticMarkup only — no React root, since the runner is
 * isolation:'none' and a createRoot over jsdom leaks globalThis.window into
 * every other render test in the run. Only the INITIAL state is observable,
 * which is the state under test: the panel before anyone has clicked.
 */

const strip = (html) => html.replace(/<[^>]*>/g, ' ');

const REFUSAL = {
  at: '2026-08-13T03:00:00.000Z',
  actor: 'system:cron',
  reason: 'สแนปช็อตใหม่เล็กลงมากเกินเกณฑ์ 50%',
  shrunk: [
    { section: 'programs', before: 25, after: 3, lost: 22, ratio: 0.88 },
    { section: 'banners', before: 15, after: 2, lost: 13, ratio: 0.8667 },
  ],
  vanished: ['retiredSection'],
};

const render = (refusal) =>
  strip(renderToStaticMarkup(h(DowngradeRefusalPanel, { refusal })));

test('the ACTUAL NUMBERS are rendered per section, not a summary sentence', () => {
  /**
   * The admin is being asked to approve a data loss, and "the snapshot shrank
   * too much" does not let them tell `banners 15 → 2` (someone deactivated a
   * campaign) from `programs 25 → 3` (upstream is broken). Every number that
   * produced the refusal has to be legible.
   */
  const html = render(REFUSAL);
  for (const n of ['programs', '25', '3', '22', '88', 'banners', '15', '2', '13']) {
    assert.match(html, new RegExp(n), `missing ${n}`);
  }
});

test('the computed RATIO is shown, not only the raw counts', () => {
  const html = render(REFUSAL);
  assert.match(html, /-88%/);
  assert.match(html, /-87%/, 'rounded from 0.8667');
});

test('CONTROL: a panel with different numbers renders those instead', () => {
  // Pins that the figures come from the prop rather than being hardcoded copy.
  const html = render({ ...REFUSAL, shrunk: [{ section: 'skills', before: 9, after: 1, lost: 8, ratio: 0.889 }] });
  assert.match(html, /skills/);
  assert.match(html, /\b9\b/);
  assert.ok(!/programs/.test(html), 'the other fixture&apos;s section is gone');
});

test('WHEN it was recorded is shown', () => {
  assert.match(render(REFUSAL), /2026-08-13T03:00:00\.000Z/);
});

test('WHICH RUN recorded it — cron is named as cron', () => {
  assert.match(render(REFUSAL), /cron/);
});

test('an ADMIN actor is shown as an id, and the missing NAME is admitted', () => {
  // The refusal records an actor id, never a display name. Inventing one would
  // be a guess; saying so is not.
  const html = render({ ...REFUSAL, actor: '66f1a2b3c4d5e6f708192a3b' });
  assert.match(html, /66f1a2b3c4d5e6f708192a3b/);
  assert.match(html, /ไม่ได้บันทึกชื่อ/);
});

test('an UNRECORDED actor says so rather than guessing', () => {
  const html = render({ ...REFUSAL, actor: null });
  assert.match(html, /ไม่ได้บันทึกว่ารอบไหนเป็นผู้ปฏิเสธ/);
  assert.match(html, /was not recorded/);
});

test('THERE IS NO DISMISS CONTROL', () => {
  /**
   * Clearing the refusal without syncing would leave the console silent while
   * the next cron run recomputes the same refusal and blocks again — a quiet
   * console over a still-blocked sync, which is worse than the refusal being
   * visible. The only way out is forward.
   */
  const html = render(REFUSAL);
  for (const banned of [/ปิดแจ้งเตือน/, /dismiss/i, /ละเว้น/, /ซ่อนข้อความนี้/, /เคลียร์/]) {
    assert.ok(!banned.test(html), `a dismiss control matching ${banned} exists`);
  }
});

test('it says the stored snapshot is still being served', () => {
  // The reassurance that makes the refusal readable as "blocked", not "broken".
  const html = render(REFUSAL);
  assert.match(html, /สแนปช็อตเดิมยังเสิร์ฟอยู่ตามปกติ/);
  assert.match(html, /ข้อมูลใหม่จะไม่ขึ้น/);
});

test('vanished sections are listed and NOT counted as shrinkage', () => {
  const html = render(REFUSAL);
  assert.match(html, /retiredSection/);
  assert.match(html, /ไม่นับเป็นการหด/);
});

test('NOTHING renders when there is no refusal', () => {
  // The healthy case must add nothing to the page — an always-present panel
  // that is usually empty is a panel people stop reading.
  for (const empty of [null, undefined]) {
    assert.equal(renderToStaticMarkup(h(DowngradeRefusalPanel, { refusal: empty })), '');
  }
});

test('a refusal with no shrunk list still renders its identity', () => {
  // Defensive: the record is Mixed in the schema, so a malformed one must not
  // blank the panel that is the only route to unblocking the cron.
  const html = render({ at: '2026-08-13T03:00:00.000Z', actor: 'system:cron' });
  assert.match(html, /2026-08-13/);
  assert.match(html, /cron/);
});
