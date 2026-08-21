/**
 * ROUND 31 — the controls, rehearsed against the REAL source files.
 *
 * The DOM controls inside test/render/structurePanelBands.test.mjs mutate a
 * rendered document. That proves the PROBE discriminates. It does not prove
 * the SUITE does — a probe can be perfect and still be wired to nothing. So
 * each break the brief names is applied to the shipped file here, the affected
 * tests are run, and the file is restored.
 *
 * ── REVERTED BY FILE COPY, NEVER BY `git checkout --` ─────────────────────
 * The originals are read into memory before anything is written and written
 * back in a `finally`, so an exception mid-run cannot leave a broken tree —
 * and nothing consults git, which would also discard any unrelated edit
 * sitting in the working tree.
 *
 * The tree is CRLF; every break is applied to the bytes as they are, so a
 * restore is byte-for-byte and not a re-normalisation.
 *
 * A break that produces NO red is the finding. It means the test naming that
 * property is not binding, and the green it reports means nothing in either
 * direction.
 *
 * Run: node scripts/_rehearse-round31-band-controls.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const SP = path.join(ROOT, 'src/components/pageBuilder/editor/StructurePanel.jsx');
const SHELL = path.join(ROOT, 'src/components/pageBuilder/editor/EditorShell.jsx');

const ORIGINAL = new Map([[SP, readFileSync(SP, 'utf8')], [SHELL, readFileSync(SHELL, 'utf8')]]);
const restore = () => { for (const [f, t] of ORIGINAL) writeFileSync(f, t); };

const crlf = (s) => s.replace(/\n/g, '\r\n');

/** Apply one exact substitution to a file, refusing anything but one match. */
function breakFile(file, from, to) {
  const text = ORIGINAL.get(file);
  const A = crlf(from), B = crlf(to);
  const hits = text.split(A).length - 1;
  if (hits !== 1) throw new Error(`[rehearse] ${hits} matches in ${path.basename(file)} for: ${from.slice(0, 70)}`);
  writeFileSync(file, text.replace(A, B));
}

const TESTS = [
  'test/render/structurePanelBands.test.mjs',
  'test/render/structureRowLines.test.mjs',
  'test/render/panelPolish.test.mjs',
  'test/render/sectionPickerWidthStability.test.mjs',
];

function run() {
  try {
    const out = execFileSync(process.execPath, [
      '--import', './scripts/_probe-panel-register.mjs', '--test', ...TESTS,
    ], { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    return { failed: 0, names: [], raw: out };
  } catch (e) {
    const raw = (e.stdout ?? '') + (e.stderr ?? '');
    const failed = Number(raw.match(/^# fail (\d+)$/m)?.[1] ?? -1);
    const names = [...raw.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
    return { failed, names, raw };
  }
}

const BREAKS = [
  {
    name: 'the header goes back INSIDE the scrolling box (the shell stops splitting the panel)',
    apply: () => breakFile(SHELL,
      `          split
          className="flex min-h-0 flex-col border-r border-[var(--surface-border)] bg-[var(--surface)]"`,
      `          className="min-h-0 overflow-y-auto border-r border-[var(--surface-border)] bg-[var(--surface)]"`),
  },
  {
    name: 'the gutter moves OFF the scroller and onto the panel (round 13’s counter-example)',
    apply: () => {
      breakFile(SP,
        `className="flex-1 overflow-y-auto p-3 [scrollbar-gutter:stable]"`,
        `className="flex-1 overflow-y-auto p-3"`);
      breakFile(SHELL,
        `className="flex min-h-0 flex-col border-r border-[var(--surface-border)] bg-[var(--surface)]"`,
        `className="flex min-h-0 flex-col [scrollbar-gutter:stable] border-r border-[var(--surface-border)] bg-[var(--surface)]"`);
    },
  },
  {
    name: 'the NESTED add rows are pinned too (addRow defaults to false, so slots lose theirs)',
    apply: () => breakFile(SP,
      `function SectionList({ sections, basePath, addRow = true }) {`,
      `function SectionList({ sections, basePath, addRow = false }) {`),
  },
  {
    name: 'the top-level list renders its add row AGAIN, alongside the pinned one',
    apply: () => breakFile(SP,
      `<SectionList sections={sections} basePath={['sections']} addRow={false} />`,
      `<SectionList sections={sections} basePath={['sections']} />`),
  },
  {
    name: 'the SETTINGS panel is split too (the shape imposed on a panel this round never looked at)',
    apply: () => breakFile(SHELL,
      `          className="min-h-0 overflow-y-auto border-l border-[var(--surface-border)] bg-[var(--surface)]"`,
      `          split
          className="flex min-h-0 flex-col border-l border-[var(--surface-border)] bg-[var(--surface)]"`),
  },
];

try {
  const clean = run();
  console.log(`BASELINE (nothing broken): ${clean.failed} failing\n`);
  if (clean.failed !== 0) {
    console.log('[rehearse] the baseline is not green — every result below is meaningless');
    console.log(clean.raw.slice(-3000));
  }

  for (const b of BREAKS) {
    restore();
    b.apply();
    const r = run();
    console.log(`── ${b.name}`);
    console.log(`   failing: ${r.failed}`);
    for (const n of r.names) console.log(`   RED  ${n}`);
    if (r.failed === 0) console.log('   *** NO RED — nothing in the suite binds this property ***');
    console.log('');
  }
} finally {
  restore();
  console.log('[rehearse] both source files restored from the in-memory copies');
}
