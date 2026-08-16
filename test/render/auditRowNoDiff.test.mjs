import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuditDiff, hasDiff } from '@/components/audit/auditRowParts';
import { RecordHistoryPanel } from '@/components/audit/RecordHistoryPanel';
import { HISTORY_STATE } from '@/lib/audit/auditQuery';
import { readSource } from '../sourceScan.mjs';
import { statusLabel } from '@/lib/registrations/statuses';

/**
 * THE AUDIT ROW THAT READ `update — → —`.
 *
 * ── WHAT WAS WRONG, AND WHAT WAS NOT ───────────────────────────────────────
 * A field edit on a registration renders an arrow between two dashes, and it
 * reads as a broken row. THE DATA IS CORRECT. lib/actions/registrations.js
 * records no before/after for a field edit, deliberately and with its reason in
 * a comment: the `update` object can carry names, emails, phone numbers and tax
 * ids, the audit collection is append-only and presently forever, so a payload
 * copied into it could never be redacted when a deletion request arrives.
 * Status transitions are the one exception — `{status}` is a short enum.
 *
 * So this is a DISPLAY fix. The row is not wrong and it is not missing; the
 * PRESENTATION promises a diff and has none to show. It must not gain the diff
 * and it must not be removed.
 *
 * ── THE ASSERTIONS ARE ABOUT ELEMENT SHAPE, NOT ABOUT THE STRING "—" ───────
 * `!markup.includes('—')` would be satisfied by every other empty rendering
 * anybody might reach for — an em dash swapped for a hyphen, a non-breaking
 * space, an empty span reserving the room, a bare arrow with nothing either
 * side. Each of those is the same defect wearing different clothes, and a ban on
 * remembered strings only ever bans the strings somebody remembered.
 *
 * What is asserted instead is that the diff renders ZERO ELEMENTS, which no
 * placeholder satisfies.
 */

const ACT_ONLY = {
  _id: 'r1',
  action: 'update',
  before: null,
  after: null,
  meta: null,
  createdAt: '2026-08-10T03:00:00.000Z',
  actor: { name: 'แอดมิน หนึ่ง' },
};

const TRANSITION = {
  _id: 'r2',
  action: 'status',
  before: { status: 'pending' },
  after: { status: 'cancelled' },
  meta: null,
  createdAt: '2026-08-11T03:00:00.000Z',
  actor: { name: 'แอดมิน สอง' },
};

const diffMarkup = (row) => renderToStaticMarkup(createElement(AuditDiff, { row }));

// ── 1. The component, at its own boundary ───────────────────────────────────

test('a row with no recorded diff renders NO elements at all', () => {
  const markup = diffMarkup(ACT_ONLY);
  assert.equal(markup, '',
    `the diff rendered ${JSON.stringify(markup)}. A row that records the act and not the values must `
    + 'render nothing — an empty span reserving the space is the same defect, and no assertion that '
    + 'reads for text can tell the two apart.');
});

test('a row with a diff still renders its arrow and both sides', () => {
  // The other half. Without this, "renders nothing" would be satisfied by a
  // component that renders nothing for EVERY row, and the trail would lose the
  // one payload it is allowed to carry.
  const markup = diffMarkup(TRANSITION);
  assert.ok(markup.includes('→'), 'a real transition lost its arrow');
  assert.ok(markup.includes(statusLabel('pending')), 'the before value is gone');
  assert.ok(markup.includes(statusLabel('cancelled')), 'the after value is gone');
});

test('a HALF diff — one side recorded, the other not — still renders', () => {
  /**
   * The branch between the two above, and it is not hypothetical: a delete
   * captures a `before` and no `after`, and a create the reverse. Those rows DO
   * have something to say and the dash on the empty side is meaningful there,
   * because the other side is populated and the arrow has a direction.
   *
   * `hasDiff` is therefore an OR, not an AND. Written out as a test because an
   * AND is the tempting simplification and it would silently blank every delete
   * row in the trail.
   */
  const beforeOnly = { ...ACT_ONLY, action: 'delete', before: { status: 'pending' }, after: null };
  const afterOnly  = { ...ACT_ONLY, action: 'create', before: null, after: { status: 'pending' } };
  assert.ok(hasDiff(beforeOnly), 'a delete row was treated as recording nothing');
  assert.ok(hasDiff(afterOnly),  'a create row was treated as recording nothing');
  assert.ok(diffMarkup(beforeOnly).includes('→'), 'a delete row lost its arrow');
  assert.ok(diffMarkup(afterOnly).includes('→'),  'a create row lost its arrow');
  assert.equal(hasDiff(ACT_ONLY), false, 'the act-only row is the only one that renders nothing');
});

