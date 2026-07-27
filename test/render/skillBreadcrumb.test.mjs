import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SkillBreadcrumb } from '@/app/(public)/[...slug]/_components/SkillBreadcrumb';

/**
 * The course-page skill/program chips.
 *
 * The trap this guards: linking every chip unconditionally produces links
 * into 404s, because /program/[slug], /skill/[slug] and the catch-all all
 * call notFound() on `config.isPublished === false`. The route resolves an
 * href (or null) per chip server-side; this asserts the component honours
 * that null instead of linking anyway, and that a linked chip is visually
 * identical to an unlinked one apart from its hover/focus affordance.
 */

const R = (props) => renderToStaticMarkup(createElement(SkillBreadcrumb, props));

const COURSE = {
  skills: [
    { _id: 'sk1', skill_id: 'DATA', skill_name: 'Data' },
    { _id: 'sk2', skill_id: 'BLOCKED', skill_name: 'Blocked Skill' },
  ],
  program: { _id: 'pr1', program_id: 'PBI', program_name: 'Power BI' },
};
const LINKED = {
  course: COURSE,
  skillHrefs: { sk1: '/data-all-courses' },
  programHref: '/power-bi-all-courses',
};

test('a resolved skill renders as a link', () => {
  const html = R(LINKED);
  assert.match(html, /<a [^>]*href="\/data-all-courses"[^>]*>/);
});

test('an unresolved skill stays a plain span — the whole point', () => {
  const html = R(LINKED);
  // "Blocked Skill" must appear, but not inside an <a>.
  assert.ok(html.includes('Blocked Skill'));
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
  assert.ok(
    !anchors.some((a) => a.includes('Blocked Skill')),
    'an unpublished/unresolvable skill must not be wrapped in a link'
  );
});

test('the program chip links only when the route resolved one', () => {
  assert.match(R(LINKED), /<a [^>]*href="\/power-bi-all-courses"/);
  const unlinked = R({ ...LINKED, programHref: null });
  const anchors = unlinked.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
  assert.ok(!anchors.some((a) => a.includes('Power BI')));
});

test('CONTROL: with no hrefs at all, nothing is a link', () => {
  // Guards the inverse failure — a component that never links would pass
  // every "not linked" assertion above.
  const none = R({ course: COURSE, skillHrefs: {}, programHref: null });
  assert.equal((none.match(/<a\b/g) ?? []).length, 0);
  // ...and every chip is still rendered.
  assert.ok(none.includes('Data') && none.includes('Blocked Skill') && none.includes('Power BI'));
});

test('CONTROL: with every href supplied, every chip is a link', () => {
  const all = R({
    course: COURSE,
    skillHrefs: { sk1: '/data-all-courses', sk2: '/blocked-all-courses' },
    programHref: '/power-bi-all-courses',
  });
  assert.equal((all.match(/<a\b/g) ?? []).length, 3);
});

test('linked chips are keyboard-reachable with a visible focus ring', () => {
  const html = R(LINKED);
  // Real anchors with href — natively tabbable — and no opt-out.
  assert.ok(!html.includes('tabindex="-1"'));
  assert.equal((html.match(/focus-visible:ring-2/g) ?? []).length, 2,
    'exactly the two linked chips carry a focus ring');
});

test('an unlinked chip gets no hover or focus affordance', () => {
  const none = R({ course: COURSE, skillHrefs: {}, programHref: null });
  assert.ok(!none.includes('focus-visible:ring-2'));
  assert.ok(!none.includes('hover:'));
  assert.ok(!none.includes('cursor-pointer'));
});

test('linking does not alter the chip design', () => {
  const html = R(LINKED);
  const SKILL_CHIP = 'rounded-full border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]';
  const PROGRAM_CHIP = 'rounded-full border border-9e-air/40 bg-9e-air/20 px-3 py-1 text-xs font-semibold text-9e-action dark:text-9e-air';
  // Both the linked and the unlinked skill chip carry the identical base.
  assert.equal((html.match(new RegExp(SKILL_CHIP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length, 2);
  assert.ok(html.includes(PROGRAM_CHIP));
});

test('dark: variants on the program chip survive', () => {
  assert.ok(R(LINKED).includes('dark:text-9e-air'));
  assert.ok(R({ course: COURSE, skillHrefs: {}, programHref: null }).includes('dark:text-9e-air'));
});

test('the icon and label are unchanged in both branches', () => {
  const withIcons = R({
    ...LINKED,
    course: {
      skills: [{ _id: 'sk1', skill_name: 'Data', skilliconurl: 'https://cdn.test/d.svg' }],
      program: { _id: 'pr1', program_name: 'Power BI', programiconurl: 'https://cdn.test/p.svg' },
    },
  });
  assert.ok(withIcons.includes('Data') && withIcons.includes('Power BI'));
  assert.equal((withIcons.match(/<img\b/g) ?? []).length, 2);
});

test('renders nothing when the course has no skills, program or previous', () => {
  assert.equal(R({ course: {}, skillHrefs: {}, programHref: null }), '');
});

test('defaults are safe when the route passes nothing', () => {
  // Server render must not throw if a caller omits the new props.
  const html = R({ course: COURSE });
  assert.equal((html.match(/<a\b/g) ?? []).length, 0);
  assert.ok(html.includes('Data'));
});
