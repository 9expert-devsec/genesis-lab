/**
 * RE-POINT CAREER-PATH OUTLINE URLs AT /files — dry run by default.
 *
 *   node --env-file=.env.local scripts/repoint-career-path-outlines.mjs           # DRY RUN: reads + HEADs, writes nothing
 *   node --env-file=.env.local scripts/repoint-career-path-outlines.mjs --apply   # writes through msdbUpdate
 *
 * ── WHAT IT CHANGES ─────────────────────────────────────────────────────────
 * Every career path's `links.outlineUrl` in MSDB is a `9exp.link/…` short link
 * today (one of the ten stored WITHOUT a scheme, which the public button renders
 * as a relative href — broken; the genesis mirror had two, and is behind MSDB
 * until the next sync). The ten outline PDFs already live on our own
 * domain under the name round OUT-RDR shipped, with 307 redirects pointing at
 * them:
 *
 *   /files/course-outline/career-<api_slug minus -career-path>-course-outline-th.pdf
 *
 * This script moves the stored value to that path, so the site links to itself
 * and the short links can be re-pointed by hand afterwards, outside this repo.
 *
 * ── THE RULES IT ENFORCES ───────────────────────────────────────────────────
 *   · DERIVED, NOT TYPED. The target comes from `api_slug`; the one file whose
 *     OUT-RDR name does not follow the slug is an explicit entry in OVERRIDES.
 *   · NO ROW IS WRITTEN UNLESS ITS FILE EXISTS. Each target is HEADed on the
 *     live site and must answer 200 application/pdf. A target that does not is
 *     reported and skipped — re-pointing a working (if external) link to a 404
 *     is a strict regression.
 *   · MSDB ONLY. The 6-hour sync overwrites the genesis mirror's `links`
 *     wholesale, so a genesis-side write is undone within the day. The mirror
 *     catches up on the next sync (or /admin/career-paths → sync).
 *   · THE WHOLE `links` OBJECT IS SENT. MSDB's PUT merges at the top level
 *     (see scripts/_probe-msdb-put-semantics.mjs and courses.js's
 *     findByIdAndUpdate note), so `{ links: { outlineUrl } }` alone would drop
 *     detailUrl and signupUrl. The body is `{ links: { ...stored, outlineUrl } }`.
 *   · ONE PUT PER ROW, ONLY UNDER --apply. Without the flag the exact bodies
 *     are printed and nothing is sent.
 */
import { register } from 'node:module';

register(new URL('../test/loader.mjs', import.meta.url));

const { listCareerPaths } = await import('@/lib/api/career-paths');
const { msdbUpdate } = await import('@/lib/api/msdb-write');
// The derivation is the app's, not a copy: what this script links to is what
// the upload button will overwrite.
const { careerOutlineSlugKey, careerOutlinePublicPath, CAREER_OUTLINE_CATEGORY } =
  await import('@/lib/careerPaths/careerPathOutline');

const APPLY = process.argv.includes('--apply');
/**
 * The host whose /files/ rewrite is HEADed. NOT NEXT_PUBLIC_SITE_URL: on a dev
 * machine that is http://localhost:3000, and a dry run that HEADs a server
 * nobody started skips every row for the wrong reason. The files exist in
 * production Cloudinary, so production is the only host that can answer.
 */
const SITE = (process.argv.find((a) => a.startsWith('--site='))?.slice('--site='.length)
  ?? 'https://www.9experttraining.com').replace(/\/$/, '');
const LANG = 'th';

/**
 * api_slug → the file OUT-RDR actually shipped, where it does not follow the
 * slug. Everything else derives through careerOutlinePublicPath. Add a row
 * here, never a special case below. (The lib has no override on purpose — an
 * UPLOAD must land at the derived name; only the existing LINK is allowed to
 * point at the odd file. See careerPathOutline.js.)
 */
const OVERRIDES = Object.freeze({
  'data-engineer-bi-career-path': 'career-data-engineering-and-business-intelligence-course-outline-th.pdf',
});

