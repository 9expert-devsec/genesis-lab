'use client';

import { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { editorReducer, initialEditorState } from './editorReducer';
import { getAt } from './pagePath';
import { dataRefSignature } from '@/lib/pageBuilder/dataRefs';
import { resolveBuilderSectionData } from '@/lib/actions/pageBuilder';

/**
 * Editor context — one state tree shared by the three panels (Structure,
 * Canvas, Settings) without prop-drilling. State lives in a reducer; see
 * editorReducer.js for the transition set and why useReducer over a store.
 *
 * Tier flags are resolved on the SERVER (the route computes them from the
 * session) and passed in read-only. They shape the UI, but the UI is never
 * the only guard: every action re-checks tier server-side.
 *
 * ── resolvedData: the canvas half of the 2C.2a fetch-hoist ────────────────
 * Data-backed sections (course_card, …) render from data, not a fetch of their
 * own. The public page resolves that data server-side; the canvas can't (MSDB
 * is server-only, no public endpoint), so it calls the admin-gated
 * resolveBuilderSectionData action and hands the id-keyed map to the SAME
 * SectionRenderer, and to the settings panel for its fail-closed warnings.
 *
 * Refetch is gated on the data-REFERENCE signature (dataRefSignature), so an
 * author editing a heading does not trigger a course fetch, and debounced so a
 * course_id typed key-by-key resolves once. A missing key (undefined) means "not
 * resolved yet"; an explicit null / [] means "resolved, found nothing" — the
 * distinction the warnings need to avoid flashing "not found" while loading.
 */
const EditorContext = createContext(null);

export function EditorProvider({ children, page, pageId = null, updatedAt = null, tier }) {
  const [state, dispatch] = useReducer(
    editorReducer,
    { page, pageId, updatedAt },
    initialEditorState
  );

  const [resolvedData, setResolvedData] = useState({});

  // Ephemeral CANVAS view state (like a selection or hover) — the device-preview
  // width. It shapes only how the canvas is VIEWED, never what renders or what is
  // saved: it is not in `state` (the page tree), never enters the autosave
  // payload, and never touches the page doc. Cross-panel (the toolbar sets it, the
  // canvas reads it), so it lives here rather than as a lifted prop.
  const [previewViewport, setPreviewViewport] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'

  const sig = dataRefSignature(state.page?.sections);

  useEffect(() => {
    if (!sig) { setResolvedData({}); return undefined; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const map = await resolveBuilderSectionData(state.page?.sections ?? []);
        if (!cancelled) setResolvedData(map ?? {});
      } catch {
        if (!cancelled) setResolvedData({});
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
    // Keyed on the ref signature, not `state`: only a change to the data refs
    // themselves should refetch. state.page is read fresh inside the timeout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const value = useMemo(
    () => ({
      ...state,
      dispatch,
      tier, // { canUseAdvanced, canPublish, canManagePreview } — server-resolved
      resolvedData, // id-keyed data map for data-backed sections (2C.2a)
      previewViewport, setPreviewViewport, // ephemeral canvas device-preview width
      // The currently selected section (or null). Paths, not ids — ids are not
      // unique across the tree (see pagePath.js).
      selected: state.selection ? getAt(state.page, state.selection) : null,
    }),
    [state, tier, resolvedData, previewViewport]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used inside <EditorProvider>');
  return ctx;
}
