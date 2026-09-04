import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites } from '../sourceScan.mjs';
import { courseLinkHref } from '@/lib/courses/courseLinkHref';

/**
 * The wiring the pure tier cannot reach: the catch-all route is an async Server
 * Component that awaits network I/O before rendering, and its ORDER — public
 * answer first, preview arm only on a null — is what keeps every published
 * course, custom page and builder page from paying for a feature that concerns
 * none of them.
 *
 * That ordering was originally justified here by Next's full-route cache. It
 * was wrong: `next build` reports `/[...slug]` as ƒ (Dynamic), at c5f4ad6 as
 * well as at HEAD, because it is a catch-all with no generateStaticParams whose
 * metadata already awaits searchParams. The saving is per-request work — a
 * session read on the site's entire public URL space — not a cached render.
 *
 * The GATE itself (no session → no course) is tested behaviourally in
 * test/pure/hiddenCoursePreviewGate. Nothing here is a substitute for that; a
 * guard asserting "the source calls auth" is not the claim that matters.
 */

const ROUTE = 'src/app/(public)/[...slug]/page.jsx';

test('the public resolver runs FIRST and the preview arm only on its null', () => {
  // Reversed, every request to this route would read the session. Written as a
  // `??` so there is no second code path to keep in step, and so a published
  // course's request does what it did before this existed.
  const { code } = readSource(ROUTE);
  assert.match(code, /const publicResolved = await resolveCourse\(segment\);/);
  assert.match(
    code,
    /publicResolved \?\?\s*\(await resolveHiddenCourseForAdmin\(segment, searchParams\)\)/
  );
});

test('the route delegates the gate rather than re-implementing it', () => {
  // A page file can export nothing but Next's own contract, so a gate written
  // inline here could only ever be checked by grep. It must stay a call.
  const { code, withImports } = readSource(ROUTE);
  assert.match(withImports, /import \{ resolveHiddenCourseForAdmin \} from '@\/lib\/courses\/adminCoursePreview'/);
  assert.equal(countCallSites(code, 'resolveHiddenCourseForAdmin'), 1);
  assert.ok(!code.includes('auth()'), 'the route never reads the session itself');
});

test('the preview render suppresses Course and BreadcrumbList JSON-LD', () => {
  /**
   * A hidden course is one an admin has taken off the site. Emitting
   * structured data for it publishes machine-readable claims about a page that
   * officially does not exist — and unlike the page itself, JSON-LD is what
   * gets consumed by things that do not respect a 404 they never received.
   */
  // Sliced on the arms' delimiters rather than matched with one regex: the
  // public arm contains `)}` of its own (the `courseJsonLd && (…)` guard), so a
  // lazy group would stop inside it and "no breadcrumb JSON-LD" would pass on
  // a truncated string.
  const { code } = readSource(ROUTE);
  const start = code.indexOf('isHiddenPreview ? (');
  assert.ok(start > -1, 'the preview branch is where it is expected');
  const split = code.indexOf(') : (', start);
  const end = code.indexOf('<CourseDetail', split);
  assert.ok(split > start && end > split, 'both arms are delimited');
  const previewArm = code.slice(start, split);
  const publicArm = code.slice(split, end);
  assert.ok(!previewArm.includes('application/ld+json'), 'no structured data on a preview');
  assert.match(publicArm, /courseJsonLd/, 'and the public arm still emits it');
  assert.match(publicArm, /breadcrumbJsonLd/);
});

test('the preview banner is rendered OUTSIDE the course article', () => {
  // Same rule the builder-page preview banner follows: nothing in the rendered
  // page can style away the notice that it is not published. `CourseDetail`
  // opens the <article>, so the banner preceding that call site is the check.
  const { code } = readSource(ROUTE);
  const bannerAt = code.indexOf('เฉพาะผู้ดูแลระบบ');
  const detailAt = code.indexOf('<CourseDetail');
  assert.ok(bannerAt > -1, 'the banner text is there');
  assert.ok(detailAt > -1 && bannerAt < detailAt, 'and it precedes the course render');
});

test('CONTROL: the banner text is the hidden-COURSE one, not the builder page copy', () => {
  // Both strings end in เฉพาะผู้ดูแลระบบ, so a copy-paste of the custom-page
  // banner would satisfy the test above while telling the admin the wrong thing.
  const { code } = readSource(ROUTE);
  assert.match(code, /ตัวอย่างหลักสูตรที่ซ่อนอยู่/);
});

