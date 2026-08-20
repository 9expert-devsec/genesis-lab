/**
 * HOW MANY PUBLIC REGISTRATIONS ALREADY HOLD MORE ATTENDEES THAN THEY BOUGHT?
 *
 * ── THIS SCRIPT NEVER WRITES ────────────────────────────────────────────────
 * No --apply, no updateOne, no deleteMany, no bulkWrite, no $set. It runs one
 * aggregation and prints. Round 8 item 3 introduces a rule — the roster may not
 * exceed attendeesCount — and the screenshot that prompted it shows 2 attendees
 * against a count of 1, so the state already exists. The number decides how the
 * "already over" branch is written, and NOTHING here fixes any of them: no
 * attendee is ever deleted to satisfy a rule invented after the data.
 *
 * Usage:  node --env-file=.env.local scripts/_probe-roster-over-capacity.mjs
 */
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('✖ MONGODB_URI is unset — run with --env-file=.env.local'); process.exit(1); }

await mongoose.connect(uri);
const db = mongoose.connection.db;
console.log(`connected: db=${db.databaseName}\n`);

const col = db.collection('register_public');

const total = await col.countDocuments({});

/**
 * `$ifNull` on `attendees` because a legacy document may have no array at all,
 * and `$size` throws on a missing field rather than returning 0 — which would
 * abort the whole aggregation and read as "no such records".
 *
 * `attendeesCount` is compared as stored. A document where it is missing or
 * null is reported SEPARATELY rather than folded into either side: "over
 * capacity" and "has no capacity recorded" are different findings and merging
 * them would inflate the number this round is being sized against.
 */
const rows = await col.aggregate([
  {
    $project: {
      status: 1,
      createdAt: 1,
      attendeesCount: 1,
      attendeesListProvided: 1,
      n: { $size: { $ifNull: ['$attendees', []] } },
    },
  },
  { $sort: { createdAt: -1 } },
], { allowDiskUse: false }).toArray();

const noCount = rows.filter((r) => r.attendeesCount == null);
const withCount = rows.filter((r) => r.attendeesCount != null);
const over = withCount.filter((r) => r.n > r.attendeesCount);
const exact = withCount.filter((r) => r.n === r.attendeesCount);
const under = withCount.filter((r) => r.n < r.attendeesCount);

console.log(`register_public total documents : ${total}`);
console.log(`  attendeesCount missing/null   : ${noCount.length}`);
console.log(`  roster  <  count              : ${under.length}`);
console.log(`  roster  == count              : ${exact.length}`);
console.log(`  roster  >  count  (OVER)      : ${over.length}`);

if (over.length) {
  const worst = over.reduce((a, b) => ((b.n - b.attendeesCount) > (a.n - a.attendeesCount) ? b : a));
  console.log(`\nWORST CASE: ${worst.n} attendees against a count of ${worst.attendeesCount} `
    + `(over by ${worst.n - worst.attendeesCount})`);
  console.log(`  _id=${worst._id}  status=${worst.status}  createdAt=${worst.createdAt?.toISOString?.() ?? worst.createdAt}`);

  console.log('\nEVERY over-capacity record (id, status, roster/count, created):');
  for (const r of over) {
    console.log(`  ${r._id}  ${String(r.status).padEnd(10)} ${r.n}/${r.attendeesCount}  `
      + `${r.createdAt?.toISOString?.().slice(0, 10) ?? '—'}`);
  }

  const byStatus = new Map();
  for (const r of over) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  console.log('\nover-capacity by status:');
  for (const [s, c] of byStatus) console.log(`  ${String(s).padEnd(12)} ${c}`);

  // PAID matters most: item 4 forbids editing attendeesCount directly on a paid
  // record, so a paid record that is ALREADY over cannot be fixed by raising the
  // count on the ordinary edit path.
  const paidOver = over.filter((r) => r.status === 'paid');
  console.log(`\npaid AND over capacity: ${paidOver.length}`
    + (paidOver.length ? '  ← these cannot be reconciled on the direct edit path' : ''));
}

/** The indexes item 5 needs to know about, read rather than assumed. */
console.log('\nregister_public indexes:');
for (const ix of await col.indexes()) console.log(`  ${ix.name}  ${JSON.stringify(ix.key)}`);

/**
 * The in-house side, for item 5's cost question only — it has no roster.
 *
 * The collection is `register_inhouse` (read from the model, not guessed: the
 * first draft of this script assumed `inhouse_requests` and got
 * NamespaceNotFound, which `countDocuments` reports as 0 rather than as an
 * error — so a guessed name would have printed "0 documents" and read as an
 * empty collection rather than as a wrong name).
 */
const inhouse = db.collection('register_inhouse');
console.log(`\nregister_inhouse total documents: ${await inhouse.countDocuments({})}`);
console.log('register_inhouse indexes:');
for (const ix of await inhouse.indexes()) console.log(`  ${ix.name}  ${JSON.stringify(ix.key)}`);

/** What the COURSE filter would have to select over, per source. */
console.log('\n── course values actually present in the data (item 5) ──');
const pubCourses = await col.aggregate([
  { $group: { _id: { code: '$courseCode', id: '$courseId', name: '$courseName' }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
console.log(`public: ${pubCourses.length} distinct course triples across ${total} registrations`);
for (const c of pubCourses) {
  console.log(`  ${String(c.n).padStart(3)}  code=${c._id.code ?? '—'}  id=${c._id.id ?? '—'}  name=${c._id.name ?? '—'}`);
}

const inhCourses = await inhouse.aggregate([
  { $unwind: { path: '$coursesInterested', preserveNullAndEmptyArrays: true } },
  { $group: { _id: '$coursesInterested', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
console.log(`\nin-house: ${inhCourses.length} distinct coursesInterested entries`);
for (const c of inhCourses) console.log(`  ${String(c.n).padStart(3)}  ${c._id ?? '(none)'}`);

await mongoose.disconnect();
