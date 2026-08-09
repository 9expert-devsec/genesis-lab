/**
 * WHAT MAY BE UPLOADED INTO THE LEGACY FILE TREE, AND WHERE IT LANDS.
 *
 * THE ONLY DEFINITION OF THIS POLICY. The full-tree backfill
 * (scripts/backfill-upload-stage.mjs) and the admin file manager
 * (/admin/media) both enforce it, and they must enforce the SAME thing — a
 * browser upload that accepts an extension the backfill refuses is a hole in the
 * filter, not a convenience.
 *
 * ── WHY AN ALLOW-LIST, NOT A DENY-LIST ──────────────────────────────────────
 *
 * A deny-list is a promise to have thought of every dangerous extension. An
 * allow-list only promises to have thought of the safe ones, and anything
 * unrecognised is REFUSED rather than uploaded. These files are served from the
 * site's own origin at /files/…, so an accepted `.php` or `.htaccess` is
 * published server-adjacent content — not a bug you get to fix afterwards.
 *
 * The backfill needed this because a disk sweep walks whatever is on the box
 * (501 .php files inside the legacy roots, a .htaccess in most directories).
 * The admin uploader needs it for the sharper reason: the input is a human with
 * a file picker.
 *
 * ── WHY public_id IS THE PATH, RESTATED HERE BECAUSE IT IS THE WHOLE TRICK ──
 *
 * A file uploaded under public_id `9exp-genesis/legacy/files/<cat>/<name>`
 * resolves IMMEDIATELY at `/files/<cat>/<name>` through the rewrite already
 * deployed in next.config.mjs. No new route, no redirect, no deploy. That is why
 * the id must come from legacyPathToPublicId() and nowhere else: it carries the
 * `&`→`and`, `#`→`sharp` and trailing-space rules, so a filename that needs one
 * of them still lands where delivery will look for it.
 */

import { IMAGE_EXTENSIONS, RAW_EXTENSION_LIST } from './legacyTransforms.mjs';

/**
 * The one segment of the legacy tree the file manager owns.
 *
 * Named rather than spelled inline in four places: it is simultaneously a
 * public URL segment, a Cloudinary folder segment and the thing the DELETE
 * guard measures a public_id against. Those three have to be the same string or
 * the guard is checking a prefix nothing is stored under.
 */
export const FILES_SEGMENT = 'files';

/** Cloudinary's raw-asset ceiling on this plan. Above it → the Blob track (v2). */
export const RAW_MAX_BYTES = 10 * 1024 * 1024;

/**
 * A generous ceiling for images, well inside what this Cloudinary plan accepts.
 * Not the authority — Cloudinary is — but it fails fast in the browser instead of
 * after a 20 MB round trip.
 */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Extensions that may be uploaded. Deliberately the same set the backfill
 * allowed, minus media: `mp3`/`mp4` are in neither IMAGE_EXTENSIONS nor
 * RAW_EXTENSION_LIST, so the delivery layer has no rule that could serve them —
 * accepting one would store a file with no working URL.
 */
export const ALLOWED_UPLOAD_EXTENSIONS = Object.freeze([
  // images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'ico', 'avif',
  // documents / archives
  'pdf', 'xlsx', 'xls', 'doc', 'docx', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'txt', 'csv', 'rtf', 'pbix',
]);

/** Never accepted, whatever the allow-list says. Belt to its braces. */
const DENIED_EXTENSIONS = new Set([
  'php', 'phtml', 'php3', 'php4', 'php5', 'phps', 'htaccess', 'htpasswd',
  'inc', 'module', 'install', 'theme', 'profile', 'engine', 'sh', 'bash',
  'sql', 'yml', 'yaml', 'twig', 'env', 'ini', 'conf', 'config',
  'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'css', 'scss', 'map', 'lock', 'json',
  'html', 'htm', 'xml', 'exe', 'dll', 'so', 'bat', 'cmd', 'ps1', 'py', 'pl', 'rb',
]);

/** Extension of a filename, lowercased, or '' when there is none. */
export function extensionOf(name) {
  const s = String(name);
  const dot = s.lastIndexOf('.');
  return dot <= 0 ? '' : s.slice(dot + 1).toLowerCase();
}

/**
 * Cloudinary resource type, from the SAME sets the delivery rewrite reads.
 *
 * Not a local opinion: `image` gets a transformation and drops its extension
 * from the id, `raw` passes through and keeps it. Getting this wrong stores the
 * file where no rule will look for it.
 */
