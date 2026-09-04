import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource } from '../sourceScan.mjs';

/**
 * Source-scan guards for round 1 of the draft/published split.
 *
 * These are the claims that cannot be made behaviourally: that the key list has
 * ONE definition, that the pure module stays client-importable, and that the
 * model's field is declared the way the split needs it.
 */

const DRAFT_STATE = readSource('src/lib/pageBuilder/draftState.js');
// The collection-neutral module the four helpers moved to when CustomPage
// needed the same semantics with a different key list. ADDED beside the
// statement above rather than folded into it — the standing rule.
const SHARED = readSource('src/lib/pages/draftState.js');
const SCHEMA = readSource('src/lib/schemas/pageBuilder.js');
const MODEL = readSource('src/models/PageBuilder.js');

const DRAFT_KEY_NAMES = [
  'title', 'sections', 'theme', 'showHeader', 'showFooter',
  'showStickyCta', 'seo', 'jsonLd', 'promotionCover',
];

// ── ONE definition of the key list ──────────────────────────────────────────

test('draftState IMPORTS the key list from the schema module', () => {
  assert.match(
    DRAFT_STATE.withImports,
    /import \{[\s\S]*?\bDRAFT_CONTENT_KEYS\b[\s\S]*?\} from '@\/lib\/schemas\/pageBuilder'/,
    'draftState no longer imports DRAFT_CONTENT_KEYS from the schema module'
  );
});

test('CONTROL: that guard must read withImports — the code view strips imports', () => {
  // The precondition, asserted rather than assumed. scrubSource's CODE view
  // deletes import statements, so the same regex run against `code` matches
  // NOTHING on a completely correct file — a guard written against `code` would
  // pass vacuously the moment it was inverted, and fail confusingly otherwise.
  assert.equal(
    /from '@\/lib\/schemas\/pageBuilder'/.test(DRAFT_STATE.code),
    false,
    'the code view now retains import lines; the guard above is reading the wrong view'
  );
  assert.equal(
    /from '@\/lib\/schemas\/pageBuilder'/.test(DRAFT_STATE.withImports),
    true,
    'the withImports view no longer carries the import'
  );
});

test('draftState does not RESTATE the key names — it only references the constant', () => {
  // Comments and imports are both stripped from `code`, so the doc block that
  // lists the nine keys for a reader cannot satisfy this.
  const restated = DRAFT_KEY_NAMES.filter(
    (k) => DRAFT_STATE.code.includes(`'${k}'`) || DRAFT_STATE.code.includes(`"${k}"`)
  );
  assert.deepEqual(restated, [], 'these key names are hard-coded in draftState instead of imported');
  assert.match(DRAFT_STATE.code, /DRAFT_CONTENT_KEYS/, 'the constant is imported but never used');
});

test('the schema module defines the key list exactly once', () => {
  const definitions = [...SCHEMA.code.matchAll(/export const DRAFT_CONTENT_KEYS\s*=/g)];
  assert.equal(definitions.length, 1, 'DRAFT_CONTENT_KEYS is declared more than once');
});

test('LIVE_ONLY_KEYS is derived from the schema, not typed out', () => {
  assert.match(
    SCHEMA.code,
    /export const LIVE_ONLY_KEYS = Object\.keys\(pageBuilderSchema\.shape\)[\s\S]{0,120}?DRAFT_CONTENT_KEYS/,
    'LIVE_ONLY_KEYS is no longer derived from pageBuilderSchema minus the draft keys'
  );
});