// ── 2. Through the real panel, which is where the defect was seen ───────────

/**
 * ── THE PANEL IS REACHABLE NOW, AND IT WAS NOT BEFORE ──────────────────────
 * `RecordHistoryPanel` is collapsed by default, so `renderToStaticMarkup` used
 * to emit its header button and no rows at all — which is why
 * render/auditLegacyStatusLabels tests `preview` at its function rather than
 * through the panel, and says so.
 *
 * The registration detail screens gave the panel a TAB of its own and with it a
 * `defaultOpen` prop, so the rows can now be rendered for real. That is a better
 * instrument than the component alone: it proves the panel actually WIRES the
 * shared diff line rather than keeping a second copy.
 */
const panel = renderToStaticMarkup(createElement(RecordHistoryPanel, {
  state: HISTORY_STATE.OK,
  rows: [ACT_ONLY, TRANSITION],
  total: 2,
  previewCount: 5,
  title: 'ประวัติการแก้ไข',
  defaultOpen: true,
}));

/** One row of the panel, by the actor name that identifies it. */
function lineFor(markup, actorName) {
  const rows = markup.split('<li').slice(1);
  const row = rows.find((r) => r.includes(actorName));
  assert.ok(row, `no history line rendered for ${actorName}`);
  return row;
}

/**
 * The compact line's inner container — the flex row that holds the action chip
 * and, when there is one, the diff.
 *
 * ── BALANCED, NOT "UP TO THE NEXT </span>" ─────────────────────────────────
 * MEASURED. The first version sliced to the first closing tag it found, which
 * lands INSIDE the action chip — so the extract ended mid-element and
 * `includes('>update<')` failed on completely correct markup while the element
 * COUNT still read 1. A probe that is wrong in a way the count cannot see is the
 * shape this suite keeps rediscovering; the assertion that caught it was the
 * "the one element IS the chip" line, which exists for exactly this reason.
 */
function compactLine(row) {
  const at = row.indexOf('flex flex-wrap');
  assert.notEqual(at, -1, 'the compact line container is gone — the probe has to be re-pointed');
  const open = row.indexOf('>', at);
  let depth = 1;
  let i = open + 1;
  while (i < row.length && depth > 0) {
    if (row.startsWith('<span', i)) depth += 1;
    else if (row.startsWith('</span>', i)) depth -= 1;
    if (depth === 0) break;
    i += 1;
  }
  assert.ok(depth === 0, 'the compact line container is unbalanced');
  return row.slice(open + 1, i);
}

test('the panel rendered its rows at all', () => {
  // CONTROL for everything below: a collapsed panel emits no rows, and every
  // "renders nothing" assertion would pass on it.
  assert.ok(panel.includes('แอดมิน หนึ่ง'), 'the act-only row did not render');
  assert.ok(panel.includes('แอดมิน สอง'), 'the transition row did not render');
  assert.ok(panel.includes('>update<'), 'the action chip is gone');
});

test('the act-only line holds the action chip and NOTHING ELSE', () => {
  /**
   * The shape assertion. The container holds one element — the chip — where the
   * transition row's holds two. Anything added beside the chip (a dash, an
   * arrow, an empty span reserving the room) makes it two, and this is what
   * separates "the diff is absent" from "the diff is blank".
   */
  const line = compactLine(lineFor(panel, 'แอดมิน หนึ่ง'));
  const elements = line.match(/<(span|p|div)\b/g) ?? [];
  assert.equal(elements.length, 1,
    `the act-only line renders ${elements.length} elements (${elements.join(', ')}), expected only the `
    + 'action chip. A row that records no values must render no diff — not an empty one.');
  assert.ok(line.includes('>update<'), 'the one element is not the action chip');
  assert.ok(!line.includes('→'), 'an arrow rendered with nothing on either side of it');
});

