import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { preview, AuditRowDetail } from '@/components/audit/auditRowParts';
import {
  LEGACY_STATUS_LABELS,
  INHOUSE_STATUS_VALUES,
  PUBLIC_STATUS_VALUES,
  buildStatusLabels,
  PUBLIC_STATUSES,
  INHOUSE_STATUSES,
} from '@/lib/registrations/statuses';

/**
 * THE AUDIT TRAIL RENDERS RETIRED STATUSES IN THAI, AND KEEPS THE RAW PAYLOAD.
 *
 * ── THE SITUATION THIS EXISTS FOR ───────────────────────────────────────────
 * `admin_audit_logs` holds in-house rows whose before/after carry `new`,
 * `contacted`, `closed-won` and `closed-lost`. Round 2 retired all four from
 * the product. Those rows are HISTORICAL FACT and are deliberately NOT migrated
 * — the trail is only evidence because nothing in it is ever rewritten — so the
 * values will be in there forever, and the compact line was printing them as
 * bare English enum strings that nothing else on any screen could explain.
 *
 * ── WHY THIS TESTS `preview` DIRECTLY RATHER THAN THE PANEL ─────────────────
 * RecordHistoryPanel is COLLAPSED by default (`useState(false)`), so
 * `renderToStaticMarkup` of the panel emits the header button and no rows at
 * all — every assertion about row text would pass on markup that contains no
 * rows. Opening it needs a click, and this suite forbids `createRoot` over
 * jsdom for a measured reason (it leaks globalThis.window into every other
 * render test under isolation:'none' and once broke twenty-eight of them).
 *
 * So the compact line is tested at its function, and the expanded block — which
 * IS reachable, because AuditRowDetail takes no open/closed state — is rendered
 * for real. Between them that is both halves of what a reader sees.
 *
 * ── THAI MATCHING ───────────────────────────────────────────────────────────
 * Thai negates by PREFIX: 'ไม่สำเร็จ' contains 'สำเร็จ'. `preview` returns a
 * bare string rather than markup, so the assertions below are EQUALITY, not
 * `includes` — which is stricter than element-boundary matching and immune to
 * the prefix problem entirely. The rendered-markup assertions use `>text<`.
 */

const LIVE_LABELS = {
  ...buildStatusLabels(PUBLIC_STATUSES),
  ...buildStatusLabels(INHOUSE_STATUSES),
};

// ── 1. Every retired value renders in Thai ──────────────────────────────────

test('preview renders each RETIRED status as its Thai label, not the raw enum', () => {
  for (const [value, label] of Object.entries(LEGACY_STATUS_LABELS)) {
    assert.equal(preview({ status: value }), label,
      `a ${value} audit row still shows the raw enum`);
  }
});

test('preview renders every LIVE status in Thai too, for both sources', () => {
  // The retired half above would be satisfied by a lookup that only knew the
  // legacy map. This is the other half of the same claim.
  for (const value of [...PUBLIC_STATUS_VALUES, ...INHOUSE_STATUS_VALUES]) {
    assert.equal(preview({ status: value }), LIVE_LABELS[value],
      `a live ${value} audit row does not render its label`);
  }
});

test('CONTROL: the labels really are different from the values', () => {
  // Without this, `preview` could be returning `String(value.status)` — the old
  // behaviour — and every assertion above would still pass if a "label" ever
  // happened to equal its value.
  for (const [value, label] of Object.entries(LEGACY_STATUS_LABELS)) {
    assert.notEqual(label, value, `${value} has a label identical to its value — the control is inert`);
  }
  assert.notEqual(preview({ status: 'new' }), 'new', 'preview returned the raw enum');
});

// ── 2. An unknown value is shown, not hidden ────────────────────────────────

test('preview returns an UNKNOWN status unchanged rather than a dash', () => {
  // A payload from a collection the status module has never heard of — a future
  // menu, or a row written before the vocabulary existed. Replacing it with '—'
  // would hide evidence in the one place that exists to preserve it.
  assert.equal(preview({ status: 'zz-from-somewhere-else' }), 'zz-from-somewhere-else');
});

// ── 3. Everything else about preview is unchanged ───────────────────────────

test('preview still handles null, scalars and multi-key payloads', () => {
  assert.equal(preview(null), '—');
  assert.equal(preview(undefined), '—');
  assert.equal(preview('plain'), 'plain');
  assert.equal(preview(7), '7');
  assert.equal(preview({ a: 1, b: 2 }), '{a, b}');
  assert.equal(preview({ a: 1, b: 2, c: 3, d: 4 }), '{a, b, c…}');
});

test('a payload with `status` PLUS another key is not label-substituted', () => {
  // The substitution is only correct for the single-key `{status}` shape the
  // registration actions write. A richer payload is summarised by its KEYS, and
  // silently labelling one of them would misrepresent what was recorded.
  assert.equal(preview({ status: 'new', note: 'x' }), '{status, note}');
});

// ── 4. THE EXPANDED BLOCK STAYS RAW — the evidence, exactly as stored ───────

/**
 * The compact line is for reading; the detail is for PROOF. It renders
 * `JSON.stringify(row.before)` and must go on doing so: if the expanded block
 * were labelled too, the row would no longer show what is actually in the
 * database, and the one place an argument about a status change gets settled
 * would be showing an interpretation rather than the record.
 */
/**
 * `&quot;` — React escapes the JSON's double quotes into HTML entities, so a
 * naive `includes('"status": "contacted"')` finds nothing and the assertion
 * fails on completely correct output. MEASURED, not anticipated: that is
 * exactly how this test failed first. Unescaping is the honest fix; matching
 * the entity form directly would work too but reads as noise.
 */
const unescape = (markup) => markup.replace(/&quot;/g, '"');

test('AuditRowDetail renders the STORED value, not the label', () => {
  const markup = unescape(renderToStaticMarkup(createElement(AuditRowDetail, {
    row: { before: { status: 'contacted' }, after: { status: 'closed-won' }, meta: null },
    flags: [],
  })));
  assert.ok(markup.includes('"status": "contacted"'), 'the stored before value is gone from the detail');
  assert.ok(markup.includes('"status": "closed-won"'), 'the stored after value is gone from the detail');
});

test('CONTROL: the unescape does real work — the raw markup IS entity-encoded', () => {
  // If React ever stopped escaping, the helper above would be a no-op and this
  // says so rather than leaving a silent nothing in the test.
  const raw = renderToStaticMarkup(createElement(AuditRowDetail, {
    row: { before: { status: 'contacted' }, after: null, meta: null },
    flags: [],
  }));
  assert.ok(raw.includes('&quot;'), 'the markup is not entity-encoded — the unescape helper is inert');
  assert.ok(!raw.includes('"status": "contacted"'), 'the raw markup already contains the plain form');
});

test('CONTROL: the detail block really did render, and really is raw', () => {
  // Proves the assertion above is not passing on an empty string, and that the
  // two halves of this file genuinely differ: the same value renders as Thai on
  // the line and as the raw enum in the block.
  const markup = renderToStaticMarkup(createElement(AuditRowDetail, {
    row: { before: { status: 'contacted' }, after: null, meta: null },
    flags: [],
  }));
  assert.ok(markup.length > 100, 'the detail block collapsed to near-nothing');
  assert.ok(markup.includes('ก่อน'), 'the before column header is missing');
  assert.ok(!markup.includes(LEGACY_STATUS_LABELS.contacted),
    'the detail block was labelled — it must stay raw');
  assert.equal(preview({ status: 'contacted' }), LEGACY_STATUS_LABELS.contacted,
    'the compact line was NOT labelled — the two halves are not actually different');
});
