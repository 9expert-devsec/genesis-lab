/**
 * THE CONTROLS FOR THE MENU-CLIP GUARDS.
 *
 * A guard nobody has watched go red is a guard nobody has tested. This applies a
 * NAMED BREAK to the real source, prints the diff that landed so the edit can be
 * seen rather than trusted, and puts it back.
 *
 *   node scripts/_control-menu-clip.mjs list
 *   node scripts/_control-menu-clip.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-menu-clip.mjs revert
 *
 * Same harness as scripts/_control-round8.mjs, for the same reasons: a hand edit
 * is not reproducible and is not reliably undone, and a control left in the tree
 * is a defect committed on purpose.
 *
 * ── SOME OF THESE ARE EXPECTED TO STAY GREEN, AND THAT IS THE POINT ────────
 * This defect is a LAYOUT one and the tiers available here can see only part of
 * it. `staysGreen` names the breaks that reproduce the original bug and are NOT
 * caught — the flip removed, the reposition removed, Esc removed. Recording them
 * is the honest alternative to writing an assertion that looks like coverage.
 * Each one names what a human has to check instead.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SHELL = 'src/app/admin/registrations/_components/detailShell.jsx';
const FILTERS = 'src/app/admin/registrations/_components/FilterPanel.jsx';
const ANCHOR = 'src/lib/anchoredMenu.js';
const CARD = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';

const BREAKS = {
  /* ── The escape itself ─────────────────────────────────────────────────── */

  unfix: {
    file: SHELL,
    why: 'Put the row menu back to `absolute` — the exact positioning that shipped the defect.',
    reddens: [
      'render/menuEscapesClip › every floating sheet compiles to `position: fixed`',
    ],
    find: "        className=\"fixed z-50 w-[200px] overflow-y-auto",
    replace: "        className=\"absolute right-0 z-50 w-[200px] overflow-y-auto",
  },

  'static-offset': {
    file: SHELL,
    why: 'Reintroduce the hardcoded downward offset alongside the measured one. Specificity then decides where the sheet lands, which is a coin toss nobody notices until a row near the fold.',
    reddens: [
      'render/menuEscapesClip › the sheets carry NO class that compiles to a top or bottom offset',
    ],
    find: "        className=\"fixed z-50 w-[200px]",
    replace: "        className=\"fixed top-[30px] z-50 w-[200px]",
  },

  'trap-fixed': {
    file: CARD,
    why: 'Add a hover lift to the roster card. `transform` makes it the containing block for fixed descendants, so `fixed` behaves like `absolute` again and the clip comes straight back — with no build error and nothing on screen to say why. THE most likely way this fix gets silently undone.',
    reddens: [
      'render/menuEscapesClip › no ancestor of any sheet establishes a containing block for fixed descendants',
    ],
    find: '                <AttendeeRowMenu',
    replace: '                <AttendeeRowMenu',
    also: {
      find: "            <tr key={i} className=\"h-[48.3px] border-b",
      replace: "            <tr key={i} className=\"scale-100 hover:scale-105 h-[48.3px] border-b",
    },
  },

  'clamp-hides': {
    file: SHELL,
    why: 'Clamp the sheet with maxHeight but clip instead of scrolling — items below the fold traded for items below the fold.',
    reddens: [
      'render/menuEscapesClip › the clamped sheet can actually scroll, so maxHeight does not hide items',
    ],
    find: 'w-[200px] overflow-y-auto overscroll-contain rounded-9e-md',
    replace: 'w-[200px] overflow-hidden rounded-9e-md',
  },

  'unclip-listpanel': {
    file: 'src/app/admin/registrations/_components/ListPanel.jsx',
    why: 'Drop ListPanel\'s clip — the "fix" that would make the ตัวกรอง panel escape by breaking the table\'s corners instead. This is the wrong fix, and the guard names it as such.',
    reddens: [
      'render/menuEscapesClip › the ตัวกรอง panel DOES have a real overflow-hidden ancestor, and it is ListPanel',
    ],
    find: '    <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">',
    replace: '    <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">',
  },

  'unfix-filters': {
    file: FILTERS,
    why: 'Put the ตัวกรอง panel back inside ListPanel\'s clip.',
    reddens: [
      'render/menuEscapesClip › every floating sheet compiles to `position: fixed`',
      'render/menuEscapesClip › the walk is balanced — every claim below about depth depends on it',
    ],
    find: '        className="fixed z-40 w-[340px]',
    replace: '        className="absolute right-0 top-[45px] z-40 w-[340px]',
  },

  /* ── The arithmetic ────────────────────────────────────────────────────── */

  'never-flip': {
    file: ANCHOR,
    why: 'Never flip. The sheet escapes the clip and then hangs off the bottom of the VIEWPORT instead — the same defect one box outward, which is what requirement (1) is about.',
    reddens: [
      'pure/anchoredMenu › with no room below, the sheet opens UPWARD — this is the defect',
      'pure/anchoredMenu › when NOTHING fits, it picks the roomier side rather than flipping blindly',
      'pure/anchoredMenu › maxHeight is the room actually available, on BOTH placements',
      'pure/anchoredMenu › a sheet taller than either side is CLAMPED, not left hanging off the viewport',
      'pure/anchoredMenu › the flip is an EDGE, not a subtracted height',
      'pure/anchoredMenu › CONTROL: the fixtures really do straddle the flip',
    ],
    find: '  const above = height > roomBelow && roomAbove > roomBelow;',
    replace: '  const above = false;',
  },

  'flip-blindly': {
    file: ANCHOR,
    why: 'Flip whenever it does not fit below, without checking whether above is any better. On a short viewport this picks the worse of the two placements every time.',
    reddens: [
      'pure/anchoredMenu › when NOTHING fits, it picks the roomier side rather than flipping blindly',
    ],
    find: '  const above = height > roomBelow && roomAbove > roomBelow;',
    replace: '  const above = height > roomBelow;',
  },

  'flip-on-tie': {
    file: ANCHOR,
    why: 'Flip on equal room. A trigger at the midpoint of a window being resized then jitters between placements.',
    reddens: [
      'pure/anchoredMenu › ties keep the sheet BELOW — a flip needs a strictly better reason',
    ],
    find: '  const above = height > roomBelow && roomAbove > roomBelow;',
    replace: '  const above = height > roomBelow && roomAbove >= roomBelow;',
  },

  'top-not-edge': {
    file: ANCHOR,
    why: 'Place the flipped sheet by its TOP edge, subtracting the height. Identical when the sheet renders at the height it was measured at — and catastrophic when maxHeight clamps it, which flings the whole sheet above the window.',
    reddens: [
      'pure/anchoredMenu › the flip is an EDGE, not a subtracted height — clamping cannot fling the sheet away',
      'pure/anchoredMenu › with no room below, the sheet opens UPWARD — this is the defect',
      'pure/anchoredMenu › a sheet taller than either side is CLAMPED, not left hanging off the viewport',
    ],
    find: '        bottom: viewport.height - trigger.top + gap,',
    replace: '        top: trigger.top - gap - height,',
  },

  'no-clamp': {
    file: ANCHOR,
    why: 'Drop the non-negative clamps on the two rooms. On a viewport shorter than its own trigger this returns `max-height: -5px`, the browser drops the declaration, and the one case where clamping mattered most silently does nothing.',
    reddens: [
      'pure/anchoredMenu › a viewport too small for its own trigger still yields a non-negative maxHeight',
    ],
    find: '  const roomBelow = Math.max(viewport.height - trigger.bottom - gap - margin, 0);\n  const roomAbove = Math.max(trigger.top - gap - margin, 0);',
    replace: '  const roomBelow = viewport.height - trigger.bottom - gap - margin;\n  const roomAbove = trigger.top - gap - margin;',
  },

  'no-refusal': {
    file: ANCHOR,
    why: 'Answer an unusable measurement instead of refusing it. A single NaN frame during a flick then places the sheet at NaN and it disappears.',
    reddens: [
      'pure/anchoredMenu › an unusable measurement is REFUSED with null rather than guessed at',
    ],
    find: '  if (!nums.every((n) => Number.isFinite(n))) return null;',
    replace: '  if (false) return null;',
  },

  'unclamped-right': {
    file: ANCHOR,
    why: 'Let the right offset go negative. A trigger at or past the window edge — a narrow window, a sidebar mid-collapse — then pushes the sheet outside it.',
    reddens: [
      'pure/anchoredMenu › a trigger at or past the right edge cannot push the sheet off it',
    ],
    find: '  const right = Math.max(viewport.width - trigger.right, margin);',
    replace: '  const right = viewport.width - trigger.right;',
  },

  /* ── The instrument itself ─────────────────────────────────────────────── */

  'blind-walk': {
    file: 'test/render/menuEscapesClip.test.mjs',
    why: 'Put the SVG leaf tags back into VOID — the exact bug the probe this test grew out of shipped. Every `</path>` then pops somebody else\'s element, the chains come back three deep, and "no clipping ancestor" is true because the walk cannot see any ancestors at all. A green answer from a broken instrument.',
    reddens: [
      'render/menuEscapesClip › the walk is balanced — every claim below about depth depends on it',
    ],
    find: "  'source', 'area', 'base', 'embed', 'track', 'wbr', 'param',",
    replace: "  'source', 'area', 'base', 'embed', 'track', 'wbr', 'param', 'path', 'rect', 'circle', 'line',",
  },
};

