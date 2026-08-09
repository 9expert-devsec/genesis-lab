/**
 * training_topics — the ONE place the stored shape is defined.
 *
 * ══ THE SHAPE IS { title, bullets[] }, AND IT IS NOT NEGOTIABLE ═════════════
 *
 * MEASURED against live MSDB on 2026-08-09: 823 subdocuments across 77 courses,
 * every one of them `{ title, bullets }`. ZERO rows anywhere upstream carry
 * `topic` or `subtopics`.
 *
 * Genesis used to speak `{ topic, subtopics[] }` on both the read and the write
 * side, and both halves were wrong in the same direction, which is why it went
 * unnoticed for so long:
 *
 *   READ   the admin editor asked each row for `.topic` / `.subtopics`, got
 *          undefined from perfectly good upstream data, and rendered blank.
 *   WRITE  a save then serialised those blanks back under key names MSDB does
 *          not keep, so the round trip replaced real content with subdocuments
 *          stripped to their schema defaults — `{ title: '', bullets: [] }`.
 *
 * The public renderer (CourseOutline.jsx) always read `{ title, bullets }`, so
 * the damage was visible on the site — numbered accordion rows with blank
 * headings — while the editor showed nothing wrong.
 *
 * ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
 * src/lib/actions/courses.js is `'use server'` and imports next/cache, the
 * audit recorder and the MSDB client, so no test in this suite can import it
 * (see the header of test/fs/actionsParse.test.mjs). Keeping the parse here
 * means the round-trip test exercises THE FUNCTION THAT RUNS IN PRODUCTION
 * rather than a copy of it written in the test — and a copy is exactly the kind
 * of parallel implementation that stays green while the real path rots.
 *
 * ── TITLE-ONLY ROWS ARE CONTENT, NOT DAMAGE ─────────────────────────────────
 * MEASURED the same day: 121 subdocuments across 26 courses carry a real title
 * and an empty `bullets` array — "Part 9. สรุปเนื้อหา และ Q&A", "สรุปเนื้อหาทั้งหมด
 * และแนวทางการต่อยอด", and so on. A filter that drops rows without bullets
 * would silently delete 121 real headings on the next save of those courses.
 * Only a row carrying NEITHER a title NOR any bullet is dropped.
 */

/** Trim to a string, treating null/undefined as empty. */
const toStr = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

/**
 * Does this row carry any information at all?
 *
 * A title alone is enough — see the title-only note above. Bullets alone are
 * enough too (a heading may legitimately be blank while the content is not).
 * Only the doubly-empty row is discarded.
 */
export function rowHasContent(row) {
  return Boolean(row?.title) || (Array.isArray(row?.bullets) && row.bullets.length > 0);
}

/**
 * Normalise one row to the upstream shape.
 *
 * `bullets` accepts either an array (already split) or a newline-delimited
 * string (what the editor's textarea produces — one line is one bullet).
 */
export function normaliseTopicRow(row) {
  const bullets = Array.isArray(row?.bullets)
    ? row.bullets.map(toStr).filter(Boolean)
    : toStr(row?.bullets).split('\n').map((s) => s.trim()).filter(Boolean);
  return { title: toStr(row?.title), bullets };
}

/**
 * Decode the editor's serialised value into the upstream shape.
 *
 * Named `…Value` rather than `parseTrainingTopics` so the server action can
 * import it WITHOUT an alias: `test/fs/auditCoverage.test.mjs` (W1-d) asserts
 * that no module under src/lib/actions aliases an import, and an avoidable
 * name collision is a poor reason to spend that guard.
 *
 * Accepts the JSON string the hidden input carries, or an already-parsed array.
 * Malformed input yields `[]` — better to lose the field than to abort a save
 * the admin has just spent ten minutes on.
 */
export function parseTrainingTopicsValue(raw) {
  if (raw == null || raw === '') return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normaliseTopicRow).filter(rowHasContent);
}

/**
 * THE READ SIDE — an MSDB course row → seed rows for the topics editor.
 *
 * ══ THIS IS WHERE THE DEFECT LIVED, SO THIS IS WHERE THE TEST MUST START ════
 *
 * The editor was never the whole bug. The admin form's seed map asked each
 * upstream row for `t.topic`, got undefined from perfectly good data, and
 * handed the editor blanks — so a round-trip test that begins at the EDITOR'S
 * PROPS starts one step downstream of the defect and stays green for its entire
 * lifetime. Reverting the single expression below to `t?.topic` must redden the
 * suite, and it can only do that if a test calls THIS function.
 *
 * It lives here rather than inside CourseForm.jsx for a second reason: that
 * component imports `@/lib/actions/courses`, which is `'use server'` and pulls
 * in the audit recorder and the MSDB write client. A test importing the
 * component would drag all of it in, and the cheapest way to make the seed path
 * testable is to keep it out of the component in the first place.
 */
export function seedTrainingTopics(initial, { onLegacyShape } = {}) {
  const rows = initial?.training_topics;
  if (!Array.isArray(rows)) return [];

  const legacy = findLegacyShapeRows(rows);
  if (legacy.length > 0 && typeof onLegacyShape === 'function') {
    onLegacyShape({ rows: legacy, course: initial?.course_id ?? initial?._id ?? '(unknown)' });
  }

  return rows.map((t) => ({
    // `t.title` FIRST and always. The `t.topic` fallback is the tripwire's
    // rescue arm, not the primary read — see onLegacyShape above.
    title: t?.title ?? t?.topic ?? '',
    bullets: Array.isArray(t?.bullets)
      ? t.bullets
      : Array.isArray(t?.subtopics)
        ? t.subtopics
        : (t?.bullets ?? ''),
  }));
}

/**
 * TRIPWIRE — did a row arrive in the retired `{ topic, subtopics }` shape?
 *
 * Zero rows upstream carry those keys, so this must never fire. It exists
 * because an unreachable branch that fires silently is indistinguishable from
 * one that never fires: if the shape ever comes back, this says so by name
 * instead of quietly rescuing it and leaving the real cause unexamined.
 *
 * Returns the offending indexes rather than throwing — a legacy row is a reason
 * to shout in the console, not to take the admin's edit form away.
 */
export function findLegacyShapeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.reduce((out, row, i) => {
    if (row && typeof row === 'object'
      && (Object.hasOwn(row, 'topic') || Object.hasOwn(row, 'subtopics'))) out.push(i);
    return out;
  }, []);
}
