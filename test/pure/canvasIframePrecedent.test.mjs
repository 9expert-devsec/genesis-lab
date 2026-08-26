import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSource } from '../sourceScan.mjs';

/**
 * Round 19 — ONE TRIPWIRE, AND IT FIRES ON THE CHANGE WE WANT.
 *
 * docs/canvas-iframe-cost.md §5 reports that this repo has no precedent for a
 * same-origin, reached-into iframe: every `<iframe>` in src/ is a third-party
 * embed with an external src, and contentDocument / contentWindow / postMessage
 * / srcDoc appear nowhere at all.
 *
 * ══ THIS IS NOT A RULE. DO NOT "FIX" IT BY ROUTING AROUND IT. ═══════════════
 *
 * It exists to go RED on the first commit of the round that builds the canvas
 * iframe — which is a fine thing to happen. When it does, the correct response
 * is to DELETE this file and reconcile §6's cost estimate against what the work
 * actually cost. An estimate nobody goes back to is how the next estimate gets
 * made badly, and this is the only mechanism that will make anyone go back.
 *
 * ══ WHY THE SCOPE IS THE PAGE BUILDER AND NOT ALL OF src/ ══════════════════
 *
 * `postMessage` is a perfectly ordinary thing for an analytics script or a chat
 * widget to use, and one arriving somewhere unrelated must not read as "the
 * iframe canvas was built". Scoped to the two Page Builder trees, the four
 * names mean exactly one thing.
 *
 * PURE: source text only. No React, no DOM.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Every .js/.jsx under the Page Builder's component and lib trees. */
const SCOPE = ['src/components/pageBuilder', 'src/lib/pageBuilder'];

function filesInScope() {
  const out = [];
  const walk = (rel) => {
    for (const entry of readdirSync(path.join(ROOT, rel))) {
      const childRel = `${rel}/${entry}`;
      if (statSync(path.join(ROOT, childRel)).isDirectory()) walk(childRel);
      else if (/\.jsx?$/.test(entry)) out.push(childRel);
    }
  };
  for (const dir of SCOPE) walk(dir);
  return out.sort();
}

/**
 * The four names that only appear when something reaches INTO a frame.
 * `<iframe>` itself is deliberately NOT among them: the embed section renders
 * one legitimately, and so does anything an author pastes into customHtml.
 * Rendering a frame is not the same act as reaching into one.
 */
const REACH_IN = ['contentDocument', 'contentWindow', 'postMessage', 'srcDoc', 'srcdoc'];

/** Files in scope whose CODE (comments and imports stripped) names one. */
function reachIntoFrame() {
  return filesInScope()
    .map((rel) => ({ rel, code: readSource(rel).code }))
    .filter(({ code }) => REACH_IN.some((n) => code.includes(n)))
    .map(({ rel }) => rel);
}

test('AUDIT TRIPWIRE (round 19 §5): nothing in the Page Builder reaches into an iframe', () => {
  assert.deepEqual(reachIntoFrame(), [],
    'THE CANVAS IFRAME IS BEING BUILT (or something else now reaches into a frame). '
    + 'That is not a failure — it is this tripwire doing its job. DELETE this file, and go '
    + 'reconcile docs/canvas-iframe-cost.md §6 against what the work actually cost: which '
    + 'parts were routine as predicted, and which of the five "unpredictable" items bit.');
});

test('CONTROL: the scan reads real files and would catch the names it looks for', () => {
  /**
   * Three ways the assertion above could pass while meaning nothing: the file
   * list is empty, the reader returns nothing, or the matcher never matches.
   * All three are closed here.
   */
  const files = filesInScope();
  assert.ok(files.length > 30, `only ${files.length} files in scope — the walk is not reaching the tree`);
  assert.ok(files.includes('src/components/pageBuilder/editor/CanvasPanel.jsx'),
    'the canvas itself is not in scope, which is the one file that matters most');
  assert.ok(readSource('src/components/pageBuilder/editor/CanvasPanel.jsx').code.length > 500,
    'the reader returned (almost) nothing');

  // The matcher, over the source a first iframe commit would produce.
  const wouldBe = 'const doc = frameRef.current.contentDocument; createPortal(kids, doc.body);';
  assert.ok(REACH_IN.some((n) => wouldBe.includes(n)),
    'the name list would not notice a portal into a frame — the tripwire is inert');
});

test('CONTROL: rendering an iframe is NOT what this looks for', () => {
  /**
   * The embed section renders a real <iframe> today and must stay green. If the
   * scan matched the tag it would be red already, and its silence above would
   * mean the Page Builder had no embed section rather than no frame reach-in.
   */
  const embed = readSource('src/components/pageBuilder/sections/embed.jsx').code;
  assert.match(embed, /<iframe/, 'the embed section no longer renders a frame');
  assert.equal(REACH_IN.some((n) => embed.includes(n)), false,
    'the embed section trips the scan — the two acts are no longer distinguished');
  assert.equal(reachIntoFrame().includes('src/components/pageBuilder/sections/embed.jsx'), false);
});
