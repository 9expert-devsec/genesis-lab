/**
 * FULL-TREE LEGACY BACKFILL — PHASE 0, THE PLAN. READ-ONLY.
 *
 *   node --env-file=.env.local scripts/backfill-legacy-tree.mjs
 *   … --json                write the plan + rsync file-lists under reports/
 *
 * ══ WHY A SECOND MIGRATION EXISTS AT ALL ════════════════════════════════════
 *
 * The first migration was DB-REFERENCE-DRIVEN: it walked the database, found
 * 2,139 referenced URLs, and copied the 1,610 files behind them. That was the
 * right scope for "make every page render", and it is the wrong scope for "make
 * every old URL resolve".
 *
 * The difference is the files nobody ever embedded in a page — a course outline
 * PDF a salesperson pasted into an email in 2019, a sample workbook linked from
 * a forum post, a font zip. They are on the old box, no document references
 * them, so the reference-driven audit could not see them, and they 404 today
 * even though the delivery rewrite already covers the root they live under.
 *
 * This script plans that delta from the DISK MANIFEST instead of the database.
 *
 * ── WHY DISK AND NOT HTTP ───────────────────────────────────────────────────
 * migrate-legacy-files.mjs pulls bytes over HTTP from the live legacy origin.
 * At round-1 scale that origin rate-limited, and a 429 body written to
 * Cloudinary is a corrupted asset that the size check then flags as 'failed'.
 * A disk-sourced pull has no rate limit and no error-page-as-content failure
 * mode, so Phase 1 pulls with rsync and verifies each file's size against this
 * manifest BEFORE uploading.
 *
 * ══ WHAT THIS SCRIPT REFUSES TO DECIDE ══════════════════════════════════════
 *
 * It plans and it measures. It uploads nothing, writes nothing to Mongo, and
 * has no --apply. Phase 1 is a separate, reviewed step, because the pre-flight
 * below can and does surface things a human has to rule on — public_id
 * collisions and files whose extension the delivery layer cannot route.
 *
 * ── EVERY DERIVATION IS IMPORTED, NOT RESTATED ──────────────────────────────
 * public_id comes from legacyPathToPublicId(); image-vs-raw comes from the same
 * extension sets the rewrite reads. That is not tidiness: public_id === path is
 * the invariant that lets delivery resolve with no database lookup, and a
 * second copy of the rule in this file would break it silently for whatever
 * this run happens to upload.
 */

import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import {
  legacyPathToPublicId,
  LEGACY_PUBLIC_ID_PREFIX,
  extensionOfPath,
} from '../src/lib/legacyPublicId.js';
import {
  RAW_EXTENSION_LIST,
  IMAGE_EXTENSIONS,
  LEGACY_ROOTS,
  NO_STORE_DOCUMENT_EXTENSIONS,
} from '../src/lib/legacyTransforms.mjs';

const argv = process.argv.slice(2);
const WRITE_JSON = argv.includes('--json');
const TREE = path.resolve(process.cwd(), 'optwww-tree.txt');
const WEBROOT = '/opt/www';

/** Cloudinary per-asset ceiling on this plan. Above it, a file must go to Blob. */
const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024;

const MB = 1024 * 1024;
const mb = (n) => (n / MB).toFixed(2);
const die = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };

/* ── SCOPE ──────────────────────────────────────────────────────────────────
 *
 * Whole roots, plus the CONTENT subdirectories of sites/default/files.
 *
 * These are exactly LEGACY_ROOTS — the roots the delivery rewrite answers on —
 * and that is the point: a file outside them cannot be served by any existing
 * rule, so uploading it would produce a Cloudinary asset with no URL. Anything
 * on disk outside these roots is reported as OUT-OF-SCOPE rather than migrated.
 */
const WHOLE_ROOTS = ['/download/', '/files/', '/images/'];
const SDF = '/sites/default/files/';

