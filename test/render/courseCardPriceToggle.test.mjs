import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CourseCardSection } from '@/components/pageBuilder/sections/course_card';
import { CourseCard } from '@/components/course/CourseCard';
import { SectionContentEditor } from '@/components/pageBuilder/editor/SectionContentEditor';
import { sectionSchema, DRAFT_CONTENT_KEYS, LIVE_ONLY_KEYS } from '@/lib/schemas/pageBuilder';
import { sectionRendersEmpty } from '@/lib/pageBuilder/sectionLabels';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 50 — `course_card` may be told to stop showing a price.
 *
 * ── WHY THE TOGGLE EXISTS ─────────────────────────────────────────────────
 * `expopo1` places a `การ์ดคอร์ส` showing ฿12,900 — the real MSDB price — in
 * the same grid as a `การ์ดราคา` reading “ราคาพิเศษ 4,900 บาท จากปกติ 10,900
 * บาท”. Two prices on one page and nothing saying which applies. Silencing the
 * course card leaves the price card as the only thing speaking about price.
 *
 * ── THE ONE PROPERTY THIS FILE EXISTS FOR ─────────────────────────────────
 * ABSENT MEANS ON. Every course_card in the database predates this field, and
 * it does NOT read back as `true`: the read path is `.lean()`, which applies no
 * Mongoose defaults, and JSON serialisation drops `undefined` keys — so the key
 * comes back ABSENT. A truthiness check would strip the price from every card
 * in production with no migration having run. `!== false` is the fix and the
 * absent case is tested BY NAME below, in both tiers, because that is the case
 * a reviewer would otherwise never think to write.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE ─────────────────────────────────────
 * It sees the emitted markup, byte for byte. That is exactly the right
 * instrument here: the claim is about bytes, not about colour or layout. The
 * git-level proof — HEAD's two files rendered beside the current ones over the
 * same corpus — is a script, not a test, because it needs temp files under
 * src/ for module resolution: scripts/_measure-round50-price-toggle.mjs. What
 * is asserted here is the mechanism that makes that measurement come out zero.
 */

/** The resolved course, in the shape resolveSectionData hands the renderer. */
const COURSE = {
  course_id: 'MSDB',
  course_name: 'Microsoft SQL Server Database Administration',
  course_price: 12900,
  course_trainingdays: 3,
  program: { program_name: 'Database', programiconurl: 'https://example.invalid/db.png' },
};

/** A course with NO duration — the price is then the ONLY thing in its row. */
const NO_DURATION = { ...COURSE, course_trainingdays: undefined, course_days: undefined };

const PRICE = '12,900';

const draw = (content, data = COURSE) =>
  renderToStaticMarkup(createElement(CourseCardSection, { content, style: {}, layout: {}, data }));

/** The price element, as this card emits it. Used to subtract it from a render. */
const priceSpanOf = (markup) => {
  const at = markup.indexOf('<span class="text-right');
  if (at === -1) return null;
  const end = markup.indexOf('</span>', at);
  return markup.slice(at, end + '</span>'.length);
};

// ── A. ABSENT MEANS ON ─────────────────────────────────────────────────────

test('a stored card with the showPrice field ABSENT renders the price', () => {
  const markup = draw({ courseId: 'MSDB' });
  assert.ok(markup.includes(PRICE),
    'a card stored before this field existed lost its price — every card in production would');
});

test('ABSENT and showPrice:true render byte-identically', () => {
  assert.equal(draw({ courseId: 'MSDB' }), draw({ courseId: 'MSDB', showPrice: true }),
    'absent is not the same as on — the default did not apply');
});

test('CONTROL — a TRUTHINESS reading of the ABSENT case hides the price', () => {
  /**
   * This is the trap, made to fire. `content.showPrice` where the key is absent
   * is `undefined`; the card drawn that way loses its price, which is what
   * would ship if the condition were a bare truthiness check. The shipped
   * condition and this one must disagree on exactly this input, or `!== false`
   * is decoration.
   */
  const truthy = renderToStaticMarkup(
    createElement(CourseCard, { course: COURSE, showPrice: Boolean(undefined) }));
  const shipped = draw({ courseId: 'MSDB' });
  assert.ok(!truthy.includes(PRICE), 'the trap did not fire — this control proves nothing');
  assert.ok(shipped.includes(PRICE), 'the shipped condition fell into the trap');
});

