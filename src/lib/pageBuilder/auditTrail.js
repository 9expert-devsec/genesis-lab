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

/**
 * ── ROUND 41: CONSECUTIVE RUNS COLLAPSE ───────────────────────────────────
 *
 * The list is written one row per autosave TICK. Round 38 measured that as the
 * growth mechanism and paginated against it; what it did not do is make the
 * page readable. A real screenshot of one page shows ~20 consecutive
 * `บันทึกฉบับร่าง โดย Yanisa P.` rows between 11:25 and 12:02, with the
 * `เผยแพร่` and the `สร้างรหัสพรีวิวใหม่` that happened in the middle of them
 * buried in the run. The trail records the two things an author came for and
 * shows them at a twentieth of the vertical space it gives to the autosaver.
 *
 * So consecutive rows of the SAME action by the SAME actor become one row. It
 * is a DISPLAY transform and nothing else: the read is unchanged, the
 * projection is unchanged, the sort is unchanged, and the cursor still steps
 * through stored rows rather than through groups.
 *
 * ── WHICH ACTIONS MAY COLLAPSE, AND WHY THE SET IS ONE ────────────────────
 * The test is not "can this action repeat" — several can. It is: does the row
 * carry anything a reader loses when it is folded into a count? A row says
 * WHAT KIND, BY WHOM, WHEN. Folding preserves the first two and replaces the
 * third with a span, so the loss is always "the individual timestamps of the
 * N events". That loss is acceptable exactly when the events are not
 * individually consequential.
 *
 *   · `draft.save` — one per autosave tick, machine-paced rather than authored.
 *     No individual tick is an event anybody looks for; the RUN is the fact.
 *     COLLAPSES.
 *   · `update` — can repeat (an author edits several settings fields). Each one
 *     is an authored change to page IDENTITY: `update` records `{slug,status}`,
 *     and a slug edit moves the page's URL and writes a 301. Three separate
 *     identity edits at three separate times is exactly what an audit reader is
 *     there for. DOES NOT COLLAPSE.
 *   · `status` — each is a transition the public sees. DOES NOT COLLAPSE.
 *   · `draft.discard` — each destroyed unpublished work. DOES NOT COLLAPSE.
 *   · `draft.backup` — each one IS a row in `page_versions` that can still be
 *     restored. Folding three into one count hides that there are three
 *     distinct recoverable artefacts. DOES NOT COLLAPSE.
 *   · `preview.*` — `preview.regenerate` legitimately repeats, and each repeat
 *     invalidates a code somebody may be holding. A credential sequence is the
 *     last thing to summarise. DOES NOT COLLAPSE.
 *   · `create` / `delete` — cannot repeat consecutively on one page at all.
 *
 *   · `publish` — MUST NEVER BE ADDED TO THIS SET. Every publish mints a new
 *     `PageVersion` and changes what the public is reading; two publishes are
 *     two distinct public states of the site. Collapsing them would report one
 *     event where there were two, and this trail is the only place the timing
 *     of an individual publish is recorded — `PageVersion` carries the number
 *     and the actor, and round 38 measured that an audit row cannot be joined
 *     to it. So the timing record would be destroyed with no second source to
 *     recover it from. It is named in THIS COMMENT rather than guarded a second
 *     time in the code below, because a second guard would mean a test that
 *     plants `publish` in this set could not go red — and a control that cannot
 *     fire is not a control (see the redundancy note in test/run.mjs).
 */
export const AUDIT_COLLAPSIBLE_ACTIONS = Object.freeze(['draft.save']);

const COLLAPSIBLE = new Set(AUDIT_COLLAPSIBLE_ACTIONS);

/** May consecutive rows of this action be folded into one? */
export function isCollapsibleAction(action) {
  return COLLAPSIBLE.has(String(action ?? '').trim());
}

/**
 * WHO a row belongs to, for run purposes.
 *
 * The id leads and the name follows, joined by a separator no name can carry.
 * Two different people who happen to share a display name must not merge, and
 * `actor` defaults to `{ id: '', name: '' }` — so anonymous rows key alike and
 * DO merge, which is right: they are the same page's autosave ticks with
 * nobody named on either.
 */
function actorKeyOf(row) {
  return `${String(row?.actor?.id ?? '')}␟${auditActorName(row)}`;
}

