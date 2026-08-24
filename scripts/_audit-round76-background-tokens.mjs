/**
 * ROUND 76 §A/§C — what the section-background table actually contains, and
 * whether each entry has an EXISTING variable that preserves its light value.
 *
 * Round 76's brief asks for `PRESET_BACKGROUNDS`, "five hardcoded hex
 * literals". That identifier does not exist in this tree. The table is
 * `BACKGROUND_CLASS` in src/lib/pageBuilder/presets.js, it has SEVEN keys, and
 * every value is a Tailwind CLASS STRING, not a hex. This script reports what
 * is really there rather than what was expected, and then answers the question
 * that decides whether commit 1 is possible at all:
 *
 *   For each key, is there a CSS custom property whose `:root` value is
 *   BYTE-IDENTICAL to what the key renders today AND which `.dark` redeclares?
 *
 * If yes, the key can be converted with the light rendering unchanged — §B's
 * rule. If no, converting it means NAMING A NEW DARK COLOUR, which is §C's
 * STOP condition and round 39's standing rule: a colour with no token is a
 * palette decision, not a gap to paper over.
 *
 * The light value of each class is resolved from tailwind.config.js (the same
 * module the JIT reads), not transcribed — a transcription would be a second
 * copy of the palette and could disagree with the one that ships.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * A matcher that never matches would report "every key needs a new colour",
 * which is the alarming answer and therefore the one to distrust. So the run
 * asserts that at least one key DOES find a match, and prints the matches it
 * found. If nothing matches at all, the matcher is broken, not the palette.
 *
 * READ-ONLY over source. No DB, no browser, no writes.
 *
 * Run: node scripts/_audit-round76-background-tokens.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require_ = createRequire(path.join(ROOT, 'noop.js'));
const TW = require_(path.join(ROOT, 'tailwind.config.js'));
const CSS = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const PRESETS = readFileSync(path.join(ROOT, 'src/lib/pageBuilder/presets.js'), 'utf8');

function die(msg) { console.error('X ' + msg); process.exit(1); }

/** The text of one top-level rule block, by selector. */
function blockFor(selector) {
  const start = CSS.indexOf(selector + ' {');
  if (start < 0) die('globals.css has no top-level `' + selector + ' {` block');
  let depth = 0;
  for (let i = start; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') { depth -= 1; if (depth === 0) return CSS.slice(start, i + 1); }
  }
  return die('unterminated ' + selector);
}
function declarations(block) {
  const out = new Map();
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}
const ROOT_VARS = declarations(blockFor(':root'));
const DARK_VARS = declarations(blockFor('.dark'));

/** BACKGROUND_CLASS, read out of the source rather than retyped. */
function backgroundClassTable() {
  const start = PRESETS.indexOf('const BACKGROUND_CLASS = {');
  if (start < 0) die('BACKGROUND_CLASS not found in presets.js');
  const end = PRESETS.indexOf('};', start);
  const body = PRESETS.slice(start, end);
  const out = [];
  for (const m of body.matchAll(/^\s{2}(\w+):\s*'([^']*)'/gm)) out.push([m[1], m[2]]);
  return out;
}

const colors = TW.theme.extend.colors;
const bgImages = TW.theme.extend.backgroundImage;

/** `bg-<something>` → the literal it paints, from the Tailwind config. */
function resolveClass(cls) {
  if (cls === '') return { kind: 'none', value: null };
  const name = cls.replace(/^bg-/, '');
  if (name === 'white') return { kind: 'color', value: '#FFFFFF' };
  if (name === 'black') return { kind: 'color', value: '#000000' };
  if (bgImages && bgImages[name]) return { kind: 'gradient', value: bgImages[name] };
  // `9e-ice` → colors['9e'].ice ; `9e-slate-lt-800` → colors['9e-slate-lt'][800]
  const stepped = name.match(/^(.*)-(\d{2,3})$/);
  if (stepped && colors[stepped[1]] && colors[stepped[1]][stepped[2]]) {
    return { kind: 'color', value: colors[stepped[1]][stepped[2]] };
  }
  const dotted = name.match(/^(9e)-(.+)$/);
  if (dotted && colors[dotted[1]] && colors[dotted[1]][dotted[2]]) {
    return { kind: 'color', value: colors[dotted[1]][dotted[2]] };
  }
  return { kind: 'unresolved', value: null };
}

