#!/usr/bin/env node
/**
 * IS THE RECEIPT BURN ACTUALLY ATOMIC? An experiment, not an assertion.
 *
 * ══ WHY THIS EXISTS ═════════════════════════════════════════════════════════
 *
 * src/lib/webroot/receiptStore.js burns a webroot upload receipt with ONE
 * guarded update:
 *
 *     findOneAndUpdate(
 *       { receiptId, usedAt: null, expiresAt: { $gt: at } },
 *       { $set: { usedAt: at } },
 *       { new: true },
 *     )
 *
 * The safety property is that two simultaneous callers holding one receipt
 * yield exactly ONE token — otherwise both overwrite the same site-root PDF off
 * one archive, and the second destroys the first with no backup.
 *
 * Step 6.5 shipped that query with three kinds of evidence, none of which is
 * this one:
 *
 *   · test/fs/webrootReceiptWiring.test.mjs proves the query TEXT carries
 *     `usedAt: null` and `expiresAt: { $gt: now }`. It cannot run a query.
 *   · test/pure/webrootUploadReceipt.test.mjs proves the mint flow is correct
 *     GIVEN an atomic burn. It fakes the store.
 *   · its concurrency case is two calls in one event loop. That MODELS two
 *     lambdas; it is not two lambdas, and it cannot observe a race that lives
 *     between a client and a database at all.
 *
 * So this probe runs the real query against a real MongoDB from real, separate
 * OS processes, and — the part that matters — runs the SAME harness against a
 * deliberately non-atomic burn to show the experiment has the power to detect
 * the failure it is claiming not to find.
 *
 * ══ HOW TO READ THE RESULT ══════════════════════════════════════════════════
 *
 * A clean atomic run means NOTHING on its own. If the control never
 * double-burns, the race window was simply too narrow to hit and the whole run
 * is INCONCLUSIVE — a silent experiment reads as safety and is worse than no
 * experiment. Check the control first, always. The summary block at the end
 * says so in as many words.
 *
 * ══ SAFETY — READ BEFORE RUNNING ════════════════════════════════════════════
 *
 * This WRITES. It connects to $MONGODB_URI_REHEARSAL and nothing else: no
 * --env-file, no dotenv, no fallback to MONGODB_URI, no default. If the
 * variable is missing it refuses.
 *
 * It then refuses again unless the target database is EMPTY or holds only the
 * one collection this probe creates. That check is by SHAPE, deliberately —
 * a substring test on the URI ("does it say rehearsal?") passes a typo, and one
 * typo here is a write to production. What the database CONTAINS cannot be
 * typo'd into looking empty.
 *
 * It drops the database when it finishes and re-lists to confirm it is gone.
 *
 *     MONGODB_URI_REHEARSAL=mongodb://127.0.0.1:27017/genesis_receipt_probe_6_6 \
 *       node scripts/_probe-receipt-burn.mjs
 *
 *     --preflight   report server version/topology and the safety check, write nothing
 *
 * Knobs, all via environment, so widening a run needs no edit:
 *     PROBE_ROUNDS   rounds per mode          (default 50)
 *     PROBE_WORKERS  worker processes/round   (default 10)
 *     PROBE_GAP_MS   control's read→write gap (default 0 = one event-loop tick)
 *
 * ══ A NOTE TO WHOEVER FINDS THIS FILE ═══════════════════════════════════════
 *
 * It is named `_probe-` because it is a one-off, and one-off probes in this
 * repo were expected to stay untracked. They do not: something outside the
 * agent has committed and pushed a `scripts/_probe-*.mjs` here before. So this
 * is written to be read by a stranger rather than thrown away, and if you are
 * that stranger: it is safe to delete, it is safe to re-run against a
 * throwaway, and it must NEVER be pointed at a database anyone cares about.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const SELF = fileURLToPath(import.meta.url);
const URI = process.env.MONGODB_URI_REHEARSAL ?? '';
const COLLECTION = 'probe_receipts';

/** The only collection this probe is allowed to find in the target database. */
const OWN_COLLECTIONS = new Set([COLLECTION]);

