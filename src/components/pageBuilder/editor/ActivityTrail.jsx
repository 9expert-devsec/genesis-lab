'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ScrollText } from 'lucide-react';
import { getPageAuditLog } from '@/lib/actions/pageBuilder';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this directory.
import {
  auditRowLine, AUDIT_TRAIL_NOTE, AUDIT_TRAIL_EMPTY,
} from '@/lib/pageBuilder/auditTrail';

/**
 * Activity trail — every recorded action on one page, newest first.
 *
 * Requirement §14. `PageAuditLog` has been written since round 2 and read by
 * nothing until commit 1; this is the surface over that read.
 *
 * ── IT SAYS THREE THINGS AND DECLINES THREE MORE ──────────────────────────
 * Each row is WHAT KIND OF THING was done, BY WHOM, and WHEN. That is the whole
 * of what a stored row can support, measured — see lib/pageBuilder/auditTrail.js
 * for the census. The three declined surfaces, each with the measurement that
 * declined it:
 *
 *   · WHAT CHANGED. `before`/`after` are presence flags: 18 of 20 stored
 *     `draft.save` rows are `true -> true`, and 23 of 25 `update` rows have the
 *     two halves identical. The read does not even ship them, so this component
 *     could not render a diff if it wanted to. AUDIT_TRAIL_NOTE says so under
 *     the list, because an author reading a run of บันทึกฉบับร่าง rows would
 *     otherwise conclude the trail is a change log that lost their changes.
 *   · WHICH VERSION A PUBLISH PRODUCED. No audit row carries a version number
 *     or a version id — 1 stored `publish` row against 3 stored versions, the
 *     other two filed under `update` and `status`. `PageVersion` is the
 *     authority for "who published version N" and round 36 already surfaces it;
 *     printing a number here would be a second answer that can disagree with
 *     the first.
 *   · ผู้แก้ไขล่าสุด. `draft.savedBy` answers it on the live document and round
 *     34 shipped that sentence through editorStatus.draftSaverLine. It is STATE
 *     — stamped by every draft write, cleared by publish and by discard —
 *     rather than an inference over the newest row of a class. One fact, one
 *     source; two is the shape rounds 21-25 spent four rounds removing.
 *
 * ── WHY IT IS ITS OWN SECTION AND NOT PART OF ประวัติการเผยแพร่ ───────────
 * That one lists VERSIONS: things that were published, that can be restored.
 * This lists ACTIONS, most of which produced no version and none of which can
 * be acted on. Folding them together would put a group under a title that is
 * wrong for half its contents, and would invite exactly the join between a
 * publish row and a version row that the stored shape cannot support.
 *
 * It adds NO save or status vocabulary — round 27's rule, respected by rounds
 * 34 and 36. Nothing here is a control; the section is a list and a note.
 *
 * ── PAGINATED, AND THE BUTTON IS THE ONLY WAY DEEPER ──────────────────────
 * Nothing prunes `page_audit_logs` and one autosave tick writes one row, so a
 * busy page's trail is unbounded. The read returns a page and a cursor; this
 * appends. There is no "load everything" — the reason getPageVersions caps its
 * list applies here with a collection that grows far faster.
 */

/**
 * Absolute date and time, in the dialog's idiom.
 *
 * DELIBERATELY NOT statusLine's relative minutes. That vocabulary is about what
 * THIS TAB just did and is scoped to the session; these are server facts about
 * other people's actions, and reusing the relative phrasing for them is the
 * second-vocabulary drift round 27 refused. Same formatter VersionHistory uses
 * one file over, for the same reason: the two lists sit in the same dialog.
 */
function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * `initialRows` / `initialCursor` are TEST SEEDS and production passes neither.
 *
 * Same shape, and the same reason, as VersionHistory's: a Radix Dialog.Portal
 * renders zero bytes under renderToStaticMarkup and the runner never mounts a
 * React root, so the effect below never runs in a test. Seeding the state is
 * the only way the list markup is reachable at all. A pinned test asserts the
 * section hands neither prop.
 */
export function ActivityTrail({ pageId, open, initialRows = null, initialCursor = null }) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!open || !pageId) return undefined;
    let alive = true;
    setRows(null); setCursor(null); setError('');
    getPageAuditLog(pageId)
      .then((res) => {
        if (!alive) return;
        setRows(Array.isArray(res?.rows) ? res.rows : []);
        setCursor(res?.nextCursor ?? null);
      })
      .catch((e) => { if (alive) setError(e?.message ?? 'โหลดประวัติการดำเนินการไม่สำเร็จ'); });
    // Ignore a late response after the dialog closes or the page changes.
    return () => { alive = false; };
  }, [pageId, open]);

  /**
   * APPEND, never replace. The cursor is a position in a list the server sorts;
   * re-sorting or de-duplicating here would be a second opinion about an order
   * the query already decided, and the compound cursor is what guarantees no
   * row is repeated to be de-duplicated in the first place.
   */
  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getPageAuditLog(pageId, { cursor });
      setRows((prev) => [...(prev ?? []), ...(Array.isArray(res?.rows) ? res.rows : [])]);
      setCursor(res?.nextCursor ?? null);
    } catch (e) {
      setError(e?.message ?? 'โหลดประวัติการดำเนินการไม่สำเร็จ');
    } finally {
      setLoadingMore(false);
    }
  }, [pageId, cursor, loadingMore]);

  // An unsaved page has no id, so nothing has ever been recorded against it.
  if (!pageId) {
    return <p className="text-[11px] text-9e-slate-dp-50">ยังไม่ได้บันทึกหน้านี้ — ยังไม่มีการดำเนินการที่บันทึกไว้</p>;
  }
  if (error) return <p className="text-[11px] text-red-600" role="alert">{error}</p>;
  if (rows === null) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-9e-slate-dp-50">
        <Loader2 className="h-3 w-3 animate-spin" /> กำลังโหลด…
      </p>
    );
  }
  if (!rows.length) {
    return <p className="text-[11px] text-9e-slate-dp-50">{AUDIT_TRAIL_EMPTY}</p>;
  }

  return (
    <>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r._id} className="flex items-start gap-1.5 text-[11px] text-9e-slate-dp-50">
            <ScrollText className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span data-testid="activity-row" className="min-w-0 flex-1">
              {auditRowLine(r, when(r.createdAt))}
            </span>
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          type="button"
          data-testid="activity-more"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-2 text-[11px] font-bold text-9e-action disabled:opacity-50"
        >
          {loadingMore ? 'กำลังโหลด…' : 'ดูรายการก่อนหน้า'}
        </button>
      )}
      <p className="mt-2 text-[11px] text-9e-slate-dp-50">{AUDIT_TRAIL_NOTE}</p>
    </>
  );
}
