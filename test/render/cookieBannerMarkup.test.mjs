import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { CookieBanner, COOKIE_BANNER_TITLE } from '@/components/consent/CookieBanner';
import { CookieSettingsDialog, COOKIE_SETTINGS_TITLE } from '@/components/consent/CookieSettingsDialog';

/**
 * What the two consent layers ACTUALLY render (round CB-C), read off the markup
 * with JSDOM rather than off the source — every assertion is about an element's
 * own attributes and text.
 *
 * This is a first render (createRoot is banned in this suite's node tiers), so
 * it carries the INITIAL state and the STRUCTURE. The state transitions behind
 * the buttons are pure functions in test/pure/cookieBannerState.test.mjs; the
 * decision ORDER lives in the mount and is asserted in test/fs/consentWiring.
 */

const parse = (el) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(el)}</body>`).window.document;
const layer1 = () => parse(createElement(CookieBanner));
const layer2 = (props = {}) => parse(createElement(CookieSettingsDialog, { open: true, ...props }));
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

// ── LAYER 1 ─────────────────────────────────────────────────────────────────

test('layer 1 is a labelled REGION, not a dialog — the page stays usable', () => {
  const d = layer1();
  const region = d.querySelector('section[role="region"][aria-labelledby]');
  assert.ok(region, 'a labelled region');
  assert.equal(d.querySelector('[role="dialog"], [aria-modal]'), null, 'and not a modal');
  const heading = d.getElementById(region.getAttribute('aria-labelledby'));
  assert.equal(heading.tagName, 'H2');
  assert.equal(text(heading), COOKIE_BANNER_TITLE);
  assert.equal(COOKIE_BANNER_TITLE, 'ช่วยเราปรับเว็บให้ตรงกับคุณมากขึ้น');
});

test('layer 1 copy is verbatim and links the cookie policy', () => {
  const d = layer1();
  const p = d.querySelector('p');
  assert.match(text(p), /^คุกกี้วิเคราะห์ช่วยให้เรารู้ว่าคอร์สและบทความไหนมีประโยชน์ ส่วนคุกกี้การตลาดใช้แสดงโปรโมชันที่เกี่ยวข้อง เปลี่ยนใจได้ทุกเมื่อที่ "ตั้งค่าคุกกี้" ท้ายเว็บ นโยบายคุกกี้$/);
  const link = p.querySelector('a');
  assert.equal(link.getAttribute('href'), '/cookie-policy');
  assert.equal(text(link), 'นโยบายคุกกี้');
});

test('layer 1: accept and reject are stacked, full width and IDENTICAL in size', () => {
  const d = layer1();
  const buttons = [...d.querySelectorAll('button')];
  assert.deepEqual(buttons.map(text), ['ยอมรับทั้งหมด', 'ปฏิเสธทั้งหมด', 'ตั้งค่าเพิ่มเติม']);
  for (const b of buttons) assert.equal(b.getAttribute('type'), 'button');

  const [accept, reject] = buttons;
  const sizeTokens = (b) => b.className.split(/\s+/)
    .filter((c) => /^(min-h-|w-|rounded-|text-\[\d|font-|px-)/.test(c)).sort();
  assert.deepEqual(sizeTokens(accept), sizeTokens(reject), 'same size tokens on both');
  for (const t of ['min-h-[46px]', 'w-full', 'rounded-[12px]', 'text-[15px]', 'font-bold']) {
    assert.ok(accept.className.includes(t), `accept has ${t}`);
  }
  assert.match(accept.className, /bg-\[#005CFF\]/);
  assert.match(accept.className, /text-white/);
  assert.match(reject.className, /border-2/);
  assert.match(reject.className, /border-\[#005CFF\]/);
  assert.match(reject.className, /text-\[#005CFF\]/);
  // Stacked: their wrapper is a column with an 8px gap.
  assert.equal(accept.parentElement, reject.parentElement);
  assert.match(accept.parentElement.className, /flex-col/);
  assert.match(accept.parentElement.className, /gap-2/);
});

test('layer 1: "ตั้งค่าเพิ่มเติม" is a ≥44px underlined text button; no × on layer 1', () => {
  const d = layer1();
  const more = d.querySelector('[data-cookie-layer1-settings]');
  assert.equal(text(more), 'ตั้งค่าเพิ่มเติม');
  assert.match(more.className, /min-h-\[44px\]/);
  assert.match(more.className, /underline/);
  assert.equal(d.querySelector('[aria-label="ปิด"]'), null, 'no close button on layer 1');
});

test('layer 1 no longer carries the mascot or any category toggle', () => {
  const d = layer1();
  assert.equal(d.querySelectorAll('svg').length, 0, 'no illustration');
  assert.equal(d.querySelectorAll('input, [role="switch"]').length, 0, 'the toggles live in layer 2');
});

// ── LAYER 2 ─────────────────────────────────────────────────────────────────

test('layer 2 is a modal dialog labelled by its heading, with a 44px × named "ปิด"', () => {
  const d = layer2();
  const dialog = d.querySelector('[role="dialog"]');
  assert.ok(dialog);
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  const heading = d.getElementById(dialog.getAttribute('aria-labelledby'));
  assert.equal(text(heading), COOKIE_SETTINGS_TITLE);
  assert.equal(COOKIE_SETTINGS_TITLE, 'ตั้งค่าคุกกี้');
  const close = dialog.querySelector('button[aria-label="ปิด"]');
  assert.ok(close);
  assert.match(close.className, /h-11/);
  assert.match(close.className, /w-11/);
  assert.match(dialog.className, /max-w-\[620px\]/);
  assert.ok(d.querySelector('[data-cookie-settings-scrim]'), 'there is a scrim behind it');
});

test('layer 2 renders nothing when closed', () => {
  const d = parse(createElement(CookieSettingsDialog, { open: false }));
  assert.equal(d.body.innerHTML, '');
});

test('layer 2 rows: necessary is "เปิดตลอด" with no switch; the other two are switches', () => {
  const d = layer2();
  const rows = [...d.querySelectorAll('[role="dialog"] ul > li')];
  assert.deepEqual(rows.map((r) => text(r.querySelector('h3'))), ['คุกกี้ที่จำเป็น', 'คุกกี้วิเคราะห์', 'คุกกี้การตลาด']);
  assert.equal(rows[0].querySelector('[role="switch"]'), null);
  assert.match(text(rows[0]), /เปิดตลอด/);
  assert.match(text(rows[0]), /ทำให้เว็บทำงานได้และจำสิ่งที่คุณเลือกเอง เช่น การตั้งค่าคุกกี้ การเข้าสู่ระบบ และโหมดสีมืด\/สว่าง/);
  assert.match(text(rows[1]), /ช่วยให้เรารู้ว่าคอร์สและบทความไหนมีประโยชน์ เพื่อปรับปรุงเนื้อหา \(Google Analytics\)/);
  assert.match(text(rows[2]), /วัดผลโฆษณาและแสดงโปรโมชันที่เกี่ยวข้องบน Google และแพลตฟอร์มอื่น/);
});

test('switches are real buttons with role=switch, named by their row, OFF for a first-time visitor', () => {
  const d = layer2();
  const switches = [...d.querySelectorAll('button[role="switch"]')];
  assert.equal(switches.length, 2);
  for (const s of switches) {
    assert.equal(s.getAttribute('type'), 'button');
    assert.equal(s.getAttribute('aria-checked'), 'false');
    const name = d.getElementById(s.getAttribute('aria-labelledby'));
    assert.ok(name && text(name), 'the switch has an accessible name');
  }
  assert.deepEqual(switches.map((s) => s.getAttribute('data-consent-switch')), ['analytics', 'marketing']);
});

test('re-opened, the switches show the STORED choice', () => {
  const d = layer2({ initial: { analytics: true, marketing: false } });
  const state = Object.fromEntries([...d.querySelectorAll('button[role="switch"]')]
    .map((s) => [s.getAttribute('data-consent-switch'), s.getAttribute('aria-checked')]));
  assert.deepEqual(state, { analytics: 'true', marketing: 'false' });
});

test('layer 2 footer: reject (outline), save (outline), accept (filled) — equal buttons', () => {
  const d = layer2();
  const footer = [...d.querySelectorAll('[role="dialog"] > div:last-child > button')];
  assert.deepEqual(footer.map(text), ['ปฏิเสธทั้งหมด', 'บันทึกตัวเลือก', 'ยอมรับทั้งหมด']);
  assert.match(footer[0].className, /border-2/);
  assert.match(footer[1].className, /border-2/);
  assert.match(footer[2].className, /bg-\[#005CFF\]/);
  for (const b of footer) {
    assert.match(b.className, /flex-1/, 'equal width in a row');
    assert.match(b.className, /min-h-\[46px\]/);
  }
  // Stacks on narrow screens, a row from sm up.
  assert.match(footer[0].parentElement.className, /flex-col/);
  assert.match(footer[0].parentElement.className, /sm:flex-row/);
});

// ── SEPARATION ──────────────────────────────────────────────────────────────

test('SEPARATION: neither layer ships persistence or a gtag call — the mount owns side effects', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const f of ['CookieBanner.jsx', 'CookieSettingsDialog.jsx']) {
    const src = await readFile(new URL(`../../src/components/consent/${f}`, import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['localStorage', 'sessionStorage', 'document.cookie', 'gtag', 'dataLayer']) {
      assert.equal(code.includes(forbidden), false, `${f}: ${forbidden} must live in the mount, not here`);
    }
  }
});

test('CONTROL: the persistence probe can actually fail', () => {
  const code = 'const x = () => { localStorage.setItem("consent", "1"); };';
  assert.equal(code.includes('localStorage'), true);
});

test('CONTROL: the size-token comparison would see a smaller reject', () => {
  const a = 'min-h-[46px] w-full rounded-[12px] text-[15px] font-bold';
  const b = 'min-h-[36px] w-full rounded-[12px] text-[13px] font-bold';
  assert.notDeepEqual(a.split(' ').sort(), b.split(' ').sort());
});
