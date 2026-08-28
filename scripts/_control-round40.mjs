/**
 * THE CONTROLS FOR ROUND 40 — the card row and the drag rework.
 *
 *   node scripts/_control-round40.mjs list
 *   node scripts/_control-round40.mjs verify
 *   node scripts/_control-round40.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-round40.mjs revert
 *
 * Same harness as rounds 8, 10-13, 38, 39 and _control-r0: CRLF-preserving
 * splice, `verify`, an unknown-key hard failure, revert from a byte copy.
 *
 * ══ READ THE MESSAGE, NOT THE COLOUR ════════════════════════════════════════
 * `npm test` SWALLOWS failure messages, so red-vs-green alone cannot tell a
 * guard that fired for the right reason from one that fired because the break
 * broke something else. Every break records the assertion TEXT it produced.
 *
 * ══ WHY THESE FIVE ══════════════════════════════════════════════════════════
 * Round 40's two most fragile claims are both NEGATIVE — "the four buttons
 * survived" and "the keyboard path still works" — and round 29 warned the
 * second "would be invisible in review because the mouse path improves
 * simultaneously". Those get a break each. So does the drop target, whose whole
 * justification is a case (an expanded container) that a collapsed default
 * never renders.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PANEL = 'src/components/pageBuilder/editor/StructurePanel.jsx';
const HOOK  = 'src/components/pageBuilder/editor/useTreeDrag.js';

const BREAKS = {
  'drop-target-back-on-the-card': {
    file: PANEL,
    why: 'Put the drop target back on the card, which is where it was before this round. '
      + 'The indicator then draws at the top of a 54px card that may be sitting above 300px '
      + 'of open drawer, pointing at a boundary the drop would not land on. Invisible on a '
      + 'collapsed page, which is every page by default — so the case that exposes it is the '
      + 'one a default render never reaches.',
    reddens: [
      'render/structureDragTarget > the DRAG SOURCE is the card and the DROP TARGET is the <li>',
    ],
    staysGreen: [
      'every collapsed-page case, and every keyboard case — the defect is confined to an '
        + 'expanded container, which is why the fixture that finds it has to be seeded open.',
    ],
    find: `    <li
      {...getDropTargetProps(path)}`,
    replace: `    <li
      {...{}}`,
  },

  'keyboard-path-removed': {
    file: PANEL,
    why: 'Take the up/down buttons out of the tab order with tabindex="-1". The mouse path '
      + 'is untouched and the buttons still LOOK identical — round 29 named exactly this: the '
      + 'loss "would be invisible in review because the mouse path improves simultaneously". '
      + 'Round 25 chose buttons over drag because native HTML5 drag has no keyboard path, so '
      + 'this is that decision being silently reversed.',
    reddens: [
      'render/structureDragTarget > the reorder buttons are real, focusable buttons with no tabindex escape',
    ],
    staysGreen: [
      'render/structureDragTarget > ACTIVATION REORDERS — the reducer still reorders '
        + 'perfectly. Reachability and behaviour are different claims and only one of them '
        + 'broke, which is why both are asserted.',
    ],
    find: `      type="button"
      title={label}
      aria-label={label}`,
    replace: `      type="button"
      tabIndex={-1}
      title={label}
      aria-label={label}`,
  },

  'an-action-button-deleted': {
    file: PANEL,
    why: 'Delete the ทำซ้ำ button — the concession round 29\'s design makes to afford a drag '
      + 'handle, and the one round 29\'s own verdict refused. It frees 24px, so every '
      + 'measurement improves and nothing looks broken.',
    reddens: [
      'render/structureRowCard > every card keeps the four action buttons AND the eye',
      'render/structureRowLines > the row still holds one leading icon, the label, and the same six controls',
    ],
    staysGreen: [
      'every layout and fit measurement — they get BETTER. That is the shape of this defect: '
        + 'the number a reviewer would look at moves the right way.',
    ],
    find: `          <IconButton label="ทำซ้ำ" onClick={() => dispatch({ type: 'DUPLICATE_SECTION', path })}>
            <Copy className="h-4 w-4" />
          </IconButton>`,
    replace: '',
  },

  'the-tile-takes-the-designs-29px': {
    file: PANEL,
    why: 'Give the tile the drawn 29x29 instead of the 24x24 this round measured it down to. '
      + 'It matches the design exactly and costs five pixels of a nested label that has '
      + '14.38px to give — and it puts tiles and disclosure chevrons on different left edges, '
      + 'which is the "two lists interleaved" reading round 32 built the shared column to stop.',
    reddens: [
      'render/structureRowCollapse > the leading column is one box wide whether it holds an icon or a disclosure',
    ],
    staysGreen: [
      'every card-shape case — the tile is still a tile, still rounded, still holds one '
        + 'glyph. Only its width moved, and only a measurement or an alignment check sees it.',
    ],
    find: `              'flex h-6 w-6 shrink-0 items-center justify-center rounded-9e-sm',`,
    replace: `              'flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-9e-sm',`,
  },

  'the-badge-sums-across-slots': {
    file: PANEL,
    why: 'Make the drawer badge count the whole container rather than its own slot. A '
      + 'two_column holding 2 and 2 then reads 4 on BOTH drawers — describing one list of '
      + 'four sitting where two lists are, which is the sum round 16 refused and which '
      + 'contradicts the two labelled slot lists drawn directly underneath.',
    reddens: [
      'render/structureRowCard > a two_column drawer names BOTH slots and never sums them',
    ],
    staysGreen: [
      'render/structureRowCard > an open single-slot container heads its drawer and counts it '
        + '— a container with one slot cannot tell the two apart, which is why the guard needs '
        + 'a two_column fixture and not just any container.',
    ],
    find: '                {kids.length}',
    replace: '                {(slots ?? []).reduce((n, s2) => n + (section?.content?.[s2]?.length ?? 0), 0)}',
  },
};

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-round40.state');

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
  console.log('Round 40 controls:\n');
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
console.log('\nnow: node test/run.mjs   then: node scripts/_control-round40.mjs revert');
console.log('and READ THE MESSAGE — npm test does not print it.');