const ROUNDS = Number(process.env.PROBE_ROUNDS ?? 50);
const WORKERS = Number(process.env.PROBE_WORKERS ?? 10);
const GAP_MS = Number(process.env.PROBE_GAP_MS ?? 0);

/** Lead time between "all workers report ready" and the barrier instant. */
const BARRIER_LEAD_MS = 120;

/** A worker that has not reported in this long is counted as failed, not awaited. */
const WORKER_TIMEOUT_MS = 30_000;

/**
 * A mirror of src/models/WebrootUploadReceipt.js, reduced to the fields the
 * burn query touches.
 *
 * DELIBERATELY A MIRROR AND NOT AN IMPORT. The real model resolves `@/lib/...`
 * through the Next bundler's alias, which a plain node script does not have.
 * So the chain of evidence is: the fs guard ties the SHIPPED source to this
 * query shape, and this probe ties this query shape to real Mongo behaviour.
 * Neither half proves the other, and saying so is the point.
 */
const ReceiptSchema = new mongoose.Schema(
  {
    receiptId: { type: String, required: true, unique: true },
    filename: { type: String, required: true },
    blobPathname: { type: String, required: true },
    archivePathname: { type: String, required: true },
    issuedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { collection: COLLECTION },
);

async function openModel() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 5000, bufferCommands: false });
  return mongoose.model('ProbeReceipt', ReceiptSchema);
}

function freshReceipt(receiptId, { ttlMs = 5 * 60 * 1000 } = {}) {
  const now = Date.now();
  return {
    receiptId,
    filename: '9expert-training-course-catalog.pdf',
    blobPathname: 'webroot-documents/9expert-training-course-catalog.pdf',
    archivePathname: `webroot-archive/probe/${receiptId}`,
    issuedAt: new Date(now),
    expiresAt: new Date(now + ttlMs),
    usedAt: null,
  };
}

// ── the two burns ───────────────────────────────────────────────────────────
//
// SAME collection, SAME filter fields, SAME driver call for the write. The only
// difference is WHERE the guard is evaluated: inside the query, or in
// JavaScript with a yield in the middle. If the control differed in any other
// way it would be a strawman, and its double-burns would prove nothing about
// the shipped shape.

/**
 * What src/lib/webroot/receiptStore.js does. The filter, the update and the
 * options are identical; the only textual difference is that the shipped one
 * writes `String(receiptId ?? '')` where this writes `String(receiptId)`,
 * because the shipped one is reachable with a missing id and this is not.
 */
function burnAtomic(Receipt, receiptId, nowMs) {
  const at = new Date(nowMs);
  return Receipt.findOneAndUpdate(
    { receiptId: String(receiptId), usedAt: null, expiresAt: { $gt: at } },
    { $set: { usedAt: at } },
    { new: true },
  ).lean();
}

/** The forbidden shape: read, yield, decide in JS, then write. */
async function burnRacy(Receipt, receiptId, nowMs) {
  const at = new Date(nowMs);
  const doc = await Receipt.findOne({ receiptId: String(receiptId) }).lean();
  await gap();
  if (!doc) return null;
  if (doc.usedAt) return null;
  if (!(doc.expiresAt > at)) return null;
  return Receipt.findOneAndUpdate(
    { receiptId: String(receiptId) },
    { $set: { usedAt: at } },
    { new: true },
  ).lean();
}

/**
 * The control's read→write window. One event-loop tick by default; PROBE_GAP_MS
 * widens it by busy-waiting.
 *
 * Busy-wait rather than setTimeout because Windows' timer granularity is around
 * 15 ms, so `setTimeout(x, 1)` is not a 1 ms gap and a run tuned with it would
 * be measuring the scheduler.
 */
