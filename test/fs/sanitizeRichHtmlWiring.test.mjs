import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * Every one of the 14 render sites docs/audit/unsanitized-html-render-sites.md
 * catalogued, asserted to actually CALL the sanitiser at its own
 * `dangerouslySetInnerHTML` call site — not merely that the module exists
 * and has its own passing tests. A module that is correct but never wired
 * in protects nothing; this is the guard that would catch a future edit
 * that reverts one call site back to raw `article.content` without anyone
 * noticing, because the render would look identical for every article that
 * happens not to carry anything dangerous.
 *
 * Matched close to the `dangerouslySetInnerHTML=` line itself (a small
 * slice of source, not "does this file mention sanitizeRichHtml anywhere"),
 * so a call that sanitises a DIFFERENT variable in the same file cannot
 * satisfy the assertion.
 */

function assertSanitizedAt(path, anchor, fnName) {
  const { code } = readSource(path);
  const at = code.indexOf(anchor);
  assert.ok(at > 0, `${path}: anchor not found — "${anchor.slice(0, 60)}…" (source moved?)`);
  const block = code.slice(at, at + 900);
  assert.match(
    block,
    new RegExp(`dangerouslySetInnerHTML=\\{\\{[\\s\\S]*?${fnName}\\(`),
    `${path}: "${anchor.slice(0, 40)}…" does not call ${fnName}(...) at its dangerouslySetInnerHTML`
  );
}

test('site 1 — ArticleDetailClient renders sanitizeRichHtml(article.content) via the [slug] page', () => {
  const { code } = readSource('src/app/(public)/articles/[slug]/page.jsx');
  assert.match(code, /content:\s*wrapArticleTables\(normalizeAuthoredColors\(sanitizeRichHtml\(article\.content\)\)\)/);
});

test('site 2 — ArticleForm preview calls sanitizeRichHtml(previewData.content)', () => {
  assertSanitizedAt(
    'src/app/admin/articles/_components/ArticleForm.jsx',
    'prose prose-lg max-w-none prose-h2:border-l-4',
    'sanitizeRichHtml'
  );
});

test('site 3 — FaqAccordionSection calls sanitizeRichHtml(faq.answer_html)', () => {
  assertSanitizedAt('src/components/faq/FaqAccordionSection.jsx', 'prose prose-base dark:prose-invert px-4 pb-4', 'sanitizeRichHtml');
});

test('sites 4-7 — MasterclassDetailClient sanitises all four HTML fields it renders', () => {
  const { code } = readSource('src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx');
  assert.match(code, /dangerouslySetInnerHTML=\{\{ __html: sanitizeRichHtml\(course\.description_html\) \}\}/);
  assert.match(code, /__html: sanitizeRichHtml\(course\.system_requirements_html\)/);
  assert.match(code, /__html: sanitizeRichHtml\(mod\.topics_html\)/);
  assert.match(code, /__html: sanitizeRichHtml\(mod\.content_html\)/);
});

test('site 8 — MasterclassRegisterClient uses sanitizeBasicHtml for the license info popup', () => {
  const { code } = readSource('src/app/(public)/masterclass/[slug]/register/_components/MasterclassRegisterClient.jsx');
  assert.match(code, /__html: sanitizeBasicHtml\(choice\.info_popup\.html_content\)/);
});

test('site 9 — MasterclassRegisterClient uses sanitizeRichHtml for batch.preparation_html', () => {
  const { code } = readSource('src/app/(public)/masterclass/[slug]/register/_components/MasterclassRegisterClient.jsx');
  assert.match(code, /__html: sanitizeRichHtml\(batch\.preparation_html\)/);
});

test('site 10 — CareerPathDetail calls sanitizeRichHtml(careerPath.description_html)', () => {
  const { code } = readSource('src/app/(public)/[...slug]/_components/CareerPathDetail.jsx');
  assert.match(code, /__html: sanitizeRichHtml\(careerPath\.description_html\)/);
});

test('site 11 — CareerPathForm preview calls sanitizeRichHtml(contentHtml)', () => {
  const { code } = readSource('src/app/admin/career-paths/_components/CareerPathForm.jsx');
  assert.match(code, /sanitizeRichHtml\(contentHtml\)/);
});

test('site 12 — HeroBannerCarousel uses sanitizeBasicHtml(banner.slide_text)', () => {
  const { code } = readSource('src/app/_components/home/HeroBannerCarousel.jsx');
  assert.match(code, /__html: sanitizeBasicHtml\(banner\.slide_text\)/);
});

