import {
  setAt, updateAt, removeAt, insertAt, moveWithin, getAt, reidSubtree,
} from './pagePath';
import { DRAFT_CONTENT_KEYS, IDENTITY_KEYS } from '@/lib/schemas/pageBuilder';
import { hasUnpublishedDraft, composeWorkingView } from '@/lib/pageBuilder/draftState';

/**
 * The editor's single state tree and its closed transition set.
 *
 * useReducer (not a store library): none is installed, and adding one for one
 * screen would be a new dependency for a closed set of transitions (§4.4). The
 * surface is exactly one page tree, so an explicit reducer keeps every
 * mutation named.
 *
 * The editor NEVER calls the granular section actions — they address top-level
 * sections only and cannot see nesting (see lib/actions/pageBuilder.js). Every
 * structural change happens here, in client state.
 *
 * ── `page` IS A COMPOSED WORKING VIEW, NOT THE STORED DOCUMENT ─────────────
 * The draft/published split means the document has two content halves: the LIVE
 * fields (what the public sees) and `.draft` (what the author has typed but not
 * published). The editor must show and edit exactly one thing, so
 * initialEditorState composes:
 *
 *     effectiveContent(raw)   the draft's content when there is one, else live
 *   + the raw doc's live-only fields (slug, status, the publish window, …)
 *
 * into one tree. The canvas renders it, the settings dialog patches it, and the
 * save layer routes each half to its own action. `.draft` itself is NOT in the
 * working view: it has been unwrapped into it, and keeping both would give the
 * editor two answers to "what is the title".
 *
 * ── TWO DIRTY FLAGS, CLASSIFIED BY KEY ────────────────────────────────────
 * `contentDirty` and `identityDirty` are separate because separate actions
 * flush them (saveDraftContent / updatePageIdentity) and either can fail on its
 * own. A page can legitimately end up with its content saved and its rename
 * conflicted, and that state has to be representable.
 *
 * PATCH_PAGE decides WHICH flag to raise by looking at the patch's keys against
 * the round-1 key sets, rather than by trusting the caller to dispatch a typed
 * action. That is deliberate: PageSettingsDialog patches through ONE shared
 * helper that serves three content fields and four identity fields, so there is
 * no call site at which the domain is known. Classifying here keeps the
 * partition in the one place that already defines it — and a patch that spans
 * both halves raises both flags instead of silently picking one.
 *
 * A patch of STATUS keys alone raises NEITHER flag, which is correct rather
 * than an oversight: status and the publish window are applied by
 * publishPageStatus at the moment the dialog is confirmed, so a status patch is
 * the working view being told what the server has already done.
 */

const CONTENT_SET = new Set(DRAFT_CONTENT_KEYS);
const IDENTITY_SET = new Set(IDENTITY_KEYS);

