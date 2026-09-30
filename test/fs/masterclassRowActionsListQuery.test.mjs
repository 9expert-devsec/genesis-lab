import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The masterclass registrations row menu must RECEIVE `listQuery`.
 *
 * ── THE BUG ─────────────────────────────────────────────────────────────────
 * Production: /admin/masterclass/registrations → click ⋮ on any row → error
 * page, `ReferenceError: listQuery is not defined`. RowActionsMenu's
 * "ดูรายละเอียด" link read `listQuery`, which exists only as a prop of the
 * parent MasterclassRegistrationsClient. The menu body renders only while open,
 * so the page loaded fine and crashed on the click.
 *
 * Source-level, because RowActionsMenu is not exported and a render of the
 * parent needs the router and the whole list payload. Comments are scrubbed by
 * sourceScan, so a sentence mentioning listQuery cannot satisfy these.
 */

const FILE = 'src/app/admin/masterclass/registrations/_components/MasterclassRegistrationsClient.jsx';
const { code } = readSource(FILE);

/** The destructured parameter names of `function RowActionsMenu({ … })`. */
function rowMenuParams(src) {
  const m = src.match(/function RowActionsMenu\(\{([^}]*)\}\)/);
  if (!m) return null;
  return m[1].split(',').map((p) => p.trim().split(/[\s=:]/)[0]).filter(Boolean);
}

/** The whole `<RowActionsMenu … />` element at its call site. */
function rowMenuCallSite(src) {
  const m = src.match(/<RowActionsMenu\b[\s\S]*?\/>/);
  return m ? m[0] : null;
}

/** The body of RowActionsMenu, up to the next top-level function. */
function rowMenuBody(src) {
  const start = src.indexOf('function RowActionsMenu(');
  if (start < 0) return null;
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

test('RowActionsMenu declares listQuery among its props', () => {
  const params = rowMenuParams(code);
  assert.ok(params, 'RowActionsMenu is no longer `function RowActionsMenu({ … })` — re-anchor this guard');
  assert.ok(params.includes('listQuery'), `params are ${params.join(', ')}`);
});

test('the call site passes listQuery={listQuery}', () => {
  const site = rowMenuCallSite(code);
  assert.ok(site, 'no <RowActionsMenu … /> call site');
  assert.match(site, /\blistQuery=\{listQuery\}/);
});

test('the parent really has listQuery to pass (it is a prop of the client)', () => {
  assert.match(code, /export function MasterclassRegistrationsClient\(\{[^}]*\blistQuery\b/);
});

test('every use of listQuery inside RowActionsMenu is covered by its params', () => {
  const body = rowMenuBody(code);
  assert.ok(body);
  if (/\blistQuery\b/.test(body.slice(body.indexOf(')') + 1))) {
    assert.ok(rowMenuParams(code).includes('listQuery'));
  }
});

test('CONTROL: the extractors see a missing prop and a missing pass', () => {
  const broken = 'function RowActionsMenu({ reg, isOpen, busy }) {\n  return withListQuery(x, listQuery);\n}\n'
    + '<RowActionsMenu\n  reg={reg}\n  busy={b}\n/>';
  assert.deepEqual(rowMenuParams(broken), ['reg', 'isOpen', 'busy']);
  assert.doesNotMatch(rowMenuCallSite(broken), /\blistQuery=\{listQuery\}/);
  assert.deepEqual(rowMenuParams("function RowActionsMenu({ reg, listQuery = '', busy })"), ['reg', 'listQuery', 'busy']);
});
