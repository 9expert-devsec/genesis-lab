// The masterclass outline derivation and the transition-safe href helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTERCLASS_OUTLINE_CATEGORY,
  MASTERCLASS_OUTLINE_LANGS,
  isMasterclassOutlineLang,
  masterclassOutlineFileName,
  masterclassOutlinePublicPath,
  masterclassOutlineSlugKey,
  outlineHref,
} from '@/lib/masterclass/masterclassOutline';
import { LEGACY_PUBLIC_ID_PREFIX, legacyPathToPublicId } from '@/lib/legacyPublicId';

test('its own category, th/en', () => {
  assert.equal(MASTERCLASS_OUTLINE_CATEGORY, 'masterclass-outline');
  assert.deepEqual([...MASTERCLASS_OUTLINE_LANGS], ['th', 'en']);
  assert.ok(isMasterclassOutlineLang('th') && isMasterclassOutlineLang('EN'));
  assert.ok(!isMasterclassOutlineLang('fr') && !isMasterclassOutlineLang(''));
});

test('the two live slugs derive to the target shape; the key goes through the shared alphabet', () => {
  for (const [slug, path] of [
    ['mas-claude-ai-for-data-analyst', '/files/masterclass-outline/mas-claude-ai-for-data-analyst-course-outline-th.pdf'],
    ['mas-ai-dmc', '/files/masterclass-outline/mas-ai-dmc-course-outline-th.pdf'],
  ]) {
    const key = masterclassOutlineSlugKey(slug);
    assert.ok(key.ok, slug);
    assert.equal(masterclassOutlinePublicPath(key.value, 'th'), path);
    assert.equal(masterclassOutlineFileName(key.value, 'TH'), path.split('/').pop(), 'lang is case-folded');
  }
  assert.deepEqual(masterclassOutlineSlugKey('  MAS-AI-DMC '), { ok: true, value: 'mas-ai-dmc' });
  // The form's slugify admits Thai, `_`, `.`, `~`; none of those can name a /files file.
  for (const bad of ['', 'mas_ai', 'mas.ai', 'mas~ai', 'มาสเตอร์', 'mas ai']) {
    const key = masterclassOutlineSlugKey(bad);
    assert.equal(key.ok, false, `should refuse ${JSON.stringify(bad)}`);
    assert.match(key.reason, /slug/, 'the refusal names the field');
  }
});

test('the derived path maps to the canonical raw public_id', () => {
  const { publicId } = legacyPathToPublicId('/files/masterclass-outline/mas-ai-dmc-course-outline-th.pdf', 'raw', LEGACY_PUBLIC_ID_PREFIX);
  assert.equal(publicId, '9exp-genesis/legacy/files/masterclass-outline/mas-ai-dmc-course-outline-th.pdf');
});

test('outlineHref: /files path as is, http(s) passed through, anything else null', () => {
  assert.equal(outlineHref('/files/masterclass-outline/mas-ai-dmc-course-outline-th.pdf'), '/files/masterclass-outline/mas-ai-dmc-course-outline-th.pdf');
  assert.equal(outlineHref(' https://res.cloudinary.com/x/image/upload/v1/masterclass-x_abc.pdf '), 'https://res.cloudinary.com/x/image/upload/v1/masterclass-x_abc.pdf');
  assert.equal(outlineHref('http://example.com/a.pdf'), 'http://example.com/a.pdf');
  for (const bad of ['', null, undefined, 'files/a/b.pdf', '9exp.link/x', 'javascript:alert(1)', '//evil.example/a.pdf']) {
    assert.equal(outlineHref(bad), null, `should be null: ${JSON.stringify(bad)}`);
  }
});
