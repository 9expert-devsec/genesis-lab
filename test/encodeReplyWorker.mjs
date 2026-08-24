/**
 * The child half of test/encodeReply.mjs. Not imported by anything — spawned.
 *
 * It exists because loading React's client bundle requires installing webpack
 * globals into the process, and the verification suite runs every file in ONE
 * process (`isolation: 'none'`). Round 68 measured the consequence: the harness
 * passed alone and failed inside the full suite with
 * `createTemporaryReferenceSet is not a function`, because module state 531
 * other files had established won. A harness that answers differently depending
 * on who ran before it is not a measurement.
 *
 * So the encoder runs HERE, in a process that contains nothing else. That also
 * removes the `globalThis.__webpack_require__` this used to leak into the suite.
 *
 * Two modes, because a Tiptap document CANNOT be shipped in over JSON: the whole
 * subject is its `attrs` object's NULL PROTOTYPE, and JSON.stringify flattens
 * exactly that. So the tiptap mode builds the document here, from the real
 * schema, and only the RESULT crosses back.
 *
 *   node test/encodeReplyWorker.mjs tiptap <nodeName>...
 *   node test/encodeReplyWorker.mjs json          (payload on stdin)
 *   node test/encodeReplyWorker.mjs control       (plants its own subjects)
 */
import { register } from 'node:module';
import { createRequire } from 'node:module';

/**
 * The `@/` loader is registered ONLY in the tiptap branch, and that placement is
 * load-bearing. Registered unconditionally it made this worker return an
 * incomplete React module under the full suite — `createTemporaryReferenceSet is
 * not a function` — while working standalone. The `control` and `json` modes
 * need no alias resolution at all, so they no longer touch it, and they are the
 * two the verification suite depends on.
 */

globalThis.__webpack_require__ = Object.assign(
  function (id) { throw new Error('client module reference in a data payload: ' + id); },
  { u: () => '', e: () => Promise.resolve(), m: {} },
);
globalThis.__webpack_chunk_load__ = () => Promise.resolve();

const require_ = createRequire(import.meta.url);
const { encodeReply, createTemporaryReferenceSet } = require_(
  '../node_modules/next/dist/compiled/react-server-dom-webpack/cjs/'
  + 'react-server-dom-webpack-client.browser.development.js',
);

async function encode(value) {
  const temporaryReferences = createTemporaryReferenceSet();
  const body = await encodeReply([value], { temporaryReferences });
  const text = typeof body === 'string' ? body : await new Response(body).text();
  return { text, temporaryReferences: text.split('"$T"').length - 1 };
}

const [mode, ...args] = process.argv.slice(2);

if (mode === 'tiptap') {
  register(new URL('./loader.mjs', import.meta.url));
  const { getSchema } = await import('@tiptap/core');
  const { richTextExtensions } = await import(
    '@/components/pageBuilder/editor/richText/tiptapExtensions');
  const { toPlainJson } = await import('@/lib/plainValue');
  const schema = getSchema(richTextExtensions());

  const out = {};
  for (const name of args) {
    const type = schema.nodes[name];
    if (!type) { out[name] = { error: 'not in schema' }; continue; }
    const node = type.createAndFill();
    if (!node) { out[name] = { error: 'createAndFill returned null' }; continue; }
    const json = node.toJSON();
    const doc = { type: 'doc', content: [json] };
    out[name] = {
      attrsPrototypeIsNull: json.attrs !== undefined
        && Object.getPrototypeOf(json.attrs) === null,
      raw: await encode(doc),
      fixed: await encode(toPlainJson(doc)),
    };
  }
  process.stdout.write(JSON.stringify(out));
} else if (mode === 'control') {
  /**
   * The two shapes that CANNOT be shipped in over JSON — JSON.stringify drops a
   * function and a symbol outright, so a control that sent one would measure a
   * clean payload and report the encoder as inert. They are planted HERE, in the
   * process that does the encoding, for the same reason the tiptap document is.
   */
  process.stdout.write(JSON.stringify({
    function: await encode({ a: 1, bad: () => {} }),
    symbol: await encode({ a: 1, bad: Symbol('planted') }),
    nullPrototype: await encode({ a: 1, bad: Object.create(null) }),
    plain: await encode({ a: 1, bad: { ok: true } }),
  }));
} else if (mode === 'json') {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  process.stdout.write(JSON.stringify(await encode(JSON.parse(raw))));
} else {
  process.stderr.write('usage: encodeReplyWorker.mjs tiptap <node>... | json\n');
  process.exit(2);
}
