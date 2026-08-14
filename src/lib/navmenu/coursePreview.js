/**
 * Compose the mega menu's Col 4 preview for a course the user hovered in Col 3.
 *
 * ── WHY THIS FUNCTION EXISTS AT ALL ────────────────────────────────────────
 * The menu showed two names for the same course at once. The course LIST
 * (Col 3) and the group's default card both read `course_name` out of the
 * `nav_menu_cache` snapshot, while hovering a course row replaced the card with
 * one whose name came from the upstream DETAIL response
 * (nav-course-preview.js#getCoursePreview). Rename a course and the two
 * disagree until the 3-hourly nav cron catches up: old name in the list, new
 * name on the card, in the same open menu.
 *
 * The detail fetch itself is NOT the mistake and is not removed. Col 4 needs
 * `course_cover_url`, and the list endpoint does not carry it — that is stated
 * at nav-course-preview.js:44-47 and is still true. What was accidental is that
 * having made the call for the cover, the caller also took the NAME off the
 * response, because it happened to be there. Nobody decided the card should
 * show a live name; it showed one for free.
 *
 * ── THE SEAM, AND WHY IT IS HERE RATHER THAN AT THE CALLER ─────────────────
 * The card must show the name of the ROW the user hovered. Two ways to get
 * there: let the action keep returning a name and have the caller override it,
 * or stop the name from ever leaving the action. This is the second, and the
 * composition is explicit-field, NEVER a spread of `cover`:
 *
 *   course_name: row.course_name          ← and nothing else, ever
 *
 * The difference matters. Under an override, both names coexist inside one
 * object at runtime, and the next person to touch any of the three render sites
 * picks up whichever one the spread happened to leave behind — the bug returns
 * silently and looks like a typo. Here there is no second name in the process
 * to pick up: a regression has to physically add `cover.course_name` to the
 * literal below, in a function whose entire purpose is stated above it, and the
 * pure test next to it goes red the moment it does. Impossible-by-construction
 * beats remembered-by-convention, which is the only reason this is a module and
 * not four lines inside handleCourseHover.
 *
 * `cover` contributes the cover URL and NOTHING ELSE. Identity, name and alias
 * all come from the row, so the card's href is derived from exactly the same
 * two fields as the Col 3 link the user hovered (`urlAlias || course_id`) —
 * the card cannot navigate somewhere the row would not.
 *
 * ── THE INTENDED CONSEQUENCE, STATED SO IT IS NOT READ AS A BUG ────────────
 * While `nav_menu_cache` is stale, this card now shows the STALE name. That is
 * the goal, not a regression: before, the menu was HALF stale and contradicted
 * itself on screen; now it is UNIFORMLY stale and merely behind. A visitor
 * reading one wrong name learns one wrong thing; a visitor reading two
 * different names for one course learns that the site cannot be trusted. The
 * staleness window (up to 3h, until the navmenu cron) is a separate problem
 * with a separate fix — it is NOT addressed here and must not be papered over
 * by making one surface secretly fresh.
 *
 * Second, smaller consequence: a FAILED cover fetch no longer blanks the card.
 * It used to, because the name lived on the same response as the image and both
 * were lost together. The name is now already in hand, so a null cover degrades
 * to the placeholder image with the correct title, and the caller only renders
 * nothing when there is no row at all.
 *
 * @param {{course_id: string, course_name?: string, urlAlias?: string|null}} row
 *        the Col 3 row that was hovered — snapshot-sourced, same object the
 *        list rendered its label and its href from.
 * @param {{course_cover_url?: string|null}|null} cover
 *        the detail lookup's result. Only `course_cover_url` is read.
 * @returns {{course_id, course_name, urlAlias, course_cover_url}|null}
 *          null only when there is no usable row.
 */
export function composeCoursePreview(row, cover) {
  if (!row?.course_id) return null;
  return {
    course_id: row.course_id,
    course_name: row.course_name ?? '',
    urlAlias: row.urlAlias ?? null,
    course_cover_url: cover?.course_cover_url ?? null,
  };
}
