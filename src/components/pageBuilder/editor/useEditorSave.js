'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useEditor } from './EditorProvider';
import {
  createPageBuilderPage,
  saveDraftContent,
  updatePageIdentity,
  publishPageStatus,
  discardDraftContent,
} from '@/lib/actions/pageBuilder';
import { DRAFT_CONTENT_KEYS, IDENTITY_KEYS } from '@/lib/schemas/pageBuilder';
import { runSave, runPublish, domainChanged } from '@/lib/pageBuilder/savePlan';

/**
 * Save orchestration: manual save, autosave, publish, discard, and the
 * create→edit transition.
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
 * hammers a write that must not win. None of that changed this round.
 *
 * KNOWN AND DELIBERATELY PRESERVED: autosave flushes IDENTITY as well as
 * content, so a half-typed slug reaches the server on an idle tick and takes
 * effect immediately (updatePageIdentity busts caches, exactly as the
 * whole-document save did before it). That risk is not introduced here — the
 * single-document autosave already sent a half-typed slug on every tick. This
 * round preserves the behaviour rather than changing it; debouncing identity
 * separately, or holding it until an explicit save, is a real question and a
 * different round's.
 */

const AUTOSAVE_IDLE_MS = 5000;

/**
 * ── Why publishing FLUSHES FIRST, and why it is no longer a whole-page save ──
 * This block used to explain why publish had to be "PATCH_PAGE the status, then
 * save the whole document". That mechanism is gone: publishPageStatus now sets
 * the status and promotes `.draft` onto the live fields in ONE write, so there
 * is nothing to patch into the tree first.
 *
 * The lesson underneath it survives one layer down, and it is why publish still
 * cannot be a single call. publishPageStatus promotes whatever draft is STORED.
 * The author's last few keystrokes may still be sitting in local state inside
 * the 5s autosave debounce — never sent. Publishing without flushing first
 * would promote a draft that was already stale, and the snapshot would record
 * that same stale content as what went public. The author would never see the
 * window where the wrong thing was live.
 *
 * So publish = flush every dirty half (awaited, token chained), THEN
 * publishPageStatus with the token those saves returned. Two-or-three writes,
 * in order, no deferred-render trick.
 *
 * The old code needed a `publishTicket` state counter to defer the save by one
 * commit, because `save()` read a ref that a dispatch had not yet updated. That
 * whole mechanism is gone with it: nothing dispatches before publishing any
 * more, so there is no stale ref to wait out.
 */
