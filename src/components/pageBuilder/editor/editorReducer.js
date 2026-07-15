import {
  setAt, updateAt, removeAt, insertAt, moveWithin, getAt, reidSubtree,
} from './pagePath';

/**
 * The editor's single state tree and its closed transition set.
 *
 * useReducer (not a store library): none is installed, and adding one for one
 * screen would be a new dependency for a closed set of transitions (§4.4). The
 * surface is exactly one page tree, so an explicit reducer keeps every
 * mutation named and makes `dirty` a single derived flag.
 *
 * The editor NEVER calls the granular section actions — they address top-level
 * sections only and cannot see nesting (see lib/actions/pageBuilder.js). Every
 * structural change happens here, in client state, and is persisted by a
 * full-document updatePageBuilderPage save.
 */

export const initialEditorState = ({ page, pageId = null, updatedAt = null }) => ({
  page,                  // the working tree (full page doc shape)
  pageId,                // null for an unsaved /builder/new page
  savedUpdatedAt: updatedAt, // optimistic-concurrency token (ISO) for the next save
  selection: null,       // path into `page`, e.g. ['sections', 0, 'content', 'children', 1]
  dirty: false,
  saving: false,
  lastSavedAt: null,
  conflict: null,        // { message } — terminal: autosave stops, banner shows
  error: null,
});

// Any structural/content edit marks the tree dirty; save transitions don't.
function edited(state, page) {
  return { ...state, page, dirty: true, error: null };
}

export function editorReducer(state, action) {
  switch (action.type) {
    case 'SELECT':
      return { ...state, selection: action.path ?? null };

    case 'PATCH_PAGE':
      return edited(state, { ...state.page, ...action.patch });

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

    case 'SAVE_START':
      return { ...state, saving: true, error: null };

    case 'SAVE_OK':
      return {
        ...state,
        saving: false,
        // Only clear `dirty` if nothing changed while the save was in flight.
        dirty: action.dirtyDuringSave ? true : false,
        savedUpdatedAt: action.updatedAt ?? state.savedUpdatedAt,
        pageId: action.pageId ?? state.pageId,
        lastSavedAt: action.at ?? Date.now(),
        error: null,
      };

    case 'SAVE_ERROR':
      return { ...state, saving: false, error: action.error };

    // Terminal: the stored doc moved under us. Autosave must stop and never
    // retry into the conflict; the banner owns the recovery path.
    case 'SAVE_CONFLICT':
      return { ...state, saving: false, conflict: { message: action.message } };

    case 'RESET':
      return initialEditorState({ page: action.page, pageId: action.pageId, updatedAt: action.updatedAt });

    default:
      return state;
  }
}
