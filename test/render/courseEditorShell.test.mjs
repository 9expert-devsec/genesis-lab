import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseForm } from '@/app/admin/courses/_components/CourseForm';

/**
 * The course EDIT screen's shape: left column, sticky rail, one save.
 *
 * ── WHY THESE THREE CLAIMS AND NOT A SNAPSHOT ───────────────────────────────
 * The request was not "make it look like the article editor" — it was that the
 * publish control stop being something you scroll to find. So the assertions
 * are about reachability and placement, which is what can regress silently
 * while every field still renders somewhere on the page.
 *
 * REACHABILITY IS STRUCTURAL, NOT VISUAL. The header is not `position: sticky`;
 * it is a `flex-shrink-0` child of a `h-[100dvh] flex-col` root, so the PAGE
 * never scrolls and the columns do. That is the article editor's shape and it
 * is the reason the control cannot scroll away — a sticky header inside a
 * scrolling document still leaves on a short viewport. Asserting the root and
 * the header's non-scrolling class is therefore asserting the actual mechanism.
 *
 * The create page is NOT covered here beyond one control: it keeps the linear
 * layout this round, and proving it did NOT acquire a rail is the point.
 */

const COURSE = {
  _id: '692d39b52ee07293c9131fd8',
  course_id: 'COPILOT-STU',
  course_name: 'AI Agents with Microsoft Copilot Studio',
  course_price: 7500,
  course_trainingdays: 1,
  course_type_public: true,
  course_type_inhouse: true,
  website_urls: ['https://www.9experttraining.com/copilot-studio-training-course'],
};

const EXTENSION = {
  courseId: 'COPILOT-STU',
  urlAlias: '/copilot-studio-training-course',
  metaTitle: 'Copilot Studio',
  metaDescription: 'desc',
  ogImage: '',
  tags: ['AI', 'Copilot'],
  gallery: [{ type: 'youtube', videoId: 'dQw4w9WgXcQ', alt: '', order: 0 }],
  isPublished: true,
  omisePaymentEnabled: true,
};

const renderEdit = (extension = EXTENSION) =>
  renderToStaticMarkup(
    createElement(CourseForm, {
      mode: 'edit',
      initial: COURSE,
      skills: [],
      programs: [{ _id: 'p1', program_name: 'Data' }],
      allCourses: [COURSE],
      extension,
    })
  );

const renderCreate = () =>
  renderToStaticMarkup(
    createElement(CourseForm, { mode: 'create', skills: [], programs: [], allCourses: [] })
  );

/** Everything before the body row — i.e. the header region. */
const headerOf = (html) => html.slice(0, html.indexOf('<div class="flex min-h-0 flex-1">'));
/** The right rail. */
const railOf = (html) => {
  const i = html.indexOf('<aside');
  return i === -1 ? '' : html.slice(i);
};

// ── the publish control is in the header, not behind a scroll ───────────────

