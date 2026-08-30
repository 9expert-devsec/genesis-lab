/**
 * ROUND 60 §H/§K — blast radius, measured against the pre-change components.
 *
 * Rounds 50/57/59's method: pull the baseline out of git, render both over the
 * same shapes, count. The shapes are read out of the DATABASE, so "stored"
 * means stored.
 *
 * ── WHAT THIS COMMIT IS ALLOWED TO CHANGE ────────────────────────────────
 * `rich_text` sections, and only those. A `rich_text` that renders anything at
 * all MUST differ (the class attribute is the whole change); every other
 * section type must be byte-identical. So each stored section is classified:
 *
 *   EXPECTED   — the section IS a rich_text, or CONTAINS one in a nested slot.
 *   UNCHANGED  — anything else, or a rich_text that renders null.
 *   UNEXPECTED — a section with no rich_text anywhere under it that changed.
 *                This must be 0.
 *
 * ── THE FIRST RUN CALLED NINE CONTAINERS UNEXPECTED, AND WAS WRONG ───────
 * `two_column`, `container` and `highlight_grid` NEST child sections and render
 * them through SectionRenderer, so a container holding a rich_text changes when
 * its child does. Classifying on the top-level type alone reported nine false
 * positives — every one of them grown by exactly 135 bytes, the length of the
 * added class string, which is what gave the harness away rather than the code.
 * `containsRichText` walks the same slots the renderer does.
 *
 * The article body is checked BY NAME rather than by absence: the fix could
 * have gone into globals.css's `.article-content` block or into a shared prose
 * wrapper, and did not. `.article-content` and ArticleDetailClient are asserted
 * untouched by this commit's diff in the test file, not here.
 *
 * ── THE CONTROL ──────────────────────────────────────────────────────────
 * "0 unexpected" and "the comparison never ran" print the same number, so
 * fixtures that MUST differ are rendered too. Per round 41, controlDiscriminates
 * is meaningless unless the unexpected count is 0 — reported next to it, in
 * words.
 *
 * ── ROUND 50'S TWO FALSE ZEROS ───────────────────────────────────────────
 * 1. COLLECTION NAME — `pagebuilders` does not exist; it is
 *    `page_builder_pages`. requireCollection EXITS non-zero on a missing name.
 * 2. VERSION PATH — snapshots are at `snapshot.sections`, not `content.sections`;
 *    a non-empty page_versions that walks to zero sections fails the run.
 * Plus a TYPE HISTOGRAM as the third control.
 *
 * READ-ONLY apart from two temp files at src/ ROOT, removed in a finally.
 * (src/ root is covered by none of tailwind.config.js's three content globs. A
 * temp file under src/components is scanned by a watching dev server and its
 * deletion breaks the CSS build — round 59 learned that by serving 500s.)
 *
 * ── DO NOT RUN THIS WHILE `npm test` IS RUNNING ──────────────────────────
 * src/ root dodges Tailwind's globs. It does NOT dodge test/sourceScan.mjs's
 * `walkSources`, which readdir/stats EVERY .js/.jsx/.mjs under src — so a
 * baseline that appears and then vanishes mid-sweep throws ENOENT inside a test
 * file's collection phase. Measured: running this beside a suite made
 * fs/namedImportsResolve.test.mjs contribute ZERO tests, which the runner's own
 * meta-control caught and reported. The suite was fine; the two runs were not.
 *
 * There is no third location: the ESM loader only transpiles .jsx UNDER src/,
 * so the file cannot move out of the sweep's reach. The constraint is therefore
 * documented rather than engineered away, and the guard below catches the
 * script-against-script half of it.
 *
 * Run:
 *   node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round60-rich-text.mjs
 */
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import mongoose from 'mongoose';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = process.cwd();
const TARGET = 'src/components/pageBuilder/sections/rich_text.jsx';
const RENDERER = 'src/components/pageBuilder/SectionRenderer.jsx';
const BASE_REF = process.env.BASE_REF ?? 'HEAD';
const BASELINE = path.join(ROOT, 'src/_baseline_rich_text.generated.jsx');
/**
 * A BASELINE SectionRenderer, so the A/B is real for EVERY type.
 *
 * Comparing a non-rich_text section by rendering the CURRENT SectionRenderer
 * twice proves nothing — both sides import the same leaf, so the answer is
 * identical by construction rather than by measurement. The pre-change
 * SectionRenderer is pulled out of git with its rich_text import rewritten to
 * the baseline leaf, which is the same technique round 59 used for presets.js.
 * Now every section type goes through a genuinely different module graph.
 */
const BASELINE_RENDERER = path.join(ROOT, 'src/_baseline_SectionRenderer.generated.jsx');

const die = (m) => { console.error('x ' + m); process.exit(1); };
const SLOTS = ['children', 'left', 'right'];

/** Is there a rich_text anywhere under this section's content? */
function containsRichText(content, depth = 0) {
  if (!content || typeof content !== 'object' || depth > 12) return false;
  for (const slot of SLOTS) {
    const kids = content[slot];
    if (!Array.isArray(kids)) continue;
    for (const k of kids) {
      if (k?.type === 'rich_text') return true;
      if (containsRichText(k?.content, depth + 1)) return true;
    }
  }
  return false;
}

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
    die(`page_versions has ${versions.length} docs but the walk found 0 sections — wrong path, not a real zero`);
  }
  await mongoose.disconnect();
  return out;
}