export function resourceTypeFor(ext) {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (RAW_EXTENSION_LIST.includes(ext)) return 'raw';
  return null;
}

/**
 * A category is one path segment: letters, digits, dash, underscore.
 *
 * Narrow on purpose. The category becomes a Cloudinary folder AND a segment of a
 * public URL, so `..`, a slash or a leading dot would either escape the folder or
 * produce a path that does not round-trip. Rejecting is cheap; a file stored
 * outside the tree is not findable again.
 */
export function isValidCategory(category) {
  return typeof category === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(category);
}

/**
 * Is this filename acceptable? Returns `null` when fine, else a reason to show.
 *
 * Reasons are user-facing Thai, because the only caller that shows them is the
 * admin uploader and an English internal string would reach a non-English admin.
 */
export function refuseUpload({ filename, bytes }) {
  const name = String(filename ?? '').trim();
  if (!name) return 'ไม่พบชื่อไฟล์';

  // Path shape. A filename is a NAME, never a path: anything with a separator
  // could place the asset outside its category folder.
  if (/[\\/]/.test(name)) return 'ชื่อไฟล์ต้องไม่มีเครื่องหมาย / หรือ \\';
  if (name.startsWith('.')) return 'ไม่รับไฟล์ที่ขึ้นต้นด้วยจุด (dotfile)';
  if (name.includes('..')) return 'ชื่อไฟล์ต้องไม่มี ..';
  // Characters Cloudinary rejects in a public_id and this project has no
  // reviewed substitution for — see src/lib/legacyPublicId.js. `&` and `#` are
  // deliberately absent: both have reviewed rules and are accepted.
  if (/[?%<>\\]/.test(name)) return 'ชื่อไฟล์มีอักขระที่ระบบไม่รองรับ (? % < > \\)';

  const ext = extensionOf(name);
  if (!ext) return 'ไฟล์ต้องมีนามสกุล';
  if (DENIED_EXTENSIONS.has(ext)) return `ไม่อนุญาตไฟล์ประเภท .${ext}`;
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) return `ยังไม่รองรับไฟล์ประเภท .${ext}`;

  const resourceType = resourceTypeFor(ext);
  if (!resourceType) {
    // Allowed by policy but unroutable by the delivery layer. Refusing is
    // kinder than storing a file whose URL cannot work.
    return `ไฟล์ .${ext} ยังไม่มีเส้นทางการให้บริการ`;
  }

  const size = Number(bytes);
  if (Number.isFinite(size) && size > 0) {
    if (resourceType === 'raw' && size > RAW_MAX_BYTES) {
      return 'ไฟล์เอกสารเกิน 10 MB — เวอร์ชันถัดไปจะรองรับไฟล์ใหญ่ '
        + '(ระหว่างนี้อัปโหลดผ่านเซิร์ฟเวอร์เดิม)';
    }
    if (resourceType === 'image' && size > IMAGE_MAX_BYTES) {
      return 'ไฟล์รูปภาพเกิน 20 MB';
    }
  }
  return null;
}

/**
 * The clean public path for a category + filename. This is the URL the file will
 * be served at, and the string legacyPathToPublicId() must be given.
 */
export function publicPathFor(category, filename) {
  return `/${FILES_SEGMENT}/${category}/${filename}`;
}

/**
 * WHAT MAY BE DELETED, AS A PATH SHAPE. Returns `null` when fine, else a Thai
 * reason to show.
 *
 * ── WHY THIS IS NOT refuseUpload() ──────────────────────────────────────────
 * The two questions look identical and are not. `refuseUpload` decides what may
 * ENTER the tree, so its extension allow-list is the whole point. A delete acts
 * on what is ALREADY there, and the tree predates the allow-list: it was filled
 * by a full-disk backfill, and the allow-list has since narrowed (`mp3`/`mp4`
 * are refused today, and files that were legal when they were uploaded may stop
 * being legal tomorrow). Gating deletes on it would make exactly the files an
 * admin most wants gone the ones they cannot remove — a file manager that can
 * only delete what it would accept is not a file manager.
 *
 * So this checks SHAPE and nothing else: that the path addresses one asset
 * inside one category of the files tree, and that no separator trick can point
 * it somewhere else. Everything about content is out of scope.
 *
 * ── WHY A PATH AND NOT A category + filename PAIR ───────────────────────────
 * MEASURED: 79 of the 236 assets under `files/` are NESTED deeper than one
 * segment — `files/images/course/arrow-next`, `files/images/articles/…`. A
 * `(category, filename)` pair cannot address those: it would rebuild
 * `files/images/arrow-next`, an id nothing is stored under, and Cloudinary
 * would answer `not found` — which the idempotent path treats as success. The
 * row would vanish from the list while the asset lived on. The full path is the
 * only input that round-trips for every asset actually in the tree.
 */