function targetFor(apiSlug) {
  if (OVERRIDES[apiSlug]) return `/files/${CAREER_OUTLINE_CATEGORY}/${OVERRIDES[apiSlug]}`;
  const key = careerOutlineSlugKey(apiSlug);
  if (!key.ok) return null;
  return careerOutlinePublicPath(key.value, LANG);
}

async function headTarget(publicPath) {
  try {
    const res = await fetch(SITE + publicPath, { method: 'HEAD', redirect: 'follow' });
    const type = res.headers.get('content-type') ?? '';
    return { ok: res.status === 200 && type.startsWith('application/pdf'), status: res.status, type };
  } catch (err) {
    return { ok: false, status: 0, type: err?.message ?? 'fetch failed' };
  }
}

function schemeNote(value) {
  const v = String(value ?? '');
  if (!v) return 'empty';
  if (v.startsWith('/files/')) return 'already /files';
  if (/^https?:\/\//.test(v)) return 'external';
  return 'NO SCHEME (renders as a relative href — broken)';
}

function pad(s, n) {
  const str = String(s ?? '');
  return str.length >= n ? str : str + ' '.repeat(n - str.length);
}

const { items } = await listCareerPaths({ limit: 100 });
if (!items.length) {
  console.error('no career paths returned from MSDB — nothing to do');
  process.exit(1);
}

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${items.length} career paths from MSDB, targets HEADed on ${SITE}\n`);

const rows = [];
for (const item of items) {
  const apiSlug = String(item?.slug ?? '');
  const links = item?.links && typeof item.links === 'object' ? item.links : {};
  const before = String(links.outlineUrl ?? '');
  const target = targetFor(apiSlug);
  const head = target ? await headTarget(target) : { ok: false, status: 0, type: 'slug not derivable' };
  let action;
  if (before === target) action = 'unchanged';
  else if (!head.ok) action = `SKIP — target answered ${head.status} ${head.type || '(no content-type)'}`;
  else action = APPLY ? 'WRITE' : 'would write';
  rows.push({ id: String(item?._id ?? ''), apiSlug, before, note: schemeNote(before), target, head, action, links });
}

const w = { slug: 50, before: 100, target: 96 };
console.log(
  pad('api_slug', w.slug) + pad('stored outlineUrl (before)', w.before) + pad('target (after)', w.target) + 'HEAD    action'
);
console.log('-'.repeat(w.slug + w.before + w.target + 24));
for (const r of rows) {
  console.log(
    pad(r.apiSlug, w.slug)
      + pad(`${r.before || '(empty)'}  [${r.note}]`, w.before)
      + pad(r.target, w.target)
      + pad(`${r.head.status}`, 8)
      + r.action
  );
}

const writable = rows.filter((r) => r.action === 'WRITE' || r.action === 'would write');
const skipped = rows.filter((r) => r.action.startsWith('SKIP'));
const unchanged = rows.filter((r) => r.action === 'unchanged');
console.log(
  `\nsummary: ${rows.length} rows — ${writable.length} to write, ${skipped.length} skipped (file missing), ${unchanged.length} already /files`
);
console.log(`no-scheme values found: ${rows.filter((r) => r.note.startsWith('NO SCHEME')).length}`);

console.log('\nbodies (PUT /career-path/<_id>, whole `links` object):');
for (const r of writable) {
  console.log(`  ${r.id}  ${JSON.stringify({ links: { ...r.links, outlineUrl: r.target } })}`);
}

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply to send the PUTs above.');
  process.exit(0);
}

let written = 0;
for (const r of writable) {
  const body = { links: { ...r.links, outlineUrl: r.target } };
  const result = await msdbUpdate('career-path', r.id, body);
  const after = String(result?.item?.links?.outlineUrl ?? '');
  console.log(`  ${after === r.target ? 'ok ' : 'MISMATCH'} ${r.apiSlug} → ${after}`);
  if (after === r.target) written += 1;
}
console.log(`\nwritten: ${written}/${writable.length}. Run the career-path sync (admin → sync, or wait for the cron) so the genesis mirror catches up.`);
