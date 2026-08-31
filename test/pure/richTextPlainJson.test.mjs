import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { toPlainJson, nonPlainValues } from '../plainValue.mjs';
import { encodeControlSubjects } from '../encodeReply.mjs';
import { richTextExtensions } from '@/components/pageBuilder/editor/richText/tiptapExtensions';
import { RICH_TEXT_NODES } from '@/lib/pageBuilder/richTextContract';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

/**
 * `editor.getJSON()` IS NOT PLAIN JSON, AND THAT COST FOUR ROUNDS.
 *
 * ProseMirror builds a node's attributes with `Object.create(null)`, and
 * `Node.toJSON()` hands that object straight out. React's client encoder refuses
 * a null-prototype object — it becomes `"$T"`, a temporary reference — and the
 * server decodes that into a Proxy that throws on almost any property. The first
 * reader is Mongoose's `isBsonType`, literally `obj._bsontype === typename`, so
 * the failure surfaced as a MongoDB-shaped message about a problem that has
 * nothing to do with MongoDB.
 *
 * Rounds 62 and 66 audited return values (the wrong boundary). Round 67 built the
 * guard that finally named the path. This file pins the fix and the reason.
 *
 * ── WHAT IS ASSERTED WHERE ───────────────────────────────────────────────
 *   the prototype               here, directly
 *   the encoder's verdict       here, through REACT'S OWN encodeReply
 *   the server-side refusal     test/pure/serverActionBoundary (round 67)
 */

const schema = getSchema(richTextExtensions());

/** Nodes whose schema declares attributes — the only ones that can carry the bug. */
const ATTRS_BEARING = Object.entries(schema.nodes)
  .filter(([, type]) => Object.keys(type.spec.attrs ?? {}).length > 0)
  .map(([name]) => name);

test('exactly three node types declare attributes, and they are in the contract', () => {
  /**
   * Not a hand-list: read off the generated schema, so an extension added later
   * that brings a fourth attrs-bearing node turns this red and gets considered
   * rather than silently inheriting the bug.
   */
  assert.deepEqual(ATTRS_BEARING.sort(), ['heading', 'image', 'orderedList']);
  for (const name of ATTRS_BEARING) {
    assert.ok(RICH_TEXT_NODES.includes(name), `${name} is not in the walker's contract`);
  }
});

test('no attribute DEFAULT is non-plain — the declarations are not the bug', () => {
  /**
   * Worth pinning because it is the fix that was NOT made. The obvious place to
   * blame is an extension declaring an attribute whose default is a function or
   * a class instance; measured, none does. The null prototype comes from
   * ProseMirror core, below every extension, which is why the fix sits at the
   * getJSON boundary instead.
   */
  for (const [name, type] of Object.entries(schema.nodes)) {
    for (const [attr, spec] of Object.entries(type.spec.attrs ?? {})) {
      const def = spec?.default;
      const kind = def === null ? 'null' : typeof def;
      assert.ok(['null', 'undefined', 'string', 'number', 'boolean'].includes(kind),
        `${name}.${attr} has a ${kind} default — an extension declaration IS the bug after all`);
    }
  }
});

test('ProseMirror really does hand out null-prototype attrs — the bug, reproduced', () => {
  /**
   * The control for everything below. If this ever stops being true — an upstream
   * fix, a version bump — the assertions after it would pass for the wrong
   * reason, so the defect itself is pinned first.
   */
  let sawOne = false;
  for (const name of ATTRS_BEARING) {
    const json = schema.nodes[name].createAndFill()?.toJSON();
    assert.ok(json?.attrs, `${name} produced no attrs to check`);
    assert.equal(Object.getPrototypeOf(json.attrs), null,
      `${name}.attrs is no longer null-prototype — if upstream fixed this, `
      + 'toPlainJson is now belt-and-braces and this file should say so');
    sawOne = true;
  }
  assert.ok(sawOne, 'no attrs-bearing node was exercised');

  // ...and a node with no declared attrs omits the key entirely, which is why
  // documents of paragraphs and bullet lists saved fine for months.
  for (const name of ['paragraph', 'blockquote', 'bulletList', 'listItem', 'horizontalRule']) {
    const json = schema.nodes[name]?.createAndFill()?.toJSON();
    assert.equal(json?.attrs, undefined, `${name} unexpectedly carries an attrs key`);
  }
});

test('toPlainJson gives every attrs object a real prototype', () => {
  for (const name of ATTRS_BEARING) {
    const json = schema.nodes[name].createAndFill().toJSON();
    const fixed = toPlainJson({ type: 'doc', content: [json] });
    const attrs = fixed.content[0].attrs;
    assert.equal(Object.getPrototypeOf(attrs), Object.prototype,
      `${name}.attrs still has the wrong prototype after toPlainJson`);
    /**
     * ...and the VALUES are untouched, which is the whole claim. Compared as
     * ENTRIES rather than with deepEqual: `assert/strict`'s deepEqual compares
     * PROTOTYPES too, so it can never equate a null-prototype object with a
     * plain one — it would fail here for the very reason the fix exists, which
     * is a test asserting about its own comparator instead of the code.
     */
    assert.deepEqual(Object.entries(attrs), Object.entries(json.attrs),
      `${name}.attrs changed value, not just prototype`);
  }
});

