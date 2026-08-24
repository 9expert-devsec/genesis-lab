/**
 * Round 81 — course_schedule over all five row states, before and after.
 *
 * Renders the section from a NAMED tree (`--from=<repo root>`, default this
 * repo) so the pre-change component can be driven out of a git worktree of HEAD
 * rather than by mutating the working tree. The subject file is the only thing
 * taken from that tree: its `@/` imports resolve through test/loader.mjs to THIS
 * repo's src, which is correct because course_schedule.jsx is the only file the
 * change touches.
 *
 * The `full` row is handed to the renderer directly. resolveSectionData does not
 * pass `status` today, so upstream withholds full rounds and one cannot arrive
 * through the resolver — which is precisely why the defect is invisible in
 * production markup and has to be driven at the component boundary.
 */
import { register } from 'node:module';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform } from 'sucrase';

process.env.NODE_ENV = 'production';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
register(pathToFileURL(path.join(ROOT, 'test', 'loader.mjs')));

const fromArg = process.argv.find((a) => a.startsWith('--from='));
const FROM = fromArg ? path.resolve(fromArg.slice('--from='.length)) : ROOT;
const LABEL = fromArg ? 'BEFORE (worktree of HEAD)' : 'AFTER (working tree)';

const REL = path.join('src', 'components', 'pageBuilder', 'sections', 'course_schedule.jsx');
const subjectSrc = readFileSync(path.join(FROM, REL), 'utf8');
const { code } = transform(subjectSrc, {
  transforms: ['jsx'], jsxRuntime: 'automatic', production: true, filePath: path.join(FROM, REL),
});
const tmp = path.join(HERE, `_round81-subject-${process.pid}.mjs`);
writeFileSync(tmp, code);

const { renderToStaticMarkup } = await import('react-dom/server');
let CourseScheduleSection;
try {
  ({ CourseScheduleSection } = await import(pathToFileURL(tmp).href));
} finally {
  rmSync(tmp, { force: true });
}

const R = (content, data) => renderToStaticMarkup(CourseScheduleSection({ content, data }));

const CODE = 'MSE-L1';
const liveRow = (id, status) => ({ _id: id, dates: ['2027-03-10'], type: 'classroom', status });

// One <li> per row; report what the row IS, not what it contains.
function probe(html) {
  const li = html.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? [];
  return li.map((row) => {
    const a = row.match(/<a\s+href="([^"]*)"/);
    const chip = row.match(/<span class="shrink-0 rounded-full[^"]*?(bg-\[[^"]*|bg-slate-[^\s"]*)[^"]*"[^>]*>([^<]*)</);
    const chipFull = row.match(/<span class="(shrink-0 rounded-full[^"]*)"[^>]*>([^<]*)</);
    return {
      anchored: Boolean(a),
      href: a ? a[1] : null,
      chipText: chipFull ? chipFull[2] : null,
      chipColour: chipFull ? chipFull[1].replace('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ', '') : null,
      _chipProbe: chip ? chip[1] : null,
    };
  });
}

const CASES = [
  ['open',        () => R({ courseId: CODE }, [liveRow('r-open', 'open')])],
  ['nearly_full', () => R({ courseId: CODE }, [liveRow('r-near', 'nearly_full')])],
  ['full',        () => R({ courseId: CODE }, [liveRow('r-full', 'full')])],
  ['elapsed',     () => R(
    { courseId: CODE, source: 'manual', roundIds: ['r-gone'],
      roundSnapshots: [{ id: 'r-gone', dates: ['2026-01-05'], type: 'hybrid' }] },
    [liveRow('r-open', 'open')])],
  ['missing',     () => R(
    { courseId: CODE, source: 'manual', roundIds: ['r-withdrawn'],
      roundSnapshots: [{ id: 'r-withdrawn', dates: ['2027-05-04'], type: 'classroom' }] },
    [liveRow('r-open', 'open')])],
];

const out = {};
for (const [name, run] of CASES) {
  const rows = probe(run());
  if (rows.length !== 1) throw new Error(`${name}: expected exactly 1 row, got ${rows.length}`);
  out[name] = rows[0];
}

console.log(LABEL);
console.log(`subject: ${path.join(FROM, REL)}`);
for (const [state, r] of Object.entries(out)) {
  console.log(
    `  ${state.padEnd(12)} anchored=${String(r.anchored).padEnd(5)} href=${String(r.href).padEnd(52)}`
    + ` chip="${r.chipText}" colour="${r.chipColour}"`
  );
}
console.log(JSON.stringify(out));
