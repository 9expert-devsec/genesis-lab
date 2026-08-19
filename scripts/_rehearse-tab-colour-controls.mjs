/**
 * REHEARSAL — break the restyled tabs, and prove the guards notice.
 *
 * ══ THE CASE THAT MATTERS MOST IS 3 ═════════════════════════════════════════
 *
 * Not the colours — a wrong colour is visible. Case 3 puts back
 * `bg-9e-action/12`, the FIRST DRAFT of the count badge, which compiled to
 * NOTHING because 12 is not a step of Tailwind's opacity scale. An out-of-scale
 * modifier is silently dropped rather than rejected, the class is a complete
 * literal with no `[...]` in it, and so every shape-based check in this repo
 * passes it. Only compiling through Tailwind finds it. That is the case which
 * proves the harvest entry is doing work rather than decorating the CASES table.
 *
 * Case 5 is the one that would ship a real accessibility regression while
 * looking like it was following the design: `--text-muted` is the token
 * literally named "muted", the brief says "muted labels", and it is 2.56:1 in
 * dark against a 4.5 bar.
 *
 * Usage: node scripts/_rehearse-tab-colour-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SHELL = 'src/app/admin/registrations/_components/detailShell.jsx';

const COLOUR_T = 'test/render/registrationTabColours.test.mjs';
const TW_T     = 'test/fs/tailwindArbitraryValueRules.test.mjs';

const ALL_TARGETS = [SHELL];
const ALL_TESTS   = [COLOUR_T, TW_T];

if (process.argv[2] === '--child') {
  process.env.NODE_ENV = 'production';
  const { register } = await import('node:module');
  register(new URL('./test/loader.mjs', `file://${ROOT.split(path.sep).join('/')}/`));
  const { run } = await import('node:test');

  const files = process.argv.slice(3).map((f) => path.join(ROOT, f));
  const failed = [];
  let passed = 0;
  const stream = run({ files, isolation: 'none', concurrency: true });
  stream.on('test:pass', () => { passed += 1; });
  stream.on('test:fail', (e) => { failed.push(e.name); });
  stream.on('data', () => {});
  stream.on('close', () => console.log(`__RESULT__${JSON.stringify({ passed, failed })}`));
}

function runTests(files) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', ...files], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('__RESULT__'));
  if (!line) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error('the child produced no result line — it probably failed to start');
  }
  return JSON.parse(line.slice('__RESULT__'.length));
}

/** The tree is CRLF; the cases below are written with `\n`. */
function withEol(text, file) {
  return file.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n');
}

const ok = (b) => (b ? '✓' : '✖');
let failures = 0;
const check = (label, condition, detail = '') => {
  if (!condition) failures += 1;
  console.log(`     ${ok(condition)} ${label}${detail ? ` — ${detail}` : ''}`);
};

