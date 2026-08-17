import { sanitizeTopicHtml } from '@/lib/courses/sanitizeTopicHtml';
import { htmlToProjection, plainBulletsToHtml } from '@/lib/courses/topicHtml';
import { normaliseTopicRow, rowHasContent } from '@/lib/courses/trainingTopics';

/**
 * THE WRITE — one editor state, both halves of the save derived from it.
 *
 * ══ ONE SOURCE OF TRUTH, TWO DESTINATIONS ══════════════════════════════════
 *
 *   plain  →  MSDB `training_topics`, in TODAY'S EXACT SHAPE
 *             `Array<{ title, bullets[] }>`. MSDB's own admin form still edits
 *             that field with plain inputs and every consortium consumer reads
 *             it through GET /api/ai/public-course.
 *   rich   →  `CourseExtension.trainingTopicsRich`, index-aligned with the
 *             array above.
 *
 * They are computed in ONE pass from ONE list, which is what makes the index
 * alignment structural rather than something two functions have to agree about.
 * The alternative — projecting in one place and collecting HTML in another —
 * puts a `.filter()` in each and a row dropped by one but not the other shifts
 * every rich entry after it onto the wrong text, silently.
 *
 * ══ SANITISED ON WRITE, AND STILL SANITISED ON READ ════════════════════════
 *
 * `courseOutlineView` sanitises again at render, and that is not redundancy to
 * remove: stored bytes can predate any version of this function, and the write
 * path is not the only thing that could ever put bytes in that field. The store
 * is not a trust boundary. What sanitising HERE buys is that the bytes MSDB
 * receives are projected from CLEAN html — the projection runs after the
 * sanitiser, so a disallowed element cannot contribute text to what leaves for
 * upstream.
 *
 * ══ WHEN THE RICH HALF IS `[]`, AND WHY THAT IS NOT "SKIPPING THE WRITE" ═══
 *
 * If no row carries anything the plain projection does not already express —
 * no nesting, no marks — the rich array adds nothing and is written as `[]`,
 * the documented sentinel for "no rich copy exists". Three things follow, all
 * of them wanted:
 *
 *   · A course whose formatting the admin REMOVED gets its stale rich copy
 *     cleared rather than left behind to be detected as stale forever.
 *   · An admin who opens a course to fix a Meta Title and saves does not flip
 *     that course onto the `dangerouslySetInnerHTML` branch as a side effect.
 *     During rollout the plain path stays the path plain content takes.
 *   · The key is still PRESENT, so this is a decision the caller made, not an
 *     omission. Omission means leave-alone (extensionUpdate.js), which would
 *     mean the removal case above could never be expressed at all.
 *
 * The comparison is made AFTER sanitising, on both sides. That matters: Tiptap
 * emits `<li><p>text</p></li>` and `plainBulletsToHtml` emits `<li>text</li>`,
 * and the sanitiser's `p` unwrap is what collapses the two onto one shape. A
 * comparison before sanitising would call every untouched row "rich".
 */

/**
 * @param {Array<{title: string, html: string}>} editorRows
 * @returns {{ plain: Array<{title: string, bullets: string[]}>,
 *             rich: string[], richerThanPlain: boolean }}
 */
