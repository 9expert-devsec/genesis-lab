/**
 * THE CONTROLS FOR ROUND 39 — custom background and accent colours.
 *
 *   node scripts/_control-round39.mjs list
 *   node scripts/_control-round39.mjs verify
 *   node scripts/_control-round39.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-round39.mjs revert
 *
 * Same harness as rounds 8, 10-13, 38 and _control-r0: CRLF-preserving splice,
 * `verify`, an unknown-key hard failure, and a revert from a byte copy.
 *
 * ══ READ THE MESSAGE, NOT THE COLOUR ════════════════════════════════════════
 * `npm test` SWALLOWS failure messages — test/run.mjs exits before the spec
 * reporter flushes — so red-vs-green alone cannot tell a guard that fired for
 * the right reason from one that fired because the break broke something else.
 * Every break records the assertion TEXT it produced.
 *
 * ══ WHAT THESE ARE FOR ══════════════════════════════════════════════════════
 * The load-bearing claim of this round is a NEGATIVE one: that a page nobody
 * edited renders exactly as it did. A negative is the easiest thing to assert
 * vacuously, so the preset path is broken here and the guard has to name it.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PRESETS  = 'src/lib/pageBuilder/presets.js';
const CUSTOM   = 'src/lib/pageBuilder/customColor.js';
const RENDERER = 'src/components/pageBuilder/SectionRenderer.jsx';
const PANEL    = 'src/components/pageBuilder/editor/SettingsPanel.jsx';

const BREAKS = {
  'preset-path-moved': {
    file: PRESETS,
    why: 'Make the background resolver answer for a CUSTOM background even when the '
      + 'author never chose one — i.e. break the one question that keeps every stored '
      + 'section rendering as it did. 18 live sections and 22 more inside stored version '
      + 'snapshots go through this branch on every render.',
    reddens: [
      'pure/customColor > every stored preset value resolves EXACTLY as it did before this round',
      'render/customColorRender > a section with a PRESET background renders the class and no inline style',
    ],
    staysGreen: [
      'every custom-colour case — the feature still works perfectly. That is the point: '
        + 'this defect is invisible from inside the thing being built and only a check '
        + 'aimed at the UNCHANGED path can see it.',
    ],
    find: '  return hasCustomBackground(settings) ? \'\' : backgroundClass(settings?.background);',
    replace: '  return \'\';',
  },

  'hex-validation-loosened': {
    file: CUSTOM,
    why: 'Drop the anchors from the colour regex. The value reaches a style attribute, '
      + 'so an unanchored pattern accepts `#0d1b2a; color:red` — a style injection — and '
      + 'accepts it at BOTH layers at once, because the schema and the render normaliser '
      + 'share this one definition.',
    reddens: [
      'pure/customColor > every refused form is refused, and each names why',
      'pure/customColor > the SCHEMA refuses the same set the render layer refuses',
      'pure/customColor > an INVALID stored value renders the default, never a broken style',
    ],
    staysGreen: [
      'render/customColorRender > the accent-consuming set is the twelve the audit names — '
        + 'the surfaces are unchanged; what changed is what may reach them.',
    ],
    find: 'export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;',
    replace: 'export const HEX_COLOR_RE = /#[0-9a-fA-F]{6}/;',
  },

  'one-stop-becomes-a-gradient': {
    file: CUSTOM,
    why: 'Emit a two-stop gradient for a one-stop background by duplicating the first '
      + 'stop. It paints identically today, which is exactly why it is worth guarding: it '
      + 'silently rewrites the authored value, so an author who later fills in the second '
      + 'stop finds the control already behaving as though they had.',
    reddens: [
      'pure/customColor > ONE stop emits a flat colour, not a gradient with two identical stops',
      'render/customColorRender > ONE stop renders a flat background-color, not a gradient',
    ],
    staysGreen: [
      'every two-stop case, and every browser measurement — the painted result is the same '
        + 'colour. No pixel changes; only the stored intent does.',
    ],
    find: '  if (!to) return { backgroundColor: from };',
    replace: '  if (!to) return { backgroundImage: `linear-gradient(to bottom, ${from}, ${from})` };',
  },

  'mode-blind-resolver-back-in-the-renderer': {
    file: RENDERER,
    why: 'Call the mode-BLIND backgroundClass again. The preset class then survives '
      + 'underneath a custom colour: a gradient paints over most of it and a flat colour '
      + 'covers it entirely, so the defect is invisible until a section is short enough or '
      + 'a colour translucent enough to show the preset through.',
    reddens: [
      'render/customColorRender > the renderer cannot reach the mode-blind resolvers',
      'render/customColorRender > the preset background CLASS is gone when a custom colour takes over',
    ],
    staysGreen: [
      'every accent case — the accent goes through a different resolver, and this break '
        + 'reaches only the background half.',
    ],
    find: '    backgroundClassFor(settings),',
    replace: '    backgroundClass(settings.background),',
    also: {
      file: RENDERER,
      find: '  containerWidthClass, spacingTopClass, spacingBottomClass,\n  visibilityClass, isHiddenVisibility,',
      replace: '  containerWidthClass, spacingTopClass, spacingBottomClass, backgroundClass,\n  visibilityClass, isHiddenVisibility,',
    },
  },

  'contrast-warning-enforces': {
    file: PANEL,
    why: 'Turn the contrast WARNING into an enforcement: derive the section text colour '
      + 'from the author background instead of only telling them. That is D4 refused — a '
      + 'second authority over text beside the theme, which is what rounds 21-25 spent '
      + 'four rounds removing from container.jsx, arriving somewhere new.',
    reddens: [
      'render/customColorPanel > the warning WARNS — it changes no value and blocks nothing',
    ],
    staysGreen: [
      'the contrast warnings themselves — they still fire on the same colours. The break '
        + 'ADDS an authority rather than removing a message, which is the shape that gets '
        + 'through a review as a helpful extra.',
    ],
    find: '            {!backgroundContrastOk(bgCustom) && <Warn>{BACKGROUND_CONTRAST_WARNING}</Warn>}',
    replace: '            {!backgroundContrastOk(bgCustom) && <Warn>{BACKGROUND_CONTRAST_WARNING}</Warn>}\n'
      + '            {!backgroundContrastOk(bgCustom) && patchKey(\'settings\', { visibility: \'all\' })}',
  },
};

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-round39.state');

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
  console.log('Round 39 controls:\n');
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
console.log('\nnow: node test/run.mjs   then: node scripts/_control-round39.mjs revert');
console.log('and READ THE MESSAGE — npm test does not print it.');
