'use server';

/**
 * /admin/media — the file manager that replaces FileZilla.
 *
 * ══ WHY THE BROWSER UPLOADS DIRECTLY TO CLOUDINARY ══════════════════════════
 *
 * A Vercel serverless function caps its request body at 4.5 MB. A course
 * catalogue PDF is routinely larger, so routing bytes through a Next action or
 * route handler would fail on exactly the files this page exists to move — and
 * fail with an opaque platform error, not a message anyone can act on.
 *
 * So the bytes never touch this app. `signMediaUpload` mints a SIGNED upload —
 * the API secret is used server-side only, and never leaves it — and the browser
 * POSTs the file straight to Cloudinary with that signature.
 *
 * The security filter therefore has to run BEFORE the signature is issued: once
 * a signature exists, the upload is authorised and nothing of ours is in the
 * path to reconsider. That is why refuseUpload() is called here and not in the
 * client, where it would only be a convenience.
 *
 * ── WHY THERE IS NO NEW ROUTE FOR SERVING THESE FILES ───────────────────────
 * public_id is the legacy path, so a file stored at
 * `9exp-genesis/legacy/files/<cat>/<name>` is already served at
 * `/files/<cat>/<name>` by the rewrite deployed in next.config.mjs. Nothing to
 * add, nothing to redirect, no deploy needed for a new upload to be live.
 *
 * ── v2: DELETE AND PAGINATION ───────────────────────────────────────────────
 * The same fact that makes an upload live instantly makes a delete permanent
 * and public: destroying the asset takes the URL down with it, everywhere, at
 * once. So `deleteMediaFile` is the most carefully guarded function in this
 * file — see its header for why the client cannot supply a public_id, and
 * `isWithinFilesCategory` in legacyUploadPolicy.mjs for the prefix check that
 * is the last thing between a crafted request and the rest of the account.
 *
 * RENAME IS NOT HERE AND MUST NOT BE ADDED. A rename changes the public_id,
 * and the public_id IS the URL — so renaming a file breaks every page, article
 * and PDF that already points at it, silently, with no redirect possible.
 * "Upload under the new name, delete the old one" is the honest form of that
 * operation and is already expressible with what this file provides.
 */

import { v2 as cloudinary } from 'cloudinary';
import { requirePageAction } from '@/lib/rbac/guard';
import { dbConnect } from '@/lib/db/connect';
import LegacyFileMigration from '@/models/LegacyFileMigration';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { legacyPathToPublicId, LEGACY_PUBLIC_ID_PREFIX } from '@/lib/legacyPublicId';
import {
  extensionOf,
  FILES_SEGMENT,
  isValidCategory,
  isWithinFilesCategory,
  publicPathFor,
  publicPathFromPublicId,
  refuseDeletePath,
  refuseUpload,
  resourceTypeFor,
} from '@/lib/legacyUploadPolicy.mjs';

const PAGE_KEY = 'media';

/** Where the file manager works. A subfolder of the legacy tree, not a new one. */
const ROOT_FOLDER = `${LEGACY_PUBLIC_ID_PREFIX}/${FILES_SEGMENT}`;

/** The two resource types the legacy tree holds. Nothing else is addressable. */
const RESOURCE_TYPES = ['image', 'raw'];

/**
 * How many assets ONE "load more" fetches, per resource type.
 *
 * v2's pagination is a cursor walk, so this is a page size and not a ceiling —
 * the old 200 was a ceiling, and files past it were simply not reachable from
 * this screen. 50 keeps a click's worth of DOM small (up to 100 rows: 50 image
 * + 50 raw) and, on the live account, means the largest category actually
 * paginates rather than fitting in one page and leaving the cursor path
 * unexercised until the day it matters.
 */
const PAGE_SIZE = 50;

/**
 * Discovery reads ids only, so it takes Cloudinary's maximum per call: it
 * throws away everything but the first path segment, and a smaller page would
 * buy nothing but round trips.
 */
const DISCOVERY_PAGE_SIZE = 500;

