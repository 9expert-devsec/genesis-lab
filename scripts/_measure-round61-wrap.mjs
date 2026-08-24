/**
 * ROUND 61 §H/§J — blast radius of the page-wrapper wrap declaration.
 *
 * The claim to prove is unusually strong and worth stating before the numbers:
 * `overflow-wrap` is INHERITED, so the fix is one class on ONE element and no
 * section's markup changes at all. That makes the expected result a clean ZERO —
 * every stored section byte-identical through the public path — with the only
 * diff being the page wrapper itself, which is asserted separately in
 * test/render/pageWrapAnywhere.test.mjs.
 *
 * ── THE THIRD LOCATION FOR TEMP FILES, WHICH ROUNDS 59/60 SAID DID NOT EXIST ──
 * Round 59 put its git baseline beside the original under src/components and
 * broke `next dev` (the file is inside tailwind.config.js's content globs, so
 * deleting it left the JIT holding a missing path and every route served 500).
 * Round 60 moved it to src/ ROOT — outside those globs — and then made
 * fs/namedImportsResolve contribute zero tests, because test/sourceScan's
 * `walkSources` stats every .js/.jsx/.mjs under src and a file that vanishes
 * mid-sweep throws. Round 60 concluded there was no third location, because the
 * ESM loader only transpiles JSX for files under src (test/loader.mjs:194).
 *
 * There is one, and it is the loader's constraint read the other way: the file
 * only has to be under src IF IT STILL CONTAINS JSX. So this transpiles the
 * baseline with sucrase — the same compiler the loader uses — and writes plain
 * JS to scripts/*.generated.mjs. `@/` specifiers still resolve, because the
 * loader's resolve hook keys on the SPECIFIER and not on the importer's path.
 * scripts/ is in no Tailwind glob and is not walked by walkSources, so NEITHER
 * hazard can fire and this may be run beside `npm test`.
 *
 * ── ROUND 50'S TWO FALSE ZEROS ───────────────────────────────────────────
 * 1. COLLECTION NAME — `pagebuilders` does not exist; it is
 *    `page_builder_pages`. requireCollection EXITS non-zero on a missing name.
 * 2. VERSION PATH — snapshots are at `snapshot.sections`; a non-empty
 *    page_versions that walks to zero sections fails the run.
 * Plus a TYPE HISTOGRAM as the third control.
 *
 * ── THE CONTROL ──────────────────────────────────────────────────────────
 * A zero here and a comparison that never ran print the same number, so the
 * harness also renders fixtures through a DELIBERATELY changed baseline and
 * requires those to differ. Per round 41, controlDiscriminates carries no
 * information unless the differing count is 0 — reported next to it, in words.
 *
 * Run:
 *   node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round61-wrap.mjs
 */
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import mongoose from 'mongoose';
import { transform } from 'sucrase';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = process.cwd();
const BASE_REF = process.env.BASE_REF ?? 'HEAD';
const RENDERER = 'src/components/pageBuilder/SectionRenderer.jsx';
const OUT = path.join(ROOT, 'scripts/_baseline_SectionRenderer.generated.mjs');

const die = (m) => { console.error('x ' + m); process.exit(1); };
const SLOTS = ['children', 'left', 'right'];

async function requireCollection(db, name) {
  const found = await db.listCollections({ name }).toArray();
  if (!found.length) die(`collection "${name}" does not exist — a zero from it would be a lie`);
  return db.collection(name);
}

function walk(sections, where, out, depth = 0) {
  if (!Array.isArray(sections) || depth > 12) return;
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    out.walked += 1;
    out.types[s.type] = (out.types[s.type] ?? 0) + 1;
    out.sections.push({ where: `${where}#${out.sections.length}`, type: s.type, content: s.content ?? {} });
    for (const slot of SLOTS) walk(s?.content?.[slot], where, out, depth + 1);
  }
}

async function readStored() {
  if (!process.env.MONGODB_URI) die('MONGODB_URI not set — pass --env-file=.env.local');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;
  const out = { walked: 0, types: {}, sections: [] };
  const pages = await (await requireCollection(db, 'page_builder_pages')).find({}).toArray();
  const versions = await (await requireCollection(db, 'page_versions')).find({}).toArray();
  for (const d of pages) {
    walk(d.sections, `live:${d.slug}`, out);
    walk(d?.draft?.sections, `draft:${d.slug}`, out);
  }
  const before = out.walked;
  for (const v of versions) walk(v?.snapshot?.sections, `v${v.versionNumber}:${v.pageId}`, out);
  if (versions.length > 0 && out.walked === before) {
    die(`page_versions has ${versions.length} docs but the walk found 0 sections — wrong path`);
  }
  await mongoose.disconnect();
  return out;
}