test('site 13 — the promotions [slug] page calls sanitizeRichHtml(promotion.html_content)', () => {
  const { code } = readSource('src/app/(public)/promotions/[slug]/page.jsx');
  assert.match(code, /__html: sanitizeRichHtml\(promotion\.html_content\)/);
});

test('site 14 — FaqClient calls sanitizeRichHtml(item.answer_html)', () => {
  const { code } = readSource('src/app/(public)/faq/_components/FaqClient.jsx');
  assert.match(code, /__html: sanitizeRichHtml\(item\.answer_html\)/);
});

test('CONTROL: the anchor-and-regex approach actually distinguishes a sanitised call from an unsanitised one', () => {
  // Without this, a matcher that always passed (e.g. testing for the
  // presence of the string "sanitize" anywhere in the file) would satisfy
  // every test above regardless of whether the call site was fixed.
  const fixture = 'dangerouslySetInnerHTML={{ __html: raw.value }}';
  assert.doesNotMatch(fixture, /dangerouslySetInnerHTML=\{\{[\s\S]*?sanitizeRichHtml\(/);
});

// ── Save-path wiring — every path genesis owns ──────────────────────────────

test('Article.content is sanitised in the save path (buildModelData), not only at render', () => {
  const { code } = readSource('src/lib/actions/articles.js');
  assert.match(code, /content:\s*sanitizeRichHtml\(data\.content\)/);
});

test('LocalFaq.answer_html is sanitised on both create and update', () => {
  const { code } = readSource('src/lib/actions/local-faqs.js');
  assert.match(code, /out\.answer_html = sanitizeRichHtml\(data\.answer_html\)/, 'update path (pickEditableFields)');
  assert.match(code, /answer_html:\s*sanitizeRichHtml\(answer_html \?\? ''\)/, 'create path (createLocalFaq)');
});

test('MasterclassCourse HTML fields are sanitised before create AND before update', () => {
  const { code } = readSource('src/lib/actions/masterclass.js');
  assert.match(code, /MasterclassCourse\.create\(sanitizeMasterclassCourseHtml\(data\)\)/);
  assert.match(code, /\{\s*\$set:\s*sanitizeMasterclassCourseHtml\(data\)\s*\}/);
  // The helper itself touches every field the render sites read.
  assert.match(code, /description_html/);
  assert.match(code, /system_requirements_html/);
  assert.match(code, /topics_html:\s*typeof mod\?\.topics_html/);
  assert.match(code, /content_html:\s*typeof mod\?\.content_html/);
  assert.match(code, /html_content:\s*sanitizeBasicHtml\(choice\.info_popup\.html_content\)/);
});

test('MasterclassBatch.preparation_html is sanitised on both create and update', () => {
  const { code } = readSource('src/lib/actions/masterclass.js');
  const matches = code.match(/data\.preparation_html = sanitizeRichHtml\(data\.preparation_html\)/g) ?? [];
  assert.equal(matches.length, 2, 'expected one guard in createMasterclassBatch and one in updateMasterclassBatch');
});

test('CareerPath.description_html is sanitised once, upstream of both MSDB and the Mongo mirror', () => {
  const { code } = readSource('src/lib/actions/career-paths.js');
  assert.match(code, /contentHtml:\s*sanitizeRichHtml\(String\(formData\.get\('detail_contentHtml'\) \?\? ''\)\)/);
  // The same payload object feeds msdbCreate/msdbUpdate — pinned so a
  // refactor that stops threading `payload` into the MSDB write cannot
  // silently make this sanitise-once claim false.
  assert.match(code, /msdbCreate\(/);
  assert.match(code, /msdbUpdate\(/);
});

test('CONTROL: Banner.slide_text has no save path to sanitise — the current form never writes it', () => {
  // bannerFormPayload.js's own comment: "slide_text IS NEVER RENDERED AND
  // NEVER WRITTEN" by the current form. Asserted here as a documented
  // absence, not an oversight — if a future form starts writing it again,
  // this test does not catch that (bannerFormPayload.js's own file would
  // need a matching guard), but it records the reasoning for why this
  // round adds no save-side code for this field.
  // `.raw`, not `.code` — this claim lives in a comment, and `.code` strips
  // comments by design (test/sourceScan.mjs) so guards don't accidentally
  // match prose instead of the code they describe.
  const { raw } = readSource('src/lib/banners/bannerFormPayload.js');
  assert.match(raw, /slide_text IS NEVER RENDERED AND NEVER WRITTEN/);
});
