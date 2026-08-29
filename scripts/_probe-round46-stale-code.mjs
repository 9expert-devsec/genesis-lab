/**
 * ROUND 46 — what a stale course code actually does, driven rather than read.
 *
 * Three questions the picker's design turns on, and reading the source answers
 * none of them with the authority a picker needs:
 *
 *   1. a code that no longer resolves, in a LIST section — dropped? rendered
 *      empty? does the stored value survive?
 *   2. the same code in course_card, which resolves ONE reference
 *   3. array position — is it the only ordering authority, and does reversing
 *      the array reverse the render?
 *
 * So this drives the REAL resolver (live upstream + live Mongo, no data stubs —
 * see scripts/_probe-live-hooks.mjs) and then the REAL SectionRenderer, and
 * reports what came back and what was drawn.
 *
 * The fixture mixes a live code, that same code AGAIN (a duplicate), and a code
 * that cannot resolve. Duplicates and staleness are measured in ONE list on
 * purpose: they interact — the fetch de-dupes and the assemble maps positionally
 * — and a fixture with only one of them cannot show that.
 *
 * READ-ONLY. Run:
 *   node --env-file=.env.local --import ./scripts/_probe-live-register.mjs \
 *        scripts/_probe-round46-stale-code.mjs
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { listPublicCourses } = await import('@/lib/api/public-courses');
const { resolveSectionData } = await import('@/lib/pageBuilder/resolveSectionData');
const { SectionRenderer } = await import('@/components/pageBuilder/SectionRenderer');

// A code no course can own: upstream ids are uppercase-ish short codes, and this
// one carries a marker that could never be typed by accident.
const STALE = 'ZZ-ROUND46-NO-SUCH-COURSE';

const { items } = await listPublicCourses({ includeHidden: true });
const live = items.map((c) => c.course_id).filter(Boolean);
if (live.length < 3) {
  console.log('ABORT: upstream returned fewer than three courses — the fixture cannot be built.');
  process.exitCode = 1;
} else {
  const [A, B, C] = live;
  console.log('=== round 46 — stale code, duplicates and order, driven live ===\n');
  console.log(`  live codes used : A=${A}  B=${B}  C=${C}`);
  console.log(`  stale code      : ${STALE}\n`);

  /**
   * ── THE FIXTURE, AND THE FIRST VERSION OF IT THAT PROVED NOTHING ────────
   * THREE distinct live codes, not two, and the duplicate sits INSIDE the run
   * rather than at an end. The first version was [A, B, A, STALE]: drop the
   * stale code and [A, B, A] is a PALINDROME, so the reversed list resolved to
   * the identical sequence and the order check reported "reversing reverses
   * the render: true" while being unable to report anything else.
   * [A, B, A, C] reversed is [C, A, B, A], which is not the same list.
   */
  const AUTHORED = [A, B, A, C, STALE]; // live, live, DUPLICATE of A, live, stale
  const sections = [
    { id: 'sel', type: 'course_selector', enabled: true, content: { courseIds: [...AUTHORED] } },
    { id: 'lst', type: 'course_list', enabled: true, content: { source: 'manual', courseIds: [...AUTHORED] } },
    { id: 'bun', type: 'bundle_courses', enabled: true, content: { courseIds: [...AUTHORED] } },
    { id: 'card', type: 'course_card', enabled: true, content: { courseId: STALE } },
    { id: 'cardok', type: 'course_card', enabled: true, content: { courseId: A } },
    // Same four codes, reversed. Nothing else differs, so any difference in
    // what is drawn is attributable to array position and to nothing else.
    { id: 'rev', type: 'course_selector', enabled: true, content: { courseIds: [...AUTHORED].reverse() } },
  ];

  const before = JSON.stringify(sections);
  const resolved = await resolveSectionData(sections);
  const after = JSON.stringify(sections);

  // ── 1/2. what the resolver returned ─────────────────────────────────────
  console.log('-- what the resolver returned --');
  for (const s of sections) {
    const r = resolved[s.id];
    const shape = Array.isArray(r)
      ? `[${r.map((c) => c?.course_id ?? '?').join(', ')}]  (len ${r.length})`
      : r === null ? 'null' : String(r?.course_id ?? r);
    console.log(`  ${s.id.padEnd(7)} ${s.type.padEnd(17)} ${shape}`);
  }

  console.log('\n-- the AUTHORED array after resolving --');
  console.log(`  sections mutated by resolveSectionData : ${before === after ? 'NO' : 'YES'}`);
  console.log(`  sel.content.courseIds                  : ${JSON.stringify(sections[0].content.courseIds)}`);
  console.log(`  stale code still stored                : ${sections[0].content.courseIds.includes(STALE)}`);
  console.log(`  duplicate still stored                 : ${sections[0].content.courseIds.filter((c) => c === A).length} copies of ${A}`);

  // ── what the page actually DRAWS ────────────────────────────────────────
  const draw = (s) => renderToStaticMarkup(
    createElement(SectionRenderer, { section: s, depth: 0, path: null, resolvedData: resolved })
  );
  const countCode = (html, code) => (html.match(new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;

  console.log('\n-- what the PUBLIC render draws --');
  for (const s of sections) {
    const html = draw(s);
    console.log(`  ${s.id.padEnd(7)} ${String(html.length).padStart(6)} bytes   stale-code appears ${countCode(html, STALE)}x`);
  }

  // What a section that draws NOTHING costs, so every byte count above is
  // readable against a floor rather than in the abstract.
  const emptyWrapper = renderToStaticMarkup(
    createElement(SectionRenderer, {
      section: { id: 'x', type: 'course_selector', enabled: true, content: { courseIds: [] } },
      depth: 0, path: null, resolvedData: {},
    })
  );
  console.log(`\n  a section that draws NOTHING: ${emptyWrapper.length} bytes`);
  console.log(`  ${emptyWrapper}`);

  // ── 3. order ────────────────────────────────────────────────────────────
  const order = (id) => (resolved[id] ?? []).map((c) => c.course_id);
  console.log('\n-- order --');
  console.log(`  forward  sel : ${JSON.stringify(order('sel'))}`);
  console.log(`  reversed rev : ${JSON.stringify(order('rev'))}`);
  const fwd = order('sel');
  const rev = order('rev');
  console.log(`  reversing the array reverses the render : ${JSON.stringify(fwd) === JSON.stringify([...rev].reverse())}`);
  console.log(`  the two are NOT equal                   : ${JSON.stringify(fwd) !== JSON.stringify(rev)}`);

  // Does anything BUT array position order these? Compare against the upstream
  // order of the same codes and against a sort — if either matched, position
  // would not be the only authority.
  const upstreamOrder = live.filter((c) => fwd.includes(c));
  console.log(`  matches upstream order                  : ${JSON.stringify(fwd) === JSON.stringify(upstreamOrder)}`);
  console.log(`  matches an alphabetical sort            : ${JSON.stringify(fwd) === JSON.stringify([...fwd].sort())}`);

  // ── the empty string a trailing newline stores ──────────────────────────
  const withBlank = [{ id: 'blank', type: 'course_selector', enabled: true, content: { courseIds: [A, ''] } }];
  const blankResolved = await resolveSectionData(withBlank);
  console.log('\n-- an empty string in the array (what a trailing newline stores) --');
  console.log(`  resolved            : [${(blankResolved.blank ?? []).map((c) => c.course_id).join(', ')}]`);
  console.log(`  stored array intact : ${JSON.stringify(withBlank[0].content.courseIds)}`);
  // Drawn against ITS OWN resolved map. The first version passed `resolved`,
  // which has no 'blank' key, so the section rendered as if nothing resolved
  // and reported the empty-wrapper size — a number about the probe, not the code.
  const blankHtml = renderToStaticMarkup(
    createElement(SectionRenderer, {
      section: withBlank[0], depth: 0, path: null, resolvedData: blankResolved,
    })
  );
  console.log(`  render bytes        : ${blankHtml.length}`);

  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect().catch(() => {});
}
