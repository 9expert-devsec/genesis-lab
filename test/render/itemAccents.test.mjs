import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccordionSection } from '@/components/pageBuilder/sections/accordion';
import { InstructorCardSection } from '@/components/pageBuilder/sections/instructor_card';
import { TabsSection } from '@/components/pageBuilder/sections/tabs';
import { IconCardSection } from '@/components/pageBuilder/sections/icon_card';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 24 — accordion and instructor_card take the section accent.
 *
 * Both were the last two types with a surface the accent pattern reaches and no
 * accent on it (docs/section-control-audit.md, finding 2). Each follows an
 * existing sibling rather than inventing a treatment:
 *
 *   accordion       -> tabs      the open item's chevron and title,
 *                                exactly as tabs accents the active tab's
 *                                underline and label
 *   instructor_card -> icon_card the specialty chips' label, the same
 *                                variable in the same ornament role
 *
 * ── WHAT THIS FILE CAN AND CANNOT SEE, STATED UP FRONT ─────────────────────
 * Three things are out of reach here and are covered elsewhere, named so the
 * green in this file is not read as more than it is:
 *
 * 1. THE ACCORDION'S OPEN BRANCH. Its state is `useState(null)`, so a static
 *    render only ever produces CLOSED items, and mounting a React root is
 *    forbidden in this tier — the runner is isolation:'none' and a root's
 *    globalThis.window leaks into every other render test (it cost 28 unrelated
 *    failures once). So the closed branch is rendered and the open branch is a
 *    SOURCE claim, which is the house precedent for what the render tier cannot
 *    reach. scripts/_probe-accordion-instructor-accent.mjs mounts it for real,
 *    clicks it open and measures the painted colour.
 * 2. THE COLOUR. The accent travels as a CSS custom property, so the class
 *    string is a constant and identical for all six accent values. Colour is
 *    the probe's job.
 * 3. WHETHER THE CLASS COMPILES TO A RULE AT ALL. That is
 *    test/fs/tailwindArbitraryValueRules, and it is not a formality — this
 *    round found a class in the precedent that renders perfectly and paints
 *    nothing.
 */

/**
 * Rendered as an ELEMENT, not by calling the function. accordion and tabs are
 * client components with `useState`, and a direct call has no hook dispatcher —
 * it throws on `null.useState`. The neighbouring derived.test.mjs can get away
 * with `C(props)` because everything it renders is hook-free.
 */
const R = (C, props) => renderToStaticMarkup(createElement(C, props));

const ITEMS = [
  { title: 'หัวข้อแรก', body: 'เนื้อหาแรก' },
  { title: 'หัวข้อที่สอง', body: 'เนื้อหาที่สอง' },
];
const INSTRUCTOR = {
  name: 'ผู้สอน ทดสอบ', title: 'อาจารย์ประจำ', bio: 'ประวัติโดยย่อ',
  specialties: ['Data', 'AI'],
};

const ACCORDION_SRC = 'src/components/pageBuilder/sections/accordion.jsx';

/** Every class attribute in a markup string, in document order. */
const classesIn = (html) => [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);

// ── accordion — the CLOSED branch, rendered ────────────────────────────────

test('accordion: a closed item is NOT accented, in either of its two elements', () => {
  /**
   * The half a static render can prove, and it is worth proving: an accordion
   * with nothing open must look exactly as it did before this round. Every item
   * is closed on first paint, so this is also what a visitor sees before they
   * touch anything.
   */
  const html = R(AccordionSection, { content: { items: ITEMS } });
  const classes = classesIn(html);

  assert.deepEqual(classes, [
    'divide-y divide-[var(--surface-border)] rounded-9e-md border border-[var(--surface-border)]',
    'flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold text-9e-navy dark:text-white',
    'lucide lucide-chevron-down h-5 w-5 shrink-0 transition-transform text-9e-slate-dp-50',
    'flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold text-9e-navy dark:text-white',
    'lucide lucide-chevron-down h-5 w-5 shrink-0 transition-transform text-9e-slate-dp-50',
  ], 'the closed accordion changed — a section with nothing open must render as it did before');

  assert.equal(/--pb-accent-/.test(html), false,
    'a closed accordion is painting with the accent — only the OPEN item takes it');
});