/**
 * A runaway bound on the discovery walk — NOT a coverage limit.
 *
 * v1 stopped at 10 pages, which silently capped discovery at 5,000 assets: past
 * that a whole category could exist with no tab, and the screen said nothing.
 * The bound is still here because an unbounded `while (cursor)` against a
 * third-party API is a page load that can never finish, but at 500 × 400 it sits
 * two orders of magnitude above this account's 236 and the walk reports
 * `complete: false` if it ever hits it, instead of quietly truncating.
 */
const MAX_DISCOVERY_PAGES = 400;

/** Cloudinary answers 404 for a prefix nothing is stored under. Not an error. */
function isNotFound(err) {
  return (err?.error?.http_code ?? err?.http_code) === 404;
}

/**
 * IS THIS LISTING ROW A TOMBSTONE FOR AN ASSET THAT HAS BEEN DESTROYED?
 *
 * ══ WITHOUT THIS, EVERY DELETED FILE STAYS IN THE LIST FOREVER ══════════════
 *
 * `uploader.destroy` does NOT remove the record from the Admin API's prefix
 * listing on this account. It converts it: the same call that answers `ok`
 * leaves a row reading `bytes: 0, placeholder: true`, and that row keeps coming
 * back from `api.resources` indefinitely — still there 40 minutes later, and
 * showing no sign of expiring.
 *
 * That is not a cache and it is not lag, which is what it looked like at first.
 * Three measurements say so:
 *
 *   · the flip is INSTANT — the very next listing call after destroy already
 *     reads `bytes: 0, placeholder: true`, for `image` and for `raw` alike.
 *     A stale index would still be showing the old byte count.
 *   · the SEARCH API reports the folder empty at the same moment, and every
 *     delivery URL answers 404 "Resource not found". The asset really is gone.
 *   · a destroy WITH `invalidate: true` and one WITHOUT produced the identical
 *     row, so it is nothing to do with the CDN purge.
 *
 * ── WHY IT IS SAFE TO FILTER ON, MEASURED RATHER THAN ASSUMED ───────────────
 * Swept all 7,001 assets under the legacy prefix: exactly 7 matched, and all 7
 * were the assets destroyed while verifying this feature. Zero false positives
 * across 6,994 real files. The remaining way to create one — uploading a
 * genuinely empty file — is now refused up front by `refuseUpload`, so the
 * premise this filter rests on is enforced rather than merely observed.
 *
 * A 0-byte asset is not a working file anyway: Cloudinary serves a placeholder
 * image for it, so hiding one from the file manager loses nothing an admin
 * could have used.
 */
function isDestroyedRecord(resource) {
  return resource?.placeholder === true || (resource?.bytes ?? 0) === 0;
}

/**
 * ONE page of the Admin API's prefix listing.
 *
 * The single place a cursor is threaded, shared by discovery and by the file
 * list. Two copies of a cursor walk is two chances to pass `next_cursor: null`
 * on a continuation and restart the listing from the beginning — a bug whose
 * symptom is an infinite "load more" that keeps returning page one.
 *
 * A missing prefix comes back as an empty page rather than a throw, because an
 * empty category and an empty store are both legitimate states.
 */
async function fetchResourcePage({ resourceType, prefix, pageSize, cursor }) {
  try {
    const res = await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      prefix,
      max_results: pageSize,
      // `undefined` omits the parameter; `null` would be sent and rejected.
      next_cursor: cursor || undefined,
    });
    return { resources: res.resources ?? [], nextCursor: res.next_cursor ?? null };
  } catch (err) {
    if (isNotFound(err)) return { resources: [], nextCursor: null };
    throw err;
  }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;

/**
 * The categories, DISCOVERED not declared.
 *
 * Read from Cloudinary's folder list rather than a constant, because the whole
 * point of allowing a new category at upload time is that the list grows without
 * a code change. A hardcoded array would be stale the first time someone needs a
 * folder nobody predicted.
 */
