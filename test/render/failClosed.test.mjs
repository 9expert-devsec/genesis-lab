import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CtaSection } from '@/components/pageBuilder/sections/cta';
import { PriceCardSection } from '@/components/pageBuilder/sections/price_card';
import { StatCardSection } from '@/components/pageBuilder/sections/stat_card';
import { IconCardSection } from '@/components/pageBuilder/sections/icon_card';
import { CustomHtmlSection } from '@/components/pageBuilder/sections/custom_html';
import { CustomCssSection } from '@/components/pageBuilder/sections/custom_css';
import { EmbedSection } from '@/components/pageBuilder/sections/embed';
import { DebugJsonSection } from '@/components/pageBuilder/sections/debug_json';
import { CourseCardSection } from '@/components/pageBuilder/sections/course_card';
import { InstructorCardSection } from '@/components/pageBuilder/sections/instructor_card';
import { CourseSelectorSection } from '@/components/pageBuilder/sections/course_selector';

const R = (C, props) => renderToStaticMarkup(C(props));
const course = (id, name) => ({ course_id: id, course_name: name, course_price: 10, program: {} });

test('cta renders a button only with label AND safe href', () => {
  assert.ok(R(CtaSection, { content: { buttonLabel: 'Go', buttonHref: '/x' }, style: {} }).includes('Go'));
  assert.equal(R(CtaSection, { content: { buttonLabel: 'Go' }, style: {} }).includes('<a'), false);
});
test('price/stat/icon cards render nothing when empty', () => {
  assert.equal(R(PriceCardSection, { content: {}, style: {} }), '');
  assert.equal(R(StatCardSection, { content: {}, style: {} }), '');
  assert.equal(R(IconCardSection, { content: {}, style: {} }), '');
});
test('custom_html sanitizes (script stripped)', () => {
  const html = R(CustomHtmlSection, { content: { html: '<p>hi<script>alert(1)</script></p>' } });
  assert.ok(html.includes('hi') && !html.includes('<script'));
});
test('custom_css: no domId → nothing; valid id → scoped <style>', () => {
  assert.equal(R(CustomCssSection, { content: { css: '.a{color:red}' }, domId: undefined }), '');
  assert.equal(R(CustomCssSection, { content: { css: '.a{color:red}' }, domId: 'sec1' }), '<style>#sec1 .a{color:red}</style>');
});
test('custom_css drops document-level selectors (body)', () => {
  assert.ok(!R(CustomCssSection, { content: { css: 'body{color:red}' }, domId: 'sec1' }).includes('body'));
});
test('debug_json renders in the canvas only, never on a live page', () => {
  assert.ok(R(DebugJsonSection, { content: { json: '{"a":1}' }, inEditor: true }).includes('<pre'));
  assert.equal(R(DebugJsonSection, { content: { json: '{"a":1}' }, inEditor: false }), '');
});
test('embed: youtube URL builds a safe iframe; junk → nothing', () => {
  assert.ok(R(EmbedSection, { content: { provider: 'youtube', url: 'https://youtu.be/abcdef12345' } }).includes('youtube.com/embed/abcdef12345'));
  assert.equal(R(EmbedSection, { content: { provider: 'youtube', url: 'nope' } }), '');
});
test('data-backed components render from injected data, fail closed without it', () => {
  assert.ok(R(CourseCardSection, { data: course('A', 'Alpha') }).includes('Alpha'));
  assert.equal(R(CourseCardSection, { data: null }), '');
  assert.ok(R(InstructorCardSection, { data: { name: 'Jane', specialties: [] } }).includes('Jane'));
  assert.equal(R(InstructorCardSection, { data: null }), '');
  assert.ok(R(CourseSelectorSection, { content: { heading: 'Picks' }, data: [course('A', 'Alpha')] }).includes('Alpha'));
  assert.equal(R(CourseSelectorSection, { content: {}, data: [] }), '');
});
