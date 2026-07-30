import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseArticleFormData } from '@/lib/articleFormPayload';
import { articleSchema } from '@/lib/schemas/article';

// A field reaches the database only if THREE layers name it: the form's
// FormData, parseArticleFormData, and articleSchema. `articleSchema` is a plain
// z.object(), which is in STRIP mode — a key it does not declare is dropped
// SILENTLY between parse and `$set`. So a control wired through the first two
// layers but not the third saves nothing, returns ok, and shows the old value
// back after a refresh. Nothing errors, nothing warns.
//
// The first two tests are the generic guard: they hold for ANY field, not just
// showPinBadge, and are the reason this file is not called after the badge.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const FORM_REL = 'src/app/admin/articles/_components/ArticleForm.jsx';
const PARSER_REL = 'src/lib/articleFormPayload.js';
const formSrc = read(FORM_REL);
const parserSrc = read(PARSER_REL);

const SCHEMA_KEYS = new Set(Object.keys(articleSchema.shape));

/**
 * Control names that are deliberately NOT persisted through articleSchema.
 * Every entry needs a reason — an unexplained exclusion is how this guard
 * would get muted one field at a time.
 */
const NOT_PERSISTED = new Map([
  // Cloudinary upload endpoint (/api/admin/upload), a different FormData with a
  // different contract. Never reaches articleSchema.
  ['file', 'upload endpoint payload, not the article document'],
  ['folder', 'upload endpoint payload, not the article document'],
]);

/**
 * The form does NOT use native form submission — there is exactly one `name=`
 * attribute in 1800 lines, and it is a prop on a custom component. It builds
 * FormData imperatively in `submit` via `fd.set('key', …)`. So THAT is the
 * control-name surface, and scanning `name=` alone would be a vacuous guard:
 * it would pass while every real field went unchecked. Both are scanned.
 */