export function buildTopicSavePayload(editorRows) {
  const input = Array.isArray(editorRows) ? editorRows : [];

  const projected = input.map((entry) => {
    // SANITISE FIRST — everything below is derived from the clean html, so the
    // bytes going upstream cannot carry text that only existed inside a tag
    // this field does not allow.
    const html = sanitizeTopicHtml(entry?.html);
    return {
      html,
      /**
       * Through `normaliseTopicRow`, the SAME coercion the server's own
       * `parseTrainingTopicsValue` applies. Not for the trimming — the
       * projection already trims — but so that the object built here and the
       * object the server rebuilds from the hidden input are produced by one
       * function rather than two that agree today.
       */
      row: normaliseTopicRow({ title: entry?.title, bullets: htmlToProjection(html) }),
    };
  });

  /**
   * ── THE FILTER RUNS ONCE, OVER THE PAIR ────────────────────────────────
   * `rowHasContent` is `title || bullets.length > 0` — the identical rule the
   * hidden input's serialiser and the server parse already use, so a row's
   * fate is the same on every one of the three. Two consequences that are
   * tested in BOTH directions because each is a live shape:
   *
   *   · a TITLE-ONLY row survives (125 of them exist across 27 courses, and
   *     they are legitimate headings — dropping them would delete real
   *     content on the next save of those courses);
   *   · a row the admin left completely empty is dropped, and must not start
   *     surviving because an empty editor now serialises to `<ul></ul>`
   *     instead of ''. It does not: `plainBulletsToHtml` returns '' for an
   *     empty row and the sanitiser reduces Tiptap's empty `<p></p>` to ''.
   */
  const kept = projected.filter((entry) => rowHasContent(entry.row));

  const plain = kept.map((entry) => entry.row);
  const rich = kept.map((entry) => entry.html);

  /**
   * Does ANY row express something the plain projection cannot? Compared
   * against the html the plain bullets would themselves produce, so the
   * question is exactly "would storing this change what renders".
   *
   * ── BOTH SIDES GO THROUGH THE SANITISER. MEASURED, NOT PRECAUTIONARY. ───
   * The reference is `sanitizeTopicHtml(plainBulletsToHtml(...))`, not
   * `plainBulletsToHtml(...)` on its own, because those two are serialised by
   * DIFFERENT libraries and they disagree on one character:
   *
   *   parse5        escapes U+00A0 NO-BREAK SPACE as `&nbsp;`
   *   sanitize-html leaves it raw
   *
   * 35 live values carry a NBSP (`collapse` in topicHtml preserves it
   * deliberately). Comparing the sanitised html against an UNSANITISED
   * reference therefore reported "richer" for every row containing one — and
   * MEASURED against all 79 live courses that was 2 of them, MANUS-MKT and
   * MANUS-EXC, whose text is entirely unformatted. They would have been
   * flipped onto the rich render path by an admin saving an unrelated field,
   * for no reason but an entity-encoding difference.
   *
   * The plain projection was byte-identical throughout — the TEXT was never at
   * risk — which is exactly why this had to be caught by comparison rather
   * than by a round-trip check. Running both sides through the same final
   * serialiser is what makes the comparison mean what it says.
   */
  const richerThanPlain = rich.some(
    (html, i) => html !== sanitizeTopicHtml(plainBulletsToHtml(plain[i].bullets))
  );

  return { plain, rich: richerThanPlain ? rich : [], richerThanPlain };
}

/**
 * RE-SANITISE `trainingTopicsRich` ON THE WAY INTO THE STORE.
 *
 * ══ THE CLIENT ALREADY SANITISED. THAT IS NOT THE SAME THING. ══════════════
 *
 * `buildTopicSavePayload` runs in the admin's browser, so the array reaching
 * the server action is sanitised — but only for an admin using the form. A
 * server action is a POST endpoint; anything that can call it can send any
 * array it likes. A sanitiser that runs only on the client is a formatting
 * convenience, never a boundary, and treating it as one is how stored XSS gets
 * shipped by people who did sanitise.
 *
 * So the same function runs again here, on the server, over whatever arrived.
 * For a real admin save it is a no-op — `sanitizeTopicHtml` is idempotent
 * (asserted, not assumed) — and for anything else it is the only thing
 * standing between a crafted payload and `dangerouslySetInnerHTML`.
 *
 * `courseOutlineView` sanitises a THIRD time at render, for the different
 * reason that stored bytes can predate any version of this code. Three passes,
 * three distinct reasons; none is redundant with another.
 *
 * ══ KEY PRESENCE IS PRESERVED EXACTLY ══════════════════════════════════════
 *
 * An ABSENT key must stay absent — `buildExtensionUpdate` reads absence as
 * leave-alone, and every caller other than CourseForm relies on it. So this
 * returns `data` UNTOUCHED when the key is not there, rather than returning a
 * copy carrying `trainingTopicsRich: []`, which would silently wipe the field
 * for MasterclassCourseFormClient and every other caller.
 */
export function sanitiseTopicRichForWrite(data) {
  if (!Object.prototype.hasOwnProperty.call(data ?? {}, 'trainingTopicsRich')) return data;
  const raw = data.trainingTopicsRich;
  return {
    ...data,
    trainingTopicsRich: Array.isArray(raw) ? raw.map((html) => sanitizeTopicHtml(html)) : [],
  };
}