// composeWorkingView lives in lib/pageBuilder/draftState.js: /preview/[slug]
// needs the identical composition, and a second copy here would be the thing
// that drifts. Re-exported so existing importers of this module still resolve.
export { composeWorkingView };
export const initialEditorState = ({
  page, pageId = null, updatedAt = null, currentUserName = '',
}) => ({
  page: composeWorkingView(page),
  pageId,                    // null for an unsaved /builder/new page
  savedUpdatedAt: updatedAt, // ONE optimistic-concurrency token for the whole
                             // document: every action writes the same doc, so a
                             // save through any of them invalidates it for all.
  // Whether the STORED doc already carried an unpublished draft when the editor
  // opened. Retained rather than re-derived because the working view no longer
  // holds `.draft` to look at, and round 5's indicator needs it without a
  // second read.
  hadDraft: hasUnpublishedDraft(page),
  /**
   * WHO last saved the stored draft — round 34 commit 3.
   *
   * Read from `page.draft.savedBy`, which round 2 stamps on every draft write,
   * and captured HERE for the same reason `hadDraft` is: composeWorkingView
   * drops `.draft`, so this is the last moment the stamp is in reach.
   *
   * It is NOT `page.updatedBy`. Round 33 measured that field frozen at
   * creation — publishPageStatus never writes it, updatePageBuilderPage has had
   * no live caller since round 3, and there are no schema hooks — so it names
   * whoever CREATED the page, confidently and wrongly. That measurement has its
   * own tripwire in test/fs/pageBuilderDraftActions, and this round does not
   * fix the freeze; it just refuses to read the frozen field.
   *
   * `currentUserName` is kept beside it because a content save makes THIS
   * session the draft's saver, and a value that were only ever seeded on load
   * would keep naming the previous author for the rest of the session — the
   * same class of quietly-stale display this field exists to avoid.
   */
  currentUserName: String(currentUserName ?? ''),
  draftSavedBy: hasUnpublishedDraft(page) ? String(page?.draft?.savedBy?.name ?? '') : '',
  /**
   * Two facts about the STORED document that the working view cannot carry,
   * captured here for the same reason hadDraft is: composeWorkingView keeps
   * only LIVE_ONLY_KEYS, which derive from the zod schema, and NEITHER field is
   * in it — publishedVersion deliberately (round 35: absent from the schema is
   * what makes it unwritable by a client) and `preview` deliberately (round 2).
   *
   * Both exist to decide whether the editor may OFFER the published view. See
   * canOfferPublishedView: a link that leads to a dead end is worse than none.
   */
  publishedVersion: Number.isInteger(page?.publishedVersion) ? page.publishedVersion : null,
  previewEnabled: Boolean(page?.preview?.enabled && page?.preview?.passwordHash),
  selection: null,       // path into `page`, e.g. ['sections', 0, 'content', 'children', 1]
  contentDirty: false,
  identityDirty: false,
  saving: false,
  // True for the WHOLE publish sequence — flush AND promote — where `saving`
  // alone goes false in between (the flush ends its own save). Read together
  // with `saving` by editorStatus.isSaving; see runPublish in savePlan.js.
  publishing: false,
  lastSavedAt: null,
  lastSavedDomains: [],
  conflict: null,        // { message } — terminal, WHOLE-DOCUMENT: autosave stops
  error: null,
});

/**
 * Any structural/content edit marks the tree dirty; save transitions don't.
 * Section edits are content by definition — they all move `sections`.
 */
function edited(state, page, { content = true, identity = false } = {}) {
  return {
    ...state,
    page,
    contentDirty: state.contentDirty || content,
    identityDirty: state.identityDirty || identity,
    error: null,
  };
}

