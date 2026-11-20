/**
 * PAGE CATALOGS ON VERCEL BLOB — the names, the narrow rewrite and the URL
 * check. Pure, and ALIAS-FREE on purpose.
 *
 * ══ WHY THIS FILE EXISTS APART FROM lib/pageCatalog.js ══════════════════════
 *
 * Three consumers need the SAME facts — which kinds exist, what a catalog file
 * is called, where it lives on Blob:
 *   · lib/pageCatalog.js (catalogTarget), inside the Next bundle;
 *   · next.config.mjs, which Node loads directly and which therefore cannot
 *     resolve the `@/` alias pageCatalog.js depends on;
 *   · scripts/migrate-page-catalogs-to-blob.mjs, plain Node for the same reason.
 * So the facts live here, with relative imports only, and pageCatalog.js
 * re-exports them. The rewrite pattern below is BUILT from CATALOG_KINDS and
 * catalogFileName's shape, so the rule that serves a file and the function that
 * names it cannot drift apart.
 *
 * ══ THE ARRANGEMENT (decided — see the round brief) ═════════════════════════
 *
 * Every page catalog lives on Blob, whatever its size, at
 * `page-catalogs/<kind>-<key>-catalog.pdf`, uploaded with no random suffix and
 * overwritten on re-upload. The PUBLIC URL does not change: it stays
 * `/files/catalog/<kind>-<key>-catalog.pdf`, which is what every config row
 * already stores, and ONE narrow build-time rewrite maps it onto Blob. That
 * rule must sit BEFORE the generic /files/ → Cloudinary rules (first match
 * wins), and it must stay NARROW: /files/catalog/ is also an ordinary
 * /admin/media category, and anything there that is not a page catalog stays
 * on Cloudinary.
 */

import { WEBROOT_MAX_BYTES, WEBROOT_RECEIPT_TTL_MS } from './webrootDocuments.mjs';

/** The two entities that may carry a catalog, and the only two. */
export const CATALOG_KINDS = Object.freeze(['program', 'skill']);

/** The /files/ category segment catalogs are published under. */
export const CATALOG_CATEGORY = 'catalog';

/** The Blob folder every page catalog lives in. */
export const PAGE_CATALOG_BLOB_PREFIX = 'page-catalogs';

/** What the token route allows, and nothing else. */
export const PAGE_CATALOG_CONTENT_TYPE = 'application/pdf';

/**
 * 64 MB — the webroot ceiling, by reference rather than by copy. Cloudinary's
 * 10 MB raw limit (RAW_MAX_BYTES) does not apply: these are not on Cloudinary.
 */
export const PAGE_CATALOG_MAX_BYTES = WEBROOT_MAX_BYTES;

/** Single-use upload receipts expire after the same window as the webroot ones. */
export const PAGE_CATALOG_RECEIPT_TTL_MS = WEBROOT_RECEIPT_TTL_MS;

/** The one key shape normaliseKeyForPath produces: lowercase [a-z0-9-]. */
const KEY_SHAPE = /^[a-z0-9-]+$/;

/** `<kind>-<key>-catalog.pdf` — the ONE spelling of a catalog's filename. */
export function catalogFileName(kind, normalisedKey) {
  return `${kind}-${normalisedKey}-catalog.pdf`;
}

/** The root-relative public path — the string stored on every config row. */
export function catalogPublicPathForFile(fileName) {
  return `/files/${CATALOG_CATEGORY}/${fileName}`;
}

/** The Blob pathname a catalog file lives at. */
export function pageCatalogBlobPathname(fileName) {
  return `${PAGE_CATALOG_BLOB_PREFIX}/${fileName}`;
}

/**
 * The filename part of a page catalog, as a regex SOURCE (no anchors), built
 * from CATALOG_KINDS so a third kind would widen the rule automatically.
 * `[^/]+` for the key — the rule only has to recognise a page catalog; the
 * key's stricter shape is enforced where files are NAMED, not where they are
 * served.
 */