/**
 * Fold consecutive same-action, same-actor rows into groups. PURE.
 *
 * Input is the rows in the order the read returned them — newest first — and
 * the output is in that same order. Nothing is re-sorted and nothing is
 * de-duplicated: the compound cursor already guarantees no row arrives twice,
 * and re-sorting here would be a second opinion about an order the query
 * decided (round 38's rule, unchanged).
 *
 * ── `more`, AND THE PAGE BOUNDARY ─────────────────────────────────────────
 * The caller holds the rows it has ACCUMULATED across every fetch so far, and
 * groups that whole array. That is what makes a run split across a fetch
 * boundary re-merge into one group carrying the true total when page 2 lands:
 * the count is a function of the accumulated rows, so it can only ever grow. A
 * group that reset its count on page 2 — which is what grouping each page
 * separately and concatenating the results would produce — is a lie about what
 * happened, and this shape makes that unrepresentable rather than merely
 * avoided.
 *
 * What remains is the OTHER half of the same seam, and it is the half that can
 * still lie. The OLDEST group in a partially-loaded list touches rows that have
 * not been fetched: a run of 60 autosaves loaded 25 at a time would read as 25
 * while the truth is at least 60. So when the read offered a cursor, the last
 * group is marked `openEnded` and its count is rendered as a LOWER BOUND rather
 * than as a total. Loading the next page merges the real rows in, and the bound
 * either grows or — when the run genuinely ended at that row — becomes exact.
 *
 * A group of ONE is never a lower bound worth saying: it prints no count at
 * all, so it makes no claim that could be short. `openEnded` is still set on
 * it, and the renderer simply has nothing to qualify.
 */
export function groupAuditRows(rows, { more = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const groups = [];
  for (const row of list) {
    if (!row) continue;
    const action = String(row.action ?? '').trim();
    const actorKey = actorKeyOf(row);
    const prev = groups[groups.length - 1];
    if (prev && isCollapsibleAction(action) && prev.action === action && prev.actorKey === actorKey) {
      prev.count += 1;
      prev.oldest = row;
      continue;
    }
    groups.push({
      // The NEWEST row's id: a group's head never changes as older rows merge
      // into it, so a React key built on it is stable across a page load.
      key: String(row._id ?? ''),
      action,
      actorKey,
      actorName: auditActorName(row),
      count: 1,
      newest: row,
      oldest: row,
      openEnded: false,
    });
  }
  if (more && groups.length) groups[groups.length - 1].openEnded = true;
  return groups;
}

/**
 * The WHEN half of a collapsed row: oldest first, newest second.
 *
 * Both halves are PARAMETERS for round 38's reason — `toLocaleString` is
 * timezone-dependent, so a function formatting its own dates could only be
 * asserted by value on the machine that wrote the assertion.
 *
 * A run entirely inside one displayed minute formats to two identical strings,
 * and repeating that string either side of a dash reads as a rendering fault
 * rather than as a short run. It collapses to the single text.
 */
export function auditSpanText(oldestText, newestText) {
  const from = String(oldestText ?? '').trim();
  const to = String(newestText ?? '').trim();
  if (!from) return to;
  if (!to || from === to) return from;
  return `${from} – ${to}`;
}

/**
 * One GROUP as a sentence.
 *
 * A group of one delegates to `auditRowLine` rather than reproducing it, so the
 * two can never phrase the same facts differently — a group of one must read as
 * a row rather than as a run of one, because a printed count of one states a
 * run that is not there. The component takes the same branch explicitly at its
 * call site; this is the guarantee for every other caller.
 *
 * Order is action, then the count, then who, then when: the verb is what the
 * reader scans for, and the count is what tells them how much of the list this
 * one line just absorbed.
 */
export function auditGroupLine(group, whenText) {
  if (!group) return '';
  if (!(group.count > 1)) return auditRowLine(group.newest, whenText);
  const label = auditActionLabel(group.action);
  if (!label) return '';
  const name = String(group.actorName ?? '').trim();
  const when = String(whenText ?? '').trim();
  const parts = [label, `${group.openEnded ? 'อย่างน้อย ' : ''}${group.count} ครั้ง`];
  if (name) parts.push(`โดย ${name}`);
  if (when) parts.push(`เมื่อ ${when}`);
  return parts.join(' ');
}