function gap() {
  if (GAP_MS <= 0) return new Promise((r) => setImmediate(r));
  const until = Date.now() + GAP_MS;
  while (Date.now() < until) { /* spin */ }
  return Promise.resolve();
}

// ── worker ──────────────────────────────────────────────────────────────────

const say = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

function readOneLine() {
  return new Promise((resolve) => {
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        process.stdin.off('data', onData);
        resolve(JSON.parse(buf.slice(0, nl)));
      }
    };
    process.stdin.on('data', onData);
  });
}

async function runWorker() {
  const mode = process.argv.find((a) => a.startsWith('--mode='))?.slice('--mode='.length) ?? 'atomic';
  const receiptId = process.env.PROBE_RECEIPT_ID ?? '';
  const Receipt = await openModel();

  // WARM THE CONNECTION. Without this the barrier would be measuring TLS/auth
  // handshakes and pool setup, which differ per process by tens of milliseconds
  // — enough to serialise the workers and make every round trivially safe.
  await Receipt.findOne({ receiptId: '__warmup_never_matches__' }).lean();

  say({ ready: true, pid: process.pid });
  const { startAt } = await readOneLine();

  // Busy-wait, for the same reason gap() does: a setTimeout barrier on Windows
  // lands in ~15 ms buckets and the workers arrive in a staircase.
  while (Date.now() < startAt) { /* spin to the instant */ }

  const issuedAt = Date.now();
  let won = false;
  let err = null;
  try {
    const burn = mode === 'racy' ? burnRacy : burnAtomic;
    won = Boolean(await burn(Receipt, receiptId, issuedAt));
  } catch (e) {
    err = e?.message ?? String(e);
  }
  const doneAt = Date.now();

  say({ result: { pid: process.pid, won, issuedAt, doneAt, late: issuedAt - startAt, err } });
  await mongoose.disconnect();
}

// ── parent: one volley ──────────────────────────────────────────────────────

