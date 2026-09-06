import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import {
  SectionContentEditor, priceFromInput,
} from '@/components/pageBuilder/editor/SectionContentEditor';
import { roundOptionLabel, snapshotOf } from '@/components/pageBuilder/editor/RoundPicker';
import { sectionSchema } from '@/lib/schemas/pageBuilder';

/**
 * The `promotion_bundle` content editor: its fields, its per-item rows, and the
 * round picker's options.
 *
 * Rendered through `SectionContentEditor` rather than the editor function
 * directly, so what is asserted is what the เนื้อหา tab actually draws — the
 * same seam test/render/settingsPanelTabs uses.
 */

const CATALOGUE = [
  { course_id: 'MSE-L1', course_name: 'Microsoft Excel Level 1' },
  { course_id: 'VIBE-CODE-L2', course_name: 'Vibe Coding Level 2' },
];

const ROUND_A = { _id: 'r-a', dates: ['2030-08-20', '2030-08-21'], type: 'classroom', status: 'open' };
const ROUND_B = { _id: 'r-b', dates: ['2030-11-05'], type: 'online', status: 'open' };

const panel = (content, resolved) =>
  new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(
      createElement(SectionContentEditor, {
        type: 'promotion_bundle',
        content,
        patch: () => {},
        resolved,
        courses: CATALOGUE,
      }),
    )}</body>`,
  ).window.document;

const labels = (d) => [...d.querySelectorAll('label > span:first-child')].map((s) => s.textContent.trim());
const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

// ── the bundle's own fields ───────────────────────────────────────────────

test('the tab offers every stored field, and nothing that is not stored', () => {
  /**
   * Exact, because a field the panel cannot edit is a field an author cannot
   * reach, and a field the panel offers that nothing stores is a dead control —
   * round 18's defect. The schema's key list is the other half of the pair.
   */
  const d = panel({ items: [] }, undefined);
  /**
   * `ป้ายสั้น` leads, because it draws ABOVE the headline on the page and a
   * panel whose field order contradicts the rendered order is a panel an author
   * has to translate.
   */
  assert.deepEqual(labels(d), [
    'ป้ายสั้น',
    'ชื่อแพ็กเกจ',
    'คำโปรย',
    'ราคาปกติ (บาท)',
    'ราคาสุทธิ (บาท)',
    'รหัสส่วนลด',
    'เปิดรับสมัครแพ็กเกจนี้',
  ]);

  // Every one of those maps to a content key the schema declares, and the only
  // key with no field of its own is `items`, which has the list control below.
  const keys = Object.keys(
    sectionSchema.parse({ id: 's', type: 'promotion_bundle' }).content,
  ).sort();
  assert.deepEqual(keys, [
    'blurb', 'discountCode', 'items', 'label', 'listPrice', 'name', 'netPrice', 'registrationOpen',
  ]);
});

test('the two name fields are told apart by their hints, not just their labels', () => {
  /**
   * `ป้ายสั้น` and `ชื่อแพ็กเกจ` both ask for a name, and the หัวข้อ hint used
   * to offer "Bundle 1" as an example NAME — which is now the example LABEL.
   * Left alone the two fields would read as alternatives and an author would
   * type the headline into neither.
   */
  const d = panel({ items: [] }, undefined);
  const hints = [...d.querySelectorAll('label')].map((l) => text(l));
  const pill = hints.find((h) => h.startsWith('ป้ายสั้น'));
  const headline = hints.find((h) => h.startsWith('ชื่อแพ็กเกจ'));

  assert.ok(pill.includes('Bundle 1'), 'the pill field lost its example');
  assert.equal(
    headline.includes('Bundle 1'),
    false,
    'the headline field still offers "Bundle 1" — the two fields read as alternatives',
  );
  // The headline says where it actually goes, which the pill must not claim.
  assert.ok(headline.includes('ใบเสนอราคา'), 'the headline no longer says it reaches the quotation');
  assert.equal(pill.includes('ใบเสนอราคา'), false, 'the pill claims to reach the quotation');
});

test('CONTROL: the hint reader sees real text, and discriminates', () => {
  // Without this, both `.includes` checks above would pass on an empty string.
  const d = panel({ items: [] }, undefined);
  const hints = [...d.querySelectorAll('label')].map((l) => text(l));
  assert.ok(hints.length >= 7, `the hint reader found ${hints.length} labels`);
  assert.ok(hints.every((h) => h.length > 0), 'a label read back empty');
  assert.notEqual(
    hints.find((h) => h.startsWith('ป้ายสั้น')),
    hints.find((h) => h.startsWith('ชื่อแพ็กเกจ')),
  );
});

test('CONTROL: the label reader is not returning a constant', () => {
  // A different type must produce a different list, or the exact set above
  // proves nothing about this type.
  const other = panel({}, undefined);
  const heading = new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(
      createElement(SectionContentEditor, {
        type: 'heading', content: { text: 'x' }, patch: () => {}, courses: [],
      }),
    )}</body>`,
  ).window.document;
  assert.notDeepEqual(labels(heading), labels(other));
  assert.ok(labels(heading).length > 0, 'the reader found nothing at all');
});