test('the transition line still holds its chip AND its diff', () => {
  // The other side of the same claim, so "one element" above is a measurement
  // rather than the panel having stopped rendering diffs.
  const line = compactLine(lineFor(panel, 'แอดมิน สอง'));
  const elements = line.match(/<(span|p|div)\b/g) ?? [];
  assert.ok(elements.length >= 2,
    `the transition line renders ${elements.length} elements — the diff is gone with the dashes`);
  assert.ok(line.includes('→'), 'the transition lost its arrow');
  assert.ok(line.includes(statusLabel('cancelled')), 'the transition lost its after value');
});

test('the act-only row still says WHO and WHEN — it was not removed', () => {
  // The ruling: do not add the diff, and do not remove the row either. That an
  // edit happened, by whom and when, is exactly the fact the trail exists to
  // hold.
  const row = lineFor(panel, 'แอดมิน หนึ่ง');
  assert.ok(row.includes('แอดมิน หนึ่ง'), 'the actor is gone');
  assert.match(row, /2569/, 'the timestamp is gone');
});

test('the legacy label map still reaches the diff line', () => {
  // Round 2's map decorates history and only history. A `closed-won` row must
  // still render in Thai here — the substitution happens inside `preview`, which
  // AuditDiff calls, and re-pointing the line must not have bypassed it.
  const legacy = diffMarkup({ ...TRANSITION, before: { status: 'contacted' }, after: { status: 'closed-won' } });
  assert.ok(legacy.includes(statusLabel('contacted')), 'a retired before value lost its Thai label');
  assert.ok(legacy.includes(statusLabel('closed-won')), 'a retired after value lost its Thai label');
});

// ── 3. Both surfaces share the one diff line ────────────────────────────────

test('the central audit page renders the SAME diff component', () => {
  /**
   * auditRowParts' premise is that the central page and the inline panel differ
   * in their CONTAINER and in nothing inside it — "a row flagged amber on the
   * central page has to look amber here too. A second severity scheme is how a
   * reader learns to distrust both."
   *
   * A diff line fixed on one surface and left as `— → —` on the other is exactly
   * that second scheme, so the fix went into the shared module and both
   * surfaces read it. Asserted at source, because rendering AuditLogClient
   * needs a page's worth of props to prove one thing about one cell.
   */
  const central = readSource('src/app/admin/audit-log/_components/AuditLogClient.jsx');
  assert.match(central.code, /<AuditDiff row=\{row\} \/>/,
    'the central page does not use the shared diff line');
  assert.ok(!/preview\(row\.before\)/.test(central.code),
    'the central page still assembles its own before → after line');
  assert.match(central.withImports, /import \{[\s\S]*?AuditDiff[\s\S]*?\} from '@\/components\/audit\/auditRowParts'/,
    'AuditDiff is not imported from the shared module');

  const inline = readSource('src/components/audit/RecordHistoryPanel.jsx');
  assert.match(inline.code, /<AuditDiff row=\{row\} \/>/,
    'the inline panel does not use the shared diff line');
  assert.ok(!/preview\(row\.before\)/.test(inline.code),
    'the inline panel still assembles its own before → after line');
});

test('the DATA is untouched — no fallback invents a diff', () => {
  /**
   * The instruction was explicit: do not add the diff. `AuditDiff` reads
   * `row.before` and `row.after` and nothing else — no `meta` fallback, no
   * reconstruction from the action name, nothing that would put a value on
   * screen the trail does not hold.
   */
  const parts = readSource('src/components/audit/auditRowParts.jsx');
  const from = parts.code.indexOf('export function AuditDiff');
  assert.notEqual(from, -1, 'AuditDiff is gone');
  const body = parts.code.slice(from, parts.code.indexOf('export function rowSeverity'));
  assert.ok(!/row\.meta/.test(body), 'the diff line reads meta — it must render only what was recorded');
  assert.ok(!/row\.action/.test(body), 'the diff line branches on the action name');
  assert.equal((body.match(/preview\(/g) ?? []).length, 2, 'the diff line no longer previews exactly two values');
});