export async function listMediaCategories() {
  await requirePageAction(PAGE_KEY);

  /* ── DISCOVERED FROM public_id PREFIXES, NOT FROM THE FOLDER API ──────────
   *
   * `api.sub_folders(ROOT_FOLDER)` is the obvious call and it does not work
   * here — measured: it returns 404 "Can't find folder with path
   * 9exp-genesis/legacy/files" even though 242 assets live under that prefix.
   *
   * The reason is how these assets were created. Every legacy upload sets an
   * explicit `public_id` containing slashes and passes no `folder` parameter, so
   * Cloudinary's FOLDER INDEX has no entry — the path exists only as part of each
   * asset's id. Asking the folder API about it is asking the wrong index.
   *
   * So the categories are derived from the ids themselves: list the assets under
   * the prefix and take the first segment after it. That is immediately
   * consistent (no index to lag), it agrees with delivery by construction, and it
   * is the same fact the URL is built from.
   */
  const counts = new Map();
  // Optimism that the walk can withdraw: false means the runaway bound was hit
  // with a cursor still in hand, so the category list may be short a tab.
  let complete = true;

  try {
    for (const resourceType of RESOURCE_TYPES) {
      let cursor = null;
      let pages = 0;
      do {
        const page = await fetchResourcePage({
          resourceType,
          prefix: `${ROOT_FOLDER}/`,
          pageSize: DISCOVERY_PAGE_SIZE,
          cursor,
        });
        for (const r of page.resources) {
          // A category whose every file has been deleted must stop being a tab,
          // and a category's count must not include files that are gone.
          if (isDestroyedRecord(r)) continue;
          const rest = String(r.public_id).slice(ROOT_FOLDER.length + 1);
          const cut = rest.indexOf('/');
          // No slash means a file sitting directly under files/ with no
          // category. Not addressable as a tab, so it is not invented as one.
          if (cut <= 0) continue;
          const cat = rest.slice(0, cut);
          counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }
        cursor = page.nextCursor;
        pages += 1;
        if (pages >= MAX_DISCOVERY_PAGES) {
          if (cursor) complete = false;
          break;
        }
      } while (cursor);
    }
  } catch (err) {
    // An empty store is a legitimate first-run state, not a failure.
    if (isNotFound(err)) return { ok: true, categories: [], counts: {}, complete: true };
    return {
      ok: false,
      error: err?.message ?? 'ไม่สามารถอ่านหมวดหมู่ได้',
      categories: [],
      counts: {},
      complete: false,
    };
  }

  return {
    ok: true,
    categories: [...counts.keys()].sort((a, b) => a.localeCompare(b)),
    // The walk has already counted every asset to find the categories, so the
    // per-category total is free here and would otherwise cost the file list a
    // full second walk to display "12 of 81".
    counts: Object.fromEntries(counts),
    complete,
  };
}

/**
 * `false` means "this resource type is exhausted", as distinct from `null`,
 * which means "start from the beginning".
 *
 * THE DISTINCTION IS THE WHOLE PAGINATION BUG THIS AVOIDS. Cloudinary signals
 * the end of a listing by OMITTING next_cursor, so the natural representation
 * of "finished" is the same absent value as "not started". Collapse the two and
 * every "load more" click after the last page silently re-fetches page one:
 * duplicate rows, a button that never goes away, and a running count that
 * climbs past the real total. A boolean cannot be mistaken for a cursor, and it
 * survives the server-action serialisation boundary unchanged.
 */
const EXHAUSTED = false;

/** Client input → a cursor per resource type. Anything unrecognised restarts. */
function normalizeCursors(cursors) {
  const one = (v) => {
    if (v === EXHAUSTED) return EXHAUSTED;
    return typeof v === 'string' && v ? v : null;
  };
  return { image: one(cursors?.image), raw: one(cursors?.raw) };
}

