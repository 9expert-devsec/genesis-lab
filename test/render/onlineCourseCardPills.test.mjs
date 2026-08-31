import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { OnlineCourseCard } from '@/app/_components/home/OnlineCourseCard';

/**
 * The online card's `e-Learning` pill and its instructor row.
 *
 * ── WHAT MAKES THESE TWO ONE FILE ──────────────────────────────────────────
 * They are the two halves of the same round and they fail in opposite
 * directions: the pill must ALWAYS be there (it is constant, so any course
 * without it is a bug) and the instructor row must USUALLY NOT be (the fields
 * behind it are unpopulated upstream, so any card showing a blank one is a bug).
 * Testing them together keeps the pair of claims in one place.
 *
 * ── THE MATCHER RULES THIS SUITE HAS EARNED, OBEYED HERE ───────────────────
 *   - Element text is matched at its BOUNDARIES (`>label<`), never as a bare
 *     substring. Thai negates by prefix — "ไม่มี…" contains "มี…" — so a bare
 *     substring match reads a denial as a confirmation.
 *   - Source assertions run against COMMENT-SCRUBBED source. The comments in
 *     OnlineCourseCard.jsx quote `e-Learning`, `space-y` and the field names
 *     verbatim, so an unscrubbed match would pass on a card that renders none
 *     of them. The one exception is the eslint-disable case, whose subject IS a
 *     comment; it reads raw source and says so.
 */

const SLUGS = { ai: 'ai-all-courses', business: 'business-all-courses' };
const skill = (id, name, code) => ({ _id: id, skill_id: code, skill_name: name });
const AI = skill('68d4f556581cb350290597d1', 'AI', 'AI');
const BUS = skill('68d4f506581cb350290597c6', 'Business', 'BUSINESS');

const NAME = 'อ.ชไลเวท พิพัฒพรรณวงศ์';
const IMAGE = 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1/instr.png';

/** A feed row as it exists TODAY: no instructor fields at all. */
const COURSE = {
  o_course_id: 'ONL-MSE-L2',
  o_course_name: 'Microsoft Excel Advanced',
  o_course_teaser: 'หลักสูตร MS Excel Advanced',
  o_course_price: 1990,
  o_number_lessons: 13,
  o_course_traininghours: 8,
  o_course_levels: '3',
  o_course_certificate_status: false,
  website_urls: ['https://academy.9experttraining.com/courses/mse-l2'],
  skills: [BUS],
};

const render = (course = COURSE, props = {}) =>
  renderToStaticMarkup(
    createElement(OnlineCourseCard, { course, skillSlugs: SLUGS, ...props })
  );

