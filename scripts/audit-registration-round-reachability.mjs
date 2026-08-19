/**
 * HOW MANY LIVE REGISTRATIONS HOLD A ROUND THE ADMIN SCREEN CANNOT OFFER?
 *
 * READ-ONLY. Writes nothing, has no --apply, and never will.
 *
 * ══ THE QUESTION ════════════════════════════════════════════════════════════
 *
 * The admin round select is built on `listSchedulesByCourse`, which applies a
 * `>= today` bound UNCONDITIONALLY — measured and curl-verified in
 * lib/api/schedules.js, and NOT lifted by the `status` parameter. So a
 * registration for a round that has already run holds a `classId` the list
 * cannot contain, and it renders as a MARKED, UNSELECTABLE option.
 *
 * That is the design. What it does not tell us is whether the marked-option path
 * is the COMMON case in practice or only in theory — and the difference matters,
 * because a path most records take deserves more care in the wording than one
 * that fires for a handful of old rows.
 *
 * This counts it, per course, against live data.
 *
 * ══ WHAT "UNREACHABLE" MEANS HERE, EXACTLY ═════════════════════════════════
 *
 * A stored `classId` that is not among the rounds the SAME CALL the admin page
 * makes returns for that registration's course. Three distinct causes are
 * separated in the report rather than lumped together, because they call for
 * different responses:
 *
 *   PAST         the round exists upstream but is before today. The expected
 *                case, and the one requirement 5 exists for.
 *   NO_COURSE    the course_id does not resolve at all. A data fault: the
 *                registration points at a course upstream does not have.
 *   NOT_IN_LIST  the course resolves and the round is not in the returned set
 *                for some other reason — outside the limit-50 window, or
 *                withdrawn. Worth seeing separately; a large number here would
 *                mean the limit is too low rather than that rounds are old.
 *
 * PAST is inferred rather than asserted: the endpoint will not return the round,
 * so this cannot read its dates. A stored `classDate` that parses to a date
 * before today is the evidence, and rows whose label will not parse are reported
 * as UNKNOWN rather than being counted as past.
 *
 * ══ NO PERSONAL DATA IS PRINTED ═════════════════════════════════════════════
 *
 * The projection asks for `courseId`, `classId` and `classDate` and nothing
 * else. These documents hold names, emails and phones; a report whose only
 * output is a terminal log has no business reading them.
 *
 * Usage:
 *   node --env-file=.env.local scripts/audit-registration-round-reachability.mjs
 */

import { register } from 'node:module';
import { MongoClient } from 'mongodb';

// src/lib/api/schedules.js imports './client', which imports '@/lib/…'. The
// verification suite's loader already resolves both the extensionless specifier
// and the alias; reuse it rather than duplicating the adapter, which would
// drift from the code under audit. Same arrangement as audit-course-id-casing.
register(new URL('../test/loader.mjs', import.meta.url));

const { PUBLIC_SCHEDULE_STATUSES, listSchedulesByCourse } = await import('@/lib/api/schedules');
const { getCourseByCodeInsensitive } = await import('@/lib/api/public-courses');

const COLLECTION = 'register_public';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
if (!uri) {
  console.error('MONGODB_URI is not set. Run with: node --env-file=.env.local …');
  process.exit(1);
}