/**
 * ONE PAGE of the files in one category.
 *
 * Uses the Admin API's `resources` (prefix listing) rather than the Search API,
 * deliberately: search is index-backed and lags a fresh upload by seconds, which
 * would make a file the admin JUST uploaded appear missing. A prefix listing
 * reflects an upload immediately.
 *
 * ── A DELETE LEAVES A ROW BEHIND, WHICH IS WHY EVERY PAGE IS FILTERED ───────
 * v1's comment above said "immediately consistent" without qualification. For
 * uploads that holds. For DELETES this endpoint keeps the row forever and
 * rewrites it into a `bytes: 0, placeholder: true` tombstone — see
 * `isDestroyedRecord`, which is what every page here is filtered through.
 * Without that filter a deleted file never leaves the screen.
 *
 * ONE CONSEQUENCE IS NOT FILTERABLE, and it is stated rather than hidden:
 * `signMediaUpload` refuses a name that is already taken and asks this same
 * index, which still holds the tombstone. So re-uploading a file under a name
 * just deleted is refused, and the refusal names a file the list no longer
 * shows. Refusing is the safe direction — the alternative is `overwrite` on an
 * id that may not be the one the admin thinks it is — but a same-name re-upload
 * needs `overwrite` handled deliberately, and that is v2.5's problem, not a
 * thing to solve accidentally here.
 *
 * ── WHY THE CURSOR IS A PAIR ────────────────────────────────────────────────
 * The tree holds images and documents in the same folder and `resources` is
 * scoped to ONE resource type per call, so a category is really two independent
 * listings that the screen presents as one. They exhaust at different times —
 * `document` is 17 raw files and no images — so a single cursor cannot describe
 * where the page is. The pair is carried by the client and handed straight back;
 * the server keeps nothing between calls, which is what makes this safe on a
 * serverless runtime where consecutive calls hit different instances.
 *
 * ── WHY "LOAD MORE" AND NOT NUMBERED PAGES ──────────────────────────────────
 * Cloudinary's cursor is forward-only and opaque: there is no way to ask for
 * page 7 without walking pages 1-6, so numbered pages would either re-walk the
 * whole prefix on every click or hold server-side state this runtime cannot
 * keep. "Load more" is what the API can actually do, and it is also what the
 * rest of this admin does with long lists.
 *
 * @param {string} category
 * @param {{image?: string|false, raw?: string|false}} [cursors] omit for page 1
 */
export async function listMediaFiles(category, cursors) {
  await requirePageAction(PAGE_KEY);
  if (!isValidCategory(category)) {
    return { ok: false, error: 'ชื่อหมวดหมู่ไม่ถูกต้อง', files: [], cursors: null, hasMore: false };
  }

  const prefix = `${ROOT_FOLDER}/${category}/`;
  const start = normalizeCursors(cursors);
  const next = { image: EXHAUSTED, raw: EXHAUSTED };
  const files = [];

  for (const resourceType of RESOURCE_TYPES) {
    if (start[resourceType] === EXHAUSTED) continue;
    let page;
    try {
      page = await fetchResourcePage({
        resourceType, prefix, pageSize: PAGE_SIZE, cursor: start[resourceType],
      });
    } catch (err) {
      return {
        ok: false,
        error: err?.message ?? 'ไม่สามารถอ่านไฟล์ได้',
        files: [],
        // The cursors the caller came in with, so a transient failure loses the
        // page rather than the position: clicking again retries the SAME page
        // instead of restarting the category from the top.
        cursors: start,
        hasMore: true,
      };
    }

    for (const r of page.resources) {
      // Destroyed assets keep their row in this listing — see isDestroyedRecord.
      // Skipped HERE rather than in the client, so a second admin, and the same
      // admin after a reload, see the same list as whoever pressed delete.
      if (isDestroyedRecord(r)) continue;
      const publicPath = publicPathFromPublicId(
        r.public_id, LEGACY_PUBLIC_ID_PREFIX, resourceType, r.format,
      );
      if (!publicPath) continue;
      files.push({
        publicId: r.public_id,
        publicPath,
        filename: publicPath.slice(publicPath.lastIndexOf('/') + 1),
        resourceType,
        format: r.format ?? extensionOf(publicPath),
        bytes: r.bytes ?? 0,
        createdAt: r.created_at ?? null,
        // A thumbnail only for images, and a SMALL one: a bandwidth own-goal on
        // a plan where bandwidth is most of the spend.
        thumbUrl: resourceType === 'image'
          ? cloudinary.url(r.public_id, {
            secure: true, format: 'webp',
            transformation: [{ width: 160, height: 160, crop: 'fill', quality: 'auto:eco' }],
          })
          : null,
      });
    }
    next[resourceType] = page.nextCursor ?? EXHAUSTED;
  }

  // Sorted WITHIN the page only. A cursor walk cannot produce a globally sorted
  // list without holding the whole prefix in memory, so the client merges each
  // page into what it already has and sorts there — see MediaClient.
  files.sort((a, b) => a.filename.localeCompare(b.filename));

  return {
    ok: true,
    files,
    cursors: next,
    hasMore: next.image !== EXHAUSTED || next.raw !== EXHAUSTED,
  };
}

