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
 *   in-house (lib/actions/inhouse-registrations.js)  status · delete
 *   BOTH     (lib/actions/registrations.js)          notes
 *
 * That is the entire vocabulary. A title for anything else would be a label for
 * an event nothing writes.
 *
 * ── THE ASYMMETRY IS GONE, AND IT WAS CLOSED THE RIGHT WAY ─────────────────
 *
 * This file used to record a difference in KIND: in-house had a dedicated
 * `notes` action and public did not, because public notes were one field among
 * many in `updateRegistration`, which records `action: 'update'` and genuinely
 * does not know which field changed. The note said the gap must NOT be closed by
 * making the two match — because the only ways to do that were to invent a
 * `notes` label for a public `update` (a title asserting something the row does
 * not hold) or to take in-house's away (losing real information).
 *
 * ROUND 6 CLOSED IT BY THE THIRD ROUTE, which is the one that was actually
 * available: public GENUINELY GOT A DEDICATED ACTION. `addInternalNote` in
 * lib/actions/registrations.js is the only writer of internal notes on either
 * source, it records `action: 'notes'`, and so the public row now really does
 * know that a note was added. Nothing is invented and nothing was given up.
 *
 * So `notes` is in BOTH maps below. The reasoning above is kept rather than
 * deleted, because "why don't these match" is the question a reader arrives
 * with, and the answer — they do now, and here is why the obvious two ways of
 * getting there were both wrong — is worth more than silence.
 *
 * `update` still does not name a field, and still must not: `updateRegistration`
 * remains a wholesale `$set` of an allowlisted bag.
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
  // NEW in round 6, and it is TRUE rather than inferred — `addInternalNote`
  // records it directly. See the header for why this could not simply be
  // borrowed from in-house before.
  notes:  'เพิ่มบันทึกภายใน',
  /**
   * ── THE ONE ROW ON THIS SCREEN THAT CARRIES A BEFORE/AFTER DIFF ──────────
   * `updateRegistrationRound` records the four round fields on both sides —
   * the single exception to the no-diff rule, because a round id, a date label
   * and two short enums are not personal data and moving a person between
   * rounds is the change most worth tracing. See the action for the full
   * reasoning; this entry is only its title.
   */
  round:  'ย้ายรอบอบรม',
  /**
   * ── THE SECOND ROW CARRYING A BEFORE/AFTER DIFF ──────────────────────────
   * Round 8. `updateAttendeesCountPaid` records the seat count on both sides,
   * and ONLY that action writes this — the ordinary edit path files `update`
   * like every other field.
   *
   * The title names the paid state on purpose. A seat count changing before
   * payment is an ordinary correction and is not distinguished in the feed; one
   * changing AFTER payment means the registration's headcount no longer matches
   * the amount charged for it, and a reader scanning the history should not have
   * to open the row to see which of the two happened.
   */
  seats:  'เปลี่ยนจำนวนผู้เข้าอบรม (หลังชำระเงิน)',
  delete: 'ลบใบสมัคร',
});

/**
 * action → Thai title, for the IN-HOUSE collection. See the note on `notes`.
 *
 * ── `update` IS NEW HERE, AND ITS ABSENCE WAS A REAL GAP ──────────────────
 * Until round 6 the in-house screen could not edit a field at all — it called
 * `updateInhouseStatus`, `updateInhouseAdminNotes` and delete, and nothing else
 * — so no `update` row could ever be filed against an in-house record and a
 * title for one would have been a label for an event nothing wrote.
 *
 * The in-house screen now calls `updateRegistration`, which records `update`
 * with `entity: 'inhouse'`. Without an entry here that row would render the raw
 * English enum `update` on a Thai feed. Caught by the vocabulary test in
 * render/registrationHistoryFeed, which compares the titles against the actions
 * the action files actually write — not by anyone noticing.
 *
 * The wording differs from public's by one noun (คำขอ vs ใบสมัคร) and is
 * equally non-specific, for the same reason: `updateRegistration` is a wholesale
 * `$set` of an allowlisted bag and genuinely does not know which field changed.
 */
export const INHOUSE_ACTION_TITLES = Object.freeze({
  status: 'อัปเดตสถานะรายการ',
  update: 'แก้ไขข้อมูลคำขอ',
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