/**
 * BREAKS THAT REPRODUCE THE DEFECT AND ARE NOT CAUGHT.
 *
 * Not a list of excuses — a list of what a human must check, derived by
 * actually applying each one and watching the suite stay green. Every entry
 * here is a real regression that this repo's tiers cannot see, because seeing
 * it requires a viewport, a pointer or a keyboard.
 */
const UNCAUGHT = {
  'no-reposition': {
    file: SHELL,
    why: 'Remove the scroll/resize listeners. The fixed sheet then stays put while its row scrolls away underneath it.',
    check: 'Open a row menu, scroll <main> with the wheel. The sheet must follow its row.',
    find: "    window.addEventListener('scroll', place, true);\n    window.addEventListener('resize', place);",
    replace: '',
  },
  'no-esc': {
    file: SHELL,
    why: 'Remove the Escape handler.',
    check: 'Open a row menu, press Esc. It must close and focus must return to the "•••".',
    find: "      if (event.key !== 'Escape') return;",
    replace: '      if (event.key !== \'Escape\') return;\n      return;',
  },
  'no-focus-return': {
    file: SHELL,
    why: 'Remove the focus return on close.',
    check: 'Open a row menu with the keyboard, dismiss it three ways (Esc, outside click, choosing an item). Focus must land on the "•••" each time.',
    find: '    if (active === document.body || menu.contains(active)) triggerRef.current?.focus();',
    replace: '',
  },
  'bubble-capture': {
    file: SHELL,
    why: 'Drop `capture: true` from the scroll listener. `<main>` scrolls, window does not, so the listener never fires — and this is invisible in every tier here.',
    check: 'Same as no-reposition: the sheet must follow its row when <main> scrolls.',
    find: "    window.addEventListener('scroll', place, true);",
    replace: "    window.addEventListener('scroll', place);",
  },
};