/**
 * A SURFACE token — one whose job is to paint a background.
 *
 * Matching on the light VALUE alone is not enough, and the first run of this
 * script proved it: `--text-primary` is `#0D1B2A`, byte-identical to what
 * `bg-9e-navy` paints, so a value-only matcher reported the `dark` key as
 * "convertible" via a TEXT token that resolves to near-white under `.dark`.
 * That is a false green of exactly the kind this round was told to diff before
 * believing. A counterpart has to be a surface, not merely the same six digits.
 */
const SURFACE_TOKENS = new Set([
  '--page-bg', '--page-bg-muted',
  '--surface', '--surface-muted', '--surface-raised', '--surface-hover',
  '--surface-divider',
]);

/** Every var whose :root value equals `hex` (case-insensitive) AND that .dark redeclares differently. */
function counterpartsFor(hex) {
  const want = String(hex).toLowerCase();
  const exact = [];
  const wrongFamily = [];
  const sameButNoDark = [];
  for (const [name, value] of ROOT_VARS) {
    if (value.toLowerCase() !== want) continue;
    const dark = DARK_VARS.get(name);
    const hasDark = dark !== undefined && dark.toLowerCase() !== want;
    if (!hasDark) { sameButNoDark.push(name); continue; }
    const entry = `${name} (${value} → ${dark})`;
    if (SURFACE_TOKENS.has(name)) exact.push({ name, light: value, dark, text: entry });
    else wrongFamily.push(entry);
  }
  return { exact, wrongFamily, sameButNoDark };
}

const rows = [];
for (const [key, cls] of backgroundClassTable()) {
  const r = resolveClass(cls);
  const row = { key, class: cls || '(empty)', kind: r.kind, lightValue: r.value };
  if (r.kind === 'color') {
    const { exact, wrongFamily, sameButNoDark } = counterpartsFor(r.value);
    row.surfaceCounterparts = exact.map((e) => e.text);
    row.sameLightValueButNotASurfaceToken = wrongFamily;
    row.sameLightButNoDarkCounterpart = sameButNoDark;
    row.convertibleWithoutMintingAColour = exact.length > 0;
  } else if (r.kind === 'gradient') {
    // A gradient's counterpart would have to be a second gradient; there is no
    // mechanism in globals.css that gives a backgroundImage a `.dark` form.
    const darkGradients = Object.keys(bgImages).filter((n) => /dark/.test(n));
    row.gradientDefinition = r.value;
    row.existingDarkGradientTokens = darkGradients;
    row.convertibleWithoutMintingAColour = false;
  } else {
    row.convertibleWithoutMintingAColour = null; // paints nothing; nothing to convert
  }
  rows.push(row);
}

// CONTROL — a matcher that never matches would make every key look unfixable.
const anyMatch = rows.some((r) => r.convertibleWithoutMintingAColour === true);
if (!anyMatch) die('no key found ANY existing counterpart — the var matcher is broken, not the palette');

const needsMint = rows.filter((r) => r.kind !== 'none' && r.convertibleWithoutMintingAColour === false);

console.log(JSON.stringify({
  note: 'BACKGROUND_CLASS (there is no PRESET_BACKGROUNDS in this tree); 7 keys, Tailwind class strings, not hexes',
  surfaceTokenInThisFile: { light: ROOT_VARS.get('--surface'), dark: DARK_VARS.get('--surface') },
  rows,
  summary: {
    keysTotal: rows.length,
    keysPaintingNothing: rows.filter((r) => r.kind === 'none').length,
    keysConvertibleWithExistingTokens: rows.filter((r) => r.convertibleWithoutMintingAColour === true).map((r) => r.key),
    keysRequiringANewColour: needsMint.map((r) => r.key),
  },
}, null, 2));
