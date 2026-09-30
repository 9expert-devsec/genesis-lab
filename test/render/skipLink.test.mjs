import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSource, walkSources } from '../sourceScan.mjs';
import { SkipLink } from '@/components/layout/SkipLink';
import NotFound from '@/app/not-found';

/**
 * The skip link is the FIRST Tab stop on every public page, and it lands in
 * <main id="main">.
 *
 * ── WHAT IS RENDERED AND WHAT IS READ AS SOURCE ─────────────────────────────
 * SkipLink and the 404 page are plain components and are rendered. Home and the
 * (public) layout are ASYNC server components that fetch (top bars, landing
 * cache, nav data), so they cannot be rendered here without a React root and
 * stubs for half the data layer — their return trees are read through
 * sourceScan instead, which scrubs comments (a JSX comment becomes `{ }`).
 *
 * ── WHY "FIRST" IS THE CLAIM ────────────────────────────────────────────────
 * TopNotificationBar carries a link and a close button. Measured before this
 * existed: the first Tab on Home and on /training-course landed on the bar's
 * `สมัครเลย`, the second on its close button. Anything focusable mounted ahead
 * of SkipLink takes the first Tab from it, so the guard is on ORDER, not on
 * presence.
 *
 * WHAT THIS CANNOT SEE: whether Tailwind emits the focus: rules, and whether
 * the root layout (Analytics, the dock, the consent banner) puts something
 * focusable ahead of the page — that was measured in headless Chrome.
 */

const FOCUSABLE = /<(a\s[^>]*href=|button[\s>]|input[\s>]|select[\s>]|textarea[\s>]|[a-z]+\s[^>]*tabindex="(?!-1")\d+")/i;

/** The opening tag of the first focusable element in a markup string. */
function firstFocusable(html) {
  const m = html.match(FOCUSABLE);
  if (!m) return null;
  return html.slice(m.index, html.indexOf('>', m.index) + 1);
}

/**
 * The tag name of the first element inside a component's returned root — the
 * fragment or wrapper that `return (` opens with. `{ }` is a scrubbed comment.
 */
function firstChildOfReturn(code, root) {
  const open = code.match(new RegExp(`return \\(\\s*${root}`));
  if (!open) return null;
  const rest = code.slice(open.index + open[0].length);
  const m = rest.match(/^(?:\s|\{\s*\})*<([A-Za-z][\w.]*)/);
  return m ? m[1] : null;
}

/** The whole `<main …>` opening tag in scrubbed source. */
function mainOpenTag(code) {
  const m = code.match(/<main\b[^>]*>/);
  return m ? m[0] : null;
}

const MOUNTS = [
  { file: 'src/app/page.jsx', root: '<>' },
  { file: 'src/app/(public)/layout.jsx', root: '<div[^>]*>' },
  { file: 'src/app/not-found.jsx', root: '<>' },
];

// ── The component ───────────────────────────────────────────────────────────

test('SkipLink is one anchor to #main with the Thai label', () => {
  const html = renderToStaticMarkup(createElement(SkipLink));
  assert.match(html, /^<a href="#main" class="[^"]*">ข้ามไปยังเนื้อหา<\/a>$/);
});

test('SkipLink is visually hidden until focused, then a pinned 9e-action button above the header', () => {
  const html = renderToStaticMarkup(createElement(SkipLink));
  const cls = html.match(/class="([^"]*)"/)[1].split(/\s+/);
  for (const c of [
    'sr-only', 'focus:not-sr-only', 'focus:fixed', 'focus:left-4', 'focus:top-4',
    'focus:z-80', 'focus:bg-9e-action', 'focus:text-white', 'focus:rounded-9e-sm',
    'focus:ring-2',
  ]) {
    assert.ok(cls.includes(c), `missing ${c}`);
  }
  // Nothing visible unless focused: every class but sr-only is a focus: variant.
  assert.deepEqual(cls.filter((c) => !c.startsWith('focus:')), ['sr-only']);
});

test('SkipLink classes are one complete string literal (Tailwind scans text)', () => {
  const { code } = readSource('src/components/layout/SkipLink.jsx');
  assert.match(code, /className="[^"]+"/);
  assert.doesNotMatch(code, /className=\{/, 'className must not be an expression');
});

// ── Where it is mounted ─────────────────────────────────────────────────────

for (const { file, root } of MOUNTS) {
  test(`${file}: SkipLink is the FIRST element of the returned tree`, () => {
    const { code } = readSource(file);
    assert.equal(firstChildOfReturn(code, root), 'SkipLink');
  });

  test(`${file}: <main> is the target — id="main" and tabIndex={-1}, ring suppressed`, () => {
    const tag = mainOpenTag(readSource(file).code);
    assert.ok(tag, 'no <main> in the returned tree');
    assert.match(tag, /\bid="main"/);
    assert.match(tag, /\btabIndex=\{-1\}/);
    assert.match(tag, /\boutline-none\b/);
    assert.match(tag, /focus-visible:ring-0\b/);
    assert.match(tag, /focus-visible:ring-offset-0\b/);
  });

  test(`${file}: imports SkipLink from the one component`, () => {
    const { raw } = readSource(file);
    assert.match(raw, /^import \{ SkipLink \} from ['"]@\/components\/layout\/SkipLink['"];?$/m);
  });
}

test('the top bar comes AFTER the skip link in both page shells', () => {
  for (const file of ['src/app/page.jsx', 'src/app/(public)/layout.jsx']) {
    const { code } = readSource(file);
    const skip = code.indexOf('<SkipLink />');
    assert.ok(skip > 0 && skip < code.indexOf('<TopNotificationBar'), file);
  }
});

test('the 404 markup: the first focusable element is the skip link, and it targets main', () => {
  const html = renderToStaticMarkup(createElement(NotFound));
  assert.equal(firstFocusable(html)?.startsWith('<a href="#main"'), true, firstFocusable(html));
  assert.match(html, /<main id="main" tabindex="-1"/);
});

test('CONTROL: firstFocusable finds a bar link placed ahead of the skip link', () => {
  const bar = '<div><a href="https://x/register">สมัครเลย</a></div>';
  const html = bar + renderToStaticMarkup(createElement(SkipLink));
  assert.equal(firstFocusable(html), '<a href="https://x/register">');
  assert.equal(firstFocusable('<div tabindex="-1"></div><button>x</button>'), '<button>');
});

test('CONTROL: firstChildOfReturn reports what is really first', () => {
  assert.equal(firstChildOfReturn('return (\n  <>\n    { }\n    <TopNotificationBar />\n    <SkipLink />', '<>'), 'TopNotificationBar');
  assert.equal(firstChildOfReturn('return (\n  <div className="x">\n    <SkipLink />', '<div[^>]*>'), 'SkipLink');
});

test('not on /admin: nothing under src/app/admin mounts SkipLink', () => {
  const hits = walkSources('src/app/admin').filter((s) => s.code.includes('<SkipLink'));
  assert.deepEqual(hits.map((s) => s.rel), []);
});