function launch(mode, receiptId) {
  const child = spawn(process.execPath, [SELF, '--worker', `--mode=${mode}`], {
    env: { ...process.env, MONGODB_URI_REHEARSAL: URI, PROBE_RECEIPT_ID: receiptId },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let resolveReady;
  let resolveResult;
  const ready = new Promise((r) => { resolveReady = r; });
  const result = new Promise((r) => { resolveResult = r; });

  let out = '';
  let errOut = '';
  child.stdout.on('data', (d) => {
    out += d.toString();
    let nl;
    while ((nl = out.indexOf('\n')) >= 0) {
      const line = out.slice(0, nl).trim();
      out = out.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.ready) resolveReady(msg);
      if (msg.result) resolveResult(msg.result);
    }
  });
  child.stderr.on('data', (d) => { errOut += d.toString(); });

  // A worker that dies before reporting must not hang the volley — and must not
  // be silently dropped either, or a round with three crashed workers would
  // read as a round with one winner.
  child.on('exit', (code) => {
    const dead = { pid: child.pid, won: false, issuedAt: 0, doneAt: 0, late: 0, err: `exit ${code} ${errOut.slice(0, 300)}`.trim() };
    resolveReady({ ready: false });
    resolveResult(dead);
  });

  return { child, ready, result };
}

const withTimeout = (p, ms, fallback) => Promise.race([
  p,
  new Promise((r) => setTimeout(() => r(fallback), ms).unref?.()),
]);

async function fireVolley(mode, receiptId) {
  const ws = Array.from({ length: WORKERS }, () => launch(mode, receiptId));

  // BARRIER, PHASE 1: nobody fires until everybody has connected and warmed.
  // A fixed lead time would have to be guessed, and guessing it long wastes the
  // run while guessing it short serialises the workers — which is the single
  // easiest way to make this experiment lie in the safe direction.
  await Promise.all(ws.map((w) => withTimeout(w.ready, WORKER_TIMEOUT_MS, { ready: false })));

  // BARRIER, PHASE 2: one instant, from one clock, sent to everyone.
  const startAt = Date.now() + BARRIER_LEAD_MS;
  for (const w of ws) {
    try { w.child.stdin.write(`${JSON.stringify({ startAt })}\n`); } catch { /* already dead */ }
  }

  const results = await Promise.all(ws.map((w) => withTimeout(
    w.result, WORKER_TIMEOUT_MS, { pid: 0, won: false, issuedAt: 0, doneAt: 0, late: 0, err: 'timeout' },
  )));
  for (const w of ws) { try { w.child.kill(); } catch { /* already gone */ } }
  return results;
}

async function runRounds(Receipt, mode) {
  const rounds = [];
  for (let i = 0; i < ROUNDS; i += 1) {
    const receiptId = `${mode}-${i}-${randomUUID()}`;
    await Receipt.create(freshReceipt(receiptId));
    const results = await fireVolley(mode, receiptId);

    const fired = results.filter((r) => r.issuedAt > 0);
    const issued = fired.map((r) => r.issuedAt);
    rounds.push({
      round: i,
      won: results.filter((r) => r.won).length,
      fired: fired.length,
      spreadMs: issued.length ? Math.max(...issued) - Math.min(...issued) : -1,
      maxLateMs: fired.length ? Math.max(...fired.map((r) => r.late)) : -1,
      errors: results.filter((r) => r.err).length,
    });
    if ((i + 1) % 10 === 0) console.log(`   … ${mode}: ${i + 1}/${ROUNDS} rounds`);
  }
  return rounds;
}

// ── parent: safety, findings, teardown ──────────────────────────────────────

function refuse(msg, detail = []) {
  console.error('');
  console.error(`REFUSING TO RUN — ${msg}`);
  for (const d of detail) console.error(`   ${d}`);
  console.error('');
  process.exit(2);
}

async function describeServer() {
  const db = mongoose.connection.db;
  const hello = await db.command({ hello: 1 });
  const build = await db.command({ buildInfo: 1 });
  const topology = hello.msg === 'isdbgrid'
    ? 'mongos (sharded)'
    : (hello.setName ? `replica set "${hello.setName}"` : 'STANDALONE (no replica set)');
  console.log(`  server        : MongoDB ${build.version}`);
  console.log(`  topology      : ${topology}`);
  console.log(`  database      : ${mongoose.connection.name}`);
  return { version: build.version, topology };
}

/**
 * The safety gate. By SHAPE, never by string-matching the URI.
 *
 * An empty database, or one holding only this probe's own collection, cannot be
 * a database anyone cares about. A URI with a typo in it can be.
 */
async function assertThrowaway() {
  const cols = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
  const foreign = cols.filter((c) => !OWN_COLLECTIONS.has(c));
  if (foreign.length) {
    refuse(
      `the target database "${mongoose.connection.name}" holds collections this probe did not create.`,
      ['This does not look like a throwaway. Found:', ...foreign.map((c) => `  - ${c}`)],
    );
  }
  console.log(`  safety check  : PASS — ${cols.length === 0 ? 'database is empty' : `only ${cols.join(', ')} present`}`);
}

/** The four things §5 asked to settle while a real connection is open. */
async function settleOpenQuestions(Receipt) {
  const findings = {};

  console.log('');
  console.log('── §5.1  the unique index on receiptId ────────────────────────────');
  const indexes = await Receipt.collection.indexes();
  console.log(`  indexes(): ${JSON.stringify(indexes)}`);
  const unique = indexes.find((i) => i.unique && i.key && i.key.receiptId === 1);
  findings.uniqueIndex = Boolean(unique);
  console.log(`  unique index on receiptId: ${unique ? `PRESENT (${unique.name})` : 'ABSENT'}`);

  // Run the duplicate insert either way. Whether the CONSTRAINT bites is the
  // fact that matters; the index listing is only how it is supposed to bite.
  const dupId = `dup-${randomUUID()}`;
  await Receipt.create(freshReceipt(dupId));
  try {
    await Receipt.create(freshReceipt(dupId));
    findings.duplicateRejected = false;
    console.log('  duplicate insert: ACCEPTED — the constraint is NOT enforced');
  } catch (err) {
    findings.duplicateRejected = true;
    findings.duplicateError = `${err?.code ?? ''} ${err?.message ?? err}`.slice(0, 160);
    console.log(`  duplicate insert: REJECTED — ${findings.duplicateError}`);
  }

  console.log('');
  console.log('── §5.2  expiry is the query, not the TTL monitor ─────────────────');
  const expiredId = `expired-${randomUUID()}`;
  await Receipt.create(freshReceipt(expiredId, { ttlMs: -60_000 })); // expired a minute ago
  const expiredBurn = await burnAtomic(Receipt, expiredId, Date.now());
  const stillThere = await Receipt.findOne({ receiptId: expiredId }).lean();
  findings.expiredBurnRefused = expiredBurn === null;
  findings.expiredDocSurvives = Boolean(stillThere);
  console.log(`  burn of an expired receipt : ${expiredBurn === null ? 'REFUSED (null)' : 'SUCCEEDED — THE GUARD IS BROKEN'}`);
  console.log(`  the document still exists  : ${stillThere ? 'YES' : 'NO — it was reaped, so the refusal proves nothing about the query'}`);
  if (stillThere) console.log(`  its usedAt                 : ${JSON.stringify(stillThere.usedAt)} (must be null — a refused burn must not have written)`);

  console.log('');
  console.log('── §5.3  what { new: true } + .lean() actually returns ────────────');
  const shapeId = `shape-${randomUUID()}`;
  await Receipt.create(freshReceipt(shapeId));
  const before = await Receipt.findOne({ receiptId: shapeId }).lean();
  const returned = await burnAtomic(Receipt, shapeId, Date.now());
  findings.returnedIsPlainObject = returned !== null && Object.getPrototypeOf(returned) === Object.prototype;
  findings.returnedUsedAtIsSet = Boolean(returned?.usedAt);
  console.log(`  usedAt BEFORE the burn : ${JSON.stringify(before?.usedAt)}`);
  console.log(`  returned document      : ${JSON.stringify(returned)}`);
  console.log(`  constructor            : ${returned === null ? 'null' : returned.constructor?.name}`);
  console.log(`  plain object (.lean)   : ${findings.returnedIsPlainObject}`);
  console.log(`  usedAt is POST-update  : ${findings.returnedUsedAtIsSet} (false would mean { new: true } is not doing what 6.5 assumed)`);

  // Leave the collection clean so the rounds start from a known state.
  await Receipt.deleteMany({});
  return findings;
}

function histogram(rounds) {
  const counts = new Map();
  for (const r of rounds) counts.set(r.won, (counts.get(r.won) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]);
}

function summarise(label, rounds) {
  const wins = rounds.map((r) => r.won);
  const spreads = rounds.map((r) => r.spreadMs).filter((s) => s >= 0);
  const lates = rounds.map((r) => r.maxLateMs).filter((s) => s >= 0);
  const errs = rounds.reduce((n, r) => n + r.errors, 0);
  console.log('');
  console.log(`── ${label} ${'─'.repeat(Math.max(0, 62 - label.length))}`);
  console.log(`  rounds                    : ${rounds.length}`);
  console.log(`  successes per round       : ${histogram(rounds).map(([k, v]) => `${k}→${v} round(s)`).join(', ')}`);
  console.log(`  rounds with 0 successes   : ${wins.filter((w) => w === 0).length}`);
  console.log(`  rounds with 1 success     : ${wins.filter((w) => w === 1).length}`);
  console.log(`  rounds with 2+ successes  : ${wins.filter((w) => w >= 2).length}   <<< the number that matters`);
  console.log(`  firing spread ms          : min ${Math.min(...spreads)} / median ${spreads.sort((a, b) => a - b)[Math.floor(spreads.length / 2)]} / max ${Math.max(...spreads)}`);
  console.log(`  worst barrier overshoot   : ${Math.max(...lates)} ms`);
  console.log(`  worker errors             : ${errs}`);
  return {
    rounds: rounds.length,
    zero: wins.filter((w) => w === 0).length,
    one: wins.filter((w) => w === 1).length,
    multi: wins.filter((w) => w >= 2).length,
    maxSpread: Math.max(...spreads),
    errors: errs,
  };
}

async function teardown() {
  const name = mongoose.connection.name;
  await mongoose.connection.dropDatabase();
  const { databases } = await mongoose.connection.db.admin().listDatabases({ nameOnly: true });
  const names = databases.map((d) => d.name);
  console.log('');
  console.log('── teardown ────────────────────────────────────────────────────────');
  console.log(`  dropped        : ${name}`);
  console.log(`  databases now  : ${names.join(', ')}`);
  console.log(`  ${name} gone   : ${names.includes(name) ? 'NO — IT IS STILL THERE' : 'yes, confirmed by re-listing'}`);
}

async function runParent() {
  if (!URI) {
    refuse('MONGODB_URI_REHEARSAL is not set.', [
      'This probe writes. It will not fall back to MONGODB_URI, to .env.local,',
      'or to any value in the repo — one typo there is a write to production.',
    ]);
  }
  const preflightOnly = process.argv.includes('--preflight');

  console.log('');
  console.log('══ RECEIPT BURN ATOMICITY PROBE ════════════════════════════════════');
  console.log('');
  await openModel();
  const server = await describeServer();
  await assertThrowaway();

  if (preflightOnly) {
    console.log('');
    console.log('  --preflight: nothing was written. Exiting.');
    await mongoose.disconnect();
    return;
  }

  const Receipt = mongoose.model('ProbeReceipt');
  // Wait for autoIndex to finish so indexes() is a measurement, not a snapshot
  // of a build in flight. NOTE: the app never awaits this — see the report.
  await Receipt.init();

  const findings = await settleOpenQuestions(Receipt);

  console.log('');
  console.log(`  config: ${ROUNDS} rounds × ${WORKERS} worker processes, control gap ${GAP_MS > 0 ? `${GAP_MS} ms` : 'one event-loop tick'}`);
  console.log('');
  console.log('  running ATOMIC (the shipped query)…');
  const atomic = await runRounds(Receipt, 'atomic');
  await Receipt.deleteMany({});
  console.log('  running RACY (the control)…');
  const racy = await runRounds(Receipt, 'racy');

  const a = summarise('ATOMIC — the shipped burn', atomic);
  const c = summarise('RACY — the control', racy);

  console.log('');
  console.log('══ VERDICT ═════════════════════════════════════════════════════════');
  if (c.multi === 0) {
    console.log('  INCONCLUSIVE. The control never double-burned, so this harness has no');
    console.log('  demonstrated power to detect a lost update. The atomic result below is');
    console.log('  NOT evidence of anything — widen the fleet, the rounds, or PROBE_GAP_MS.');
  } else if (a.multi > 0) {
    console.log('  FAILED. The shipped query double-burned. This is a defect in the burn,');
    console.log('  not in the probe. Do not ship around it.');
  } else {
    console.log(`  PASS. The control double-burned in ${c.multi}/${c.rounds} rounds, so the harness`);
    console.log(`  can see a lost update; the shipped query did so in 0/${a.rounds}.`);
  }
  console.log('');
  console.log(`  machine-readable: ${JSON.stringify({ server, findings, atomic: a, racy: c, workers: WORKERS, gapMs: GAP_MS })}`);

  await teardown();
  await mongoose.disconnect();
}

// ── entry ───────────────────────────────────────────────────────────────────

const isWorker = process.argv.includes('--worker');
try {
  await (isWorker ? runWorker() : runParent());
} catch (err) {
  console.error(isWorker ? `worker failed: ${err?.stack ?? err}` : `probe failed: ${err?.stack ?? err}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
}
