'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from './EditorProvider';
import { createPageBuilderPage, updatePageBuilderPage } from '@/lib/actions/pageBuilder';

/**
 * Save orchestration: manual save, autosave, and the create→edit transition.
 *
 * ── Why history.replaceState and NOT router.replace ──────────────────────
 * A new page has no id. The first save creates it, and the editor then adopts
 * that id IN PLACE: `history.replaceState` rewrites the URL to
 * /admin/pages/builder/<id>/edit WITHOUT a Next navigation.
 *
 * A `router.replace` here would navigate to the edit route — a SERVER
 * component that re-reads the doc and passes it down as initial state. That
 * remounts EditorProvider, whose reducer re-seeds from the prop, so the
 * client's working tree is replaced by a fresh read: a reload flash, and every
 * keystroke landing between the create response and the remount is silently
 * gone. Its safety would depend on that gap staying small — and gaps that only
 * matter under load surface in production and nowhere else.
 *
 * With replaceState there is no navigation, no remount, no re-seed: the tree
 * survives by construction. (Next supports native pushState/replaceState for
 * exactly this — it syncs usePathname/useSearchParams without re-rendering the
 * route.) The trade: the URL and the rendered route diverge until a reload,
 * which then lands on the correct route and reads the saved doc. Invisible and
 * self-healing.
 *
 * DO NOT "fix" this into router.replace. It reopens a silent-loss window.
 *
 * ── THIS USED TO SAY "Back is unaffected". IT NO LONGER IS ────────────────
 * The sentence here was: "replaceState does not push an entry, so Back leaves
 * the editor to wherever the user came from." The first half is still true of
 * THIS call. The conclusion is not, and it stopped being true on purpose:
 * leaving the editor on Back with unsaved work was a silent-loss bug, and
 * useLeaveGuard.js now keeps one sentinel entry above the editor's so a Back
 * press can be caught and confirmed. Back therefore does NOT leave immediately
 * while there is unsaved work; it asks, and a confirmed leave then goes back
 * two entries so the author still lands where they were aiming.
 *
 * ── AND THIS CALL HAS A SECOND EFFECT NOW. `null` IS NOT INERT ────────────
 * `replaceState(null, …)` rewrites THE CURRENT ENTRY — which, once the guard is
 * armed, is the sentinel — and the `null` WIPES the marker useLeaveGuard stamps
 * on it. Left alone, the Back guard would die at exactly this moment: the first
 * save of a new page, i.e. the page where loss is total because autosave never
 * runs for an unsaved page. useLeaveGuard repairs it by re-stamping the entry
 * on the pathname change this call produces. Do not pass a state object here to
 * "help" — the repair is one-sided on purpose, so this file keeps knowing
 * nothing about the guard.
 *
 * ── Autosave ─────────────────────────────────────────────────────────────
 * 5s idle debounce (typing resets it, so it never fires mid-typing), only when
 * dirty, and NEVER for an unsaved page — an abandoned /builder/new must leave
 * nothing behind. One save in flight at a time with at most one trailing save
 * queued. On CONFLICT autosave stops permanently: retrying into a conflict just
 * hammers a write that must not win.
 */

const AUTOSAVE_IDLE_MS = 5000;

/**
 * ── Why publishing is a SAVE, not updatePageStatus ────────────────────────
 * There is an updatePageStatus action, and the editor must NOT use it. It sets
 * `status` alone and touches nothing else, which breaks two ways from here:
 *
 *   1. It publishes the STORED doc. The author's unsaved edits are still in
 *      this tab, so the page goes live with the previous content, and the
 *      publish SNAPSHOT captures that same stale doc. Autosave then quietly
 *      updates the live page seconds later. The author never sees the window
 *      where the wrong thing was public.
 *   2. It bumps `updatedAt`, which is the optimistic-concurrency token this
 *      editor holds. The very next autosave would fail the equality check and
 *      hit the TERMINAL conflict banner — publishing would brick the session
 *      against a conflict with itself.
 *
 * updatePageBuilderPage writes the tree and the status in ONE document write:
 * the content is what the author sees, the snapshot matches it (the action
 * snapshots on the transition into published), the tier gate still applies
 * (coercePublishStatus), and the fresh token comes back in the response. So
 * publish = PATCH_PAGE the status, then save.
 *
 * The action stays for programmatic/list-view callers, which have no working
 * tree to go stale and no token to invalidate.
 */
