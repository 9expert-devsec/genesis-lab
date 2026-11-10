import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { shapePageConfigUpdate } from '@/lib/pageConfigUpdate';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';

/**
 * heroTitle / heroDescription survive every layer of a save.
 *
 * A dropped field fails silently here: the form shows บันทึกแล้ว and the value
 * is gone. There are three places to lose it — the editor's state, the
 * whitelist, and Mongoose's strict schema, which discards an undeclared key
 * without complaint — so the whitelist's output is fed through the REAL models
 * rather than asserted on its own.
 */

const EDITOR = 'src/app/admin/page-configs/_components/PageConfigEditor.jsx';
const ACTION = 'src/lib/actions/page-configs.js';
const KEYS = ['heroTitle', 'heroDescription'];
const FORM = {
  urlSlug: 'ai-all-courses',
  heroTitle: '  หลักสูตร AI  ',
  heroDescription: ' คำอธิบาย ',
  metaTitle: 'meta',
  metaDescription: 'meta',
  ogImage: '',
  isPublished: true,
};

test('the whitelist keeps both keys, trimmed', () => {
  const update = shapePageConfigUpdate('AI', 'skillId', FORM);
  assert.equal(update.heroTitle, 'หลักสูตร AI');
  assert.equal(update.heroDescription, 'คำอธิบาย');
});

test('CONTROL: the whitelist still drops a key it does not list', () => {
  const update = shapePageConfigUpdate('AI', 'skillId', { ...FORM, catalogPdf: { path: '/x' } });
  assert.equal('catalogPdf' in update, false);
});

for (const [name, Model, key] of [
  ['ProgramPageConfig', ProgramPageConfig, 'programId'],
  ['SkillPageConfig', SkillPageConfig, 'skillId'],
]) {
  test(`${name}: a shaped save survives the strict schema`, () => {
    const doc = new Model(shapePageConfigUpdate('X', key, FORM)).toObject();
    assert.equal(doc.heroTitle, 'หลักสูตร AI');
    assert.equal(doc.heroDescription, 'คำอธิบาย');
  });

  test(`${name}: CONTROL: the strict schema does drop an undeclared key`, () => {
    const doc = new Model({ [key]: 'X', notAField: 'y' }).toObject();
    assert.equal('notAField' in doc, false);
  });

  test(`${name}: both fields default to empty, so a new row renders today's page`, () => {
    const doc = new Model({ [key]: 'X' }).toObject();
    for (const k of KEYS) assert.equal(doc[k], '', k);
  });
}

test('both save actions go through the whitelist', () => {
  const { code } = readSource(ACTION);
  assert.equal(code.match(/shapePageConfigUpdate\(/g)?.length, 2);
});

test('the editor initialises, resets and binds both keys', () => {
  const { code } = readSource(EDITOR);
  for (const key of KEYS) {
    assert.match(code, new RegExp(`${key}: config\\?\\.${key} \\?\\? ''`), `${key}: not initialised`);
    assert.match(code, new RegExp(`${key}: '',`), `${key}: not in the delete reset`);
    assert.match(code, new RegExp(`value=\\{form\\.${key}\\}`), `${key}: no input`);
    assert.match(code, new RegExp(`onChange=\\{update\\('${key}'\\)\\}`), `${key}: not editable`);
  }
});

test('the hero fields sit above Meta Title', () => {
  const { code } = readSource(EDITOR);
  const order = ['form.heroTitle', 'form.heroDescription', 'form.metaTitle'].map((s) => code.indexOf(s));
  assert.ok(order[0] > 0, 'heroTitle input not found');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('no metadata or JSON-LD path reads the hero fields', () => {
  for (const file of [
    'src/app/(public)/[...slug]/page.jsx',
    'src/app/(public)/program/[slug]/page.jsx',
    'src/app/(public)/skill/[slug]/page.jsx',
  ]) {
    const { code } = readSource(file);
    assert.ok(code.length > 500, `${file} scrubbed to ${code.length} chars`);
    assert.doesNotMatch(code, /heroTitle|heroDescription/, file);
  }
});