/**
 * Drupal-GENERATED subdirectories of sites/default/files. Never migrated.
 *
 * `styles/` is the one that matters most and the one most likely to look like
 * an omission: 8,673 files, 252 MB of image-style DERIVATIVES that Drupal
 * regenerated on demand from the sources. The delivery layer already recovers a
 * styles/ URL by stripping back to its source (measured in the f400091 pass),
 * so copying the cache would spend 252 MB of a bandwidth-constrained quota to
 * duplicate files that already resolve.
 *
 * The rest are machine state: PHP's twig cache, aggregated css/js, translation
 * .po files, the profiler, config exports. `config_*` is a prefix match because
 * Drupal names them config_<hash>.
 */
const EXCLUDED_SDF_DIRS = new Set([
  'styles', 'php', 'css', 'js', 'translations', 'profiler', 'asset_injector',
  'dxpr_theme_STARTERKIT', 'dxpr_theme', 'languages', 'info', 'media-icons',
  'xmlsitemap', 'config',
]);
const isExcludedSdfDir = (d) => EXCLUDED_SDF_DIRS.has(d) || d.startsWith('config_');

/* ── THE SECURITY FILTER ────────────────────────────────────────────────────
 *
 * A disk-driven sweep is fundamentally different from a reference-driven one.
 * The first migration could only ever touch files the database pointed at, so
 * it could not have picked up server code even in principle. This one walks
 * whatever is on the box — and there are 501 .php files inside the roots below,
 * a .htaccess in nearly every directory, and mysql.gz database dumps one level
 * away in /opt/www/private/.
 *
 * So the filter is an ALLOW-LIST, not a deny-list. A deny-list is a promise to
 * have thought of every dangerous extension; an allow-list only promises to
 * have thought of the safe ones, and anything unrecognised is REPORTED rather
 * than migrated. Uploading server source to a public CDN is not a bug you get
 * to fix afterwards.
 *
 * Extensions the DELIVERY LAYER can actually serve are the intersection that
 * matters — see routabilityOf() below. An allowed extension that no rewrite
 * matches is still not migratable, just for a different reason.
 */
const ALLOWED_EXTENSIONS = new Set([
  // images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'ico', 'avif',
  // documents / archives
  'pdf', 'xlsx', 'xls', 'doc', 'docx', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'txt', 'csv', 'rtf', 'pbix',
  // media — allowed by policy, but see routabilityOf(): the rewrite has no
  // rule for these, so they are planned as UNROUTABLE rather than uploaded.
  'mp3', 'mp4', 'wav', 'm4a', 'ogg', 'webm', 'mov',
]);

/** Never migrated, never served. Belt to the allow-list's braces. */
const DENIED_EXTENSIONS = new Set([
  'php', 'phtml', 'php3', 'php4', 'php5', 'phps', 'htaccess', 'htpasswd',
  'inc', 'module', 'install', 'theme', 'profile', 'engine', 'sh', 'bash',
  'sql', 'gz', 'bz2', 'yml', 'yaml', 'twig', 'env', 'ini', 'conf', 'config',
  'js', 'mjs', 'cjs', 'ts', 'css', 'scss', 'less', 'map', 'lock', 'json',
  'html', 'htm', 'xml', 'po', 'pot', 'db', 'sqlite', 'log', 'bak', 'swp',
  'py', 'pl', 'rb', 'exe', 'dll', 'so', 'bat', 'cmd', 'ps1',
]);

/**
 * Reject a path outright — regardless of extension.
 *
 * A DOTFILE is the case that matters: `.htaccess` carries rewrite rules and
 * `.env` carries credentials, and neither has an "extension" that an
 * extension-based filter would ever see. extensionOfPath() returns '' for
 * `.htaccess` (the dot is at index 0), so without this check it would fall into
 * the no-extension bucket and be reported as merely unmapped rather than
 * refused.
 */
function pathIsRefused(publicPath) {
  const name = publicPath.slice(publicPath.lastIndexOf('/') + 1);
  if (name.startsWith('.')) return 'dotfile';
  if (/\.(php|inc|module|install|sh|sql|ya?ml|twig|env)\b/i.test(name)) return 'code/config in name';
  if (/\.(gz|bz2|tar)$/i.test(name)) return 'archive of server state';
  return null;
}

