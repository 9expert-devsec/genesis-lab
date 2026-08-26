/**
 * ROUND 32 — the controls, rehearsed against the REAL source file.
 *
 * The DOM controls inside the render tests mutate a rendered document or
 * compare two literal shapes. That proves the PROBES discriminate. It does not
 * prove the SUITE does — a probe can be perfect and wired to nothing. So each
 * break the brief names is applied to the shipped file here, the affected tests
 * are run, and the file is restored.
 *
 * ── REVERTED BY FILE COPY, NEVER BY `git checkout --` ─────────────────────
 * The original is read into memory before anything is written and written back
 * in a `finally`, so an exception mid-run cannot leave a broken tree — and
 * nothing consults git, which would also discard unrelated edits sitting in
 * the working tree. The tree is CRLF and every break is applied to the bytes
 * as they are, so a restore is byte-for-byte rather than a re-normalisation.
 *
 * A break that produces NO red is the finding: the test naming that property
 * is not binding, and its green means nothing in either direction.
 *
 * Run: node scripts/_rehearse-round32-controls.mjs
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
function breakFile(file, from, to) {
  const text = readFileSync(file, 'utf8');
  const A = crlf(from), B = crlf(to);
  const hits = text.split(A).length - 1;
  if (hits !== 1) throw new Error(`[rehearse] ${hits} matches in ${path.basename(file)} for: ${from.slice(0, 70)}`);
  writeFileSync(file, text.replace(A, B));
}

const TESTS = [
  'test/render/structureRowCollapse.test.mjs',
  'test/render/structureRowLines.test.mjs',
  'test/render/structurePanelBands.test.mjs',
  'test/render/panelPolish.test.mjs',
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
    name: 'the default flips — containers start OPEN',
    apply: () => breakFile(SP,
      `  const isContainer = Boolean(slots);
  const open = isContainer && isExpanded(section, path);`,
      `  const isContainer = Boolean(slots);
  const open = isContainer && !isExpanded(section, path);`),
  },
  {
    name: 'collapse stops hiding anything — children render whatever the state says',
    apply: () => breakFile(SP, `      {open && slots?.map((slot) => {`, `      {slots?.map((slot) => {`),
  },
  {
    name: 'the toggle is routed through the reducer, so it lands in the saved document',
    apply: () => breakFile(SP,
      `  const toggleExpanded = useCallback((section, path) => {
    const key = expandKey(section, path);`,
      `  const toggleExpanded = useCallback((section, path) => {
    dispatch({ type: 'TOGGLE_EXPANDED', path });
    const key = expandKey(section, path);`),
  },
  {
    name: 'the leading position number is restored',
    apply: () => breakFile(SP,
      `          <span
            data-testid="row-primary"`,
      `          <span data-testid="row-position" className="shrink-0 text-[10px] tabular-nums text-9e-slate-dp-50/70">
            {index + 1}.
          </span>
          <span
            data-testid="row-primary"`),
  },
  {
    name: 'the collapse key goes back to the PATH, so an open container closes on a reorder',
    apply: () => breakFile(SP,
      `  return section?.id ? \`id:\${section.id}\` : \`path:\${pathToKey(path)}\`;`,
      `  return \`path:\${pathToKey(path)}\`;`),
  },
  {
    name: 'a drag handle takes over the drag, moving the source off the row',
    apply: () => breakFile(SP,
      `          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <TypeIcon className="h-3.5 w-3.5 text-9e-slate-dp-50/60" aria-hidden />
          </span>`,
      `          <span draggable className="flex h-6 w-6 shrink-0 items-center justify-center">
            <TypeIcon className="h-3.5 w-3.5 text-9e-slate-dp-50/60" aria-hidden />
          </span>`),
  },
  {
    name: 'the leaf icon loses its 24px box, so leaves and containers misalign',
    apply: () => breakFile(SP,
      `          <span className="flex h-6 w-6 shrink-0 items-center justify-center">`,
      `          <span className="flex shrink-0 items-center justify-center">`),
  },
  {
    name: 'EditorShell seeds the panel open, so nothing starts closed in production',
    apply: () => breakFile(SHELL, `          <StructurePanel />`, `          <StructurePanel initialExpanded={['x']} />`),
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
    console.log(`-- ${b.name}`);
    console.log(`   failing: ${r.failed}`);
    for (const n of r.names) console.log(`   RED  ${n}`);
    if (r.failed === 0) console.log('   *** NO RED — nothing in the suite binds this property ***');
    console.log('');
  }
} finally {
  restore();
  console.log('[rehearse] both source files restored from the in-memory copies');
}
