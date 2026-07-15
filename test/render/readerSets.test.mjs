import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SECTION_STYLE_CAPS } from '@/lib/pageBuilder/presets';
import { PriceCardSection } from '@/components/pageBuilder/sections/price_card';
import { StatCardSection } from '@/components/pageBuilder/sections/stat_card';
import { IconCardSection } from '@/components/pageBuilder/sections/icon_card';
import { CtaSection } from '@/components/pageBuilder/sections/cta';
import { HeadingSection } from '@/components/pageBuilder/sections/heading';

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
const COMP = { price_card: PriceCardSection, stat_card: StatCardSection, icon_card: IconCardSection, cta: CtaSection };
const CONTENT = {
  price_card: { title: 'T', price: '฿1', buttonLabel: 'Go', buttonHref: '/x' },
  stat_card: { value: 'V', label: 'L' },
  icon_card: { title: 'T', description: 'D' },
  cta: { buttonLabel: 'Go', buttonHref: '/x' },
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
