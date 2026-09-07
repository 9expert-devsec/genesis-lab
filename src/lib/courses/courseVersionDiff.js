/**
 * What changed between two course snapshots — the pure half of the history UI.
 *
 * Out of the action file for the reason every decision-bearing helper in this
 * repo is: the action module is `'use server'` and no test can import it, and
 * "a reordered key is not a change" is a claim a test has to be able to RUN.
 *
 * ══ THE RULE THIS FILE EXISTS TO GET RIGHT ═════════════════════════════════
 *
 * A DIFF SHOWN FOR A FIELD THE ADMIN NEVER TOUCHED DESTROYS TRUST IN THE WHOLE
 * FEATURE, faster than a missing one does. A missing diff is a gap; a false one
 * is a liar, and after the second false positive nobody reads the tab again.
 *
 * So equality here is SEMANTIC, never string equality on serialised values.
 * `JSON.stringify(a) === JSON.stringify(b)` is the obvious implementation and
 * it is wrong three separate ways, each of which really happens:
 *
 *   KEY ORDER      a document read back from Mongo does not promise the key
 *                  order of one built in memory. Two identical states would
 *                  serialise differently and every field would "change".
 *   NULL vs ''     `course_netprice` is null when cleared and '' when the input
 *                  posts empty; `metaTitle` is '' on a fresh extension and
 *                  absent on one that predates the field. Same state, three
 *                  spellings.
 *   WHITESPACE     an admin who clicks into a textarea and out again can leave
 *                  a trailing newline. The stored value differs; the course
 *                  does not.
 *
 * Each has a test in test/pure/courseVersionDiff aimed at it directly.
 *
 * ── WHERE THE LINE IS DRAWN, AND WHY IT IS NOT DRAWN FURTHER ───────────────
 * Whitespace is trimmed at the ENDS and CRLF is normalised. Nothing more.
 * In particular rich text is NOT normalised as HTML — no attribute reordering,
 * no tag-whitespace collapsing, no entity folding. That would need an HTML
 * parser to be correct, and a half-correct one hides REAL edits, which is the
 * failure this file is most afraid of in the other direction. An admin who
 * changes `<b>` to `<strong>` has changed the stored body, and this says so.
 *
 * ARRAY ORDER IS CONTENT and is never sorted away. `course_objectives` renders
 * in the order it is stored and the public page numbers it; moving item 3 above
 * item 1 IS an edit. Only OBJECT key order is insignificant.
 */

import { COURSE_SECTION_LABELS } from '@/lib/courseSectionNav';

/**
 * How a changed field should be RENDERED. Not its storage type — its reading
 * type, which is the only thing the UI needs from it.
 *
 *   text    a short string; renders inline, old → new
 *   rich    long text or HTML; renders stacked and full-width, never inline
 *   list    an array of lines; renders as a list with the count
 *   bool    renders as เปิด/ปิด rather than true/false
 *   number  renders right-aligned, with a dash for null
 *   gallery a media array; summarised by count and kind, never dumped
 */
export const FIELD_KIND = Object.freeze({
  TEXT: 'text',
  RICH: 'rich',
  LIST: 'list',
  BOOL: 'bool',
  NUMBER: 'number',
  GALLERY: 'gallery',
  TOPICS: 'topics',
});

/**
 * THE LABELS THE ADMIN ALREADY SEES, never the database key.
 *
 * `course_teaser` means nothing to the person who typed into a box labelled
 * "คำอธิบายสั้น". Where the form and the public page already share a name, it is
 * taken from COURSE_SECTION_LABELS rather than retyped — a second set of names
 * for one concept is how the two drift.
 *
 * A key NOT in this map is not rendered at all: see `diffSnapshots`. That is a
 * deliberate allow-list rather than a fallback to the raw key, because a raw
 * key in this UI is indistinguishable from a bug and there is no wording a
 * reader could act on.
 *
 * `order` is the reading order, and it follows the FORM's section order so an
 * admin scanning a diff meets the fields where they expect them.
 */
const F = (order, label, kind = FIELD_KIND.TEXT) => ({ order, label, kind });

