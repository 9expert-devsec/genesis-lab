import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  CourseSearchSelect,
  notifyFormOfChange,
} from '@/app/admin/courses/_components/CourseSearchSelect';
import { readSource } from '../sourceScan.mjs';

/**
 * The claims about this control that the pure filter test cannot make.
 *
 * ── WHY NO REACT ROOT, AND THIS IS A MEASURED CONSTRAINT ────────────────────
 * The first version of this file mounted the component with `createRoot` over
 * jsdom so it could click real options. It worked, and it broke TWENTY-EIGHT
 * unrelated tests: `npm test` runs every file in ONE process (isolation:'none',
 * see test/run.mjs), so assigning globalThis.window/document for a React root
 * leaks into every `renderToStaticMarkup` test that shares the process.
 *
 * So the DOM facts are established without a React root:
 *   · markup comes from renderToStaticMarkup and is injected into a jsdom
 *     <form>, which is enough to construct a real FormData
 *   · the form-notification is an exported function, tested directly against a
 *     jsdom node — no React, no globals, no leak
 *   · that the component actually CALLS it, in an effect keyed on the value, is
 *     a source fact and is read through sourceScan
 *
 * ── WHAT THIS CANNOT SEE, stated rather than implied ────────────────────────
 * Real interaction. Nothing here clicks an option, types in the box, or presses
 * a key. Arrow-key traversal, Enter-to-select, Escape-to-close, the outside
 * click that closes the list, and the ORDER of React's commit-then-effect
 * relative to the dispatch are all unverified by this file and need a browser.
 */

const OPTIONS = [
  { course_id: 'MSE-L1', course_name_th: 'เอ็กเซล ระดับ 1' },
  { course_id: 'MSE-L2', course_name_th: 'เอ็กเซล ระดับ 2' },
];

/** Render the picker inside a real <form> in jsdom, and hand back both. */
function formWith(value) {
  const markup = renderToStaticMarkup(
    createElement(CourseSearchSelect, {
      name: 'previous_course',
      label: 'หลักสูตรก่อนหน้า',
      value,
      onChange: () => {},
      options: OPTIONS,
    })
  );
  const dom = new JSDOM(`<!doctype html><html><body><form id="f">${markup}</form></body></html>`);
  return { dom, form: dom.window.document.getElementById('f') };
}

test('the control renders a NAMED form control carrying the value', () => {
  const { dom, form } = formWith('MSE-L1');
  const fd = new dom.window.FormData(form);

  assert.equal(
    fd.get('previous_course'),
    'MSE-L1',
    'FormData did not see the field — CourseForm is uncontrolled and would submit nothing',
  );
});

test('the SEARCH box is unnamed and never reaches the payload', () => {
  const { form } = formWith('MSE-L1');
  const named = [...form.querySelectorAll('[name]')].map((el) => el.getAttribute('name'));

  assert.deepEqual(
    named,
    ['previous_course'],
    'exactly one named control expected; a named search box would submit junk',
  );

  const text = form.querySelector('input[type="text"]');
  assert.ok(text, 'no visible search box rendered');
  assert.equal(text.getAttribute('name'), null, 'the search box must not be named');
});

/**
 * THE SILENT-WIPE GUARD. 43 of 78 courses hold a previous_course and all 43
 * resolve today — this is for the day one does not (unpublished, renamed,
 * deleted). Blanking a field because its target moved is the wipe class this
 * repo keeps hitting.
 */
test('a stored id ABSENT from the options is still submitted, not blanked', () => {
  const { dom, form } = formWith('GONE-01');
  const fd = new dom.window.FormData(form);

  assert.equal(
    fd.get('previous_course'),
    'GONE-01',
    'a stored course missing from the option list was silently dropped',
  );

  // And the admin can see it, rather than an empty box that reads as "unset".
  assert.equal(form.querySelector('input[type="text"]').value, 'GONE-01');
});

test('with no selection the field is still SENT, as the empty string', () => {
  const { dom, form } = formWith('');
  const fd = new dom.window.FormData(form);

  assert.equal(fd.get('previous_course'), '', 'empty must be "" — shapePayload maps it to null');
  assert.notEqual(fd.get('previous_course'), null, 'the field must not vanish from the payload');
  assert.notEqual(fd.get('previous_course'), 'null', 'never the literal string "null"');
});

test('the clear control appears only when something is selected', () => {
  assert.ok(
    formWith('MSE-L1').form.querySelector('button[type="button"]'),
    'no way to clear back to ไม่มี while a value is set',
  );
  assert.equal(
    formWith('').form.querySelector('button[type="button"]'),
    null,
    'a clear button with nothing to clear',
  );
});

/**
 * THE DIRTY PATH. `touchedRef` is set ONLY by a rail setter or by an
 * input/change reaching the <form> (CourseForm.jsx:309-320). Assigning a hidden
 * input's value from React fires neither, so without this dispatch the
 * leave-guard stops protecting this field entirely.
 */
test('notifyFormOfChange dispatches a change that BUBBLES to the form', () => {
  const dom = new JSDOM('<!doctype html><html><body><form id="f"><input type="hidden" name="previous_course" value="MSE-L2"></form></body></html>');
  const prevWindow = globalThis.window;
  globalThis.window = dom.window;
  try {
    const form = dom.window.document.getElementById('f');
    const hidden = form.querySelector('input[name="previous_course"]');

    let heard = 0;
    let sawValue = null;
    form.addEventListener('change', () => {
      heard += 1;
      sawValue = new dom.window.FormData(form).get('previous_course');
    });

    assert.equal(notifyFormOfChange(hidden), true);
    assert.equal(heard, 1, 'no change event reached the form — it would never go dirty');
    assert.equal(sawValue, 'MSE-L2', 'the form read a different value than the control carries');
  } finally {
    globalThis.window = prevWindow;
  }
});

test('notifyFormOfChange is a no-op without an element, and says so', () => {
  const prevWindow = globalThis.window;
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.window = dom.window;
  try {
    assert.equal(notifyFormOfChange(null), false);
    assert.equal(notifyFormOfChange(undefined), false);
  } finally {
    globalThis.window = prevWindow;
  }
});

/**
 * That the component actually WIRES the dispatch up — a perfect helper that
 * nothing calls protects nothing. Read as code (imports stripped, comments
 * gone) through sourceScan, so a mention in prose cannot satisfy it.
 */
test('the component calls notifyFormOfChange from an effect keyed on the value', () => {
  const { code } = readSource('src/app/admin/courses/_components/CourseSearchSelect.jsx');
  const flat = code.replace(/\s+/g, ' ');

  assert.match(
    flat,
    /notifyFormOfChange\(hiddenRef\.current\)/,
    'the component no longer notifies the form of a change',
  );
  assert.match(
    flat,
    /notifyFormOfChange\(hiddenRef\.current\);\s*\}, \[value\]\)/,
    'the notification is not in an effect keyed on [value] — it must fire AFTER '
      + 'React commits the new value to the DOM, not during the click handler',
  );
  assert.match(
    flat,
    /didMountRef\.current/,
    'the mount guard is gone — every page load would dispatch a change, set '
      + 'touchedRef and make an untouched form look edited',
  );
});