export function useEditorSave() {
  const {
    page, pageId, savedUpdatedAt, contentDirty, identityDirty, conflict, dispatch,
  } = useEditor();

  // Latest values for the async closures (state inside a promise is stale).
  const pageRef = useRef(page);
  const idRef = useRef(pageId);
  const tokenRef = useRef(savedUpdatedAt);
  const conflictRef = useRef(conflict);
  const contentDirtyRef = useRef(contentDirty);
  const identityDirtyRef = useRef(identityDirty);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { idRef.current = pageId; }, [pageId]);
  useEffect(() => { tokenRef.current = savedUpdatedAt; }, [savedUpdatedAt]);
  useEffect(() => { conflictRef.current = conflict; }, [conflict]);
  useEffect(() => { contentDirtyRef.current = contentDirty; }, [contentDirty]);
  useEffect(() => { identityDirtyRef.current = identityDirty; }, [identityDirty]);

  const inFlight = useRef(false);
  const queued = useRef(false);
  const timer = useRef(null);

  /**
   * Create the page for an unsaved editor and adopt its id in place.
   * Returns the fresh { id, updatedAt }, or null when the create failed (the
   * error is already dispatched — a create failure must NEVER drop the draft:
   * no navigation, state untouched, error surfaced for retry).
   */
  const createNow = useCallback(async (snapshot) => {
    const res = await createPageBuilderPage(snapshot);
    if (!res?.ok) {
      dispatch({ type: 'SAVE_ERROR', error: res?.error ?? 'บันทึกไม่สำเร็จ' });
      return null;
    }
    // Adopt the created page in place. See the note above.
    window.history.replaceState(null, '', `/admin/pages/builder/${res.id}/edit`);
    dispatch({
      type: 'SAVE_OK',
      domains: ['content', 'identity'], // a create persists both halves at once
      dirtyDuring: domainsChangedSince(snapshot, pageRef.current),
      pageId: res.id,
      updatedAt: res.updatedAt,
      at: Date.now(),
    });
    return { id: res.id, updatedAt: res.updatedAt };
  }, [dispatch]);

  const save = useCallback(async () => {
    if (conflictRef.current) return null;       // terminal — never retry into it
    if (inFlight.current) { queued.current = true; return null; }
    if (!contentDirtyRef.current && !identityDirtyRef.current) {
      return { id: idRef.current, updatedAt: tokenRef.current };  // nothing to flush
    }

    inFlight.current = true;
    // Identity snapshot: every edit produces a new page object (immutable
    // updates), so a per-key `!==` after the await says which HALF the user
    // edited mid-save.
    const snapshot = pageRef.current;
    dispatch({ type: 'SAVE_START' });

    try {
      const id = idRef.current;
      if (!id) {
        const created = await createNow(snapshot);
        return created ? { id: created.id, updatedAt: created.updatedAt } : null;
      }

      const outcome = await runSave({
        id,
        page: snapshot,
        token: tokenRef.current,
        contentDirty: contentDirtyRef.current,
        identityDirty: identityDirtyRef.current,
        actions: { saveDraftContent, updatePageIdentity },
        contentKeys: DRAFT_CONTENT_KEYS,
        identityKeys: IDENTITY_KEYS,
      });

      // A PARTIAL outcome is dispatched as both: the half that landed is
      // cleared, the half that did not stays dirty, and the conflict is
      // terminal for the document either way.
      if (outcome.saved.length) {
        dispatch({
          type: 'SAVE_OK',
          domains: outcome.saved,
          dirtyDuring: domainsChangedSince(snapshot, pageRef.current),
          updatedAt: outcome.updatedAt,
          at: Date.now(),
        });
      }
      if (outcome.conflict) {
        dispatch({ type: 'SAVE_CONFLICT', message: outcome.conflict });
        return null;
      }
      if (outcome.error) {
        dispatch({ type: 'SAVE_ERROR', error: outcome.error });
        return null;
      }
      return { id, updatedAt: outcome.updatedAt };
    } catch (err) {
      dispatch({ type: 'SAVE_ERROR', error: err?.message ?? 'บันทึกไม่สำเร็จ' });
      return null;
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        if (!conflictRef.current) save();       // single trailing save
      }
    }
  }, [dispatch, createNow]);

  // Manual save cancels any pending autosave — they must not race.
  const saveNow = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    return save();
  }, [save]);

  useEffect(() => {
    // No autosave for an unsaved page, once nothing is dirty, or after a conflict.
    if (!pageId || (!contentDirty && !identityDirty) || conflict) return undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; save(); }, AUTOSAVE_IDLE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [page, pageId, contentDirty, identityDirty, conflict, save]);

  /**
   * Publish. `statusPatch` is { status, publishStartDate, publishEndDate } —
   * exactly what PublishDialog already computes, unchanged.
   *
   * An UNSAVED page is two writes, in order: create (which stores the authored
   * content as a draft, always at status 'draft'), then publish that fresh id
   * with the token the create returned. That keeps "every page's content starts
   * in draft, and publish is always the one promotion action" true without
   * teaching createPageBuilderPage about status.
   */
  const publish = useCallback(async (statusPatch) => {
    if (conflictRef.current) return;

    dispatch({ type: 'SAVE_START' });
    try {
      // The order and the token chain live in savePlan.runPublish so they can
      // be asserted without mounting React. `flush` resolves with the id —
      // which for an unsaved page is the one the create just minted.
      const { aborted, result: res } = await runPublish({
        statusPatch,
        flush: saveNow,
        publish: publishPageStatus,
      });
      if (aborted) return;                 // the flush failed and already reported
      if (res?.conflict) { dispatch({ type: 'SAVE_CONFLICT', message: res.error }); return; }
      if (!res?.ok) { dispatch({ type: 'SAVE_ERROR', error: res?.error ?? 'อัปเดตสถานะไม่สำเร็จ' }); return; }

      // The server has applied the status and promoted the draft. Tell the
      // working view what it now is — a status-only patch, which the reducer
      // classifies as neither content nor identity, so it raises no dirty flag.
      dispatch({ type: 'PATCH_PAGE', patch: { ...statusPatch, status: res.status ?? statusPatch.status } });
      dispatch({
        type: 'SAVE_OK', domains: [], updatedAt: res.updatedAt, at: Date.now(),
      });
      // Publishing promoted and cleared the draft, so nothing is pending now.
      dispatch({ type: 'DRAFT_DISCARDED' });
    } catch (err) {
      dispatch({ type: 'SAVE_ERROR', error: err?.message ?? 'อัปเดตสถานะไม่สำเร็จ' });
    }
  }, [dispatch, saveNow]);

  /**
   * Throw away the pending draft. Built now; the button is round 5's.
   *
   * A RELOAD, not a client-side rebuild. discardDraftContent returns
   * { ok, updatedAt } and deliberately carries no content payload (round 2), so
   * the live fields the editor must fall back to are not in the response.
   * Reconstructing them here would mean keeping a second copy of the stored
   * document around all session just for this one rare, deliberate action — and
   * that copy would be the thing that goes stale. The route re-reads and
   * re-seeds correctly by construction; the reload flash is the same tradeoff
   * this file already accepts for create→edit.
   */
  const discard = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    try {
      const res = await discardDraftContent(id, tokenRef.current);
      if (res?.conflict) { dispatch({ type: 'SAVE_CONFLICT', message: res.error }); return; }
      if (!res?.ok) { dispatch({ type: 'SAVE_ERROR', error: res?.error ?? 'ยกเลิกฉบับร่างไม่สำเร็จ' }); return; }
      // Clear the guard BEFORE reloading, or the leave guard would prompt about
      // work that no longer exists on either side.
      dispatch({ type: 'DRAFT_DISCARDED' });
      window.location.reload();
    } catch (err) {
      dispatch({ type: 'SAVE_ERROR', error: err?.message ?? 'ยกเลิกฉบับร่างไม่สำเร็จ' });
    }
  }, [dispatch]);

  return { saveNow, publish, discard };
}

/** Which halves the author edited between two working trees. */
function domainsChangedSince(before, after) {
  const out = [];
  if (domainChanged(before, after, DRAFT_CONTENT_KEYS)) out.push('content');
  if (domainChanged(before, after, IDENTITY_KEYS)) out.push('identity');
  return out;
}
