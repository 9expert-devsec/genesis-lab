/**
 * ROUND 57 — do the new content fields leave every STORED section byte-identical?
 *
 * docs/promotion-page-coverage.md §H requires this of each step, in round 50's
 * shape: pull the pre-change component out of git, render it beside the current
 * one over every shape an author can actually have stored, and count the
 * differences. The answer must be ZERO.
 *
 * ── THE CONTROL, WHICH IS THE POINT ───────────────────────────────────────
 * "0 differences" and "the comparison never ran" print the same number. So each
 * type also renders fixtures that DO set the new fields, and those pairs must
 * DIFFER. A run where both columns are zero is a broken harness, not a clean
 * result, and it says so.
 *
 * ── WHY THE BASELINE IS A TEMP FILE UNDER src/ ────────────────────────────
 * So its relative and aliased imports resolve to the same modules the current
 * component uses. Removed in a finally.
 *
 * READ-ONLY apart from those temp files.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_measure-round57-field-additions.mjs
 *   BASE_REF=<sha> node --import ./scripts/_probe-panel-register.mjs scripts/_measure-round57-field-additions.mjs
 */
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = process.cwd();
const BASE_REF = process.env.BASE_REF ?? 'HEAD';

/**
 * One entry per section type this round touches. `stored` are shapes an author
 * can already have in the database — every one must be byte-identical. `added`
 * set the new fields and must DIFFER, or the comparison proves nothing.
 */
const TARGETS = [
  {
    type: 'price_card',
    file: 'src/components/pageBuilder/sections/price_card.jsx',
    exportName: 'PriceCardSection',
    stored: {
      'full card': { title: 'แพ็กเกจ', price: '฿12,900', period: '/ คน', features: ['ก', 'ข'], buttonLabel: 'สมัคร', buttonHref: '/a', highlighted: true },
      'price only': { price: '9,900' },
      'title + features': { title: 'ทดลอง', features: ['ฟรี'] },
      'button, no href': { title: 'x', price: '1', buttonLabel: 'go' },
      'empty (renders null)': { title: '', price: '', features: [] },
      'unhighlighted': { title: 'x', price: '2', highlighted: false },
    },
    added: {
      'originalPrice': { title: 'x', price: '1', originalPrice: '40,800 บาท' },
      'discountBadge': { title: 'x', price: '1', discountBadge: 'ลด 20%' },
      'footnote': { title: 'x', price: '1', footnote: '* ยังไม่รวม VAT 7%' },
      'ribbon': { title: 'x', price: '1', ribbon: 'Early Bird ลด 20%' },
    },
  },
  {
    type: 'cta',
    file: 'src/components/pageBuilder/sections/cta.jsx',
    exportName: 'CtaSection',
    stored: {
      'full': { heading: 'สนใจ', description: 'ทัก', buttonLabel: 'สอบถาม', buttonHref: '/a' },
      'heading only': { heading: 'สนใจ' },
      'label, no href': { heading: 'x', buttonLabel: 'go' },
      'href, no label': { heading: 'x', buttonHref: '/a' },
      'unsafe href': { heading: 'x', buttonLabel: 'go', buttonHref: 'javascript:alert(1)' },
      'empty': {},
    },
    added: {
      'second button': { heading: 'x', buttonLabel: 'a', buttonHref: '/a', secondaryButtonLabel: 'b', secondaryButtonHref: '/b' },
    },
  },
  {
    type: 'heading',
    file: 'src/components/pageBuilder/sections/heading.jsx',
    exportName: 'HeadingSection',
    stored: {
      'h2 left': { text: 'หัวข้อ', level: 'h2', align: 'left' },
      'h1 center': { text: 'หัวข้อ', level: 'h1', align: 'center' },
      'h3 right': { text: 'หัวข้อ', level: 'h3', align: 'right' },
      'empty': { text: '' },
      'no level': { text: 'หัวข้อ' },
    },
    added: {
      'eyebrow': { text: 'หัวข้อ', eyebrow: 'PROMOTION DETAILS' },
    },
  },
  {
    type: 'checklist',
    file: 'src/components/pageBuilder/sections/checklist.jsx',
    exportName: 'ChecklistSection',
    stored: {
      'two items': { items: [{ text: 'ก', checked: true }, { text: 'ข', checked: false }] },
      'one item': { items: [{ text: 'ก' }] },
      'empty list': { items: [] },
      'junk item': { items: [{ text: '' }] },
    },
    added: {
      'heading': { items: [{ text: 'ก' }], heading: 'เงื่อนไขโปรโมชัน' },
    },
  },
];

const report = { baseRef: BASE_REF, perType: {} };
const temps = [];

try {
  for (const t of TARGETS) {
    const dir = path.dirname(path.join(ROOT, t.file));
    const baseName = '_baseline_' + path.basename(t.file);
    const basePath = path.join(dir, baseName);
    let before;
    try {
      before = execFileSync('git', ['show', `${BASE_REF}:${t.file}`], { encoding: 'utf8' });
    } catch {
      report.perType[t.type] = { error: `not in ${BASE_REF} — nothing to compare against` };
      continue;
    }
    writeFileSync(basePath, before, 'utf8');
    temps.push(basePath);

    const nowMod = await import(`@/components/pageBuilder/sections/${path.basename(t.file, '.jsx')}`);
    const thenMod = await import(`@/components/pageBuilder/sections/${path.basename(baseName, '.jsx')}`);
    const Now = nowMod[t.exportName];
    const Then = thenMod[t.exportName];

    const draw = (C, content) =>
      renderToStaticMarkup(createElement(C, { content, style: {}, layout: {} }));

    const storedRows = {};
    const differing = [];
    for (const [name, content] of Object.entries(t.stored)) {
      const a = draw(Then, content);
      const b = draw(Now, content);
      storedRows[name] = { bytes: Buffer.byteLength(b, 'utf8'), identical: a === b };
      if (a !== b) differing.push(name);
    }

    const addedRows = {};
    const notDiffering = [];
    for (const [name, content] of Object.entries(t.added)) {
      const a = draw(Then, content);
      const b = draw(Now, content);
      addedRows[name] = { headBytes: Buffer.byteLength(a, 'utf8'), bytes: Buffer.byteLength(b, 'utf8'), differs: a !== b };
      if (a === b) notDiffering.push(name);
    }

    report.perType[t.type] = {
      STORED_SHAPES_DIFFERING: differing.length,
      storedShapes: Object.keys(t.stored).length,
      differing,
      perStored: storedRows,
      '── CONTROL: the comparison CAN report a difference ──': '',
      addedFixturesThatFailedToDiffer: notDiffering,
      perAdded: addedRows,
      controlDiscriminates: differing.length === 0 && notDiffering.length === 0,
    };
  }
} finally {
  for (const p of temps) rmSync(p, { force: true });
}

const totals = Object.values(report.perType).filter((r) => !r.error);
report['── THE ANSWER, ACROSS EVERY TYPE ──'] = '';
report.TOTAL_STORED_SHAPES_DIFFERING = totals.reduce((n, r) => n + r.STORED_SHAPES_DIFFERING, 0);
report.totalStoredShapesCompared = totals.reduce((n, r) => n + r.storedShapes, 0);
report.everyControlDiscriminates = totals.every((r) => r.controlDiscriminates);

console.log(JSON.stringify(report, null, 2));