/** Docs that MUST render differently — the control. */
const CONTROL = {
  'one paragraph': { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ก' }] }] },
  'paragraph + bullet list': {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'ก' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ข' }] }] },
      ] },
    ],
  },
};

// Script-against-script: a leftover baseline means another run is in flight (or
// crashed). Overwriting it would make two runs share one file and read each
// other's bytes, so this stops rather than guessing.
for (const p of [BASELINE, BASELINE_RENDERER]) {
  if (existsSync(p)) die(`${path.relative(ROOT, p)} already exists — another run is in flight, or one crashed. Remove it and retry.`);
}

const stored = await readStored();
// Both baselines move to src/ ROOT, so their RELATIVE imports have to be
// rewritten to aliased ones or they resolve against the wrong directory.
writeFileSync(
  BASELINE,
  execFileSync('git', ['show', `${BASE_REF}:${TARGET}`], { encoding: 'utf8' })
    .replace(/from '\.\.\//g, "from '@/components/pageBuilder/"),
  'utf8',
);
writeFileSync(
  BASELINE_RENDERER,
  execFileSync('git', ['show', `${BASE_REF}:${RENDERER}`], { encoding: 'utf8' })
    .replace("from './sections/rich_text'", "from '@/_baseline_rich_text.generated.jsx'")
    .replace(/from '\.\//g, "from '@/components/pageBuilder/")
    .replace(/from '\.\.\//g, "from '@/components/"),
  'utf8',
);

const report = { baseRef: BASE_REF };
try {
  const { RichTextSection: Now } = await import('@/components/pageBuilder/sections/rich_text');
  const { RichTextSection: Then } = await import('@/_baseline_rich_text.generated.jsx');
  const { SectionRenderer: NowR } = await import('@/components/pageBuilder/SectionRenderer');
  const { SectionRenderer: ThenR } = await import('@/_baseline_SectionRenderer.generated.jsx');

  report['── THE WALK, AND ITS THREE CONTROLS ──'] = '';
  report.sectionsWalked = stored.walked;
  report.typeHistogram = stored.types;

  /**
   * Every stored section goes through the PUBLIC path (SectionRenderer with
   * path: null), not just the leaf component — §K. `rich_text` is the only type
   * whose component changed, so a difference anywhere else is the finding.
   */
  const expected = []; const unchanged = []; const unexpected = [];
  const rows = {};
  for (const s of stored.sections) {
    const section = {
      id: 'x', type: s.type, name: '', enabled: true, sortOrder: 0,
      content: s.content, settings: {}, layout: {}, style: {},
      advanced: { sectionId: '', customClass: '', customCss: '', customHtml: '' },
    };
    const draw = (R) => { try { return renderToStaticMarkup(R({ section, path: null, resolvedData: undefined })); }
                          catch (e) { return '<<threw: ' + (e?.message ?? e) + '>>'; } };
    const a = draw(ThenR);
    const b = draw(NowR);
    const same = a === b;
    rows[s.where] = {
      type: s.type,
      identical: same,
      bytesBefore: Buffer.byteLength(a, 'utf8'),
      bytesAfter: Buffer.byteLength(b, 'utf8'),
      threw: a.startsWith('<<threw') || b.startsWith('<<threw'),
    };
    const owns = s.type === 'rich_text' || containsRichText(s.content);
    rows[s.where].holdsRichText = owns;
    if (same) unchanged.push(s.where);
    else if (owns) expected.push(s.where);
    else unexpected.push(s.where);
  }

  report['── EVERY STORED SECTION, CLASSIFIED ──'] = '';
  report.storedSections = stored.sections.length;
  report.richTextSections = stored.sections.filter((s) => s.type === 'rich_text').length;
  report.perSection = rows;
  report.EXPECTED_DIFFERING = expected;
  report.UNCHANGED = unchanged.length;
  report.UNEXPECTED_DIFFERING = unexpected;

  const controlRows = {}; const failed = [];
  for (const [name, doc] of Object.entries(CONTROL)) {
    const a = renderToStaticMarkup(Then({ content: { doc } }));
    const b = renderToStaticMarkup(Now({ content: { doc } }));
    controlRows[name] = { differs: a !== b, bytesBefore: Buffer.byteLength(a, 'utf8'), bytesAfter: Buffer.byteLength(b, 'utf8') };
    if (a === b) failed.push(name);
  }
  // …and the other direction: an EMPTY doc must still render nothing.
  const emptyBefore = renderToStaticMarkup(Then({ content: { doc: null } }) ?? '');
  const emptyAfter = renderToStaticMarkup(Now({ content: { doc: null } }) ?? '');
  report['── CONTROL: the comparison CAN report a difference ──'] = '';
  report.controlFixtures = controlRows;
  report.controlFixturesThatFailedToDiffer = failed;
  report.controlDiscriminates = failed.length === 0;
  report.emptyDocStillRendersNothing = emptyBefore === '' && emptyAfter === '';
  report.controlIsMeaningful = unexpected.length === 0
    ? 'yes — the unexpected count is 0, so the control flag carries information'
    : 'NO — unexpected differences exist, so controlDiscriminates says nothing (round 41)';
} finally {
  rmSync(BASELINE, { force: true });
  rmSync(BASELINE_RENDERER, { force: true });
}

console.log(JSON.stringify(report, null, 2));
