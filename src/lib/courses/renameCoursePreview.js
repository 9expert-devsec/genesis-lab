/**
 * The course-code rename DRY RUN. Reports what a rename would touch. Writes
 * nothing, and cannot: this module imports no model, no database client and no
 * cache API — see test/fs/renamePreviewReadOnly, which asserts that
 * structurally rather than taking this sentence's word for it.
 *
 * ── WHY A PREVIEW EXISTS BEFORE THE RENAME DOES ────────────────────────────
 * The code is CUSTOMER-FACING: it is the first column of the public /schedule
 * table, and customers quote courses by code because the names are long. Sales
 * ask for changes; today only the tech lead can make one, by editing Mongo. The
 * rename touches twelve stores under three different case regimes, and the
 * failure modes are silent — an orphaned CourseExtension takes a course's SEO,
 * alias, gallery and publish flag with it and reports nothing.
 *
 * So the preview is the deliverable that has to exist first. An admin cannot
 * consent to a migration whose blast radius nobody has shown them.
 *
 * ── PURE, AND HANDED ITS DATA ──────────────────────────────────────────────
 * Every count and row is passed IN. The reader that gathers them is a separate
 * module; this one decides what the numbers MEAN — which stores change, which
 * deliberately do not, whether the rename is possible at all. That split is
 * what lets every verdict be driven against fixtures, including the ones that
 * have no live instance (a collision, a case-only rename) and therefore cannot
 * be observed by running it against production.
 */

import { normalizeCourseCode } from './courseOrder';
import { outlinePublicPath } from './courseOutline';

/**
 * ── THE THREE CASE REGIMES ─────────────────────────────────────────────────
 *
 * The same code is stored three different ways across the system, and this is
 * the fact that makes a CASE-ONLY rename dangerous while looking trivial:
 *
 *   UPPER  normalised through normalizeCourseCode on write and on lookup, so a
 *          case change is a genuine no-op — the stored value already matches.
 *   LOWER  normalised down (CourseOutlineFile, and the blob filename derived
 *          from it), same conclusion.
 *   EXACT  stored and matched verbatim. A case change DOES break these, and
 *          they are the majority.
 *
 * A rename of MSE-L1 → mse-l1 therefore leaves the order lists and the PDF
 * paths correct while silently orphaning the extension, the early-bird row, the
 * promo links, the featured lists and the schedule rows. That reads as the
 * safest possible rename and is one of the worst.
 */
export const REGIME = Object.freeze({ UPPER: 'upper', LOWER: 'lower', EXACT: 'exact' });

/**
 * Every store that holds the code AS A VALUE, in the order a migration would
 * have to touch them. `historical: true` means it is deliberately left alone.
 *
 * `related_courses` is absent on purpose and it is the one people expect to see
 * here: `resolveCourseRefs` converts those codes to MSDB ObjectIds before the
 * write, so they survive a rename untouched. Recorded in `NOT_KEYED_BY_CODE`
 * below rather than omitted silently.
 */
export const RENAME_STORES = Object.freeze([
  { key: 'courseExtension', model: 'CourseExtension',        field: 'courseId',            regime: REGIME.EXACT, unique: true,
    note: 'SEO, urlAlias, gallery, tags and the publish flag all hang off this one row. Orphaning it reverts the course to defaults with no error.' },
  { key: 'courseOutlineFile', model: 'CourseOutlineFile',    field: 'courseId',            regime: REGIME.LOWER, unique: true,
    note: 'The stored BLOB FILENAME is derived from the code, so the objects must move too — the row alone is not enough.' },
  { key: 'programOrder',    model: 'ProgramOrder',           field: 'courseOrder[]',       regime: REGIME.UPPER,
    note: 'A miss drops the course to the unlisted tier. The admin reorder writes WHOLE-GROUP membership, so the next save prunes the old code permanently.' },
  { key: 'skillOrder',      model: 'SkillOrder',             field: 'courseOrder[]',       regime: REGIME.UPPER,
    note: 'Same as ProgramOrder, once per skill the course belongs to.' },
  { key: 'earlyBirdConfig', model: 'EarlyBirdConfig',        field: 'course_id',           regime: REGIME.EXACT, unique: true },
  { key: 'coursePromoLink', model: 'CoursePromoLink',        field: 'course_id',           regime: REGIME.EXACT },
  { key: 'featuredCourse',  model: 'FeaturedCourse',         field: 'course_id',           regime: REGIME.EXACT, unique: true },
  { key: 'featuredOnlineCourse', model: 'FeaturedOnlineCourse', field: 'course_id',        regime: REGIME.EXACT, unique: true },
  { key: 'navFeaturedOnlineCourse', model: 'NavFeaturedOnlineCourse', field: 'course_id',  regime: REGIME.EXACT, unique: true },
  { key: 'scheduleLocal',   model: 'ScheduleLocal',          field: 'course_id',           regime: REGIME.EXACT },
  { key: 'promotion',       model: 'Promotion',              field: 'related_course_ids[]', regime: REGIME.EXACT },
  { key: 'article',         model: 'Article',                field: 'relatedCourses[]',    regime: REGIME.EXACT,
    note: 'Pinned courses on an article. A miss drops the pin silently — the article renders with one fewer related course.' },

  // ── Deliberately NOT changed ──────────────────────────────────────────────
  { key: 'registerPublic',  model: 'RegisterPublic',         field: 'courseId / courseCode', regime: REGIME.EXACT, historical: true,
    note: 'A record of what a customer BOUGHT, under the code that existed then. Rewriting it would falsify a paid order.' },
  { key: 'careerPathRegistration', model: 'CareerPathRegistration', field: 'courseCode',   regime: REGIME.EXACT, historical: true,
    note: 'Same — an enrolment record, not a live reference.' },
]);

