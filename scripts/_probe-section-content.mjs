/**
 * ROUND 18 — the content half of the matrix, measured the same way.
 *
 * Companion to _probe-section-controls.mjs, which covers the envelope
 * (settings/style/layout/advanced). This one asks the same question of each
 * type's OWN content fields: change the value, does the rendered output change?
 *
 * The value pairs are chosen per key so that "no difference" can only mean the
 * renderer ignored it — two distinguishable, schema-valid values, never a pair
 * that a fail-closed component would reject at both ends.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_probe-section-content.mjs
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

const { ALL_SECTION_TYPES, sectionSchema } = await import('@/lib/schemas/pageBuilder');
const { SectionRenderer } = await import('@/components/pageBuilder/SectionRenderer');
const { ContentTab } = await import('@/components/pageBuilder/editor/SettingsPanel');

const noop = () => {};
const domOf = (el) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(el)}</body>`).window.document;
const fieldsIn = (doc) => [...doc.querySelectorAll('label > span:first-child')].map((s) => s.textContent.trim());

/** The content keys the SCHEMA declares for each type — not a typed-out list. */
function contentKeys(type) {
  const opt = sectionSchema.options.find((o) => o.shape.type.value === type);
  let c = opt?.shape?.content;
  while (c && c._def && (c._def.innerType || c._def.schema)) c = c._def.innerType ?? c._def.schema;
  return c?.shape ? Object.keys(c.shape) : [];
}

const CHILD = (id, text) => ({
  id, type: 'heading', content: { text, level: 'h3', align: 'left' },
  settings: {}, style: {}, layout: {}, advanced: {}, enabled: true, sortOrder: 0, name: '',
});
const doc1 = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'หนึ่ง' }] }] };
const doc2 = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'สอง' }] }] };