export const PAGE_CATALOG_FILE_PATTERN =
  `(?:${CATALOG_KINDS.join('|')})-[^/]+-catalog\\.pdf`;

const FILE_RE = new RegExp(`^${PAGE_CATALOG_FILE_PATTERN}$`);

/** Is this a page-catalog filename (case-sensitive, as Blob pathnames are)? */
export function isPageCatalogFileName(fileName) {
  return FILE_RE.test(String(fileName ?? ''));
}

/**
 * The file a receipt authorises, re-derived from (kind, key) — never from what
 * the client asked for. `null` when either is malformed.
 */
export function pageCatalogFileFor(kind, normalisedKey) {
  if (!CATALOG_KINDS.includes(String(kind ?? ''))) return null;
  if (!KEY_SHAPE.test(String(normalisedKey ?? ''))) return null;
  return catalogFileName(kind, normalisedKey);
}

function trimBase(blobBase) {
  return String(blobBase ?? '').trim().replace(/\/+$/, '');
}

/**
 * THE REWRITE. One rule, inert without a store — the same convention as
 * webrootRewrites(): pointing a rewrite at an undefined origin would turn a
 * working URL into a broken destination.
 *
 * `/files/catalog/:file(<pattern>)` → `${BLOB_PUBLIC_BASE}/page-catalogs/:file`
 */
export function pageCatalogRewrites(blobBase) {
  const base = trimBase(blobBase);
  if (!base) return [];
  return [{
    source: `/files/${CATALOG_CATEGORY}/:file(${PAGE_CATALOG_FILE_PATTERN})`,
    destination: `${base}/${PAGE_CATALOG_BLOB_PREFIX}/:file`,
  }];
}

/** The exact public Blob URL a catalog file must have. */
export function expectedPageCatalogBlobUrl(blobBase, fileName) {
  return `${trimBase(blobBase)}/${pageCatalogBlobPathname(fileName)}`;
}

/**
 * THE SERVER-SIDE CHECK ON WHAT THE BROWSER REPORTS AFTER upload().
 *
 * Returns `null` when acceptable, or a Thai reason. The URL must be EXACTLY
 * `${BLOB_PUBLIC_BASE}/page-catalogs/<the file this page owns>` — not merely
 * inside the store — and the pathname, when given, must be that file's
 * pathname. "Starts with the base" alone would accept another page's catalog.
 */
export function refusePageCatalogBlobUpload({ url, pathname, blobBase, fileName } = {}) {
  const base = trimBase(blobBase);
  if (!base) return 'ไม่ได้ตั้งค่า BLOB_PUBLIC_BASE — ไม่สามารถตรวจสอบไฟล์ที่อัปโหลด';
  if (!isPageCatalogFileName(fileName)) return 'ชื่อไฟล์แคตตาล็อกไม่ถูกต้อง';
  const u = String(url ?? '');
  if (!u.startsWith(`${base}/`)) return 'URL ของไฟล์ไม่ได้อยู่ใน Blob store ของเว็บไซต์';
  if (u !== expectedPageCatalogBlobUrl(base, fileName)) {
    return 'URL ของไฟล์ไม่ตรงกับแคตตาล็อกของหน้านี้';
  }
  if (pathname !== undefined && pathname !== null && String(pathname) !== pageCatalogBlobPathname(fileName)) {
    return 'ตำแหน่งไฟล์ไม่ตรงกับแคตตาล็อกของหน้านี้';
  }
  return null;
}

/** The size refusal for this field: over 64 MB, in the wording the brief set. */
export function refusePageCatalogSize(bytes) {
  const n = Number(bytes);
  if (n === 0) return 'ไฟล์ว่าง (0 ไบต์) — เลือกไฟล์ที่มีข้อมูล';
  if (Number.isFinite(n) && n > PAGE_CATALOG_MAX_BYTES) return 'ไฟล์เกิน 64 MB';
  return null;
}
