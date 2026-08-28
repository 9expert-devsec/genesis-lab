/**
 * Reading `PageAuditLog` — the rules, as pure functions.
 *
 * Round 2 started writing audit rows and nothing has ever read one back. Rounds
 * 26, 27 and 33 each reached this and each deferred it. This module is the half
 * of the read path that does not touch a database, so every rule below is
 * testable without a connection — the same split `lib/audit/auditQuery.js` has
 * from `lib/audit/readAuditLog.js` for the sibling AdminAuditLog.
 *
 * ── WHAT THIS TRAIL CAN HONESTLY SAY, MEASURED ────────────────────────────
 * A stored row is `{ pageId, pageType, action, sectionId, field, before, after,
 * actor, createdAt }`. Against the development database (55 rows, 3 pages,
 * read-only census):
 *
 *   · `sectionId` and `field` are empty on 55 of 55 rows. Every action that
 *     would set them is one of the six `section.*` values with no live caller.
 *   · `before`/`after` are PRESENCE FLAGS, not values. All 20 `draft.save`
 *     rows are `{hadDraft} -> {hasDraft:true}`, and 18 of them are
 *     `true -> true`. 23 of the 25 `update` rows have `before` identical to
 *     `after`, because `update` records only `{slug,status}` while the edit
 *     that produced it moved the title, the SEO block or the sections.
 *   · no row carries a version number or a version id, so a `publish` row
 *     cannot be joined to the version it published. There is 1 `publish` row
 *     against 3 stored versions — the other two were written by publish paths
 *     that file their audit row under `update` and `status`.
 *
 * So the ONE question this trail answers is: **what kind of thing was done to
 * this page, by whom, and when.** It does not answer what changed, and it does
 * not answer who published version N. Those are not omissions for a richer UI
 * to fill in later; they are the stored shape.
 *
 *   · "who published version N" is `PageVersion.actor`, which round 36 already
 *     surfaces on the published-version view. That collection carries the
 *     number; this one does not. It is the authority, and this trail must
 *     never print a version number beside a publish row.
 *   · "ผู้แก้ไขล่าสุด" is `draft.savedBy` on the live document, which round 34
 *     surfaces through `editorStatus.draftSaverLine`. It is STATE — stamped by
 *     every draft write, cleared by publish and by discard — rather than an
 *     inference over the newest row of a class. This trail must not answer it
 *     a second time.
 *
 * Client-safe: pure JavaScript, no models, no `use server`.
 */

// The cursor format is REUSED, not restated. `lib/audit/auditQuery.js` already
// owns "an audit cursor is <iso> | <id>" for the admin trail, and a second
// encoding of the same idea is the second-authority shape rounds 21-25 spent
// four rounds removing. Both halves are pure and import nothing server-only.
import { encodeCursor, parseCursor } from '@/lib/audit/auditQuery';

export { encodeCursor as encodeAuditTrailCursor, parseCursor as parseAuditTrailCursor };

/**
 * Rows per request.
 *
 * NOT `MAX_VERSION_ROWS`. That one is a DISPLAY cap on a list whose rows are
 * written once per publish; this is a PAGE SIZE on a collection that grows once
 * per autosave tick and that nothing prunes — `pageAudit.js` removed
 * PageVersion's prune deliberately and never had an equivalent here, so the
 * only bound on `page_audit_logs` is how much a page is edited. Capping instead
 * of paginating would silently hide the older half of the trail, which for an
 * audit trail is the half being looked for.
 */
export const AUDIT_TRAIL_PAGE_SIZE = 25;

/**
 * Newest first, on the COMPOUND key.
 *
 * `createdAt` alone is not unique, and a cursor on a non-unique key silently
 * skips or repeats rows at a page boundary — `auditQuery.js` states the same
 * rule for the same reason. The sort and the cursor have to agree, or the
 * tie-break does nothing.
 */
export const AUDIT_TRAIL_SORT = Object.freeze({ createdAt: -1, _id: -1 });

/**
 * The projection, as ONE declaration the action reads and a test pins.
 *
 * ── WHAT IS EXCLUDED, AND WHY EACH ────────────────────────────────────────
 *   · `before` / `after` — presence flags, measured above. Shipping them
 *     invites a caller to render them as field-level values, and 23 of 25
 *     `update` rows would then draw a change arrow between two identical
 *     strings while the edit that actually happened stayed invisible. A
 *     surface that claims something nothing can verify is worse than no
 *     surface; withholding the field is how that stays true after this round.
 *   · `sectionId` / `field` — empty on every stored row, because the six
 *     `section.*` actions that set them have no live caller. An always-empty
 *     column is the "control nothing reads" shape.
 *   · `pageType` — a per-row copy of a query parameter. The caller supplied
 *     the pageId; it learns nothing by being told the type back.
 *
 * Measured cost, on the same census: a full row is 335 B of JSON at the median
 * and 359 B at the top; the projection is 153 B and 164 B. Round 34's lesson
 * was that a list read shipping a heavy field pays on every dialog open — this
 * is 2.2x rather than that read's 33x, but it is paid per page of 25 rows to
 * render three fields.
 */
export const AUDIT_TRAIL_FIELDS = 'action actor createdAt';

