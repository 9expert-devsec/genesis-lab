/**
 * draftState — reading the draft/published split.
 *
 * A published page must not change when the author edits it. Autosave writes
 * the CONTENT surface into `draft` on the SAME document; pressing เผยแพร่
 * promotes it onto the live fields. This module is the read side of that: does
 * a page carry a draft, what content should the editor open, and what does a
 * read look like that must not carry the draft at all.
 *
 * PURE — no db, no models, no React, no next/*. It imports one array of key
 * names from the schema module (which itself imports only zod), so the editor,
 * the admin list, the preview route and the actions can all import it. ONE
 * definition, so "what is a draft" can never be decided two different ways.
 *
 * The key list is IMPORTED, never restated. Restating it here is the whole
 * failure this file is arranged to avoid: the thing that builds a draft and the
 * thing that reads one would drift, and the drift is silent — a key missing
 * from one side just quietly stops being drafted.
 */
import { DRAFT_CONTENT_KEYS } from '@/lib/schemas/pageBuilder';

/**
 * Pick exactly DRAFT_CONTENT_KEYS off a source object.
 *
 * A key that the source does not OWN is omitted rather than emitted as
 * `undefined`, so the result never invents a field. That matters for the case
 * every production document is in: these pages predate the draft field and are
 * read through `.lean()` plus a JSON round-trip, where a Mongoose `default`
 * does NOT apply — the key is simply absent. `showPinBadge` read back undefined
 * exactly this way in the article form.
 */
function pickContent(source) {
  const out = {};
  if (source == null || typeof source !== 'object') return out;
  for (const key of DRAFT_CONTENT_KEYS) {
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
 * the PageBuilder schema does not set `minimize: false`, so Mongoose STRIPS an
 * empty object on save. A `draft: {}` written today reads back absent tomorrow.
 * If this returned true for `{}` the same page would answer differently before
 * and after a round-trip — the exact instability that makes a bug take a week
 * to see. An empty draft also has nothing to publish, so false is the honest
 * answer on both counts.
 */
export function hasUnpublishedDraft(page) {
  const draft = page?.draft;
  if (draft == null || typeof draft !== 'object' || Array.isArray(draft)) return false;
  return Object.keys(draft).length > 0;
}

/**
 * The content the editor (and later the preview route) should open: the draft's
 * content when there is one, otherwise the page's own live content — restricted
 * to DRAFT_CONTENT_KEYS either way.
 *
 * WHY THE LIVE HALF ON A NULL DRAFT, which is the point of the whole function:
 * an existing published page has no draft until its first edit. Returning the
 * draft blindly would open it as an EMPTY PAGE — no title, no sections — and
 * the first autosave would then write that emptiness back as the draft. So a
 * missing draft is not "no content", it is "no content YET UNPUBLISHED", and
 * the live fields are the correct answer.
 *
 * WHOLESALE, NOT MERGED. When a draft exists it supplies every key it has, and
 * keys it lacks are NOT filled in from the live page. Round 2 writes the whole
 * content surface at once, so a partial draft is a malformed draft; merging
 * would paper over that and produce a page half from each side, which is a
 * state no author ever authored.
 *
 * The restriction also drops the draft's server-set `savedAt`/`savedBy` stamps:
 * they are not content, they are not in draftContentSchema, and nothing that
 * renders a page should see them.
 */
export function effectiveContent(page) {
  return pickContent(hasUnpublishedDraft(page) ? page.draft : page);
}

/**
 * The page without its draft, for every read that must not carry one — public
 * routes, JSON payloads, PageVersion snapshots.
 *
 * Removes `draft` and NOTHING else: every other key keeps its identity, so
 * callers can hand the result straight on. Does not mutate the input, and a
 * page that never had the key comes back unchanged.
 */
export function stripDraft(page) {
  if (page == null || typeof page !== 'object') return page;
  const { draft: _draft, ...rest } = page;
  return rest;
}
