/**
 * THE CONTROLS FOR ROUND 38 — the audit log's read path and its surface.
 *
 *   node scripts/_control-round38.mjs list
 *   node scripts/_control-round38.mjs verify
 *   node scripts/_control-round38.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-round38.mjs revert
 *
 * Same harness as rounds 8 and 10-13, _control-r0 and _control-leave-guard:
 * CRLF-preserving splice, `verify`, an unknown-key hard failure, and a revert
 * that restores from a byte copy taken before the break.
 *
 * ══ READ THE MESSAGE, NOT THE COLOUR ════════════════════════════════════════
 * `npm test` SWALLOWS failure messages — test/run.mjs calls process.exit() in
 * its close handler before the spec reporter flushes. So a red run prints
 * `✖ <name>` and nothing else, and red-vs-green alone cannot tell a guard that
 * fired for the right reason from one that fired because the break broke
 * something else. Every break below records the assertion TEXT it produced,
 * read by running the affected file through a runner without the exit.
 *
 * ══ WHAT THESE ARE FOR ══════════════════════════════════════════════════════
 * Round 38 is mostly a set of DECLINATIONS — three surfaces the stored rows
 * cannot honestly support, asserted as absences. An absence assertion is the
 * easiest kind to write vacuously, so each of the three is broken here by
 * making the declined surface REAPPEAR, and the guard has to name it.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PURE   = 'src/lib/pageBuilder/auditTrail.js';
const ACTION = 'src/lib/actions/pageBuilder.js';
const TRAIL  = 'src/components/pageBuilder/editor/ActivityTrail.jsx';

const BREAKS = {
  'projection-widened': {
    file: PURE,
    why: 'Ship `before` and `after` in the read. This is the single most likely future '
      + 'edit — they look like the interesting fields, and the schema declares them. They '
      + 'are presence flags: 18 of 20 stored draft.save rows are {hadDraft:true} -> '
      + '{hasDraft:true} and 23 of 25 update rows have the two halves identical, so a caller '
      + 'rendering them draws a change arrow between two identical strings.',
    // AS OBSERVED — four, not the two predicted, and recorded as reported. The
    // two extra are real and worth having: the vocabulary scan sees 'before'
    // arrive in auditTrail.js's own code, and the round-37 restore fixture
    // asserts the backup row does not ship its backupVersionId.
    reddens: [
      'pure/auditTrail › the projection ships three fields and excludes four by name',
      'pure/auditTrail › the trail declines all three, and its own source uses none of their vocabulary',
      'fs/pageBuilderDraftActions › the read returns the projection and NOTHING else',
      'fs/pageBuilderDraftActions › the newest row after a round-37 restore is the BACKUP, then the save',
    ],
    staysGreen: [
      'render/pageDialogs › the trail claims none of the three declined surfaces — the '
        + 'COMPONENT does not render before/after even when handed them, which is the '
        + 'second line of defence and worth knowing is independent of the first.',
    ],
    find: "export const AUDIT_TRAIL_FIELDS = 'action actor createdAt';",
    replace: "export const AUDIT_TRAIL_FIELDS = 'action actor createdAt before after';",
  },

  'cursor-tie-break-dropped': {
    file: PURE,
    why: 'Page on `createdAt` alone — the naive bound a first attempt writes. Two rows '
      + 'sharing a millisecond at a page boundary means the second is never returned by any '
      + 'page: the trail looks complete and the row somebody was looking for is gone. '
      + 'auditQuery.js states this rule for the admin trail; this is it being disobeyed here.',
    reddens: [
      'fs/pageBuilderDraftActions › SAME-MILLISECOND rows straddling the boundary keep the tie-break',
      'pure/auditTrail › a cursor pages on the COMPOUND key, both halves',
    ],
    staysGreen: [
      'fs/pageBuilderDraftActions › one row past the boundary pages without losing or '
        + 'repeating a row — no tie in that fixture, so a flat bound is correct there. That '
        + 'is exactly why the tie case is a separate fixture rather than a stronger assertion '
        + 'on the same one.',
      'pure/auditTrail › the sort and the cursor agree — the SORT is untouched by this break, '
        + 'which is the half that makes the defect silent.',
    ],
    find: `    filter.$or = [
      { createdAt: { $lt: c.createdAt } },
      { createdAt: c.createdAt, _id: { $lt: c.id } },
    ];`,
    replace: '    filter.createdAt = { $lt: c.createdAt };',
  },

  'gate-removed': {
    file: ACTION,
    why: "Drop requireAdmin('pages') from the read. In a 'use server' module every export "
      + 'is a POST endpoint, and this one answers who did what to a page — an ungated version '
      + 'hands the page\'s actor names to anybody who can reach the action.',
    reddens: [
      'pure/auditTrail › the read is gated on the SAME key every other page read uses',
    ],
    staysGreen: [
      'every fs/pageBuilderDraftActions case — the test harness stubs requireAdmin to return '
        + 'the held session and it never throws, so NO behavioural test can see this. The gate '
        + 'is a source claim and can only be guarded as one; saying so is the point of this '
        + 'control.',
    ],
    find: `  if (!filter) return { rows: [], nextCursor: null };
  await requireAdmin('pages');`,
    replace: '  if (!filter) return { rows: [], nextCursor: null };',
  },

  'second-source-for-the-trail': {
    file: TRAIL,
    why: 'Point the activity trail at getPageVersions as well. Two answers to "what happened '
      + 'to this page" in one dialog, which can disagree — measured: 1 stored publish audit '
      + 'row against 3 stored versions. This is the second-authority shape rounds 21-25 spent '
      + 'four rounds removing, arriving as a convenience.',
    reddens: [
      'render/pageDialogs › the trail reads the AUDIT log and no second source',
    ],
    staysGreen: [
      'everything else in render/pageDialogs — the import alone changes no markup, which is '
        + 'why the guard reads the source rather than the render. A second source is a '
        + 'structural defect before it is a visible one.',
    ],
    find: "import { getPageAuditLog } from '@/lib/actions/pageBuilder';",
    replace: "import { getPageAuditLog, getPageVersions } from '@/lib/actions/pageBuilder';",
  },

  'declined-version-number-returns': {
    file: TRAIL,
    why: 'Print a version number beside each row — the mockup-shaped addition a later round '
      + 'reaches for first. No audit row carries a versionNumber or a version id, so the '
      + 'number would have to be invented; here it is invented from the row index, which is '
      + 'exactly how such a thing arrives.',
    // AS OBSERVED — two. The row-composition case reddens as well, because the
    // invented number is prepended INSIDE the row span and the row no longer
    // starts with its verb. Two independent guards catch one break.
    reddens: [
      'render/pageDialogs › the activity section renders one row per recorded action, newest first',
      'render/pageDialogs › the trail claims none of the three declined surfaces',
    ],
    staysGreen: [
      'pure/auditTrail › the trail declines all three — that guard reads auditTrail.js, and '
        + 'this break is in the COMPONENT. Two files, two guards; neither covers the other, '
        + 'and this control is how that is known rather than assumed.',
    ],
    find: '              {auditRowLine(r, when(r.createdAt))}',
    replace: '              {`เวอร์ชัน ${i + 1} · `}{auditRowLine(r, when(r.createdAt))}',
    also: {
      file: TRAIL,
      find: '        {rows.map((r) => (',
      replace: '        {rows.map((r, i) => (',
    },
  },

  'second-saver-sentence': {
    file: TRAIL,
    why: 'Make the activity trail answer ผู้แก้ไขล่าสุด too. Round 33 measured '
      + 'page.updatedBy frozen at creation and round 34 made draft.savedBy the one source; '
      + 'this adds a third answer, derived from the newest draft.save row, which is stale the '
      + 'moment a publish clears the draft the other source reads.',
    // AS OBSERVED. The first run of this control ALSO reddened
    // `CONTROL: the same scan catches a second source of that sentence`, because
    // that control asserted an exact two-element list and a real third owner
    // broke it. Two reds naming one defect is a worse signal than one, so the
    // control was rewritten to assert a DELTA. Recorded here because the fix was
    // to the test, not to the break.
    reddens: [
      'pure/auditTrail › exactly ONE module produces the ผู้แก้ไขล่าสุด sentence',
      'render/pageDialogs › the trail claims none of the three declined surfaces',
    ],
    staysGreen: [
      'render/draftSaverLine and pure/draftSaver — round 34\'s surface is untouched and still '
        + 'correct. That is the shape of this defect: nothing breaks, there are simply two '
        + 'answers, and only a count can see it.',
    ],
    find: '      <ul className="space-y-1">',
    replace: `      <p>{\`แก้ไขล่าสุดโดย \${rows.find((r) => r.action === 'draft.save')?.actor?.name ?? ''}\`}</p>
      <ul className="space-y-1">`,
  },
};

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-round38.state');

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
  console.log('Round 38 controls:\n');
  for (const [key, brk] of Object.entries(BREAKS)) {
    console.log(`  ${key}   [${brk.file.split('/').pop()}]`);
  }
  console.log('\napply one, run `node test/run.mjs`, then revert.');
  console.log('READ THE MESSAGE: npm test hides it. See the header.');
  process.exit(0);
}

if (cmd === 'verify') {
  const stale = [];
  for (const [key, brk] of Object.entries(BREAKS)) {
    for (const [part, spec] of [['find', brk], ['also', brk.also]].filter(([, s]) => s)) {
      const where = spec.file ?? brk.file;
      const source = read(where);
      const crlf = source.includes('\r\n');
      const needle = crlf ? spec.find.replace(/\n/g, '\r\n') : spec.find;
      const at = source.indexOf(needle);
      if (at === -1) stale.push(`${key}.${part} — not found in ${where}`);
      else if (source.indexOf(needle, at + needle.length) !== -1) {
        stale.push(`${key}.${part} — matches more than once in ${where}`);
      }
    }
  }
  if (stale.length) {
    console.error('STALE CONTROLS — each names a site the source no longer has:');
    for (const s of stale) console.error(`  ${s}`);
    process.exit(1);
  }
  console.log(`all ${Object.keys(BREAKS).length} controls still identify exactly one site each`);
  process.exit(0);
}

if (cmd === 'revert') {
  if (!existsSync(STATE)) { console.log('nothing to revert'); process.exit(0); }
  for (const rel of readFileSync(STATE, 'utf8').trim().split('\n').filter(Boolean)) {
    const backup = path.join(ROOT, rel + BACKUP_SUFFIX);
    if (!existsSync(backup)) throw new Error(`the backup for ${rel} is gone — restore it from git`);
    const original = readFileSync(backup, 'utf8');
    write(rel, original);
    unlinkSync(backup);
    console.log(`reverted ${rel} (${original.length} bytes restored)`);
  }
  unlinkSync(STATE);
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

const KNOWN_KEYS = new Set(['file', 'why', 'reddens', 'staysGreen', 'find', 'replace', 'also']);
for (const key of Object.keys(brk)) {
  if (!KNOWN_KEYS.has(key)) {
    console.error(`${name}: unknown key "${key}". A control that declares something this harness `
      + 'does not apply reports a weaker break than it claims.');
    process.exit(2);
  }
}
if (brk.also) {
  for (const key of Object.keys(brk.also)) {
    if (!new Set(['find', 'replace', 'file']).has(key)) {
      console.error(`${name}.also: unknown key "${key}"`);
      process.exit(2);
    }
  }
}

const touched = [brk.file, ...(brk.also ? [brk.also.file ?? brk.file] : [])]
  .filter((f, i, all) => all.indexOf(f) === i);
const originals = new Map(touched.map((rel) => [rel, read(rel)]));

let next = spliceOnce(originals.get(brk.file), brk.find, brk.replace, name);
if (brk.also && (brk.also.file ?? brk.file) === brk.file) {
  next = spliceOnce(next, brk.also.find, brk.also.replace, `${name} (second site)`);
  write(brk.file, next);
} else {
  write(brk.file, next);
  if (brk.also) {
    const rel = brk.also.file;
    write(rel, spliceOnce(read(rel), brk.also.find, brk.also.replace, `${name} (second site)`));
  }
}

for (const rel of touched) writeFileSync(path.join(ROOT, rel + BACKUP_SUFFIX), originals.get(rel), 'utf8');
writeFileSync(STATE, touched.join('\n'), 'utf8');

console.log(`APPLIED: ${name}\n${brk.why}`);
for (const rel of touched) showDiff(rel, originals.get(rel), read(rel));
console.log('\nEXPECTED RED:');
if (brk.reddens.length === 0) console.log('  (nothing — that is the measurement)');
for (const r of brk.reddens) console.log(`  ${r}`);
if (brk.staysGreen) {
  console.log('\nEXPECTED GREEN (this is a measurement, not a gap):');
  for (const g of brk.staysGreen) console.log(`  ${g}`);
}
console.log('\nnow: node test/run.mjs   then: node scripts/_control-round38.mjs revert');
console.log('and READ THE MESSAGE — npm test does not print it.');
