import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrubSource } from '../sourceScan.mjs';

// The defect this pins: CourseFaqManager holds its rows in useDragReorder,
// which seeds useState ONCE and never resyncs from props. Delete and toggle
// always spliced and worked; create and edit relied on router.refresh() alone,
// so the new row was in the database and in the next RSC payload but never on
// screen (measured in a real browser — docs/admin-staleness-audit.md §7.3c).
//
// test/pure/localFaqList.test.mjs proves the ORDERING helpers are right. This
// file proves they are actually WIRED IN, which no pure test can see.
//
// WHAT IT CANNOT SEE, stated plainly: this is a source-shape guard, not a
// behavioural one. It cannot prove the splice runs at the right moment, only
// that the code names the helpers inside the right handlers. The behavioural
// evidence is the browser measurement in the audit doc; the render tier would
// be the place to close this, and is not attempted here.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, '..', '..', 'src', 'app', 'admin', '_components', 'CourseFaqManager.jsx');
const SRC = readFileSync(FILE, 'utf8');

/**
 * Comments and imports gone. An `import { insertLocalFaq } from …` line
 * satisfies a naive `src.includes('insertLocalFaq')` while the handler that
 * should call it does nothing — the same class of false pass as matching a tag
 * name inside a comment. Both removals live in test/sourceScan.mjs now.
 */
const bodyOf = (src) => scrubSource(src);

/**
 * Extract one function's body by name, so assertions cannot leak across
 * handlers — `handleDelete` splices correctly and would satisfy a
 * whole-file "does it call setRows" check while `handleSubmit` did nothing.
 *
 * NOTE `\r?\n`: the working tree is CRLF. A matcher written with a bare `\n`
 * silently matches nothing here, which for a "does NOT contain" assertion looks
 * exactly like a pass. The first draft of this file failed that way.
 */
function handler(name, src = SRC) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\r?\n {2}function \w+\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The check, as a pure predicate so a control can feed it a synthetic source. */
function spliceShape(submitBody) {
  return {
    splices: submitBody.includes('setRows('),
    inserts: submitBody.includes('insertLocalFaq'),
    replaces: submitBody.includes('replaceLocalFaq'),
  };
}

/** The handler exactly as it shipped BEFORE this fix — the defect, verbatim. */
const PRE_FIX_SUBMIT = `
        if (res?.ok === false) {
          setError(res.error || 'บันทึกไม่สำเร็จ');
          return;
        }
        setShowForm(false);
        setEditingFaq(null);
        router.refresh();
`;

const BODY = bodyOf(SRC);

test('CONTROL: the import block alone does not satisfy these assertions', () => {
  // If bodyOf were broken, every assertion below would pass off an import line.
  assert.ok(SRC.includes("import {"), 'the file does import the helpers');
  assert.ok(!BODY.includes('} from '), 'bodyOf really dropped the imports');
});

test('the create/edit success path splices the returned document', () => {
  assert.deepEqual(spliceShape(handler('handleSubmit')), {
    splices: true,
    inserts: true,
    replaces: true,
  });
});

test('CONTROL: the same predicate REJECTS the handler as it shipped before', () => {
  // Not a reconstruction of the current file — the actual prior source, held
  // as a fixture. That keeps the control independent of how the fixed version
  // happens to be formatted, and it is what proves the predicate discriminates
  // rather than merely passing.
  assert.deepEqual(spliceShape(PRE_FIX_SUBMIT), {
    splices: false,
    inserts: false,
    replaces: false,
  });
});

test('the create branch and the edit branch are distinguished', () => {
  // A splice that always inserted would duplicate the row on every edit.
  const submit = handler('handleSubmit');
  assert.ok(
    /editingFaq\s*\?\s*replaceLocalFaq|editingFaq\s*&&\s*replaceLocalFaq/.test(submit),
    'the edit branch is selected by editingFaq'
  );
});

test('delete still splices — the behaviour that already worked is not lost', () => {
  const del = handler('handleDelete');
  assert.ok(del.includes('setRows('), 'handleDelete splices');
  assert.ok(del.includes('removeLocalFaq'), 'through the shared helper');
});

test('the list is ordered through the shared comparator, not an inline one', () => {
  assert.ok(BODY.includes('sortLocalFaqs(initialFaqs)'), 'seed uses the shared sort');
  assert.ok(
    !/\.sort\(\s*\(a, b\)/.test(BODY),
    'no second, inline comparator — the splice and the render must agree'
  );
});

test('router.refresh is kept, and the file says why', () => {
  // Dropping it would stale the `FAQ (n)` tab label in ExtensionEditor, which
  // reads initialFaqs.length straight from the server prop. Keeping it without
  // saying why is how the next person deletes it.
  assert.ok(BODY.includes('router.refresh()'));
  assert.ok(
    SRC.includes('ExtensionEditor.jsx:138'),
    'the reason names the exact line that needs it'
  );
});

test('the reason given for keeping router.refresh is TRUE', () => {
  // A comment that cites a line number is worth nothing if the line moved or
  // never said that. Verify against the real file.
  const ext = readFileSync(
    path.join(HERE, '..', '..', 'src', 'app', 'admin', 'courses', '[courseId]', '_components', 'ExtensionEditor.jsx'),
    'utf8'
  );
  assert.ok(
    ext.includes('FAQ (${initialFaqs.length})'),
    'ExtensionEditor still derives the tab label from the server prop'
  );
  assert.ok(
    !/useState\s*\(\s*initialFaqs/.test(ext),
    'and reads the prop directly, so a route refresh does update it'
  );
});
