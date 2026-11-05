import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  programHeroDescription,
  resolveHeroTitle,
  skillHeroDescription,
} from '@/lib/pageHero';

/**
 * The hero fallback. The promise of these fields is that an empty one changes
 * nothing, so most of this file is what happens when they are empty.
 */

const PROGRAM = { program_description: 'upstream description', program_teaser: 'upstream teaser' };
const SKILL = { skill_description: 'upstream description', skill_teaser: 'upstream teaser' };

test('H1: the name when heroTitle is empty, blank or missing', () => {
  for (const config of [null, undefined, {}, { heroTitle: '' }, { heroTitle: '   ' }]) {
    assert.equal(resolveHeroTitle(config, 'AI'), 'AI');
  }
});

test('CONTROL: H1 is heroTitle when it is set, trimmed', () => {
  assert.equal(resolveHeroTitle({ heroTitle: '  คอร์ส AI ครบวงจร ' }, 'AI'), 'คอร์ส AI ครบวงจร');
});

test('program description: today’s chain, in order, when heroDescription is empty', () => {
  assert.equal(programHeroDescription({ metaDescription: ' meta ' }, PROGRAM), 'meta');
  assert.equal(programHeroDescription({ heroDescription: ' ' }, PROGRAM), 'upstream description');
  assert.equal(programHeroDescription(null, { program_teaser: 'upstream teaser' }), 'upstream teaser');
  assert.equal(programHeroDescription(null, {}), '');
});

test('CONTROL: program heroDescription beats metaDescription', () => {
  const config = { heroDescription: ' hero ', metaDescription: 'meta' };
  assert.equal(programHeroDescription(config, PROGRAM), 'hero');
});

test('skill description: today’s chain, in order, when heroDescription is empty', () => {
  assert.equal(skillHeroDescription({ heroDescription: ' ' }, SKILL), 'upstream description');
  assert.equal(skillHeroDescription(null, { skill_teaser: 'upstream teaser' }), 'upstream teaser');
  assert.equal(skillHeroDescription(null, {}), '');
});

test('the skill hero has never read metaDescription, and still does not', () => {
  assert.equal(skillHeroDescription({ metaDescription: 'meta' }, SKILL), 'upstream description');
});

test('CONTROL: skill heroDescription beats the upstream description', () => {
  assert.equal(skillHeroDescription({ heroDescription: ' hero ' }, SKILL), 'hero');
});
