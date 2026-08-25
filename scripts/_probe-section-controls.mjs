/**
 * ROUND 18 — the section × control matrix, measured rather than asserted.
 *
 * Two questions, two instruments, and they are deliberately separate:
 *
 *   OFFERED — which controls does the settings panel actually render for a
 *             type? Harvested by RENDERING the three tab bodies (the same
 *             components round 15's union check renders) and reading the field
 *             labels out of the DOM. Nothing is typed out by hand, so re-running
 *             this after a panel change reports the new truth.
 *
 *   READ    — does the value reach the output? Answered DIFFERENTIALLY: render
 *             the real SectionRenderer twice, with two values of one control,
 *             and compare the markup. A control whose two renders are
 *             byte-identical is not read. This is evidence, not inference — it
 *             does not care how many wrappers the value passes through.
 *
 * The fixtures matter: every 2C component fails closed and renders NOTHING when
 * its content is blank, and a differential over two empty renders shows no
 * difference for ANY control. So each type gets populated content, and the
 * data-backed types get resolvedData too.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_probe-section-controls.mjs
 * Emits JSON on stdout.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

const { ALL_SECTION_TYPES, CONTAINER_WIDTHS, SPACING, BACKGROUNDS, VISIBILITY, ACCENTS,
  CARD_STYLES, BUTTON_STYLES, RATIOS, COLUMNS, MOBILE_BEHAVIORS } =
  await import('@/lib/schemas/pageBuilder');
const { SectionRenderer } = await import('@/components/pageBuilder/SectionRenderer');
const { ContentTab, StyleTab, AdvancedGroup } = await import('@/components/pageBuilder/editor/SettingsPanel');

const noop = () => {};
const domOf = (el) => new JSDOM(`<!doctype html><body>${renderToStaticMarkup(el)}</body>`).window.document;
const fieldsIn = (doc) => [...doc.querySelectorAll('label > span:first-child')].map((s) => s.textContent.trim());

// ── OFFERED: harvested from the panel, per type ────────────────────────────

function offeredFor(type) {
  const content = fieldsIn(domOf(createElement(ContentTab, {
    type, content: {}, advanced: {}, resolved: null, patch: noop,
  })));
  const style = fieldsIn(domOf(createElement(StyleTab, {
    type, layout: {}, style: {}, settings: {}, patchKey: noop,
  })));
  const advanced = fieldsIn(domOf(createElement(AdvancedGroup, {
    path: ['sections', 0], advanced: {}, canUseAdvanced: true, dispatch: noop,
  })));
  return { content, style, advanced };
}

// ── FIXTURES: content populated enough that every type actually draws ──────

const TIPTAP = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'ข้อความ ' },
    { type: 'text', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }], text: 'ลิงก์' },
  ] }],
};
const ITEMS = [{ title: 'หนึ่ง', body: 'เนื้อหาหนึ่ง' }, { title: 'สอง', body: 'เนื้อหาสอง' }];
const CHILD = (id, text) => ({
  id, type: 'heading', content: { text, level: 'h3', align: 'left' },
  settings: {}, style: {}, layout: {}, advanced: {}, enabled: true, sortOrder: 0, name: '',
});

const CONTENT = {
  heading:         { text: 'หัวเรื่อง', level: 'h1', align: 'left' },
  rich_text:       { doc: TIPTAP },
  image:           { src: 'https://res.cloudinary.com/x/a.jpg', alt: 'ภาพ', caption: 'คำบรรยาย' },
  cta:             { heading: 'หัวข้อ', description: 'คำอธิบาย', buttonLabel: 'สมัคร', buttonHref: '/x' },
  checklist:       { items: [{ text: 'ข้อหนึ่ง', checked: true }, { text: 'ข้อสอง', checked: false }] },
  notice:          { text: 'ข้อความแจ้ง', variant: 'info' },
  full_width:      { children: [CHILD('c1', 'ลูกหนึ่ง'), CHILD('c2', 'ลูกสอง')] },
  container:       { children: [CHILD('c1', 'ลูกหนึ่ง'), CHILD('c2', 'ลูกสอง')] },
  two_column:      { left: [CHILD('l1', 'ซ้าย')], right: [CHILD('r1', 'ขวา')] },
  card_grid:       { children: [CHILD('c1', 'หนึ่ง'), CHILD('c2', 'สอง'), CHILD('c3', 'สาม')] },
  highlight_grid:  { children: [CHILD('c1', 'หนึ่ง'), CHILD('c2', 'สอง')] },
  timeline:        { items: ITEMS },
  tabs:            { tabs: ITEMS },
  accordion:       { items: ITEMS },
  price_card:      { title: 'แพ็กเกจ', price: '฿12,900', period: '/ คน', features: ['ก', 'ข'], buttonLabel: 'ซื้อ', buttonHref: '/buy', highlighted: true },
  stat_card:       { value: '1,200+', label: 'ผู้เรียน', icon: 'Users' },
  icon_card:       { icon: 'Sparkles', title: 'จุดเด่น', description: 'คำอธิบาย' },
  custom_html:     { html: '<p>สวัสดี</p>' },
  custom_css:      { css: '.x { color: red; }' },
  embed:           { provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  debug_json:      { json: '{"a":1}' },
  course_card:     { courseId: 'MSE-AI' },
  instructor_card: { instructorId: 'I1' },
  course_selector: { heading: 'คอร์สแนะนำ', courseIds: ['MSE-AI'] },
  bundle_courses:  { courseIds: ['MSE-AI'] },
  course_list:     { source: 'manual', courseIds: ['MSE-AI'], limit: 0 },
  course_schedule: { courseId: 'MSE-AI', limit: 0 },
};

const COURSE = {
  course_id: 'MSE-AI', course_name: 'AI สำหรับธุรกิจ', course_price: 12900,
  course_days: 2, program: { program_name: 'AI', programiconurl: '' },
};
const INSTRUCTOR = { name: 'ผู้สอน', title: 'อาจารย์', bio: 'ประวัติ', image_url: '', specialties: ['AI'] };
const SCHEDULES = [{ _id: 'abc', dates: ['2026-10-08', '2026-10-09'], status: 'open', type: 'classroom' }];

const RESOLVED = {
  course_card: COURSE,
  instructor_card: INSTRUCTOR,
  course_selector: [COURSE],
  bundle_courses: [COURSE],
  course_list: [COURSE],
  course_schedule: SCHEDULES,
};

const SECTION_ID = 'probe-section';

function section(type, over = {}) {
  return {
    id: 's1', type, name: '', enabled: true, sortOrder: 0,
    content: { ...(CONTENT[type] ?? {}) },
    // A valid sectionId throughout, so custom_css and advanced.customCss are
    // reachable rather than dropped before the differential can see them.
    settings: {}, style: {}, layout: {}, advanced: { sectionId: SECTION_ID },
    ...over,
  };
}

function render(type, over = {}, { inEditor = false } = {}) {
  const s = section(type, over);
  const resolvedData = RESOLVED[type] !== undefined ? { s1: RESOLVED[type] } : null;
  try {
    return renderToStaticMarkup(createElement(SectionRenderer, {
      section: s, resolvedData, path: inEditor ? ['sections', 0] : null,
    }));
  } catch (err) {
    return `__THREW__ ${err?.message ?? err}`;
  }
}

/**
 * The COMPONENT's own markup — everything the wrapper contributes removed.
 *
 * The wrapper is two elements deep, not one: SectionRenderer emits a <section>
 * (background / spacing / visibility / customClass / accent vars / id) and
 * inside it a `mx-auto px-4` div carrying containerWidth. Stripping only the
 * <section> leaves that div's class in the string, and every containerWidth
 * value then reads as "the component did something", which is the opposite of
 * true. Both go, plus the appended customHtml block, which is also the
 * wrapper's.
 */
