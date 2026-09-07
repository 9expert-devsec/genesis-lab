/**
 * What an avatar write is allowed to do — decided as data, before anything is
 * saved or deleted.
 *
 * ══ THE INJECTION SURFACE THIS CLOSES ═══════════════════════════════════════
 * The client sends a string. That string is stored on the admin's record and
 * then interpolated into a Cloudinary delivery URL by avatarUrl. A free-text
 * value making that trip is the whole attack: `avatars/x,w_9999` adds a
 * transform, a value under someone else's folder serves someone else's image,
 * and an arbitrary path reaches whatever else lives in the account's tree.
 *
 * avatarUrl has its own conservative check and falls back to the default when
 * a stored value looks wrong. That is the BELT. This is the braces, and it is
 * the one that matters: it refuses at the boundary, with an error a human sees,
 * before the bad value is durable. A value that never enters the database
 * cannot be interpolated by anything.
 *
 * ── THE PREFIX IS THE POINT ─────────────────────────────────────────────────
 * A public_id is accepted only under `<CLOUDINARY_UPLOAD_FOLDER>/avatars/`.
 * Nothing else the upload endpoint writes — course covers, banners, page
 * builder images — can be claimed as a profile photo, and no path outside the
 * upload tree can be claimed at all.
 *
 * PURE: no imports, no I/O, no database, no React. It reads one env var to know
 * the base folder and nothing else.
 */

/**
 * The subfolder avatars are uploaded into. Must match the ALLOWED_FOLDERS entry
 * in src/app/api/admin/upload/route.js and the `folder` the picker posts.
 */
export const AVATAR_FOLDER = 'avatars';

/**
 * The prefix every acceptable avatar public_id starts with.
 *
 * Derived exactly the way uploadToCloudinary derives the folder it uploads
 * into — `[baseFolder, subfolder].filter(Boolean).join('/')` — so the validator
 * and the uploader cannot disagree about where avatars live. If the base folder
 * is unset both sides collapse to `avatars/`, which is also what the test
 * runner sees (it loads no .env), so this is deterministic under test without
 * anything writing to process.env.
 */
export function avatarFolderPrefix(baseFolder = process.env.CLOUDINARY_UPLOAD_FOLDER || '') {
  return `${[baseFolder, AVATAR_FOLDER].filter(Boolean).join('/')}/`;
}

/**
 * Segment shape: word characters, dots and dashes, no segment that is only
 * dots.
 *
 * The dot-segment lookahead is the same one avatarUrl needs and for the same
 * reason: dots are legal inside a segment, so a plain class accepts `..` whole
 * and lets `avatars/../../secret` through as valid segments. Written twice
 * rather than shared because these two modules must be able to disagree — this
 * one refuses at the boundary and that one refuses at render, and a single
 * shared regex would mean one mistake disables both gates at once.
 */
const SEGMENT = /^(?!\.+$)[\w.-]+$/;

/**
 * Is `publicId` a value this admin's avatar field may hold?
 *
 * @param {unknown} publicId
 * @param {string} [baseFolder] override for tests; defaults to the env var
 * @returns {boolean}
 */
export function isAvatarPublicId(publicId, baseFolder) {
  if (typeof publicId !== 'string') return false;
  const id = publicId.trim();
  if (!id || id !== publicId) return false; // no leading/trailing whitespace

  const prefix = avatarFolderPrefix(baseFolder);
  if (!id.startsWith(prefix)) return false;

  const rest = id.slice(prefix.length);
  if (!rest) return false; // the folder itself is not an image

  // Every remaining segment must be well-formed. Checking the WHOLE id rather
  // than only `rest` would re-validate the prefix we just matched; checking
  // only that `rest` has no slash would refuse Cloudinary's own nesting.
  return rest.split('/').every((seg) => SEGMENT.test(seg));
}

/**
 * Decide what to store and what to delete.
 *
 * Returns a plan rather than performing it, so the ordering rule that matters —
 * DELETE THE OLD IMAGE, NEVER THE NEW ONE — is a property of a value that can
 * be asserted, instead of a sequence of awaits that has to be simulated.
 *
 * @param {{currentPublicId?: string|null, incoming?: unknown, baseFolder?: string}} input
 * @returns {{ok: true, value: string|null, deleteId: string|null}
 *          |{ok: false, error: string}}
 */
export function planAvatarWrite({ currentPublicId = null, incoming, baseFolder } = {}) {
  const current = typeof currentPublicId === 'string' && currentPublicId ? currentPublicId : null;

  // REMOVAL. `null` is the only accepted removal signal — not '' and not
  // undefined, because those are what a missing form field and a typo look
  // like, and "the field was not sent" must never mean "delete the photo".
  if (incoming === null) {
    return { ok: true, value: null, deleteId: current };
  }

  if (!isAvatarPublicId(incoming, baseFolder)) {
    return { ok: false, error: 'รูปโปรไฟล์ไม่ถูกต้อง' };
  }

  // Re-saving the same id must not delete the image that is about to be kept.
  // The obvious implementation — "always delete `current` when replacing" —
  // gets this wrong, and the symptom is an avatar that vanishes the second time
  // you press save without changing anything.
  if (current === incoming) {
    return { ok: true, value: incoming, deleteId: null };
  }

  return { ok: true, value: incoming, deleteId: current };
}