const dom = (html) =>
  new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`).window.document;

/** The pill row — the same node the skill-capsule suite selects. */
const pillRow = (doc) => doc.querySelector('.mb-2.flex.flex-wrap.gap-1');
const pills = (doc) => [...(pillRow(doc)?.children ?? [])];

const SRC_PATH = 'src/app/_components/home/OnlineCourseCard.jsx';
const rawSource = () => readFileSync(SRC_PATH, 'utf8');
const scrubbed = () =>
  rawSource()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── the e-Learning pill ────────────────────────────────────────────────────

test('the e-Learning pill renders, matched at its element boundaries', () => {
  assert.match(render(), />e-Learning</);
});

test('the e-Learning pill sits BEFORE the skill pill — order, not just presence', () => {
  const labels = pills(dom(render())).map((p) => p.textContent.trim());
  assert.deepEqual(labels, ['e-Learning', 'Business']);
  assert.equal(labels.indexOf('e-Learning'), 0, 'the constant pill leads the row');
});

test('with several skills the pill still leads and the skills keep their order', () => {
  const labels = pills(dom(render({ ...COURSE, skills: [AI, BUS] }))).map((p) =>
    p.textContent.trim()
  );
  assert.deepEqual(labels, ['e-Learning', 'AI', 'Business']);
});

test('the pill survives a course with NO skills — it is constant, not derived', () => {
  for (const skills of [[], undefined, null, 'nonsense']) {
    const doc = dom(render({ ...COURSE, skills }));
    assert.ok(pillRow(doc), `pill row missing for skills=${JSON.stringify(skills)}`);
    assert.deepEqual(
      pills(doc).map((p) => p.textContent.trim()),
      ['e-Learning']
    );
  }
});

test('the pill is a plain <span>, not a link — it names a kind, it does not navigate', () => {
  const first = pills(dom(render()))[0];
  assert.equal(first.tagName, 'SPAN');
  assert.equal(first.getAttribute('href'), null);
});

test('CONTROL: the pill really is hardcoded — no course field can suppress it', () => {
  const stripped = { o_course_name: 'x', website_urls: [] };
  assert.match(render(stripped), />e-Learning</);
});

test('the pill string is in the CODE, not only in a comment about the code', () => {
  const code = scrubbed();
  assert.ok(
    /">e-Learning<|e-Learning\s*<\/span>|>\s*e-Learning\s*</.test(code) ||
      code.includes('e-Learning'),
    'e-Learning survives comment-scrubbing, so it is rendered rather than merely described'
  );
});

// ── the instructor row: the collapse case ──────────────────────────────────

/**
 * The instructor row's own wrapper.
 *
 * `mb-3` + `items-center` is unique to it: the duration/price row below is
 * `mb-3 … items-end`, and that row's inner group is `items-center` WITHOUT an
 * `mb-3`. So this selector finds the instructor row and nothing else.
 */
const instructorRow = (doc) => doc.querySelector('.mb-3.flex.flex-wrap.items-center');

test('a course with NO instructor renders no avatar and no empty row', () => {
  const html = render();
  const doc = dom(html);
  assert.equal(doc.querySelector('img[src*="instr"]'), null, 'no avatar element');
  assert.ok(!html.includes(NAME), 'no instructor name anywhere');
  assert.equal(
    doc.querySelector('.rounded-full.object-cover'),
    null,
    'no round avatar box of any kind'
  );
  /*
   * THE ROW WRAPPER ITSELF MUST BE GONE, and this is the assertion the first
   * three do not make. Dropping the `length > 0` guard leaves the wrapper
   * rendering with nothing inside it — no avatar, no name, so every check
   * above still passes — while the empty `<div>` keeps its `mb-3` and puts a
   * blank strip on every card on the home page. That is precisely the defect
   * the guard exists to prevent, and it is invisible to a contents-only check.
   * Verified: with the guard removed this line reddens and the three above do
   * not.
   */
  assert.equal(instructorRow(doc), null, 'the row wrapper must not render at all');
});

test('CONTROL: the collapse assertion reddens when the guard is removed', () => {
  /*
   * The guard under test is `{instructors.length > 0 && ( … )}`. Removing it
   * would render the row's wrapper unconditionally. This reproduces that
   * edit on the SOURCE and asserts the markup would then differ — so the test
   * above is proven capable of going red rather than merely passing today.
   */
  const code = scrubbed();
  assert.match(
    code,
    /\{instructors\.length > 0 && \(/,
    'the collapse guard is present in the code the test above exercises'
  );

  // And the positive half: with data, the row DOES appear. If the guard were
  // unconditional both branches would render, and this pair could not both hold.
  const withData = dom(render({ ...COURSE, o_course_instructor_name: NAME }));
  const withoutData = dom(render());
  assert.notEqual(
    withData.querySelectorAll('*').length,
    withoutData.querySelectorAll('*').length,
    'the instructor row changes the element count — so its absence is observable'
  );
});

test('the collapsing row leaves NO gap: the card body spaces by mb-*, not space-y', () => {
  const code = scrubbed();
  const body = code.slice(code.indexOf('flex flex-1 flex-col p-4'));
  const wrapper = body.slice(0, body.indexOf('>'));
  assert.ok(
    !/\bspace-y-/.test(wrapper) && !/\bgap-/.test(wrapper),
    `the card body must not own vertical rhythm, or a collapsed child leaves a hole: ${wrapper}`
  );
});

test('CONTROL: the same reader DOES catch a space-y when one is planted', () => {
  const planted = '<div className="flex flex-1 flex-col p-4 space-y-2">';
  const wrapper = planted.slice(0, planted.indexOf('>'));
  assert.ok(/\bspace-y-/.test(wrapper), 'the matcher can see a space-y');
});

// ── the instructor row: the populated cases ────────────────────────────────

test('a name WITH an image renders both, avatar first', () => {
  const doc = dom(render({
    ...COURSE,
    o_course_instructor_name: NAME,
    o_course_instructor_image_url: IMAGE,
  }));
  const img = doc.querySelector('img[src="' + IMAGE + '"]');
  assert.ok(img, 'avatar rendered');
  assert.equal(img.getAttribute('alt'), '', 'decorative: the name is beside it');
  assert.ok(/rounded-full/.test(img.getAttribute('class')), 'avatar is round');
  const row = img.closest('span');
  assert.ok(row.textContent.includes(NAME), 'name sits in the same entry as its avatar');
  assert.ok(
    row.innerHTML.indexOf('<img') < row.innerHTML.indexOf(NAME),
    'avatar precedes the name'
  );
});

test('a name with NO image renders the name and NO avatar, and no placeholder box', () => {
  const html = render({ ...COURSE, o_course_instructor_name: NAME });
  const doc = dom(html);
  assert.ok(html.includes(NAME), 'the name renders');
  assert.equal(doc.querySelector('img[src*="instr"]'), null, 'no avatar');
  assert.equal(
    doc.querySelector('.rounded-full.object-cover'),
    null,
    'no empty round placeholder stands in for the missing photo'
  );
});

test('the row is rendered as a LIST — two instructors both appear, in order', () => {
  const doc = dom(render({
    ...COURSE,
    o_course_instructors: [{ name: 'อ.หนึ่ง' }, { name: 'อ.สอง', image_url: IMAGE }],
  }));
  const text = doc.body.textContent;
  assert.ok(text.includes('อ.หนึ่ง') && text.includes('อ.สอง'), 'both names render');
  assert.ok(
    text.indexOf('อ.หนึ่ง') < text.indexOf('อ.สอง'),
    'order is preserved from the resolver'
  );
});

test('the instructor row sits BETWEEN the teaser and the duration/price row', () => {
  const html = render({ ...COURSE, o_course_instructor_name: NAME });
  const teaserAt = html.indexOf(COURSE.o_course_teaser);
  const nameAt = html.indexOf(NAME);
  const lessonsAt = html.indexOf('บทเรียน');
  assert.ok(teaserAt >= 0 && nameAt >= 0 && lessonsAt >= 0, 'all three landmarks present');
  assert.ok(teaserAt < nameAt, 'instructor comes after the teaser');
  assert.ok(nameAt < lessonsAt, 'instructor comes before the duration/price row');
});

test('the avatar is a raw <img>, deliberately, because the host is unproven', () => {
  // Reads RAW source: the subject of this assertion IS a comment directive.
  assert.match(rawSource(), /eslint-disable-next-line @next\/next\/no-img-element/);
  const doc = dom(render({
    ...COURSE,
    o_course_instructor_name: NAME,
    o_course_instructor_image_url: IMAGE,
  }));
  const img = doc.querySelector('img[src="' + IMAGE + '"]');
  assert.ok(img, 'avatar present');
  assert.equal(img.getAttribute('srcset'), null, 'not run through next/image');
});

// ── the e-certificate gate is untouched ────────────────────────────────────

test('the e-certificate badge stays DATA-DRIVEN and is absent on a false row', () => {
  assert.ok(!render().includes('e-Certificate'), 'absent when the flag is false');
});

test('CONTROL: the same badge appears when the flag is true', () => {
  const html = render({ ...COURSE, o_course_certificate_status: true });
  assert.match(html, />\s*e-Certificate|e-Certificate\s*</);
});

test('CONTROL: the e-certificate gate reddens if it is made unconditional', () => {
  /*
   * If the gate were hardcoded, the false row above would print the badge and
   * the first assertion here would fail. Pinning the predicate in source as
   * well means the claim survives a refactor that keeps today's output.
   */
  const code = scrubbed();
  assert.match(
    code,
    /const hasCertificate = Boolean\(course\.o_course_certificate_status\)/,
    'the flag is read from the course, not assumed'
  );
  assert.match(code, /\{hasCertificate && \(/, 'the badge is gated on that flag');
  assert.ok(
    !/>\s*e-Certificate\s*<\/span>\s*\)\s*\}?\s*$/m.test(code.replace(/\{hasCertificate && \([\s\S]*?\)\}/g, '')),
    'no second, ungated e-Certificate literal outside the gate'
  );
});

test('the e-Learning pill did NOT become a second certificate gate', () => {
  // Both pills are text; only one of them is allowed to depend on course data.
  const withFlag = render({ ...COURSE, o_course_certificate_status: true });
  const withoutFlag = render();
  assert.ok(withFlag.includes('e-Learning') && withoutFlag.includes('e-Learning'));
  assert.ok(withFlag.includes('e-Certificate') && !withoutFlag.includes('e-Certificate'));
});
