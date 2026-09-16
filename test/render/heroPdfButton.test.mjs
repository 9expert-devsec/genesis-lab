import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { HeroPdfButton } from '@/components/ui/HeroPdfButton';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
/**
 * Source with comments stripped.
 *
 * Needed because the round's own comments QUOTE the copy they deleted — the
 * note in HeroSearch explains what "ไฟล์ PDF · ขนาดประมาณ 44.6 MB" was and why
 * it went. A raw-source probe reads that as the caption still being present,
 * which is the test failing on its own documentation.
 */
const code = (p) => read(p)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/**
 * The class combination that identifies THE PILL, not any rounded button.
 *
 * `hover:bg-9e-ice` alone is not distinctive: ScheduleClient uses it on an
 * unrelated 9x9 icon button. Matching on that would report drift that is not
 * there — and a probe that cries wolf gets deleted, taking the real guard with
 * it.
 */
const PILL_CLASSES = 'rounded-full bg-white px-6 py-3';

const HERO = 'src/app/(public)/training-course/_components/HeroSearch.jsx';
const LIST = 'src/app/(public)/training-course/_components/CourseListClient.jsx';
const SCHEDULE = 'src/app/(public)/schedule/_components/ScheduleClient.jsx';

const html = (el) => renderToStaticMarkup(el);

// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────
//
// Round TC-CAT deleted a whole section and moved one button into the hero,
// with the requirement that it match /schedule's button exactly. "Matches"
// decays the moment someone tunes one of the two, so the two pages now render
// the SAME component and these tests pin that — plus the deletions, which are
// otherwise invisible to any existing test (there were none on that section).

