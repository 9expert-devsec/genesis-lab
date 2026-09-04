/**
 * draftState — reading the draft/published split, for ANY page collection.
 *
 * A published page must not change when the author edits it. A save writes the
 * CONTENT surface into `draft` on the SAME document; publishing promotes it onto
 * the live fields. This module is the read side of that: does a page carry a
 * draft, what content should the editor open, and what does a read look like
 * that must not carry the draft at all.
 *
 * PURE — no db, no models, no React, no next/*, and — unlike the module this was
 * extracted from — no import of any particular collection's key list either.
 *
 * ── WHY IT IS COLLECTION-NEUTRAL ───────────────────────────────────────────
 * Two collections now need these semantics: PageBuilder (nine content keys) and
 * CustomPage (fourteen). The semantics are IDENTICAL and only the key list
 * differs, so the key list became a parameter and everything else moved
 * unchanged. The alternative — a second module with the same four functions —
 * would have duplicated four pieces of reasoning that were expensive to get
 * right and are silent when they drift:
 *
 *   · absent vs null vs `{}` all meaning "no draft";
 *   · why `{}` is not a draft (a storage fact, see hasUnpublishedDraft);
 *   · why a MISSING draft returns the LIVE content rather than nothing;
 *   · wholesale, not merged.
 *
 * Each of those is a comment that would then exist twice and could be corrected
 * once. That is the drift the shared settings shell removed last round, and it
 * is the same move for the same reason.
 *
 * ── THE SPLIT IS NOT ARBITRARY ─────────────────────────────────────────────
 * `stripDraft` and `hasUnpublishedDraft` take NO key list, because neither ever
 * needed one: one destructures a single field, the other counts own keys. They
 * were already collection-neutral and are moved verbatim. Only the three that
 * PICK content take `keys`.
 */

/**
 * Pick exactly `keys` off a source object.
 *
 * A key that the source does not OWN is omitted rather than emitted as
 * `undefined`, so the result never invents a field. That matters for the case
 * every production document is in: these pages predate the draft field and are
 * read through `.lean()` plus a JSON round-trip, where a Mongoose `default`
 * does NOT apply — the key is simply absent. `showPinBadge` read back undefined
 * exactly this way in the article form.
 */
export function pickContent(source, keys) {
  const out = {};
  if (source == null || typeof source !== 'object') return out;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

/**
 * Does this page carry an unpublished draft?
 *
 * True only for a non-null object with at least one own key. Three states
 * collapse to false and they must:
 *   - `draft: null`      — the field's default; nothing unpublished.
 *   - field ABSENT       — every page that predates this work. There is no
 *                          backfill and no migration, so this is the common
 *                          case, not an edge case.
 *   - `draft: {}`        — see below.
 *
 * WHY `{}` IS NOT A DRAFT, and it is a storage fact rather than a taste call:
 * neither page schema sets `minimize: false`, so Mongoose STRIPS an empty
 * object on save. A `draft: {}` written today reads back absent tomorrow. If
 * this returned true for `{}` the same page would answer differently before and
 * after a round-trip — the exact instability that makes a bug take a week to
 * see. An empty draft also has nothing to publish, so false is the honest
 * answer on both counts.
 *
 * TAKES NO KEY LIST, deliberately: "is there anything unpublished here" is a
 * question about the field, not about which fields are drafted. A version that
 * counted only recognised keys would answer false for a draft written by a
 * newer schema, which is the opposite of safe.
 */
export function hasUnpublishedDraft(page) {
  const draft = page?.draft;
  if (draft == null || typeof draft !== 'object' || Array.isArray(draft)) return false;
  return Object.keys(draft).length > 0;
}

/**
 * The content the editor (and the preview route) should open: the draft's
 * content when there is one, otherwise the page's own live content — restricted
 * to `keys` either way.
 *
 * WHY THE LIVE HALF ON A NULL DRAFT, which is the point of the whole function:
 * an existing published page has no draft until its first edit. Returning the
 * draft blindly would open it as an EMPTY PAGE — no title, no body — and the
 * first save would then write that emptiness back as the draft. So a missing
 * draft is not "no content", it is "no content YET UNPUBLISHED", and the live
 * fields are the correct answer.
 *
 * WHOLESALE, NOT MERGED. When a draft exists it supplies every key it has, and
 * keys it lacks are NOT filled in from the live page. A save writes the whole
 * content surface at once, so a partial draft is a malformed draft; merging
 * would paper over that and produce a page half from each side, which is a
 * state no author ever authored.
 *
 * The restriction also drops the draft's server-set `savedAt`/`savedBy` stamps:
 * they are not content, they are not in either draft schema, and nothing that
 * renders a page should see them.
 */
export function effectiveContent(page, keys) {
  return pickContent(hasUnpublishedDraft(page) ? page.draft : page, keys);
}

/**
 * The page without its draft, for every read that must not carry one — public
 * routes, JSON payloads, version snapshots.
 *
 * Removes `draft` and NOTHING else: every other key keeps its identity, so
 * callers can hand the result straight on. Does not mutate the input, and a
 * page that never had the key comes back unchanged.
 *
 * TAKES NO KEY LIST — it removes one field by name and is the same operation
 * for every collection.
 */
export function stripDraft(page) {
  if (page == null || typeof page !== 'object') return page;
  const { draft: _draft, ...rest } = page;
  return rest;
}

/**
 * The stored document unwrapped into the ONE tree that an editor edits and a
 * preview renders: effectiveContent() for the content keys, the stored
 * document's own values for every live-only key.
 *
 * `.draft` is NOT carried through — it has been unwrapped INTO the result, and
 * keeping both would give the caller two answers to "what is the title".
 *
 * Lives here rather than in an editor's reducer because two very different
 * callers need exactly this composition and must not drift: the editor and the
 * preview route, whose whole purpose is to show what the editor is working on
 * rather than what is currently public.
 */
export function composeWorkingView(raw, { draftKeys, liveOnlyKeys }) {
  const view = {};
  for (const key of liveOnlyKeys) {
    if (Object.prototype.hasOwnProperty.call(raw ?? {}, key)) view[key] = raw[key];
  }
  return { ...view, ...effectiveContent(raw, draftKeys) };
}

/**
 * Bind the three key-dependent helpers to one collection's partition, so a
 * caller reads `effectiveContent(page)` rather than repeating a key list at
 * every call site — which is how a key list drifts.
 *
 * Returns only the bound three. `stripDraft` and `hasUnpublishedDraft` are
 * imported directly, because binding a function to a parameter it does not take
 * would suggest it varies by collection when it does not.
 */
export function bindDraftState({ draftKeys, liveOnlyKeys }) {
  return {
    pickContent: (source) => pickContent(source, draftKeys),
    effectiveContent: (page) => effectiveContent(page, draftKeys),
    composeWorkingView: (raw) => composeWorkingView(raw, { draftKeys, liveOnlyKeys }),
  };
}
