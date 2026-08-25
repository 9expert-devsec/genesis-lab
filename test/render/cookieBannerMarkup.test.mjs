import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { CookieBanner } from '@/components/consent/CookieBanner';

/**
 * What the cookie banner ACTUALLY renders — the accessibility contract and the
 * PDPA-correct initial state, read off the markup rather than off the source.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────
 * This is a first render, so it carries the INITIAL state and the STRUCTURE.
 * The state transitions behind the three buttons are pure functions asserted in
 * test/pure/cookieBannerState.test.mjs; this file's job is the other half —
 * that the controls are real form controls, that the necessary category is
 * genuinely inoperable rather than merely styled that way, and that the
 * component has not quietly acquired consent persistence.
 *
 * Parsed with JSDOM rather than regexed, because every assertion here is about
 * an ELEMENT's own attributes (is THIS input the disabled one?), and a
 * substring check across the whole banner answers a different question.
 */

const doc = () => {
  const html = renderToStaticMarkup(createElement(CookieBanner));
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
};

const checkboxes = (d) => [...d.querySelectorAll('input[type="checkbox"]')];

test('all four categories are REAL form controls, not styled divs', () => {
  const boxes = checkboxes(doc());
  assert.equal(boxes.length, 4, 'necessary + three optional');
  // A div with role="checkbox" would satisfy a screen reader only if someone
  // also hand-wired keyboard handling, focus, and aria-checked. Native inputs
  // get all three for free and cannot silently lose them.
  for (const box of boxes) {
    assert.equal(box.tagName, 'INPUT');
  }
});

test('the three optional categories start UNCHECKED', () => {
  const optional = checkboxes(doc()).filter((b) => !b.disabled);
  assert.equal(optional.length, 3);
  for (const box of optional) {
    assert.equal(
      box.hasAttribute('checked'),
      false,
      'the Figma shows these checked; pre-ticked consent is not valid opt-in',
    );
  }
});

test('the necessary category is checked AND genuinely non-toggleable', () => {
  const [necessary] = checkboxes(doc()).filter((b) => b.disabled);
  assert.ok(necessary, 'exactly one control is disabled');
  assert.equal(necessary.hasAttribute('checked'), true, 'and it is on');
  assert.equal(
    necessary.getAttribute('role'),
    'switch',
    'the Figma draws it as a switch, so it announces as one',
  );
});

test('exactly one control is non-interactive — the other three are operable', () => {
  const boxes = checkboxes(doc());
  assert.equal(boxes.filter((b) => b.disabled).length, 1);
  assert.equal(boxes.filter((b) => !b.disabled).length, 3);
});

test('the always-on state is spelled out for assistive tech, not just drawn', () => {
  const d = doc();
  const [necessary] = checkboxes(d).filter((b) => b.disabled);
  const label = necessary.closest('label');
  assert.ok(label, 'the input is wrapped in its label, so the name is implicit');
  assert.match(
    label.textContent,
    /ไม่สามารถปิดได้/,
    'a lock ICON alone conveys nothing to a screen reader',
  );
  assert.match(label.textContent, /คุกกี้ที่จำเป็น/, 'and it still carries its own name');
});

test('every optional checkbox is inside its own label, so the pill is the hit target', () => {
  for (const box of checkboxes(doc()).filter((b) => !b.disabled)) {
    assert.ok(box.closest('label'), 'an unlabelled checkbox announces as nothing');
  }
});

test('the three optional labels are the Figma three, in order', () => {
  const labels = checkboxes(doc())
    .filter((b) => !b.disabled)
    .map((b) => b.closest('label').textContent.trim());
  assert.deepEqual(labels, ['คุกกี้วิเคราะห์', 'คุกกี้ด้านฟังก์ชัน', 'คุกกี้การตลาด']);
});

test('the policy link points at the real shipped page', () => {
  const d = doc();
  const link = [...d.querySelectorAll('a')].find((a) =>
    a.textContent.includes('อ่านนโยบายการใช้คุกกี้'),
  );
  assert.ok(link, 'the policy link is present');
  assert.equal(link.getAttribute('href'), '/cookie-policy');
});

