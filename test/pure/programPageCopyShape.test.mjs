import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shapePageConfigUpdate,
  shapeProgramCopy,
  PROGRAM_COPY_KEYS,
} from '@/lib/pageConfigUpdate';
import {
  PROGRAM_COPY_ICON_KEYS,
  PROGRAM_COPY_ICONS,
  FALLBACK_ICON_KEY,
  programCopyIcon,
} from '@/lib/programCopyIcons';
import ProgramPageConfig from '@/models/ProgramPageConfig';

/**
 * The program copy (introHeading … benefitCards) through the save whitelist.
 *
 * Three places can silently lose a new field — the form state, the whitelist,
 * Mongoose's strict schema — so the shaped output is also fed through the REAL
 * model. The skill save must not change at all: its output is compared to a
 * literal of what it returned before these fields existed.
 */

const BASE = {
  urlSlug: 'power-bi-all-courses',
  heroTitle: 'h',
  heroDescription: 'd',
  metaTitle: 'm',
  metaDescription: 'md',
  ogImage: '',
  isPublished: true,
};

const COPY = {
  introHeading: '  หัวข้อแนะนำ  ',
  introHtml: '<p>ย่อหน้าหนึ่ง</p><p>ย่อหน้าสอง</p>',
  whyHeading: ' ทำไม ',
  whyLead: ' คำนำ ',
  whyItems: [
    { title: ' A ', description: ' a ' },
    { title: '', description: '  ' }, // empty → dropped
    { title: 'B', description: '' },
  ],
  benefitHeading: ' ประโยชน์ ',
  benefitLead: ' นำ ',
  benefitCards: [
    { icon: 'chart', title: ' C1 ', description: ' c1 ' },
    { icon: 'sparkles', title: '', description: '' }, // empty → dropped
  ],
};

test('program save carries all eight keys, trimmed, empty rows dropped', () => {
  const u = shapePageConfigUpdate('PBI', 'programId', { ...BASE, ...COPY });
  for (const k of PROGRAM_COPY_KEYS) assert.ok(k in u, `${k} missing from the program save`);
  assert.equal(u.introHeading, 'หัวข้อแนะนำ');
  assert.equal(u.introHtml, '<p>ย่อหน้าหนึ่ง</p><p>ย่อหน้าสอง</p>');
  assert.equal(u.whyHeading, 'ทำไม');
  assert.equal(u.whyLead, 'คำนำ');
  assert.deepEqual(u.whyItems, [{ title: 'A', description: 'a' }, { title: 'B', description: '' }]);
  assert.equal(u.benefitHeading, 'ประโยชน์');
  assert.equal(u.benefitLead, 'นำ');
  assert.deepEqual(u.benefitCards, [{ icon: 'chart', title: 'C1', description: 'c1' }]);
});

test('introHtml is sanitised on save; an emptied editor stores ""', () => {
  assert.equal(shapeProgramCopy({ introHtml: '<p>x</p><script>alert(1)</script>' }).introHtml, '<p>x</p>');
  assert.equal(shapeProgramCopy({ introHtml: '<p></p>' }).introHtml, '');
});

test('caps: 8 rows pass, a 9th is refused', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ title: `t${i}`, description: '' }));
  const cards = (n) => Array.from({ length: n }, (_, i) => ({ icon: 'chart', title: `t${i}`, description: '' }));
  assert.equal(shapeProgramCopy({ whyItems: rows(8) }).whyItems.length, 8);
  assert.throws(() => shapeProgramCopy({ whyItems: rows(9) }), /ไม่เกิน 8/);
  assert.equal(shapeProgramCopy({ benefitCards: cards(8) }).benefitCards.length, 8);
  assert.throws(() => shapeProgramCopy({ benefitCards: cards(9) }), /ไม่เกิน 8/);
});

test('an unknown icon key is refused', () => {
  assert.throws(
    () => shapeProgramCopy({ benefitCards: [{ icon: 'BarChart3', title: 't', description: '' }] }),
    /BarChart3/,
  );
});

test('skill save is unchanged: exactly the pre-copy object, even when copy keys are sent', () => {
  const u = shapePageConfigUpdate('AI', 'skillId', { ...BASE, ...COPY });
  assert.deepEqual(u, {
    skillId: 'AI',
    urlSlug: 'power-bi-all-courses',
    heroTitle: 'h',
    heroDescription: 'd',
    metaTitle: 'm',
    metaDescription: 'md',
    ogImage: '',
    isPublished: true,
  });
  assert.equal(JSON.stringify(u), JSON.stringify(shapePageConfigUpdate('AI', 'skillId', BASE)));
});

test('a shaped program save survives the strict ProgramPageConfig schema', () => {
  const doc = new ProgramPageConfig(shapePageConfigUpdate('PBI', 'programId', { ...BASE, ...COPY })).toObject();
  assert.equal(doc.introHeading, 'หัวข้อแนะนำ');
  assert.deepEqual(doc.whyItems, [{ title: 'A', description: 'a' }, { title: 'B', description: '' }]);
  assert.deepEqual(doc.benefitCards, [{ icon: 'chart', title: 'C1', description: 'c1' }]);
  const empty = new ProgramPageConfig({ programId: 'X' }).toObject();
  for (const k of PROGRAM_COPY_KEYS) {
    assert.deepEqual(empty[k], Array.isArray(empty[k]) ? [] : '', `${k} default`);
  }
});

// ── icon preset ─────────────────────────────────────────────────────────────

// The ten keys the 2026-11-17 seed sheet assigns (measured from the sheet; the
// sheet itself lives outside the repo). The seed script re-validates every card
// through shapeProgramCopy, so a key missing here also fails the dry-run.
const SEED_ICONS = ['chart', 'database', 'truck', 'users', 'code', 'target', 'headset', 'pie-chart', 'megaphone', 'briefcase'];

test('every icon key the seed uses is in the preset', () => {
  for (const k of SEED_ICONS) assert.ok(PROGRAM_COPY_ICON_KEYS.includes(k), k);
});

test('an unknown or empty key renders the fallback, never throws', () => {
  assert.equal(programCopyIcon('nope'), PROGRAM_COPY_ICONS[FALLBACK_ICON_KEY]);
  assert.equal(programCopyIcon(''), PROGRAM_COPY_ICONS[FALLBACK_ICON_KEY]);
  assert.equal(programCopyIcon(undefined), PROGRAM_COPY_ICONS[FALLBACK_ICON_KEY]);
  assert.equal(programCopyIcon('toString'), PROGRAM_COPY_ICONS[FALLBACK_ICON_KEY]);
  assert.equal(programCopyIcon('truck'), PROGRAM_COPY_ICONS.truck);
});
