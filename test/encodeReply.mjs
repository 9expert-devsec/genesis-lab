/**
 * REACT'S OWN CLIENT ENCODER, THE ONE THE BROWSER RUNS.
 *
 * Round 67 wired this up inside `scripts/_diagnose-round67-payload.mjs` to
 * answer one question: does the editor's payload become a temporary reference?
 * Round 68 needed the same encoder from a TEST, and a second copy of the wiring
 * is exactly the drift this repo keeps being bitten by — so it lives here, and
 * the script imports it too. There is one harness.
 *
 * ── IT RUNS IN A CHILD PROCESS, AND THAT IS NOT FUSSINESS ────────────────
 * Loading React's client bundle requires installing webpack globals, and the
 * verification suite runs every file in ONE process (`isolation: 'none'`). The
 * first version of this did it in-process and MEASURED the consequence: three
 * assertions passed alone and failed inside the full suite with
 * `createTemporaryReferenceSet is not a function`, because module state from 531
 * other files won. A harness whose answer depends on who ran first is not a
 * measurement — and it was also leaking `__webpack_require__` into every test
 * that followed it.
 *
 * The child contains nothing else, so its answer is the same every time.
 *
 * ── WHY THE TIPTAP CASE CANNOT TAKE A PAYLOAD ────────────────────────────
 * The subject is a null PROTOTYPE, and JSON.stringify flattens exactly that. A
 * document shipped to the child as JSON would arrive already fixed and the
 * measurement would report a clean result for the broken case. So the child
 * BUILDS the document from the real schema, and only the verdict comes back.
 *
 * ── WHAT A TEMPORARY REFERENCE LOOKS LIKE IN THE OUTPUT ──────────────────
 * The encoded body is JSON, and a value React could not serialise appears as the
 * literal `"$T"` in place of the value:
 *
 *     [{"type":"doc","content":[{"type":"heading","attrs":"$T"}]}]
 *
 * Counting that literal is the measurement; the raw text comes back too, so a
 * test can assert WHERE the reference sits rather than only how many there are.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./encodeReplyWorker.mjs', import.meta.url));

/**
 * ── THE CHILD SETS ITS OWN NODE_ENV, AND IT HAS TO ───────────────────────
 *
 * `test/run.mjs:148` sets `process.env.NODE_ENV = 'production'` for the whole
 * suite, deliberately, so components take their production branches. A spawned
 * child inherits it — and React's `*.development.js` bundle is wrapped in
 * `if (process.env.NODE_ENV !== "production") { … }`, so under the suite it
 * exported NOTHING and the worker died with `createTemporaryReferenceSet is not
 * a function`. Standalone it worked, which is the worst version of a bug: an
 * instrument that answers differently depending on who ran it.
 *
 * Forcing `development` for the child is right rather than merely convenient.
 * The question is what React's ENCODER does with a value, and temporary
 * references are the same mechanism in both builds — the development bundle is
 * chosen because it is the one whose errors name themselves. Nothing else about
 * the suite's production mode is disturbed: this env applies to the child only.
 */
const CHILD_ENV = { ...process.env, NODE_ENV: 'development' };

/**
 * Encode `value` exactly as the browser would when calling a Server Action.
 *
 * For JSON-shaped payloads only — see the note above on why a Tiptap document
 * must go through `encodeTiptapNodes` instead.
 *
 * @param {unknown} value the single argument to encode
 * @returns {{text: string, temporaryReferences: number}}
 */
export function encodedReply(value) {
  const out = execFileSync(process.execPath, [WORKER, 'json'], {
    input: JSON.stringify(value), env: CHILD_ENV, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

/**
 * Build a one-node Tiptap document per name, from the REAL editor schema, and
 * report what React's encoder does to it before and after `toPlainJson`.
 *
 * One child for the whole list — spawning is the expensive part, and a test
 * asking about three node types should pay for it once.
 *
 * @param {string[]} nodeNames
 * @returns {Record<string, {attrsPrototypeIsNull: boolean,
 *   raw: {text: string, temporaryReferences: number},
 *   fixed: {text: string, temporaryReferences: number}}>}
 */
export function encodeTiptapNodes(nodeNames) {
  const out = execFileSync(process.execPath, [WORKER, 'tiptap', ...nodeNames], {
    env: CHILD_ENV, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

/**
 * The encoder's verdict on values that cannot cross the JSON transport — a
 * function, a symbol, a null-prototype object — planted inside the child.
 *
 * This is what keeps `encodedReply`'s zeros meaningful: without it, a caller
 * could only ever hand over JSON-shaped data, every answer would be 0, and a
 * dead encoder would look exactly like a clean payload.
 *
 * @returns {Record<'function'|'symbol'|'nullPrototype'|'plain',
 *   {text: string, temporaryReferences: number}>}
 */
export function encodeControlSubjects() {
  return JSON.parse(execFileSync(process.execPath, [WORKER, 'control'], {
    env: CHILD_ENV, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }));
}