test('the page itself does not scroll — the columns do', () => {
  // The mechanism behind "reachable without scrolling". If the root stops being
  // a fixed-height flex column, the header starts scrolling away and every
  // other assertion here would still pass.
  const html = renderEdit();
  assert.match(html, /class="flex h-\[100dvh\] flex-col/, 'the root is no longer a fixed-height column');
  assert.match(html, /<header class="flex-shrink-0/, 'the header can now shrink or scroll');
});

test('the publish control is in the header', () => {
  const header = headerOf(renderEdit());
  assert.match(header, /role="switch"/, 'no publish switch in the header');
  assert.match(header, /aria-checked="true"/, 'the switch does not reflect isPublished');
  assert.match(header, /aria-label="เผยแพร่บนเว็บสาธารณะ"/);
});

test('the save button and ดูหน้าจริง are in the header too', () => {
  const header = headerOf(renderEdit());
  assert.match(header, /<button type="submit"[^>]*>บันทึก<\/button>/, 'the save button left the header');
  assert.match(header, /ดูหน้าจริง/);
});

test('the header carries a status badge and the link to the other four editors', () => {
  const header = headerOf(renderEdit());
  assert.match(header, /เผยแพร่|ซ่อน/, 'no status badge');
  // The courses list lost its SEO/Gallery button, so this is the ONLY way into
  // promos / Early Bird / FAQ / payment. Without it they are unreachable.
  assert.match(
    header,
    /href="\/admin\/courses\/COPILOT-STU"/,
    'the four remaining editors have no entry point anywhere'
  );
});

test('CONTROL: the publish switch reflects an unpublished course', () => {
  // Proves the aria-checked assertion above reads the value rather than a
  // constant — otherwise a hard-wired `aria-checked="true"` would satisfy it.
  const header = headerOf(renderEdit({ ...EXTENSION, isPublished: false }));
  assert.match(header, /aria-checked="false"/);
  assert.match(header, /ซ่อน/);
});

// ── the rail ────────────────────────────────────────────────────────────────

test('the rail holds URL Alias', () => {
  const rail = railOf(renderEdit());
  assert.ok(rail, 'there is no rail');
  assert.match(rail, /URL Alias/);
});

test('the rail holds the rest of the SEO fields and the alias-resolution checkbox', () => {
  const rail = railOf(renderEdit());
  for (const label of ['Meta Title', 'Meta Description', 'OG Image URL', 'Tags']) {
    assert.match(rail, new RegExp(label), `${label} is not in the rail`);
  }
  assert.match(rail, /แสดงผลในเว็บสาธารณะ/, 'the alias-resolution checkbox is not in the rail');
});

test('website_urls has no input anywhere — section 8 is gone', () => {
  // Retired from the admin entirely. The DATA survives: shapePayload omits the
  // key, so MSDB keeps its stored arrays and both public readers still resolve.
  // What an input here would mean is an editor that silently saves nothing.
  assert.doesNotMatch(renderEdit(), /name="website_urls"/);
  assert.doesNotMatch(renderCreate(), /name="website_urls"/, 'the create page still edits it');
});

// ── the gallery is the only tabbed region ───────────────────────────────────

test('the gallery is the only tabbed region', () => {
  const html = renderEdit();
  assert.match(html, /Gallery \(1\)/, 'no gallery tab, or it does not count its items');
  assert.match(html, /เนื้อหาหลักสูตร/, 'no content tab to switch back to');
  // Exactly two tab buttons: the content column and the gallery. Any third is a
  // tab this screen was explicitly not supposed to grow.
  const tabs = html.match(/class="border-b-2 px-4 py-2 text-sm font-medium/g) ?? [];
  assert.equal(tabs.length, 2, `expected exactly 2 tabs, found ${tabs.length}`);
});

test('the course body stays MOUNTED behind the gallery tab', () => {
  // THE data-loss guard. `new FormData(form)` reads the DOM, so rendering the
  // body away while the Gallery tab is open would drop every course field from
  // the payload — shapePayload would send empty strings and zeroes for the
  // whole course. The tab must hide with CSS, never unmount.
  const html = renderEdit();
  assert.match(html, /name="course_name"/, 'the course body is not in the DOM');
  assert.match(
    html,
    /class="(hidden|space-y-6)">/,
    'the tab panels are not CSS-hidden — check they are not conditionally rendered'
  );
});

// ── the filter rides on both ← controls ─────────────────────────────────────

test('both header links carry the list filter when there is one', () => {
  const html = renderToStaticMarkup(
    createElement(CourseForm, {
      mode: 'edit',
      initial: COURSE,
      skills: [],
      programs: [],
      allCourses: [COURSE],
      extension: EXTENSION,
      listQuery: 'q=excel&type=inhouse',
    })
  );
  assert.match(html, /href="\/admin\/courses\?q=excel&amp;type=inhouse"/, 'the ← list link drops the filter');
  assert.match(
    html,
    /href="\/admin\/courses\/COPILOT-STU\?q=excel&amp;type=inhouse"/,
    'the promos/FAQ link drops the filter, so ITS back link cannot restore it'
  );
});

test('CONTROL: with no filter the links carry no trailing "?"', () => {
  // The common case. A bare `?` on every back link is the tell that the empty
  // filter is being appended rather than skipped.
  const html = renderEdit();
  assert.match(html, /href="\/admin\/courses"/);
  assert.match(html, /href="\/admin\/courses\/COPILOT-STU"/);
  assert.doesNotMatch(html, /href="\/admin\/courses\?"/);
});

// ── the create page is untouched this round ─────────────────────────────────

test('the create page renders the SAME shell as the editor', () => {
  // INVERTED DELIBERATELY. This was a control asserting the create page had NOT
  // acquired a rail or a header, which was right while `new` used a linear
  // layout. Layout parity is now the requirement, so the old assertion was
  // pinning exactly what had to change; it is rewritten rather than deleted so
  // the reversal is on the record.
  const html = renderCreate();
  assert.match(html, /<aside/, 'the create page has no rail');
  assert.match(html, /class="flex h-\[100dvh\] flex-col/, 'the create page is not the shell');
  assert.match(html, /<header class="flex-shrink-0/, 'the create page has no fixed header');
  assert.match(html, /สร้างหลักสูตรใหม่/);
  // Section 8 is gone from BOTH layouts. shapePayload is shared, so leaving the
  // input here while the payload drops the key would give the create page an
  // editor that silently saves nothing.
  assert.doesNotMatch(html, /name="website_urls"/);
  // The control that this control is not vacuous: the create page still edits
  // the fields it always did.
  assert.match(html, /name="course_name"/);
});
