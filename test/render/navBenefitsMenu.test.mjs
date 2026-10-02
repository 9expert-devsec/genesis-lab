import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { mainNav } from '@/config/site';
import {
  PublicHeaderClient,
  MobileDrawer,
  MobileAccordion,
} from '@/components/layout/PublicHeaderClient';

/**
 * The สิทธิประโยชน์ top-nav item: third, a parent with NO href (a button that
 * only opens its panel), exactly these four children in this order. Desktop
 * and mobile both read it from mainNav, and ติดต่อเรา keeps its link.
 */

const LABEL = 'สิทธิประโยชน์';
const CHILDREN = [
  ['ค่าอบรม ลดหย่อนภาษีได้ 200%', '/tax-200'],
  ['สิทธิพิเศษสำหรับศิษย์เก่า', '/alumni'],
  ['ข้อมูลการชำระเงิน', '/payment'],
];

const PROPS = {
  programs: [],
  dynamicCareerPaths: [],
  tnhsCourses: [],
  navOnlineCourses: [],
  navMenuData: { programs: {}, skills: {}, programSlugs: {}, skillSlugs: {} },
  navMasterclasses: [],
};

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const text = (n) => n.textContent.replace(/\s+/g, ' ').trim();
const item = mainNav.find((i) => i.label === LABEL);

/** The four child links that follow the trigger inside its wrapper. */
const childLinks = (wrapper) =>
  [...wrapper.querySelectorAll('ul a')].map((a) => [text(a), a.getAttribute('href')]);

test('config: third item, no href, exactly these four children in order', () => {
  assert.equal(mainNav[2]?.label, LABEL, 'สิทธิประโยชน์ is not the third item');
  assert.equal(mainNav[1].label, 'ตารางฝึกอบรม');
  assert.equal(mainNav[3].label, 'โปรโมชัน');
  assert.equal('href' in item, false, 'the parent has an href — it must only open the panel');
  assert.deepEqual(item.children.map((c) => [c.label, c.href]), CHILDREN);
});

test('config: ติดต่อเรา still has its href', () => {
  const contact = mainNav.find((i) => i.label === 'ติดต่อเรา');
  assert.equal(contact?.href, '/contact-us');
});

for (const overlay of [false, true]) {
  test(`desktop${overlay ? ' (transparent over hero)' : ''}: a button trigger and the four links`, () => {
    const doc = docOf(renderToStaticMarkup(createElement(PublicHeaderClient, { ...PROPS, overlay })));
    const nav = doc.querySelector('nav[aria-label="Primary"]');
    const triggers = [...nav.children].map((w) => w.querySelector('a, button') ?? w);
    assert.equal(text(triggers[2]), LABEL, 'not third in the desktop row');

    const btn = triggers[2];
    assert.equal(btn.tagName, 'BUTTON', 'the parent is not a button');
    assert.equal(btn.getAttribute('type'), 'button');
    assert.equal(btn.hasAttribute('href'), false);
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal(btn.getAttribute('aria-haspopup'), 'true');
    const panelId = btn.getAttribute('aria-controls');
    assert.ok(panelId && doc.getElementById(panelId), 'aria-controls does not name the panel');
    assert.ok(btn.querySelector('svg'), 'the chevron is missing');
    assert.deepEqual(childLinks(doc.getElementById(panelId)), CHILDREN);

    const contact = triggers.find((t) => text(t) === 'ติดต่อเรา');
    assert.equal(contact.tagName, 'A', 'ติดต่อเรา stopped being a link');
    assert.equal(contact.getAttribute('href'), '/contact-us');
    assert.equal(contact.hasAttribute('aria-expanded'), false, 'ติดต่อเรา picked up button semantics');
  });
}

test('desktop: the button trigger has the link triggers\' typography', () => {
  /**
   * The links inherit their family from `font-thai` on the <nav>; a <button>
   * does not, because globals.css's base layer gives every button `font-en`.
   * Measured before the fix: สิทธิประโยชน์ painted in Google Sans Medium while
   * its neighbours painted in LINE Seed Sans TH. So the button must carry
   * `font-thai` itself, and its size/weight/line-height/tracking tokens must
   * be the link's.
   */
  const doc = docOf(renderToStaticMarkup(createElement(PublicHeaderClient, PROPS)));
  const nav = doc.querySelector('nav[aria-label="Primary"]');
  const triggers = [...nav.children].map((w) => w.querySelector('a, button') ?? w);
  const btn = triggers.find((t) => text(t) === LABEL);
  const link = triggers.find((t) => text(t) === 'ติดต่อเรา');
  const TYPO = /^(?:font-|text-\[|text-(?:xs|sm|base|lg|xl)$|leading-|tracking-)/;
  const typo = (el) => el.className.split(/\s+/).filter((c) => TYPO.test(c)).sort();

  assert.ok(nav.className.split(/\s+/).includes('font-thai'), 'CONTROL: the links\' family source moved');
  assert.deepEqual(typo(btn), [...typo(link), 'font-thai'].sort(),
    'the button\'s typography differs from the link trigger\'s');
});

test('mobile: the drawer renders the parent as an expander, not a link', () => {
  const doc = docOf(renderToStaticMarkup(createElement(MobileDrawer, { ...PROPS, open: true, onClose() {} })));
  const nav = doc.querySelector('nav[aria-label="Mobile primary"]');
  const btn = [...nav.querySelectorAll('button')].find((b) => text(b) === LABEL);
  assert.ok(btn, 'the mobile drawer has no สิทธิประโยชน์ expander');
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(
    [...nav.querySelectorAll('a')].some((a) => text(a) === LABEL), false,
    'the mobile parent navigates',
  );
});

test('mobile: expanded, it lists the four links in order', () => {
  const doc = docOf(renderToStaticMarkup(
    createElement(MobileAccordion, { item, onNavigate() {}, defaultOpen: true }),
  ));
  assert.deepEqual(childLinks(doc.body), CHILDREN);
});
