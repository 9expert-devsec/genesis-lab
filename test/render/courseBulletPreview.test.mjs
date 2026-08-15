import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { BulletTextarea } from '@/components/admin/BulletTextarea';
import { readSource } from '../sourceScan.mjs';

/**
 * The preview mirrors the public page and changes NOTHING that is submitted.
 *
 * ── NO REACT ROOT ───────────────────────────────────────────────────────────
 * Static markup injected into a jsdom <form>, never `createRoot`. The runner is
 * isolation:'none' — one shared process — so a React root's globalThis.window /
 * document leak into every renderToStaticMarkup test in the run. That cost 28
 * unrelated failures once already.
 *
 * ── WHAT THIS FILE CANNOT SEE ───────────────────────────────────────────────
 * Typing. renderToStaticMarkup runs no effects and dispatches no events, so the
 * preview is observed only for the seeded value. That the preview UPDATES as
 * the admin types is React re-rendering from `value` state and is unverified
 * here; it needs a browser.
 */

const REAL_OBJECTIVES = [
  'ออกแบบและพัฒนา AI Workflow ตั้งแต่เริ่มต้น ช่วยงานอัตโนมัติได้ ทำงานได้ 24/7',
  'เชื่อมต่อ API ภายนอกเข้ากับ Workflow',
];
const REAL_REQUIREMENTS = ['1.3GHz or faster core speed', '8GB RAM or more'];

/** Render one BulletTextarea inside a real <form> in jsdom. */
function formWith(props) {
  const markup = renderToStaticMarkup(createElement(BulletTextarea, props));
  const dom = new JSDOM(
    `<!doctype html><html><body><form id="f">${markup}</form></body></html>`
  );
  return { dom, form: dom.window.document.getElementById('f') };
}

test('the textarea is still the only named control, carrying the raw lines', () => {
  const { dom, form } = formWith({
    name: 'course_objectives',
    defaultValue: REAL_OBJECTIVES,
    marker: 'number',
  });

  const named = [...form.querySelectorAll('[name]')].map((el) => el.getAttribute('name'));
  assert.deepEqual(named, ['course_objectives'], 'exactly one named control expected');

  const fd = new dom.window.FormData(form);
  assert.equal(
    fd.get('course_objectives'),
    REAL_OBJECTIVES.join('\n'),
    'FormData did not carry the typed lines verbatim',
  );
});

/**
 * THE POINT OF THE WHOLE ROUND. A marker in the submitted value would be
 * rendered on top of the public page's own, giving "1. 1. …", and the next save
 * would persist it.
 */
test('NO marker leaks into the submitted value', () => {
  for (const [marker, items] of [['number', REAL_OBJECTIVES], ['check', REAL_REQUIREMENTS]]) {
    const { dom, form } = formWith({ name: 'f', defaultValue: items, marker });
    const submitted = new dom.window.FormData(form).get('f');

    assert.equal(submitted, items.join('\n'), `${marker}: value was altered`);
    assert.ok(!/^\s*\d+\.\s/m.test(submitted), `${marker}: a number reached the value`);
    assert.ok(!/[✓✔☑]/.test(submitted), `${marker}: a check glyph reached the value`);
  }
});

test('marker="number" previews an ordered list numbered like the public page', () => {
  const { form } = formWith({
    name: 'course_objectives',
    defaultValue: REAL_OBJECTIVES,
    marker: 'number',
  });

  const ol = form.querySelector('ol');
  assert.ok(ol, 'no ordered list rendered for marker="number"');
  const rows = [...ol.querySelectorAll('li')];
  assert.equal(rows.length, REAL_OBJECTIVES.length);
  assert.ok(rows[0].textContent.startsWith('1.'), 'first row is not numbered "1."');
  assert.ok(rows[1].textContent.startsWith('2.'), 'second row is not numbered "2."');
  assert.ok(rows[0].textContent.includes(REAL_OBJECTIVES[0]), 'row text missing');
});

test('marker="check" previews an unordered list with a check icon per row', () => {
  const { form } = formWith({
    name: 'course_system_requirements',
    defaultValue: REAL_REQUIREMENTS,
    marker: 'check',
  });

  assert.equal(form.querySelector('ol'), null, 'check lists must not be numbered');
  const ul = form.querySelector('ul');
  assert.ok(ul, 'no list rendered for marker="check"');

  const rows = [...ul.querySelectorAll('li')];
  assert.equal(rows.length, REAL_REQUIREMENTS.length);
  assert.equal(rows.length, ul.querySelectorAll('svg').length, 'one icon per row expected');
  // The spec text must survive verbatim — "1.3GHz" is not a list marker.
  assert.ok(rows[0].textContent.includes('1.3GHz or faster core speed'));
});

test('no marker prop → no preview at all, so other forms are unchanged', () => {
  const { form } = formWith({ name: 'bullets', defaultValue: REAL_OBJECTIVES });

  assert.equal(form.querySelector('ol'), null);
  assert.equal(form.querySelector('ul'), null);
  assert.ok(form.querySelector('textarea'), 'the textarea must still render');
});

test('an empty field renders no preview and still submits the key', () => {
  const { dom, form } = formWith({ name: 'course_prerequisites', defaultValue: [], marker: 'check' });

  assert.equal(form.querySelector('ul'), null, 'an empty list previewed nothing-shaped rows');
  const fd = new dom.window.FormData(form);
  assert.equal(fd.get('course_prerequisites'), '', 'the key must still be present and empty');
  assert.notEqual(fd.get('course_prerequisites'), null, 'the key vanished from the payload');
});

test('the preview is hidden from assistive tech — it duplicates the textarea', () => {
  const { form } = formWith({ name: 'f', defaultValue: REAL_OBJECTIVES, marker: 'number' });
  const preview = form.querySelector('ol').closest('[aria-hidden="true"]');
  assert.ok(preview, 'the preview is not aria-hidden; every item would be announced twice');
});

/**
 * The wiring, read as code so a mention in a comment cannot satisfy it: the
 * four fields must ask for the marker their public counterpart draws.
 */
test('CourseForm asks for the markers the public page actually uses', () => {
  const { code } = readSource('src/app/admin/courses/_components/CourseForm.jsx');
  const flat = code.replace(/\s+/g, ' ');

  assert.match(
    flat,
    /name="course_objectives"[^>]*marker="number"/,
    'course_objectives must preview as a NUMBERED list (CourseObjectives.jsx:12)',
  );
  for (const field of [
    'course_target_audience',
    'course_prerequisites',
    'course_system_requirements',
  ]) {
    assert.match(
      flat,
      new RegExp(`name="${field}"[^>]*marker="check"`),
      `${field} must preview as a CHECK list, like its public renderer`,
    );
  }

  // And `bullets` deliberately gets none — it has no public list of its own.
  assert.ok(
    !/name="bullets"[^>]*marker=/.test(flat),
    'bullets gained a marker; it has no matching public list',
  );
});