test('isHiddenPreview is derived from the resolution, not from the query string', () => {
  // If the banner keyed off `?preview=1` instead, an admin adding the parameter
  // to a PUBLISHED course's URL would see a "not published" banner on a live
  // page — and, worse, the JSON-LD suppression above would follow it.
  const { code } = readSource(ROUTE);
  assert.match(code, /const isHiddenPreview = publicResolved === null;/);
});

// ── the admin affordance ───────────────────────────────────────────────────

const FORM = 'src/app/admin/courses/_components/CourseForm.jsx';

test('the Preview button appends ?preview=1 only while the course is hidden', () => {
  const { code } = readSource(FORM);
  assert.match(
    code,
    /const previewHref = isPublished \? previewPath : `\$\{previewPath\}\?preview=1`;/
  );
});

test('Preview still opens the course’s REAL public URL, both shapes', () => {
  // The alias when there is one, the derived legacy path when there is not.
  // A preview that opened some other URL would not be a preview of the page.
  //
  // ── THE TWO BRANCHES MOVED INTO THE SHARED HELPER (ROUND U3) ─────────────
  // This used to pin the form's own copy of the rule: a ternary on
  // `urlAlias.trim()` that stripped a leading slash and re-added one, else a
  // template building `/<code>-training-course`. Both branches now live in
  // `courseCanonicalPath`, which every public link, the canonical tag, the
  // JSON-LD and the sitemap also use — so the admin's preview and the page the
  // site actually publishes cannot name different URLs any more.
  //
  // The CLAIM is unchanged and is what the test name still says. What it
  // asserts is now the delegation plus the behaviour, rather than a copy of
  // the rule.
  const { code, withImports } = readSource(FORM);
  assert.match(withImports, /import \{ courseLinkHref \}/, 'the form lost the shared helper');
  assert.match(code, /const previewPath = courseLinkHref\(\{ course_id: courseId, urlAlias \}\)/,
    'the form builds its own preview path again');
  assert.match(code, /href=\{previewHref\}/);

  // Both shapes, behaviourally, against the same function the form calls.
  assert.equal(courseLinkHref({ course_id: 'DA-PBI', urlAlias: '/pretty-course' }), '/pretty-course');
  assert.equal(courseLinkHref({ course_id: 'DA-PBI', urlAlias: '' }), '/da-pbi-training-course');
  // …and the leading-slash strip the old copy needed is not needed here: the
  // helper never prepends, so a stored `/pretty` cannot become `//pretty`.
  assert.ok(!courseLinkHref({ course_id: 'DA-PBI', urlAlias: '/pretty' }).startsWith('//'));
});

// ── the second half of the original defect ─────────────────────────────────

test('resolveCourse gates EVERY url shape on isPublished', () => {
  /**
   * The alias path always had the check. The derived
   * /<code>-training-course path had NONE, so un-publishing stopped one of a
   * course's two public URLs and left the other serving the whole page. Pinned
   * in source as well as behaviour because the checks are in different
   * branches and it is the second one that was missing for a long time.
   *
   * ROUND U4.2 ADDED A THIRD URL SHAPE — a FORMER alias — and with it a third
   * gate. It is not a branch nobody reasoned about: an unpublished course must
   * 404 at every URL that reaches it, and a former alias is one of those. A
   * course hidden after a rename would otherwise stay fully readable at its old
   * address, which is the original defect reached by a newer route.
   */
  const { code } = readSource('src/lib/resolveCourse.js');
  assert.match(code, /if \(byAlias && \(includeHidden \|\| byAlias\.isPublished !== false\)\)/);
  assert.match(code, /if \(byFormer && \(includeHidden \|\| byFormer\.isPublished !== false\)\)/);
  assert.match(code, /if \(!includeHidden && extension\?\.isPublished === false\) return null;/);
});

test('CONTROL: the gates read isPublished, one per URL shape and no more', () => {
  // A FOURTH would mean a branch nobody has reasoned about; fewer than three
  // would mean this regressed towards the shape a round started from.
  //
  // The expected count is derived from the URL shapes rather than written as a
  // bare number, so that adding a shape without its gate cannot be made to pass
  // by editing one digit.
  const { code } = readSource('src/lib/resolveCourse.js');
  const SHAPES = ['a current alias', 'a former alias', 'a derived code path'];
  const hits = code.match(/isPublished/g) ?? [];
  assert.equal(hits.length, SHAPES.length,
    `one gate per URL shape — resolveCourse resolves ${SHAPES.join(', ')}, and an `
    + 'unpublished course must 404 at every one of them');
});
