/**
 * The caveat block — what a number on this screen does NOT tell you.
 *
 * ── WHY THIS IS A COMPONENT AND NOT PROSE AT EACH CALL SITE ─────────────────
 * docs/cache-console-inventory.md §E classifies most of what this console can
 * read as INFERRED: `syncedAt` says a WRITE happened, not that any served page
 * reflects it; `max(synced_at)` says a sync last succeeded at touching a row,
 * not that the most recent run succeeded. The binding rule for this screen is
 * that an INFERRED value must carry its limitation IN THE UI TEXT — "Synced
 * 08:36" on its own is a lie of omission.
 *
 * A shared component makes that mechanical rather than a thing each panel's
 * author has to remember, and gives the source-scan guard one string to assert
 * on. Prose typed separately into five panels is prose that gets trimmed from
 * four of them the first time the layout feels crowded.
 *
 * Rendered as real text, never a tooltip or a title attribute: a caveat behind
 * a hover is a caveat nobody on a phone will ever see, and this screen is read
 * precisely when someone is trying to work out whether to trust a number.
 */
export function Caveat({ children }) {
  return (
    <p className="mt-2 rounded-9e-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
      <span className="font-bold">อ่านค่านี้อย่างไร — </span>
      {children}
    </p>
  );
}

/**
 * The one that applies to every `syncedAt` on this page, so the wording cannot
 * drift between the two snapshot panels.
 */
export function SyncedAtCaveat() {
  return (
    <Caveat>
      เวลานี้บอกว่า <strong>มีการเขียนสแนปช็อตเมื่อไร</strong> เท่านั้น —
      ไม่ได้บอกว่าหน้าเว็บที่ผู้ใช้เห็นอยู่ตอนนี้ใช้ข้อมูลชุดนี้แล้วหรือยัง
      หน้าเว็บถูกแคชแยกต่างหาก และแอปอ่านสถานะแคชนั้นไม่ได้
      (This timestamp says only that a write happened. It does not say that any
      page a visitor is being served reflects it — the rendered page is cached
      separately, and that cache&apos;s state cannot be read from application code.)
    </Caveat>
  );
}

/**
 * The mirror-collection caveat. Two separate limitations, both load-bearing,
 * so they are stated together rather than one being picked as the headline.
 */
export function MirrorCaveat() {
  return (
    <Caveat>
      ไม่มี sync ตัวไหนลบแถว — จำนวนแถวจึงมีแต่เพิ่ม
      และแถวที่ถูกลบไปแล้วที่ต้นทางจะยังค้างอยู่ตลอดไป
      และไม่มีที่ไหนบันทึกผลการ sync ที่ล้มเหลว ดังนั้น{' '}
      <strong>รอบที่ล้มเหลวกับรอบที่ไม่ได้รันเลย แยกจากกันไม่ได้</strong>
      {' '}(No sync deletes, so counts only grow and a row removed upstream stays
      forever. No run status is persisted anywhere, so a failed cron run and a
      skipped one are indistinguishable from here.)
    </Caveat>
  );
}
