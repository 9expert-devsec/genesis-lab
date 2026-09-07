/**
 * THE CONTROLS FOR THE LEGACY INVOICE ADDRESS ROW.
 *
 * A guard nobody has watched go red is a guard nobody has tested. This applies a
 * NAMED BREAK to the real source, prints the diff that landed so the edit can be
 * seen rather than trusted, and puts it back.
 *
 *   node scripts/_control-legacy-invoice-address.mjs list
 *   node scripts/_control-legacy-invoice-address.mjs verify
 *   node scripts/_control-legacy-invoice-address.mjs apply <name>
 *   node scripts/_run-one-test.mjs test/render/legacyInvoiceAddressRow.test.mjs
 *   node scripts/_control-legacy-invoice-address.mjs revert
 *
 * Same harness as _control-round11.mjs, including the CRLF handling, the
 * unknown-key hard failure and `verify`.
 *
 * ══ WHAT THESE ARE FOR ══════════════════════════════════════════════════════
 *
 * The round's claim has three halves and they fail in different directions, so
 * a control that reddened all of them would tell you nothing about which
 * assertion is load-bearing:
 *
 *   · SHOW IT WHEN IT SHOULD BE SHOWN   → `guard-inverted`, `never-renders`
 *   · DO NOT show it otherwise          → `renders-always`, `naive-emptiness`
 *   · SHOW IT UNCHANGED                 → `tidy-the-line`
 *
 * `renders-always` and `naive-emptiness` are the two that matter most. The first
 * is the failure a display change like this actually ships — a row appearing on
 * 2,400 records that already have an address — and the second is the widening
 * that was explicitly ruled OUT of this round.
 *
 * ══ AND ONE IS A DISCRIMINATION TEST ════════════════════════════════════════
 *
 * `hint-reworded` leaves the row rendering, keeps the label, keeps the copy
 * control, and guts the explanation down to a bare "ข้อมูลเดิม". Every assertion
 * that merely checks the row is THERE stays green; only the three-part hint
 * assertion moves. That is the proof the hint test is not redundant with the
 * label test — the label says this row is different, the hint is the only thing
 * that says why, and "the row rendered" cannot tell them apart.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LIB     = 'src/lib/registration/legacyInvoiceAddress.js';
const SHELL   = 'src/app/admin/registrations/_components/detailShell.jsx';
const INHOUSE = 'src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx';

const BREAKS = {
  // ── the row appears when it should not ───────────────────────────────────

  'renders-always': {
    file: LIB,
    why: 'Drop the structured-address half of the condition, so the legacy blob renders WHENEVER it is non-empty. '
      + 'This is the failure this round would actually ship: a second address row on every record that has a real '
      + 'address AND an old blob, with the two disagreeing and nothing saying which is current.\n'
      + '      NOTE: this control has already earned its keep. On its first run "the legacy row does NOT appear '
      + 'beside a structured address" STAYED GREEN, because the structured fixture had no blob for the deleted '
      + 'clause to let through — the assertion was passing on a missing input rather than on the guard. The fixture '
      + 'now carries both shapes and the assertion is in the list below because it genuinely reddens.',
    reddens: [
      'render/legacyInvoiceAddressRow › the legacy row does NOT appear beside a structured address',
      'render/legacyInvoiceAddressRow › a structured record renders byte-identically with and without the new path',
      'render/legacyInvoiceAddressRow › the condition is both-null AND non-empty, and nothing wider',
      'render/legacyInvoiceAddressRow › a thaiAddress holding only a postcode still suppresses the legacy row',
    ],
    staysGreen: [
      'render/legacyInvoiceAddressRow › the legacy line renders, verbatim, on both screens — THE MEASUREMENT: every '
        + 'assertion about the legacy-only fixture is untouched, because that fixture has no structured address for '
        + 'the dropped clause to have suppressed. A test suite built only from the "it renders" direction would be '
        + 'entirely green on this break.',
      'render/legacyInvoiceAddressRow › no row, no label and no hint when all three are empty — the blob is still '
        + 'empty there, so the surviving half of the condition still holds.',
    ],
    find: '  if (thaiAddress != null || internationalAddress != null) return \'\';',
    replace: '  if (false) return \'\';',
  },

  'naive-emptiness': {
    file: LIB,
    why: 'Widen the emptiness test to "a thaiAddress with no addressLine counts as empty" — the change that was '
      + 'explicitly ruled out of this round. It looks like an improvement and it silently changes what 20 live '
      + 'register_inhouse documents display, with no measurement of what it does to every other screen.',
    reddens: [
      'render/legacyInvoiceAddressRow › a thaiAddress holding only a postcode still suppresses the legacy row',
    ],
    staysGreen: [
      'render/legacyInvoiceAddressRow › the legacy row does NOT appear beside a structured address — THE MEASUREMENT: '
        + 'that fixture has a FULL thaiAddress, so a rule about missing address lines cannot reach it. This is why the '
        + 'postcode-only case has an assertion of its own rather than being assumed covered by "structured suppresses it".',
      'render/legacyInvoiceAddressRow › the condition is both-null AND non-empty, and nothing wider — every case it '
        + 'lists passes a non-empty or absent addressLine, so it cannot see this either.',
    ],
    find: '  if (thaiAddress != null || internationalAddress != null) return \'\';',
    replace: '  if ((thaiAddress != null && thaiAddress.addressLine) || internationalAddress != null) return \'\';',
  },

  // ── the row does not appear when it should ───────────────────────────────

  'guard-inverted': {
    file: SHELL,
    why: 'Return null on a NON-empty line instead of an empty one. The row disappears from exactly the records it '
      + 'was built for and appears nowhere else, so the page looks untouched — which is what makes it worth a control.',
    reddens: [
      'render/legacyInvoiceAddressRow › the legacy line renders, verbatim, on both screens',
      'render/legacyInvoiceAddressRow › it is labelled as legacy, and the label says so before the hint does',
      'render/legacyInvoiceAddressRow › it keeps the copy affordance its neighbouring rows have',
      'render/legacyInvoiceAddressRow › the copy control is the SAME button as the tax-id one beside it',
      'render/legacyInvoiceAddressRow › exactly ONE legacy row renders — it is not drawn twice',
      'render/legacyInvoiceAddressRow › the line is not reformatted on its way to the page',
      'render/legacyInvoiceAddressRow › the row offers no way to change it — no input, no textarea, no edit control',
      'render/legacyInvoiceAddressRow › CONTROL: the three fixtures really are three different pages',
    ],
    find: '  if (!line) return null;',
    replace: '  if (line) return null;',
  },

  'inhouse-not-wired': {
    file: INHOUSE,
    why: 'Wire the in-house row to `doc.thaiAddress` instead of the live `quotation.thaiAddress`. On a saved document '
      + 'the two are equal, so THE FIRST RENDER OF EVERY PAGE IS IDENTICAL and only an edit that has not been reloaded '
      + 'can tell them apart. Named because "it works when I open the page" is exactly how this class of bug survives.',
    reddens: [],
    staysGreen: [
      'render/legacyInvoiceAddressRow › EVERY assertion in the file — THE MEASUREMENT, and it is a GAP rather than a '
        + 'reassurance. renderToStaticMarkup renders once, from props, so no static-markup test can distinguish live '
        + 'state from `doc` here. Closing it needs an interaction test (test/browser) that fills the address and '
        + 'asserts the legacy row goes away without a reload. NOT built this round; recorded so the gap is known '
        + 'rather than assumed covered.',
    ],
    find: '                  thaiAddress={quotation.thaiAddress}',
    replace: '                  thaiAddress={doc.thaiAddress}',
  },

  // ── the row appears, but not as stored ───────────────────────────────────

  'tidy-the-line': {
    file: LIB,
    why: 'Collapse runs of whitespace inside the blob "while we are trimming it anyway". It is the smallest possible '
      + 'step toward parsing, it looks like tidying, and it means the admin is no longer looking at what the customer '
      + 'typed — which is the entire reason this field is stored verbatim.',
    reddens: [
      'render/legacyInvoiceAddressRow › the line is not reformatted on its way to the page',
    ],
    staysGreen: [
      'render/legacyInvoiceAddressRow › the legacy line renders, verbatim, on both screens — THE MEASUREMENT: that '
        + 'assertion is `includes(BLOB)`, and… no. It reddens too, because the fixture blob carries the double space. '
        + 'That is deliberate: the fixture was built UNPLEASANT — double space, postcode in the middle — precisely so '
        + 'the ordinary "it rendered" assertion is not blind to reformatting.',
    ],
    find: '  return typeof legacyInvoiceAddress === \'string\' ? legacyInvoiceAddress.trim() : \'\';',
    replace: '  return typeof legacyInvoiceAddress === \'string\' ? legacyInvoiceAddress.trim().replace(/\\s+/g, \' \') : \'\';',
  },

  'hint-reworded': {
    file: LIB,
    why: 'Reduce the explanation to a bare "ข้อมูลเดิม". The row still renders, still carries its label, still copies. '
      + 'Only the reason an admin is owed is gone — and a label alone does not say the field came from the old site, '
      + 'is one unstructured line, or cannot be fixed from this card.',
    reddens: [
      'render/legacyInvoiceAddressRow › the hint says where it came from, that it is one line, and that it is read-only',
    ],
    staysGreen: [
      'render/legacyInvoiceAddressRow › it is labelled as legacy, and the label says so before the hint does — THE '
        + 'MEASUREMENT: that assertion tests the CONSTANTS the component renders, so it follows any rewording and '
        + 'cannot fail. Proof that "the hint is on the page" and "the hint still explains anything" are two questions.',
      'render/legacyInvoiceAddressRow › the legacy row does NOT appear beside a structured address — same reason, in '
        + 'the absence direction.',
    ],
    find: '  \'นำเข้าจากเว็บไซต์เดิมเป็นข้อความบรรทัดเดียว ไม่ได้แยกเป็น แขวง / เขต / จังหวัด / รหัสไปรษณีย์ และแก้ไขที่นี่ไม่ได้\';',
    replace: '  \'ข้อมูลเดิม\';',
  },

  'never-renders': {
    file: SHELL,
    why: 'Return null unconditionally — the round, removed, with the import and the call sites still in place. The '
      + 'baseline every "it renders" assertion in the file is measured against.',
    reddens: [
      'render/legacyInvoiceAddressRow › the legacy line renders, verbatim, on both screens',
      'render/legacyInvoiceAddressRow › it is labelled as legacy, and the label says so before the hint does',
      'render/legacyInvoiceAddressRow › it keeps the copy affordance its neighbouring rows have',
      'render/legacyInvoiceAddressRow › the copy control is the SAME button as the tax-id one beside it',
      'render/legacyInvoiceAddressRow › exactly ONE legacy row renders — it is not drawn twice',
      'render/legacyInvoiceAddressRow › the line is not reformatted on its way to the page',
      'render/legacyInvoiceAddressRow › the row offers no way to change it — no input, no textarea, no edit control',
      'render/legacyInvoiceAddressRow › CONTROL: the three fixtures really are three different pages',
    ],
    staysGreen: [
      'render/legacyInvoiceAddressRow › no row, no label and no hint when all three are empty — an empty fixture and a '
        + 'removed feature are indistinguishable from the absence direction. That is what the CONTROL test at the '
        + 'bottom of the file is for.',
    ],
    find: '  if (!line) return null;',
    replace: '  if (line || !line) return null;',
  },
};

// ── Apply / revert ──────────────────────────────────────────────────────────

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-legacy-invoice-address.state');

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, text) => writeFileSync(path.join(ROOT, rel), text, 'utf8');

/** Splice one occurrence, preserving the file's own line endings. */
function spliceOnce(source, find, replace, label) {
  const crlf = source.includes('\r\n');
  const needle = crlf ? find.replace(/\n/g, '\r\n') : find;
  const value = crlf ? replace.replace(/\n/g, '\r\n') : replace;
  const at = source.indexOf(needle);
  if (at === -1) {
    throw new Error(`${label}: the FIND text is not in the file — the source has moved on:\n---\n${find}\n---`);
  }
  if (source.indexOf(needle, at + needle.length) !== -1) {
    throw new Error(`${label}: the FIND text appears more than once — it does not identify one site`);
  }
  return source.slice(0, at) + value + source.slice(at + needle.length);
}

