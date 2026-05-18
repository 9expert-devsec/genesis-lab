/**
 * TopNotificationBar — server entry point.
 *
 * Wraps `TopNotificationBarClient` so the bar is rendered as part of
 * the SSR HTML (no flash on first paint). The client wrapper handles
 * dismissal + per-page scope checks.
 *
 * Picks the lowest-weight active bar; everything else is ignored.
 */

import { TopNotificationBarClient } from './TopNotificationBarClient';

export function TopNotificationBar({ bars }) {
  const list = Array.isArray(bars) ? bars : [];
  if (list.length === 0) return null;
  const bar = list[0];
  if (!bar) return null;
  return <TopNotificationBarClient bar={bar} />;
}