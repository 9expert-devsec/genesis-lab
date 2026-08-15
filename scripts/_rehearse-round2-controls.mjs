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
