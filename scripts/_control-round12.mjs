/**
 * THE CONTROLS FOR ROUND 12's GUARDS — the page heading.
 *
 *   node scripts/_control-round12.mjs list
 *   node scripts/_control-round12.mjs verify
 *   node scripts/_control-round12.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-round12.mjs revert
 *
 * Same harness as _control-round10 and _control-round11, including the CRLF
 * handling, the unknown-key hard failure and `verify`.
 *
 * ══ THE DEFECT HAD TWO CAUSES, SO IT HAS TWO CONTROLS ═══════════════════════
 *
 * The H1 overlapped the chip row above it AND the subtitle below it whenever it
 * wrapped. Two independent mechanisms produced that, and a fix for either one
 * alone leaves the other:
 *
 *   `h1-fixed-height`   the 48px box with `items-center`, which puts 24px of a
 *                       two-line heading above the block and 24px below
 *   `h1-under-the-floor` the 48px line box at 40px — 1.200em against the face's
 *                       own 1.584em — whose ink escapes 4.7px above and 6.7px
 *                       below ON ONE LINE, before anything wraps
 *
 * They are separate breaks on purpose. If one control reddened both assertions,
 * the two assertions would be one assertion wearing two names.
 *
 * ══ AND THREE ARE ABOUT THE FIX NOBODY SHOULD REACH FOR ═════════════════════
 *
 * `h1-truncates`, `h1-max-width` and `h1-nowrap` are the three obvious ways to
 * make a long heading fit by hiding part of it. Each is REJECTED BY RULING —
 * round 6 put a person's name in this heading so a human can identify the
 * record — and each of them passes every geometric assertion in the file, which
 * is exactly why the ruling needs an assertion of its own. Their `staysGreen`
 * lists are the measurement of that.
 *
 * ══ ONE IS A DISCRIMINATION TEST FOR ROUND 11'S OWN FIX ═════════════════════
 *
 * `h1-under-the-floor-table-updated` ships a bad pair AND updates the probe's
 * printed table to agree with it — the diligent version of the regression that
 * `_control-round11.mjs apply leading-under-the-floor` sailed through before the
 * floor test was made to derive its pairs from the exported constants. The floor
 * test must still redden; the table-equality test must stay green. If the floor
 * test goes quiet here, the derivation has come undone and round 11's fix is
 * gone.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SHELL = 'src/app/admin/registrations/_components/detailShell.jsx';
const PROBE = 'scripts/_probe-thai-type-metrics.mjs';

const BREAKS = {
  // ── cause one: the fixed height ──────────────────────────────────────────

  'h1-fixed-height': {
    file: SHELL,
    why: 'Put the 48px box and `items-center` back on the H1 while LEAVING the good line box. A one-line heading is then 64px of content centred in a 48px box — 8px out of each end — and a two-line one is 128px in 48px, so 40px lands on the chip row and 40px on the subtitle. The class is a complete literal and compiles; nothing about the markup reads as wrong.',
    reddens: [
      'render/registrationTypeScale › the H1 declares NO fixed height — a second line has somewhere to go',
      'fs/tailwindArbitraryValueRules › the measured geometry really is in the harvest, not merely a large count',
    ],
    staysGreen: [
      'render/registrationTypeScale › every type pair this round ships clears LINE Seed Sans TH’s own line box — THE MEASUREMENT: the LINE BOX is untouched, so the floor test cannot see this at all. That is why the two causes have two assertions rather than one.',
      'render/registrationTypeScale › the heading WRAPS — it is not truncated, clamped or held to a width — nothing here hides text; it overflows instead, which no class name reveals.',
    ],
    find: "      <h1 className={cn('break-words text-[var(--text-primary)]', DETAIL_PAGE_HEADING)}>",
    replace: "      <h1 className={cn('flex h-[48px] items-center break-words text-[var(--text-primary)]', DETAIL_PAGE_HEADING)}>",
  },

  // ── cause two: the line box ──────────────────────────────────────────────

  'h1-under-the-floor': {
    file: SHELL,
    why: 'Put the 48px LINE BOX back at 40px — 1.200em against the face’s 1.584em floor. Half-leading goes to −7.7px and the ink escapes its own line box by 4.7px at the top and 6.7px at the bottom, ON ONE LINE, into the 25px blocks hard against it. Nothing wraps, nothing overflows a container, and no markup assertion anywhere can see it.',
    reddens: [
      'render/registrationTypeScale › the sizes under test are the ones this file names',
      'render/registrationTypeScale › the page heading carries the one shared heading class, on BOTH screens',
      'render/registrationTypeScale › every type pair this round ships clears LINE Seed Sans TH’s own line box',
      'render/registrationTypeScale › the probe’s printed table IS the scale the components ship',
      'render/registrationTypeScale › the page heading is a literal in exactly ONE place, like the other three',
      'fs/tailwindArbitraryValueRules › the measured geometry really is in the harvest, not merely a large count',
    ],
    staysGreen: [
      'render/registrationTypeScale › the H1 declares NO fixed height — the block still grows with its lines. The other half of the defect, untouched, which is what makes these two controls a pair rather than a duplicate.',
      'render/registrationTypeScale › …and clears the ink extremes too — 48px still clears the 59.4px ink? NO: check the run. If this one DOES redden, the ink and floor checks agree here and only disagree at the margin — see round 11’s note.',
    ],
    find: "export const DETAIL_PAGE_HEADING = 'text-[40px] font-bold leading-[64px]';",
    replace: "export const DETAIL_PAGE_HEADING = 'text-[40px] font-bold leading-[48px]';",
  },

  'h1-under-the-floor-table-updated': {
    file: SHELL,
    why: 'THE DISCRIMINATION TEST FOR ROUND 11’S OWN FIX. Ship the same bad pair AND update the probe’s printed table to agree with it — the diligent version, where the instrument and the code are consistent and both wrong. Before round 11 derived the floor test’s pairs from the exported constants, this shape passed the whole suite. The floor test MUST still redden.',
    reddens: [
      'render/registrationTypeScale › the sizes under test are the ones this file names',
      'render/registrationTypeScale › the page heading carries the one shared heading class, on BOTH screens',
      'render/registrationTypeScale › every type pair this round ships clears LINE Seed Sans TH’s own line box',
      'render/registrationTypeScale › the page heading is a literal in exactly ONE place, like the other three',
      'fs/tailwindArbitraryValueRules › the measured geometry really is in the harvest, not merely a large count',
    ],
    staysGreen: [
      'render/registrationTypeScale › the probe’s printed table IS the scale the components ship — THE MEASUREMENT, AND THE WHOLE POINT: the table now agrees with the code, so the sync check is silent. If the FLOOR test were still reading that table, this break would be invisible and the suite would be green over a shipped regression. It reddens because round 11 made it derive.',
    ],
    find: "export const DETAIL_PAGE_HEADING = 'text-[40px] font-bold leading-[64px]';",
    replace: "export const DETAIL_PAGE_HEADING = 'text-[40px] font-bold leading-[48px]';",
    also: {
      find: "  ['page heading', 40, 64],",
      replace: "  ['page heading', 40, 48],",
      file: PROBE,
    },
  },

  // ── the fixes that hide the name ─────────────────────────────────────────

  'h1-truncates': {
    file: SHELL,
    why: 'Truncate the heading — the first thing anyone reaches for when a title collides. It removes the overlap completely and it defeats the reason the heading exists: round 6 put the coordinator’s name here, and moved the reference number out, so a human can identify the record at a glance. An ellipsis on `ข้อมูลการลงทะเบียน : สมชาย ใจ…` identifies nothing.',
    reddens: [
      'render/registrationTypeScale › the heading WRAPS — it is not truncated, clamped or held to a width',
    ],
    staysGreen: [
      'render/registrationTypeScale › the H1 declares NO fixed height — THE MEASUREMENT: truncating passes EVERY geometric assertion in the file. No height, correct line box, correct size, correct class. The ruling is the only thing standing between this page and a heading nobody can read, and it needs an assertion of its own because nothing else can see it.',
      'render/registrationTypeScale › every type pair this round ships clears LINE Seed Sans TH’s own line box',
      'render/registrationTypeScale › the page heading carries the one shared heading class, on BOTH screens',
    ],
    find: "      <h1 className={cn('break-words text-[var(--text-primary)]', DETAIL_PAGE_HEADING)}>",
    replace: "      <h1 className={cn('truncate text-[var(--text-primary)]', DETAIL_PAGE_HEADING)}>",
  },

  'h1-max-width': {
    file: SHELL,
    why: 'Cap the heading’s width instead. Softer than truncating and worse in one way: the text does not disappear, it wraps EARLIER and at every viewport, so the collision this round fixed would have been made permanent rather than removed.',
    reddens: [
      'render/registrationTypeScale › the heading WRAPS — it is not truncated, clamped or held to a width',
    ],
    find: "      <h1 className={cn('break-words text-[var(--text-primary)]', DETAIL_PAGE_HEADING)}>",
    replace: "      <h1 className={cn('max-w-[520px] break-words text-[var(--text-primary)]', DETAIL_PAGE_HEADING)}>",
  },

  'h1-nowrap': {
    file: SHELL,
    why: 'Forbid wrapping outright. The heading then runs off the side of the page at any width a name does not fit — 530px of heading in 327px of content at a 375px viewport — which is worse than the overlap it replaces and looks like nothing at all until someone scrolls sideways.',
    reddens: [
      'render/registrationTypeScale › the heading WRAPS — it is not truncated, clamped or held to a width',
    ],
    find: "      <h1 className={cn('break-words text-[var(--text-primary)]', DETAIL_PAGE_HEADING)}>",
    replace: "      <h1 className={cn('whitespace-nowrap text-[var(--text-primary)]', DETAIL_PAGE_HEADING)}>",
  },

  'break-words-dropped': {
    file: SHELL,
    why: 'Drop the unbreakable-Thai backstop. Thai has no spaces, so a browser with no Thai line-breaking dictionary cannot break `ข้อมูลการลงทะเบียน` at any point — and that label ALONE is 323px at 40px against 327px of content width at a 375px viewport. Wrapping is not enough on its own; there has to be somewhere to wrap.',
    reddens: [
      'render/registrationTypeScale › the heading WRAPS — it is not truncated, clamped or held to a width',
    ],
    find: "      <h1 className={cn('break-words text-[var(--text-primary)]', DETAIL_PAGE_HEADING)}>",
    replace: "      <h1 className={cn('text-[var(--text-primary)]', DETAIL_PAGE_HEADING)}>",
  },

  // ── the collision was reachable from below, too ──────────────────────────

  'subtitle-fixed-height': {
    file: SHELL,
    why: 'Put `h-[25px]` back on the subtitle. A course name that wraps is 42px of content in a 25px box, so `items-center` pushes 8.5px UP — into the heading — and 8.5px down. Hardening only the H1 leaves the overlap reachable from underneath it, which is the shape of a fix that assumed one cause.',
    reddens: [
      'render/registrationTypeScale › the H1’s two neighbours cannot clip either — min-h, not h',
      'fs/tailwindArbitraryValueRules › the measured geometry really is in the harvest, not merely a large count',
    ],
    staysGreen: [
      'render/registrationTypeScale › the H1 declares NO fixed height — THE MEASUREMENT: the H1 is untouched, so every assertion about the H1 is silent. The neighbours needed their own assertion for exactly this reason.',
    ],
    find: '        <p className="flex min-h-[25px] items-center text-[14px] leading-[21px] text-[var(--text-secondary)]">',
    replace: '        <p className="flex h-[25px] items-center text-[14px] leading-[21px] text-[var(--text-secondary)]">',
  },

  'chip-row-fixed-height': {
    file: SHELL,
    why: 'Put `h-[25px]` back on the chip row. The timestamp is an ordinary wrapping span in a flex row; at a narrow width it takes two lines and overflows the box downward, INTO the heading. The other direction of the same defect.',
    reddens: [
      'render/registrationTypeScale › the H1’s two neighbours cannot clip either — min-h, not h',
      'fs/tailwindArbitraryValueRules › the measured geometry really is in the harvest, not merely a large count',
    ],
    find: '      <div className="flex min-h-[25px] items-center gap-[10px]">',
    replace: '      <div className="flex h-[25px] items-center gap-[10px]">',
  },

  'chip-loses-its-height': {
    file: SHELL,
    why: 'THE OPPOSITE DIRECTION, and it must NOT redden the neighbours assertion. `TypeBadge` keeps a FIXED 25px on purpose — it is a pill with `whitespace-nowrap` that can never wrap — so a guard that banned every `h-[…]` in this file would be voting against a correct fixed height. Converting it to `min-h-` changes nothing visible and nothing should notice.',
    reddens: [],
    staysGreen: [
      'render/registrationTypeScale › the H1’s two neighbours cannot clip either — THE MEASUREMENT: the assertion is scoped to `DetailHeader`, and its own control asserts that `TypeBadge` still fixes its height. Nothing here claims a fixed height is always wrong — only that a block which can wrap must not have one.',
    ],
    find: "        'inline-flex h-[25px] w-fit items-center whitespace-nowrap rounded-full px-[10px] text-[11px] font-semibold',",
    replace: "        'inline-flex min-h-[25px] w-fit items-center whitespace-nowrap rounded-full px-[10px] text-[11px] font-semibold',",
  },

  'twmerge-order-flipped': {
    file: SHELL,
    why: 'Put the constant FIRST and the colour token second, so twMerge resolves them in the other order. `text-[var(--text-primary)]` and `text-[40px]` are the ambiguous size-or-colour pair the standing rule is about; if twMerge classified the token as a SIZE it would drop the 40px, the markup would look sane, and the heading would render at the inherited size. NOTHING SHOULD REDDEN — if something does, the order is load-bearing and needs a comment saying so.',
    reddens: [],
    staysGreen: [
      'render/registrationTypeScale › CONTROL: twMerge did NOT eat the size against the colour token — THE MEASUREMENT: twMerge classifies the arbitrary value, not the position, so both survive in either order. That is worth knowing rather than assuming, because the suite has been bitten by twMerge resolving a pair it was not expected to.',
    ],
    find: "      <h1 className={cn('break-words text-[var(--text-primary)]', DETAIL_PAGE_HEADING)}>",
    replace: "      <h1 className={cn(DETAIL_PAGE_HEADING, 'break-words text-[var(--text-primary)]')}>",
  },
};

// ── Apply / revert ──────────────────────────────────────────────────────────

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-round12.state');

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
  console.log('Round 12 controls:\n');
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
    for (const [part, spec] of [['find', brk], ['also', brk.also]].filter(([, s]) => s)) {
      const source = read(spec.file ?? brk.file);
      const crlf = source.includes('\r\n');
      const needle = crlf ? spec.find.replace(/\n/g, '\r\n') : spec.find;
      const first = source.indexOf(needle);
      const where = spec.file ?? brk.file;
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
  const rels = readFileSync(STATE, 'utf8').trim().split('\n').filter(Boolean);
  for (const rel of rels) {
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

// `also` MAY name a second FILE — round 12's discrimination test edits the probe
// script as well as the component, and a backup of one file only would leave the
// other broken after `revert`.
const touched = [brk.file, ...(brk.also ? [brk.also.file ?? brk.file] : [])]
  .filter((f, i, all) => all.indexOf(f) === i);
const originals = new Map(touched.map((rel) => [rel, read(rel)]));

let after = spliceOnce(originals.get(brk.file), brk.find, brk.replace, name);
write(brk.file, after);
if (brk.also) {
  const rel = brk.also.file ?? brk.file;
  const base = rel === brk.file ? after : originals.get(rel);
  const second = spliceOnce(base, brk.also.find, brk.also.replace, `${name} (second site)`);
  write(rel, second);
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
console.log('\nnow: node test/run.mjs   then: node scripts/_control-round12.mjs revert');