// ── '' is null, not 0 ─────────────────────────────────────────────────────

test('priceFromInput: empty and unparseable are null; a number is an integer', () => {
  /**
   * The existing numeric pattern in this file is `parseInt(v, 10) || 0`, which
   * is right for a `limit` and wrong for money: it folds a cleared box to
   * "free". The schema keeps null and 0 apart and this is the end of the path
   * that has to.
   */
  assert.equal(priceFromInput(''), null);
  assert.equal(priceFromInput('   '), null);
  assert.equal(priceFromInput('abc'), null);
  assert.equal(priceFromInput(null), null);
  assert.equal(priceFromInput(undefined), null);

  assert.equal(priceFromInput('0'), 0, 'a deliberate zero must survive as zero');
  assert.equal(priceFromInput('40800'), 40800);
  assert.equal(priceFromInput(' 32640 '), 32640);
});

test('CONTROL: the naive pattern this replaces WOULD conflate them', () => {
  // Discrimination: the rejected implementation, run over the same inputs, must
  // give a different answer — otherwise the function above is not doing
  // anything the old one did not.
  const naive = (v) => Number.parseInt(String(v ?? ''), 10) || 0;
  assert.equal(naive(''), 0);
  assert.notEqual(naive(''), priceFromInput(''));
  // …and they agree where they should, so the difference is exactly the empty
  // case rather than the whole function.
  assert.equal(naive('40800'), priceFromInput('40800'));
});

test('an emptied price renders an EMPTY box, never the word null', () => {
  const d = panel({ listPrice: null, netPrice: 32640, items: [] }, undefined);
  const inputs = [...d.querySelectorAll('input[inputmode="numeric"]')];
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0].getAttribute('value'), '');
  assert.equal(inputs[1].getAttribute('value'), '32640');
  // CONTROL: a zero is not treated as empty.
  const zero = panel({ listPrice: 0, items: [] }, undefined);
  assert.equal(zero.querySelector('input[inputmode="numeric"]').getAttribute('value'), '0');
});

// ── the inverted-price warning ────────────────────────────────────────────

test('a net price ABOVE the list price warns in the editor', () => {
  const d = panel({ listPrice: 10000, netPrice: 12000, items: [] }, undefined);
  const alerts = [...d.querySelectorAll('[role="alert"]')].map(text);
  assert.ok(
    alerts.some((t) => t.includes('ราคาสุทธิสูงกว่าราคาปกติ')),
    `no inverted-price warning; alerts were ${JSON.stringify(alerts)}`,
  );
  // It says the save still works — that is the whole design, and an author who
  // thinks they are stuck will do something worse.
  assert.ok(alerts.some((t) => t.includes('บันทึกฉบับร่างได้')));
});

test('CONTROL: an ordinary pair, an equal pair, and a half-typed pair do NOT warn', () => {
  const warned = (content) =>
    [...panel({ items: [], ...content }, undefined).querySelectorAll('[role="alert"]')]
      .map(text)
      .some((t) => t.includes('ราคาสุทธิสูงกว่าราคาปกติ'));

  assert.equal(warned({ listPrice: 40800, netPrice: 32640 }), false);
  assert.equal(warned({ listPrice: 10000, netPrice: 10000 }), false, 'an equal pair is not inverted');
  // THE CASE THE WHOLE DESIGN IS FOR: the author has typed the net price and
  // not yet the list price. It must not warn, and — per the schema note — it
  // must not block the save either.
  assert.equal(warned({ netPrice: 32640 }), false);
  assert.equal(warned({ listPrice: 40800 }), false);
  // …and the probe really can come back true.
  assert.equal(warned({ listPrice: 1, netPrice: 2 }), true);
});