/** Baseline content per type — populated, because every 2C type fails closed. */
const BASE = {
  heading:         { text: 'หัวเรื่อง', level: 'h1', align: 'left' },
  rich_text:       { doc: doc1 },
  image:           { src: 'https://res.cloudinary.com/x/a.jpg', publicId: 'x/a', alt: 'ภาพ', caption: 'คำบรรยาย' },
  cta:             { heading: 'หัวข้อ', description: 'คำอธิบาย', buttonLabel: 'สมัคร', buttonHref: '/x' },
  checklist:       { items: [{ text: 'ข้อหนึ่ง', checked: true }] },
  notice:          { text: 'ข้อความ', variant: 'info' },
  full_width:      { children: [CHILD('c1', 'ลูกหนึ่ง')] },
  container:       { children: [CHILD('c1', 'ลูกหนึ่ง')] },
  two_column:      { left: [CHILD('l1', 'ซ้าย')], right: [CHILD('r1', 'ขวา')] },
  card_grid:       { children: [CHILD('c1', 'หนึ่ง')] },
  highlight_grid:  { children: [CHILD('c1', 'หนึ่ง')] },
  timeline:        { items: [{ title: 'ก', body: 'ข' }] },
  tabs:            { tabs: [{ title: 'ก', body: 'ข' }] },
  accordion:       { items: [{ title: 'ก', body: 'ข' }] },
  price_card:      { title: 'แพ็กเกจ', price: '฿12,900', period: '/ คน', features: ['ก'], buttonLabel: 'ซื้อ', buttonHref: '/buy', highlighted: false },
  stat_card:       { value: '1,200+', label: 'ผู้เรียน', icon: 'Users' },
  icon_card:       { icon: 'Sparkles', title: 'จุดเด่น', description: 'คำอธิบาย' },
  custom_html:     { html: '<p>หนึ่ง</p>' },
  custom_css:      { css: '.k { color: red }' },
  embed:           { provider: 'youtube', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', html: '<iframe src="https://www.youtube.com/embed/x"></iframe>' },
  debug_json:      { json: '{"a":1}' },
  course_card:     { courseId: 'MSE-AI' },
  instructor_card: { instructorId: 'I1' },
  course_selector: { courseIds: ['MSE-AI'], heading: 'คอร์สแนะนำ' },
  bundle_courses:  { courseIds: ['MSE-AI'] },
  course_list:     { source: 'manual', courseIds: ['MSE-AI'], filter: '', limit: 0 },
  course_schedule: { courseId: 'MSE-AI', limit: 0 },
};

/**
 * Two distinguishable values per key. Where the resolver — not the renderer —
 * owns a key (courseId, courseIds, source, filter, limit), that is recorded
 * here rather than hidden: the renderer draws `data`, so varying the key with
 * `data` held constant correctly reports the RENDERER as not reading it.
 */
const PAIRS = {
  text: ['หนึ่ง', 'สอง'], level: ['h1', 'h4'], align: ['left', 'right'],
  doc: [doc1, doc2],
  src: ['https://res.cloudinary.com/x/a.jpg', 'https://res.cloudinary.com/x/b.jpg'],
  publicId: ['x/a', 'x/b'], alt: ['ภาพหนึ่ง', 'ภาพสอง'], caption: ['คำหนึ่ง', 'คำสอง'],
  heading: ['หัวหนึ่ง', 'หัวสอง'], description: ['คำหนึ่ง', 'คำสอง'],
  buttonLabel: ['ปุ่มหนึ่ง', 'ปุ่มสอง'], buttonHref: ['/one', '/two'],
  items: [[{ text: 'ก', checked: true, title: 'ก', body: 'ก' }], [{ text: 'ข', checked: false, title: 'ข', body: 'ข' }]],
  tabs: [[{ title: 'ก', body: 'ก' }], [{ title: 'ข', body: 'ข' }]],
  variant: ['info', 'error'],
  children: [[CHILD('c1', 'หนึ่ง')], [CHILD('c1', 'สอง')]],
  left: [[CHILD('l1', 'ซ้ายหนึ่ง')], [CHILD('l1', 'ซ้ายสอง')]],
  right: [[CHILD('r1', 'ขวาหนึ่ง')], [CHILD('r1', 'ขวาสอง')]],
  title: ['ชื่อหนึ่ง', 'ชื่อสอง'], price: ['฿1', '฿2'], period: ['/ คน', '/ เดือน'],
  features: [['ก'], ['ข']], highlighted: [false, true],
  value: ['1', '2'], label: ['ป้ายหนึ่ง', 'ป้ายสอง'], icon: ['Users', 'Star'],
  html: ['<p>หนึ่ง</p>', '<p>สอง</p>'], css: ['.k { color: red }', '.k { color: blue }'],
  json: ['{"a":1}', '{"b":2}'],
  provider: ['youtube', 'vimeo'],
  url: ['https://www.youtube.com/watch?v=aaaaaaaaaaa', 'https://www.youtube.com/watch?v=bbbbbbbbbbb'],
  courseId: ['MSE-AI', 'MSE-BI'], instructorId: ['I1', 'I2'],
  courseIds: [['MSE-AI'], ['MSE-BI']],
  source: ['manual', 'skill'], filter: ['a', 'b'], limit: [0, 1],
};

const COURSE = { course_id: 'MSE-AI', course_name: 'คอร์ส', course_price: 1, course_days: 1, program: {} };
const RESOLVED = {
  course_card: COURSE, instructor_card: { name: 'ผู้สอน' },
  course_selector: [COURSE], bundle_courses: [COURSE], course_list: [COURSE],
  course_schedule: [{ _id: 'a', dates: ['2026-10-08'], status: 'open', type: 'online' }],
};
const SECTION_ID = 'probe-section';

function render(type, content) {
  const s = {
    id: 's1', type, name: '', enabled: true, sortOrder: 0, content,
    settings: {}, style: {}, layout: {}, advanced: { sectionId: SECTION_ID },
  };
  const resolvedData = RESOLVED[type] !== undefined ? { s1: RESOLVED[type] } : null;
  try {
    return renderToStaticMarkup(createElement(SectionRenderer, {
      section: s, resolvedData, path: type === 'debug_json' ? ['sections', 0] : null,
    }));
  } catch (err) {
    return `__THREW__ ${err?.message ?? err}`;
  }
}

const out = {};
for (const type of ALL_SECTION_TYPES) {
  const base = BASE[type] ?? {};
  const panelFields = fieldsIn(domOf(createElement(ContentTab, {
    type, content: base, advanced: {}, resolved: RESOLVED[type] ?? null, patch: noop,
  })));
  const baseline = render(type, base);
  const row = { panelFields, drawsSomething: baseline.length > 0, keys: {} };

  for (const key of contentKeys(type)) {
    const pair = PAIRS[key];
    if (!pair) { row.keys[key] = 'NO_PAIR_DEFINED'; continue; }
    const a = render(type, { ...base, [key]: pair[0] });
    const b = render(type, { ...base, [key]: pair[1] });
    row.keys[key] = a.startsWith('__THREW__') || b.startsWith('__THREW__')
      ? `THREW: ${(a.startsWith('__THREW__') ? a : b).slice(0, 120)}`
      : (a === b ? 'SAME' : 'DIFFERS');
  }
  out[type] = row;
}

console.log(JSON.stringify(out, null, 1));
