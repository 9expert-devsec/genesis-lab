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

const EXPECTED = [
  ['Facebook',  'https://www.facebook.com/9ExpertTraining'],
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

test('CONTROL: the social set is taken from a render, not from the source array', () => {
  // If the map over SOCIALS ever stopped rendering (a filter, a slice, a
  // conditional), the source array would still list six and this would drop.
  const links = socialLinks(docOf(renderToStaticMarkup(createElement(PublicFooter))));
  assert.equal(links.length, EXPECTED.length);
});
