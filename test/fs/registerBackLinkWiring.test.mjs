import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseLinkHref } from '@/lib/courses/courseLinkHref';
import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';

/**
 * RegisterPageContent resolves the step-1 back-link target and threads it to the
 * wizard. It is an async Server Component that awaits four network/DB calls
 * before rendering, so the render tier cannot reach it — the wiring is pinned at
 * source level, and the href-building rule it applies is pinned behaviourally
 * against the real `courseHref` below.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const PAGE = read('src/app/(public)/registration/public/RegisterPageContent.jsx');
const WIZARD = read('src/components/registration/RegisterWizard.jsx');

test('RegisterPageContent resolves the href through the shared courseLinkHref', () => {
  /**
   * ── THIS PINNED A DECISION THAT ROUND U3 REVERSED, ON ITS OWN TERMS ──────
   * It used to require `courseHref(<lowercased course_id>)` — the legacy slug,
   * deliberately NOT the alias. The page's own comment gave the reason, and
   * every clause of it was about what `courseHref` DOES TO an alias:
   *
   *     aliases are stored WITH a leading slash and are not required to carry
   *     the '-training-course' suffix, so courseHref would turn `/foo` into
   *     `//foo-training-course` — a URL resolveCourse cannot match.
   *
   * True, and no longer reachable. `courseLinkHref` performs no join; it
   * returns `courseCanonicalPath`'s answer, which already carries exactly one
   * leading slash. The decision was sound and its premise is gone, so the
   * back-link now goes where every other internal link goes: the alias when
   * there is one.
   *
   * `ext` was already being fetched for the Omise toggle, so this costs no
   * query.
   */
  assert.match(PAGE, /import \{ courseLinkHref \} from '@\/lib\/courses\/courseLinkHref'/);
  assert.match(
    PAGE,
    /const courseDetailHref = courseLinkHref\(\{\s*course_id: course\.course_id,\s*urlAlias: ext\?\.urlAlias,\s*\}\)/,
    'the back-link must pass BOTH the code and the alias — a code alone cannot '
    + 'produce the canonical URL',
  );
  assert.ok(!/courseHref\(/.test(PAGE.replace(/\/\/[^\n]*/g, '')),
    'the alias-blind helper is back on this page');
});

test('the back-link is the SAME path the course page declares canonical', () => {
  // The behavioural half, which the source match above cannot make. Compared
  // as a value against the shared rule, for both branches.
  for (const [code, alias, expected] of [
    ['VIBE-CODE-L1', '/pretty-course', '/pretty-course'],
    ['VIBE-CODE-L1', null, '/vibe-code-l1-training-course'],
    ['VIBE-CODE-L1', '', '/vibe-code-l1-training-course'],
    ['', null, '/training-course'],
  ]) {
    assert.equal(courseLinkHref({ course_id: code, urlAlias: alias }), expected);
    assert.equal(
      courseLinkHref({ course_id: code, urlAlias: alias }),
      courseCanonicalPath({ course_id: code }, { urlAlias: alias }) ?? '/training-course',
    );
  }
});

test('it threads the href to the wizard', () => {
  assert.match(PAGE, /courseDetailHref=\{courseDetailHref\}/);
});

test('the wizard accepts it and passes it to StepForm', () => {
  assert.match(WIZARD, /courseDetailHref = "\/training-course",/, 'defaulted, not undefined');
  assert.match(WIZARD, /courseDetailHref=\{courseDetailHref\}/, 'handed down to StepForm');
  assert.match(WIZARD, /href=\{courseDetailHref\}/, 'and consumed by the Link');
});

test('the back link is no longer nailed to the catalog', () => {
  // Anchored on the link's own label so an unrelated /training-course elsewhere
  // in the file (the two step-3 buttons) cannot make this vacuous.
  assert.ok(
    !/href="\/training-course"[\s\S]{0,200}?← กลับไปดูหลักสูตร/.test(WIZARD),
    'the back arrow must not carry a literal /training-course href'
  );
});

test('CONTROL: that probe DOES fire against the pre-fix markup', () => {
  // The exact shape the file had before. If this stops matching, the assertion
  // above is checking for something that could never appear and proves nothing.
  const before = `<Link
              href="/training-course"
              className="text-sm"
            >
              ← กลับไปดูหลักสูตร
            </Link>`;
  assert.ok(/href="\/training-course"[\s\S]{0,200}?← กลับไปดูหลักสูตร/.test(before));
});

// ── The fallback, verified rather than duplicated ───────────────────────────

test('the helper already returns the catalog for a nameless course', () => {
  // The instruction was to verify this rather than add a second guard in
  // RegisterPageContent. It held for `courseHref` and it holds for its
  // replacement, so there is still no extra branch on the page.
  assert.equal(courseLinkHref({ course_id: '' }), '/training-course');
  assert.equal(courseLinkHref(null), '/training-course');
  assert.equal(courseLinkHref(undefined), '/training-course');
});

test('CONTROL: the helper returns a real detail path for a real course', () => {
  // Without this, the fallback test is satisfied by a function that returns
  // '/training-course' for everything.
  assert.equal(courseLinkHref({ course_id: 'DA-PBI' }), '/da-pbi-training-course');
  assert.notEqual(courseLinkHref({ course_id: 'DA-PBI' }), '/training-course');
});

test('an alias that already carries the suffix is not double-suffixed', () => {
  // `courseHref` needed to be idempotent about '-training-course' because it
  // APPENDED one. courseLinkHref appends nothing, so the property holds by
  // construction — asserted anyway, because 79 of the 80 stored aliases end in
  // that suffix and a regression here would double it on almost every course.
  assert.equal(
    courseLinkHref({ course_id: 'DA-PBI', urlAlias: '/da-pbi-training-course' }),
    '/da-pbi-training-course',
  );
});

// ── Scope: the step-3 links are a different link ────────────────────────────

test('both step-3 "ดูคอร์สอื่นเพิ่มเติม" links still point at the catalog', () => {
  const links = [...WIZARD.matchAll(/<Link href="([^"]*)">ดูคอร์สอื่นเพิ่มเติม<\/Link>/g)];
  assert.equal(links.length, 2, 'one per StepComplete branch');
  for (const [, href] of links) assert.equal(href, '/training-course');
});

test('CONTROL: the step-3 probe is not just counting labels', () => {
  const mutated = WIZARD.replace(
    '<Link href="/training-course">ดูคอร์สอื่นเพิ่มเติม</Link>',
    '<Link href="/da-pbi-training-course">ดูคอร์สอื่นเพิ่มเติม</Link>'
  );
  const links = [...mutated.matchAll(/<Link href="([^"]*)">ดูคอร์สอื่นเพิ่มเติม<\/Link>/g)];
  assert.equal(links.length, 2, 'still two links');
  assert.ok(links.some(([, h]) => h !== '/training-course'), 'and the repointed one is seen');
});
