'use client';

import { EditorProvider } from './EditorProvider';
import { EditorShell } from './EditorShell';

/**
 * Client entry point for the editor. The route (a server component) loads the
 * doc, resolves the tier flags from the session, and hands both down — data
 * loading and guards stay server-side (§4.5); only the editing is client.
 *
 * `page` seeds the reducer ONCE (useReducer's initializer ignores later prop
 * changes). That is deliberate: it is what lets the working tree survive the
 * create→edit transition, which rewrites the URL without a navigation. See
 * useEditorSave.js.
 */
export function PageBuilderEditor({ page, pageId = null, updatedAt = null, tier }) {
  return (
    <EditorProvider page={page} pageId={pageId} updatedAt={updatedAt} tier={tier}>
      <EditorShell />
    </EditorProvider>
  );
}