// ── Apply / revert ──────────────────────────────────────────────────────────

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-menu-clip.state');

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

const ALL = { ...BREAKS, ...UNCAUGHT };

const [, , cmd, name] = process.argv;

if (!cmd || cmd === 'list') {
  console.log('CAUGHT — these reproduce the defect and a test goes red:\n');
  for (const [key, brk] of Object.entries(BREAKS)) {
    console.log(`  ${key}`);
    console.log(`      ${brk.why}`);
    for (const r of brk.reddens) console.log(`      red: ${r}`);
    console.log('');
  }
  console.log('UNCAUGHT — these reproduce the defect and the suite stays GREEN.');
  console.log('Applied and verified silent; each names what a human must check instead.\n');
  for (const [key, brk] of Object.entries(UNCAUGHT)) {
    console.log(`  ${key}`);
    console.log(`      ${brk.why}`);
    console.log(`      human: ${brk.check}`);
    console.log('');
  }
  process.exit(0);
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

if (cmd !== 'apply' || !ALL[name]) {
  console.error(`unknown break "${name ?? ''}" — run \`list\``);
  process.exit(2);
}
if (existsSync(STATE)) {
  console.error('a control is already applied — revert it before applying another');
  process.exit(2);
}

const brk = ALL[name];

/** Every key must be known — see the note in _control-round8. */
const KNOWN_KEYS = new Set(['file', 'why', 'reddens', 'check', 'find', 'replace', 'also']);
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
if (brk.reddens) {
  console.log('\nEXPECTED RED:');
  for (const r of brk.reddens) console.log(`  ${r}`);
} else {
  console.log('\nEXPECTED GREEN — this break is NOT caught by any tier.');
  console.log(`  human: ${brk.check}`);
}
console.log('\nnow: node test/run.mjs   then: node scripts/_control-menu-clip.mjs revert');