export function editorReducer(state, action) {
  switch (action.type) {
    case 'SELECT':
      return { ...state, selection: action.path ?? null };

    case 'PATCH_PAGE': {
      const keys = Object.keys(action.patch ?? {});
      return edited(state, { ...state.page, ...action.patch }, {
        content: keys.some((k) => CONTENT_SET.has(k)),
        identity: keys.some((k) => IDENTITY_SET.has(k)),
      });
    }

    case 'PATCH_SECTION':
      return edited(state, updateAt(state.page, action.path, (s) => ({ ...s, ...action.patch })));

    case 'PATCH_SECTION_KEY': // merge into one sub-object (content/settings/style/layout/advanced)
      return edited(state, updateAt(state.page, [...action.path, action.key], (v) => ({ ...(v ?? {}), ...action.patch })));

    case 'TOGGLE_SECTION':
      return edited(state, updateAt(state.page, action.path, (s) => ({ ...s, enabled: s?.enabled === false })));

    case 'ADD_SECTION': {
      const page = insertAt(state.page, action.parentPath, action.index, action.section);
      const at = Math.max(0, Math.min(action.index ?? Infinity, (getAt(page, action.parentPath) ?? []).length - 1));
      return { ...edited(state, page), selection: [...action.parentPath, at] };
    }

    case 'REMOVE_SECTION': {
      const page = removeAt(state.page, action.path);
      // Drop a selection that pointed at (or into) the removed node.
      const sel = state.selection;
      const stale = sel && action.path.every((k, i) => sel[i] === k);
      return { ...edited(state, page), selection: stale ? null : sel };
    }

    case 'DUPLICATE_SECTION': {
      const src = getAt(state.page, action.path);
      if (!src) return state;
      const parentPath = action.path.slice(0, -1);
      const index = action.path[action.path.length - 1];
      // Deep re-id: a shallow copy would leave a duplicated container's
      // children sharing ids with the original.
      const page = insertAt(state.page, parentPath, index + 1, reidSubtree(src));
      return { ...edited(state, page), selection: [...parentPath, index + 1] };
    }

    case 'MOVE_SECTION': { // sibling-scoped reorder
      const parentPath = action.path.slice(0, -1);
      const from = action.path[action.path.length - 1];
      const page = moveWithin(state.page, parentPath, from, action.to);
      return { ...edited(state, page), selection: [...parentPath, action.to] };
    }

    // The publish bracket. Deliberately NOT folded into SAVE_START/SAVE_OK:
    // those pair per CALL, and this one spans two of them.
    case 'PUBLISH_START':
      return { ...state, publishing: true, error: null };

    case 'PUBLISH_END':
      return { ...state, publishing: false };

    case 'SAVE_START':
      return { ...state, saving: true, error: null };

    /**
     * `domains` names which halves this success clears — ['content'],
     * ['identity'], or both. A flush that saved content and then conflicted on
     * identity dispatches SAVE_OK with ['content'] AND a SAVE_CONFLICT, and the
     * two must not fight: this only ever clears what it is told about.
     *
     * `dirtyDuring` names the domains the author edited WHILE the save was in
     * flight, which must stay dirty even though the write succeeded.
     */
    case 'SAVE_OK': {
      const domains = action.domains ?? [];
      const during = action.dirtyDuring ?? [];
      const clears = (d) => domains.includes(d) && !during.includes(d);
      return {
        ...state,
        saving: false,
        contentDirty: clears('content') ? false : state.contentDirty,
        identityDirty: clears('identity') ? false : state.identityDirty,
        savedUpdatedAt: action.updatedAt ?? state.savedUpdatedAt,
        pageId: action.pageId ?? state.pageId,
        // A page that has just had its content saved has a pending draft by
        // definition — round 5's indicator reads this.
        hadDraft: domains.includes('content') ? true : state.hadDraft,
        // …and THIS session is now the one that saved it. Same condition as
        // hadDraft, because it is the same event: a content write is exactly
        // what stamps draft.savedBy on the server. An identity save or a
        // publish must not move it — the first writes no draft, and the second
        // clears one (see DRAFT_DISCARDED, which publish also dispatches).
        draftSavedBy: domains.includes('content') ? state.currentUserName : state.draftSavedBy,
        lastSavedAt: action.at ?? Date.now(),
        // RETAINED, not invented: SAVE_OK already had to name its domains
        // (round 4) so it could clear the right flags. The top bar needs the
        // same fact one step later — whether the last write was one the
        // public sees at once — so the payload is kept instead of a second
        // source being added beside it.
        lastSavedDomains: domains,
        error: null,
      };
    }

    case 'SAVE_ERROR':
      return { ...state, saving: false, error: action.error };

    // Terminal: the stored doc moved under us. Autosave must stop and never
    // retry into the conflict; the banner owns the recovery path. Deliberately
    // WHOLE-DOCUMENT and not per-domain — the document is what moved, and a
    // per-domain conflict would invite a retry of the other half against a
    // token that is already stale.
    case 'SAVE_CONFLICT':
      return { ...state, saving: false, conflict: { message: action.message } };

    // The draft was thrown away server-side; the working view still shows it.
    // Nothing reconstructs it here — discard() reloads the route (see
    // useEditorSave.js), and this only stops the guard nagging on the way out.
    case 'DRAFT_DISCARDED':
      // draftSavedBy goes with hadDraft, because there is no longer a draft for
      // anyone to have saved. Leaving it would keep naming a saver for content
      // that no longer exists — and publish dispatches this too, so it is also
      // what stops the line surviving a promotion.
      return {
        ...state, contentDirty: false, hadDraft: false, draftSavedBy: '',
        saving: false, error: null,
      };

    case 'RESET':
      // currentUserName is carried across rather than re-supplied: it describes
      // the SESSION, which a reset of the document does not change.
      return initialEditorState({
        page: action.page, pageId: action.pageId, updatedAt: action.updatedAt,
        currentUserName: state.currentUserName,
      });

    default:
      return state;
  }
}