test('the button renders as a new-tab anchor with ONE glyph, before the label — the same row for every caller', () => {
  // Was "both glyphs — /schedule is unchanged": the document + download pair
  // was kept as the default for /schedule while the catalog buttons opted into
  // a single leading glyph. /schedule has followed, the pair has no caller,
  // and the `variant` prop is gone with it.
  const out = html(React.createElement(HeroPdfButton, { href: '/x.pdf' }, 'ดาวน์โหลด'));
  assert.match(out, /<a[^>]+href="\/x\.pdf"/);
  assert.match(out, /target="_blank"/);
  assert.match(out, /rel="noopener noreferrer"/);
  assert.equal((out.match(/<svg/g) ?? []).length, 1, 'exactly one glyph');
  assert.ok(out.indexOf('<svg') < out.indexOf('ดาวน์โหลด'), 'and it leads');
  assert.match(read(SCHEDULE), /<HeroPdfButton href=\{schedulePDF\.url\}>/, '/schedule renders the shared element with no variant');
  assert.doesNotMatch(read('src/components/ui/HeroPdfButton.jsx').replace(/\/\*[\s\S]*?\*\//g, ''), /variant|FileText/, 'no dead layout, no dead prop');
});

test('NO download attribute — the response headers decide, not the anchor', () => {
  const out = html(React.createElement(HeroPdfButton, { href: '/x.pdf' }, 'ก'));
  assert.equal(/\sdownload[\s=>]/.test(out), false);
});

test('the white-on-blue pill treatment is intact', () => {
  const out = html(React.createElement(HeroPdfButton, { href: '/x.pdf' }, 'ก'));
  for (const cls of [
    'rounded-full', 'bg-white', 'text-9e-action', 'hover:bg-9e-ice',
    'px-6', 'py-3', 'text-sm', 'font-medium', 'shadow-md', 'gap-2',
  ]) {
    assert.ok(out.includes(cls), `${cls} missing from the pill`);
  }
});

test('BOTH heroes render the shared component — neither re-spells the classes', () => {
  // The anti-drift claim, checked at both call sites.
  for (const f of [HERO, SCHEDULE]) {
    const src = read(f);
    assert.match(src, /<HeroPdfButton\b/, `${f} does not use HeroPdfButton`);
    assert.equal(
      src.includes(PILL_CLASSES), false,
      `${f} still spells the pill's classes itself — that is the drift this replaced`,
    );
  }
});

test('RENDERED: the hero itself emits the button, after the search input', async () => {
  /*
   * This is the strongest available proof of placement, and it exists because
   * the usual one is unavailable: /training-course has a loading.jsx, so its
   * prerendered AND served initial HTML are the Suspense skeleton
   * (`animate-pulse`) with the body streamed afterwards. Grepping the built
   * page for the button finds nothing — including the search input that has
   * always been there — so a built-HTML check would prove nothing either way.
   *
   * Rendering the hero component directly sidesteps that: it asserts the real
   * emitted markup, not source order.
   */
  const { HeroSearch } = await import('@/app/(public)/training-course/_components/HeroSearch');
  const out = html(React.createElement(HeroSearch, { onDebouncedChange: () => {} }));

  assert.match(out, /placeholder="ค้นหาหลักสูตร"/, 'the search input is gone');
  assert.match(out, /href="\/9expert-training-course-catalog\.pdf"/, 'the button is not in the hero');
  assert.ok(
    out.indexOf('placeholder="ค้นหาหลักสูตร"') < out.indexOf('9expert-training-course-catalog.pdf'),
    'the button must render BELOW the search input',
  );
  // and inside the blue band, not after it
  assert.match(out, /bg-9e-gradient-hero/);
  assert.equal(out.includes('44.6'), false, 'the size caption came along for the ride');
});

test('the catalog button sits in the HERO, not after the results grid', () => {
  const hero = read(HERO);
  // The label is the SHARED constant, not a literal: /training-course used to
  // spell its own ดาวน์โหลดแคตตาล็อกหลักสูตร while the program and skill pages
  // said ดาวน์โหลดแคตตาล็อก; all three now read CATALOG_DOWNLOAD_LABEL.
  assert.match(hero, />\s*\{CATALOG_DOWNLOAD_LABEL\}\s*</);
  assert.match(hero, /import \{ CATALOG_DOWNLOAD_LABEL \} from '@\/lib\/pageCatalog'/);
  assert.equal(hero.includes('ดาวน์โหลดแคตตาล็อกหลักสูตร'), false, 'the old literal is still spelled in the hero');
  assert.match(hero, /href="\/9expert-training-course-catalog\.pdf"/);
  // and it is BELOW the search input in source order
  assert.ok(
    hero.indexOf('placeholder="ค้นหาหลักสูตร"') < hero.indexOf('HeroPdfButton href'),
    'the button must come after the search input',
  );
});

test('THE DELETED SECTION IS GONE — heading, description and size caption', () => {
  const list = code(LIST);
  for (const gone of ['CatalogDownload', 'แคตตาล็อกหลักสูตรทั้งหมด', '44.6']) {
    assert.equal(list.includes(gone), false, `CourseListClient still references ${gone}`);
  }
  // and the component file itself no longer exists
  assert.throws(
    () => read('src/app/(public)/training-course/_components/CatalogDownload.jsx'),
    'CatalogDownload.jsx was not deleted',
  );
});

test('the size caption survives nowhere on this route', () => {
  for (const f of [HERO, LIST]) {
    const src = code(f);
    assert.equal(src.includes('ขนาดประมาณ'), false, `${f} still carries the size caption`);
    assert.equal(src.includes('เปิดในแท็บใหม่'), false, `${f} still carries the new-tab caption`);
  }
});

test('/about-us keeps ITS caption — the deletion was scoped to this route', () => {
  // CompanyProfileSection makes the same three choices and was not in scope.
  // If this goes red, the round reached further than it was asked to.
  const about = read('src/components/about/CompanyProfileSection.jsx');
  assert.ok(about.includes('ขนาดประมาณ 22 MB'));
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the download-attribute probe fires on an anchor that has one', () => {
  assert.equal(/\sdownload[\s=>]/.test('<a href="/x.pdf" download>x</a>'), true);
});

test('CONTROL: the drift probe fires on a file that re-spells the pill', () => {
  const respelled = 'className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm"';
  assert.equal(respelled.includes(PILL_CLASSES), true);
  // …and does NOT fire on the unrelated icon button that shares one class.
  const iconButton = 'className="inline-flex h-9 w-9 rounded-full hover:bg-9e-ice"';
  assert.equal(iconButton.includes(PILL_CLASSES), false);
});

test('CONTROL: the label matcher needs the element boundary, not a substring', () => {
  // The subject is now the constant's JSX expression rather than a Thai
  // literal; the boundary rule is the same — a mention in a comment or an
  // import line must not satisfy "the hero renders it".
  assert.equal(/>\s*\{CATALOG_DOWNLOAD_LABEL\}\s*</.test('{CATALOG_DOWNLOAD_LABEL}'), false);
  assert.equal(/>\s*\{CATALOG_DOWNLOAD_LABEL\}\s*</.test("import { CATALOG_DOWNLOAD_LABEL } from '@/lib/pageCatalog'"), false);
  assert.equal(/>\s*\{CATALOG_DOWNLOAD_LABEL\}\s*</.test('<HeroPdfButton href="/x.pdf">\n  {CATALOG_DOWNLOAD_LABEL}\n</HeroPdfButton>'), true);
});

test('CONTROL: the comment stripper actually removes a quoted caption', () => {
  // If this ever fails, the two probes above are reading raw source again and
  // would pass even with the caption rendered.
  const withComment = read(HERO);
  assert.ok(withComment.includes('ขนาดประมาณ'), 'the explanatory comment quoting it is gone');
  assert.equal(code(HERO).includes('ขนาดประมาณ'), false, 'the stripper did not strip it');
});