function innerOf(markup) {
  if (typeof markup !== 'string' || markup.startsWith('__THREW__')) return markup;
  const doc = new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
  const sec = doc.querySelector('section');
  if (!sec) return markup;
  const box = sec.querySelector(':scope > div');
  if (!box) return sec.innerHTML;
  box.querySelector(':scope > .pb-custom-html')?.remove();
  return box.innerHTML;
}

// ── the differential ───────────────────────────────────────────────────────

/**
 * Vary one control across `values` and report what changed.
 *  whole  — did the FULL rendered markup differ between any two values?
 *  inner  — did the COMPONENT's own markup differ (wrapper stripped)?
 * The split is what separates "the wrapper stamped a class" from "the component
 * did something with it".
 */
function differential(type, apply, values, opts) {
  const whole = new Set();
  const inner = new Set();
  const threw = [];
  for (const v of values) {
    const m = render(type, apply(v), opts);
    if (typeof m === 'string' && m.startsWith('__THREW__')) threw.push({ value: v, error: m });
    whole.add(m);
    inner.add(innerOf(m));
  }
  return { distinctWhole: whole.size, distinctInner: inner.size, values: values.length, threw };
}

const put = (path, v) => {
  const [k, sub] = path.split('.');
  return { [k]: { [sub]: v, ...(k === 'advanced' ? { sectionId: SECTION_ID } : {}) } };
};

const ENVELOPE = [
  ['settings.containerWidth', CONTAINER_WIDTHS],
  ['settings.spacingTop', SPACING],
  ['settings.spacingBottom', SPACING],
  // 'hidden' is excluded: the renderer skips the section entirely, so it would
  // register as a difference for every type and tell us nothing about the rest.
  ['settings.background', BACKGROUNDS],
  ['settings.visibility', VISIBILITY.filter((v) => v !== 'hidden')],
  ['style.accentColor', ACCENTS],
  ['style.cardStyle', CARD_STYLES],
  ['style.buttonStyle', BUTTON_STYLES],
  ['layout.ratio', RATIOS],
  ['layout.columns', COLUMNS],
  ['layout.mobileBehavior', MOBILE_BEHAVIORS],
];

const ADVANCED = [
  ['advanced.customClass', ['', 'probe-a', 'probe-b']],
  ['advanced.customCss', ['', '.k { color: red }', '.k { color: blue }']],
  ['advanced.customHtml', ['', '<p>หนึ่ง</p>', '<p>สอง</p>']],
  ['advanced.sectionId', ['', 'probe-one', 'probe-two']],
];

const out = { generatedFor: ALL_SECTION_TYPES.length, types: {} };

for (const type of ALL_SECTION_TYPES) {
  const inEditor = type === 'debug_json'; // renders nothing outside the canvas, by design
  const baseline = render(type, {}, { inEditor });
  const row = {
    offered: offeredFor(type),
    rendersAtAll: innerOf(baseline).trim().length > 0,
    baselineLength: baseline.length,
    controls: {},
  };

  for (const [path, values] of ENVELOPE) {
    row.controls[path] = differential(type, (v) => put(path, v), values, { inEditor });
  }
  for (const [path, values] of ADVANCED) {
    row.controls[path] = differential(
      type,
      (v) => ({ advanced: path.endsWith('sectionId') ? { sectionId: v } : { sectionId: SECTION_ID, [path.split('.')[1]]: v } }),
      values,
      { inEditor },
    );
  }

  // Does the component's own markup name an accent var at all? This is what
  // separates "the wrapper set the variable" from "something consumes it".
  row.consumesAccentVar = /--pb-accent-/.test(innerOf(baseline));
  out.types[type] = row;
}

console.log(JSON.stringify(out, null, 1));
