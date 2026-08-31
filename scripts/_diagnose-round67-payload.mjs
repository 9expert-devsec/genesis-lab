/**
 * ROUND 67 §C/§D — the client payload, round-tripped through React's REAL
 * encoder, in process.
 *
 * The response body proved the exception happens INSIDE saveDraftContent, and
 * the message is React's temporary-reference proxy verbatim. That proxy is
 * created by the CLIENT: in react-server-dom-webpack's client encoder, a value
 * it cannot serialise becomes `"$T"` when a temporaryReferences set is present,
 * and Next always provides one. The two types that take that path are:
 *
 *   a client FUNCTION  ("Client Functions cannot be passed directly...")
 *   a SYMBOL           ("Symbols cannot be passed to a Server Function...")
 *
 * So this drives React's own encodeReply over the payload the editor sends and
 * reports every key that turned into a temporary reference — which is the one
 * question rounds 62 and 66 could not answer, because both looked at return
 * values and this is an ARGUMENT.
 *
 * READ-ONLY. Reads page docs, writes nothing.
 * Run: node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *        scripts/_diagnose-round67-payload.mjs
 */
import { MongoClient } from 'mongodb';
import { nonPlainValues, describeNonPlain } from '../test/plainValue.mjs';

const { DRAFT_CONTENT_KEYS } = await import('@/lib/schemas/pageBuilder');
const { composeWorkingView } = await import('@/lib/pageBuilder/draftState');

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db(process.env.MONGODB_DB_NAME);
const docs = await db.collection('page_builder_pages').find({}).toArray();
await client.close();

console.log('=== pages on this clone ===');
for (const d of docs) {
  const n = (d.draft?.sections ?? d.sections ?? []).length;
  console.log(`  ${String(d._id)}  ${String(d.slug).padEnd(26)} topLevelSections=${n}  draft=${d.draft ? 'yes' : 'no'}`);
}

/** The client's own pick, copied from savePlan.js so a drift shows. */
const pick = (source, keys) => {
  const out = {};
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(source ?? {}, k)) out[k] = source[k];
  return out;
};

console.log('\n=== §C  the payload the editor would send, per page ===');
for (const d of docs) {
  const page = composeWorkingView(d);          // exactly what initialEditorState does
  const patch = pick(page, DRAFT_CONTENT_KEYS); // exactly what runSave does
  const hits = nonPlainValues(patch);
  console.log(`  ${String(d.slug).padEnd(26)} keys=[${Object.keys(patch).join(',')}]`);
  console.log(`     non-plain: ${hits.length ? 'DIRTY' : 'clean'}`);
  if (hits.length) console.log(describeNonPlain(hits.slice(0, 10)));
}

console.log('\n=== §D  React\'s REAL encodeReply — does anything become "$T"? ===');
/**
 * The encoder is INSIDE next, not a top-level package, and its bundle expects
 * webpack globals. Shimmed rather than reimplemented: what matters is that this
 * is REACT'S OWN encodeReply — the same function the browser runs — so its
 * verdict is the browser's verdict. The shim only ever fires for a client
 * MODULE reference, which a data payload does not contain; if one did, the stub
 * throws by name rather than silently returning something plausible.
 */
globalThis.__webpack_require__ = Object.assign(
  function (id) { throw new Error('client module reference in a data payload: ' + id); },
  { u: () => '', e: () => Promise.resolve(), m: {} },
);
globalThis.__webpack_chunk_load__ = () => Promise.resolve();

let encodeReply, createTemporaryReferenceSet;
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  try {
    ({ encodeReply, createTemporaryReferenceSet } = req(
      '../node_modules/next/dist/compiled/react-server-dom-webpack/cjs/'
      + 'react-server-dom-webpack-client.browser.development.js'));
    console.log('  loaded React own encodeReply out of next');
  } catch (e) {
    console.log('  could not load the client encoder: ' + e.message);
  }
}
async function encodeAndReport(label, value) {
  if (!encodeReply) { console.log(`  ${label}: SKIPPED (no encoder)`); return; }
  const temporaryReferences = createTemporaryReferenceSet();
  try {
    const body = await encodeReply([value], { temporaryReferences });
    const text = typeof body === 'string' ? body : await new Response(body).text();
    const tCount = (text.match(/"\$T"/g) ?? []).length;
    console.log(`  ${label}`);
    console.log(`     bytes=${text.length}  "$T" temporary references=${tCount}  set size=${temporaryReferences.size}`);
    if (temporaryReferences.size) {
      for (const [k, v] of temporaryReferences) {
        console.log(`       ${k}  ->  ${typeof v} ${v?.name ?? String(v)}`);
      }
    }
  } catch (err) {
    console.log(`  ${label}: encodeReply THREW: ${err.message}`);
  }
}

for (const d of docs) {
  const patch = pick(composeWorkingView(d), DRAFT_CONTENT_KEYS);
  await encodeAndReport(String(d.slug), patch);
}

console.log('\n=== CONTROL: a planted client function and a symbol DO become "$T" ===');
await encodeAndReport('planted function', { title: 't', sections: [], cb: () => {} });
await encodeAndReport('planted symbol', { title: 't', sections: [], s: Symbol('x') });
await encodeAndReport('plain payload', { title: 't', sections: [{ id: 'a', type: 'rich_text', content: {} }] });