function formFieldNames() {
  // Scope to the submit callback so the image-upload FormData further down the
  // file is not mistaken for the save payload. Throws rather than silently
  // scanning nothing if the anchor moves.
  const start = formSrc.indexOf('const submit = useCallback(');
  assert.notEqual(start, -1, `[${FORM_REL}] could not find the submit callback — re-point this anchor`);
  const end = formSrc.indexOf('startTransition(', start);
  assert.notEqual(end, -1, `[${FORM_REL}] could not find the end of the submit payload block`);
  const block = formSrc.slice(start, end);

  const names = new Set();
  for (const m of block.matchAll(/fd\.(?:set|append)\(\s*'([^']+)'/g)) names.add(m[1]);
  for (const m of formSrc.matchAll(/\bname="([^"]+)"/g)) names.add(m[1]);
  return names;
}

// ── the generic guard ─────────────────────────────────────────────────────

test('every field the article form writes is declared in articleSchema (zod STRIPS unknown keys, silently)', () => {
  const names = formFieldNames();
  assert.ok(names.size > 10, `only found ${names.size} form field names — the scanner is not scanning`);

  const orphans = [...names].filter((n) => !SCHEMA_KEYS.has(n) && !NOT_PERSISTED.has(n));

  assert.deepEqual(
    orphans, [],
    orphans.length === 0 ? '' :
    `These controls send a value that articleSchema does not declare:\n\n` +
    orphans.map((n) => `  fd.set('${n}', …)`).join('\n') +
    `\n\nzod's z.object() is in STRIP mode, so each of these is DROPPED between ` +
    `parse and $set — the save reports success, the database never changes, and ` +
    `the old value reappears on refresh. No error is raised anywhere.\n\n` +
    `Fix by declaring the field in src/lib/schemas/article.js AND reading it in ` +
    `src/lib/articleFormPayload.js. If the control is genuinely not persisted ` +
    `(an upload payload, a UI-only toggle), add it to NOT_PERSISTED in this file ` +
    `WITH a reason.\n\nSchema declares: ${[...SCHEMA_KEYS].sort().join(', ')}`,
  );
});

test('parseArticleFormData emits every key articleSchema declares (the layer a JSX scan cannot see)', () => {
  // Extract the returned object literal's keys from the parser's source: the
  // function reads FormData, so calling it proves the values but not that a key
  // is unconditionally present.
  const start = parserSrc.indexOf('  return {');
  assert.notEqual(start, -1, `[${PARSER_REL}] could not find the returned literal`);
  // `key: value` AND shorthand `key,` — the parser uses both (publishedAt,
  // jsonLd). Matching only the colon form silently under-reports and turns this
  // guard into a false alarm generator.
  const emitted = new Set(
    [...parserSrc.slice(start).matchAll(/^ {4}([A-Za-z_]\w*)\s*[:,]/gm)].map((m) => m[1])
  );
  assert.ok(emitted.size > 10, `only parsed ${emitted.size} keys out of the parser — the extractor is broken`);

  const missing = [...SCHEMA_KEYS].filter((k) => !emitted.has(k));
  assert.deepEqual(
    missing, [],
    `articleSchema declares these but parseArticleFormData never emits them, so they ` +
    `can only ever take their zod default — the form cannot set them: ${missing.join(', ')}`,
  );
});

// ── the badge, specifically ───────────────────────────────────────────────

/** FormData exactly as ArticleForm's submit builds it. */
function formData({ badge }) {
  const fd = new FormData();
  fd.set('title', 'T');
  fd.set('slug', 's');
  fd.set('content', '<p>c</p>');
  fd.set('publishedAt', '2025-01-01T09:00');
  fd.set('active', 'true');
  fd.set('jsonLd', '{}');
  if (badge !== undefined) fd.set('showPinBadge', String(badge));
  return fd;
}

/** The object `updateArticle` hands to `$set`. */
function payloadFor(fd) {
  const parsed = articleSchema.safeParse(parseArticleFormData(fd));
  assert.ok(parsed.success, `schema rejected the fixture: ${JSON.stringify(parsed.error?.issues)}`);
  return parsed.data;
}

test('1 — checkbox ticked → showPinBadge true reaches the payload', () => {
  const p = payloadFor(formData({ badge: true }));
  assert.equal('showPinBadge' in p, true, 'the key survived the strip');
  assert.equal(p.showPinBadge, true);
});

test('2 — checkbox unticked → showPinBadge false reaches the payload', () => {
  const p = payloadFor(formData({ badge: false }));
  assert.equal('showPinBadge' in p, true);
  assert.equal(p.showPinBadge, false, 'false must be WRITTEN, not treated as absent');
});

test('2b — key absent from FormData → false (an unchecked native checkbox posts nothing)', () => {
  const p = payloadFor(formData({ badge: undefined }));
  assert.equal(
    p.showPinBadge, false,
    'parseArticleFormData reads absent as false via `=== \'true\'`, the same convention ' +
    '`active` already uses. The schema default (true) covers a different case: a caller ' +
    'that does not know the field at all, which never reaches this parser.',
  );
});

test('3 — saving the form does NOT write pinOrder or isPinnedOnArticlePage', () => {
  for (const badge of [true, false]) {
    const p = payloadFor(formData({ badge }));
    assert.equal(
      'pinOrder' in p, false,
      'the save button must never write pinOrder — the block is numbered by ' +
      'planPromotion/planDemotion, which need the WHOLE block to pick a value. A ' +
      'stale form tab writing it would undo a position set from the admin list.',
    );
    assert.equal(
      'isPinnedOnArticlePage' in p, false,
      'the save button must never write isPinnedOnArticlePage — position changes go ' +
      'through repositionArticle(), which re-reads the block and reuses the same planners.',
    );
  }

  // and the schema must not declare them either, or a future parser change
  // would be enough on its own to hand the form ownership
  assert.equal(SCHEMA_KEYS.has('pinOrder'), false, 'articleSchema must not declare pinOrder');
  assert.equal(SCHEMA_KEYS.has('isPinnedOnArticlePage'), false, 'articleSchema must not declare isPinnedOnArticlePage');
});

// ── controls ──────────────────────────────────────────────────────────────

test('CONTROL: the strip is real — an undeclared key IS dropped by articleSchema', () => {
  const parsed = articleSchema.safeParse({
    ...parseArticleFormData(formData({ badge: true })),
    someUndeclaredField: 'value',
  });
  assert.ok(parsed.success, 'strip mode accepts the extra key rather than erroring');
  assert.equal(
    'someUndeclaredField' in parsed.data, false,
    'if this ever survives, zod is no longer stripping and the guard above is moot',
  );
});

test('CONTROL: the form scanner sees the real payload and not the upload FormData', () => {
  const names = formFieldNames();
  assert.ok(names.has('showPinBadge'), 'scanner found the badge control');
  assert.ok(names.has('title') && names.has('active'), 'scanner found pre-existing controls');
  assert.equal(
    names.has('file'), false,
    'the image-upload FormData is outside the submit block and must not be scanned — ' +
    'if it leaks in, NOT_PERSISTED is masking a scope bug rather than an exclusion',
  );
});