/** Line-numbered before/after for the region that changed. Proof it landed. */
function showDiff(rel, before, after) {
  const b = before.split(/\r?\n/);
  const a = after.split(/\r?\n/);
  let head = 0;
  while (head < b.length && head < a.length && b[head] === a[head]) head += 1;
  let tail = 0;
  while (tail < b.length - head && tail < a.length - head
         && b[b.length - 1 - tail] === a[a.length - 1 - tail]) tail += 1;

  console.log(`\n--- a/${rel}`);
  console.log(`+++ b/${rel}`);
  console.log(`@@ -${head + 1},${b.length - head - tail} +${head + 1},${a.length - head - tail} @@`);
  for (let i = head; i < b.length - tail; i += 1) console.log(`-${b[i]}`);
  for (let i = head; i < a.length - tail; i += 1) console.log(`+${a[i]}`);
  console.log(`\nfile lines ${b.length} -> ${a.length}; `
    + `${b.length - head - tail} removed, ${a.length - head - tail} added.`);
  console.log('(A control that changed the whole file is a control that failed — check those numbers.)');
}

const [, , cmd, name] = process.argv;

if (!cmd || cmd === 'list') {
  console.log('Legacy invoice address controls:\n');
  for (const [key, brk] of Object.entries(BREAKS)) {
    console.log(`  ${key}   [${brk.file.split('/').pop()}]`);
    console.log(`      ${brk.why}`);
    for (const r of brk.reddens) console.log(`      red:   ${r}`);
    for (const g of brk.staysGreen ?? []) console.log(`      green: ${g}`);
    console.log('');
  }
  process.exit(0);
}