/**
 * Can the DEPLOYED delivery layer actually serve this extension?
 *
 * This is not the same question as "is it safe" and it is not the same question
 * as "did it upload". It is the question that decides whether a migrated file
 * has a working URL, and it is answered from the extension sets the rewrite
 * itself reads:
 *
 *   image ext  → the image catch-all serves it
 *   raw ext    → the raw rule serves it (extension-keyed, ordered first)
 *   neither    → UNROUTABLE. The image catch-all is last and matches ANY path,
 *                so an .mp3 would be requested as image/upload/…mp3 and fail.
 *
 * Measured: the 5 files in /opt/www/images/audio/ are exactly this case.
 * Uploading them without adding a rule produces five assets nobody can fetch.
 */
function routabilityOf(ext) {
  if (IMAGE_EXTENSIONS.has(ext)) return { routable: true, resourceType: 'image' };
  if (RAW_EXTENSION_LIST.includes(ext)) return { routable: true, resourceType: 'raw' };
  return { routable: false, resourceType: null };
}

/* ── PARSE ──────────────────────────────────────────────────────────────── */
if (!fs.existsSync(TREE)) die(`optwww-tree.txt not found at ${TREE}`);
const raw = fs.readFileSync(TREE, 'utf8').split('\n').filter((l) => l.length);
const all = [];
let malformed = 0;
for (const line of raw) {
  const tab = line.indexOf('\t');
  if (tab < 0) { malformed += 1; continue; }
  const size = Number(line.slice(0, tab));
  const diskPath = line.slice(tab + 1);
  if (!Number.isFinite(size) || !diskPath.startsWith(WEBROOT)) { malformed += 1; continue; }
  all.push({ size, diskPath, publicPath: diskPath.slice(WEBROOT.length) });
}

console.log('');
console.log('══ FULL-TREE LEGACY BACKFILL — PHASE 0 (PLAN ONLY, NOTHING IS WRITTEN) ══');
console.log('');
console.log(`  manifest   : optwww-tree.txt — ${raw.length} lines, ${all.length} parsed, ${malformed} malformed`);
console.log(`  webroot    : ${WEBROOT}`);
console.log(`  prefix     : ${LEGACY_PUBLIC_ID_PREFIX}`);
console.log(`  delivery roots: ${LEGACY_ROOTS.map((r) => `/${r}`).join('  ')}`);
console.log(`  Cloudinary ceiling: ${mb(CLOUDINARY_MAX_BYTES)} MB per asset`);
console.log('');

/* ── CLASSIFY EVERY FILE ────────────────────────────────────────────────── */
const inScope = [];
const rejected = { outOfScope: [], generated: [], security: [], unmapped: [], unroutable: [], idError: [] };

for (const f of all) {
  const { publicPath } = f;

  // scope
  const inWhole = WHOLE_ROOTS.some((r) => publicPath.startsWith(r));
  const inSdf = publicPath.startsWith(SDF);
  if (!inWhole && !inSdf) { rejected.outOfScope.push(f); continue; }
  if (inSdf) {
    const rest = publicPath.slice(SDF.length);
    const first = rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : null;
    if (first && isExcludedSdfDir(first)) { rejected.generated.push({ ...f, dir: first }); continue; }
  }

  // security
  const refusal = pathIsRefused(publicPath);
  const ext = extensionOfPath(publicPath).toLowerCase();
  if (refusal) { rejected.security.push({ ...f, reason: refusal }); continue; }
  if (!ext) { rejected.unmapped.push({ ...f, reason: 'no extension' }); continue; }
  if (DENIED_EXTENSIONS.has(ext)) { rejected.security.push({ ...f, reason: `denied .${ext}` }); continue; }
  if (!ALLOWED_EXTENSIONS.has(ext)) { rejected.unmapped.push({ ...f, reason: `not allow-listed .${ext}` }); continue; }

  // routability through the DEPLOYED rewrite
  const { routable, resourceType } = routabilityOf(ext);
  if (!routable) { rejected.unroutable.push({ ...f, ext }); continue; }

  // public_id — imported, never restated
  let info;
  try {
    info = legacyPathToPublicId(publicPath, resourceType, LEGACY_PUBLIC_ID_PREFIX);
  } catch (err) {
    rejected.idError.push({ ...f, error: err.message });
    continue;
  }

  // ROUND-TRIP. If the id does not reproduce the path, pattern-based delivery
  // would request the wrong URL — the same check the first migration ran.
  const back = resourceType === 'raw'
    ? `/${info.publicId.slice(LEGACY_PUBLIC_ID_PREFIX.length + 1)}`
    : `/${info.publicId.slice(LEGACY_PUBLIC_ID_PREFIX.length + 1)}.${info.ext}`;
  const roundTrips = info.substituted ? null : back === publicPath;

  inScope.push({
    ...f, ext, resourceType, publicId: info.publicId,
    substituted: info.substituted, rules: info.rules, roundTrips,
    idTooLong: info.publicId.length > 255,
    root: inWhole ? publicPath.slice(1, publicPath.indexOf('/', 1)) : 'sites/default/files',
    sdfDir: inSdf ? (publicPath.slice(SDF.length).split('/')[0] || '(root)') : null,
  });
}

