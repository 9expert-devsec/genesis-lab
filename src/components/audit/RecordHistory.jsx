import { auth } from '@/lib/auth/options';
import { readRecordHistory, HISTORY_STATE, RECORD_HISTORY_PREVIEW } from '@/lib/audit/readAuditLog';
import { RecordHistoryPanel } from './RecordHistoryPanel';

/**
 * "Before I edit this, who touched it last and what did they change?"
 *
 * A SERVER component. It reads the session itself and hands the client half
 * nothing but already-authorised rows — the client never learns a menu it may
 * not see, and there is no server action for it to call with a menu of its own
 * choosing.
 *
 * ── MOUNTING ───────────────────────────────────────────────────────────────
 * `menu` and `entity` are props of the MOUNT POINT, written into the screen's
 * source. They are never derived from a URL, a form field or client state. Even
 * so, `buildRecordHistoryQuery` re-checks `canAccess` against the session — the
 * screen's own `requirePage` is not treated as sufficient, because this panel
 * returns other people's activity.
 *
 * Mount only on screens whose menu has been swept (see sweptMenus.js).
 * Elsewhere the panel would be permanently empty by construction — which is why
 * the third state exists, for the window where a round has landed but the
 * screens have not been wired yet.
 *
 * @param {string} props.menu     RBAC page key — from the mount point
 * @param {string} [props.entity] narrows when a menu holds several record kinds
 * @param {string|string[]} props.recordId  one id, or both key spaces for `courses`
 * @param {string} [props.title]
 * @param {boolean} [props.defaultOpen] for a mount that IS the history — a tab
 *        of its own, where an accordion asks a question the reader just answered
 */
export async function RecordHistory({ menu, entity, recordId, title, defaultOpen = false }) {
  const session = await auth();
  const user = session?.user ?? null;

  const { state, rows, total } = await readRecordHistory({
    user, menu, entity, recordId, limit: RECORD_HISTORY_PREVIEW,
  });

  // Denied renders NOTHING — not an error, not an empty panel. A panel saying
  // "you may not see this" confirms the record has history, which is the thing
  // being withheld.
  if (state === HISTORY_STATE.DENIED) return null;

  return (
    <RecordHistoryPanel
      state={state}
      rows={rows}
      total={total}
      previewCount={RECORD_HISTORY_PREVIEW}
      title={title ?? 'ประวัติการแก้ไข'}
      defaultOpen={defaultOpen}
    />
  );
}
