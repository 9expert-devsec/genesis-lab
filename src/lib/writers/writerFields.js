/**
 * The vocabulary of a writer — one definition for the model, the zod schema and
 * the admin form.
 *
 * Pure: no imports, so a client component, a Mongoose model and the test tier
 * can all read it. The form's dropdown and the server's enum therefore cannot
 * disagree about which platforms exist.
 */

export const WRITER_TYPES = Object.freeze(['person', 'organization']);

export const WRITER_TYPE_LABELS = Object.freeze({
  person: 'บุคคล',
  organization: 'องค์กร',
});

export const WRITER_PLATFORMS = Object.freeze([
  'facebook', 'linkedin', 'youtube', 'tiktok', 'x', 'instagram', 'website',
]);

export const WRITER_PLATFORM_LABELS = Object.freeze({
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  x: 'X',
  instagram: 'Instagram',
  website: 'เว็บไซต์',
});

/** The four fixed list sections, in the order the form and the profile show them. */
export const WRITER_SECTIONS = Object.freeze([
  Object.freeze({ key: 'experience', label: 'ประสบการณ์การทำงาน' }),
  Object.freeze({ key: 'education', label: 'ประวัติการศึกษา' }),
  Object.freeze({ key: 'certifications', label: 'ใบรับรอง' }),
  Object.freeze({ key: 'recognition', label: 'ผลงานและการยอมรับ' }),
]);

export const WRITER_SECTION_KEYS = Object.freeze(WRITER_SECTIONS.map((s) => s.key));

export const WRITER_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The subfolder writer avatars are uploaded into. Must match the ALLOWED_FOLDERS
 * entry in src/app/api/admin/upload/route.js and its FOLDER_RULES entry.
 */
export const WRITER_AVATAR_FOLDER = 'writers';

/** http(s) only. `javascript:` parses as a URL, so the protocol is what counts. */
export function isHttpUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** A starting slug from a name. Thai has no spelling here, so it yields ''. */
export function slugFromName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SEGMENT = /^(?!\.+$)[\w.-]+$/;

/**
 * Is `publicId` a value a writer's avatar field may hold?
 *
 * Same boundary as isAvatarPublicId in src/lib/avatar/avatarWrite.js: the value
 * ends up inside a delivery URL, so it must sit under the folder the uploader
 * writes to and be made of well-formed segments.
 */
export function isWriterAvatarPublicId(publicId, baseFolder = process.env.CLOUDINARY_UPLOAD_FOLDER || '') {
  if (typeof publicId !== 'string' || !publicId || publicId !== publicId.trim()) return false;
  const prefix = `${[baseFolder, WRITER_AVATAR_FOLDER].filter(Boolean).join('/')}/`;
  if (!publicId.startsWith(prefix)) return false;
  const rest = publicId.slice(prefix.length);
  return Boolean(rest) && rest.split('/').every((seg) => SEGMENT.test(seg));
}

/**
 * A writer as readers may assume it.
 *
 * Reads are `.lean()`, which applies no schema defaults, so a document written
 * before a field existed reads back without it. This is the one place that
 * turns "missing" into "empty".
 */
export function normalizeWriter(doc) {
  if (!doc) return null;
  const sections = doc.sections ?? {};
  return {
    ...doc,
    type: WRITER_TYPES.includes(doc.type) ? doc.type : 'person',
    role: doc.role ?? '',
    bio: doc.bio ?? '',
    avatarPublicId: doc.avatarPublicId ?? '',
    socialLinks: Array.isArray(doc.socialLinks) ? doc.socialLinks : [],
    sections: Object.fromEntries(
      WRITER_SECTION_KEYS.map((key) => [key, Array.isArray(sections[key]) ? sections[key] : []]),
    ),
    instructorId: doc.instructorId ?? null,
    isActive: doc.isActive !== false,
    isDefault: doc.isDefault === true,
  };
}