const sum = (xs) => xs.reduce((a, x) => a + x.size, 0);
console.log('── SCOPE ───────────────────────────────────────────────────────────────');
console.log('');
console.log(`  on disk, whole tree      ${String(all.length).padStart(7)}  ${mb(sum(all)).padStart(10)} MB`);
console.log(`  out of delivery roots    ${String(rejected.outOfScope.length).padStart(7)}  ${mb(sum(rejected.outOfScope)).padStart(10)} MB  (core/, modules/, vendor/, themes/, private/, resources/, file/ …)`);
console.log(`  Drupal-generated         ${String(rejected.generated.length).padStart(7)}  ${mb(sum(rejected.generated)).padStart(10)} MB  (styles/, php/, css/, translations/ …)`);
console.log(`  refused by security      ${String(rejected.security.length).padStart(7)}  ${mb(sum(rejected.security)).padStart(10)} MB`);
console.log(`  no ext / not allow-listed${String(rejected.unmapped.length).padStart(7)}  ${mb(sum(rejected.unmapped)).padStart(10)} MB`);
console.log(`  UNROUTABLE extension     ${String(rejected.unroutable.length).padStart(7)}  ${mb(sum(rejected.unroutable)).padStart(10)} MB  ← no delivery rule exists`);
console.log(`  public_id error          ${String(rejected.idError.length).padStart(7)}  ${mb(sum(rejected.idError)).padStart(10)} MB`);
console.log(`  ${'─'.repeat(68)}`);
console.log(`  DELIVERABLE              ${String(inScope.length).padStart(7)}  ${mb(sum(inScope)).padStart(10)} MB`);
console.log('');

/* ── PRE-FLIGHT: public_id COLLISIONS ──────────────────────────────────────
 *
 * The reference-driven migration ran a collision pre-flight and found none in
 * its 1,610 files. A FULL-TREE sweep is a much larger space and the collision
 * mode is structural, not incidental: an IMAGE public_id DROPS the extension,
 * so `logo.png` and `logo.webp` in one directory map to the SAME id. Whichever
 * uploads second is refused by overwrite:false and recorded 'exists' — and the
 * two legacy URLs then serve ONE file's bytes.
 *
 * That is a wrong-content bug, not a missing-file bug, and it is invisible from
 * a 200. It has to be ruled on by a human, which is why it stops the plan.
 */
const byId = new Map();
for (const f of inScope) {
  if (!byId.has(f.publicId)) byId.set(f.publicId, []);
  byId.get(f.publicId).push(f);
}
const collisions = [...byId.values()].filter((g) => g.length > 1);

const anomalies = {
  collisions,
  roundTripFail: inScope.filter((f) => f.roundTrips === false),
  tooLong: inScope.filter((f) => f.idTooLong),
  substituted: inScope.filter((f) => f.substituted),
};

