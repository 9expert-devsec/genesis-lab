import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import AboutHero from '@/components/about/AboutHero';
import StorySection from '@/components/about/StorySection';
import TeachingSection from '@/components/about/TeachingSection';
import FormatsSection from '@/components/about/FormatsSection';
import InstructorCardsSection from '@/components/about/InstructorCardsSection';
import ReviewsSection from '@/components/about/ReviewsSection';
import ClosingCtaSection from '@/components/about/ClosingCtaSection';
import CommunitySection from '@/components/about/CommunitySection';
import AboutReveal from '@/components/about/AboutReveal';

/**
 * Round AB-3c brought back a scroll reveal on /about-us. The content must
 * never depend on JS to be visible: the server markup carries no hiding
 * style at all, and the CSS hides only under the ready class the client adds
 * after mount. The hero (first paint, LCP) is never armed.
 */

const ROOT = path.resolve(import.meta.dirname, '../..');
const CSS = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');

const SECTIONS = [
  [StorySection, { tagline: 'สอนแบ่งปันความรู้ เทคโนโลยีเพื่อ "ขับเคลื่อนประเทศไทย"' }],
  [TeachingSection, {}],
  [FormatsSection, {}],
  [InstructorCardsSection, { cards: [{ id: 'i1', name: 'ก', title: 'ข', imageUrl: '', specialties: [], programs: [] }] }],
  [ReviewsSection, { reviews: [{ _id: 'r1', comment: 'ดีมาก', reviewerName: 'ค', rating: 5 }] }],
  [ClosingCtaSection, {}],
  [CommunitySection, { photos: [] }],
];

test('server markup: the sections carry reveal hooks but NO hiding style', () => {
  let hooks = 0;
  for (const [C, props] of SECTIONS) {
    const html = renderToStaticMarkup(createElement(C, props));
    hooks += (html.match(/data-reveal/g) ?? []).length;
    assert.doesNotMatch(html, /style="[^"]*(opacity|translate|visibility:\s*hidden)/i, `${C.name} ships a hiding inline style`);
    assert.doesNotMatch(html, /reveal-ready|is-revealed/, `${C.name} ships a client-only state class`);
  }
  assert.ok(hooks > 10, `CONTROL: the sections are hooked (${hooks})`);
});

test('the hero is never armed — it is the first paint and the LCP', () => {
  assert.doesNotMatch(renderToStaticMarkup(createElement(AboutHero, {})), /data-reveal/);
});

test('the reveal client component renders nothing on the server', () => {
  assert.equal(renderToStaticMarkup(createElement(AboutReveal)), '');
});

test('every hiding rule in globals.css requires the client-only ready class', () => {
  const rules = [...CSS.matchAll(/([^{}]*\[data-reveal[^{}]*)\{([^}]*)\}/g)];
  assert.ok(rules.length >= 2, 'CONTROL: the reveal rules were found');
  for (const [, selector, body] of rules) {
    if (/opacity:\s*0\b|translateY\(/.test(body)) {
      assert.match(selector, /\.about-page\.reveal-ready /, `hiding rule without the ready class: ${selector.trim()}`);
    }
  }
});

test('the reveal component bails out under reduced motion and arms only after mount', () => {
  const src = readFileSync(path.join(ROOT, 'src/components/about/AboutReveal.jsx'), 'utf8');
  assert.match(src, /^'use client';/);
  assert.match(src, /prefers-reduced-motion: reduce\)'\)\.matches\) return/);
  assert.match(src, /useEffect\(/);
  assert.ok(src.indexOf("classList.add('reveal-ready')") > src.indexOf("classList.add('is-revealed')"),
    'on-screen items are marked revealed BEFORE the ready class goes on');
});
