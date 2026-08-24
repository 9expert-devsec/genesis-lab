/**
 * ROUND 68 §A/§B/§D — which Tiptap attribute is not plain, and does it really
 * become a temporary reference?
 *
 * Round 67's guard named the path on a real save:
 *   patch.sections[2].content.children[0].content.doc.content[0].attrs
 *
 * Note WHERE that ends: at `.attrs`, not at `.attrs.<name>`. So the attrs
 * OBJECT ITSELF is what React could not serialise, which narrows the shape
 * before any reading — React emits a temporary reference for a FUNCTION or a
 * SYMBOL, and for nothing else.
 *
 * READ-ONLY. Builds the real schema, dumps every attribute, and round-trips a
 * document through React's own encodeReply.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_diagnose-round68-attrs.mjs
 */
import { getSchema } from '@tiptap/core';
import { nonPlainValues, describeNonPlain, unserialisableArguments } from '../test/plainValue.mjs';

const { richTextExtensions } = await import('@/components/pageBuilder/editor/richText/tiptapExtensions');
const { RICH_TEXT_NODES, RICH_TEXT_MARKS } = await import('@/lib/pageBuilder/richTextContract');

const extensions = richTextExtensions();
console.log(`extensions configured: ${extensions.length}`);

const schema = getSchema(extensions);

console.log('\n=== §A  every NODE the editor can produce, and its attrs ===');
const suspects = [];
for (const [name, type] of Object.entries(schema.nodes)) {
  const specs = type.spec.attrs ?? {};
  const keys = Object.keys(specs);
  const inContract = RICH_TEXT_NODES.includes(name);
  console.log(`  ${name.padEnd(16)} contract=${inContract ? 'yes' : 'NO '}  attrs=[${keys.join(', ') || '-'}]`);
  for (const k of keys) {
    const def = specs[k]?.default;
    const t = def === null ? 'null' : Array.isArray(def) ? 'array' : typeof def;
    if (t !== 'undefined' && t !== 'string' && t !== 'number' && t !== 'boolean' && t !== 'null') {
      suspects.push({ node: name, attr: k, type: t, value: String(def) });
    }
    console.log(`      ${k.padEnd(14)} default=${t}${t === 'function' ? '  <-- NOT PLAIN' : ''}`);
  }
}

console.log('\n=== §A  every MARK, and its attrs ===');
for (const [name, type] of Object.entries(schema.marks)) {
  const specs = type.spec.attrs ?? {};
  console.log(`  ${name.padEnd(16)} contract=${RICH_TEXT_MARKS.includes(name) ? 'yes' : 'NO '}  attrs=[${Object.keys(specs).join(', ') || '-'}]`);
}

console.log(`\nnon-plain attribute DEFAULTS: ${suspects.length}`);
for (const s of suspects) console.log(`  ${s.node}.${s.attr} = ${s.type} ${s.value}`);

// ── §D: what a real node's attrs look like once ProseMirror builds one ──────
console.log('\n=== §D  the attrs ProseMirror actually puts on a created node ===');
for (const nodeName of ['paragraph', 'heading', 'image', 'horizontalRule', 'blockquote',
  'bulletList', 'orderedList', 'listItem', 'hardBreak']) {
  const type = schema.nodes[nodeName];
  if (!type) { console.log(`  ${nodeName}: not in schema`); continue; }
  let node;
  try {
    node = type.createAndFill();
  } catch (e) { console.log(`  ${nodeName}: create threw ${e.message}`); continue; }
  if (!node) { console.log(`  ${nodeName}: createAndFill returned null`); continue; }
  const json = node.toJSON();
  const hits = nonPlainValues(json);
  console.log(`  ${nodeName.padEnd(16)} attrs=${JSON.stringify(json.attrs ?? null)}  ${hits.length ? 'DIRTY' : 'clean'}`);
  if (hits.length) console.log(describeNonPlain(hits));
}

// ── §D: through React's REAL encoder ────────────────────────────────────────
globalThis.__webpack_require__ = Object.assign(
  function (id) { throw new Error('client module reference in a data payload: ' + id); },
  { u: () => '', e: () => Promise.resolve(), m: {} },
);
globalThis.__webpack_chunk_load__ = () => Promise.resolve();
const { createRequire } = await import('node:module');
const req = createRequire(import.meta.url);
const { encodeReply, createTemporaryReferenceSet } = req(
  '../node_modules/next/dist/compiled/react-server-dom-webpack/cjs/'
  + 'react-server-dom-webpack-client.browser.development.js');

async function encodeCount(label, value) {
  const temporaryReferences = createTemporaryReferenceSet();
  try {
    const body = await encodeReply([value], { temporaryReferences });
    const text = typeof body === 'string' ? body : await new Response(body).text();
    const n = (text.match(/"\$T"/g) ?? []).length;
    console.log(`  ${label.padEnd(46)} "$T"=${n}`);
    return n;
  } catch (e) {
    console.log(`  ${label.padEnd(46)} THREW: ${e.message}`);
    return -1;
  }
}

console.log('\n=== §D  through React\'s real encodeReply ===');
const docOf = (nodes) => ({ type: 'doc', content: nodes });
for (const nodeName of ['paragraph', 'heading', 'image', 'horizontalRule']) {
  const type = schema.nodes[nodeName];
  if (!type) continue;
  const node = type.createAndFill();
  if (!node) continue;
  await encodeCount(`doc whose first node is ${nodeName}`, docOf([node.toJSON()]));
}

console.log('\n=== CONTROL: the harness can see a temporary reference ===');
await encodeCount('attrs is a FUNCTION', docOf([{ type: 'paragraph', attrs: () => {} }]));
await encodeCount('attrs is a SYMBOL', docOf([{ type: 'paragraph', attrs: Symbol('x') }]));
await encodeCount('attrs holds a function VALUE', docOf([{ type: 'paragraph', attrs: { a: () => {} } }]));
await encodeCount('a plain doc', docOf([{ type: 'paragraph', attrs: {}, content: [{ type: 'text', text: 'ก' }] }]));