/**
 * The Mongo filter for one page of one page's trail. PURE.
 *
 * `pageId` only, matching `getPageVersions`. `pageType` is stored on the row
 * but is not a second key: page ids do not collide across the two collections,
 * and accepting a type here would offer a caller a choice that cannot change
 * the answer.
 *
 * Returns `null` for a missing id — the caller must not turn that into an
 * unfiltered read of every page's trail.
 */
export function buildPageAuditQuery({ pageId, cursor } = {}) {
  const key = String(pageId ?? '');
  if (!key) return null;
  const filter = { pageId: key };
  const c = cursor ? parseCursor(cursor) : null;
  if (c) {
    // Both halves, never a flat `$lt` on createdAt — the second clause IS the
    // tie-break, and dropping it is the skipped row this sort exists to avoid.
    filter.$or = [
      { createdAt: { $lt: c.createdAt } },
      { createdAt: c.createdAt, _id: { $lt: c.id } },
    ];
  }
  return filter;
}

/**
 * How each `action` value reads in Thai.
 *
 * All nineteen are named, not only the twelve a live caller writes: a stored
 * row must render whatever verb it was filed under, and the development
 * database already holds `update` and `status` rows written by paths that no
 * longer have callers. Naming a value here translates a token that exists; it
 * is not a claim that anything still writes it.
 *
 * Each label says WHAT KIND OF THING was done and nothing more. None of them
 * names a version, a field, or a before/after — the row cannot support any of
 * those, and a label implying one would be the lie this whole arc is about.
 */
const ACTION_LABELS = Object.freeze({
  create:               'สร้างหน้าเพจ',
  update:               'แก้ไขข้อมูลหน้า',
  delete:               'ลบหน้าเพจ',
  duplicate:            'ทำสำเนาหน้าเพจ',
  status:               'เปลี่ยนสถานะ',
  publish:              'เผยแพร่',
  'draft.save':         'บันทึกฉบับร่าง',
  'draft.discard':      'ยกเลิกฉบับร่าง',
  'draft.backup':       'สำรองฉบับร่าง',
  'section.add':        'เพิ่มเซกชัน',
  'section.update':     'แก้ไขเซกชัน',
  'section.delete':     'ลบเซกชัน',
  'section.duplicate':  'ทำสำเนาเซกชัน',
  'section.reorder':    'จัดลำดับเซกชัน',
  'section.toggle':     'สลับการแสดงเซกชัน',
  'preview.enable':     'เปิดลิงก์พรีวิว',
  'preview.regenerate': 'สร้างรหัสพรีวิวใหม่',
  'preview.expiry':     'ตั้งวันหมดอายุลิงก์พรีวิว',
  'preview.revoke':     'ปิดลิงก์พรีวิว',
});

/** Every action value this module can name — for the pin below and its test. */
export const AUDIT_ACTION_VALUES = Object.freeze(Object.keys(ACTION_LABELS));

/**
 * A row's Thai action name.
 *
 * An UNKNOWN value returns the raw token rather than a placeholder or nothing.
 * `readAuditLog.js` made the same call for the same reason: the field is
 * free-form by design, and a fixed list that silently dropped a verb invented
 * after it was written would hide exactly the row somebody was looking for. A
 * raw ASCII token in a Thai list is ugly and it is legible; an absent row is
 * neither.
 */
export function auditActionLabel(action) {
  const key = String(action ?? '').trim();
  if (!key) return '';
  return ACTION_LABELS[key] ?? key;
}

/**
 * WHO did it — or nothing.
 *
 * `actor` defaults to `{ id: '', name: '' }`, so a session with no name stamps
 * an anonymous row. Returns empty rather than inventing a category: round 26
 * declined the preview dialog's "created by" line on the same ground and
 * `draftSaverLine` repeats it — an invented placeholder is worse than an absent
 * one because it looks like data. The row still renders; it just names nobody.
 */
export function auditActorName(row) {
  return String(row?.actor?.name ?? '').trim();
}

/**
 * One row as a sentence.
 *
 * `whenText` is a PARAMETER, not something formatted here — the same shape
 * round 34 gave `restoreWarning`. `toLocaleString` is timezone-dependent, so a
 * function formatting its own date could only be asserted by value on the
 * machine that wrote the assertion.
 *
 * Order is action, then who, then when: the verb is what the reader scans for,
 * and it is the only part always present.
 */
export function auditRowLine(row, whenText) {
  const label = auditActionLabel(row?.action);
  if (!label) return '';
  const name = auditActorName(row);
  const when = String(whenText ?? '').trim();
  const parts = [label];
  if (name) parts.push(`โดย ${name}`);
  if (when) parts.push(`เมื่อ ${when}`);
  return parts.join(' ');
}

/**
 * What the trail records, said under the list.
 *
 * Without it, an author reads a run of `บันทึกฉบับร่าง` rows and concludes the
 * trail is a change log that has lost their changes. It records that an action
 * happened, not what it did to the content, and the sentence says so rather
 * than leaving the absence to be interpreted.
 */
export const AUDIT_TRAIL_NOTE =
  'บันทึกนี้เก็บว่ามีการดำเนินการอะไรกับหน้านี้ ใครทำ และเมื่อใด — ไม่ได้เก็บว่าเนื้อหาเปลี่ยนไปอย่างไร';

/** Said in place of the list when a page has no rows at all. */
export const AUDIT_TRAIL_EMPTY = 'ยังไม่มีการดำเนินการที่บันทึกไว้สำหรับหน้านี้';