console.log('── PRE-FLIGHT ──────────────────────────────────────────────────────────');
console.log('');
console.log(`  public_id collisions     ${String(collisions.length).padStart(7)} groups`
  + `  (${collisions.reduce((a, g) => a + g.length, 0)} files)`);
console.log(`  round-trip failures     ${String(anomalies.roundTripFail.length).padStart(7)}`);
console.log(`  public_id > 255 chars   ${String(anomalies.tooLong.length).padStart(7)}`);
console.log(`  substituted ids (&/trim)${String(anomalies.substituted.length).padStart(7)}  → route via the /legacy-file resolver`);
console.log('');
if (collisions.length) {
  console.log('  ⚠ COLLIDING public_ids — these need a human ruling before Phase 1:');
  for (const g of collisions.slice(0, 25)) {
    console.log(`     ${g[0].publicId}`);
    for (const f of g) console.log(`       ${String(f.size).padStart(10)} B  ${f.publicPath}`);
  }
  if (collisions.length > 25) console.log(`     … ${collisions.length - 25} more groups`);
  console.log('');
}
if (anomalies.substituted.length) {
  console.log('  substituted ids (resolver-routed):');
  for (const f of anomalies.substituted.slice(0, 20)) {
    console.log(`     [${f.rules.join(', ')}] ${f.publicPath}`);
  }
  if (anomalies.substituted.length > 20) console.log(`     … ${anomalies.substituted.length - 20} more`);
  console.log('');
}

/* ── DIFF AGAINST legacy_file_migrations ───────────────────────────────── */
const uri = process.env.MONGODB_URI;
if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');
const client = new MongoClient(uri);
await client.connect();
const col = client.db(process.env.MONGODB_DB_NAME || '9exp_genesis').collection('legacy_file_migrations');
const existing = new Map(
  (await col.find({}, {
    projection: { _id: 0, sourcePath: 1, status: 1, sourceBytes: 1, uploadedBytes: 1, publicId: 1 },
  }).toArray()).map((r) => [r.sourcePath, r]),
);
await client.close();

const alreadyUp = [];
const sizeDrift = [];
const backfill = [];
const knownOther = [];
for (const f of inScope) {
  const row = existing.get(f.publicPath);
  if (!row) { backfill.push(f); continue; }
  if (row.status === 'uploaded') {
    if (row.sourceBytes === f.size) alreadyUp.push({ ...f, row });
    else sizeDrift.push({ ...f, row });
    continue;
  }
  // 'exists' / 'failed' / 'skipped-dead' / 'superseded' — recorded but NOT a
  // verified upload. Reported separately: a failed row must be RETRIED, and a
  // skipped-dead row that is present on disk contradicts the audit.
  knownOther.push({ ...f, row });
}

const byStatus = {};
for (const f of knownOther) { byStatus[f.row.status] ??= []; byStatus[f.row.status].push(f); }

console.log('── DIFF vs legacy_file_migrations ──────────────────────────────────────');
console.log('');
console.log(`  collection rows          ${String(existing.size).padStart(7)}`);
console.log('');
console.log(`  ALREADY-UP (skip)        ${String(alreadyUp.length).padStart(7)}  ${mb(sum(alreadyUp)).padStart(10)} MB   status 'uploaded', bytes match disk`);
console.log(`  SIZE-DRIFT (re-upload)   ${String(sizeDrift.length).padStart(7)}  ${mb(sum(sizeDrift)).padStart(10)} MB   recorded bytes ≠ disk bytes`);
console.log(`  BACKFILL (the delta)     ${String(backfill.length).padStart(7)}  ${mb(sum(backfill)).padStart(10)} MB   on disk, deliverable, no row`);
for (const [st, xs] of Object.entries(byStatus)) {
  console.log(`  recorded '${st}'${' '.repeat(Math.max(1, 14 - st.length))}${String(xs.length).padStart(7)}  ${mb(sum(xs)).padStart(10)} MB`);
}
console.log('');
if (sizeDrift.length) {
  console.log('  ⚠ SIZE-DRIFT — recorded upload does not match the disk bytes:');
  for (const f of sizeDrift.slice(0, 20)) {
    console.log(`     disk ${String(f.size).padStart(10)} B  recorded ${String(f.row.sourceBytes).padStart(10)} B  ${f.publicPath}`);
  }
  if (sizeDrift.length > 20) console.log(`     … ${sizeDrift.length - 20} more`);
  console.log('');
}

