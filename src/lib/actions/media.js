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
 */

import { v2 as cloudinary } from 'cloudinary';
import { requirePageAction } from '@/lib/rbac/guard';
import { legacyPathToPublicId, LEGACY_PUBLIC_ID_PREFIX } from '@/lib/legacyPublicId';
import {
  extensionOf,
  isValidCategory,
  publicPathFor,
  publicPathFromPublicId,
  refuseUpload,
  resourceTypeFor,
} from '@/lib/legacyUploadPolicy.mjs';

const PAGE_KEY = 'media';

/** Where the file manager works. A subfolder of the legacy tree, not a new one. */
const ROOT_FOLDER = `${LEGACY_PUBLIC_ID_PREFIX}/files`;

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
  try {
    for (const resourceType of ['image', 'raw']) {
      let cursor;
      let pages = 0;
      do {
        const res = await cloudinary.api.resources({
          type: 'upload',
          resource_type: resourceType,
          prefix: `${ROOT_FOLDER}/`,
          max_results: 500,
          next_cursor: cursor,
        });
        for (const r of res.resources ?? []) {
          const rest = String(r.public_id).slice(ROOT_FOLDER.length + 1);
          const cut = rest.indexOf('/');
          // No slash means a file sitting directly under files/ with no
          // category. Not addressable as a tab, so it is not invented as one.
          if (cut <= 0) continue;
          const cat = rest.slice(0, cut);
          counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }
        cursor = res.next_cursor;
        pages += 1;
        // A bound, so a store that grows unexpectedly cannot turn one page load
        // into an unbounded walk of the Admin API.
      } while (cursor && pages < 10);
    }
  } catch (err) {
    // An empty store is a legitimate first-run state, not a failure.
    if (err?.error?.http_code === 404 || err?.http_code === 404) {
      return { ok: true, categories: [] };
    }
    return { ok: false, error: err?.message ?? 'ไม่สามารถอ่านหมวดหมู่ได้', categories: [] };
  }

  return {
    ok: true,
    categories: [...counts.keys()].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * The files in one category.
 *
 * Uses the Admin API's `resources` (prefix listing) rather than the Search API,
 * deliberately: search is index-backed and lags a fresh upload by seconds, which
 * would make a file the admin JUST uploaded appear missing. A prefix listing is
 * immediately consistent.
 *
 * Both resource types are queried because the tree holds images and documents in
 * the same folder and `resources` is scoped to one type per call.
 */
export async function listMediaFiles(category) {
  await requirePageAction(PAGE_KEY);
  if (!isValidCategory(category)) {
    return { ok: false, error: 'ชื่อหมวดหมู่ไม่ถูกต้อง', files: [] };
  }

  const prefix = `${ROOT_FOLDER}/${category}/`;
  const files = [];
  let truncated = false;

  for (const resourceType of ['image', 'raw']) {
    try {
      const res = await cloudinary.api.resources({
        type: 'upload',
        resource_type: resourceType,
        prefix,
        max_results: 200,
      });
      if (res.next_cursor) truncated = true;
      for (const r of res.resources ?? []) {
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
          // A thumbnail only for images, and a SMALL one: this grid can hold 200
          // files and a full-size render each would be a bandwidth own-goal on a
          // plan where bandwidth is most of the spend.
          thumbUrl: resourceType === 'image'
            ? cloudinary.url(r.public_id, {
              secure: true, format: 'webp',
              transformation: [{ width: 160, height: 160, crop: 'fill', quality: 'auto:eco' }],
            })
            : null,
        });
      }
    } catch (err) {
      if (err?.error?.http_code === 404 || err?.http_code === 404) continue;
      return { ok: false, error: err?.message ?? 'ไม่สามารถอ่านไฟล์ได้', files: [] };
    }
  }

  files.sort((a, b) => a.filename.localeCompare(b.filename));
  return { ok: true, files, truncated };
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
  const publicPath = publicPathFor(cat, name);

  let publicId;
  try {
    // The id comes from the shared rule, so `&`, `#` and a trailing space are
    // handled exactly as the backfill handled them and delivery still resolves.
    ({ publicId } = legacyPathToPublicId(publicPath, resourceType, LEGACY_PUBLIC_ID_PREFIX));
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ไม่สามารถสร้าง public_id ได้' };
  }

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