if (cmd === 'verify') {
  const stale = [];
  for (const [key, brk] of Object.entries(BREAKS)) {
    const source = read(brk.file);
    const crlf = source.includes('\r\n');
    for (const [part, spec] of [['find', brk], ['also', brk.also]].filter(([, s]) => s)) {
      const needle = crlf ? spec.find.replace(/\n/g, '\r\n') : spec.find;
      const first = source.indexOf(needle);
      if (first === -1) stale.push(`${key}${part === 'also' ? '.also' : ''}: FIND is gone from ${brk.file}`);
      else if (source.indexOf(needle, first + needle.length) !== -1) {
        stale.push(`${key}${part === 'also' ? '.also' : ''}: FIND matches more than once in ${brk.file}`);
      }
    }
  }
  const total = Object.keys(BREAKS).length;
  if (stale.length === 0) {
    console.log(`all ${total} controls resolve to exactly one site each.`);
    process.exit(0);
  }
  console.error(`${stale.length} of ${total} controls no longer identify one site:\n`);
  for (const line of stale) console.error(`  ${line}`);
  console.error('\nEither the source moved (re-point the FIND) or the feature was removed '
    + '(delete the control and name it in the header).');
  process.exit(1);
}

if (cmd === 'revert') {
  if (!existsSync(STATE)) { console.log('nothing to revert'); process.exit(0); }
  const rel = readFileSync(STATE, 'utf8').trim();
  const backup = path.join(ROOT, rel + BACKUP_SUFFIX);
  if (!existsSync(backup)) throw new Error(`the backup for ${rel} is gone — restore it from git`);
  const original = readFileSync(backup, 'utf8');
  write(rel, original);
  unlinkSync(backup);
  unlinkSync(STATE);
  console.log(`reverted ${rel} (${original.length} bytes restored)`);
  process.exit(0);
}

