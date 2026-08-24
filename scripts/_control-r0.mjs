/**
 * THE CONTROLS FOR THE PAGE BUILDER CLEANUP ROUND (r0), SECTION 4.
 *
 *   node scripts/_control-r0.mjs list
 *   node scripts/_control-r0.mjs verify
 *   node scripts/_control-r0.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-r0.mjs revert
 *
 * Same harness as rounds 8 and 10-13, deliberately: CRLF handling, `verify`,
 * an unknown-key hard failure, and an `also` that may name a second FILE. It is
 * copied rather than imported because these scripts are read one at a time by
 * whoever is running the break, and a shared harness would put the thing being
 * read one file further away.
 *
 * ══ WHAT SECTION 4 IS GUARDING, AND WHY IT NEEDS A BREAK AT ALL ═════════════
 *
 * `SectionPicker.typeState()` returns `'soon'` — a DISABLED button — for a type
 * with no component in the renderer's REGISTRY. After 2C.2b every declared type
 * has one, so the branch cannot fire, and a branch that cannot fire is the kind
 * of thing a later cleanup deletes on sight. Deleting it makes a schema-only
 * type CLICKABLE.
 *
 * `test/render/sectionTypeCoverage.test.mjs` therefore asserts the unreachability
 * as a MEASUREMENT that retires itself. That is a test whose green state is
 * "nothing is wrong anywhere" — precisely the shape that can be green for the
 * wrong reason — so the four breaks below exist to show it is measuring:
 *
 *   · `schema-only-type` makes the guarded state REAL (a declared type with no
 *     component) and the measurement must go red naming it;
 *   · `soon-branch-deleted` performs the cleanup the comment forbids;
 *   · `comment-pointer-removed` cuts the pointer from the code to the test —
 *     the thing that stops the next reader re-deriving all of this;
 *   · `picker-groups-inlined` cuts the seam: the measurement is about
 *     ALL_SECTION_TYPES, and it only says something about the PICKER while the
 *     picker builds its groups from the same five constants.
 *
 * ══ TWO PREDICTIONS WERE WRONG, AND THEY ARE THE MOST USEFUL LINES HERE ═════
 *
 * ONE, A FALSE ALARM THAT WAS NOT. `schema-only-type` was expected to redden the
 * seam test too — it adds a type to CONTENT_TYPES, and that test compares
 * ALL_SECTION_TYPES against the five category lists. It stays GREEN, and
 * correctly: ALL_SECTION_TYPES is BUILT by concatenating those five arrays, so
 * the two sides move together and always will. That assertion can only catch a
 * category list the concatenation FORGETS, never a type added to one — which is
 * why the `types: <CONST>` source scan beside it is the half doing real work.
 * Recorded because it looked like redundancy and is not.
 *
 * TWO, AND IT CHANGED THE TEST. `schema-only-type` reddened a THIRD assertion
 * nobody predicted: the in-file control that feeds a fake list to the same
 * function. It had been built as `[...ALL_SECTION_TYPES, 'pull_quote']`, so the
 * instant a real schema-only type existed the fixture held two undrawable types
 * and its hardcoded expected answer was wrong. THE CONTROL WAS FAILING WITH THE
 * TEST IT WAS SUPPOSED TO VALIDATE — which is exactly as useful as no control.
 * Fixed at the test, not here: the fixture now derives from
 * RENDERABLE_SECTION_TYPES, so its answer is `['pull_quote']` by construction no
 * matter what the schema does. A control has to be able to stay green while the
 * subject goes red, or it is a second copy of the assertion.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PICKER  = 'src/components/pageBuilder/editor/SectionPicker.jsx';
const CONTENT = 'src/lib/schemas/sections/content.js';

const BREAKS = {
  'schema-only-type': {
    file: CONTENT,
    why: 'Declare a section type with no component — the exact state the "soon" branch exists to survive. `schema_only_probe` joins CONTENT_TYPES, so it validates, appears in the picker, and has nothing in REGISTRY to draw it. This is not a hypothetical shape: it is how EVERY type in this codebase has arrived, schema first (2C.2a and 2C.2b both spent a phase in it).',
    reddens: [
      'render/sectionTypeCoverage › every declared section type has a component — the failure message names schema_only_probe and says the "soon" path is live again, which is the whole point of writing the message that way',
      'render/sectionTypeCoverage › the measurement is not vacuous — the pinned 27 becomes 28. Intentional: the count moving IS the event, and a floor would have let it move silently.',
    ],
    staysGreen: [
      'render/sectionTypeCoverage › the picker displays the five category lists — MEASURED, AND CORRECT, AND IT LOOKED LIKE A GAP. ALL_SECTION_TYPES is the concatenation of those five arrays, so adding to one moves both sides of the deepEqual at once. See the header note: the `types: <CONST>` scan next to it is the half that can fail.',
      'render/registry › RENDERABLE ⊆ schema types — still true; the subset direction is unaffected by a type nothing renders.',
      'render/registry › every renderable type has a label — schema_only_probe is not renderable, so the label sweep never reaches it. That is the same fail-closed reasoning the picker uses, in a different file.',
      'render/sectionTypeCoverage › CONTROL: the same function reddens on a fake list — GREEN ONLY SINCE THE SECOND VERSION OF THAT FIXTURE. It reddened on the first run of this break; see the header. Its staying green now is the measurement that the control is independent of the subject.',
    ],
    find: "export const CONTENT_TYPES = ['heading', 'rich_text', 'image', 'cta', 'checklist', 'notice'];",
    replace: "export const CONTENT_TYPES = ['heading', 'rich_text', 'image', 'cta', 'checklist', 'notice', 'schema_only_probe'];",
  },

  'soon-branch-deleted': {
    file: PICKER,
    why: 'Do the cleanup the comment forbids: `renderable` is true for every type today, so `renderable ? \'add\' : \'soon\'` is provably always `\'add\'` and a reasonable person deletes it. THE CODE STILL WORKS, TODAY, EXACTLY AS BEFORE — which is why only a source guard can catch this. There is no input to the picker that distinguishes the two versions while REGISTRY is complete.',
    reddens: [
      'render/sectionTypeCoverage › the fail-closed "soon" branch is still IN typeState',
    ],
    staysGreen: [
      'render/sectionTypeCoverage › every declared section type has a component — THE MEASUREMENT, AND IT IS THE REASON THIS BREAK IS THE DANGEROUS ONE. The measurement is about the SCHEMA and the REGISTRY; it cannot see the picker at all. A green suite after this edit would be telling the truth about the codebase and nothing about the hole just opened in it.',
      'render/sectionTypeCoverage › the comment at typeState names THIS file — the comment survives the deletion of the code it describes, which is the sixth costume of the same defect and the reason that guard reads `code` and this one does too.',
    ],
    find: "    if (!canUseAdvanced) return 'locked';\n    return renderable ? 'add' : 'soon';\n  }\n  return renderable ? 'add' : 'soon';\n}",
    replace: "    if (!canUseAdvanced) return 'locked';\n    return 'add';\n  }\n  return 'add';\n}",
  },

  'comment-pointer-removed': {
    file: PICKER,
    why: 'Keep the branch, keep the measurement, and cut the thread between them — the comment stops naming the test. Nothing breaks and nothing is unsafe; the next reader simply has no way to learn that the unreachability was measured rather than assumed, and re-derives it or deletes the branch. This is the failure mode the round is actually about.',
    reddens: [
      'render/sectionTypeCoverage › the comment at typeState names THIS file, and CONTROL: that comment is invisible to the code view — the raw half fires, the control half stays satisfied. That split is the point: it separates "the pointer is gone" from "the scrubber changed".',
    ],
    staysGreen: [
      'render/sectionTypeCoverage › every other test in the file — the code is byte-identical in behaviour and in `code` view. Only `raw` moved.',
    ],
    find: '// assumed: test/render/sectionTypeCoverage.test.mjs subtracts',
    replace: '// assumed: a test somewhere subtracts',
  },

  'picker-groups-inlined': {
    file: PICKER,
    why: 'Inline one group\'s types instead of reading the shared constant — the sort of edit that arrives with "the picker should show these in a custom order". The picker now displays a set that is NOT the schema\'s, and the measurement in sectionTypeCoverage goes on subtracting two lists that no longer describe what an author sees.',
    reddens: [
      'render/sectionTypeCoverage › the picker displays the five category lists, which is what ALL_SECTION_TYPES concatenates — the `types: DYNAMIC_TYPES` scan is what fires',
    ],
    staysGreen: [
      'render/sectionTypeCoverage › every declared section type has a component — MEASURED: the schema and the registry are untouched, so the arithmetic is unchanged and correct. It has simply stopped being ABOUT the picker, and the only thing that notices is the source scan. This is defect 7 from sourceScan.mjs\'s header — a guard reading the right text at a place the claim no longer lives — caught by a second guard rather than by luck.',
    ],
    find: "  { title: 'ไดนามิก', types: DYNAMIC_TYPES },",
    replace: "  { title: 'ไดนามิก', types: ['course_selector', 'course_list', 'course_schedule', 'bundle_courses'] },",
  },
};

// ── Apply / revert ──────────────────────────────────────────────────────────

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-r0.state');

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
  console.log('r0 section-4 controls:\n');
  for (const [key, brk] of Object.entries(BREAKS)) {
    console.log(`  ${key}   [${brk.file.split('/').pop()}]`);
  }
  console.log('\napply one, run `node test/run.mjs`, then revert.');
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
      const first = source.indexOf(needle);
      if (first === -1) stale.push(`${key}${part === 'also' ? '.also' : ''}: FIND is gone from ${where}`);
      else if (source.indexOf(needle, first + needle.length) !== -1) {
        stale.push(`${key}${part === 'also' ? '.also' : ''}: FIND matches more than once in ${where}`);
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

// Round 8 earned this: a control that declares a key this harness does not apply
// reports a WEAKER break than it claims, and then "stayed green" is a lie about
// a break that never fully landed.
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

write(brk.file, spliceOnce(originals.get(brk.file), brk.find, brk.replace, name));
if (brk.also) {
  const rel = brk.also.file ?? brk.file;
  write(rel, spliceOnce(read(rel), brk.also.find, brk.also.replace, `${name} (second site)`));
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
console.log('\nnow: node test/run.mjs   then: node scripts/_control-r0.mjs revert');
