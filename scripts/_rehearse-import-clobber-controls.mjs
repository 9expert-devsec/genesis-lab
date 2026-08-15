/**
 * CONTROL HARNESS for round 2 — applies ONE deliberate break to the working
 * tree, so a human can watch the suite go red, then restores it byte for byte.
 *
 * ── WHY A SCRIPT FILE AND NOT AN INLINE SHELL STRING ────────────────────────
 * An inline `sed`/`node -e` break is applied blind: quoting eats a character,
 * the substitution misses, the suite stays green, and the reading is "the test
 * is weak" when the truth is "the break never landed". This prints the diff it
 * made and REFUSES to continue if the file did not change.
 *
 * Usage:
 *   node scripts/_rehearse-round2-controls.mjs <name>      apply the break
 *   node scripts/_rehearse-round2-controls.mjs --revert     restore everything
 *   node scripts/_rehearse-round2-controls.mjs --list       names + what each
 *                                                           break should redden
 *
 * Backups live beside the original as `<file>.control-bak` and --revert removes
 * them. Never commit with a backup file present; --revert is not optional.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Each break names the file, an EXACT string to find, its replacement, and the
 * assertions it is expected to redden. The `find` string is asserted present
 * before anything is written — a break that cannot locate its anchor is a bug
 * in this file, not a finding about the suite.
 */
