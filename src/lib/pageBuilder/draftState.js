/**
 * draftState — the PageBuilder binding of the shared draft/published semantics.
 *
 * ── WHAT MOVED, AND WHY THIS FILE STILL EXISTS ─────────────────────────────
 * The semantics — absent vs null vs `{}`, why a missing draft returns the LIVE
 * content, wholesale-not-merged, what a strip removes — now live in
 * lib/pages/draftState.js, because a second collection (CustomPage) needs
 * exactly them and only the key list differs. A parallel copy would have
 * duplicated four pieces of reasoning that are silent when they drift.
 *
 * This file is what binds those helpers to THIS collection's partition. It
 * keeps the same four exports with the same signatures, so every existing call
 * site is unchanged: `effectiveContent(page)`, not `effectiveContent(page,
 * keys)`. An extraction that made its callers pass a key list would be a
 * rename wearing a refactor's name, and it would put the key list at every call
 * site — which is precisely how a key list drifts.
 *
 * The key list is still IMPORTED, never restated. That is the whole failure this
 * file was arranged to avoid: the thing that builds a draft and the thing that
 * reads one would drift, and the drift is silent — a key missing from one side
 * just quietly stops being drafted.
 */
import { DRAFT_CONTENT_KEYS, LIVE_ONLY_KEYS } from '@/lib/schemas/pageBuilder';
import { bindDraftState } from '@/lib/pages/draftState';
/**
 * RE-EXPORTED unchanged. Neither takes a key list — one removes a single field
 * by name, the other asks whether the field holds anything — so both were
 * already collection-neutral and are re-exported rather than bound. Every
 * existing importer keeps importing them from here.
 */
export { hasUnpublishedDraft, stripDraft } from '@/lib/pages/draftState';

const bound = bindDraftState({
  draftKeys: DRAFT_CONTENT_KEYS,
  liveOnlyKeys: LIVE_ONLY_KEYS,
});

/**
 * The content the editor should open — the draft's when there is one, otherwise
 * the page's own live content, restricted to DRAFT_CONTENT_KEYS either way.
 * See lib/pages/draftState.js for why a missing draft is not "no content".
 */
export const effectiveContent = bound.effectiveContent;

/**
 * The stored document unwrapped into the ONE tree the editor edits and
 * /preview/[slug] renders. See lib/pages/draftState.js.
 */
export const composeWorkingView = bound.composeWorkingView;
