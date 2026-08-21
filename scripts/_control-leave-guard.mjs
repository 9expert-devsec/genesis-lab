/**
 * THE CONTROLS FOR THE PAGE BUILDER LEAVE GATE.
 *
 *   node scripts/_control-leave-guard.mjs list
 *   node scripts/_control-leave-guard.mjs verify
 *   node scripts/_control-leave-guard.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-leave-guard.mjs revert
 *
 * Same harness as rounds 8 and 10-13 and _control-r0: CRLF handling, `verify`,
 * an unknown-key hard failure, and an `also` that may name a second FILE.
 *
 * ══ READ THE MESSAGE, NOT THE COLOUR ════════════════════════════════════════
 *
 * `npm test` in this repo SWALLOWS failure messages — test/run.mjs calls
 * process.exit() in its close handler before the spec reporter flushes the
 * "failing tests" block, so a red run prints `✖ <name>` and nothing else. That
 * is a known open defect and is NOT fixed here.
 *
 * The consequence is load-bearing for these controls: red-vs-green alone cannot
 * distinguish a guard that fired for the right reason from one that fired
 * because the break happened to break something else. So every break below
 * records the assertion TEXT that came out, read by running the single file
 * through a harness without the exit. If you re-run these, do the same.
 *
 * ══ WHAT THESE CAN AND CANNOT SHOW ══════════════════════════════════════════
 *
 * They show that the WIRING guards fire — that the suite notices when an exit
 * stops being registered, when the shared predicate stops being consulted, when
 * the click handler loses an exclusion, or when the sentinel repair goes away.
 *
 * They show NOTHING about whether Back actually works in a browser. Nothing
 * here can: jsdom has no session history, and a fake one would be the thing
 * under test. The behaviour rests on a human click-test, and the round is
 * reported that way.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const HOOK   = 'src/components/pageBuilder/editor/useLeaveGuard.js';
const SHELL  = 'src/components/pageBuilder/editor/EditorShell.jsx';
const DIALOG = 'src/components/pageBuilder/editor/LeaveConfirmDialog.jsx';
const PURE   = 'src/lib/pageBuilder/leaveGuard.js';

const BREAKS = {
  'popstate-unregistered': {
    file: HOOK,
    why: 'Remove the popstate listener — i.e. put the confirmed bug back exactly as it was. The editor keeps beforeunload, so tab close and reload still ask and everything LOOKS guarded; only the browser Back button walks out silently, and on /builder/new it takes the entire draft because autosave never runs there.',
    reddens: [
      'fs/pageBuilderLeaveGuard › the hook registers all three exits',
    ],
    staysGreen: [
      'pure/leaveGuard › every test — THE MEASUREMENT, and it is the reason the fs file exists. The decision module is untouched and perfectly correct; the bug was never in WHEN to block, only in whether anything asked. A suite with the pure tests alone would have been fully green across the entire defect.',
      'fs/pageBuilderLeaveGuard › everything else — the predicate is still consulted, the click handler is intact, the dialog is unchanged. One exit going missing is a one-assertion failure, which is what makes the three-exit assertion worth writing as three.',
    ],
    find: "    window.addEventListener('popstate', onPopState);\n    return () => window.removeEventListener('popstate', onPopState);",
    replace: '    return undefined;',
  },

  'predicate-inlined': {
    file: HOOK,
    why: 'Stop asking the shared module and restate the rule in the hook — `!dirty && !conflict`, the pre-change condition, which is what someone writes when they want to "drop a dependency". It reads as a simplification and it silently drops `saving` and re-creates the two-copies-of-one-rule shape that let the third exit be forgotten in the first place.',
    reddens: [
      'fs/pageBuilderLeaveGuard › the hook imports the shared decision and does not restate it',
    ],
    staysGreen: [
      'pure/leaveGuard › every test — the module still exports the right answer to nobody.',
      'fs/pageBuilderLeaveGuard › the hook registers all three exits — all three listeners are still there, still wrong together. Registration and CORRECTNESS are separate claims and this break is why they are separate assertions.',
    ],
    find: "  const reason = leaveBlockReason(state);\n  const blocked = shouldBlockLeave(state);",
    replace: "  const reason = state?.conflict ? 'conflict' : 'dirty';\n  const blocked = Boolean(state?.dirty) && !state?.conflict;",
  },

  'canvas-exclusion-dropped': {
    file: HOOK,
    why: 'Drop the `data-pb-canvas` check from the link handler. This is the break most likely to ship for real, because it looks like dead weight: the canvas has its own capture handler, so why check twice? Because a document-level CAPTURE listener runs FIRST — before the canvas ever sees the event — so every click on a link inside a rendered section stops selecting that section and opens a "leave without saving?" dialog instead. The editor\'s main interaction, broken by a guard.',
    reddens: [
      'fs/pageBuilderLeaveGuard › the capture-phase click handler excludes everything that is not a departure',
    ],
    staysGreen: [
      'fs/pageBuilderLeaveGuard › CONTROL: that sweep rejects a naive handler — the control literal is unchanged, so it must go on failing the sweep. If it started passing, the sweep had stopped discriminating.',
      'render/* › every canvas test — MEASURED: the canvas renders identically and no render test clicks anything. This defect is entirely in event-listener ORDER at runtime, which is exactly the class this suite cannot reach.',
    ],
    find: "      // The canvas owns its own clicks — see the note above.\n      if (a.closest('[data-pb-canvas]')) return;",
    replace: '',
  },

  'sentinel-repair-removed': {
    file: HOOK,
    why: "Remove the re-stamp branch. The sentinel is still installed and Back is still caught — until the first save of a NEW page, at which point useEditorSave's `replaceState(null, …)` wipes our marker off the entry and the guard quietly dies. The break is invisible on a saved page and total on /builder/new, which is the page with no autosave backstop. This is the interaction the round was warned about, made real.",
    reddens: [
      'fs/pageBuilderLeaveGuard › the hook repairs its own sentinel after useEditorSave rewrites the entry',
    ],
    staysGreen: [
      'fs/pageBuilderLeaveGuard › the hook registers all three exits — popstate is still listening. It is listening for a marker that is no longer there, which is the worst kind of green.',
      'pure/leaveGuard › every test — untouched.',
    ],
    find: "    } else if (!isSentinel(window.history.state)) {\n      window.history.replaceState(SENTINEL, '', window.location.href);\n    }",
    replace: '    }',
  },

  'shell-keeps-its-own-guard': {
    file: SHELL,
    why: 'Re-add the old beforeunload effect in EditorShell alongside the hook. Nothing breaks visibly — the browser dedupes the prompt — so this survives review easily. What it re-creates is the drift: two conditions for one rule, and the next state that should block leaving gets added to whichever one the author happened to be reading.',
    reddens: [
      'fs/pageBuilderLeaveGuard › EditorShell delegates to the hook and no longer keeps a guard of its own',
    ],
    staysGreen: [
      'everything else — and that is the finding. A duplicated guard is not a behaviour change today; it is a latent one. Only a structural assertion can see it, which is why this assertion is worth its line.',
    ],
    find: '  const { reason, pending, confirmLeave, cancelLeave } = useLeaveGuard({ dirty, saving, conflict });',
    replace: "  const { reason, pending, confirmLeave, cancelLeave } = useLeaveGuard({ dirty, saving, conflict });\n\n  useEffect(() => {\n    if (!dirty && !conflict) return undefined;\n    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };\n    window.addEventListener('beforeunload', onBeforeUnload);\n    return () => window.removeEventListener('beforeunload', onBeforeUnload);\n  }, [dirty, conflict]);",
  },

  'conflict-stops-blocking': {
    file: PURE,
    why: 'Drop the conflict clause from the decision — the shape someone reaches for when reading `conflict` as "an error state" rather than "unsaved work". A conflicted session is the one case where the tab holds the ONLY copy that will ever exist, because autosave has stopped permanently; letting it leave unasked is the largest possible instance of this bug.',
    reddens: [
      'pure/leaveGuard › a clean, idle, unconflicted editor is the ONLY state that lets you leave',
      'pure/leaveGuard › conflict outranks everything',
      'pure/leaveGuard › a missing or partial state does not accidentally block, or accidentally allow',
      'pure/leaveGuard › CONTROL: the sweeps are discriminating — it asserts the real predicate blocks on a conflict-only state, so it fires here too. Correct and expected: with the clause gone the real predicate IS the permissive one, and a control whose whole job is to separate them has nothing left to separate.',
    ],
    staysGreen: [
      'pure/leaveGuard › shouldBlockLeave agrees with leaveBlockReason — MEASURED, AND IT IS THE POINT OF DERIVING ONE FROM THE OTHER. Both exports go wrong together and stay consistent, so consistency alone can never be evidence of correctness. The sweeps above are what carry that.',
      'fs/pageBuilderLeaveGuard › every test — the wiring is untouched. Three exits, all correctly consulting a predicate that now gives the wrong answer.',
    ],
    find: "  if (conflict) return 'conflict';",
    replace: '',
  },
};

// ── Apply / revert ──────────────────────────────────────────────────────────

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-leave-guard.state');

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
  console.log('Leave-gate controls:\n');
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
console.log('\nnow: node test/run.mjs   then: node scripts/_control-leave-guard.mjs revert');
console.log('and READ THE MESSAGE — npm test does not print it.');