const BREAKS = {
  // ── round 3: the status-badge fold ────────────────────────────────────────

  /**
   * A status declared in the module with NO badge — the exact defect the fold
   * removes, now expressible only in one place instead of four.
   */
  'status-missing-badge': {
    file: 'src/lib/registrations/statuses.js',
    find: "  { value: 'quoted',    label: 'ส่งใบเสนอราคาแล้ว', accent: 'border-l-blue-400',  badge: 'bg-blue-100 text-blue-700' },",
    replace: "  { value: 'quoted',    label: 'ส่งใบเสนอราคาแล้ว', accent: 'border-l-blue-400' },",
    expects: [
      'pure: every declared status of BOTH subsets has a badge',
      'pure: badge classes are WHOLE class names, never interpolated fragments',
      'pure: statusBadge answers for every live value of both subsets',
      'pure: the colour and the label agree about which values are shared',
      'pure: a value in BOTH subsets carries the SAME badge in both',
    ],
  },

  /**
   * The two subsets drifting apart on a SHARED value — pending renders amber on
   * one screen and something else on the other, silently, because the flatten
   * prefers whichever spreads last.
   */
  'shared-badge-drift': {
    file: 'src/lib/registrations/statuses.js',
    find: "  { value: 'pending',   label: 'รอดำเนินการ',       accent: 'border-l-amber-400', badge: 'bg-amber-100 text-amber-700' },",
    replace: "  { value: 'pending',   label: 'รอดำเนินการ',       accent: 'border-l-amber-400', badge: 'bg-rose-100 text-rose-700' },",
    expects: [
      'pure: a value in BOTH subsets carries the SAME badge in both',
    ],
  },

  /** An interpolated badge — correct markup, and no CSS at all. */
  'badge-interpolated': {
    file: 'src/lib/registrations/statuses.js',
    find: "badge: 'bg-emerald-100 text-emerald-700' },",
    replace: 'badge: `bg-${\'emerald\'}-100 text-emerald-700` },',
    expects: [
      'pure: badge classes are WHOLE class names, never interpolated fragments',
    ],
  },

  /** The hand-written map coming back to one of the four clients. */
  'local-badge-map-returns': {
    file: 'src/app/admin/registrations/_components/RegistrationsClient.jsx',
    find: '                      statusBadge(row.status)',
    replace: "                      ({ pending: 'bg-amber-100 text-amber-700' })[row.status] ?? 'bg-slate-100 text-slate-600'",
    expects: [
      'fs: the list screen reads BOTH label and colour through the shared lookups',
      'fs: the list screen holds no local status label OR colour map',
    ],
  },

  // ── round 3 (earlier): the import-clobber restore ─────────────────────────

  /**
   * THE DEFECT ITSELF, re-created: delete the export keyword so
   * `checkAliasAvailable` becomes a module-local function again. The two
   * callers survive untouched, which is exactly the state the merge left.
   */
  'alias-check-unexported': {
    file: 'src/lib/actions/course-extensions.js',
    find: 'export async function checkAliasAvailable(alias, courseId) {',
    replace: 'async function checkAliasAvailable(alias, courseId) {',
    expects: [
      'fs: every named import of @/lib/actions/course-extensions resolves to an export',
      'fs: checkAliasAvailable specifically is exported and imported by the create form',
      'fs: every named import under src resolves to a real export of its target',
      'fs: @/lib/actions/course-extensions — stub exports match ...',
    ],
  },

  /** The whole function gone again — the exact merge-resolution outcome. */
  'alias-check-deleted': {
    file: 'src/lib/actions/course-extensions.js',
    find: '  const clash = await checkAliasAvailable(cleanAlias, courseId);',
    replace: '  const clash = null;',
    expects: [
      'fs: the save action checks for a clashing alias before writing',
      'fs: the pre-check runs BEFORE the write, or it is not a pre-check',
      'fs: CONTROL: the check does not replace the index — both must be present',
    ],
  },

  /** The hidden-course opt-in, which a "tidy up" would drop. */
  'alias-check-filters-hidden': {
    file: 'src/lib/actions/course-extensions.js',
    find: "    listPublicCourses({ includeHidden: true }).then(",
    replace: '    listPublicCourses().then(',
    expects: [
      'fs: src/lib/actions/course-extensions.js opts in to hidden courses',
    ],
  },

  /** Self-exclusion removed — re-saving a course would clash with itself. */
  'alias-check-no-self-exclusion': {
    file: 'src/lib/actions/course-extensions.js',
    find: '      courseId: { $ne: courseId },',
    replace: '',
    expects: [
      'fs: the save action checks for a clashing alias before writing',
      'fs: the pre-check runs BEFORE the write, or it is not a pre-check',
      'fs: CONTROL: the check does not replace the index — both must be present',
    ],
  },

  /** The regressed masterclass import, commented out again. */
  'masterclass-import-clobbered': {
    file: 'src/lib/actions/masterclass-registrations.js',
    find: "import { recomputeBatchSeats } from '@/lib/masterclass/recomputeBatchSeats';",
    replace: "// import { recomputeBatchSeats } from '@/lib/masterclass/recomputeBatchSeats';",
    expects: [
      'fs: no file under src/app, src/components or src/lib uses a src/lib export it never imported',
    ],
  },

  // ── round 2: the in-house status collapse ─────────────────────────────────

  'paid-reachable-inhouse': {
    file: 'src/lib/registrations/statuses.js',
    find: "  { value: 'cancelled', label: 'ยกเลิก',            accent: 'border-l-slate-300' },\n];",
    replace: "  { value: 'cancelled', label: 'ยกเลิก',            accent: 'border-l-slate-300' },\n  { value: 'paid',      label: 'ชำระแล้ว',          accent: 'border-l-emerald-400' },\n];",
    expects: [
      'pure: `paid` is not an in-house status at all',
      'pure: CONTROL: the two subsets really are different',
      'render: the in-house strip offers no ชำระแล้ว card',
      'render: no public-ONLY status label appears on the in-house strip',
      'render: there are no in-house-ONLY labels left',
    ],
  },

  'no-unknown-status-degrade': {
    file: 'src/lib/registrations/statuses.js',
    find: "  if (!statusValuesForSource(source).includes(status)) return [];",
    replace: "  if (!statusValuesForSource(source).includes(status)) return [status];",
    expects: [
      'pure: an unrecognised status returns []',
      'pure: normaliseStatusParam and storedValuesForFilter agree on what is recognised',
      'pure: a RETIRED status adds no clause — the list shows everything, not nothing',
      'pure: a status from the OTHER source adds no clause either',
    ],
  },

  'legacy-map-overlaps-live': {
    file: 'src/lib/registrations/statuses.js',
    find: "export const LEGACY_STATUS_LABELS = {\n  new:           'ใหม่',",
    replace: "export const LEGACY_STATUS_LABELS = {\n  quoted:        'ส่งใบเสนอราคาแล้ว',\n  new:           'ใหม่',",
    expects: [
      'pure: the legacy map covers every retired value',
      'pure: the legacy LABELS and the migration MAP cover exactly the same values',
      'pure: the legacy map shares NO value with the live vocabulary of either source',
      'pure: `quoted` survives the collapse — it is live, not legacy',
    ],
  },

  'builders-default-to-public': {
    file: 'src/app/admin/registrations/_components/RegistrationsClient.jsx',
    find: '  const statCards      = buildStatCards(sourceStatuses);\n  const statusOptions  = buildStatusChips(sourceStatuses);',
    replace: '  const statCards      = buildStatCards();\n  const statusOptions  = buildStatusChips();',
    expects: [
      'fs: the stat cards are built from the per-source subset',
      'fs: the filter chips are built from the same subset',
      'render: the in-house strip offers no ชำระแล้ว card',
      'render: the in-house column count is the card count',
    ],
  },

  'inhouse-notes-ungated': {
    file: 'src/lib/actions/inhouse-registrations.js',
    find: "    { _id: id, status: { $ne: 'cancelled' } },",
    replace: '    { _id: id },',
    expects: [
      'fs: updateInhouseAdminNotes refuses a write to a cancelled request, in the FILTER',
    ],
  },

  'inhouse-status-unconditional': {
    file: 'src/lib/actions/inhouse-registrations.js',
    find: '    { _id: id, status: { $in: fromStates } },\n    { $set: { status } },',
    replace: '    { _id: id },\n    { $set: { status } },',
    expects: [
      'fs: updateInhouseStatus filters on the stored status, atomically',
      'fs: the in-house status path does NOT read the status and then write it',
    ],
  },

  'expired-writes-cancelled': {
    file: 'src/app/api/webhooks/omise/route.js',
    find: "    doc.payment.omiseStatus = 'expired';\n    await doc.save();",
    replace: "    doc.payment.omiseStatus = 'expired';\n    doc.status = 'cancelled';\n    await doc.save();",
    expects: [
      'fs: the expired branch does NOT assign doc.status',
      'fs: the expired branch writes ONLY the omise status',
    ],
  },

  'dev-mark-paid-ungated': {
    file: 'src/app/api/registration/public/dev-mark-paid/route.js',
    find: "  if (doc.status === 'cancelled') {",
    replace: "  if (false) {",
    expects: [
      'fs: dev-mark-paid refuses a cancelled document (public)',
    ],
  },

  'inhouse-client-hardcodes-actions': {
    file: 'src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx',
    find: '  const statusActions = allowedTransitions(liveStatus, INHOUSE_STATUS_TRANSITIONS)\n    .filter((next) => ACTION_LABEL[next]);',
    replace: "  const statusActions = (status === 'cancelled' ? ['pending'] : ['quoted', 'cancelled']);",
    expects: [
      'render: a cancelled in-house request renders NO status action button',
      'render: for EVERY in-house status, the rendered actions match the transition table',
      'render: no in-house button renders with empty content, on any status',
    ],
  },
};