test('accordion: no item body is ever accented — the first negative rule', () => {
  /**
   * The body is prose, and prose is never accented. It is absent from a closed
   * render, so the rule is asserted where it lives instead: the source has
   * exactly one body element and its classes carry no accent.
   */
  const { code } = readSource(ACCORDION_SRC);
  const body = code.match(/className="(whitespace-pre-line[^"]*)"/g) ?? [];
  assert.deepEqual(body, ['className="whitespace-pre-line px-4 pb-4 text-9e-slate-dp-50 dark:text-[#94a3b8]"'],
    'the accordion body element changed — it must keep its muted prose colour in both themes');
});

// ── accordion — the OPEN branch, as a source claim ─────────────────────────

test('accordion: the OPEN item routes both elements through the accent variables', () => {
  /**
   * A SOURCE CLAIM, for the reason in this file's header: the open branch does
   * not exist in a static render and a React root is not allowed in this tier.
   *
   * Exact whole strings for both branches of both ternaries, so this cannot
   * pass on a component that carries the accent AND the old hardcode — where
   * tailwind-merge would decide which one wins by argument order, invisibly.
   */
  const { code } = readSource(ACCORDION_SRC);

  assert.match(code, /isOpen\s*\n?\s*\?\s*'text-\[var\(--pb-accent-text\)\]'\s*\n?\s*:\s*'text-9e-navy dark:text-white'/,
    'the accordion TITLE no longer switches to --pb-accent-text when the item is open, or it no '
    + 'longer falls back to the resting colour when closed');

  assert.match(code, /isOpen \? 'rotate-180 text-\[var\(--pb-accent-fill\)\]' : 'text-9e-slate-dp-50'/,
    'the accordion CHEVRON no longer switches to --pb-accent-fill when the item is open');

  /**
   * The resting colour must appear EXACTLY ONCE, and the assertion above has
   * already pinned that one occurrence to the closed branch of the ternary.
   * Together those say the button cannot also be applying it unconditionally —
   * which is what a revert looks like, and what tailwind-merge would then
   * resolve silently by argument order.
   *
   * A count, because the first draft tried to detect the reverted shape with a
   * regex over the surrounding JSX and matched the healthy file.
   */
  const resting = code.match(/text-9e-navy dark:text-white/g) ?? [];
  assert.equal(resting.length, 1,
    `the resting title colour appears ${resting.length} times, not once — if it is back on the `
    + 'button unconditionally, the open item never takes the accent');
});

test('accordion: it uses the SAME two roles tabs uses, and no others', () => {
  /**
   * The precedent, asserted rather than described. If a later round gives the
   * accordion a role tabs does not have — or tabs loses one — the two stop
   * being the same treatment and this names it.
   */
  const roles = (rel) => [...new Set(
    (readSource(rel).code.match(/--pb-accent-[a-z]+/g) ?? []),
  )].sort();

  assert.deepEqual(roles(ACCORDION_SRC), ['--pb-accent-fill', '--pb-accent-text']);
  assert.deepEqual(roles('src/components/pageBuilder/sections/tabs.jsx'),
    ['--pb-accent-fill', '--pb-accent-text'],
    'tabs changed its roles — the accordion was built to match it exactly');
});

test('CONTROL: tabs really does accent its active tab, and only that one', () => {
  /**
   * Discrimination for the precedent claim. tabs is `useState(0)`, so its
   * ACTIVE branch is present in a static render — which makes it the one place
   * this tier can see an accented active item at all, and proves the shape the
   * accordion was copied from is real rather than assumed from a note.
   */
  const html = R(TabsSection, { content: { tabs: [{ title: 'ก', body: 'a' }, { title: 'ข', body: 'b' }] } });
  const buttons = classesIn(html).filter((c) => c.includes('border-b-2'));
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0], '-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors border-[color:var(--pb-accent-fill)] text-[var(--pb-accent-text)]');
  assert.equal(buttons[1], '-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors border-transparent text-9e-slate-dp-50 hover:text-9e-navy dark:hover:text-white');
});

// ── instructor_card — fully server-rendered, so fully visible here ─────────

test('instructor_card: the specialty chips take the accent, and keep their surface', () => {
  const html = R(InstructorCardSection, { data: INSTRUCTOR });
  const chips = classesIn(html).filter((c) => c.startsWith('rounded-full'));

  assert.deepEqual(chips, [
    'rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-[var(--pb-accent-fill)] dark:bg-[#0D1B2A]',
    'rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-[var(--pb-accent-fill)] dark:bg-[#0D1B2A]',
  ], 'the specialty chips changed');

  // ORNAMENT, following icon_card's chip — not the key-figure role.
  assert.equal(chips[0].includes('--pb-accent-text'), false,
    'the chip took the key-figure role; icon_card\'s chip is --pb-accent-fill');
});