/* ── STAGES AND THE SIZE SPLIT ─────────────────────────────────────────── */
const toUpload = [...backfill, ...sizeDrift];
const stage1 = toUpload.filter((f) => f.root !== 'sites/default/files');
const stage2 = toUpload.filter((f) => f.root === 'sites/default/files');
const small = (xs) => xs.filter((f) => f.size <= CLOUDINARY_MAX_BYTES);
const big = (xs) => xs.filter((f) => f.size > CLOUDINARY_MAX_BYTES);

const rootTable = {};
for (const f of toUpload) {
  const k = f.root === 'sites/default/files' ? `sites/default/files/${f.sdfDir}` : f.root;
  rootTable[k] ??= { n: 0, b: 0, big: 0 };
  rootTable[k].n += 1; rootTable[k].b += f.size;
  if (f.size > CLOUDINARY_MAX_BYTES) rootTable[k].big += 1;
}

console.log('── THE PLAN, BY ROOT (BACKFILL + SIZE-DRIFT) ───────────────────────────');
console.log('');
console.log('  files        MB   >10MB  root');
for (const [k, v] of Object.entries(rootTable).sort((a, b) => b[1].b - a[1].b)) {
  console.log(`  ${String(v.n).padStart(5)}  ${mb(v.b).padStart(9)}  ${String(v.big).padStart(5)}  ${k}`);
}
console.log('');
console.log('── STAGES ──────────────────────────────────────────────────────────────');
console.log('');
console.log(`  STAGE 1  /files + /download + /images   ${String(stage1.length).padStart(6)} files  ${mb(sum(stage1)).padStart(9)} MB`);
console.log(`             ≤10MB → Cloudinary           ${String(small(stage1).length).padStart(6)} files  ${mb(sum(small(stage1))).padStart(9)} MB`);
console.log(`             >10MB → Blob                 ${String(big(stage1).length).padStart(6)} files  ${mb(sum(big(stage1))).padStart(9)} MB`);
console.log('');
console.log(`  STAGE 2  sites/default/files remainder  ${String(stage2.length).padStart(6)} files  ${mb(sum(stage2)).padStart(9)} MB`);
console.log(`             ≤10MB → Cloudinary           ${String(small(stage2).length).padStart(6)} files  ${mb(sum(small(stage2))).padStart(9)} MB`);
console.log(`             >10MB → Blob                 ${String(big(stage2).length).padStart(6)} files  ${mb(sum(big(stage2))).padStart(9)} MB`);
console.log('');

const allBig = big(toUpload).sort((a, b) => b.size - a.size);
console.log(`── THE ${allBig.length} FILES OVER ${mb(CLOUDINARY_MAX_BYTES)} MB → Vercel Blob ────────────────────────`);
console.log('');
for (const f of allBig) {
  console.log(`  ${mb(f.size).padStart(8)} MB  ${NO_STORE_DOCUMENT_EXTENSIONS.includes(f.ext) ? 'no-store' : '        '}  ${f.publicPath}`);
}
console.log(`  ${'─'.repeat(68)}`);
console.log(`  ${mb(sum(allBig)).padStart(8)} MB  total`);
console.log('');

const blobBase = process.env.BLOB_PUBLIC_BASE;
console.log(`  BLOB_PUBLIC_BASE : ${blobBase ?? '—UNSET— → the Blob half of this plan is BLOCKED'}`);
console.log('');