const arg = process.argv[2];

if (!arg || arg === '--list') {
  console.log('Round 2 control breaks — each applied from this file, never inline.\n');
  for (const [name, b] of Object.entries(BREAKS)) {
    console.log(`  ${name}`);
    console.log(`    file: ${b.file}`);
    for (const e of b.expects) console.log(`    should redden → ${e}`);
    console.log('');
  }
  process.exit(0);
}

if (arg === '--revert') {
  let n = 0;
  for (const b of Object.values(BREAKS)) {
    const full = path.join(ROOT, b.file);
    const bak = `${full}.control-bak`;
    if (existsSync(bak)) {
      writeFileSync(full, readFileSync(bak, 'utf8'));
      unlinkSync(bak);
      console.log(`restored ${b.file}`);
      n += 1;
    }
  }
  console.log(n ? `\n${n} file(s) restored.` : 'nothing to restore.');
  process.exit(0);
}

const brk = BREAKS[arg];
if (!brk) {
  console.error(`unknown break "${arg}" — run with --list`);
  process.exit(1);
}

const full = path.join(ROOT, brk.file);
const before = readFileSync(full, 'utf8');

/**
 * ── CRLF. THIS IS DEFECT 4 FROM test/sourceScan.mjs, ARRIVING HERE ──────────
 *
 * The working tree is CRLF. Every anchor in this file is written with bare
 * `\n`, so a MULTI-LINE anchor matches nothing while a single-line one matches
 * fine — and "matches nothing" is precisely the failure that would have made a
 * break silently not land. It was measured, not guessed: the
 * `builders-default-to-public` anchor failed here first and the check below is
 * what said so instead of the suite quietly staying green.
 *
 * So the anchor is converted to the file's OWN line ending before matching.
 */
const eol = before.includes('\r\n') ? '\r\n' : '\n';
const find = brk.find.split('\n').join(eol);
const replace = brk.replace.split('\n').join(eol);

// THE ANCHOR MUST EXIST. A break that silently does nothing produces a green
// suite and the wrong conclusion about the test.
if (!before.includes(find)) {
  console.error(`ANCHOR NOT FOUND in ${brk.file} (line ending ${JSON.stringify(eol)}):\n---\n${brk.find}\n---`);
  console.error('The break did NOT land. Fix this script before reading the suite.');
  process.exit(1);
}
if (existsSync(`${full}.control-bak`)) {
  console.error(`${brk.file}.control-bak already exists — revert first.`);
  process.exit(1);
}

const after = before.split(find).join(replace);
if (after === before) {
  console.error('replacement produced identical text — the break did not land.');
  process.exit(1);
}

writeFileSync(`${full}.control-bak`, before);
writeFileSync(full, after);

console.log(`BREAK APPLIED: ${arg}`);
console.log(`file: ${brk.file}  (${before.length} → ${after.length} bytes)`);
console.log('\n--- removed ---');
console.log(brk.find);
console.log('--- inserted ---');
console.log(brk.replace);
console.log('\nshould redden:');
for (const e of brk.expects) console.log(`  → ${e}`);
console.log('\nNow run `npm test`, then `node scripts/_rehearse-round2-controls.mjs --revert`.');
