import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE TWO HALVES OF THE `<style>` FIX ARE ACTUALLY WIRED IN.
 *
 * test/render/advancedHtmlStyleBlock proves both mechanisms WORK when handed
 * the extension and the option. Neither of those assertions notices if the
 * extension is dropped from the editor's list, or if the renderer stops passing
 * `allowStyle` — the modules stay correct and protect nothing, which is the
 * exact failure mode test/fs/sanitizeRichHtmlWiring was written for one fix
 * along. Same guard, same reasoning.
 *
 * ── AND THE THIRD ASSERTION IS THE OPPOSITE ONE ────────────────────────────
 * The page-builder surfaces must NOT acquire `allowStyle`. That is not a style
 * preference: the preview route renders its PREVIEW banner outside
 * PageBuilderView precisely because "customHtml cannot inject a <style> to hide
 * it (the shared sanitizer drops <style> entirely)". A future edit that widens
 * the flag to those call sites would retire that sentence silently, so the
 * absence is pinned as deliberately as the presence.
 */

test('the editor registers StyleNode in its extension list', () => {
  // `withImports`, not `code`: readSource's default view STRIPS the import
  // block, so the import assertion has to read the variant that keeps it.
  const { code, withImports } = readSource('src/app/admin/pages/_components/CustomPageForm.jsx');

  assert.match(
    withImports,
    /import\s*\{\s*StyleNode\s*\}\s*from\s*'\.\/extensions\/StyleNode'/,
    'CustomPageForm no longer imports StyleNode',
  );

  /*
   * Inside useEditor's `extensions: [...]`, not merely somewhere in the file —
   * an unused import satisfies the check above and changes nothing.
   *
   * Bounded by `content:`, the next key in the useEditor options object, rather
   * than by the first `]`. The first `]` lands inside
   * `heading: { levels: [1, 2, 3, 4] }` on the array's own first entry, which
   * cut the slice off before any of the nodes this file is about — a bound that
   * made the assertion fail against correct source. Both ends are asserted
   * present so a rename fails loudly instead of silently slicing nothing.
   */
  const at = code.indexOf('extensions: [');
  assert.ok(at > 0, 'useEditor extensions array not found (source moved?)');
  const end = code.indexOf('content:', at);
  assert.ok(end > at, 'useEditor `content:` option not found after the extensions array');
  const block = code.slice(at, end);
  assert.match(block, /\bStyleNode\b/, 'StyleNode is imported but not registered');
  // The sibling node it mirrors, as a canary on the slice itself: if this
  // stops matching, the block being searched is the wrong one.
  assert.match(block, /\bIframeNode\b/, 'wrong extensions block sliced');
});

test('the Advanced HTML page renderer passes allowStyle', () => {
  const { code } = readSource('src/app/(public)/[...slug]/_components/CustomPageView.jsx');
  assert.match(
    code,
    /sanitizePageHtml\(\s*page\?\.body\s*,\s*\{\s*allowStyle:\s*true\s*\}\s*\)/,
    'CustomPageView no longer opts in to <style>',
  );
});

test('no page-builder surface opts in to <style>', () => {
  /*
   * The three other callers of the shared sanitizer. Each must call it with the
   * body alone. Asserted per file with its own message, so a failure names the
   * surface that acquired the flag rather than saying "one of three".
   */
  const shared = [
    'src/components/pageBuilder/SectionRenderer.jsx',
    'src/components/pageBuilder/sections/custom_html.jsx',
    'src/components/pageBuilder/sections/embed.jsx',
  ];

  for (const path of shared) {
    const { code } = readSource(path);
    assert.match(
      code,
      /sanitizePageHtml\(/,
      `${path}: no longer calls the shared sanitizer at all — has it forked one?`,
    );
    assert.doesNotMatch(
      code,
      /allowStyle/,
      `${path}: opted in to <style>. The preview banner's protection rests on `
      + 'these three NOT doing that — see the preview route and the sanitizer note.',
    );
  }
});

test('the preview route still states the assumption these tests protect', () => {
  /*
   * A comment as the subject under test, deliberately. The banner's safety is
   * an argument written in prose in one file and enforced by an absent flag in
   * three others; nothing links them but this. If the sentence is rewritten,
   * whoever rewrites it is made to look at the three call sites above.
   *
   * Matched against source WITH comments (readSource's raw text), which is the
   * one case the suite's strip-comments rule does not apply to.
   */
  const { raw } = readSource('src/app/(public)/preview/[slug]/page.jsx');
  assert.match(
    raw,
    /drops <style> entirely/,
    'the preview route no longer documents its dependence on <style> being dropped',
  );
});