/**
 * Is the stored `classDate` label a date in the past?
 *
 * ── `Date.parse` ANSWERS "UNKNOWN" FOR ALMOST EVERY REAL ROW ───────────────
 * A first version used `Date.parse` alone and returned unknown for 22 of the 26
 * unreachable rows — because `classDate` is THAI-BUDDHIST, written by
 * `formatClassDates`: `12-13 ส.ค. 2569`. That is not a weak answer, it is no
 * answer, and the whole point of this audit is to know WHY a round is
 * unreachable.
 *
 * So the label is parsed by INVERTING the formatter that wrote it. Three
 * shapes, and the LAST date is what matters — a round is past once its final
 * day has gone:
 *
 *     1 ก.ย. 2569                one day
 *     1-3 ก.ย. 2569              same month
 *     30 ก.ย. - 1 ต.ค. 2569      across months
 *
 * The YEAR is Buddhist (−543). Anything that still will not parse is reported
 * as UNKNOWN rather than assumed past — an audit that guesses is worth less
 * than one that admits a gap.
 */
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function labelLooksPast(classDate) {
  const label = String(classDate ?? '').trim();
  if (!label) return null;

  const year = /(\d{4})\s*$/.exec(label);
  // The LAST month token in the string — for a cross-month range that is the
  // end month, which is the one that decides whether the round has finished.
  const months = [...label.matchAll(/(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/g)];
  if (year && months.length) {
    const month = THAI_MONTHS.indexOf(months[months.length - 1][1]);
    // The last day number appearing BEFORE that final month token.
    const before = label.slice(0, months[months.length - 1].index);
    const days = [...before.matchAll(/(\d{1,2})/g)];
    if (month >= 0 && days.length) {
      const day = Number(days[days.length - 1][1]);
      const end = new Date(Number(year[1]) - 543, month, day, 23, 59, 59);
      if (!Number.isNaN(end.getTime())) return end.getTime() < Date.now();
    }
  }

  // Fall back to the ISO-ish path for any legacy label written another way.
  const t = Date.parse(label);
  if (Number.isNaN(t)) return null;
  return t < Date.now();
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const col = db.collection(COLLECTION);

console.log('═'.repeat(64));
console.log(' REGISTRATION ROUND REACHABILITY — read-only, writes nothing');
console.log('═'.repeat(64));
console.log(`   DATABASE : ${db.databaseName}.${COLLECTION}`);
console.log(`   SOURCE   : listSchedulesByCourse(status=${PUBLIC_SCHEDULE_STATUSES}, limit=50)`);
console.log('              — the SAME call the admin detail page makes');

const docs = await col
  .find({ classId: { $exists: true, $ne: '' } })
  .project({ _id: 1, courseId: 1, classId: 1, classDate: 1 })
  .toArray();

const total = await col.countDocuments({});
console.log(`\n   registrations total          ${String(total).padStart(5)}`);
console.log(`   with a stored classId        ${String(docs.length).padStart(5)}`);

// One upstream read per DISTINCT course, not per registration.
const byCourse = new Map();
for (const d of docs) {
  const key = String(d.courseId ?? '');
  if (!byCourse.has(key)) byCourse.set(key, []);
  byCourse.get(key).push(d);
}
console.log(`   distinct courses             ${String(byCourse.size).padStart(5)}`);

const counts = { reachable: 0, past: 0, unknown: 0, notInList: 0, noCourse: 0 };
const rows = [];

for (const [courseId, group] of byCourse) {
  let ids = null;
  try {
    const course = await getCourseByCodeInsensitive(courseId);
    if (course?._id) {
      const { items } = await listSchedulesByCourse(course._id, {
        limit: 50,
        status: PUBLIC_SCHEDULE_STATUSES,
      });
      ids = new Set((items ?? []).map((s) => String(s._id)));
    }
  } catch {
    ids = null;
  }

  let reachable = 0;
  let unreachable = 0;
  for (const d of group) {
    if (ids === null) { counts.noCourse += 1; unreachable += 1; continue; }
    if (ids.has(String(d.classId))) { counts.reachable += 1; reachable += 1; continue; }
    unreachable += 1;
    const past = labelLooksPast(d.classDate);
    if (past === true) counts.past += 1;
    else if (past === null) counts.unknown += 1;
    else counts.notInList += 1;
  }
  rows.push({ courseId, n: group.length, reachable, unreachable, resolved: ids !== null });
}

console.log('\nPER COURSE');
console.log('  ' + '─'.repeat(60));
console.log(`  ${'course_id'.padEnd(24)} ${'regs'.padStart(5)} ${'live'.padStart(5)} ${'gone'.padStart(5)}`);
console.log('  ' + '─'.repeat(60));
for (const r of rows.sort((a, b) => b.unreachable - a.unreachable)) {
  const flag = r.resolved ? '' : '   ← course did not resolve';
  console.log(`  ${r.courseId.padEnd(24)} ${String(r.n).padStart(5)} ${String(r.reachable).padStart(5)} ${String(r.unreachable).padStart(5)}${flag}`);
}

const unreachable = counts.past + counts.unknown + counts.notInList + counts.noCourse;
const pct = docs.length ? Math.round((unreachable / docs.length) * 1000) / 10 : 0;

console.log('\nTOTALS');
console.log('  ' + '─'.repeat(60));
console.log(`  reachable — offered in the select        ${String(counts.reachable).padStart(5)}`);
console.log(`  UNREACHABLE — rendered marked + disabled ${String(unreachable).padStart(5)}   (${pct}%)`);
console.log(`      · label parses to a PAST date        ${String(counts.past).padStart(5)}`);
console.log(`      · label does not parse (unknown)     ${String(counts.unknown).padStart(5)}`);
console.log(`      · course resolves, round not listed  ${String(counts.notInList).padStart(5)}`);
console.log(`      · course_id does not resolve         ${String(counts.noCourse).padStart(5)}`);
console.log('  ' + '─'.repeat(60));
console.log(`  ${'TOTAL with a classId'.padEnd(40)} ${String(docs.length).padStart(5)}`);

console.log('\n' + '═'.repeat(64));
console.log(' Read-only. Nothing was written and no audit rows were created.');
console.log('═'.repeat(64));

await client.close();
