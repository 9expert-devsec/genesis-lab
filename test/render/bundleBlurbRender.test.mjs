import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { BundleBlurb } from '@/components/pageBuilder/sections/BundleBlurb';
import { blurbPatch, docFromPlainText } from '@/lib/bundle/blurb';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../sourceScan.mjs';

/**
 * THE SUB-LINE, FROM WHICHEVER FIELD IS CURRENT.
 *
 * One component, two call sites — the promotion card's sub-line and the
 * quotation page's header — so a customer who clicks a card showing rich text
 * cannot land on a header showing something else.
 *
 * ── THE ASSERTION THAT MATTERS MOST IS THE BORING ONE ─────────────────────
 * Every bundle section stored today is string-only, so the STRING branch is
 * what the live site renders until an admin saves a section on staging. Its
 * markup is pinned byte-for-byte against the literal each surface emitted
 * before this component existed. A restyle hidden inside a refactor would be a
 * visual change nobody asked for, on every promotion page.
 */

const CARD_CLASS = 'text-sm text-[var(--text-secondary)]';
const HEADER_CLASS = 'mt-2 text-sm text-[var(--text-secondary)]';

const html = (content, className = CARD_CLASS) =>
  renderToStaticMarkup(createElement(BundleBlurb, { content, className }));
const dom = (content, className) =>
  new JSDOM(`<!doctype html><body>${html(content, className)}</body>`).window.document;

const p = (...inline) => ({ type: 'paragraph', content: inline });
const t = (text, marks) => (marks ? { type: 'text', text, marks } : { type: 'text', text });
const doc = (...content) => ({ type: 'doc', content });

// ── the string branch: byte-identical to what it replaced ─────────────────

test('a legacy string renders the EXACT markup each surface emitted before', () => {
  /**
   * The card was `{blurb && <p className="text-sm text-[var(--text-secondary)]">{blurb}</p>}`
   * and the header was the same `<p>` with `mt-2`. Both are reproduced here as
   * literals rather than built from the component, so a change to either is a
   * change to this test.
   */
  assert.equal(
    html({ blurb: 'สองหลักสูตรในแพ็กเกจเดียว' }),
    '<p class="text-sm text-[var(--text-secondary)]">สองหลักสูตรในแพ็กเกจเดียว</p>',
  );
  assert.equal(
    html({ blurb: 'สองหลักสูตรในแพ็กเกจเดียว' }, HEADER_CLASS),
    '<p class="mt-2 text-sm text-[var(--text-secondary)]">สองหลักสูตรในแพ็กเกจเดียว</p>',
  );
});

test('a string is ESCAPED, exactly as a React child always was', () => {
  // A stored `<b>x</b>` has always rendered as five visible characters. The
  // rich-text field must not turn a legacy value into markup.
  assert.equal(
    html({ blurb: '<b>x</b> & "y"' }),
    '<p class="text-sm text-[var(--text-secondary)]">&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;</p>',
  );
});

test('nothing authored draws nothing — no empty styled box', () => {
  for (const content of [{}, { blurb: '' }, { blurb: '   ' }, { blurb: null }]) {
    assert.equal(html(content), '', JSON.stringify(content));
  }
  // …including a doc that passed the drift rule but walks to nothing.
  assert.equal(html({ blurb: '', blurbDoc: doc() }), '');
});

// ── the doc branch ────────────────────────────────────────────────────────

test('a MATCHING doc renders bold, italic and a link', () => {
  const content = blurbPatch(doc(p(
    t('เริ่มต้นใช้ '),
    t('Claude AI', [{ type: 'bold' }]),
    t(' แล้ว'),
    t('ต่อยอด', [{ type: 'italic' }]),
    t(' — '),
    t('ดูรายละเอียด', [{ type: 'link', attrs: { href: 'https://9expert.co.th/x' } }]),
  )));
  const d = dom(content);

  assert.notEqual(d.querySelector('strong, b'), null, 'bold did not render');
  assert.notEqual(d.querySelector('em, i'), null, 'italic did not render');
  const a = d.querySelector('a');
  assert.notEqual(a, null, 'the link did not render');
  assert.equal(a.getAttribute('href'), 'https://9expert.co.th/x');
  assert.equal(a.getAttribute('rel'), 'noopener noreferrer nofollow');
  assert.equal(a.getAttribute('target'), '_blank');
});

test('the doc branch is a <div>, because the walker emits its own <p>s', () => {
  /**
   * A `<p>` wrapper round `renderTiptap`'s output would nest a paragraph in a
   * paragraph, which browsers repair by closing the outer one early — putting
   * the text outside the styled element.
   */
  const content = blurbPatch(docFromPlainText('หนึ่ง\nสอง'));
  const d = dom(content);
  const root = d.body.firstElementChild;
  assert.equal(root.tagName, 'DIV');
  assert.deepEqual([...root.children].map((el) => el.tagName), ['P', 'P']);
  assert.equal(d.querySelector('p p'), null, 'a paragraph is nested inside a paragraph');
  // The caller's typography is still on the wrapper, so the inner <p>s inherit.
  assert.match(root.getAttribute('class'), /text-sm/);
  assert.match(root.getAttribute('class'), /text-\[var\(--text-secondary\)\]/);
});

