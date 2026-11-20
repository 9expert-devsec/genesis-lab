/**
 * The ONE-TIME copy of existing page catalogs from Cloudinary to Blob —
 * the planning half, pure and testable. scripts/migrate-page-catalogs-to-blob
 * .mjs is the I/O around this.
 *
 * Why the copy must run BEFORE the rewrite deploys: the moment the narrow
 * `/files/catalog/<kind>-…-catalog.pdf` rule is live, those URLs read from Blob.
 * A catalog that is still only on Cloudinary would 404 from then on.
 *
 * Nothing here touches Mongo or deletes anything: the record's `path` does not
 * change (it is already the public URL), and the Cloudinary original is left
 * where it is — simply no longer served.
 */

import {
  CATALOG_CATEGORY,
  CATALOG_KINDS,
  catalogPublicPathForFile,
  expectedPageCatalogBlobUrl,
  isPageCatalogFileName,
  pageCatalogBlobPathname,
} from './pageCatalogPaths.mjs';

export const COPY_ACTION = Object.freeze({
  COPY: 'copy',
  OVERWRITE: 'copy (Blob size differs — overwrite)',
  SKIP: 'skip (already on Blob, same size)',
  SOURCE_MISSING: 'SOURCE MISSING — broken today',
  BAD_PATH: 'skip (path is not a page catalog)',
});

/**
 * One planned row per config that carries a catalog. `rows` are
 * `{ kind, id, path }`; `cloudBase` is `https://res.cloudinary.com/<cloud>`;
 * `legacyPrefix` is LEGACY_PREFIX — the source URL is exactly what the generic
 * /files/ RAW rewrite serves today.
 */
export function planPageCatalogCopy(rows, { cloudBase, legacyPrefix, blobBase }) {
  const base = String(cloudBase ?? '').replace(/\/+$/, '');
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const kind = String(row?.kind ?? '');
    const path = String(row?.path ?? '').trim();
    const file = path.slice(path.lastIndexOf('/') + 1);
    const valid = CATALOG_KINDS.includes(kind)
      && file.startsWith(`${kind}-`)
      && isPageCatalogFileName(file)
      && path === catalogPublicPathForFile(file);
    if (!valid) {
      return { kind, id: String(row?.id ?? ''), path, file, valid: false, action: COPY_ACTION.BAD_PATH };
    }
    return {
      kind,
      id: String(row?.id ?? ''),
      path,
      file,
      valid: true,
      sourceUrl: `${base}/raw/upload/${legacyPrefix}/files/${CATALOG_CATEGORY}/${file}`,
      blobPathname: pageCatalogBlobPathname(file),
      blobUrl: expectedPageCatalogBlobUrl(blobBase, file),
    };
  });
}

/**
 * What to do with one valid row, given what the two HEADs saw.
 *   sourceStatus  HTTP status of the Cloudinary HEAD
 *   sourceBytes   its content-length (number) or null
 *   blobBytes     size of the existing Blob object, or null when absent
 */
export function decidePageCatalogCopy({ sourceStatus, sourceBytes, blobBytes }) {
  if (Number(sourceStatus) !== 200) {
    // A Blob copy may still exist from an earlier run; keep it, but say the
    // source is broken — the catalog would be broken today without it.
    return blobBytes != null ? COPY_ACTION.SKIP : COPY_ACTION.SOURCE_MISSING;
  }
  if (blobBytes == null) return COPY_ACTION.COPY;
  if (sourceBytes != null && Number(blobBytes) === Number(sourceBytes)) return COPY_ACTION.SKIP;
  return COPY_ACTION.OVERWRITE;
}

/** Does this action write to Blob? */
export function copyActionWrites(action) {
  return action === COPY_ACTION.COPY || action === COPY_ACTION.OVERWRITE;
}
