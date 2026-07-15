/**
 * Is a builder page public right now? ONE definition, shared by the public
 * catch-all route (which gates the render) and the editor's publish dialog
 * (which tells the author what will actually happen).
 *
 * It lives here rather than in the route because the editor needs the SAME
 * answer: status alone is not enough, and a second copy of these rules in the
 * publish UI would drift into telling authors a page is live when the route
 * 404s it — the badge saying "เผยแพร่แล้ว" over a dead URL is exactly the class
 * of silent disagreement this codebase keeps closing. Pure (no db, no models),
 * so the client may import it.
 *
 *   published + inside [start, end]        → visible
 *   scheduled + now >= start (+inside end) → visible; a scheduled page goes
 *                                            live on its own window, since
 *                                            nothing flips scheduled→published
 *   past publishEndDate                    → NOT visible (expired)
 *   draft / closed / archived              → never public → 404
 *
 * `closed` vs `archived` differ only in the ADMIN list, not publicly:
 *   closed   = intentionally ended, still listed;
 *   archived = hidden from the default admin list view.
 * Both 404 for the public.
 *
 * ISR NOTE: the public route is `revalidate = 3600`, so a scheduled page
 * becomes public within an hour of its start, not on the second. That is a
 * documented property, not a bug; second-accuracy would need on-demand
 * revalidation and is a later conversation. The publish dialog says so, because
 * an author who schedules for 09:00 and checks at 09:01 must not think it broke.
 */
export function isPubliclyVisible(page, now = Date.now()) {
  if (!page) return false;
  const start = page.publishStartDate ? new Date(page.publishStartDate).getTime() : null;
  const end   = page.publishEndDate   ? new Date(page.publishEndDate).getTime()   : null;
  if (end !== null && !Number.isNaN(end) && now > end) return false;
  if (page.status === 'published') return start === null || Number.isNaN(start) || now >= start;
  if (page.status === 'scheduled') return start !== null && !Number.isNaN(start) && now >= start;
  return false;
}

/**
 * WHY a page isn't public, for the publish dialog. Returns null when it is.
 *
 * Every branch here is a state where the status badge and the live URL
 * disagree: the admin list says published, the page 404s, and nothing errors.
 * `isPubliclyVisible` answers yes/no; this answers "and here's what to fix".
 */
export function invisibleReason(page, now = Date.now()) {
  if (isPubliclyVisible(page, now)) return null;
  if (!page) return 'no_page';

  const start = page.publishStartDate ? new Date(page.publishStartDate).getTime() : null;
  const end   = page.publishEndDate   ? new Date(page.publishEndDate).getTime()   : null;

  if (end !== null && !Number.isNaN(end) && now > end) return 'expired';
  if (page.status === 'scheduled' && (start === null || Number.isNaN(start))) return 'scheduled_no_start';
  if (page.status === 'scheduled') return 'scheduled_future';
  if (page.status === 'published' && start !== null && !Number.isNaN(start) && now < start) return 'published_future';
  return 'not_public_status'; // draft / closed / archived
}
