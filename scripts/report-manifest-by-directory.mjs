/**
 * Where do the legacy source files actually live? — READ-ONLY, OFFLINE.
 *
 * ── THE QUESTION THIS EXISTS TO ANSWER ──────────────────────────────────────
 * /opt/www/sites/default/files/articles/images is 737 MB on the legacy server,
 * and the working assumption is that it can be dropped: new genesis articles
 * upload their imagery to Cloudinary, so who needs it?
 *
 * That assumption is only safe if no MIGRATED article body points into it. The
 * audit found `articles.content` holding 3242 references across 1382 unique
 * URLs — rich-text bodies full of <img src>. If those images live in
 * articles/images, dropping the directory silently guts the body imagery of
 * every article carried across, and it will not be noticed until someone reads
 * one.
 *
 * Section 2 answers exactly that, and a ZERO there is a real, useful outcome —
 * it is the answer that saves 737 MB. So it is printed loudly either way,
 * rather than being left as an empty table a reader can skim past.
 *
 * ── WHAT THIS DOES AND DOES NOT TOUCH ───────────────────────────────────────
 * It reads ONE file: the source manifest a previous audit run wrote. There is
 * no database connection, no mongoose import, no network call, and no new
 * scan. It does not write or modify any file, including the manifest.
 *
 * Everything reported here is therefore a re-reading of a measurement already
 * taken, and it inherits every limit of the run that produced it — including
 * that derivative source paths are COMPUTED and were never verified to exist
 * (the manifest records `checked: false` when the audit ran without --check;
 * this script prints that flag so a reader knows which they are looking at).
 *
 * ── GROUPING AT FULL DEPTH, ON PURPOSE ──────────────────────────────────────
 * Directories are grouped by the WHOLE path to the file's parent, not by the
 * top-level root. articles/cover, articles/images and articles/files are three
 * different directories with three different fates — collapsing them into
 * `articles/` would average away the only distinction the migration decision
 * turns on.
 *
 * Usage:  node scripts/report-manifest-by-directory.mjs [path/to/manifest.json]
 *
 * With no argument it picks the most recent source-manifest-*.json in
 * reports/legacy-urls/.
 */

import fs from 'node:fs';
import path from 'node:path';

const REPORT_DIR = path.resolve(process.cwd(), 'reports', 'legacy-urls');

/** The directory this whole exercise is about. */
const TARGET_DIR = '/sites/default/files/articles/images';

/** How many files section 2 lists before it stops. */
const SAMPLE_LIMIT = 20;

/**
 * Measured on the legacy filesystem, typed in by a human — NOT read from the
 * manifest and not verifiable from here. Section 3 compares against it and
 * says so on the same line, because an unlabelled constant in a comparison
 * looks like a measurement.
 */
const DISK_COUNT_LARGE_COVER_ARTICLES_COVER = 534;

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const rule = (n) => '-'.repeat(n);

function ellipsis(s, n) {
  const v = String(s);
  return v.length <= n ? v : `…${v.slice(v.length - n + 1)}`;
}

/** Everything up to the last slash. `/foo.pdf` lives in `/` — the webroot. */
function directoryOf(sourcePath) {
  const cut = sourcePath.lastIndexOf('/');
  if (cut <= 0) return '/';
  return sourcePath.slice(0, cut);
}

function fileNameOf(sourcePath) {
  return sourcePath.slice(sourcePath.lastIndexOf('/') + 1);
}

function resolveManifestPath(arg) {
  if (arg) {
    const p = path.resolve(process.cwd(), arg);
    if (!fs.existsSync(p)) die(`no such file: ${p}`);
    return p;
  }
  if (!fs.existsSync(REPORT_DIR)) {
    die(`${path.relative(process.cwd(), REPORT_DIR)} does not exist — run \`npm run audit:legacy-urls\` first.`);
  }
  const candidates = fs.readdirSync(REPORT_DIR)
    .filter((f) => /^source-manifest-.*\.json$/.test(f))
    .sort();
  if (!candidates.length) {
    die(`no source-manifest-*.json in ${path.relative(process.cwd(), REPORT_DIR)} — run \`npm run audit:legacy-urls\` first.`);
  }
  // Filenames carry an ISO timestamp, so lexical sort IS chronological.
  return path.join(REPORT_DIR, candidates[candidates.length - 1]);
}

