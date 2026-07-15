import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RENDERABLE_SECTION_TYPES } from '@/components/pageBuilder/SectionRenderer';
import { ALL_SECTION_TYPES } from '@/lib/schemas/pageBuilder';
import { SECTION_LABELS } from '@/lib/pageBuilder/sectionLabels';
import { isAdvancedType } from '@/lib/pages/tierSanitize';

test('RENDERABLE includes the 2C.2a authored data-backed types', () => {
  ['course_card', 'instructor_card', 'course_selector', 'bundle_courses', 'course_list']
    .forEach((t) => assert.ok(RENDERABLE_SECTION_TYPES.includes(t), `${t} should render`));
});
test('course_schedule (2C.2b) IS renderable now that it landed', () => {
  assert.ok(RENDERABLE_SECTION_TYPES.includes('course_schedule'));
});
test('RENDERABLE ⊆ schema types (nothing renders that cannot validate)', () => {
  assert.ok(RENDERABLE_SECTION_TYPES.every((t) => ALL_SECTION_TYPES.includes(t)));
});
test('every renderable type has a label', () => {
  assert.ok(RENDERABLE_SECTION_TYPES.every((t) => SECTION_LABELS[t]));
});
test('all 4 advanced types render (developer-tier picker is exercised)', () => {
  assert.ok(['custom_html', 'custom_css', 'embed', 'debug_json'].every((t) => isAdvancedType(t) && RENDERABLE_SECTION_TYPES.includes(t)));
});