/**
 * Mint a signed, single-use upload for ONE file.
 *
 * Everything the browser needs and nothing it should not have: the secret signs
 * the request here and stays here.
 *
 * `overwrite: false` is part of the SIGNED payload, so the browser cannot flip
 * it. That matters more than it looks — it is the backstop that stops an admin
 * silently replacing an existing asset, and the reason a name clash surfaces as
 * a refusal rather than as lost bytes.
 */
export async function signMediaUpload({ category, filename, bytes }) {
  await requirePageAction(PAGE_KEY);

  const cat = String(category ?? '').trim();
  if (!isValidCategory(cat)) {
    return { ok: false, error: 'ชื่อหมวดหมู่ใช้ได้เฉพาะ a-z A-Z 0-9 - _ (ไม่เกิน 64 ตัว)' };
  }

  const name = String(filename ?? '').trim();
  const refusal = refuseUpload({ filename: name, bytes });
  if (refusal) return { ok: false, error: refusal };

  const ext = extensionOf(name);
  const resourceType = resourceTypeFor(ext);
  const requestedPath = publicPathFor(cat, name);

  let publicId;
  try {
    // The id comes from the shared rule, so `&`, `#` and a trailing space are
    // handled exactly as the backfill handled them and delivery still resolves.
    ({ publicId } = legacyPathToPublicId(requestedPath, resourceType, LEGACY_PUBLIC_ID_PREFIX));
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ไม่สามารถสร้าง public_id ได้' };
  }

  /* ── THE URL IS DERIVED FROM THE ID, NOT FROM WHAT WAS TYPED ──────────────
   *
   * MEASURED, and it was wrong in v1. Upload `foo & bar.png` and the id becomes
   * `foo and bar` — that is the whole point of the substitution rule. But v1
   * reported the REQUESTED path back to the browser, so the success panel
   * offered `/files/<cat>/foo & bar.png` for copying, and that URL does not
   * work: next.config.mjs routes any path containing `&` or `#` to the
   * /legacy-file resolver, which finds the file by looking up `sourcePath` in
   * legacy_file_migrations — a collection an admin upload never writes to. The
   * resolver answers 404 `resolver-miss`, so the confirmation said "ไฟล์พร้อม
   * ใช้งานแล้ว" next to a link that had never worked.
   *
   * The path that DOES resolve is the substituted spelling, because that is
   * literally the stored id and the static rewrite reaches it with no function
   * of ours in the way. So it is rebuilt from the id, through the same reverse
   * mapping the file list uses — which also means the URL the success panel
   * shows and the URL the row shows are now the same string, derived the same
   * way, instead of two spellings that only agree when no rule fired.
   */
  const publicPath = publicPathFromPublicId(publicId, LEGACY_PUBLIC_ID_PREFIX, resourceType, ext);

  // Refuse up front if the id is taken. overwrite:false would refuse at
  // Cloudinary anyway, but that surfaces as a bare 4xx in the browser; this
  // says which file is in the way.
  try {
    await cloudinary.api.resource(publicId, { resource_type: resourceType });
    return {
      ok: false,
      error: `มีไฟล์ชื่อนี้อยู่แล้วที่ ${publicPath} — เปลี่ยนชื่อไฟล์ก่อนอัปโหลด`,
    };
  } catch (err) {
    const code = err?.error?.http_code ?? err?.http_code;
    if (code !== 404) {
      return { ok: false, error: err?.message ?? 'ไม่สามารถตรวจสอบไฟล์เดิมได้' };
    }
    // 404 = the id is free. Proceed.
  }

  const timestamp = Math.round(Date.now() / 1000);
  // EXACTLY the params the browser will send, or the signature will not match.
  const toSign = {
    public_id: publicId,
    timestamp,
    overwrite: false,
    unique_filename: false,
  };
  const signature = cloudinary.utils.api_sign_request(toSign, process.env.CLOUDINARY_API_SECRET);

  return {
    ok: true,
    uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD}/${resourceType}/upload`,
    apiKey: process.env.CLOUDINARY_API_KEY,
    params: { ...toSign, signature },
    resourceType,
    publicId,
    publicPath,
  };
}

/**
 * The status a row takes when the asset it describes has been deliberately
 * destroyed from this screen.
 *
 * NOT a hard delete of the row, and the distinction is the point: the migration
 * collection's job is to answer "did that file copy across, and what happened to
 * it". Removing the row answers the first question with silence and makes the
 * second unanswerable — "we never migrated it" and "we migrated it and later
 * removed it" become the same absence. The row stays; only its status moves.
 */
const MIGRATION_STATUS_DELETED = 'deleted';

/**
 * DESTROY ONE ASSET. The only destructive operation on this screen.
 *
 * ══ WHY THE CLIENT CANNOT HAND OVER A public_id ═════════════════════════════
 *
 * `cloudinary.uploader.destroy` takes an id and destroys it, with no notion of
 * which folder this screen manages. If the id arrived from the browser, then
 * ANY authenticated media admin — or anything able to make one request as one —
 * could name `9exp-genesis/legacy/sites/default/files/…` and delete a migrated
 * article image, or a course cover, or the whole account one call at a time.
 *
 * So the id is never accepted. It is DERIVED here, from a public path, through
 * the same `legacyPathToPublicId` the upload and the backfill use — which means
 * a name carrying `&`, `#` or a trailing space resolves to the id those rules
 * actually stored, rather than to a literal that matches nothing.
 *
 * Then it is GUARDED: `isWithinFilesCategory` measures the derived id against
 * the `<prefix>/files/<category>/` root, and anything outside is refused before
 * any destructive call is made. Two independent mechanisms, because derivation
 * alone is an argument about what the code does and the guard is a check on
 * what it produced.
 *
 * `expectedPublicId` is the third: the client sends the id it is showing, and
 * the server REFUSES if its own derivation disagrees. That is not authorisation
 * — it is never used as the delete target — it is a mismatch alarm. Without it,
 * a derivation that quietly produced the wrong id would get `not found` back,
 * the idempotent path would report success, and the row would disappear from
 * the list while the asset stayed live. The failure would look exactly like a
 * successful delete.
 *
 * ── IDEMPOTENT ─────────────────────────────────────────────────────────────
 * Cloudinary answers `not found` for an id that is already gone. Two admins on
 * the same list, or one double click, must not produce an error the second
 * time: the outcome is the same either way — the asset is not there. It is
 * reported honestly (`alreadyGone`) and still audited, because "someone pressed
 * delete" is the event, not "the byte count changed".
 */
export async function deleteMediaFile({ publicPath, resourceType, expectedPublicId } = {}) {
  const session = await requirePageAction(PAGE_KEY);

  const path = String(publicPath ?? '').trim();
  const refusal = refuseDeletePath(path);
  if (refusal) return { ok: false, error: refusal };

  if (!RESOURCE_TYPES.includes(resourceType)) {
    return { ok: false, error: 'ชนิดไฟล์ไม่ถูกต้อง' };
  }

  let publicId;
  try {
    ({ publicId } = legacyPathToPublicId(path, resourceType, LEGACY_PUBLIC_ID_PREFIX));
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ไม่สามารถสร้าง public_id ได้' };
  }

  // ── THE PREFIX GUARD ──────────────────────────────────────────────────────
  if (!isWithinFilesCategory(publicId, LEGACY_PUBLIC_ID_PREFIX)) {
    return {
      ok: false,
      error: `ปฏิเสธการลบ: ไฟล์อยู่นอก /${FILES_SEGMENT}/<หมวดหมู่>/ ที่หน้านี้ดูแล`,
    };
  }

  if (expectedPublicId && expectedPublicId !== publicId) {
    return {
      ok: false,
      error: 'ข้อมูลไฟล์ไม่ตรงกับที่เซิร์ฟเวอร์คำนวณได้ — กรุณาโหลดรายการใหม่แล้วลองอีกครั้ง',
    };
  }

  const category = publicId.slice(`${LEGACY_PUBLIC_ID_PREFIX}/${FILES_SEGMENT}/`.length)
    .split('/')[0];

  // ── DESTROY ───────────────────────────────────────────────────────────────
  // `invalidate: true` purges the CDN copies as well. Without it the bytes are
  // gone from storage while an edge cache keeps answering 200 for hours, which
  // would make the confirmation this screen shows a lie for exactly as long as
  // anyone is likely to check it.
  let outcome;
  try {
    const res = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: 'upload',
      invalidate: true,
    });
    outcome = String(res?.result ?? '');
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ลบไฟล์ไม่สำเร็จ' };
  }

  if (outcome !== 'ok' && outcome !== 'not found') {
    return { ok: false, error: `Cloudinary ตอบกลับว่า "${outcome}" — ยังไม่ได้ลบไฟล์` };
  }
  const alreadyGone = outcome === 'not found';

  // ── THE MIGRATION ROW, IF THERE IS ONE ────────────────────────────────────
  // Most files this screen deletes have no row at all: a v1 upload writes to
  // Cloudinary and nowhere else, so only files that came across in the backfill
  // are recorded. Both cases are normal and the audit row says which happened.
  //
  // A failure here does NOT fail the delete. The asset is already destroyed;
  // reporting an error would tell the admin to retry something that cannot be
  // undone and has already succeeded. It is carried into the audit row instead,
  // where it is visible without being in anyone's way.
  let migration = null;
  try {
    await dbConnect();
    const row = await LegacyFileMigration
      .findOne({ publicId }, { sourcePath: 1, status: 1, note: 1 })
      .lean();
    if (row) {
      const marker = `deleted from /admin/media by ${session.user?.name || session.user?.id || 'admin'}`;
      await LegacyFileMigration.updateOne(
        { _id: row._id },
        {
          $set: {
            status: MIGRATION_STATUS_DELETED,
            // APPENDED, never replaced. `note` carries human judgements — the
            // reason a file was marked `superseded`, say — and overwriting one
            // to record this deletion would destroy the very audit trail this
            // branch exists to preserve.
            note: [row.note, marker].filter(Boolean).join(' | '),
          },
        },
      );
      migration = { sourcePath: row.sourcePath, previousStatus: row.status };
    }
  } catch (err) {
    migration = { error: err?.message ?? 'migration row update failed' };
  }

  // ── THE AUDIT ROW ─────────────────────────────────────────────────────────
  // Scheduled, not awaited: a destructive act that already happened must not be
  // reported as failed because the trail was slow. `media|file` is act_only, so
  // the row is WHO / WHAT / WHEN plus the meta below — the public_id IS the URL
  // that stopped working, which is the fact anyone reading this row wants.
  recordAdminActionAfter({
    menu: PAGE_KEY,
    entity: 'file',
    action: 'delete',
    recordId: publicId,
    recordLabel: path,
    meta: {
      category,
      resourceType,
      publicPath: path,
      cloudinary: outcome,
      migration,
    },
    actor: { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true, publicId, publicPath: path, alreadyGone, migration };
}
