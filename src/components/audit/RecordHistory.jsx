import { auth } from '@/lib/auth/options';
import { readRecordHistory, HISTORY_STATE, RECORD_HISTORY_PREVIEW } from '@/lib/audit/readAuditLog';
import { RecordHistoryPanel } from './RecordHistoryPanel';
import { actionTitlesFor } from '@/lib/audit/registrationHistory';

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
 * @param {'accordion'|'feed'} [props.variant] the CONTAINER. `'feed'` is the
 *        82px-entry card the registration detail tabs use; every other mount
 *        takes the default and is unchanged.
 * @param {string} [props.description] the feed card's second header line
 * @param {{createdAt: string, source: string, label: string}} [props.origin]
 *        the DOCUMENT's own creation facts, for the synthesised oldest entry.
 *        Written at the mount point, like `menu` and `entity`, because it comes
 *        off the document the screen already loaded and nothing here can read it.
 */
export async function RecordHistory({
  menu, entity, recordId, title, defaultOpen = false,
  variant = 'accordion', description, origin,
}) {
  const session = await auth();
  const user = session?.user ?? null;

  const { state, rows, total } = await readRecordHistory({
    user, menu, entity, recordId, limit: RECORD_HISTORY_PREVIEW,
  });

  // Denied renders NOTHING — not an error, not an empty panel. A panel saying
  // "you may not see this" confirms the record has history, which is the thing
  // being withheld.
  if (state === HISTORY_STATE.DENIED) return null;

  /**
   * THE ACTION VOCABULARY IS CHOSEN HERE, ON THE SERVER, AND CROSSES AS DATA.
   *
   * `actionTitlesFor` is a function and a function cannot cross the
   * server/client boundary; the plain object it returns can. Choosing it here
   * also keeps the client from having to know that `registrations` holds two
   * collections with different action sets — it receives the one map that
   * applies to the record it is showing.
   *
   * An entity this module has not been taught returns an EMPTY map, and the feed
   * then renders raw action names. That is the honest degradation: the row shows
   * what it actually holds rather than borrowing another menu's wording.
   */
  return (
    <RecordHistoryPanel
      state={state}
      rows={rows}
      total={total}
      previewCount={RECORD_HISTORY_PREVIEW}
      title={title ?? 'ประวัติการแก้ไข'}
      defaultOpen={defaultOpen}
      variant={variant}
      description={description}
      origin={origin}
      titles={actionTitlesFor(entity)}
    />
  );
}