/** Holds a course reference, but NOT as a code — so a rename does not reach it. */
export const NOT_KEYED_BY_CODE = Object.freeze([
  { model: 'MSDB public-course.related_courses', why: 'resolveCourseRefs converts codes to ObjectIds before the write.' },
  { model: 'MasterclassBatch.course_id',         why: 'An ObjectId ref to MasterclassCourse, a different collection entirely.' },
]);

const clean = (v) => String(v ?? '').trim();

/**
 * Is `code` already taken, ignoring case?
 *
 * CASE-INSENSITIVE because upstream `course_id` has no canonical casing — five
 * live courses are not fully uppercase — so `mse-l1` and `MSE-L1` are the same
 * identity for collision purposes even though the exact-match stores would
 * treat them as different keys. Returning the STORED spelling lets the caller
 * name what it collided with.
 */
function findInsensitive(codes, wanted) {
  const target = clean(wanted).toLowerCase();
  if (!target) return null;
  for (const c of codes ?? []) {
    if (clean(c).toLowerCase() === target) return clean(c);
  }
  return null;
}

/**
 * The dry run.
 *
 * @param {object} input
 * @param {string} input.oldCode          the course's current code
 * @param {string} input.newCode          the proposed code
 * @param {string[]} input.msdbCodes      every `course_id` upstream
 * @param {string[]} input.extensionCodes every `CourseExtension.courseId`
 * @param {string} [input.urlAlias]       the course's stored alias, '' when none
 * @param {object} [input.matches]        `{ [storeKey]: row[] }` — the rows the
 *        reader found holding the OLD code. A store absent from this object is
 *        reported as NOT READ rather than as zero; see `undetermined`.
 * @param {string[]} [input.outlineLangs] which outline PDFs exist ('th'/'en')
 */