test('draftContentSchema is picked from pageBuilderSchema, not rebuilt', () => {
  assert.match(
    SCHEMA.code,
    /export const draftContentSchema = pageBuilderSchema\.pick\(/,
    'draftContentSchema is no longer derived by .pick()'
  );
  assert.equal(
    /export const draftContentSchema = z\.object\(/.test(SCHEMA.code),
    false,
    'draftContentSchema was rebuilt as its own z.object — it will drift from the page schema'
  );
});

// ── The pure module stays client-importable ─────────────────────────────────

/**
 * ── THE IMPORT LIST MOVED WHEN THE SEMANTICS DID ──────────────────────────
 * The four helpers now live in lib/pages/draftState.js, which is
 * collection-neutral, and this module binds them to PageBuilder's partition. So
 * the builder module imports TWO things — the key list and the binder — where it
 * used to import one, and the shared module is where "imports nothing that
 * cannot reach the browser" has to be asserted now, because that is the file
 * with the helpers in it.
 *
 * Both are pinned, not just the one that used to be. The shared module is the
 * riskier of the two: it has two importers and neither owns it.
 */
test('draftState imports nothing that cannot reach the browser', () => {
  // The editor and the admin list both import this. One mongoose import here
  // drags the model into the client bundle.
  const sources = [...DRAFT_STATE.withImports.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    sources.sort(),
    ['@/lib/pages/draftState', '@/lib/pages/draftState', '@/lib/schemas/pageBuilder'],
    'the builder binding grew an import — it should reach the key list and the shared helpers, and nothing else'
  );
});

test('the SHARED module imports nothing at all', () => {
  // Stronger than the binding's rule, and it can be: the neutral module takes
  // its key list as a parameter, so it has no reason to import anything. An
  // empty list here is the strongest possible form of "client-importable", and
  // it is checkable exactly because the module was made neutral.
  const sources = [...SHARED.withImports.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(sources, [],
    'lib/pages/draftState.js grew an import. It is imported by two collections and '
    + 'must stay pure — a key list belongs in its parameters, not its imports');
});

test('CONTROL: that import scan actually sees a source — it is not matching an empty list', () => {
  // A regex that finds nothing makes "no forbidden import" trivially true. The
  // shared module's expected list IS empty, so the scanner is proven against the
  // binding, which has imports, and then against a planted string.
  const sources = [...DRAFT_STATE.withImports.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.equal(sources.length, 3, 'the import scan found nothing to check');
  assert.deepEqual(
    [...`import x from 'mongoose';`.matchAll(/from '([^']+)'/g)].map((m) => m[1]),
    ['mongoose'],
    'the scanner does not see an import that is definitely there');
});

test('neither draftState module has db, model, React or next/* reach', () => {
  for (const [name, src] of [['the builder binding', DRAFT_STATE], ['the shared module', SHARED]]) {
    for (const forbidden of ['mongoose', '@/models/', '@/lib/db', 'react', 'next/']) {
      assert.equal(
        src.withImports.includes(`from '${forbidden}`),
        false,
        `${name} imports ${forbidden}, which makes it unusable from a client component`
      );
    }
  }
});

test('the SHARED module restates no collection’s key names', () => {
  // The neutral module must not know either partition. PageBuilder's nine are
  // checked here; CustomPage's are checked by its own binding's guard when that
  // lands. A key name appearing here would mean the parameterisation is
  // decorative.
  const restated = DRAFT_KEY_NAMES.filter(
    (k) => SHARED.code.includes(`'${k}'`) || SHARED.code.includes(`"${k}"`)
  );
  assert.deepEqual(restated, [],
    'the collection-neutral module hard-codes PageBuilder key names — it is not neutral');
});

// ── The model field ─────────────────────────────────────────────────────────

test('the model declares draft as a Mixed field defaulting to null', () => {
  assert.match(
    MODEL.code,
    /draft: \{ type: mongoose\.Schema\.Types\.Mixed, default: null \}/,
    'the draft field is gone, or no longer defaults to null'
  );
});

test('the model does not retype the nine content fields inside draft', () => {
  // Zod is the authoritative validator (draftContentSchema is PICKED from
  // pageBuilderSchema); a typed sub-schema here would be a second definition
  // that drifts. Same reasoning as SectionSchema's loose blob.
  const sub = /draft: new mongoose\.Schema\(/.test(MODEL.code);
  assert.equal(sub, false, 'the draft field grew its own sub-schema — Zod is the validator');
});

test('the draft field documents the two invariants that have no code to enforce them yet', () => {
  // A guard ON A COMMENT, deliberately, and read from `raw` because `code`
  // scrubs comments away. Nothing reads or writes a draft until round 2, so
  // "never in a public projection" and "never inside a PageVersion snapshot"
  // have no call site to assert against — the comment is the only carrier, and
  // it is the thing round 2 will be checked against.
  const start = MODEL.raw.indexOf('── The unpublished draft');
  const end = MODEL.raw.indexOf('draft: { type:');
  assert.ok(start > -1 && end > start, 'the draft field lost its documentation block');
  const block = MODEL.raw.slice(start, end);
  assert.match(block, /NULL MEANS/, 'the null-means-nothing-unpublished rule is undocumented');
  assert.match(block, /public projection/, 'the public-projection ban is undocumented');
  assert.match(block, /PageVersion/, 'the PageVersion-snapshot ban is undocumented');
});