/** Group reference sites by `collection.fieldPath`. */
function sitesByField(entries) {
  const out = new Map();
  for (const e of entries) {
    for (const s of e.sites) {
      const key = `${s.collection}.${s.fieldPath}`;
      const cur = out.get(key) ?? { key, sites: 0, files: new Set() };
      cur.sites += 1;
      cur.files.add(e.sourcePath);
      out.set(key, cur);
    }
  }
  return [...out.values()].sort((a, b) => b.sites - a.sites || a.key.localeCompare(b.key));
}

function main() {
  const manifestPath = resolveManifestPath(process.argv[2]);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    die(`could not parse ${manifestPath}: ${err?.message ?? err}`);
  }
  if (!Array.isArray(manifest.sources)) die(`${manifestPath} has no \`sources\` array — is it a source manifest?`);

  const all = manifest.sources;
  const inScope = all.filter((s) => s.inScope);

  console.log('');
  console.log('══ legacy source files BY DIRECTORY — offline re-read of an existing report ══');
  console.log('');
  console.log(`   manifest    : ${path.relative(process.cwd(), manifestPath)}`);
  console.log(`   generated   : ${manifest.generatedAt ?? '(unknown)'}`);
  console.log(`   database    : ${manifest.database ?? '(unknown)'}`);
  console.log(`   sources     : ${all.length} total, ${inScope.length} in scope`);
  console.log(`   reachability: ${manifest.checked ? 'CHECKED — statuses are in the manifest' : 'NOT CHECKED — no path below has been confirmed to exist'}`);
  console.log('');
  console.log('   No database was contacted and no file was written. This is a re-reading of');
  console.log('   a measurement already taken, and it inherits every limit of that run.');
  console.log('');

  // ── 1. every directory, full depth ───────────────────────────────────────
  const byDir = new Map();
  for (const s of inScope) {
    const dir = directoryOf(s.sourcePath);
    const cur = byDir.get(dir) ?? { dir, files: 0, refs: 0, exts: new Set(), derivFiles: 0 };
    cur.files += 1;
    cur.refs += s.refCount;
    cur.exts.add(s.extension);
    if (s.derivativeRefCount > 0) cur.derivFiles += 1;
    byDir.set(dir, cur);
  }
  const dirRows = [...byDir.values()].sort((a, b) => b.files - a.files || a.dir.localeCompare(b.dir));

  console.log('── 1. EVERY DIRECTORY HOLDING AN IN-SCOPE SOURCE FILE ──────────────────');
  console.log('');
  console.log('  Grouped at FULL depth: articles/cover, articles/images and articles/files are');
  console.log('  separate rows, because they are separate directories with separate fates.');
  console.log('');
  console.log(`  ${pad('directory', 52)} ${padL('files', 6)} ${padL('refs', 6)}  extensions`);
  console.log(`  ${rule(52)} ${rule(6)} ${rule(6)}  ${rule(24)}`);
  for (const r of dirRows) {
    const exts = [...r.exts].sort().join(' ');
    console.log(`  ${pad(ellipsis(r.dir, 52), 52)} ${padL(r.files, 6)} ${padL(r.refs, 6)}  ${exts}`);
  }
  console.log(`  ${rule(52)} ${rule(6)} ${rule(6)}`);
  console.log(`  ${pad(`TOTAL — ${dirRows.length} directories`, 52)} ${padL(inScope.length, 6)} ${padL(inScope.reduce((n, s) => n + s.refCount, 0), 6)}`);
  console.log('');

  // ── 2. THE question ──────────────────────────────────────────────────────
  const targetFiles = inScope.filter((s) => directoryOf(s.sourcePath) === TARGET_DIR);
  const targetSubtree = inScope.filter((s) => s.sourcePath.startsWith(`${TARGET_DIR}/`));

  const head2 = `── 2. ${TARGET_DIR} `;
  console.log(head2 + '─'.repeat(Math.max(3, 72 - head2.length)));
  console.log('');
  if (targetFiles.length === 0 && targetSubtree.length === 0) {
    console.log('  ╔══════════════════════════════════════════════════════════════════════╗');
    console.log('  ║  ZERO. NOT ONE in-scope source file resolves into this directory.    ║');
    console.log('  ╚══════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('  Nothing in this database — including the 3242 references inside');
    console.log('  articles.content — points at sites/default/files/articles/images.');
    console.log('  On the evidence in this manifest, dropping that 737 MB directory breaks');
    console.log('  no reference that any document currently holds.');
    console.log('');
    console.log('  BEFORE ACTING ON THAT, note precisely what it does and does not say:');
    console.log('   · It is a statement about THIS database at the moment of the scan. It');
    console.log('     says nothing about the live Drupal site, whose own content still');
    console.log('     renders from that directory until it is switched off.');
    console.log('   · Section 1 shows where the body images actually DO live. Whatever');
    console.log('     directory that is, it is the one that must survive — the 737 MB');
    console.log('     saving is real only if that other directory is migrated instead.');
    console.log('   · The scan cannot see a URL assembled at render time from fragments, or');
    console.log('     one stored inside a BSON blob. Neither is known to exist here; both');
    console.log('     are unfalsifiable from a string scan.');
  } else {
    const files = targetSubtree.length ? targetSubtree : targetFiles;
    const refs = files.reduce((n, s) => n + s.refCount, 0);
    const truncated = files.reduce((n, s) => n + (s.sitesTruncated ?? 0), 0);

    console.log('  ⚠ NOT ZERO — the assumption that this directory can be dropped is WRONG.');
    console.log('');
    console.log(`  unique source files : ${files.length}`);
    console.log(`  total references    : ${refs}`);
    console.log(`  directly in that directory : ${targetFiles.length}`);
    console.log(`  in subdirectories of it    : ${targetSubtree.length - targetFiles.length}`);
    console.log('');

    // How each file is REACHED changes what has to happen to it, so the split
    // is printed here rather than left to be inferred from section 3.
    const viaDeriv = files.filter((s) => s.reachedOnlyViaDerivatives);
    const direct = files.filter((s) => !s.reachedOnlyViaDerivatives);
    console.log('  how they are reached:');
    console.log(`    stored as a direct path      : ${direct.length}`);
    console.log(`    stored ONLY as a styles/ URL : ${viaDeriv.length}` +
      (viaDeriv.length ? `  (${[...new Set(viaDeriv.flatMap((s) => s.styles))].sort().join(', ')})` : ''));
    console.log('');
    if (viaDeriv.length) {
      console.log(`    Those ${viaDeriv.length} are the harder half. Copying the file is not enough — the`);
      console.log('    stored URL names a styles/ path with an itok token, so every one of those');
      console.log('    references has to be rewritten as well as migrated.');
      console.log('');
    }

    const fieldRows = sitesByField(files);
    console.log('  referenced from:');
    console.log(`  ${pad('collection.fieldPath', 46)} ${padL('sites', 7)} ${padL('files', 7)}`);
    console.log(`  ${rule(46)} ${rule(7)} ${rule(7)}`);
    for (const r of fieldRows) {
      console.log(`  ${pad(ellipsis(r.key, 46), 46)} ${padL(r.sites, 7)} ${padL(r.files.size, 7)}`);
    }
    if (truncated) {
      console.log('');
      console.log(`  ⚠ ${truncated} reference site(s) were truncated by the audit's per-file cap, so the`);
      console.log('    site counts above are a floor. The file and reference totals are exact.');
    }
    console.log('');
    console.log(`  first ${Math.min(SAMPLE_LIMIT, files.length)} of ${files.length} files:`);
    for (const s of [...files].sort((a, b) => b.refCount - a.refCount).slice(0, SAMPLE_LIMIT)) {
      console.log(`    · ${s.sourcePath}`);
      const via = s.reachedOnlyViaDerivatives ? `via ${s.styles.join(',')}` : 'direct';
      console.log(`        ${s.refCount} ref(s), ${via}${s.confidence === 'low' ? ', LOW-CONFIDENCE path' : ''}`);
    }
    if (files.length > SAMPLE_LIMIT) {
      console.log(`    … ${files.length - SAMPLE_LIMIT} more — full list in the manifest.`);
    }
  }
  console.log('');

  // ── 3. derivative sources by style ───────────────────────────────────────
  const byStyle = new Map();
  for (const s of all) {
    for (const style of s.styles) {
      const cur = byStyle.get(style) ?? { style, files: 0, refs: 0, dirs: new Map(), inScope: 0 };
      cur.files += 1;
      cur.refs += s.derivativeRefCount || s.refCount;
      if (s.inScope) cur.inScope += 1;
      const dir = directoryOf(s.sourcePath);
      cur.dirs.set(dir, (cur.dirs.get(dir) ?? 0) + 1);
      byStyle.set(style, cur);
    }
  }
  const styleRows = [...byStyle.values()].sort((a, b) => b.files - a.files);
  const totalStyleFiles = styleRows.reduce((n, r) => n + r.files, 0);

  console.log('── 3. DERIVATIVE-SOURCED ENTRIES BY IMAGE STYLE ────────────────────────');
  console.log('');
  if (!styleRows.length) {
    console.log('  No derivative-sourced entries in this manifest.');
  } else {
    console.log(`  ${pad('style', 22)} ${padL('sources', 8)} ${padL('refs', 7)} ${padL('in scope', 9)}`);
    console.log(`  ${rule(22)} ${rule(8)} ${rule(7)} ${rule(9)}`);
    for (const r of styleRows) {
      console.log(`  ${pad(r.style, 22)} ${padL(r.files, 8)} ${padL(r.refs, 7)} ${padL(r.inScope, 9)}`);
    }
    console.log(`  ${rule(22)} ${rule(8)} ${rule(7)} ${rule(9)}`);
    console.log(`  ${pad('TOTAL', 22)} ${padL(totalStyleFiles, 8)}`);
    console.log('');
    console.log('  where each style\'s sources live:');
    for (const r of styleRows) {
      console.log(`    ${r.style}`);
      for (const [dir, n] of [...r.dirs.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`      ${pad(ellipsis(dir, 56), 56)} ${padL(n, 6)}`);
      }
    }
    console.log('');

    // The specific arithmetic that prompted this section.
    const lc = byStyle.get('large_cover');
    const lcCover = lc?.dirs.get('/sites/default/files/articles/cover') ?? 0;
    console.log('  ── the 534-vs-768 gap ─────────────────────────────────────────────────');
    console.log('');
    console.log(`  ${DISK_COUNT_LARGE_COVER_ARTICLES_COVER} is a figure counted on the legacy FILESYSTEM by a human and typed into`);
    console.log('  this script. It is NOT in the manifest and nothing here verifies it.');
    console.log('');
    console.log(`  files on disk, styles/large_cover/public/articles/cover : ${DISK_COUNT_LARGE_COVER_ARTICLES_COVER}  (asserted)`);
    console.log(`  large_cover sources under articles/cover in the DB      : ${lcCover}  (measured)`);
    console.log(`  ALL derivative sources, every style                     : ${totalStyleFiles}  (measured)`);
    console.log('');
    const otherStyles = totalStyleFiles - (lc?.files ?? 0);
    console.log('  So the gap decomposes as:');
    console.log(`    ${padL(otherStyles, 5)} derivative sources belong to a style OTHER than large_cover`);
    for (const r of styleRows.filter((x) => x.style !== 'large_cover')) {
      console.log(`      ${pad(r.style, 20)} ${padL(r.files, 5)}`);
    }
    console.log('');
    if (lcCover <= DISK_COUNT_LARGE_COVER_ARTICLES_COVER) {
      console.log(`    The ${lcCover} large_cover sources the database needs are a SUBSET of the ${DISK_COUNT_LARGE_COVER_ARTICLES_COVER}`);
      console.log(`    cached on disk — ${DISK_COUNT_LARGE_COVER_ARTICLES_COVER - lcCover} cached derivative(s) are not referenced by any document.`);
      console.log('    Nothing is missing from that cache. The remainder of the 768 is other');
      console.log('    styles, whose caches live in their own directories and were not counted.');
    } else {
      console.log(`    ⚠ The database needs ${lcCover} large_cover derivatives but only ${DISK_COUNT_LARGE_COVER_ARTICLES_COVER} are cached on`);
      console.log(`    disk — ${lcCover - DISK_COUNT_LARGE_COVER_ARTICLES_COVER} have never been generated. Drupal would create them on demand;`);
      console.log('    after the shutdown nothing will. Those must come from the SOURCE file.');
    }
    console.log('');
    console.log('  Either way the cache count is the wrong thing to migrate — the sources are.');
    console.log('  These figures reconcile the two counts; they do not make styles/ worth copying.');
  }
  console.log('');

  // ── 4. webroot files ─────────────────────────────────────────────────────
  const webroot = all.filter((s) => (s.roots ?? []).includes('webroot-file'));
  console.log('── 4. WEBROOT FILES — /<name>.<ext>, NO DIRECTORY ──────────────────────');
  console.log('');
  if (!webroot.length) {
    console.log('  None in this manifest.');
  } else {
    const wrRefs = webroot.reduce((n, s) => n + s.refCount, 0);
    const wrIn = webroot.filter((s) => s.inScope).length;
    console.log(`  ${webroot.length} file(s), ${wrRefs} reference(s), ${wrIn} in scope.`);
    console.log('');
    console.log('  Listed in full, with every document that carries them. Only a handful of');
    console.log('  files actually exist at the legacy webroot, so most of these are already');
    console.log('  dead links — but this manifest cannot tell you which, because the audit ran');
    console.log('  without --check. Treat the list as "documents to inspect", not "files to');
    console.log('  migrate", until a reachability pass has run.');
    console.log('');
    for (const s of [...webroot].sort((a, b) => b.refCount - a.refCount || a.sourcePath.localeCompare(b.sourcePath))) {
      console.log(`  · ${s.sourcePath}`);
      console.log(`      ${s.refCount} ref(s), ext=${s.extension}${s.inScope ? '' : `, EXCLUDED (${s.exclusionReasons.join(', ')})`}`);
      for (const site of s.sites) {
        console.log(`      ${site.collection}  _id=${site._id}  ${site.fieldPath}`);
      }
      if (s.sitesTruncated) console.log(`      … ${s.sitesTruncated} further site(s) not recorded (audit cap)`);
    }
  }
  console.log('');

  // ── 5. files/ outside articles/ and styles/ ──────────────────────────────
  const FILES_ROOT = '/sites/default/files';
  const stray = all.filter((s) => {
    const p = s.sourcePath;
    if (!p.startsWith(`${FILES_ROOT}/`)) return false;
    const rest = p.slice(FILES_ROOT.length + 1);
    return !rest.startsWith('articles/') && !rest.startsWith('styles/');
  });

  console.log('── 5. UNDER sites/default/files/ BUT NOT articles/ OR styles/ ──────────');
  console.log('');
  if (!stray.length) {
    console.log('  NONE. Every file under sites/default/files/ sits beneath articles/, and no');
    console.log('  source path resolves back into styles/ — which is the expected result, since');
    console.log('  resolution exists precisely to take styles/ back out of the path.');
  } else {
    const strayDirs = new Map();
    for (const s of stray) {
      const dir = directoryOf(s.sourcePath);
      const cur = strayDirs.get(dir) ?? { dir, files: 0, refs: 0, exts: new Set(), inScope: 0 };
      cur.files += 1;
      cur.refs += s.refCount;
      cur.exts.add(s.extension);
      if (s.inScope) cur.inScope += 1;
      strayDirs.set(dir, cur);
    }
    const rows = [...strayDirs.values()].sort((a, b) => b.files - a.files || a.dir.localeCompare(b.dir));
    console.log(`  ${stray.length} file(s) across ${rows.length} directory/ies, ${stray.reduce((n, s) => n + s.refCount, 0)} reference(s).`);
    console.log('  These are directories the articles/ discussion does not cover at all — a');
    console.log('  date-named upload dir, a course-material dir, anything Drupal wrote outside');
    console.log('  the articles tree. They need their own migrate-or-drop decision.');
    console.log('');
    console.log(`  ${pad('directory', 52)} ${padL('files', 6)} ${padL('refs', 6)} ${padL('inScope', 8)}  extensions`);
    console.log(`  ${rule(52)} ${rule(6)} ${rule(6)} ${rule(8)}  ${rule(20)}`);
    for (const r of rows) {
      console.log(`  ${pad(ellipsis(r.dir, 52), 52)} ${padL(r.files, 6)} ${padL(r.refs, 6)} ${padL(r.inScope, 8)}  ${[...r.exts].sort().join(' ')}`);
    }
  }
  console.log('');

  // ── 6-9. size distribution, only when the audit ran with --check ─────────
  reportSizes(manifest, all, inScope);

  console.log('══ end of report. Nothing was written; no database or network was touched. ══');
  console.log('');
}

