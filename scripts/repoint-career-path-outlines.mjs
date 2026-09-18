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
 *   · THE IDENTIFIER IS THE SLUG, AND IT IS PROVEN FIRST. `PUT /career-path/`
 *     is addressed the way the admin form addresses it (api_slug), and each
 *     row is read back by that identifier before its PUT — see
 *     resolveIdentifier() for the failure that taught this.
 *   · ONE PUT PER ROW, ONLY UNDER --apply. Without the flag the exact bodies
 *     are printed and nothing is sent. A failed PUT is printed and the run
 *     continues; rows already on a /files path are skipped as done, so a
 *     partial run is simply re-run.
 */
import { register } from 'node:module';

register(new URL('../test/loader.mjs', import.meta.url));

const { listCareerPaths, getCareerPath } = await import('@/lib/api/career-paths');
const { msdbUpdate } = await import('@/lib/api/msdb-write');
// The derivation is the app's, not a copy: what this script links to is what
// the upload button will overwrite.
const { careerOutlineSlugKey, careerOutlinePublicPath, CAREER_OUTLINE_CATEGORY, isFilesPdfPath } =
  await import('@/lib/career-paths/careerPathOutline');

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

/**
 * ── THE IDENTIFIER IS THE SLUG, PROVEN BY A READ-BACK ────────────────────────
 * The first --apply of this script sent `PUT /career-path/<_id>` and MSDB
 * answered "Not found" on the first row. The `_id` was MSDB's own (it came
 * from this same list read and equals the mirror's `career_path_id`) — the
 * career-path write resource is simply not addressed by it. The admin form,
 * which saves in production every day, addresses it by the SLUG:
 *
 *   const upstreamRef = existing.api_slug || existing.career_path_id;
 *   await msdbUpdate('career-path', upstreamRef, payload);     // career-paths.js
 *
 * So this script does what the form does: slug first, `_id` only for a row
 * that has no slug — and BEFORE any write it reads the row back by that very
 * identifier (`?slug=`) and checks it is the career path it thinks it is.
 * A row whose identifier does not resolve, or resolves to a different `_id`,
 * is skipped with the reason printed. No write is ever sent on an identifier
 * that was not just proven to resolve.
 */
async function resolveIdentifier(item) {
  const slug = String(item?.slug ?? '').trim();
  const listedId = String(item?._id ?? '');
  if (!slug) {
    return { ok: false, ref: listedId, reason: 'no slug on the row — the form would fall back to _id, but that is the identifier that just 404ed; not writing' };
  }
  let back;
  try {
    back = await getCareerPath(slug);
  } catch (err) {
    return { ok: false, ref: slug, reason: `read-back by slug failed: ${err?.message ?? err}` };
  }
  if (!back) return { ok: false, ref: slug, reason: 'read-back by slug returned nothing' };
  if (String(back.slug ?? '') !== slug) {
    return { ok: false, ref: slug, reason: `read-back by slug returned slug "${back.slug}"` };
  }
  if (listedId && String(back._id ?? '') !== listedId) {
    return { ok: false, ref: slug, reason: `read-back _id ${back._id} differs from listed _id ${listedId}` };
  }
  return { ok: true, ref: slug, links: back.links && typeof back.links === 'object' ? back.links : {} };
}

const { items } = await listCareerPaths({ limit: 100, status: 'all' });
if (!items.length) {
  console.error('no career paths returned from MSDB — nothing to do');
  process.exit(1);
}

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${items.length} career paths from MSDB (status=all), targets HEADed on ${SITE}\n`);

const rows = [];
for (const item of items) {
  const apiSlug = String(item?.slug ?? '');
  const links = item?.links && typeof item.links === 'object' ? item.links : {};
  const before = String(links.outlineUrl ?? '');
  const target = targetFor(apiSlug);
  const row = { listedId: String(item?._id ?? ''), apiSlug, before, note: schemeNote(before), target, links, ref: '', head: null };

  if (isFilesPdfPath(before)) {
    // Re-runnable: a row already on one of our paths is done, whether or not
    // it equals today's derived target (the OUT-RDR-named file is a valid
    // /files path that the derivation would not produce).
    row.action = before === target ? 'already done' : 'already done (a /files path that differs from the derived target — left as is)';
    rows.push(row);
    continue;
  }
  row.head = target ? await headTarget(target) : { ok: false, status: 0, type: 'slug not derivable' };
  if (!row.head.ok) {
    row.action = `SKIP — target answered ${row.head.status} ${row.head.type || '(no content-type)'}`;
    rows.push(row);
    continue;
  }
  const ident = await resolveIdentifier(item);
  row.ref = ident.ref;
  if (!ident.ok) {
    row.action = `SKIP — identifier not proven: ${ident.reason}`;
    rows.push(row);
    continue;
  }
  // The links object from the READ-BACK, not the list: it is the row the PUT
  // will merge into, read a moment ago by the identifier the PUT will use.
  row.links = ident.links;
  row.action = APPLY ? 'WRITE' : 'would write';
  rows.push(row);
}

const w = { slug: 50, ref: 50, before: 100, target: 96 };
console.log(
  pad('api_slug', w.slug) + pad('identifier (PUT /career-path/<ref>)', w.ref) + pad('stored outlineUrl (before)', w.before)
    + pad('target (after)', w.target) + 'HEAD    action'
);
console.log('-'.repeat(w.slug + w.ref + w.before + w.target + 24));
for (const r of rows) {
  console.log(
    pad(r.apiSlug, w.slug)
      + pad(r.ref || '—', w.ref)
      + pad(`${r.before || '(empty)'}  [${r.note}]`, w.before)
      + pad(r.target ?? '(not derivable)', w.target)
      + pad(r.head ? String(r.head.status) : '—', 8)
      + r.action
  );
}

const writable = rows.filter((r) => r.action === 'WRITE' || r.action === 'would write');
const done = rows.filter((r) => r.action.startsWith('already done'));
const skipped = rows.filter((r) => r.action.startsWith('SKIP'));
console.log(
  `\nsummary: ${rows.length} rows — ${writable.length} to write, ${done.length} already done, ${skipped.length} skipped`
);
console.log(`no-scheme values found: ${rows.filter((r) => r.note.startsWith('NO SCHEME')).length}`);

console.log('\nbodies (PUT /career-path/<slug>, whole `links` object from the read-back):');
for (const r of writable) {
  console.log(`  ${r.ref}  ${JSON.stringify({ links: { ...r.links, outlineUrl: r.target } })}`);
}

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply to send the PUTs above.');
  process.exit(0);
}

let written = 0;
let failed = 0;
for (const r of writable) {
  const body = { links: { ...r.links, outlineUrl: r.target } };
  try {
    const result = await msdbUpdate('career-path', r.ref, body);
    const after = String(result?.item?.links?.outlineUrl ?? '');
    if (after === r.target) {
      written += 1;
      console.log(`  ok        ${r.apiSlug} → ${after}`);
    } else {
      failed += 1;
      console.log(`  MISMATCH  ${r.apiSlug} — MSDB answered ok but returned outlineUrl "${after}"`);
    }
  } catch (err) {
    failed += 1;
    console.log(`  FAILED    ${r.apiSlug} (PUT /career-path/${r.ref}) — ${err?.message ?? err}`);
  }
}
console.log(
  `\nwritten: ${written}, failed: ${failed}, already done: ${done.length}, skipped: ${skipped.length} (of ${rows.length}).`
    + ' Re-run to retry failures — written rows are skipped as already done.'
    + ' Then run the career-path sync (admin → sync, or wait for the cron) so the genesis mirror catches up.'
);
process.exit(failed ? 1 : 0);
