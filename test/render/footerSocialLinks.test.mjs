import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { PublicFooter } from '@/components/layout/PublicFooter';

/**
 * The footer's social row, RENDERED.
 *
 * Facebook was missing from it — five profiles rendered, the one the
 * organisation actually leads with (siteConfig.facebookUrl, first in the
 * homepage JSON-LD's `sameAs`, first on the contact page) was not among them.
 *
 * The assertion is an EXACT SET of (label → href), not a floor and not an
 * `includes`: a sixth profile appearing, one vanishing, or a URL drifting away
 * from the spelling the rest of the repo uses all go red here.
 */

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

/** Every external link in the footer that is a social icon: an `aria-label`ed <a> holding an <svg>. */
function socialLinks(doc) {
  return [...doc.querySelectorAll('a[target="_blank"][aria-label]')]
    .filter((a) => a.querySelector('svg'))
    .map((a) => ({
      label: a.getAttribute('aria-label'),
      href: a.getAttribute('href'),
      rel: a.getAttribute('rel'),
      className: a.getAttribute('class'),
      iconClass: a.querySelector('svg').getAttribute('class'),
    }));
}

/**
 * EIGHT, in two rows of four. The chat channels — Messenger and LINE — sit
 * beside Facebook at the head of the row; LINE replaced the separate
 * "LINE Official / @9expert" block that used to sit above the icons. The
 * two chat URLs are asserted as the LITERAL strings so a drift in siteConfig
 * goes red here rather than being read back from the same field.
 */
const EXPECTED = [
  ['Facebook',  'https://www.facebook.com/9ExpertTraining'],
  ['Messenger', 'https://m.me/9ExpertTraining'],
  ['LINE',      'https://line.me/R/ti/p/@9expert'],
  ['Instagram', 'https://www.instagram.com/9expert_training'],
  ['TikTok',    'https://www.tiktok.com/@9expert'],
  ['LinkedIn',  'https://th.linkedin.com/company/9expert'],
  ['YouTube',   'https://www.youtube.com/@9expert'],
  ['Shopee',    'https://shopee.co.th/9expert'],
];

test('the footer renders exactly the expected set of social links, in order', () => {
  const links = socialLinks(docOf(renderToStaticMarkup(createElement(PublicFooter))));
  assert.deepEqual(
    links.map((l) => [l.label, l.href]),
    EXPECTED,
    'the social row is not the expected set — one appeared, vanished, or moved'
  );
});

test('Facebook is an external link with the same rel as its neighbours', () => {
  const links = socialLinks(docOf(renderToStaticMarkup(createElement(PublicFooter))));
  const fb = links.find((l) => l.label === 'Facebook');
  assert.ok(fb, 'no Facebook link rendered');
  assert.equal(fb.rel, 'noopener noreferrer');
  // Same anchor classes and same icon sizing as every other icon in the row —
  // the pattern is the neighbours', not a fresh one.
  for (const other of links.filter((l) => l !== fb)) {
    assert.equal(fb.className, other.className, `${other.label} anchor differs from Facebook's`);
    assert.equal(fb.iconClass, other.iconClass, `${other.label} icon sizing differs from Facebook's`);
  }
});

test('the icons are laid out as a hard 4-column grid — 4 + 4, never 5 + 3 or one row of eight', () => {
  const doc = docOf(renderToStaticMarkup(createElement(PublicFooter)));
  const first = [...doc.querySelectorAll('a[target="_blank"][aria-label]')].find((a) => a.querySelector('svg'));
  const row = first.parentElement;
  assert.equal(row.children.length, 8, 'the grid does not hold all eight icons');
  const cls = row.getAttribute('class').split(/\s+/);
  assert.ok(cls.includes('grid') && cls.includes('grid-cols-4'), `the container is not a 4-column grid: "${row.getAttribute('class')}"`);
  assert.ok(!cls.some((c) => /^(sm|md|lg|xl):grid-cols-/.test(c)), 'a breakpoint changes the column count — the row must be 4 + 4 at every width');
  assert.ok(!cls.includes('flex-wrap'), 'a wrapping flex row is back — its break point is the column width, not the count');
});

test('the separate "LINE Official / @9expert" block is gone — LINE is an icon now', () => {
  const doc = docOf(renderToStaticMarkup(createElement(PublicFooter)));
  const text = doc.body.textContent;
  assert.equal(text.includes('LINE Official'), false, 'the LINE Official label is back in the contact column');
  // The email address contains "@9expert" too, so this looks for the LINK, not the substring.
  assert.equal([...doc.querySelectorAll('a')].some((a) => a.textContent.trim() === '@9expert'), false, 'the @9expert text link is back');
  // Exactly ONE anchor to the LINE URL: the icon.
  const lineAnchors = [...doc.querySelectorAll('a')].filter((a) => a.getAttribute('href') === 'https://line.me/R/ti/p/@9expert');
  assert.equal(lineAnchors.length, 1, `expected one LINE anchor (the icon), found ${lineAnchors.length}`);
  assert.equal(lineAnchors[0].getAttribute('aria-label'), 'LINE');
});

test('CONTROL: the social set is taken from a render, not from the source array', () => {
  // If the map over SOCIALS ever stopped rendering (a filter, a slice, a
  // conditional), the source array would still list eight and this would drop.
  const links = socialLinks(docOf(renderToStaticMarkup(createElement(PublicFooter))));
  assert.equal(links.length, EXPECTED.length);
});