export function buildRenamePreview({
  oldCode,
  newCode,
  msdbCodes = [],
  extensionCodes = [],
  urlAlias = '',
  matches = {},
  outlineLangs = [],
} = {}) {
  const from = clean(oldCode);
  const to = clean(newCode);

  const blocked = [];
  if (!from) blocked.push('ไม่ได้ระบุรหัสเดิม');
  if (!to) blocked.push('ไม่ได้ระบุรหัสใหม่');
  if (from && to && from === to) blocked.push('รหัสใหม่เหมือนรหัสเดิมทุกประการ — ไม่มีอะไรต้องเปลี่ยน');

  // ── Collision ─────────────────────────────────────────────────────────────
  // Checked against BOTH stores. Upstream alone is not enough: CourseExtension
  // is upserted by code, so a collision there would silently overwrite another
  // course's SEO and gallery — which is why createCourse already guards both.
  const inMsdb = findInsensitive(msdbCodes, to);
  const inExtension = findInsensitive(extensionCodes, to);
  // A case-only rename necessarily "collides" with the course's own row. That
  // is not a collision, it is the thing being renamed.
  const selfMsdb = inMsdb && inMsdb.toLowerCase() === from.toLowerCase();
  const selfExt = inExtension && inExtension.toLowerCase() === from.toLowerCase();
  const collision = {
    blocked: Boolean((inMsdb && !selfMsdb) || (inExtension && !selfExt)),
    inMsdb: selfMsdb ? null : inMsdb,
    inExtension: selfExt ? null : inExtension,
  };
  if (collision.blocked) {
    blocked.push(
      `รหัส "${to}" ถูกใช้แล้ว` +
      (collision.inMsdb ? ` — MSDB: "${collision.inMsdb}"` : '') +
      (collision.inExtension ? ` — CourseExtension: "${collision.inExtension}"` : '')
    );
  }

  /**
   * ── WHAT UPSTREAM HOLDS, UNFILTERED ────────────────────────────────────────
   *
   * `collision` above answers "may this rename run", so it nulls a hit that IS
   * the course being renamed. That filtering makes it useless as a state
   * signal: "upstream still has the old code" and "upstream has been renamed
   * already" both reduce to `inMsdb: null` there.
   *
   * This block is the raw answer — does the upstream catalogue contain each
   * code, and under what spelling — and it is what lets `detectRenameState`
   * tell the normal interval (genesis moved, upstream has not) apart from the
   * reverse (upstream moved, genesis has not). Measured on the real site
   * 2026-08-16: the second one is FULLY REVERSIBLE by renaming MSDB back,
   * because genesis never moved. The first is not.
   *
   * Free: `msdbCodes` is already in hand for the collision check, so this adds
   * no read.
   */
  const upstream = {
    hasOldCode: findInsensitive(msdbCodes, from) !== null,
    hasNewCode: findInsensitive(msdbCodes, to) !== null,
    oldSpelling: findInsensitive(msdbCodes, from),
    newSpelling: findInsensitive(msdbCodes, to),
  };

  // ── Case regime ───────────────────────────────────────────────────────────
  const caseOnly = Boolean(from && to && from !== to && from.toLowerCase() === to.toLowerCase());

  // ── URL ───────────────────────────────────────────────────────────────────
  const alias = clean(urlAlias);
  const derivedBefore = `/${from.toLowerCase()}-training-course`;
  const derivedAfter = `/${to.toLowerCase()}-training-course`;
  const url = {
    aliased: Boolean(alias),
    current: alias || derivedBefore,
    after: alias || derivedAfter,
    changes: !alias && derivedBefore !== derivedAfter,
    /**
     * THE STEP THAT MUST HAPPEN FIRST, and the reason the rename cannot be a
     * form field. With no alias the public URL is derived from the code, so the
     * moment the code changes the old URL 404s — and nothing maps old to new.
     * Creating an alias pinned to the OLD derived path before renaming is what
     * makes the change survivable, and it has to precede the rename, which a
     * blur handler cannot express.
     */
    mustCreateAliasFirst: !alias && derivedBefore !== derivedAfter,
    aliasToCreate: !alias && derivedBefore !== derivedAfter ? derivedBefore : null,
  };

  // ── Per-store ─────────────────────────────────────────────────────────────
  const stores = [];
  const historical = [];
  const undetermined = [];

  for (const store of RENAME_STORES) {
    const read = Object.prototype.hasOwnProperty.call(matches, store.key);
    const rows = read ? (matches[store.key] ?? []) : null;

    if (store.historical) {
      historical.push({
        ...store,
        count: read ? rows.length : null,
        willChange: false,
        reason: store.note,
      });
      if (!read) undetermined.push(`${store.model}: ไม่ได้อ่าน — จำนวนแถวไม่ทราบ`);
      continue;
    }

    if (!read) {
      undetermined.push(`${store.model}: ไม่ได้อ่าน — ไม่ทราบว่ามีกี่แถวที่ต้องแก้`);
      stores.push({ ...store, count: null, rows: null, willChange: null, noOp: null });
      continue;
    }

    /**
     * A case-only rename NO-OPS the normalised stores. Reported per store, not
     * as one banner, because the mix is the danger: the stores that no-op look
     * fine afterwards and the exact ones are broken, so a spot check of the
     * course's ordering says "the rename worked".
     */
    const noOp = caseOnly && store.regime !== REGIME.EXACT;
    stores.push({
      ...store,
      count: rows.length,
      rows,
      noOp,
      willChange: !noOp && rows.length > 0,
    });
  }

  // ── The blob objects behind CourseOutlineFile ─────────────────────────────
  // The row carries the code; the PDF's FILENAME is derived from it. Renaming
  // the row without moving the object leaves a live row pointing at a path no
  // upload will ever write again.
  const outlineBlobs = (outlineLangs ?? []).map((lang) => ({
    lang,
    from: outlinePublicPath(from.toLowerCase(), lang),
    to: outlinePublicPath(to.toLowerCase(), lang),
    moves: from.toLowerCase() !== to.toLowerCase(),
  }));

  /**
   * WHAT A DRY RUN CANNOT KNOW. Stated in the output rather than guessed,
   * because each of these is a way the migration can fail after it has started.
   */
  undetermined.push(
    'MSDB จะรับรหัสใหม่หรือไม่ — ตรวจได้เฉพาะว่าซ้ำหรือไม่ ไม่สามารถตรวจว่าเขียนสำเร็จโดยไม่เขียนจริง',
    'การย้ายไฟล์ PDF ใน blob storage จะสำเร็จหรือไม่ และไฟล์เดิมจะถูกลบหรือค้าง',
    'ระบบอื่นของ 9expert ที่ใช้ MSDB เดียวกันถืออ้างอิงรหัสนี้อยู่หรือไม่ — อยู่นอก repo นี้ ตรวจจากที่นี่ไม่ได้'
  );

  const totalRows = stores.reduce((n, s) => n + (s.count ?? 0), 0);

  return {
    ok: blocked.length === 0,
    blocked,
    oldCode: from,
    newCode: to,
    caseOnly,
    collision,
    upstream,
    url,
    stores,
    historical,
    notKeyedByCode: NOT_KEYED_BY_CODE,
    outlineBlobs,
    undetermined,
    totalRows,
  };
}
