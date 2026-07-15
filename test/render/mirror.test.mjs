import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { sectionRendersEmpty } from '@/lib/pageBuilder/sectionLabels';
import { HeadingSection } from '@/components/pageBuilder/sections/heading';
import { ImageSection } from '@/components/pageBuilder/sections/image';
import { PriceCardSection } from '@/components/pageBuilder/sections/price_card';
import { StatCardSection } from '@/components/pageBuilder/sections/stat_card';
import { IconCardSection } from '@/components/pageBuilder/sections/icon_card';
import { CustomHtmlSection } from '@/components/pageBuilder/sections/custom_html';
import { EmbedSection } from '@/components/pageBuilder/sections/embed';

/**
 * The tree's "ว่าง" marker must agree with what the component actually renders —
 * the only way it can lie is by disagreeing here. Compare both on the same
 * inputs (item 1: the strongest form of the mirror check).
 */
const CASES = [
  ['heading', HeadingSection, {}, { text: 'hi' }],
  ['image', ImageSection, {}, { src: 'https://cdn/x.jpg' }],
  ['price_card', PriceCardSection, {}, { title: 'Pro', price: '฿1' }],
  ['stat_card', StatCardSection, {}, { value: '10', label: 'x' }],
  ['icon_card', IconCardSection, {}, { title: 'T' }],
  ['custom_html', CustomHtmlSection, {}, { html: '<p>x</p>' }],
  ['embed', EmbedSection, { provider: 'youtube', url: '' }, { provider: 'youtube', url: 'https://youtu.be/abcdef12345' }],
];

for (const [type, C, emptyContent, fullContent] of CASES) {
  test(`${type}: marker agrees with render (empty + filled)`, () => {
    const renders = (content) => renderToStaticMarkup(C({ content, style: {} })) === '';
    assert.equal(sectionRendersEmpty({ type, content: emptyContent }), renders(emptyContent), 'empty case');
    assert.equal(sectionRendersEmpty({ type, content: fullContent }), renders(fullContent), 'filled case');
  });
}