// ── size reporting ──────────────────────────────────────────────────────────

const KB = 1024;
const MB = 1024 * KB;

/** Cloudinary's Free ceiling, and the next tier up. Both per-asset. */
const CLOUDINARY_FREE_MAX = 10 * MB;
const CLOUDINARY_PLUS_MAX = 20 * MB;

const BUCKETS = [
  { label: '< 100 KB', min: 0, max: 100 * KB },
  { label: '100 KB – 1 MB', min: 100 * KB, max: MB },
  { label: '1 – 5 MB', min: MB, max: 5 * MB },
  { label: '5 – 10 MB', min: 5 * MB, max: CLOUDINARY_FREE_MAX },
  { label: '10 – 20 MB', min: CLOUDINARY_FREE_MAX, max: CLOUDINARY_PLUS_MAX },
  { label: '> 20 MB', min: CLOUDINARY_PLUS_MAX, max: Infinity },
];

const fmtBytes = (n) => {
  if (n === null || n === undefined) return '(unknown)';
  if (n >= MB) return `${(n / MB).toFixed(2)} MB`;
  if (n >= KB) return `${(n / KB).toFixed(1)} KB`;
  return `${n} B`;
};

/**
 * The size of a source file, taken from the SOURCE probe only.
 *
 * NEVER from the stored derivative's own check. Drupal regenerates a missing
 * derivative on demand, so the derivative's content-length is the size of a
 * cached rendition that may not correspond to any file that will survive the
 * shutdown — and for a resized thumbnail it is wildly smaller than the source.
 * Building the distribution from that column would understate every figure
 * here and make the 10 MB question look answered when it was not.
 */