test('only a LITERAL false hides the price — stored junk does not', () => {
  // content is passthrough(), so a hand-edited document can hold anything here.
  // Every falsy non-false value must keep the page exactly as it was.
  for (const junk of [null, 0, '', 'false', undefined, NaN]) {
    const markup = draw({ courseId: 'MSDB', showPrice: junk });
    assert.ok(markup.includes(PRICE), `showPrice: ${String(junk)} hid the price`);
    assert.equal(markup, draw({ courseId: 'MSDB' }),
      `showPrice: ${String(junk)} did not render identically to the absent case`);
  }
  assert.ok(!draw({ courseId: 'MSDB', showPrice: false }).includes(PRICE),
    'a deliberate false did NOT hide the price');
});

test('the renderer reads `!== false`, not a truthiness check', () => {
  // A rendered comparison cannot tell "!== false" from "?? true" or from a
  // truthiness check that happens to agree on this fixture, and the difference
  // is what protects production. So the source says it.
  const src = readSource('src/components/pageBuilder/sections/course_card.jsx');
  assert.match(src.code, /content\?\.showPrice\s*!==\s*false/,
    'the absent-means-on condition is no longer `content?.showPrice !== false`');
});

// ── B. OFF HIDES THE PRICE, AND ONLY THE PRICE ─────────────────────────────

test('showPrice:false hides the price', () => {
  assert.ok(!draw({ courseId: 'MSDB', showPrice: false }).includes(PRICE));
});

test('off changes NOTHING about the card except the price element', () => {
  /**
   * Not "the price is gone" — that would pass if the toggle also dropped the
   * button, the name or the program row. The ON render minus its price element
   * must equal the OFF render, byte for byte.
   */
  const on = draw({ courseId: 'MSDB', showPrice: true });
  const off = draw({ courseId: 'MSDB', showPrice: false });
  const span = priceSpanOf(on);
  assert.ok(span && span.includes(PRICE), 'could not locate the price element in the ON render');
  assert.equal(on.replace(span, ''), off,
    'turning the price off changed something other than the price');
});

test('off keeps the name, the duration and the ดูรายละเอียด button', () => {
  const off = draw({ courseId: 'MSDB', showPrice: false });
  assert.ok(off.includes('Microsoft SQL Server Database Administration'), 'lost the course name');
  assert.ok(off.includes('ดูรายละเอียด'), 'lost the detail button');
  assert.ok(off.includes('3 วัน') || /วัน/.test(off), 'lost the duration');
  assert.ok(off.includes('Database'), 'lost the program row');
});

test('off never adds a substitute price — no second authority over the same fact', () => {
  // การ์ดราคา owns a page's authored price. This card may only fall silent.
  const off = draw({ courseId: 'MSDB', showPrice: false });
  assert.ok(!/฿/.test(off), 'a ฿ survived a card whose price was turned off');
  assert.ok(!off.includes('สอบถาม'), 'the card substituted text where the price was');
});

// ── C. THE DEFAULT IS ON, AND THAT IS WHAT MAKES A DEPLOY SAFE ─────────────

test('a card with no showPrice key is byte-identical to what HEAD renders', () => {
  /**
   * HEAD's card had no toggle, i.e. it drew the price unconditionally — which
   * is exactly `CourseCard` called with the prop OMITTED, HEAD's own call
   * signature. So the section render for every stored shape must equal that.
   *
   * The git-level version of this claim — HEAD's actual files, out of git,
   * rendered side by side — is measured in scripts/_measure-round50-price-
   * toggle.mjs and reported with the commit: 0 of 8 stored shapes differ.
   */
  const asHeadDrew = renderToStaticMarkup(createElement('div', { className: 'mx-auto max-w-sm' },
    createElement(CourseCard, { course: COURSE })));
  assert.equal(draw({ courseId: 'MSDB' }), asHeadDrew,
    'a card stored before this commit no longer renders what HEAD rendered');
});

test('CONTROL — a default of OFF would change every stored card', () => {
  /**
   * Names the alternative that was rejected. If the default were off, an absent
   * key would draw the OFF markup, and this asserts that markup is NOT what
   * HEAD rendered — i.e. the choice of default is load-bearing, not taste.
   */
  const asHeadDrew = renderToStaticMarkup(createElement('div', { className: 'mx-auto max-w-sm' },
    createElement(CourseCard, { course: COURSE })));
  const ifDefaultWereOff = draw({ courseId: 'MSDB', showPrice: false });
  assert.notEqual(ifDefaultWereOff, asHeadDrew,
    'default-off renders the same as HEAD — then this whole argument is empty');
});