if (cmd !== 'apply' || !name || !BREAKS[name]) {
  console.error(`unknown control "${name ?? ''}" — run \`list\` to see them`);
  process.exit(2);
}
if (existsSync(STATE)) {
  console.error('a control is already applied — revert it before applying another');
  process.exit(2);
}

const brk = BREAKS[name];

// A control that declares a key this harness does not apply reports a WEAKER
// break than it claims, and then "stayed green" is a lie about a break that
// never fully landed.
const KNOWN_KEYS = new Set(['file', 'why', 'reddens', 'staysGreen', 'find', 'replace', 'also']);
for (const key of Object.keys(brk)) {
  if (!KNOWN_KEYS.has(key)) {
    console.error(`${name}: unknown key "${key}". A control that declares something this harness `
      + 'does not apply reports a weaker break than it claims.');
    process.exit(2);
  }
}

const before = read(brk.file);
let after = spliceOnce(before, brk.find, brk.replace, name);
if (brk.also) after = spliceOnce(after, brk.also.find, brk.also.replace, `${name} (second site)`);

writeFileSync(path.join(ROOT, brk.file + BACKUP_SUFFIX), before, 'utf8');
write(brk.file, after);
writeFileSync(STATE, brk.file, 'utf8');

console.log(`APPLIED: ${name}\n${brk.why}`);
showDiff(brk.file, before, after);
console.log('\nEXPECTED RED:');
for (const r of brk.reddens) console.log(`  ${r}`);
if (brk.staysGreen) {
  console.log('\nEXPECTED GREEN (this is a measurement, not a gap):');
  for (const g of brk.staysGreen) console.log(`  ${g}`);
}
console.log('\nnow: node scripts/_run-one-test.mjs test/render/legacyInvoiceAddressRow.test.mjs'
  + '   then: node scripts/_control-legacy-invoice-address.mjs revert');