test('instructor_card: the chip keeps a real background — the precedent\'s does not', () => {
  /**
   * ── THE FINDING THAT CHANGED THIS ROUND'S PLAN ───────────────────────────
   * icon_card asks for a tenth-strength accent background. Tailwind cannot
   * apply an opacity modifier to an arbitrary colour that is a bare custom
   * property, so it emits NO RULE and that chip has been transparent since it
   * shipped (measured — see test/fs/tailwindArbitraryValueRules and the probe).
   *
   * Copying it verbatim would therefore have deleted a surface these chips
   * really have. This pins the decision from BOTH sides: the precedent still
   * carries the inert class, and this component does not.
   */
  const chip = classesIn(R(InstructorCardSection, { data: INSTRUCTOR }))
    .find((c) => c.startsWith('rounded-full'));
  assert.match(chip, /bg-9e-ice/, 'the chip lost its background to the inert tinted class');
  assert.equal(/bg-\[color:var\(--pb-accent-fill\)\]\/10/.test(chip), false,
    'instructor_card adopted the tinted background that compiles to nothing');

  const iconChip = classesIn(R(IconCardSection, {
    content: { title: 'ก', description: 'ข', icon: 'Star' }, style: {},
  })).find((c) => c.includes('inline-flex'));
  assert.match(iconChip, /bg-\[color:var\(--pb-accent-fill\)\]\/10/,
    'icon_card no longer carries the inert tinted class — if it was FIXED, instructor_card can '
    + 'adopt the tint too and this test and its note should go');
});

test('instructor_card: the name, role and bio are NOT accented — the first negative rule', () => {
  const html = R(InstructorCardSection, { data: INSTRUCTOR });
  const classes = classesIn(html);

  assert.deepEqual(classes, [
    'mx-auto flex h-full max-w-sm flex-col items-center rounded-9e-lg border border-[var(--surface-border)] p-6 text-center',
    'mt-3 font-heading text-lg font-bold',
    'mt-0.5 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]',
    'mt-2 whitespace-pre-line text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]',
    'mt-3 flex flex-wrap justify-center gap-1.5',
    'rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-[var(--pb-accent-fill)] dark:bg-[#0D1B2A]',
    'rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-[var(--pb-accent-fill)] dark:bg-[#0D1B2A]',
  ], 'an element of the instructor card changed — check it did not take the accent');

  // Stated separately so a failure names the RULE, not just the diff.
  for (const c of classes.filter((x) => !x.startsWith('rounded-full'))) {
    assert.equal(/--pb-accent-/.test(c), false,
      `a non-chip element took the accent (${c}) — the name is a heading and the role and bio `
      + 'are prose, and headings and body copy are never accented');
  }
});

test('instructor_card: the fixed card width is untouched by this round', () => {
  /**
   * ── AMENDED BY ROUND 70, AND WHAT THAT DID NOT CHANGE ────────────────
   * `h-full` was added to this card so it can fill a `card_grid` row (the
   * fix lives in SectionRenderer; this class is the card's half of it, and
   * it is inert outside a grid — measured, a top-level instructor_card is
   * 142/184/204/184px before and after).
   *
   * The RULES both of these assertions exist for are untouched, which is why
   * this is an amendment and not the tripwire being edited to agree with the
   * code: no element took the accent, and `max-w-sm` is still there. The
   * fixed-width finding is still OPEN.
   */
  /**
   * A separate open finding with its own tripwire (ความกว้าง cannot change this
   * card). Colour-only means it must be exactly as it was, and a colour change
   * that quietly took the clamp with it would look like a fix to a finding
   * nobody worked on.
   */
  const outer = classesIn(R(InstructorCardSection, { data: INSTRUCTOR }))[0];
  assert.equal(outer,
    'mx-auto flex h-full max-w-sm flex-col items-center rounded-9e-lg border border-[var(--surface-border)] p-6 text-center');
});

test('CONTROL: the chip reader would SEE an unaccented chip', () => {
  /**
   * Without this, every "the chip is accented" above could be passing on a
   * selector that matches whatever it finds. The pre-round-24 chip string is
   * put through the same reader and must come back as the old, unaccented one.
   */
  const before = '<span class="rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-navy dark:bg-[#0D1B2A] dark:text-white/90">x</span>';
  const seen = classesIn(before).filter((c) => c.startsWith('rounded-full'));
  assert.deepEqual(seen, ['rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-navy dark:bg-[#0D1B2A] dark:text-white/90']);
  assert.equal(/--pb-accent-/.test(seen[0]), false);
  assert.deepEqual(classesIn('<div>no classes</div>'), []);
});
