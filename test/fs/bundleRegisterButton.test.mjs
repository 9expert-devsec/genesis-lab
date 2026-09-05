import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const has = (p) => existsSync(path.join(ROOT, p));

const VIEW = 'src/components/pageBuilder/PageBuilderView.jsx';
const RENDERER = 'src/components/pageBuilder/SectionRenderer.jsx';
const SECTION = 'src/components/pageBuilder/sections/promotion_bundle.jsx';

/**
 * THE PAIR REACHES THE SECTION, AND THE COPY BUTTON IS GONE.
 *
 * The render tests can hand `PromotionBundleSection` a pair directly, so they
 * cannot see whether anything actually threads one. That is the failure with no
 * symptom: every render assertion stays green while the live page draws no
 * button at all, because `PageBuilderView` never passed a page id.
 */

test('PageBuilderView threads the page id into the renderer', () => {
  const view = read(VIEW);
  assert.match(view, /pageId=\{page\._id/, 'the page no longer threads its own id');
});

test('SectionRenderer accepts it, passes it to the component, AND recurses with it', () => {
  /**
   * The recursion is the half most likely to be missed, and it is not
   * decorative: a `promotion_bundle` inside a `two_column` is an ordinary
   * promotion layout, and a nested bundle handed `null` would silently draw no
   * button while its top-level sibling drew one.
   */
  const code = read(RENDERER);
  assert.match(code, /^\s*pageId = null,$/m, 'the prop is not accepted');

  const recursion = code.slice(code.indexOf('childProps[slot] = arr.map'), code.indexOf('// Render-context props'));
  assert.match(recursion, /pageId=\{pageId\}/, 'the recursion drops the page id — a nested bundle gets null');

  const dispatch = code.slice(code.indexOf('const inner = ('), code.indexOf('{...childProps}'));
  assert.match(dispatch, /pageId=\{pageId\}/, 'the component is not handed the page id');
  assert.match(dispatch, /sectionId=\{section\.id\}/, 'the component is not handed its own section id');
});

test('CONTROL: the recursion slice is really the recursion', () => {
  const code = read(RENDERER);
  const recursion = code.slice(code.indexOf('childProps[slot] = arr.map'), code.indexOf('// Render-context props'));
  assert.ok(recursion.length > 100 && recursion.length < 1500, `slice is ${recursion.length} chars — bounds moved`);
  assert.match(recursion, /<SectionRenderer/, 'the slice does not contain the recursive call');
  assert.equal(recursion.includes('const inner ='), false, 'the slice has swallowed the dispatch');
});

test('the section builds the link from BOTH halves, and draws none without both', () => {
  const code = read(SECTION);
  assert.match(code, /pageId && sectionId/, 'the link no longer requires both halves of the pair');
  assert.match(code, /\/registration\/bundle\?page=/, 'the link target is gone');
  assert.match(code, /encodeURIComponent\(pageId\)/, 'the page id is interpolated unencoded');
  assert.match(code, /encodeURIComponent\(sectionId\)/, 'the section id is interpolated unencoded');
});

test('THE COPY BUTTON IS GONE, and so is the component it was the only caller of', () => {
  /**
   * The round's ruling: the copy-the-code button is removed ONCE registering
   * works, and not before — so that no bundle on a live page is ever left with
   * no working button at all.
   *
   * `CopyCodeButton` had exactly one caller. Leaving the file behind would be a
   * dead client module in a directory whose siblings are all reachable, which
   * is the thing this repo keeps removing.
   */
  assert.equal(
    has('src/components/pageBuilder/CopyCodeButton.jsx'),
    false,
    'CopyCodeButton is still on disk — it has no callers left',
  );
  const code = read(SECTION);
  assert.equal(/CopyCodeButton/.test(code.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'the section still imports it');
});

test('CONTROL: the deleted-file probe can see a file that IS there', () => {
  // Otherwise "it is gone" is satisfied by a probe that always answers false.
  assert.equal(has(SECTION), true);
  assert.equal(has('src/components/pageBuilder/SectionRenderer.jsx'), true);
});

test('the discount code KEPT its reader — the field is not orphaned', () => {
  /**
   * Only the BUTTON was removed. `content.discountCode` is a schema field whose
   * declared readers are "the renderer's code chip + its copy button"; deleting
   * the chip as well would have left a stored field that nothing on the public
   * site reads, which is the standing rule this round is held to.
   */
  const code = read(SECTION);
  assert.match(code, /data-testid="bundle-code"/, 'the code chip went with the copy button');
  assert.match(code, /content\?\.discountCode/, 'the section no longer reads the field at all');
  // The editor still writes it, and sectionRendersEmpty still counts it.
  assert.match(read('src/components/pageBuilder/editor/SectionContentEditor.jsx'), /discountCode/);
  assert.match(read('src/lib/pageBuilder/sectionLabels.js'), /discountCode/);
});

test('no other section component takes a pageId it does not use', () => {
  /**
   * `pageId` is a render-context prop handed to EVERY type, exactly as `domId`,
   * `settings` and `data` are. This sweeps the section directory to confirm
   * `promotion_bundle` is the only one that names it — a second type quietly
   * reading it would be a second thing to keep right when the threading changes.
   */
  const dir = 'src/components/pageBuilder/sections';
  const users = readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.jsx'))
    .filter((f) => read(path.join(dir, f)).includes('pageId'));
  assert.deepEqual(users, ['promotion_bundle.jsx']);
});
