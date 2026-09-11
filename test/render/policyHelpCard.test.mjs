import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import TermsPage from '@/app/(public)/terms/page';
import RefundPolicyPage from '@/app/(public)/refund-policy/page';
import PrivacyPolicyPage from '@/app/(public)/privacy-policy/page';
import CookiePolicyPage from '@/app/(public)/cookie-policy/page';
import { PolicyTocSidebar } from '@/components/policies/PolicyTocSidebar';

/**
 * The "ต้องการความช่วยเหลือ?" help card is GONE from the policy pages.
 *
 * It sat in the left rail under the table of contents on /terms and
 * /refund-policy — a generic "contact the team" card that repeated what the
 * footer on the same page already says. The rail's `help` slot is a shared
 * component (PolicyTocSidebar); the COPY was per page, and two pages fill
 * the slot with something that is not this card: /privacy-policy links to
 * its DPO section, /cookie-policy to its manage-cookies section. Those are
 * in-page aids, not a contact duplicate, and they stay.
 *
 * These are absence assertions on RENDERED pages, so nobody restores the
 * card by accident — on any of the four, not only the two that had it.
 */

const dom = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const PAGES = [
  ['/terms', TermsPage],
  ['/refund-policy', RefundPolicyPage],
  ['/privacy-policy', PrivacyPolicyPage],
  ['/cookie-policy', CookiePolicyPage],
];

const PHRASES = [
  'ต้องการความช่วยเหลือ?',
  'ทีมงานของเราพร้อมตอบทุกข้อสงสัยเกี่ยวกับการใช้บริการ',
  'เราพร้อมให้คำแนะนำและช่วยเหลือในทุกขั้นตอน',
  'ติดต่อทีมงาน 9Expert',
];

for (const [route, Page] of PAGES) {
  test(`${route}: the help card's phrases render nowhere on the page`, () => {
    const doc = dom(renderToStaticMarkup(createElement(Page)));
    const text = doc.body.textContent;
    assert.ok(text.length > 1000, `${route} rendered almost nothing (${text.length} chars)`);
    for (const phrase of PHRASES) {
      assert.equal(text.includes(phrase), false, `${route}: "${phrase}" is back`);
    }
    // And no sidebar anchor points at /contact-us — that was the card's button.
    const aside = doc.querySelector('aside');
    assert.ok(aside, `${route} has no sidebar`);
    const contactLinks = [...aside.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/contact-us');
    assert.equal(contactLinks.length, 0, `${route}: the sidebar still links to /contact-us`);
  });
}

test('the table of contents is still in the sidebar on every page', () => {
  for (const [route, Page] of PAGES) {
    const aside = dom(renderToStaticMarkup(createElement(Page))).querySelector('aside');
    const tocLinks = [...aside.querySelectorAll('a')].filter((a) => (a.getAttribute('href') ?? '').startsWith('#'));
    assert.ok(tocLinks.length >= 3, `${route}: the table of contents is gone (${tocLinks.length} in-page links)`);
  }
});

test('the two page-specific rail cards are untouched: privacy → DPO section, cookie → manage section', () => {
  const privacy = dom(renderToStaticMarkup(createElement(PrivacyPolicyPage))).querySelector('aside');
  assert.ok(privacy.textContent.includes('มีคำถามเกี่ยวกับข้อมูลส่วนบุคคล?'), 'the privacy DPO card vanished');
  assert.ok([...privacy.querySelectorAll('a')].some((a) => a.getAttribute('href') === '#section-14'));

  const cookie = dom(renderToStaticMarkup(createElement(CookiePolicyPage))).querySelector('aside');
  assert.ok(cookie.textContent.includes('จัดการคุกกี้ของท่าน'), 'the cookie manage card vanished');
  assert.ok([...cookie.querySelectorAll('a')].some((a) => a.getAttribute('href') === '#manage'));
});

test('CONTROL: the slot still renders a card when a page passes one — the absence above is the pages\', not a dead slot', () => {
  const html = renderToStaticMarkup(createElement(PolicyTocSidebar, {
    items: [{ id: 'a', label: 'A' }],
    help: { icon: 'help', title: 'ต้องการความช่วยเหลือ?', blurb: 'x', href: '/contact-us', cta: 'ติดต่อทีมงาน 9Expert' },
  }));
  assert.ok(html.includes('ต้องการความช่วยเหลือ?'), 'the phrase matcher found nothing in a sidebar known to carry the card');
});
