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
/**
 * ROUND 68 extracted this wiring to test/encodeReply.mjs, because a TEST needed
 * the same encoder and a second copy of it is exactly the drift the repo keeps
 * being bitten by. Same function, one definition; this script now imports it.
 */
const { encodedReply, encodeControlSubjects } = await import('../test/encodeReply.mjs');
async function encodeAndReport(label, value) {
  try {
    const { text, temporaryReferences } = encodedReply(value);
    console.log(`  ${label}`);
    console.log(`     bytes=${text.length}  temporary references=${temporaryReferences}`);
  } catch (err) {
    console.log(`  ${label}: encodeReply THREW: ${err.message}`);
  }
}

for (const d of docs) {
  const patch = pick(composeWorkingView(d), DRAFT_CONTENT_KEYS);
  await encodeAndReport(String(d.slug), patch);
}

/**
 * ROUND 68 moved the controls INTO the child. A function and a symbol cannot
 * cross a JSON transport — JSON.stringify drops both — so controls sent from
 * here measured a clean payload and reported 0, which is a dead control wearing
 * a green tick. They are planted in the encoding process instead, and the list
 * now includes the null-prototype object round 68 found: ProseMirror's `attrs`.
 */
console.log('=== CONTROL: values that cannot serialise DO become "$T" ===');
for (const [kind, r] of Object.entries(encodeControlSubjects())) {
  console.log(`  ${kind.padEnd(16)} temporary references=${r.temporaryReferences}  ${r.text}`);
}