test('every OTHER caller of CourseCard is untouched — the prop defaults to true', () => {
  /**
   * `@/components/course/CourseCard` has FIVE importers, and four of them are
   * not this section: the public catch-all page (`(public)/[...slug]/page.jsx`)
   * and the bundle_courses / course_list / course_selector sections. None passes
   * `showPrice`. Omitted and explicit-true must therefore be the same bytes, or
   * this commit changed those four surfaces as a side effect.
   *
   * NOTE, so the claim is not read wider than it is: the /training-course grid
   * uses a DIFFERENT component (`training-course/_components/CourseCard`) which
   * this commit does not touch at all.
   */
  const omitted = renderToStaticMarkup(createElement(CourseCard, { course: COURSE }));
  const explicit = renderToStaticMarkup(createElement(CourseCard, { course: COURSE, showPrice: true }));
  assert.equal(omitted, explicit);
  assert.ok(omitted.includes(PRICE));
});

// ── D. THE SCHEMA ──────────────────────────────────────────────────────────

test('the schema defaults showPrice to true and accepts an explicit false', () => {
  const parse = (content) => sectionSchema.parse({
    id: 's1', type: 'course_card', name: '', enabled: true, sortOrder: 0,
    content, settings: {}, layout: {}, style: {}, advanced: {},
  });
  assert.equal(parse({ courseId: 'MSDB' }).content.showPrice, true,
    'the schema default is not true');
  assert.equal(parse({ courseId: 'MSDB', showPrice: false }).content.showPrice, false);
  assert.equal(parse({ courseId: 'MSDB', showPrice: true }).content.showPrice, true);
});

test('the schema is STRICTER than the renderer, and that asymmetry is deliberate', () => {
  /**
   * `z.boolean()` REJECTS a non-boolean, while the renderer above shows the
   * price for one. The two fail in opposite directions on purpose:
   *
   *   · The RENDERER meets documents that already exist and must never blank a
   *     live page over a value it did not expect — it fails OPEN, to the state
   *     the page was already in.
   *   · The SCHEMA guards the write path, where a bad value has an author
   *     behind it and can still be refused — it fails CLOSED.
   *
   * Unreachable today (measured: 0 of 6 stored cards carry the key at all), but
   * named here so the difference is a decision on record rather than a surprise
   * the first time someone hand-edits a document.
   */
  const parse = (content) => sectionSchema.safeParse({
    id: 's1', type: 'course_card', name: '', enabled: true, sortOrder: 0,
    content, settings: {}, layout: {}, style: {}, advanced: {},
  });
  assert.equal(parse({ courseId: 'MSDB', showPrice: 'false' }).success, false, 'the schema accepted a string');
  assert.equal(parse({ courseId: 'MSDB', showPrice: 0 }).success, false, 'the schema accepted a number');
  assert.ok(draw({ courseId: 'MSDB', showPrice: 'false' }).includes(PRICE),
    'the renderer failed closed on junk — a live page would lose its price');
});

test('the schema default does NOT rescue an absent key on the read path', () => {
  /**
   * The reason `!== false` exists, stated as a test rather than a comment. A
   * document read with `.lean()` never goes through this schema, so the default
   * above is applied on WRITE and not on READ — which is why the renderer may
   * not rely on it. The renderer is given the un-parsed shape and must still
   * show the price.
   */
  const stored = { courseId: 'MSDB' }; // what .lean() hands back
  assert.equal(Object.hasOwn(stored, 'showPrice'), false);
  assert.ok(draw(stored).includes(PRICE),
    'the renderer depended on a default that the read path does not apply');
});