// ── the item rows ─────────────────────────────────────────────────────────

test('each item draws a course picker and a round picker, and rows are keyed by item id', () => {
  const content = {
    items: [
      { id: 'i1', courseId: 'MSE-L1', roundId: 'r-a' },
      { id: 'i2', courseId: 'VIBE-CODE-L2', roundId: '' },
    ],
  };
  const d = panel(content, [
    { id: 'i1', courseId: 'MSE-L1', course: { course_id: 'MSE-L1' }, rounds: [ROUND_A, ROUND_B] },
    { id: 'i2', courseId: 'VIBE-CODE-L2', course: { course_id: 'VIBE-CODE-L2' }, rounds: [] },
  ]);
  assert.equal(d.querySelectorAll('[data-testid="round-picker"]').length, 2);
  assert.notEqual(d.querySelector('[data-testid="bundle-add-item"]'), null);

  // The move buttons carry their row index and the ends are disabled — the same
  // idiom ItemList uses, so an author meets one list behaviour in this panel.
  const ups = [...d.querySelectorAll('[data-move="up"]')];
  assert.equal(ups.length, 2);
  assert.equal(ups[0].hasAttribute('disabled'), true);
  assert.equal(ups[1].hasAttribute('disabled'), false);
});

test('an empty bundle warns and still offers the add button', () => {
  const d = panel({ items: [] }, undefined);
  assert.ok(
    [...d.querySelectorAll('[role="alert"]')].map(text).some((t) => t.includes('ยังไม่มีคอร์สในแพ็กเกจนี้')),
  );
  assert.notEqual(d.querySelector('[data-testid="bundle-add-item"]'), null);
});

test('an item whose course does not resolve warns in RED at that row', () => {
  const d = panel(
    { items: [{ id: 'i1', courseId: 'GONE', roundId: '' }] },
    [{ id: 'i1', courseId: 'GONE', course: null, rounds: [] }],
  );
  const reds = [...d.querySelectorAll('[role="alert"]')].map(text);
  assert.ok(reds.some((t) => t.includes('ไม่พบคอร์สรหัสนี้')), JSON.stringify(reds));
  // The consequence is stated, not just the fact — the author needs to know the
  // package price stops matching what is shown.
  assert.ok(reds.some((t) => t.includes('ราคาแพ็กเกจจะไม่ตรงกับคอร์สที่แสดง')));
});

test('CONTROL: the not-found warning waits for the fetch instead of flashing', () => {
  /**
   * `resolved === undefined` means the canvas fetch is in flight. Warning then
   * would paint a red "not found" under every row for the 350ms debounce after
   * every keystroke — the tri-state discipline the other data-backed editors
   * already keep.
   */
  const inFlight = panel({ items: [{ id: 'i1', courseId: 'GONE', roundId: '' }] }, undefined);
  assert.equal(
    [...inFlight.querySelectorAll('[role="alert"]')].map(text).some((t) => t.includes('ไม่พบคอร์สรหัสนี้')),
    false,
    'the editor warned "not found" before the fetch had landed',
  );
  // …and once it lands, it does warn — so the guard is a delay, not a mute.
  const landed = panel(
    { items: [{ id: 'i1', courseId: 'GONE', roundId: '' }] },
    [{ id: 'i1', courseId: 'GONE', course: null, rounds: [] }],
  );
  assert.equal(
    [...landed.querySelectorAll('[role="alert"]')].map(text).some((t) => t.includes('ไม่พบคอร์สรหัสนี้')),
    true,
  );
});

// ── the round picker ──────────────────────────────────────────────────────

