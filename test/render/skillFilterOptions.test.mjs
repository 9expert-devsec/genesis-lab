import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FilterBar } from '@/app/(public)/training-course/_components/FilterBar';
import { skills, findSkillBySlug } from '@/config/site';

/**
 * The /training-course ทักษะ dropdown.
 *
 * A legacy slug is something we ACCEPT, never something we OFFER. The two are
 * easy to conflate — both resolve, both "work" — but offering one puts a
 * retired value back into the query string on every use, which re-seeds the
 * exact link rot the legacy entry exists to absorb, and does it from the
 * control that is supposed to emit the canonical URL.
 *
 * This asserts the emitted <option> values, so the rule holds however the
 * option list is built.
 *
 * WHAT THIS CANNOT SEE: it renders FilterBar alone. It does not prove
 * CourseListClient round-trips the chosen value into the URL, nor that the
 * filter matches anything — that is the pure tier's `?skill=` contract test.
 */

const html = renderToStaticMarkup(
  createElement(FilterBar, {
    skillSlug: null,
    onSkillChange: () => {},
    programName: null,
    onProgramChange: () => {},
    programOptions: [],
  })
);

/**
 * The `value` of every <option> in the ทักษะ select SPECIFICALLY.
 *
 * Not every <option> on the page: FilterBar renders a second select for
 * programs, whose own "โปรแกรมทั้งหมด" reset row also has `value=""`. Scanning
 * the whole markup made the option count off by one and the first draft of
 * this file failed on it — a nice demonstration that a count assertion catches
 * what an `includes()` sweep does not.
 */
function skillOptionValues(markup) {
  const select = markup.match(/<select[^>]*aria-label="ทักษะ"[\s\S]*?<\/select>/);
  assert.ok(select, 'the ทักษะ select was not rendered');
  return [...select[0].matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) => m[1]);
}

const optionValues = skillOptionValues(html);

const LEGACY = skills.flatMap((s) => s.legacySlugs ?? []);

test('the dropdown offers every canonical slug', () => {
  for (const s of skills) {
    assert.ok(optionValues.includes(s.slug), `missing option for ${s.slug}`);
  }
  // '' is the "ทักษะทั้งหมด" reset row; 7 skills + it, and nothing else.
  assert.equal(optionValues.length, skills.length + 1);
  assert.ok(optionValues.includes(''));
});

test('the dropdown offers NO legacy slug', () => {
  assert.ok(LEGACY.length > 0, 'the config has a legacy slug to be wrong about');
  for (const legacy of LEGACY) {
    assert.ok(!optionValues.includes(legacy), `the dropdown offers retired slug "${legacy}"`);
  }
  assert.ok(!optionValues.includes('rpa'), 'specifically: rpa is not offered');
});

test('CONTROL: the matcher DOES find a value that is present', () => {
  // Without this, a broken regex or an unrendered <select> would satisfy the
  // test above by finding nothing at all.
  assert.ok(optionValues.includes('automation'), 'matcher failed on a known option');
});

test('every offered value resolves, and resolves to itself', () => {
  // Belt and braces on the pair: what the control emits must be a slug the
  // resolver treats as canonical, not one that quietly redirects elsewhere.
  for (const value of optionValues.filter(Boolean)) {
    const hit = findSkillBySlug(value);
    assert.ok(hit, `offered value "${value}" does not resolve`);
    assert.equal(hit.slug, value, `offered value "${value}" is not canonical`);
  }
});

test('the retired slug resolves even though it is never offered', () => {
  // The whole point, in one assertion: accepted, not offered.
  assert.equal(findSkillBySlug('rpa')?.slug, 'automation');
  assert.ok(!optionValues.includes('rpa'));
});
