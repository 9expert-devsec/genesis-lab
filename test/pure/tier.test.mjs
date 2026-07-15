import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionSchema, ADVANCED_TYPES, CARD_TYPES } from '@/lib/schemas/pageBuilder';
import { isAdvancedType, sanitizePageForTier } from '@/lib/pages/tierSanitize';

test('isAdvancedType: all 4 advanced types are advanced-tier', () => {
  assert.ok(ADVANCED_TYPES.every((t) => isAdvancedType(t)));
});
test('isAdvancedType: cards + content are NOT advanced-tier', () => {
  assert.ok([...CARD_TYPES, 'heading', 'cta'].every((t) => !isAdvancedType(t)));
});

test('sanitizePageForTier: non-developer save DROPS a new advanced section', () => {
  const adv = sectionSchema.parse({ id: 'adv1', type: 'custom_html', content: { html: '<p>x</p>' } });
  const out = sanitizePageForTier({ sections: [adv], jsonLd: {} }, null, false);
  assert.equal(out.sections.length, 0);
});
test('sanitizePageForTier: developer save KEEPS the advanced section', () => {
  const adv = sectionSchema.parse({ id: 'adv1', type: 'custom_html', content: { html: '<p>x</p>' } });
  const out = sanitizePageForTier({ sections: [adv], jsonLd: {} }, null, true);
  assert.equal(out.sections.length, 1);
});
