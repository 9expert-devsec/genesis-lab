import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { newSection } from '@/lib/pageBuilder/newSection';

const course = (id, name) => ({ course_id: id, course_name: name, course_price: 10, program: {} });

test('SectionRenderer passes resolvedData[section.id] into the component', () => {
  const s = { ...newSection('course_card'), id: 'cc9', content: { courseId: 'X' } };
  const html = renderToStaticMarkup(SectionRenderer({ section: s, resolvedData: { cc9: course('X', 'Injected') } }));
  assert.ok(html.includes('Injected'));
});
test('SectionRenderer with no resolvedData → data-backed renders nothing', () => {
  const s = { ...newSection('course_card'), id: 'cc9', content: { courseId: 'X' } };
  assert.ok(!renderToStaticMarkup(SectionRenderer({ section: s })).includes('Injected'));
});
test('SectionRenderer end-to-end: card_grid with cards + data-backed contained', () => {
  const mk = (type, content, extra = {}) => ({ ...newSection(type), content, ...extra });
  const grid = mk('card_grid', {});
  grid.layout = { columns: 3 };
  grid.content = { children: [
    mk('stat_card', { value: '1,200+', label: 'Grads', icon: 'Users' }, { style: { cardStyle: 'border' } }),
    mk('course_card', { courseId: 'MISSING' }), // unresolved → renders nothing, contained
  ] };
  const html = renderToStaticMarkup(SectionRenderer({ section: grid, resolvedData: {} }));
  assert.ok(html.includes('1,200+'));           // sibling renders
  assert.ok(!html.includes('course_card'));      // unbuilt/unresolved is inert, no crash
});