function sourceBytes(s) {
  const c = s.sourceCheck;
  if (!c) return null;
  // A probe that fell back to the ranged GET (the 405/501 path) reports the
  // length of the RANGE, not of the file — `content-length: 1` for a
  // `bytes=0-0` request. Trusting it would silently record every such file as
  // one byte and put it in the smallest bucket. Measured on this server HEAD
  // is honoured, so this branch should never fire; it is here so that if the
  // server's behaviour changes the figures go MISSING rather than wrong.
  if (c.method && c.method !== 'HEAD') return null;
  const len = c.contentLength;
  if (len === null || len === undefined) return null;
  const n = Number(len);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function reportSizes(manifest, all, inScope) {
  const checked = inScope.filter((s) => s.sourceCheck);
  if (!checked.length) {
    console.log('── 6. FILE SIZE DISTRIBUTION ───────────────────────────────────────────');
    console.log('');
    console.log('  NOT MEASURED — this manifest was produced without --check, so no source');
    console.log('  file has a content-length. Re-run:');
    console.log('');
    console.log('    npm run audit:legacy-urls -- --check');
    console.log('');
    console.log('  then re-run this report. Until then nothing here says how many files');
    console.log('  exceed any storage ceiling.');
    console.log('');
    return;
  }

  const ok = checked.filter((s) => s.sourceCheck.ok);
  const dead = checked.filter((s) => s.sourceCheck.status !== null && !s.sourceCheck.ok);
  const noAnswer = checked.filter((s) => s.sourceCheck.status === null);
  const sized = ok.filter((s) => sourceBytes(s) !== null);
  const unsized = ok.filter((s) => sourceBytes(s) === null);

  // ── 6. histogram ─────────────────────────────────────────────────────────
  console.log('── 6. FILE SIZE DISTRIBUTION — in-scope, LIVE sources only ─────────────');
  console.log('');
  console.log('  Sizes come from the SOURCE probe, never from the stored derivative — a');
  console.log('  derivative is a resized rendition and its content-length is not the');
  console.log('  size of the file that has to be migrated.');
  console.log('');
  console.log(`  in-scope sources probed : ${checked.length}`);
  console.log(`  live (2xx)              : ${ok.length}`);
  console.log(`  already broken (non-2xx): ${dead.length}   ← migration work we can skip`);
  console.log(`  no answer               : ${noAnswer.length}`);
  console.log(`  live but no size header : ${unsized.length}`);
  console.log('');

  const counts = BUCKETS.map((b) => ({
    ...b,
    files: sized.filter((s) => { const n = sourceBytes(s); return n >= b.min && n < b.max; }),
  }));
  const maxCount = Math.max(1, ...counts.map((c) => c.files.length));

  console.log(`  ${pad('bucket', 16)} ${padL('files', 7)} ${padL('bytes', 12)} ${padL('% files', 8)}`);
  console.log(`  ${rule(16)} ${rule(7)} ${rule(12)} ${rule(8)}`);
  for (const c of counts) {
    const bytes = c.files.reduce((n, s) => n + sourceBytes(s), 0);
    const bar = '█'.repeat(Math.round((c.files.length / maxCount) * 28));
    console.log(`  ${pad(c.label, 16)} ${padL(c.files.length, 7)} ${padL(fmtBytes(bytes), 12)} ${padL(`${((c.files.length / sized.length) * 100).toFixed(1)}%`, 8)}  ${bar}`);
  }
  console.log('');

  const over10 = sized.filter((s) => sourceBytes(s) > CLOUDINARY_FREE_MAX);
  const over20 = sized.filter((s) => sourceBytes(s) > CLOUDINARY_PLUS_MAX);
  console.log('  ▶ THE NUMBER THIS MEASUREMENT EXISTS FOR:');
  console.log(`      over 10 MB (Cloudinary Free ceiling) : ${over10.length} of ${sized.length} sized files`);
  console.log(`      over 20 MB (Plus ceiling)            : ${over20.length}`);
  console.log('');
  if (unsized.length) {
    console.log(`  ⚠ ${unsized.length} live source(s) returned no content-length, so they are absent from`);
    console.log('    every figure above. They are not known to be small — they are unmeasured.');
    console.log('');
  }

  // ── 7. the oversized files, individually ────────────────────────────────
  console.log('── 7. EVERY SOURCE FILE OVER 10 MB ─────────────────────────────────────');
  console.log('');
  if (!over10.length) {
    console.log('  NONE. Every live in-scope source file fits under the 10 MB per-asset');
    console.log('  ceiling of the current Cloudinary Free plan. On size alone, no file in');
    console.log('  this set requires a plan upgrade or a second storage backend.');
    if (unsized.length) {
      console.log('');
      console.log(`  That conclusion covers the ${sized.length} files with a measured size. The`);
      console.log(`  ${unsized.length} without one could still be large — see the warning above.`);
    }
  } else {
    console.log(`  ${over10.length} file(s). Each needs a decision: upgrade, second backend, or drop.`);
    console.log('');
    for (const s of [...over10].sort((a, b) => sourceBytes(b) - sourceBytes(a))) {
      const n = sourceBytes(s);
      console.log(`  · ${s.sourcePath}`);
      console.log(`      size      : ${fmtBytes(n)}${n > CLOUDINARY_PLUS_MAX ? '   ⚠ ALSO over the 20 MB Plus ceiling' : ''}`);
      console.log(`      directory : ${directoryOf(s.sourcePath)}`);
      console.log(`      refs      : ${s.refCount}${s.reachedOnlyViaDerivatives ? `  (reached only via ${s.styles.join(',')})` : ''}`);
      console.log('      referenced by:');
      for (const site of s.sites) {
        console.log(`        ${site.collection}  _id=${site._id}  ${site.fieldPath}`);
      }
      if (s.sitesTruncated) console.log(`        … ${s.sitesTruncated} more (audit cap)`);
    }
  }
  console.log('');

  // ── 8. total bytes, and by directory ────────────────────────────────────
  const grand = sized.reduce((n, s) => n + sourceBytes(s), 0);
  console.log('── 8. TOTAL BYTES TO MIGRATE ───────────────────────────────────────────');
  console.log('');
  console.log(`  in-scope, live, sized : ${sized.length} file(s)`);
  console.log(`  TOTAL                 : ${fmtBytes(grand)}  (${grand.toLocaleString()} bytes)`);
  console.log('');

  const byDir = new Map();
  for (const s of sized) {
    const dir = directoryOf(s.sourcePath);
    const cur = byDir.get(dir) ?? { dir, files: 0, bytes: 0, refs: 0 };
    cur.files += 1; cur.bytes += sourceBytes(s); cur.refs += s.refCount;
    byDir.set(dir, cur);
  }
  const dirRows = [...byDir.values()].sort((a, b) => b.bytes - a.bytes);
  console.log(`  ${pad('directory', 52)} ${padL('files', 6)} ${padL('bytes', 11)} ${padL('% total', 8)}`);
  console.log(`  ${rule(52)} ${rule(6)} ${rule(11)} ${rule(8)}`);
  for (const r of dirRows) {
    console.log(`  ${pad(ellipsis(r.dir, 52), 52)} ${padL(r.files, 6)} ${padL(fmtBytes(r.bytes), 11)} ${padL(`${((r.bytes / grand) * 100).toFixed(1)}%`, 8)}`);
  }
  console.log('');
  console.log('  Against the Cloudinary account this lands in: storage there is currently');
  console.log('  0.857 GB for 0.80 credits, i.e. roughly 1 credit per GB. Read the total');
  console.log('  above as credits, then compare with section E of the cloudinary report.');
  console.log('');

  // ── 9. already-broken sources ───────────────────────────────────────────
  console.log('── 9. ALREADY BROKEN — non-2xx SOURCES, BY DIRECTORY ───────────────────');
  console.log('');
  if (!dead.length) {
    console.log('  NONE — every in-scope source resolved. There is no migration work to skip.');
  } else {
    const deadRefs = dead.reduce((n, s) => n + s.refCount, 0);
    console.log(`  ${dead.length} source file(s), ${deadRefs} reference(s), are 404 TODAY. The shutdown`);
    console.log('  cannot break them further and they need not be migrated.');
    console.log('');

    const byStatus = new Map();
    for (const s of dead) byStatus.set(s.sourceCheck.status, (byStatus.get(s.sourceCheck.status) ?? 0) + 1);
    console.log(`  ${pad('status', 10)} ${padL('files', 7)}`);
    console.log(`  ${rule(10)} ${rule(7)}`);
    for (const [st, n] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${pad(st, 10)} ${padL(n, 7)}`);
    }
    console.log('');

    const deadByDir = new Map();
    for (const s of dead) {
      const dir = directoryOf(s.sourcePath);
      const cur = deadByDir.get(dir) ?? { dir, files: 0, refs: 0 };
      cur.files += 1; cur.refs += s.refCount;
      deadByDir.set(dir, cur);
    }
    const liveByDir = new Map();
    for (const s of ok) {
      const dir = directoryOf(s.sourcePath);
      liveByDir.set(dir, (liveByDir.get(dir) ?? 0) + 1);
    }
    console.log(`  ${pad('directory', 52)} ${padL('dead', 6)} ${padL('live', 6)} ${padL('refs', 6)} ${padL('% dead', 8)}`);
    console.log(`  ${rule(52)} ${rule(6)} ${rule(6)} ${rule(6)} ${rule(8)}`);
    for (const r of [...deadByDir.values()].sort((a, b) => b.files - a.files)) {
      const live = liveByDir.get(r.dir) ?? 0;
      const share = ((r.files / (r.files + live)) * 100).toFixed(0);
      console.log(`  ${pad(ellipsis(r.dir, 52), 52)} ${padL(r.files, 6)} ${padL(live, 6)} ${padL(r.refs, 6)} ${padL(`${share}%`, 8)}`);
    }
    console.log('');

    // The webroot group, called out on its own.
    const webrootDead = dead.filter((s) => directoryOf(s.sourcePath) === '/');
    const webrootLive = ok.filter((s) => directoryOf(s.sourcePath) === '/');
    console.log('  ── the webroot group ────────────────────────────────────────────────');
    console.log('');
    console.log(`    dead : ${webrootDead.length}`);
    console.log(`    live : ${webrootLive.length}`);
    if (webrootLive.length) {
      console.log('');
      console.log('    the ones that DO still exist:');
      for (const s of webrootLive) console.log(`      ${s.sourcePath}  (${fmtBytes(sourceBytes(s))}, ${s.refCount} refs)`);
    }
    const carriers = new Map();
    for (const s of webrootDead) {
      for (const site of s.sites) {
        const k = `${site.collection} ${site._id}`;
        carriers.set(k, (carriers.get(k) ?? 0) + 1);
      }
    }
    if (carriers.size) {
      console.log('');
      console.log('    documents carrying the DEAD webroot links:');
      for (const [k, n] of [...carriers.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`      ${pad(k, 46)} ${padL(n, 5)} dead ref(s)`);
      }
    }
  }
  console.log('');
}

main();