/* ── THINGS THAT NEED A DECISION, NOT A DEFAULT ────────────────────────── */
if (rejected.unroutable.length) {
  console.log('── UNROUTABLE: allowed content, but NO delivery rule matches ────────────');
  console.log('');
  console.log('  These would upload fine and then be unfetchable. The image catch-all is');
  console.log('  the LAST rule and matches any path, so a non-image, non-raw extension is');
  console.log('  requested as image/upload/<path> and fails. Adding the extension to');
  console.log('  RAW_EXTENSION_LIST is a delivery-layer change, not a migration change.');
  console.log('');
  for (const f of rejected.unroutable.sort((a, b) => b.size - a.size)) {
    console.log(`  ${mb(f.size).padStart(8)} MB  .${f.ext.padEnd(5)} ${f.publicPath}`);
  }
  console.log('');
}

const notAllowListed = rejected.unmapped.filter((f) => /not allow-listed/.test(f.reason));
if (notAllowListed.length) {
  const byExt = {};
  for (const f of notAllowListed) {
    const e = extensionOfPath(f.publicPath).toLowerCase();
    byExt[e] ??= { n: 0, b: 0, sample: f.publicPath };
    byExt[e].n += 1; byExt[e].b += f.size;
  }
  console.log('── NOT ALLOW-LISTED (reported, never uploaded) ──────────────────────────');
  console.log('');
  for (const [e, v] of Object.entries(byExt).sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${String(v.n).padStart(5)}  ${mb(v.b).padStart(9)} MB  .${e.padEnd(8)} e.g. ${v.sample}`);
  }
  console.log('');
}

const secByReason = {};
for (const f of rejected.security) { secByReason[f.reason] ??= { n: 0, b: 0 }; secByReason[f.reason].n += 1; secByReason[f.reason].b += f.size; }
console.log('── SECURITY REFUSALS (inside the roots — this is why the filter exists) ─');
console.log('');
for (const [r, v] of Object.entries(secByReason).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${String(v.n).padStart(5)}  ${mb(v.b).padStart(9)} MB  ${r}`);
}
console.log('');

/* ── OUTPUT FOR PHASE 1 ────────────────────────────────────────────────── */
if (WRITE_JSON) {
  const dir = path.resolve(process.cwd(), 'reports', 'legacy-backfill');
  fs.mkdirSync(dir, { recursive: true });
  const plan = {
    generatedFrom: 'optwww-tree.txt', webroot: WEBROOT,
    cloudinaryMaxBytes: CLOUDINARY_MAX_BYTES,
    counts: {
      deliverable: inScope.length, alreadyUp: alreadyUp.length,
      sizeDrift: sizeDrift.length, backfill: backfill.length,
      stage1: stage1.length, stage2: stage2.length, big: allBig.length,
    },
    collisions: collisions.map((g) => ({ publicId: g[0].publicId, files: g.map((f) => ({ publicPath: f.publicPath, size: f.size })) })),
    unroutable: rejected.unroutable.map((f) => ({ publicPath: f.publicPath, size: f.size, ext: f.ext })),
    sizeDrift: sizeDrift.map((f) => ({ publicPath: f.publicPath, disk: f.size, recorded: f.row.sourceBytes })),
    stage1: stage1.map((f) => ({ publicPath: f.publicPath, size: f.size, ext: f.ext, resourceType: f.resourceType, publicId: f.publicId, substituted: f.substituted })),
    stage2: stage2.map((f) => ({ publicPath: f.publicPath, size: f.size, ext: f.ext, resourceType: f.resourceType, publicId: f.publicId, substituted: f.substituted })),
  };
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 1));
  // rsync --files-from lists: paths RELATIVE to the webroot, one per line, so
  // Phase 1 never rsyncs the whole tree.
  for (const [name, xs] of [['stage1', small(stage1)], ['stage2', small(stage2)], ['big', allBig]]) {
    fs.writeFileSync(path.join(dir, `rsync-${name}.txt`), xs.map((f) => f.publicPath.replace(/^\//, '')).join('\n') + '\n');
  }
  console.log(`  plan + rsync file-lists → ${path.relative(process.cwd(), dir)}/`);
  console.log('');
}

console.log('══ HARD STOP — PHASE 0 IS A PLAN. NOTHING WAS UPLOADED OR RECORDED. ════');
console.log('');
