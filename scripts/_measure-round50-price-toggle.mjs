/**
 * ROUND 50 — the price toggle on `course_card`.
 *
 * THE LOAD-BEARING PROPERTY: a stored `course_card` with no `showPrice` key
 * renders BYTE-IDENTICALLY to HEAD. Round 39 hit exactly this when it added the
 * custom-colour modes and the same proof is required here, because this is the
 * first round in the arc to change a PUBLIC renderer. "Absent means on" is an
 * argument; this is the measurement.
 *
 * HEAD's two files are read out of git and written beside the current ones so
 * their relative/aliased imports resolve to the same modules — with ONE
 * rewrite: HEAD's section is re-pointed at HEAD's CourseCard, so the pair is
 * HEAD-calling-HEAD rather than HEAD-calling-the-new-one.
 *
 * ── THE CONTROLS, WHICH ARE THE POINT ─────────────────────────────────────
 * "0 differences" and "the comparison never ran" print the same number, so:
 *   CONTROL 1 — the corpus renders something. Byte counts are printed for every
 *               fixture; a corpus of empty strings would compare equal forever.
 *   CONTROL 2 — the comparison CAN report a difference. The SAME corpus is
 *               rendered with `showPrice: false`, and those pairs must DIFFER
 *               from HEAD. A run where both columns are zero is a broken
 *               harness, not a clean result.
 *   CONTROL 3 — the truthiness trap is REAL. The same card is drawn with a
 *               truthiness reading of an ABSENT key (the trap C names) and must
 *               come out DIFFERENT from HEAD — i.e. `!== false` is load-bearing
 *               and not decoration.
 *
 * READ-ONLY apart from two temp files it creates and removes under src/.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_measure-round50-price-toggle.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = process.cwd();
const BASE_REF = process.env.BASE_REF ?? 'HEAD';

const CARD_T = 'src/components/course/CourseCard.jsx';
const SECT_T = 'src/components/pageBuilder/sections/course_card.jsx';
const CARD_B = path.join(ROOT, 'src/components/course/_baseline_CourseCard.jsx');
const SECT_B = path.join(ROOT, 'src/components/pageBuilder/sections/_baseline_course_card.jsx');

const show = (p) => execFileSync('git', ['show', BASE_REF + ':' + p], { encoding: 'utf8' });
writeFileSync(CARD_B, show(CARD_T), 'utf8');
writeFileSync(
  SECT_B,
  // the ONE rewrite: HEAD's section must call HEAD's card, not the new one.
  show(SECT_T).replace('@/components/course/CourseCard', '@/components/course/_baseline_CourseCard'),
  'utf8',
);

let report;
try {
  const { CourseCardSection: Now } = await import('@/components/pageBuilder/sections/course_card');
  const { CourseCardSection: Then } = await import('@/components/pageBuilder/sections/_baseline_course_card');
  const { CourseCard: CardNow } = await import('@/components/course/CourseCard');
  const { CourseCard: CardThen } = await import('@/components/course/_baseline_CourseCard');

  /** The resolved course — the real MSDB shape the resolver hands the renderer. */
  const COURSE = {
    course_id: 'MSDB',
    course_name: 'Microsoft SQL Server Database Administration',
    course_price: 12900,
    course_trainingdays: 3,
    program: { program_name: 'Database', programiconurl: 'https://example.invalid/db.png' },
  };
  // A course with NO duration, so the price is the ONLY thing in the bottom row.
  const NO_DURATION = { ...COURSE, course_trainingdays: undefined, course_days: undefined };

  const draw = (C, props) => renderToStaticMarkup(createElement(C, props));
  const sect = (C, content, data) => draw(C, { content, style: {}, layout: {}, data });

  // ── the corpus: what an author can actually store ────────────────────────
  const FIXTURES = [
    { id: 'absent', content: { courseId: 'MSDB' }, data: COURSE },
    { id: 'on', content: { courseId: 'MSDB', showPrice: true }, data: COURSE },
    { id: 'off', content: { courseId: 'MSDB', showPrice: false }, data: COURSE },
    { id: 'staleCode', content: { courseId: 'ZZ-NO-SUCH' }, data: null },
    { id: 'emptyCode', content: { courseId: '' }, data: null },
    { id: 'absentNoDur', content: { courseId: 'MSDB' }, data: NO_DURATION },
    { id: 'offNoDur', content: { courseId: 'MSDB', showPrice: false }, data: NO_DURATION },
    // Stored junk: passthrough() lets a non-boolean through. Only a LITERAL
    // false may hide the price — everything else keeps the page as it was.
    { id: 'stringFalse', content: { courseId: 'MSDB', showPrice: 'false' }, data: COURSE },
    { id: 'zero', content: { courseId: 'MSDB', showPrice: 0 }, data: COURSE },
    { id: 'nullValue', content: { courseId: 'MSDB', showPrice: null }, data: COURSE },
  ];

  const renders = {};
  const differsFromHead = [];
  for (const f of FIXTURES) {
    const a = sect(Then, f.content, f.data);
    const b = sect(Now, f.content, f.data);
    renders[f.id] = {
      bytes: Buffer.byteLength(b, 'utf8'),
      headBytes: Buffer.byteLength(a, 'utf8'),
      identicalToHead: a === b,
      showsPrice: b.includes('12,900'),
    };
    if (a !== b) differsFromHead.push(f.id);
  }

  // ── B: the answer. Only a deliberate `false` may differ from HEAD. ────────
  const MUST_MATCH = ['absent', 'on', 'staleCode', 'emptyCode', 'absentNoDur',
                      'stringFalse', 'zero', 'nullValue'];
  const MUST_DIFFER = ['off', 'offNoDur'];

  // ── CONTROL 3: the truthiness trap is REAL ───────────────────────────────
  const trapAbsent = draw(CardNow, { course: COURSE, showPrice: Boolean(undefined) });
  const headCard = draw(CardThen, { course: COURSE });
  const safeAbsent = draw(CardNow, { course: COURSE, showPrice: undefined !== false });

  // ── H: is price-off ever indistinguishable from the empty render? ────────
  const emptyRender = sect(Now, { courseId: '' }, null);
  const emptyBytes = Buffer.byteLength(emptyRender, 'utf8');

  /**
   * §D.2's 84 bytes is the SECTION WRAPPER, not this component: the component
   * returns null and SectionRenderer still emits its <section><div>. So the
   * comparison H actually asks for has to be made THROUGH SectionRenderer,
   * which is the thing the public page renders.
   */
  const { SectionRenderer } = await import('@/components/pageBuilder/SectionRenderer');
  const wrapped = (content, data) => renderToStaticMarkup(createElement(SectionRenderer, {
    section: { id: 's1', type: 'course_card', enabled: true, content, settings: {}, layout: {}, style: {}, advanced: {} },
    depth: 0, path: null, resolvedData: data ? { s1: data } : null,
  }));
  const wrapStale = wrapped({ courseId: 'ZZ-NO-SUCH' }, null);
  const wrapOff = wrapped({ courseId: 'MSDB', showPrice: false }, COURSE);
  const wrapAbsent = wrapped({ courseId: 'MSDB' }, COURSE);
  const wrapOffNoDur = wrapped({ courseId: 'MSDB', showPrice: false }, NO_DURATION);
  const wrapOn = wrapped({ courseId: 'MSDB', showPrice: true }, COURSE);
  const B = (s) => Buffer.byteLength(s, 'utf8');

  report = {
    baseRef: BASE_REF,

    '── B: THE LOAD-BEARING PROPERTY ──': '',
    STORED_CARDS_DIFFERING_FROM_HEAD: differsFromHead.filter((id) => MUST_MATCH.includes(id)).length,
    mustMatchAllIdentical: MUST_MATCH.every((id) => renders[id].identicalToHead),
    unexpectedlyDiffering: differsFromHead.filter((id) => MUST_MATCH.includes(id)),
    perFixture: renders,

    '── CONTROL 1: the corpus renders something ──': '',
    smallestRender: Math.min(...FIXTURES.map((f) => renders[f.id].bytes)),
    largestRender: Math.max(...FIXTURES.map((f) => renders[f.id].bytes)),

    '── CONTROL 2: the comparison CAN report a difference ──': '',
    deliberateOff: MUST_DIFFER.map((id) => id + ':' + (renders[id].identicalToHead ? 'IDENTICAL(BAD)' : 'differs')),
    controlDiscriminates:
      MUST_DIFFER.every((id) => !renders[id].identicalToHead)
      && MUST_MATCH.every((id) => renders[id].identicalToHead),

    '── CONTROL 3: the truthiness trap C names is real ──': '',
    truthinessOnAbsentEqualsHead: trapAbsent === headCard,
    truthinessOnAbsentHidesPrice: !trapAbsent.includes('12,900'),
    notFalseOnAbsentEqualsHead: safeAbsent === headCard,

    '── H: price-off vs the empty render ──': '',
    emptyRenderBytes: emptyBytes,
    emptyRenderIsEmptyString: emptyRender === '',
    offRenderBytes: renders.off.bytes,
    offNoDurationRenderBytes: renders.offNoDur.bytes,
    offIsDistinguishableFromEmpty: renders.off.bytes !== emptyBytes,
    offNoDurIsDistinguishableFromEmpty: renders.offNoDur.bytes !== emptyBytes,

    '── H, THROUGH SectionRenderer — the surface §D.2 measured ──': '',
    wrapperStaleCodeBytes: B(wrapStale),
    wrapperPriceOffBytes: B(wrapOff),
    wrapperPriceAbsentBytes: B(wrapAbsent),
    wrapperPriceOnBytes: B(wrapOn),
    wrapperPriceOffNoDurationBytes: B(wrapOffNoDur),
    priceOffCanNeverLookLikeStaleCode: B(wrapOff) !== B(wrapStale) && B(wrapOffNoDur) !== B(wrapStale),
    priceCostsExactlyBytes: B(wrapAbsent) - B(wrapOff),
  };
} finally {
  rmSync(CARD_B, { force: true });
  rmSync(SECT_B, { force: true });
}

console.log(JSON.stringify(report, null, 2));