/** git source -> plain JS on disk outside src/, importable by the loader. */
function materialise(file, outPath, mutate = (s) => s) {
  const src = mutate(execFileSync('git', ['show', `${BASE_REF}:${file}`], { encoding: 'utf8' }))
    .replace(/from '\.\//g, "from '@/components/pageBuilder/")
    .replace(/from '\.\.\//g, "from '@/components/");
  const { code } = transform(src, { transforms: ['jsx'], jsxRuntime: 'automatic', production: true });
  writeFileSync(outPath, code, 'utf8');
}

if (existsSync(OUT)) die(`${path.relative(ROOT, OUT)} already exists — another run is in flight, or one crashed.`);

const stored = await readStored();
materialise(RENDERER, OUT);

const report = { baseRef: BASE_REF };
try {
  const { SectionRenderer: Now } = await import('@/components/pageBuilder/SectionRenderer');
  const { SectionRenderer: Then } = await import('../scripts/_baseline_SectionRenderer.generated.mjs');

  report['── THE WALK, AND ITS THREE CONTROLS ──'] = '';
  report.sectionsWalked = stored.walked;
  report.typeHistogram = stored.types;

  const differing = []; const rows = {};
  for (const s of stored.sections) {
    const section = {
      id: 'x', type: s.type, name: '', enabled: true, sortOrder: 0,
      content: s.content, settings: {}, layout: {}, style: {},
      advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
    };
    const draw = (R) => { try { return renderToStaticMarkup(R({ section, path: null, resolvedData: undefined })); }
                          catch (e) { return '<<threw: ' + (e?.message ?? e) + '>>'; } };
    const a = draw(Then);
    const b = draw(Now);
    rows[s.where] = { type: s.type, identical: a === b, bytes: Buffer.byteLength(b, 'utf8') };
    if (a !== b) differing.push(`${s.where} (${s.type})`);
  }

  report['── EVERY STORED SECTION, THROUGH THE PUBLIC PATH ──'] = '';
  report.storedSections = stored.sections.length;
  report.STORED_SECTIONS_DIFFERING = differing;
  report.unchanged = stored.sections.length - differing.length;

  /**
   * THE CONTROL. The same comparison, against a baseline mutated on purpose —
   * one extra class on SectionRenderer's own wrapper. Every section must differ then,
   * or the loop above is not looking at what it claims to.
   */
  const CTRL = path.join(ROOT, 'scripts/_baseline_control.generated.mjs');
  if (existsSync(CTRL)) die('control baseline already exists');
  materialise(RENDERER, CTRL, (s) => s.replace(
    'className={outerClass || undefined}', 'className={(outerClass || "") + " zz-control"}',
  ));
  let controlDiffering = 0;
  try {
    const { SectionRenderer: Ctrl } = await import('../scripts/_baseline_control.generated.mjs');
    for (const s of stored.sections.slice(0, 40)) {
      const section = {
        id: 'x', type: s.type, name: '', enabled: true, sortOrder: 0,
        content: s.content, settings: {}, layout: {}, style: {},
        advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
      };
      const one = (R) => { try { return renderToStaticMarkup(R({ section, path: null, resolvedData: undefined })); }
                           catch { return '<<threw>>'; } };
      if (one(Ctrl) !== one(Now)) controlDiffering += 1;
    }
  } finally { rmSync(CTRL, { force: true }); }

  report['── CONTROL: the comparison CAN report a difference ──'] = '';
  report.controlSectionsCompared = Math.min(40, stored.sections.length);
  report.controlSectionsDiffering = controlDiffering;
  report.controlDiscriminates = controlDiffering === Math.min(40, stored.sections.length);
  report.controlIsMeaningful = differing.length === 0
    ? 'yes — no stored section differs, so the control flag carries information'
    : 'NO — stored sections differ, so controlDiscriminates says nothing (round 41)';
} finally {
  rmSync(OUT, { force: true });
}

console.log(JSON.stringify(report, null, 2));
