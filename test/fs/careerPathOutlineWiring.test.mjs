// The career-path outline is an upload from form to MSDB — no text box, no
// paste, one rule on both ends.
//
//   form   CareerPathForm mounts CareerPathOutlineUpload (controlled through
//          `outlineUrl` state), carries the value as links_outlineUrl exactly as
//          the paste used to travel, and renders the rename warning from the
//          lib's careerOutlineWouldGoStale.
//   save   shapePayload accepts a /files/…/*.pdf path or '' for that field
//          and refuses anything else BY NAME — through isFilesPdfPath, the
//          same predicate the upload field uses to label a leftover paste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, blankStringBodies } from '../sourceScan.mjs';

const FORM = 'src/app/admin/career-paths/_components/CareerPathForm.jsx';
const ACTIONS = 'src/lib/actions/career-paths.js';
const FIELD = 'src/components/admin/CareerPathOutlineUpload.jsx';

test('the form mounts the upload field, controlled by outlineUrl, and no longer offers a text box for it', () => {
  const { code, withImports } = readSource(FORM);
  assert.match(withImports, /import \{ CareerPathOutlineUpload \} from '@\/components\/admin\/CareerPathOutlineUpload'/);
  const mount = code.match(/<CareerPathOutlineUpload\b([\s\S]*?)\/>/);
  assert.ok(mount, 'CareerPathOutlineUpload is not mounted');
  assert.match(mount[1], /apiSlug=\{slug\}/, 'the derivation input is the live slug state');
  assert.match(mount[1], /value=\{outlineUrl\}/);
  assert.match(mount[1], /onChange=\{setOutlineUrl\}/, 'the signed publicPath lands in outlineUrl state');
  assert.match(mount[1], /lang="th"/);
  // The old field: a text input bound to outlineUrl. Gone means gone.
  assert.equal(/value=\{outlineUrl\}[^>]*onChange=\{\(e\) => setOutlineUrl\(e\.target\.value\)\}/.test(code.replace(/\s+/g, ' ')), false,
    'a text input still writes outlineUrl from the keyboard');
  assert.equal(/Outline URL/.test(code), false, 'the old label is gone');
  assert.match(code, /fd\.set\('links_outlineUrl', outlineUrl\)/, 'the value still travels as links_outlineUrl');
});

test('the form renders the rename warning from the lib, keyed on the stored api_slug, the live slug and the value', () => {
  const { code, withImports } = readSource(FORM);
  assert.match(withImports, /import \{ careerOutlineWouldGoStale \} from '@\/lib\/careerPaths\/careerPathOutline'/);
  assert.match(code, /careerOutlineWouldGoStale\(\{\s*previousApiSlug: careerPath\?\.api_slug \?\? '',\s*nextApiSlug: slug,\s*outlineUrl,\s*\}\)/);
  assert.match(code, /\{outlineStale \? \(/, 'the warning is rendered, not console.warn-ed');
  assert.match(code, /\{outlineStale\.stored\}/);
  assert.match(code, /\{outlineStale\.derived\}/);
  assert.equal(/console\.warn\([^)]*stale/i.test(code), false, 'not a console warning — the admin must SEE it');
});

test('shapePayload accepts a /files pdf path or empty for links_outlineUrl and refuses the rest by field name', () => {
  const { code, withImports } = readSource(ACTIONS);
  assert.match(withImports, /import \{ isFilesPdfPath \} from '@\/lib\/careerPaths\/careerPathOutline'/);
  assert.match(code, /outlineUrl: outlineUrlFromForm\(formData\.get\('links_outlineUrl'\)\)/);
  const fn = code.match(/function outlineUrlFromForm\(raw\) \{([\s\S]*?)\n\}/);
  assert.ok(fn, 'outlineUrlFromForm is missing');
  assert.match(fn[1], /if \(!value\) return '';/, 'empty stays legal');
  assert.match(fn[1], /if \(isFilesPdfPath\(value\)\) return value;/);
  assert.match(fn[1], /throw new Error\(/, 'anything else is refused, not silently blanked');
  assert.match(blankStringBodies(fn[1]).length ? fn[1] : '', /links_outlineUrl/, 'the refusal names the field');
  // And no legacy exception crept in.
  assert.equal(/9exp\.link|cloudinary/.test(fn[1]), false, 'no external host is let through');
});

test('CONTROL: shapePayload throws are turned into { ok:false, error } by both callers', () => {
  const { code } = readSource(ACTIONS);
  const wrapped = code.match(/try \{\s*payload = shapePayload\(formData, courses\);\s*\} catch \(err\) \{/g) || [];
  assert.equal(wrapped.length, 2, 'create and update both wrap shapePayload');
});

test('the upload field never builds a path and only ever emits what the server signed', () => {
  const { code, withImports } = readSource(FIELD);
  assert.match(withImports, /from '@\/lib\/actions\/career-path-outlines'/);
  assert.match(withImports, /import \{ isFilesPdfPath \} from '@\/lib\/careerPaths\/careerPathOutline'/);
  assert.equal(/['"`]\/files\//.test(code), false, 'the field spells no /files path of its own');
  assert.match(code, /onChange\?\.\(signed\.publicPath\)/, 'the emitted value is the signed publicPath');
  const emits = code.match(/onChange\?\.\((.*?)\)/g) || [];
  assert.deepEqual(emits.sort(), ["onChange?.('')", 'onChange?.(signed.publicPath)'].sort(), 'only clear and the signed path are ever emitted');
  assert.match(code, /overwrite|params/, 'the browser posts the server-signed params');
  assert.match(code, /for \(const \[k, v\] of Object\.entries\(signed\.params\)\) body\.append\(k, String\(v\)\)/, 'params are appended verbatim — overwrite/invalidate cannot be dropped client-side');
});

test('CONTROL: the text-input probe fires on the field this round removed', () => {
  const old = `<input type="text" value={outlineUrl} onChange={(e) => setOutlineUrl(e.target.value)} placeholder="https://..." />`;
  assert.equal(/value=\{outlineUrl\}[^>]*onChange=\{\(e\) => setOutlineUrl\(e\.target\.value\)\}/.test(old.replace(/\s+/g, ' ')), true);
});
