/**
 * /schedule's `?view=` parameter — which desktop layout to draw.
 *
 * `list` is the legacy /register-public layout (one block per course, one line
 * per round). Anything else — absent, empty, `table`, garbage — is the table,
 * which stays the default.
 *
 * Same URL rule as /training-course's view toggle (CourseListClient): the URL is
 * read on every render and never copied into state; an ACTION writes the
 * parameter when the value is non-default and DELETES it for the default, so the
 * default view keeps the one canonical /schedule URL; every other parameter is
 * carried through untouched.
 *
 * Pure: no next/*, so the pure tier can pin both halves.
 */

export const SCHEDULE_VIEWS = Object.freeze(['table', 'list']);

/** `'list'` for exactly `'list'`, `'table'` for everything else. */
export function parseScheduleView(value) {
  return value === 'list' ? 'list' : 'table';
}

/**
 * The query string after choosing `view`, with every other key kept as it was.
 *
 * @param {string|URLSearchParams} currentQuery the current search string
 * @param {string} view the view being chosen
 * @returns {string} the next query string, without a leading `?`
 */
export function scheduleViewQuery(currentQuery, view) {
  const next = new URLSearchParams(
    typeof currentQuery === 'string' ? currentQuery : currentQuery?.toString() ?? '',
  );
  if (parseScheduleView(view) === 'list') next.set('view', 'list');
  else next.delete('view');
  return next.toString();
}
