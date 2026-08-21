/**
 * The editor's save sequencing, as a plain async function.
 *
 * Extracted from useEditorSave.js for the same reason leaveGuard.js was
 * extracted from useLeaveGuard.js: the DECISION is the part worth testing, and
 * a decision living inside a hook can only be tested by mounting React — which
 * this suite does not do (one leaked root under isolation:'none' breaks
 * unrelated tests). Everything here is dependency-injected, so a test calls it
 * with fake actions and asserts the exact arguments and order.
 *
 * ── WHY TWO CALLS AND NOT ONE ──────────────────────────────────────────────
 * The draft/published split gave each half of the editable surface its own
 * action: content goes to saveDraftContent (invisible until published),
 * identity to updatePageIdentity (live and immediate). One flush may therefore
 * need both, and they are two separate document writes.
 *
 * ── ORDER: CONTENT FIRST, THEN IDENTITY ────────────────────────────────────
 * Deliberate, and it is the failure mode that decides it. Both writes bump the
 * shared `updatedAt`, so the second carries the token the first returned and
 * either one can conflict.
 *
 *   - identity first, content second: a conflict on the content call leaves the
 *     slug ALREADY renamed. That is live and immediate — caches busted, the old
 *     URL retired into slugHistory — while the content the author is looking at
 *     never reached the server. The public page moves to a new URL carrying the
 *     old body, and the author's work is the half that was lost.
 *   - content first, identity second: a conflict on the identity call leaves
 *     the draft safely stored and only the rename lost. Nothing public moved.
 *
 * So the order puts the recoverable failure second. It also puts the
 * high-frequency path first: autosave fires on content constantly and identity
 * rarely, so the common case is also the simple case.
 *
 * ── THE TOKEN CHAIN ────────────────────────────────────────────────────────
 * `expectedUpdatedAt` is one value for the whole document, not one per action
 * (all four write the same doc, so any of them invalidates it for the others).
 * The first call's returned `updatedAt` is therefore the second call's
 * expected token. Passing the ORIGINAL token to both would make the second call
 * conflict with the first — the editor conflicting with itself, which is
 * exactly the bug the old publish path had.
 */

/**
 * Did any key in `keys` change between two working trees?
 *
 * Reference comparison per key, which is as reliable here as it looks: every
 * edit goes through the reducer and produces a NEW page object with a new value
 * for the key it touched (immutable updates throughout). This is the per-domain
 * form of the whole-object `!==` the single-save model used to decide
 * `dirtyDuringSave`.
 */
export function domainChanged(before, after, keys) {
  if (before === after) return false;
  return keys.some((k) => before?.[k] !== after?.[k]);
}

/**
 * Flush whatever is dirty, in order, chaining the token.
 *
 * @param {object}   o
 * @param {string}   o.id            page id (never null — the caller creates first)
 * @param {object}   o.page          the working tree to send
 * @param {string}   o.token         expectedUpdatedAt to start from
 * @param {boolean}  o.contentDirty
 * @param {boolean}  o.identityDirty
 * @param {object}   o.actions       { saveDraftContent, updatePageIdentity }
 * @param {string[]} o.contentKeys   DRAFT_CONTENT_KEYS
 * @param {string[]} o.identityKeys  IDENTITY_KEYS
 * @returns {Promise<{saved: string[], updatedAt: string|null, conflict: string|null, error: string|null, calls: Array}>}
 *   `saved` lists the domains that actually succeeded — a PARTIAL outcome is a
 *   real outcome here: content can be saved while identity conflicts, and the
 *   caller must be able to clear one flag and keep the other raised.
 */
export async function runSave({
  id, page, token, contentDirty, identityDirty, actions, contentKeys, identityKeys,
}) {
  const saved = [];
  const calls = [];
  let cursor = token;

  if (contentDirty) {
    const patch = pick(page, contentKeys);
    calls.push({ action: 'saveDraftContent', id, patch, token: cursor });
    const res = await actions.saveDraftContent(id, patch, cursor);
    if (res?.conflict) return { saved, updatedAt: cursor, conflict: res.error, error: null, calls };
    if (!res?.ok) return { saved, updatedAt: cursor, conflict: null, error: res?.error ?? 'บันทึกไม่สำเร็จ', calls };
    saved.push('content');
    cursor = res.updatedAt ?? cursor;
  }

  if (identityDirty) {
    const patch = pick(page, identityKeys);
    calls.push({ action: 'updatePageIdentity', id, patch, token: cursor });
    const res = await actions.updatePageIdentity(id, patch, cursor);
    // A conflict HERE keeps whatever `saved` already holds. That is the point of
    // returning a list rather than a boolean.
    if (res?.conflict) return { saved, updatedAt: cursor, conflict: res.error, error: null, calls };
    if (!res?.ok) return { saved, updatedAt: cursor, conflict: null, error: res?.error ?? 'บันทึกไม่สำเร็จ', calls };
    saved.push('identity');
    cursor = res.updatedAt ?? cursor;
  }

  return { saved, updatedAt: cursor, conflict: null, error: null, calls };
}

/** Own-property pick, so a key the tree lacks is omitted rather than sent as undefined. */
function pick(source, keys) {
  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(source ?? {}, k)) out[k] = source[k];
  }
  return out;
}

/**
 * Publish sequencing: FLUSH FIRST, then promote.
 *
 * Extracted for the same reason runSave is — the claim worth testing is the
 * ORDER and the TOKEN, and both are invisible from inside a hook. `flush` and
 * `publish` are injected so a test can record the call sequence and assert the
 * second call carries the token the first returned.
 *
 * `flush` resolves to { id, updatedAt } once everything dirty is stored — which
 * for an unsaved page means it CREATED the page and is handing back its new id.
 * A null resolution means the flush failed or conflicted and already reported
 * it; publishing anyway would promote a draft the server does not have.
 *
 * @returns {Promise<{ok: boolean, aborted?: boolean, result?: object}>}
 */
export async function runPublish({ statusPatch, flush, publish, onPhase }) {
  // The bracket exists because the INNER flush ends its own save: save()
  // dispatches SAVE_OK when it lands, clearing `saving` and both dirty flags
  // — and publish() is only called AFTER that. Without a bracket around the
  // whole sequence, the editor reports itself idle for the entire duration of
  // the promote-to-live write, which is the one call where leaving matters
  // most: nothing cancels a Server Action in flight, so an author who walks
  // away mid-publish gets no warning and the publish lands regardless.
  //
  // In a `finally` on purpose. Three of the paths out of here return early —
  // a failed flush, a rejected promote, a throw — and a bracket that only
  // closed on the happy path would strand the editor as permanently "saving",
  // which blocks every exit forever. A counter keyed off the existing
  // SAVE_START/SAVE_OK pairs cannot do this: save() returns early WITHOUT
  // dispatching when nothing is dirty, when one is already in flight, and
  // after a conflict, so its brackets do not balance.
  onPhase?.('start');
  try {
    const flushed = await flush();
    if (!flushed?.id) return { ok: false, aborted: true };
    const result = await publish(flushed.id, statusPatch, flushed.updatedAt);
    return { ok: Boolean(result?.ok), result };
  } finally {
    onPhase?.('end');
  }
}