test('a stale doc falls back to the STRING, and renders the <p> branch', () => {
  /**
   * THE CASE THE WHOLE TWO-FIELD DESIGN EXISTS FOR: a production admin edited
   * `blurb` through the plain textarea on `dev` and the old doc survived,
   * because that branch's bundle content schema is `.passthrough()`.
   */
  const stale = doc(p(t('ข้อความเก่า', [{ type: 'bold' }])));
  const out = html({ blurb: 'ข้อความใหม่จากโปรดักชัน', blurbDoc: stale });
  assert.equal(out, '<p class="text-sm text-[var(--text-secondary)]">ข้อความใหม่จากโปรดักชัน</p>');
  assert.equal(/<strong|<b>/.test(out), false, 'the stale formatting rendered');
});

test('a javascript: link renders as TEXT, never as an anchor', () => {
  // Stripped by the sanitiser on the way in, and `safeUrl` in the walker is the
  // second gate. The words survive either way.
  const content = {
    blurb: 'กดที่นี่',
    // eslint-disable-next-line no-script-url
    blurbDoc: doc(p(t('กดที่นี่', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))),
  };
  const d = dom(content);
  assert.equal(d.querySelector('a'), null, 'an unsafe href became a live link');
  assert.match(d.body.textContent, /กดที่นี่/);
});

test('a heading or a list in the doc renders as plain paragraphs', () => {
  // `renderTiptap` knows both — rich_text sections legitimately contain them —
  // so the narrowing has to happen before it, and it does.
  const content = blurbPatch(doc(
    { type: 'heading', attrs: { level: 2 }, content: [t('หัวข้อ')] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('ข้อ'))] }] },
  ));
  const d = dom(content);
  assert.equal(d.querySelector('h1, h2, h3, h4, h5, h6'), null, 'a heading rendered');
  assert.equal(d.querySelector('ul, ol, li'), null, 'a list rendered');
  assert.match(d.body.textContent, /หัวข้อ/);
  assert.match(d.body.textContent, /ข้อ/);
});

// ── the link colour is a PAIR, per globals.css's own rule ─────────────────

test('links carry BOTH contrast tokens and an underline', () => {
  /**
   * globals.css states the rule at the tokens: `--9e-action` (#005CFF, ~5.3:1
   * on white) for small links on a LIGHT background, `--9e-air` (#48B0FF) for
   * DARK backgrounds only — "never small text on light". #005CFF on the navy
   * card (#0D1B2A) is about 2.8:1 and fails, so one blue was never an option.
   *
   * The underline is the WCAG 1.4.1 half: colour may not be the only thing
   * marking a link.
   */
  const content = blurbPatch(doc(p(t('x', [{ type: 'link', attrs: { href: 'https://x.test' } }]))));
  const cls = dom(content).body.firstElementChild.getAttribute('class');
  assert.match(cls, /\[&_a\]:text-9e-action/, 'no light-surface link colour');
  assert.match(cls, /dark:\[&_a\]:text-9e-air/, 'no dark-surface link colour');
  assert.match(cls, /\[&_a\]:underline/, 'colour is the only thing marking the link');
});

test('CONTROL: the string branch carries NONE of that — it has no links', () => {
  // The probes above would pass against a component that put the link classes
  // on every render, which would also put `dark:` colours on the light-scoped
  // string branch for no reason.
  const cls = dom({ blurb: 'x' }).body.firstElementChild.getAttribute('class');
  assert.equal(cls, CARD_CLASS);
  assert.equal(/9e-air|9e-action|underline/.test(cls), false, `string branch class: ${cls}`);
});

// ── and the readers that must NOT have moved ─────────────────────────────

test('the always-string readers still read `blurb` and know nothing of the doc', () => {
  /**
   * The corpus, the section label and the card's own all-empty check read the
   * plain string on purpose — that is the field production writes, and it is why
   * `blurb` keeps its type. A refactor that routed them through the doc would
   * hand `[object Object]` to the corpus the moment the two drifted.
   */
  const files = {
    'src/lib/corpus/promotions.js': /description: text\(content\.blurb\)/,
    'src/lib/pageBuilder/sectionLabels.js': /!String\(c\.blurb \?\? ''\)\.trim\(\)/,
  };
  for (const [rel, probe] of Object.entries(files)) {
    const code = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(code, probe, `${rel} stopped reading the plain string`);
    assert.equal(/blurbDoc/.test(code), false, `${rel} now reads blurbDoc`);
  }
  // The card keeps its own string const for the all-empty check.
  const card = readFileSync(join(ROOT, 'src/components/pageBuilder/sections/promotion_bundle.jsx'), 'utf8');
  assert.match(card, /const blurb = typeof content\?\.blurb === 'string' \? content\.blurb\.trim\(\) : ''/);
  assert.match(card, /if \(!name && !blurb && !code/);
});