const CASES = [
  {
    name: '1. the dark navy slab comes back',
    why: 'the shipped treatment this round replaced — "too dark" was the whole complaint',
    edits: [{
      file: SHELL,
      find: "        true:  'bg-[var(--surface-raised)] text-9e-action shadow-9e-sm dark:text-9e-air',",
      replace: "        true:  'bg-9e-navy text-9e-ice shadow-9e-sm',",
    }],
    files: [COLOUR_T, TW_T],
    /**
     * ── A MEASURED LIMIT OF THE TAILWIND HARVEST, WORTH RECORDING ──────────
     *
     * `dark:text-9e-air` was declared here and STAYED GREEN. Not a weak guard —
     * a correct one, reporting honestly. The harvest compiles the WHOLE FILE's
     * code and asks whether a class produces a rule, so it cannot tell WHICH
     * variant carries it: `tabCountVariants` still has `dark:text-9e-air`, so
     * stripping it from `tabVariants` leaves the class in the file and the rule
     * in the stylesheet.
     *
     * The harvest's job is "does this class compile at all", and it does that.
     * WHICH ELEMENT WEARS IT is the render tier's job, and the render assertion
     * above does redden. Adjusting the harvest to be element-aware would be
     * rebuilding the render tier inside a PostCSS check.
     */
    mustFail: [
      'the SELECTED tab is a raised card with a BLUE label — not a dark slab',
      'the selected tab card: "bg-[var(--surface-raised)]" compiles to a background-color rule',
    ],
  },
  {
    name: '2. the raised card loses its shadow',
    why: 'separation is 1.05:1 in light — the shadow is the only thing distinguishing the card',
    edits: [{
      file: SHELL,
      find: "        true:  'bg-[var(--surface-raised)] text-9e-action shadow-9e-sm dark:text-9e-air',",
      replace: "        true:  'bg-[var(--surface-raised)] text-9e-action dark:text-9e-air',",
    }],
    files: [COLOUR_T],
    mustFail: ['the SELECTED tab is a raised card with a BLUE label — not a dark slab'],
  },
  {
    name: '3. THE SILENT ONE: the badge goes back to bg-9e-action/12',
    why: 'compiles to NOTHING — 12 is not an opacity step, and no source scan can see it',
    edits: [{
      file: SHELL,
      find: "        true:  'bg-9e-action/10 text-9e-action dark:bg-9e-air/15 dark:text-9e-air',",
      replace: "        true:  'bg-9e-action/12 text-9e-action dark:bg-9e-air/15 dark:text-9e-air',",
    }],
    files: [TW_T],
    mustFail: ['the selected tab count badge: "bg-9e-action/10" compiles to a background-color rule'],
  },
  {
    name: '4. the variant is replaced by a className override',
    why: 'the shape the instruction rules out — a default plus an exception rather than a closed choice',
    edits: [{
      file: SHELL,
      find: '            className={tabVariants({ selected })}',
      replace: "            className={cn(tabVariants({ selected }), selected && 'text-9e-ice')}",
    }],
    files: [COLOUR_T],
    // Three, not two. The source-shape assertion fires as well as the "bare
    // variant call" one, because both read the same line — they are two claims
    // about it (cva is used; nothing wraps it) and this edit breaks both.
    mustFail: [
      'the tab passes its class list through NO merge function',
      'the two states are a cva VARIANT, not a className override',
      'the SELECTED tab is a raised card with a BLUE label — not a dark slab',
    ],
  },
  {
    name: '5. the unselected label follows the DESIGN literally: --text-muted',
    why: 'the token named "muted", which is 2.56:1 in dark — a regression that looks like compliance',
    edits: [{
      file: SHELL,
      find: "        false: 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',",
      replace: "        false: 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]',",
    }],
    files: [COLOUR_T],
    // The contrast assertion reads the TOKENS table, not the markup, so it does
    // not move — what fires is the render assertion naming the class. Stated so
    // the boundary is on record: the ratios are pinned against the stylesheet's
    // values, and the markup check is what ties the component to them.
    mustFail: ['UNSELECTED tabs are transparent with muted labels'],
  },
  {
    name: '6. the icon is given its own colour',
    why: 'a second home for the selected blue — the two drift the first time one changes',
    edits: [{
      file: SHELL,
      find: '            <Icon aria-hidden="true" className="h-[14px] w-[14px] shrink-0" />\n            <span>{tab.label}</span>',
      replace: '            <Icon aria-hidden="true" className="h-[14px] w-[14px] shrink-0 text-9e-action" />\n            <span>{tab.label}</span>',
    }],
    files: [COLOUR_T],
    mustFail: ['the ICON takes the label colour rather than carrying its own'],
  },
];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('══ TAB COLOUR CONTROL REHEARSAL ═══════════════════════════════════════════');
  for (const rel of ALL_TARGETS) console.log(`   target: ${rel}`);
  console.log('   every file is restored in a finally, including on error');
  console.log('');

  try {
    console.log('── baseline (unmutated) ────────────────────────────────────────────────────');
    const base = runTests(ALL_TESTS);
    check('the guarding tests are green to start with', base.failed.length === 0,
      base.failed.length ? `already failing: ${base.failed.join(', ')}` : `${base.passed} passed`);
    console.log('');

    for (const c of CASES) {
      console.log(`── ${c.name} ${'─'.repeat(Math.max(0, 71 - c.name.length))}`);
      console.log(`   ${c.why}`);

      const applied = c.edits.map((e) => {
        const before = original.get(e.file);
        return { file: e.file, find: withEol(e.find, before), replace: withEol(e.replace, before) };
      });
      for (const e of applied) {
        const hits = original.get(e.file).split(e.find).length - 1;
        if (hits !== 1) {
          throw new Error(
            `case "${c.name}": the find text occurs ${hits} times in ${e.file}, expected exactly 1.\n` +
            `  ${JSON.stringify(e.find.slice(0, 130))}`,
          );
        }
      }
      const mutated = new Map(original);
      for (const e of applied) mutated.set(e.file, mutated.get(e.file).replace(e.find, e.replace));
      for (const [rel, text] of mutated) writeFileSync(path.join(ROOT, rel), text);

      for (const e of applied) {
        const landed = readFileSync(path.join(ROOT, e.file), 'utf8') !== original.get(e.file);
        check(`the mutation landed in ${e.file}`, landed, landed ? '' : 'file is byte-identical');
      }

      const r = runTests(c.files);

      for (const name of c.mustFail) {
        check(`RED: ${name}`, r.failed.includes(name),
          r.failed.includes(name) ? '' : `still green (failures: ${r.failed.join(' | ') || 'none'})`);
      }
      const declared = new Set(c.mustFail);
      const surprises = r.failed.filter((n) => !declared.has(n));
      check('no undeclared failures', surprises.length === 0, surprises.length ? surprises.join(' | ') : '');

      for (const [rel, text] of original) writeFileSync(path.join(ROOT, rel), text);
      console.log('');
    }
  } finally {
    for (const [rel, text] of original) writeFileSync(path.join(ROOT, rel), text);
    console.log('── restored ────────────────────────────────────────────────────────────────');
    for (const rel of ALL_TARGETS) {
      const same = readFileSync(path.join(ROOT, rel), 'utf8') === original.get(rel);
      console.log(`   ${ok(same)} ${rel}`);
      if (!same) failures += 1;
    }
  }

  console.log('');
  console.log(failures === 0
    ? '══ ALL CONTROLS BEHAVED AS DECLARED ═══════════════════════════════════════'
    : `══ ${failures} CONTROL(S) DID NOT BEHAVE AS DECLARED ════════════════════════`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[2] !== '--child') await main();
