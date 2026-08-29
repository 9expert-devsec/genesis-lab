/**
 * ROUND 55 — which control does a click inside each settings <label> activate?
 *
 * The report was "clicking the rich-text area toggles bold". A `<label>` with no
 * `for` attribute forwards a click on any non-interactive part of itself to its
 * FIRST LABELABLE DESCENDANT, and `<button>` is labelable. So the question is
 * not "does the rich text editor have a bug" but "for every field wrapper in
 * this panel, what does a stray click activate".
 *
 * Answered by MEASUREMENT rather than by reading: every content editor is
 * rendered, every <label> in the output is found, and its first labelable
 * descendant is reported. A field whose answer is its own single input is
 * correct — that is what a label is for. A field whose answer is a toolbar
 * button is the defect.
 *
 * LABELABLE, per HTML: button, input, select, textarea, output, meter,
 * progress. NOT a div[contenteditable] — which is exactly why the rich text
 * surface loses: the text the author clicks is not labelable, so the click
 * travels on to the first thing that is.
 *
 * READ-ONLY. Markup only — no React root, so nothing leaks into the suite's
 * shared process (round 45).
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_measure-round55-label-capture.mjs
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

const { SectionContentEditor } = await import('@/components/pageBuilder/editor/SectionContentEditor');

const LABELABLE = 'button, input, select, textarea, output, meter, progress';

const CATALOGUE = [{ course_id: 'MSE-AI', course_name: 'Excel AI' }];

/** One fixture per content editor, filled enough to render its controls. */
const TYPES = [
  ['heading', { text: 'หัวข้อ', level: 'h2' }],
  ['rich_text', { doc: { type: 'doc', content: [] } }],
  ['image', { src: '/a.jpg', alt: 'ก' }],
  ['cta', { heading: 'x', buttonLabel: 'ไป', buttonHref: '/a' }],
  ['notice', { text: 'x', variant: 'info' }],
  ['price_card', { title: 'x', price: '9', features: ['a'] }],
  ['stat_card', { value: '1', label: 'x', icon: 'rocket' }],
  ['icon_card', { icon: 'rocket', title: 'x', description: 'y' }],
  ['custom_html', { html: '<p>x</p>' }],
  ['custom_css', { css: 'p{color:red}' }],
  ['debug_json', { json: '{}' }],
  ['embed', { provider: 'youtube', url: 'https://youtu.be/x' }],
  ['course_card', { courseId: 'MSE-AI' }],
  ['instructor_card', { instructorId: 'I1' }],
  ['course_selector', { courseIds: ['MSE-AI'] }],
  ['bundle_courses', { courseIds: ['MSE-AI'] }],
  ['course_list', { source: 'manual', courseIds: ['MSE-AI'] }],
  ['course_schedule', { courseId: 'MSE-AI', limit: 0 }],
  ['checklist', { items: [{ text: 'a' }] }],
  ['timeline', { items: [{ title: 'a' }] }],
  ['accordion', { items: [{ title: 'a' }] }],
  ['tabs', { tabs: [{ title: 'a' }] }],
];

const describe = (el) => {
  if (!el) return null;
  const tag = el.tagName.toLowerCase();
  const type = el.getAttribute('type');
  const aria = el.getAttribute('aria-label');
  const testid = el.getAttribute('data-testid');
  return [tag, type && `type=${type}`, aria && `aria-label=${JSON.stringify(aria)}`, testid && `testid=${testid}`]
    .filter(Boolean).join(' ');
};

const rows = [];
for (const [type, content] of TYPES) {
  let markup;
  try {
    markup = renderToStaticMarkup(createElement(SectionContentEditor, {
      type, content, patch: () => {}, resolved: undefined, courses: CATALOGUE,
    }));
  } catch (e) {
    rows.push({ type, error: String(e?.message ?? e) });
    continue;
  }
  const doc = new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
  for (const label of doc.querySelectorAll('label')) {
    // A label with `for` names its control explicitly; none here do, but say so
    // rather than assuming.
    const htmlFor = label.getAttribute('for');
    const first = label.querySelector(LABELABLE);
    const count = label.querySelectorAll(LABELABLE).length;
    const text = (label.querySelector('span')?.textContent ?? '').trim();
    // Is there a contenteditable surface inside? That is the shape where an
    // author clicks something that is NOT the control the label activates.
    const editable = label.querySelector('[contenteditable]');
    rows.push({
      type,
      label: text.slice(0, 28),
      htmlFor: htmlFor ?? null,
      labelableCount: count,
      activates: describe(first),
      hasEditableSurface: Boolean(editable),
    });
  }
}

const suspect = rows.filter((r) => r.hasEditableSurface || (r.labelableCount ?? 0) > 1);

console.log('=== every <label> in the settings panel, and what a stray click activates ===\n');
for (const r of rows) {
  if (r.error) { console.log(`${r.type.padEnd(18)} RENDER ERROR: ${r.error}`); continue; }
  const flag = r.hasEditableSurface ? ' <<< EDITABLE SURFACE INSIDE'
    : (r.labelableCount > 1 ? ' <<< more than one control' : '');
  console.log(
    `${r.type.padEnd(18)} ${String(r.label).padEnd(30)} controls=${String(r.labelableCount).padStart(2)}  activates: ${r.activates}${flag}`
  );
}

console.log('\n=== THE ANSWER ===');
console.log(`labels measured                      : ${rows.filter((r) => !r.error).length}`);
console.log(`labels wrapping an editable surface  : ${rows.filter((r) => r.hasEditableSurface).length}`);
console.log(`labels wrapping >1 labelable control : ${rows.filter((r) => (r.labelableCount ?? 0) > 1).length}`);
console.log('\nsuspects:');
for (const r of suspect) {
  console.log(`  ${r.type} / ${r.label}: a stray click activates ${r.activates}`);
}