test('toPlainJson changes nothing except the prototype', () => {
  /**
   * The narrowness, asserted. It must not add a key, drop a key, reorder, coerce,
   * or flatten a value it does not own — a "fix" that quietly rewrote an author's
   * document would be far worse than the bug.
   */
  const source = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'หัวข้อ' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'ก', marks: [{ type: 'bold' }] }] },
    ],
  };
  assert.deepEqual(toPlainJson(source), source);

  // `undefined` survives as a KEY — a JSON round trip would drop it, and losing a
  // key on save is the failure this is meant to prevent, not cause.
  const withUndefined = { a: undefined, b: 1 };
  const out = toPlainJson(withUndefined);
  assert.ok(Object.keys(out).includes('a'), 'toPlainJson dropped an undefined-valued key');
  assert.equal(out.a, undefined);

  // An object with a prototype it does not own is returned AS IS, not flattened.
  const when = new Date('2026-08-31T00:00:00.000Z');
  const kept = toPlainJson({ when });
  assert.equal(kept.when, when, 'toPlainJson flattened a Date — it is not a sanitiser');
  assert.equal(Object.getPrototypeOf(kept.when), Date.prototype);

  // Arrays stay arrays; primitives pass through.
  assert.ok(Array.isArray(toPlainJson([1, 2])));
  for (const v of [null, undefined, 0, '', false, 'ก']) assert.equal(toPlainJson(v), v);
});

// ── React's own verdict ────────────────────────────────────────────────────

/**
 * ── WHAT THE SUITE ASKS REACT, AND WHAT IT DELIBERATELY DOES NOT ─────────
 *
 * The claim is a COMPOSITION, and each part is asserted where it can be
 * answered cheaply and deterministically:
 *
 *   1. getJSON hands out null-prototype attrs      asserted above, locally
 *   2. toPlainJson gives them Object.prototype     asserted above, locally
 *   3. React refuses a NULL-PROTOTYPE object       asserted below, in React
 *
 * (3) is a fact about React, not about Tiptap, so it is asked with a bare
 * `Object.create(null)` rather than by rebuilding a document. That is not a
 * weaker test — it is the same fact with the incidental parts removed, and it
 * costs no `@/` alias resolution in the child, which is what made the
 * document-shaped version return an incomplete React module under the full
 * suite while passing alone. `encodeTiptapNodes` still exists for the probe
 * script, where a process runs by itself and the end-to-end shape is worth
 * seeing whole.
 */

test('CONTROL — the encoder itself discriminates, on subjects planted inside it', () => {
  /**
   * The harness runs in a child process, and a child that silently failed to
   * load React would report 0 for everything — indistinguishable from a clean
   * payload. These four subjects are planted INSIDE that child (a function and a
   * symbol cannot cross a JSON transport at all), so this is the assertion that
   * makes every zero above mean something.
   *
   * `nullPrototype` is round 68's bug in its purest form, kept here as a
   * permanent statement of the mechanism: an object with no prototype is a
   * temporary reference to React, exactly like a function is.
   */
  const c = encodeControlSubjects();
  assert.equal(c.function.temporaryReferences, 1, 'a planted function did not become $T');
  assert.equal(c.symbol.temporaryReferences, 1, 'a planted symbol did not become $T');
  assert.equal(c.nullPrototype.temporaryReferences, 1,
    'a null-prototype object no longer becomes $T — if React changed, this bug is gone '
    + 'and toPlainJson is now belt-and-braces');
  assert.equal(c.plain.temporaryReferences, 0, 'a plain object became $T — the encoder is broken');
});

test('the editor wires toPlainJson into onUpdate — the seam, not just the helper', () => {
  /**
   * A source read, because `onUpdate` is handed to Tiptap and never renders. The
   * helper being correct is worth nothing if the one call site that feeds app
   * state does not use it, and that call site is the entire fix.
   */
  const src = readSource('src/components/pageBuilder/editor/richText/RichTextEditor.jsx');
  assert.ok(src.includes('onChange(toPlainJson(ed.getJSON()))'),
    'onUpdate no longer normalises the document — a heading would poison the save again');
  assert.ok(/import \{ toPlainJson \} from '@\/lib\/plainValue'/.test(src),
    'toPlainJson is not imported from the shared module');
});

/** Comments stripped, this repo's standing rule — a block comment naming the
 *  call would otherwise satisfy the check on its own. */
function readSource(rel) {
  const { readFileSync } = require_('node:fs');
  const path = require_('node:path');
  const { fileURLToPath } = require_('node:url');
  const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  return readFileSync(path.join(root, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