test('the round picker lists real dates, from the resolved map', () => {
  const d = panel(
    { items: [{ id: 'i1', courseId: 'MSE-L1', roundId: 'r-a' }] },
    [{ id: 'i1', courseId: 'MSE-L1', course: { course_id: 'MSE-L1' }, rounds: [ROUND_A, ROUND_B] }],
  );
  const opts = [...d.querySelectorAll('[data-testid="round-picker"] option')].map((o) => ({
    value: o.getAttribute('value'), label: text(o),
  }));
  assert.equal(opts[0].value, '', 'the first option must be the empty one');
  assert.deepEqual(opts.slice(1).map((o) => o.value), ['r-a', 'r-b']);
  // Real dates, not an ObjectId — and consecutive days collapse to a range.
  assert.match(opts[1].label, /20\s*-\s*21 ส\.ค\./);
  assert.match(opts[2].label, /5 พ\.ย\./);
});

test('a stored round the fetch no longer returns keeps a "(รอบเดิม)" option', () => {
  /**
   * Without it, opening a bundle to change a PRICE would silently drop the
   * round: a <select> whose value matches no option reports the empty one, and
   * the next save writes that back. The Early Bird form's one correct instinct,
   * kept — see RoundPicker.jsx for what was NOT carried over from it.
   */
  const d = panel(
    { items: [{ id: 'i1', courseId: 'MSE-L1', roundId: 'r-old' }] },
    [{ id: 'i1', courseId: 'MSE-L1', course: { course_id: 'MSE-L1' }, rounds: [ROUND_A] }],
  );
  const kept = d.querySelector('[data-testid="round-picker-kept"]');
  assert.notEqual(kept, null, 'a stored round vanished from its own picker');
  assert.equal(kept.getAttribute('value'), 'r-old');
  assert.match(text(kept), /รอบเดิม/);
});

test('CONTROL: a stored round that IS returned gets no "(รอบเดิม)" option', () => {
  // Otherwise the option would appear always and prove nothing.
  const d = panel(
    { items: [{ id: 'i1', courseId: 'MSE-L1', roundId: 'r-a' }] },
    [{ id: 'i1', courseId: 'MSE-L1', course: { course_id: 'MSE-L1' }, rounds: [ROUND_A] }],
  );
  assert.equal(d.querySelector('[data-testid="round-picker-kept"]'), null);
});

test('roundOptionLabel uses the shared formatter — a gapped round is not a range', () => {
  /**
   * The defect that kept the Early Bird selects from being extracted: a
   * first-date-to-last-date label renders a round on 8, 10 and 12 as `8 - 12`,
   * advertising two days that do not exist.
   */
  const gapped = { _id: 'r', dates: ['2030-10-08', '2030-10-10', '2030-10-12'] };
  const label = roundOptionLabel(gapped);
  assert.match(label, /8, 10, 12/, `a gapped round rendered as "${label}"`);
  assert.equal(/8\s*-\s*12/.test(label), false, 'the gapped round was collapsed into a range');

  // A round with no usable date falls back to its id rather than to '-'.
  assert.equal(roundOptionLabel({ _id: 'r-x', dates: [] }), 'r-x');
});

test('snapshotOf stores {id, dates, type} and nothing else', () => {
  /**
   * The builder does not write `status` or `signup_url` in the first place,
   * which makes the schema's strip a backstop rather than the only defence. A
   * stored status is the seats-left signal frozen at pick time; a stored
   * signup_url is a link to a round that is not there.
   */
  const snap = snapshotOf({ ...ROUND_A, status: 'open', signup_url: 'https://x.test' });
  assert.deepEqual(Object.keys(snap).sort(), ['dates', 'id', 'type']);
  assert.deepEqual(snap, { id: 'r-a', dates: ['2030-08-20', '2030-08-21'], type: 'classroom' });

  // CONTROL: the source object really did carry the forbidden keys, so the
  // absence above is the builder dropping them rather than them never existing.
  const source = { ...ROUND_A, status: 'open', signup_url: 'https://x.test' };
  assert.equal('status' in source, true);
  assert.equal('signup_url' in source, true);
});

test('a snapshot the builder produces is accepted by the schema unchanged', () => {
  // The two halves must agree: what the picker writes has to survive the parse
  // byte for byte, or the editor would store something the next load drops.
  const snap = snapshotOf(ROUND_A);
  const parsed = sectionSchema.parse({
    id: 's', type: 'promotion_bundle',
    content: { items: [{ id: 'i1', courseId: 'MSE-L1', roundId: 'r-a', roundSnapshot: snap }] },
  });
  assert.deepEqual(parsed.content.items[0].roundSnapshot, snap);
});