test('there is no second link — "ตั้งค่าคุกกี้" was removed deliberately', () => {
  const d = doc();
  // With no settings modal and no preference page, that link had no
  // destination; its only possible behaviour duplicated the จัดการการตั้งค่า
  // button sitting beside it. If it comes back, it needs somewhere to go.
  assert.equal(d.querySelectorAll('a').length, 1);
  assert.equal(d.body.textContent.includes('ตั้งค่าคุกกี้'), false);
});

test('all three buttons render, and every one is type=button', () => {
  const d = doc();
  const buttons = [...d.querySelectorAll('button')];
  assert.equal(buttons.length, 3);
  for (const b of buttons) {
    // An untyped <button> inside a form submits it. This banner will eventually
    // be mounted globally, possibly inside one.
    assert.equal(b.getAttribute('type'), 'button');
  }
  assert.deepEqual(
    buttons.map((b) => b.textContent.trim()),
    ['จัดการการตั้งค่า', 'ปฏิเสธคุกกี้ที่ไม่จำเป็น', 'ยอมรับทั้งหมด'],
  );
});

test('the banner is a labelled landmark, not an anonymous div', () => {
  const d = doc();
  const section = d.querySelector('section[aria-labelledby]');
  assert.ok(section, 'a consent banner a user must find has to be reachable');
  const heading = d.getElementById(section.getAttribute('aria-labelledby'));
  assert.ok(heading, 'and the label target actually exists');
  assert.match(heading.textContent, /เราใช้คุกกี้/);
});

test('the illustration is inline SVG with no expiring remote reference', () => {
  const d = doc();
  const svg = d.querySelector('svg[role="img"]');
  assert.ok(svg, 'the mascot renders inline');
  assert.ok(svg.getAttribute('aria-label'), 'and is named, not left as bare decoration');
  // Figma export URLs expire ~7 days out. Nothing here may reach the network.
  assert.equal(d.querySelectorAll('img').length, 0, 'no <img> at all');

  // Checked per-ATTRIBUTE, not as a substring of the markup: an earlier version
  // of this test grepped the whole innerHTML for /http/ and failed on the SVG's
  // own xmlns="http://www.w3.org/2000/svg", which is a namespace identifier and
  // is never fetched. The question is whether any attribute that the browser
  // RESOLVES points off-origin.
  const FETCHING_ATTRS = ['src', 'href', 'xlink:href', 'srcset', 'poster', 'data'];
  for (const el of d.querySelectorAll('*')) {
    for (const attr of FETCHING_ATTRS) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      assert.equal(
        /^(https?:)?\/\//i.test(value),
        false,
        `${el.tagName}[${attr}]="${value}" reaches off-origin`,
      );
    }
  }
  // And the Figma host by name, wherever it might hide (inline style url(), a
  // CSS custom property, a data attribute).
  assert.equal(
    /figma|s3-alpha-sig/i.test(d.body.innerHTML),
    false,
    'no Figma export URL anywhere in the banner markup',
  );
});

test('decorative icons are hidden from assistive tech', () => {
  const d = doc();
  // The lucide glyphs restate their neighbouring text; announcing them
  // doubles every label.
  for (const svg of d.querySelectorAll('svg')) {
    const named = svg.getAttribute('role') === 'img';
    if (named) continue;
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
  }
});

test('UI ONLY: the banner ships no consent persistence and no gtag call', async () => {
  // The load-bearing guarantee of this round. If any of these appear, the
  // component is doing something it is not yet allowed to do, and mounting it
  // becomes a correctness question rather than a scheduling one.
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(
    new URL('../../src/components/consent/CookieBanner.jsx', import.meta.url),
    'utf8',
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['localStorage', 'sessionStorage', 'document.cookie', 'gtag', 'dataLayer']) {
    assert.equal(
      code.includes(forbidden),
      false,
      `${forbidden} must not appear until the wiring round`,
    );
  }
});

test('CONTROL: the persistence probe can actually fail', () => {
  const code = 'const x = () => { localStorage.setItem("consent", "1"); };';
  assert.equal(code.includes('localStorage'), true);
});