export function refuseDeletePath(publicPath) {
  const p = String(publicPath ?? '');

  if (!p.startsWith(`/${FILES_SEGMENT}/`)) {
    return `ลบได้เฉพาะไฟล์ใน /${FILES_SEGMENT}/ เท่านั้น`;
  }
  if (p.includes('\\')) return 'เส้นทางไฟล์ต้องไม่มีเครื่องหมาย \\';
  if (p.includes('..')) return 'เส้นทางไฟล์ต้องไม่มี ..';
  if (p.includes('//')) return 'เส้นทางไฟล์ต้องไม่มี //';

  // ['files', <category>, …, <name>] — at least three, or the path names a
  // category rather than a file inside one.
  const segments = p.slice(1).split('/');
  if (segments.length < 3) {
    return `เส้นทางไฟล์ต้องอยู่ในหมวดหมู่ เช่น /${FILES_SEGMENT}/<หมวดหมู่>/<ชื่อไฟล์>`;
  }
  if (!isValidCategory(segments[1])) return 'ชื่อหมวดหมู่ไม่ถูกต้อง';
  if (segments.includes('.')) return 'เส้นทางไฟล์ต้องไม่มี .';

  const name = segments[segments.length - 1];
  if (!name) return 'ไม่พบชื่อไฟล์';
  if (name.startsWith('.')) return 'ไม่รับไฟล์ที่ขึ้นต้นด้วยจุด (dotfile)';

  return null;
}

/**
 * THE PREFIX GUARD. Is this public_id inside a CATEGORY of the files tree?
 *
 * ══ THE LAST THING BETWEEN A CRAFTED REQUEST AND ANOTHER ASSET ══════════════
 *
 * `cloudinary.uploader.destroy` takes an id and destroys it. It has no notion
 * of "the folder this admin screen manages", so a public_id that reached it
 * from anywhere would delete anything in the account — the migrated article
 * images, the course covers, every asset the site serves. This function is
 * where that stops, and it is deliberately a separate, pure, independently
 * testable predicate rather than a condition inlined at the call site: a guard
 * that cannot be tested on its own is a guard nobody knows the shape of.
 *
 * It is checked against the DERIVED id, after legacyPathToPublicId has run — so
 * it is measuring the exact string that will be destroyed, not the input the
 * caller offered. Anything else would be guarding a value that no longer
 * exists by the time the destructive call is made.
 *
 * Requires, in order: the `<prefix>/files/` root; no `..` and no empty segment
 * anywhere in the id; a first segment that is a VALID CATEGORY (so `files/x`
 * with no category cannot be reached, and neither can a category name that
 * would not round-trip through a URL); and a non-empty remainder naming the
 * asset. Nesting below the category IS allowed — 79 real assets need it.
 */
export function isWithinFilesCategory(publicId, prefix) {
  const id = String(publicId ?? '');
  const base = `${prefix}/${FILES_SEGMENT}/`;

  if (!id.startsWith(base)) return false;
  if (id.includes('..')) return false;
  if (id.includes('//')) return false;

  const rest = id.slice(base.length);
  const cut = rest.indexOf('/');
  if (cut <= 0) return false;                       // no category, or an empty one
  if (!isValidCategory(rest.slice(0, cut))) return false;

  const tail = rest.slice(cut + 1);
  return tail.length > 0 && !tail.endsWith('/');
}

/**
 * Reverse the mapping: a stored public_id back to its clean public path.
 *
 * Direct, because public_id IS the path — image ids drop the extension and
 * Cloudinary carries it as `format`, raw ids keep it. This is the same rule the
 * migration's legacyPathFromPublicId() applies; it is restated here rather than
 * imported because that one lives in scripts/ and the production build must not
 * depend on scripts/.
 */
export function publicPathFromPublicId(publicId, prefix, resourceType, format) {
  const id = String(publicId);
  if (!id.startsWith(`${prefix}/`)) return null;
  const rest = id.slice(prefix.length + 1);
  return resourceType === 'raw' ? `/${rest}` : `/${rest}.${format}`;
}