export const COURSE_FIELDS = Object.freeze({
  course_name:               F(10, 'ชื่อหลักสูตร'),
  course_id:                 F(11, 'รหัสหลักสูตร'),
  course_teaser:             F(12, 'คำอธิบายสั้น', FIELD_KIND.RICH),
  course_cover_url:          F(13, 'รูปปกหลักสูตร'),
  course_trainingdays:       F(20, 'จำนวนวันอบรม', FIELD_KIND.NUMBER),
  course_traininghours:      F(21, 'จำนวนชั่วโมง', FIELD_KIND.NUMBER),
  course_levels:             F(22, 'ระดับ'),
  course_price:              F(23, 'ราคา', FIELD_KIND.NUMBER),
  course_netprice:           F(24, 'ราคาสุทธิ', FIELD_KIND.NUMBER),
  sort_order:                F(25, 'ลำดับแสดงผล', FIELD_KIND.NUMBER),
  course_type_public:        F(30, 'Public (เผยแพร่บนเว็บ)', FIELD_KIND.BOOL),
  course_type_inhouse:       F(31, 'In-house (รับจัดในองค์กร)', FIELD_KIND.BOOL),
  course_workshop_status:    F(32, 'Workshop', FIELD_KIND.BOOL),
  course_certificate_status: F(33, 'มอบใบรับรอง (Certificate)', FIELD_KIND.BOOL),
  course_promote_status:     F(34, 'โปรโมตเป็นพิเศษ', FIELD_KIND.BOOL),
  program:                   F(40, 'โปรแกรม'),
  skills:                    F(41, 'Skills', FIELD_KIND.LIST),
  previous_course:           F(42, 'หลักสูตรก่อนหน้า'),
  related_courses:           F(43, COURSE_SECTION_LABELS.related, FIELD_KIND.LIST),
  course_objectives:         F(50, COURSE_SECTION_LABELS.objective, FIELD_KIND.LIST),
  course_target_audience:    F(51, COURSE_SECTION_LABELS.target, FIELD_KIND.LIST),
  course_prerequisites:      F(52, COURSE_SECTION_LABELS.prerequisite, FIELD_KIND.LIST),
  course_system_requirements: F(53, COURSE_SECTION_LABELS.requirement, FIELD_KIND.LIST),
  training_topics:           F(60, COURSE_SECTION_LABELS.outline, FIELD_KIND.TOPICS),
  course_outline_th:         F(70, 'ไฟล์เนื้อหาหลักสูตร (ภาษาไทย)'),
  course_outline_en:         F(71, 'ไฟล์เนื้อหาหลักสูตร (ภาษาอังกฤษ)'),
});

export const EXTENSION_FIELDS = Object.freeze({
  descriptionRich:           F(14, `${COURSE_SECTION_LABELS.description} (รูปแบบ Rich text)`, FIELD_KIND.RICH),
  objectivesRich:            F(54, `${COURSE_SECTION_LABELS.objective} (รูปแบบ Rich text)`, FIELD_KIND.RICH),
  targetAudienceRich:        F(55, `${COURSE_SECTION_LABELS.target} (รูปแบบ Rich text)`, FIELD_KIND.RICH),
  prerequisitesRich:         F(56, `${COURSE_SECTION_LABELS.prerequisite} (รูปแบบ Rich text)`, FIELD_KIND.RICH),
  systemRequirementsRich:    F(57, `${COURSE_SECTION_LABELS.requirement} (รูปแบบ Rich text)`, FIELD_KIND.RICH),
  trainingTopicsRich:        F(61, `${COURSE_SECTION_LABELS.outline} (รูปแบบ Rich text)`, FIELD_KIND.LIST),
  urlAlias:                  F(80, 'URL Alias'),
  metaTitle:                 F(81, 'Meta Title'),
  metaDescription:           F(82, 'Meta Description', FIELD_KIND.RICH),
  ogImage:                   F(83, 'OG Image URL'),
  tags:                      F(84, 'Tags', FIELD_KIND.LIST),
  isPublished:               F(85, 'เผยแพร่บนเว็บสาธารณะ', FIELD_KIND.BOOL),
  omisePaymentEnabled:       F(86, 'รับชำระเงินออนไลน์', FIELD_KIND.BOOL),
  gallery:                   F(87, 'Gallery', FIELD_KIND.GALLERY),
});

/** The outline-file pointers, which are what make a replaced PDF visible. */
export const OUTLINE_REF_FIELDS = Object.freeze({
  th: F(72, 'ไฟล์เนื้อหาหลักสูตร (ภาษาไทย) — เวอร์ชันไฟล์'),
  en: F(73, 'ไฟล์เนื้อหาหลักสูตร (ภาษาอังกฤษ) — เวอร์ชันไฟล์'),
});

// ── semantic equality ───────────────────────────────────────────────────────

/**
 * Is this value "nothing"? null, undefined and '' are ONE state.
 *
 * They are three spellings of an empty field in this data: a cleared number is
 * null, an empty input posts '', and a field added after a document was written
 * is absent. An admin who never touched the box must not be told they did.
 *
 * NOT included: `0`, `false`, and `[]`. A price of 0 is a real price, an
 * unchecked box is a real state, and an emptied list is a real edit — folding
 * any of them into "nothing" would HIDE a change, which is the other failure.
 */