export function useEditorSave() {
  const { page, pageId, savedUpdatedAt, dirty, conflict, dispatch } = useEditor();

  // Latest values for the async closures (state inside a promise is stale).
  const pageRef = useRef(page);
  const idRef = useRef(pageId);
  const tokenRef = useRef(savedUpdatedAt);
  const conflictRef = useRef(conflict);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { idRef.current = pageId; }, [pageId]);
  useEffect(() => { tokenRef.current = savedUpdatedAt; }, [savedUpdatedAt]);
  useEffect(() => { conflictRef.current = conflict; }, [conflict]);

  const inFlight = useRef(false);
  const queued = useRef(false);
  const timer = useRef(null);

  const save = useCallback(async () => {
    if (conflictRef.current) return;            // terminal — never retry into it
    if (inFlight.current) { queued.current = true; return; }

    inFlight.current = true;
    // Identity snapshot: every edit produces a new page object (immutable
    // updates), so `!==` after the await means the user edited mid-save.
    const snapshot = pageRef.current;
    dispatch({ type: 'SAVE_START' });

    try {
      const id = idRef.current;
      const res = id
        ? await updatePageBuilderPage(id, snapshot, tokenRef.current)
        : await createPageBuilderPage(snapshot);

      if (res?.conflict) {
        dispatch({ type: 'SAVE_CONFLICT', message: res.error });
        return;
      }
      if (!res?.ok) {
        // Create failures (a slug collision is the likely one) must NEVER drop
        // the draft: no navigation, state untouched, error surfaced for retry.
        dispatch({ type: 'SAVE_ERROR', error: res?.error ?? 'บันทึกไม่สำเร็จ' });
        return;
      }

      if (!id && res.id) {
        // Adopt the created page in place. See the note above.
        window.history.replaceState(null, '', `/admin/pages/builder/${res.id}/edit`);
      }

      dispatch({
        type: 'SAVE_OK',
        pageId: res.id ?? id,
        updatedAt: res.updatedAt,
        dirtyDuringSave: pageRef.current !== snapshot,
        at: Date.now(),
      });
    } catch (err) {
      dispatch({ type: 'SAVE_ERROR', error: err?.message ?? 'บันทึกไม่สำเร็จ' });
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        if (!conflictRef.current) save();       // single trailing save
      }
    }
  }, [dispatch]);

  // Manual save cancels any pending autosave — they must not race.
  const saveNow = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    return save();
  }, [save]);

  useEffect(() => {
    // No autosave for an unsaved page, once dirty is clear, or after a conflict.
    if (!pageId || !dirty || conflict) return undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; save(); }, AUTOSAVE_IDLE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [page, pageId, dirty, conflict, save]);

  // Patch the page envelope, then save the patched tree — see the note above.
  //
  // The two steps cannot collapse into one call: `save` reads pageRef, and the
  // effect that syncs pageRef runs AFTER the dispatch's re-render. Saving
  // inline would send the pre-patch tree — publishing the old status. So the
  // ticket counter below defers the save by one commit.
  const [publishTicket, setPublishTicket] = useState(0);

  const publish = useCallback((patch) => {
    dispatch({ type: 'PATCH_PAGE', patch });
    setPublishTicket((n) => n + 1);
  }, [dispatch]);

  // Declared AFTER the pageRef sync effect on purpose: effects run in
  // declaration order within a commit, so by the time this fires pageRef.current
  // is already the patched tree. Moving this above that effect would silently
  // reintroduce the stale-publish bug.
  useEffect(() => {
    if (!publishTicket) return;
    saveNow();
  }, [publishTicket]); // eslint-disable-line react-hooks/exhaustive-deps

  return { saveNow, publish };
}
