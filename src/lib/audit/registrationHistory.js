/**
 * WHAT AN AUDIT ROW IS CALLED, IN WORDS A HUMAN READS.
 *
 * ══ THE FRAME SHOWS AN ACTIVITY FEED. WHAT EXISTS IS AN ADMIN AUDIT LOG. ════
 *
 * They are not the same thing, and the difference is the whole reason this
 * module is a short map rather than a rich one. `admin_audit_logs` records what
 * an ADMIN DID to a record. It does not record what happened TO the record, it
 * does not record what the customer did, and it does not record anything the
 * system did on its own.
 *
 * The actions that genuinely exist for `registrations`, read off the two action
 * files rather than off the design:
 *
 *   public   (lib/actions/registrations.js)          status · update · delete
 *   in-house (lib/actions/inhouse-registrations.js)  status · notes  · delete
 *
 * That is the entire vocabulary. A title for anything else would be a label for
 * an event nothing writes.
 *
 * ── THE ONE ASYMMETRY BETWEEN THE TWO COLLECTIONS ──────────────────────────
 *
 * IN-HOUSE HAS A DEDICATED `notes` ACTION AND PUBLIC DOES NOT. In-house notes go
 * through `updateInhouseAdminNotes`, which records `action: 'notes'`; public
 * notes are one field among many in `updateRegistration`, which records
 * `action: 'update'` for every field edit it makes.
 *
 * So the in-house feed can say "เพิ่มบันทึกภายใน" and the public feed cannot —
 * the public row genuinely does not know which field changed, and inventing
 * "เพิ่มบันทึกภายใน" for a public `update` would be a label asserting something
 * the row does not hold. Public says "แก้ไขข้อมูลใบสมัคร", which is exactly what
 * was recorded.
 *
 * That is a difference in KIND, not a gap to be filled by making them match.
 * Making them match means either giving public a `notes` action it does not have
 * or taking in-house's away, and the second would lose real information.
 *
 * ── `delete` IS HERE AND IS UNREACHABLE FROM THE DETAIL PAGE ───────────────
 *
 * A deleted record has no detail page, so a `delete` row can never appear in the
 * inline history of the record it deleted. It is titled anyway because the
 * vocabulary is per MENU, not per surface, and the central /admin/audit-log page
 * lists these rows for real. A missing entry there would render the raw enum.
 *
 * ── NO IMPORTS, ON PURPOSE ─────────────────────────────────────────────────
 * The pure tier loads this with nothing stubbed, and the SERVER component picks
 * the map and hands the client a plain object — a function cannot cross that
 * boundary, and a map can.
 */

/**
 * action → Thai title, for the PUBLIC registration collection.
 *
 * `update` deliberately does not name a field. `updateRegistration` edits the
 * record wholesale and records the act only — see the PII note in
 * lib/actions/registrations.js — so the row knows an edit happened and nothing
 * more. A title claiming otherwise would be the feed inventing the half the
 * trail refuses to keep.
 */
export const PUBLIC_ACTION_TITLES = Object.freeze({
  status: 'อัปเดตสถานะรายการ',
  update: 'แก้ไขข้อมูลใบสมัคร',
  delete: 'ลบใบสมัคร',
});

/** action → Thai title, for the IN-HOUSE collection. See the note on `notes`. */
export const INHOUSE_ACTION_TITLES = Object.freeze({
  status: 'อัปเดตสถานะรายการ',
  notes:  'เพิ่มบันทึกภายใน',
  delete: 'ลบคำขออบรม',
});

/**
 * The titles for one collection.
 *
 * Keyed on the audit ENTITY rather than the menu, because both collections file
 * under `registrations` and the entity is what separates them — the same
 * discriminator `entityForSource` writes at the mount point.
 *
 * Anything else returns an EMPTY map rather than a default one: a feed for a
 * menu this module has never heard of should render its raw action names, which
 * is what the record holds, rather than borrowing a registration's wording.
 *
 * @param {string} entity
 */
