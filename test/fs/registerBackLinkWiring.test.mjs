import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseHref } from '@/lib/utils';

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

test('RegisterPageContent resolves the href through the shared courseHref', () => {
  assert.match(PAGE, /import \{ courseHref \} from '@\/lib\/utils'/);
  assert.match(
    PAGE,
    /const courseDetailHref = courseHref\(\s*course\.course_id \? String\(course\.course_id\)\.toLowerCase\(\) : ''\s*\)/,
    'the legacy lowercase-course_id slug, matching CourseCard'
  );
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

test('courseHref already returns the catalog for an empty slug', () => {
  // The instruction was to verify this rather than add a second guard in
  // RegisterPageContent. It holds, so there is no extra branch there.
  assert.equal(courseHref(''), '/training-course');
  assert.equal(courseHref(null), '/training-course');
  assert.equal(courseHref(undefined), '/training-course');
});

test('CONTROL: courseHref returns a real detail path for a real slug', () => {
  // Without this, the fallback test is satisfied by a function that returns
  // '/training-course' for everything.
  assert.equal(courseHref('da-pbi'), '/da-pbi-training-course');
  assert.notEqual(courseHref('da-pbi'), '/training-course');
});

test('courseHref is idempotent about the suffix, so a suffixed slug is safe', () => {
  assert.equal(courseHref('da-pbi-training-course'), '/da-pbi-training-course');
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
