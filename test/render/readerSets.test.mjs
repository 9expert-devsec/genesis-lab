import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SECTION_STYLE_CAPS } from '@/lib/pageBuilder/presets';
import { PriceCardSection } from '@/components/pageBuilder/sections/price_card';
import { StatCardSection } from '@/components/pageBuilder/sections/stat_card';
import { IconCardSection } from '@/components/pageBuilder/sections/icon_card';
import { CtaSection } from '@/components/pageBuilder/sections/cta';
import { HeadingSection } from '@/components/pageBuilder/sections/heading';
// ADDED beside the statements above rather than folded into one — the standing
// rule in this repo. This file's loop is DRIVEN BY SECTION_STYLE_CAPS, so
// declaring promotion_bundle there minted two new tests here with no edit; what
// had to be supplied is the component and enough content for it to draw both
// surfaces. That is the guard working: a type cannot claim a style capability
// without something proving the claim renders.
import { PromotionBundleSection } from '@/components/pageBuilder/sections/promotion_bundle';

/**
 * WITNESS 1 — behavioral: the single-source is wired to RENDER (2C.3).
 *
 * Driven by SECTION_STYLE_CAPS itself: for every [type, prop] the caps declare,
 * the component's output must DIFFER between two values of that prop — proof that
 * the capability helper actually applies the class, not a no-op. This is the
 * witness that stays green ONLY if the caps→helper→render wire is connected;
 * break the helper to return '' and this goes red while the other two witnesses
 * (which check the declaration + the lock) would not. Compares inequality, not a
 * specific class string, because the raw class fns are now private.
 */
const COMP = {
  price_card: PriceCardSection, stat_card: StatCardSection, icon_card: IconCardSection,
  cta: CtaSection, promotion_bundle: PromotionBundleSection,
};
const CONTENT = {
  price_card: { title: 'T', price: '฿1', buttonLabel: 'Go', buttonHref: '/x' },
  stat_card: { value: 'V', label: 'L' },
  icon_card: { title: 'T', description: 'D' },
  cta: { buttonLabel: 'Go', buttonHref: '/x' },
  // `discountCode` is what makes the button exist at all — without it the
  // buttonStyle half of this type's declaration would compare two renders with
  // no button in either and pass while reading nothing.
  promotion_bundle: { name: 'T', netPrice: 1, discountCode: 'EXP1' },
};
const VALUES = { cardStyle: ['shadow', 'plain'], buttonStyle: ['outline', 'primary'] };
const R = (C, props) => renderToStaticMarkup(C(props));

for (const [type, props] of Object.entries(SECTION_STYLE_CAPS)) {
  for (const prop of props) {
    test(`${type} genuinely reads ${prop} (render differs between values)`, () => {
      const [a, b] = VALUES[prop];
      assert.ok(CONTENT[type], `no sample content for ${type}`);
      assert.notEqual(
        R(COMP[type], { content: CONTENT[type], style: { [prop]: a } }),
        R(COMP[type], { content: CONTENT[type], style: { [prop]: b } }),
      );
    });
  }
}

test('control: a non-reader (heading) is unaffected by cardStyle', () => {
  const h = (v) => renderToStaticMarkup(HeadingSection({ content: { text: 'hi' }, style: { cardStyle: v } }));
  assert.equal(h('shadow'), h('plain'));
});