export function actionTitlesFor(entity) {
  if (entity === 'inhouse') return INHOUSE_ACTION_TITLES;
  if (entity === 'public')  return PUBLIC_ACTION_TITLES;
  return {};
}

/**
 * One row's human-readable title.
 *
 * AN UNKNOWN ACTION RETURNS ITS RAW VALUE, never a dash and never "อื่น ๆ". The
 * trail is evidence; a row whose action this module has not been taught should
 * show what it actually says, so the gap is visible and nameable rather than
 * hidden behind a catch-all. Same rule `statusLabel` follows for an unknown
 * status.
 *
 * @param {{action?: string}} row
 * @param {Record<string,string>} titles
 */
export function auditRowTitle(row, titles = {}) {
  const action = String(row?.action ?? '').trim();
  if (!action) return 'ไม่ทราบการดำเนินการ';
  return titles[action] ?? action;
}

/**
 * WHERE THE RECORD CAME FROM — a `source` value in words.
 *
 * The values are the two the models actually write: `'web'` is RegisterPublic's
 * and RegisterInhouse's schema default, and `'inhouse'` is what
 * api/registration/inhouse/route.js writes explicitly. An unrecognised value
 * comes back UNCHANGED for the same reason an unknown action does.
 */
export function sourceLabel(source) {
  const value = String(source ?? '').trim();
  if (value === 'web')     return 'แบบฟอร์มเว็บไซต์';
  if (value === 'inhouse') return 'แบบฟอร์ม In-house';
  return value || 'ไม่ทราบแหล่งที่มา';
}

/**
 * THE SYNTHESISED "the record was created" ENTRY.
 *
 * ══ THIS IS NOT AN AUDIT ROW AND MUST NEVER BE READ AS ONE ═════════════════
 *
 * The frame shows ได้รับแบบฟอร์มการสมัคร as the oldest entry. NOTHING IN THE
 * AUDIT LOG RECORDS IT: that log records ADMIN actions, and a customer
 * submitting a form is not one. So it cannot be read from the trail.
 *
 * It CAN be read from the document, which holds `createdAt` and `source`. That
 * makes a synthesised oldest entry honest — it is the record stating its own
 * origin, not an invented event — and it is worth having, because a feed whose
 * oldest entry is "an admin changed the status" reads as though the record
 * appeared from nowhere.
 *
 * Three things keep it from being mistaken for an audit row:
 *
 *   1. IT SAYS SO, IN WORDS THE READER SEES. Every audit entry's third line is
 *      `ดำเนินการโดย <name>`. This one's is
 *      `ข้อมูลจากตัวรายการ ไม่ใช่บันทึกการดำเนินการ`, which is a different
 *      sentence making a different claim.
 *   2. It carries no actor, because there was no admin.
 *   3. The markup tags it — see HistoryFeed's `data-origin` — so a test can
 *      assert the distinction structurally rather than by reading Thai.
 *
 * ── AND IT IS SUPPRESSED WHEN THE FEED IS TRUNCATED ────────────────────────
 *
 * `readRecordHistory` fetches the newest RECORD_HISTORY_PREVIEW rows. When there
 * are more than that, the oldest row ON SCREEN is not the oldest row, and
 * pinning "created" to the bottom of a partial list would assert a completeness
 * the list does not have — the reader would take the entry above it as the
 * second thing that ever happened.
 *
 * So the caller passes `complete`, and a truncated feed simply does not show it.
 * That is a real state: five status changes on one registration is not unusual.
 *
 * @param {{createdAt?: string, source?: string, label?: string}} origin
 * @param {boolean} complete is the feed showing EVERY row, not just a page?
 * @returns {object|null}
 */
export function buildOriginEntry(origin, complete) {
  if (!origin?.createdAt || !complete) return null;
  return {
    kind:        'document',
    title:       origin.label || 'ได้รับรายการ',
    description: `สร้างรายการจาก${sourceLabel(origin.source)}`,
    createdAt:   origin.createdAt,
  };
}
