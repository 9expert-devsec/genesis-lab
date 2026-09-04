/**
 * customPageDraft — the CustomPage binding of the shared draft/published
 * semantics.
 *
 * The semantics live in lib/pages/draftState.js and are shared with the Page
 * Builder: absent vs null vs `{}` all meaning "no draft", why a missing draft
 * returns the LIVE content, wholesale-not-merged, what a strip removes. This
 * file supplies only the part that differs — WHICH KEYS are content for this
 * page type — and binds the helpers to it.
 *
 * It is the exact mirror of lib/pageBuilder/draftState.js. Two bindings, one set
 * of semantics; the alternative was two copies of the semantics, which is the
 * drift the extraction removed.
 *
 * The key list is IMPORTED, never restated. That is the failure this layout
 * exists to avoid: the thing that builds a draft and the thing that reads one
 * would drift, and the drift is silent — a key missing from one side just
 * quietly stops being drafted.
 *
 * PURE — no db, no models, no React, no next/*. The editor imports it.
 */
import {
  CUSTOM_PAGE_DRAFT_KEYS, CUSTOM_PAGE_LIVE_ONLY_KEYS,
} from '@/lib/schemas/customPage';
import { bindDraftState } from '@/lib/pages/draftState';
/**
 * RE-EXPORTED unchanged, from the shared module. Neither takes a key list — one
 * removes a single field by name, the other asks whether the field holds
 * anything — so both are the same operation for every collection. Re-exported
 * here so a caller working on custom pages has one import to reach for.
 */
export { hasUnpublishedDraft, stripDraft } from '@/lib/pages/draftState';

const bound = bindDraftState({
  draftKeys: CUSTOM_PAGE_DRAFT_KEYS,
  liveOnlyKeys: CUSTOM_PAGE_LIVE_ONLY_KEYS,
});

/**
 * The content the editor should open — the draft's when there is one, otherwise
 * the page's own live content, restricted to CUSTOM_PAGE_DRAFT_KEYS either way.
 *
 * The live fallback is what stops an existing published page opening EMPTY: it
 * has no draft until its first save, and returning the draft blindly would show
 * no title and no body, which the next save would then write back as the draft.
 */
export const effectiveContent = bound.effectiveContent;

/**
 * The stored document unwrapped into the ONE tree the editor edits and the
 * ?preview=<token> route renders: the effective content for the fourteen
 * content keys, the document's own values for slug, status and slugHistory.
 *
 * `.draft` is NOT carried through — it has been unwrapped INTO the result, and
 * keeping both would give the caller two answers to "what is the body".
 */
export const composeWorkingView = bound.composeWorkingView;