export function isBlank(value) {
  return value === null || value === undefined || value === '';
}

/** CRLF folded, ends trimmed. The whole of the whitespace rule — see header. */
function normaliseText(value) {
  return String(value).replace(/\r\n?/g, '\n').trim();
}

/**
 * Semantic equality for two stored values.
 *
 * Object key order is insignificant; ARRAY order is not (see header). Numbers
 * compare numerically so `7500` and `'7500'` agree — the form posts strings and
 * a snapshot taken from a fresh form can hold one where the stored document
 * holds a number.
 */
export function valuesEqual(a, b) {
  if (isBlank(a) && isBlank(b)) return true;
  if (isBlank(a) !== isBlank(b)) return false;

  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);

  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
    return normaliseText(a) === normaliseText(b);
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => valuesEqual(item, b[i]));
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).filter((k) => !isBlank(a[k]) || !isBlank(b[k]));
    const kb = Object.keys(b).filter((k) => !isBlank(a[k]) || !isBlank(b[k]));
    const keys = new Set([...ka, ...kb]);
    for (const k of keys) if (!valuesEqual(a[k], b[k])) return false;
    return true;
  }

  return normaliseText(a) === normaliseText(b);
}

// ── the diff ────────────────────────────────────────────────────────────────

function compareSection(before, after, fields, prefix) {
  const out = [];
  for (const [key, meta] of Object.entries(fields)) {
    const b = before?.[key];
    const a = after?.[key];
    if (valuesEqual(b, a)) continue;
    out.push({
      key: prefix ? `${prefix}.${key}` : key,
      label: meta.label,
      kind: meta.kind,
      order: meta.order,
      before: b ?? null,
      after: a ?? null,
    });
  }
  return out;
}

/**
 * Every field that actually changed between two snapshots, in reading order.
 *
 * ONLY CHANGED FIELDS. An unchanged field is not in the result at all — a wall
 * of unchanged rows is what makes a diff unreadable, and the admin came here to
 * find the one thing that moved.
 *
 * A key not in the label maps is SKIPPED, deliberately. The alternative is
 * printing a raw database key, which a reader cannot act on and cannot tell
 * apart from a bug. If a new field should appear here, it gets a Thai label in
 * the map above — one edit, in the place that already holds the vocabulary.
 *
 * ── A MISSING SIDE IS NOT A COMPARISON ─────────────────────────────────────
 * `before` of null returns NO changes, rather than one change per field
 * reading "(ว่าง) → value". Two callers can hand over a null predecessor and
 * both want the same answer:
 *
 *   · the FIRST version of a course, which genuinely has nothing before it;
 *   · a version whose `preImageMissing` is set, where the previous state was
 *     never captured because the read failed.
 *
 * Neither is "the admin created every field at once", and rendering that would
 * be the feature's own worst failure mode — a screenful of changes nobody made.
 * WHAT to say instead is the caller's decision and differs between those two
 * cases, so it is made once, in getCourseVersionDiff and the panel, and never
 * guessed at here.
 *
 * Same reasoning as `snapshotsEqual(null, null) === false` in courseSnapshot:
 * the absence of a state is not a state that can be compared.
 *
 * @param {object|null} before  the previous version's snapshot, or null
 * @param {object|null} after   this version's snapshot
 * @returns {Array<{key,label,kind,order,before,after}>}
 */
export function diffSnapshots(before, after) {
  if (!after || !before) return [];
  const changes = [
    ...compareSection(before?.course, after.course, COURSE_FIELDS, ''),
    ...compareSection(before?.extension, after.extension, EXTENSION_FIELDS, ''),
    ...compareSection(before?.outlineRefs, after.outlineRefs, OUTLINE_REF_FIELDS, 'outline'),
  ];
  return changes.sort((x, y) => x.order - y.order);
}

/**
 * The list row's one-line summary: the labels that changed, capped.
 *
 * A count alone ("6 fields changed") is not usable — the admin is scanning for
 * the version where the price moved. Names are, so names it is, with the rest
 * behind a "+N".
 */
export const SUMMARY_LABEL_LIMIT = 3;

/**
 * How many versions one tab-open lists. The page-builder's history uses 20 and
 * there is no reason for this surface to disagree.
 *
 * DECLARED HERE RATHER THAN BESIDE THE ACTION THAT USES IT, because that module
 * is `'use server'` and every export of such a file must be an async function —
 * a plain `export const` there is a build error, not a style preference.
 */
export const VERSION_PAGE_SIZE = 20;

export function summariseChanges(changes, limit = SUMMARY_LABEL_LIMIT) {
  const labels = (changes ?? []).map((c) => c.label);
  if (labels.length === 0) return '';
  const shown = labels.slice(0, limit);
  const rest = labels.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
}