test('the draft/live partition still holds exactly', () => {
  /**
   * The field is inside one section's `content`, so it lands under `sections` —
   * a key that already has a side. This asserts the partition did not move: a
   * section-level field must never create a page-level one.
   */
  assert.ok(DRAFT_CONTENT_KEYS.includes('sections'), 'sections left the draft half');
  assert.ok(!DRAFT_CONTENT_KEYS.includes('showPrice'), 'a section field became a page key');
  assert.ok(!LIVE_ONLY_KEYS.includes('showPrice'), 'a section field became a live-only key');
  assert.equal(DRAFT_CONTENT_KEYS.length, 9, 'the draft half changed size');
  assert.equal(
    new Set([...DRAFT_CONTENT_KEYS, ...LIVE_ONLY_KEYS]).size,
    DRAFT_CONTENT_KEYS.length + LIVE_ONLY_KEYS.length,
    'the two halves overlap — the partition is not a partition',
  );
});

// ── E. THE EMPTY-RENDER RULE DOES NOT INTERACT ─────────────────────────────

test('turning the price off never makes a card render as empty', () => {
  /**
   * §D.2 measured a card with a stale code at 84 bytes through SectionRenderer
   * — byte-identical to a section that draws nothing. Price-off must never
   * reach that state, or an author would be unable to tell "I hid the price"
   * from "this course no longer exists".
   */
  const off = draw({ courseId: 'MSDB', showPrice: false });
  assert.notEqual(off, '', 'price-off produced an empty render');
  assert.ok(off.length > 100, 'price-off produced something indistinguishable from nothing');
  // The card whose ONLY row content was the price still renders everything else.
  const offNoDuration = draw({ courseId: 'MSDB', showPrice: false }, NO_DURATION);
  assert.ok(offNoDuration.includes('ดูรายละเอียด'), 'a duration-less card lost its button too');
  assert.ok(offNoDuration.includes('Microsoft SQL Server Database Administration'));
});

test('the static emptiness rule keys on the course code, not on the price', () => {
  const sec = (content) => ({ id: 's1', type: 'course_card', enabled: true, content });
  assert.equal(sectionRendersEmpty(sec({ courseId: 'MSDB', showPrice: false })), false,
    'the tree would badge a priced-off card as ว่าง — it renders a full card');
  assert.equal(sectionRendersEmpty(sec({ courseId: 'MSDB', showPrice: true })), false);
  assert.equal(sectionRendersEmpty(sec({ courseId: '' })), true,
    'the no-code case stopped being empty');
  assert.equal(sectionRendersEmpty(sec({ courseId: '', showPrice: false })), true);
});

// ── F. THE CONTROL IN THE PANEL ────────────────────────────────────────────

const panel = (content) => renderToStaticMarkup(
  createElement(SectionContentEditor, { type: 'course_card', content, patch: () => {}, resolved: undefined }));

test('the panel offers the switch, its label and its hint, beside the course code', () => {
  const markup = panel({ courseId: 'MSDB' });
  assert.ok(markup.includes('ราคาบนการ์ด'), 'the switch lost its label');
  assert.ok(markup.includes('แสดงราคาคอร์สบนการ์ดนี้'), 'the switch lost its text');
  assert.ok(markup.includes('ปิดเมื่อหน้านี้มีการ์ดราคาบอกราคาอยู่แล้ว'), 'the hint is gone');
  assert.ok(markup.includes('type="checkbox"'), 'the switch is not a checkbox');
  // Beside the code, not somewhere else in the panel.
  assert.ok(markup.indexOf('รหัสคอร์ส') < markup.indexOf('ราคาบนการ์ด'),
    'the switch moved away from the course code');
});

test('the panel shows the switch TICKED when the field is absent', () => {
  /**
   * The panel and the page must agree. An unticked box over a page that shows
   * the price is the panel lying — and absent is the state EVERY stored card is
   * in right now, so this is not an edge case, it is the only case.
   */
  assert.match(panel({ courseId: 'MSDB' }), /type="checkbox"[^>]*checked/,
    'a card stored before this commit shows an unticked box while its page shows the price');
  assert.match(panel({ courseId: 'MSDB', showPrice: true }), /type="checkbox"[^>]*checked/);
  assert.doesNotMatch(panel({ courseId: 'MSDB', showPrice: false }), /type="checkbox"[^>]*checked/,
    'a deliberately-off card shows a ticked box');
});

test('the editor reads the SAME absent-means-on expression as the renderer', () => {
  // A `=== true` check in the panel would show the box unticked while the page
  // showed the price — the panel lying about the page.
  const src = readSource('src/components/pageBuilder/editor/SectionContentEditor.jsx');
  assert.match(src.code, /checked=\{content\?\.showPrice\s*!==\s*false\}/,
    'the panel no longer reads absent as on');
});
