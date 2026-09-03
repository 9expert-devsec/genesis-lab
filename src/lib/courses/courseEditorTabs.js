/**
 * The course editor's tab vocabulary.
 *
 * ── WHY A MODULE FOR THREE STRINGS ──────────────────────────────────────────
 * The tab state used to be a BOOLEAN — `showGallery` — which said everything it
 * needed to while there were exactly two panels and nothing else could ever be
 * true. A third tab makes the boolean unrepresentable, and the obvious fix
 * (scatter `'content'` / `'gallery'` / `'history'` string literals through the
 * form and its tests) is how a typo'd literal becomes a tab that silently never
 * activates: every comparison against it is simply false, and nothing errors.
 *
 * So the names live here, frozen, and both the form and the tests read them
 * from one place.
 *
 * ── THE INVARIANT THAT SURVIVED THE CONVERSION ──────────────────────────────
 * A NON-ACTIVE PANEL IS HIDDEN, NEVER UNMOUNTED. That is not a rendering
 * preference; it is the reason the editor works at all:
 *
 *   · the SAVE reads the live DOM — `shapePayload` consumes
 *     `new FormData(form)`, so a course body that is conditionally rendered
 *     away contributes NO keys, and the payload then carries empty strings and
 *     zeroes for the whole course. Saving from the Gallery tab would blank the
 *     course.
 *   · the DIRTY CHECK reads the same DOM (`courseEditorSignature` is built from
 *     `[...new FormData(formRef.current)]`), so an unmounted body would read as
 *     "every field just changed" and then as "nothing is dirty" — the
 *     unsaved-changes guard would stop protecting the admin's typing.
 *
 * Both failure modes are SILENT. Nothing throws, the screen looks right, and
 * the damage is only visible in the saved record. test/render/courseEditorShell
 * pins the invariant; see the note there on what makes that assertion fail for
 * the right reason.
 *
 * `isTab` exists so a stored or restored value cannot put the editor into a
 * state with no visible panel — an unknown tab falls back to CONTENT rather
 * than hiding all three.
 */
export const TAB = Object.freeze({
  CONTENT: 'content',
  GALLERY: 'gallery',
  HISTORY: 'history',
});

/** Every valid tab, in the order they are shown. */
export const TAB_ORDER = Object.freeze([TAB.CONTENT, TAB.GALLERY, TAB.HISTORY]);

/** The tab the editor opens on. */
export const DEFAULT_TAB = TAB.CONTENT;

/** Is this a tab this editor actually has? */
export function isTab(value) {
  return TAB_ORDER.includes(value);
}

/**
 * The tab to render for a requested value — never returns something with no
 * panel behind it.
 */
export function resolveTab(value) {
  return isTab(value) ? value : DEFAULT_TAB;
}

/**
 * The class for ONE panel. Hidden, never unmounted — see the header.
 *
 * Returns the active panel's own layout class or `'hidden'`, so the call site
 * cannot accidentally express "render nothing": there is no branch here that
 * produces an absent element.
 *
 * @param {string} tab      which panel this is
 * @param {string} active   the currently selected tab
 * @param {string} [shown]  the class to use when this panel IS the active one
 */
export function panelClass(tab, active, shown = '') {
  return tab === active ? shown : 'hidden';
}
