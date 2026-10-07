/**
 * /admin/consent-stats — the consent-specific half of its URL state: the page
 * URL and the daily-document bucketing. The generic range/grouping parser
 * lives in lib/admin/dateRange and is re-exported here under the names this
 * page (and its tests) have always used.
 *
 *   ?host=…   the counter host; www is the default and is never written
 */
import {
  DEFAULT_RANGE,
  addDays,
  parseDateRange,
  weekStart,
} from '@/lib/admin/dateRange';

export {
  DEFAULT_RANGE,
  GROUPS,
  MAX_RANGE_DAYS,
  RANGE_PRESETS,
  addDays,
  daySpan,
  parseIsoDate,
  rangeLabel,
  weekStart,
} from '@/lib/admin/dateRange';

/** The consent page's parser — the shared one, unchanged. */
export const parseConsentStatsRange = parseDateRange;

/**
 * The page URL for a state, with defaults omitted so the bare URL stays bare.
 * `host` is omitted when it is the default host.
 */
export function consentStatsHref({ host, defaultHost, range, from, to, group }) {
  const p = new URLSearchParams();
  if (host && host !== defaultHost) p.set('host', host);
  if (from && to) {
    p.set('from', from);
    p.set('to', to);
  } else if (range && Number(range) !== DEFAULT_RANGE) {
    p.set('range', String(range));
  }
  if (group === 'week') p.set('group', 'week');
  const qs = p.toString();
  return qs ? `/admin/consent-stats?${qs}` : '/admin/consent-stats';
}

/**
 * Daily documents → periods, OLDEST FIRST, covering the whole range.
 *
 * Every day (or Monday-start week, clipped to the range) gets a period, data
 * or not, so the chart can show a GAP where nothing was recorded. `hasData` is
 * whether any stored day fell in it; `docs` are those days' documents, for the
 * caller to sum with sumCounters.
 *
 * @returns {Array<{ key: string, from: string, to: string, label: string,
 *                   hasData: boolean, docs: object[] }>}
 */
export function bucketConsentDays(docs, { from, to, group }) {
  const byDate = new Map();
  for (const d of docs ?? []) {
    if (d?.date >= from && d?.date <= to) byDate.set(d.date, d);
  }

  const periods = [];
  let cursor = from;
  while (cursor <= to) {
    const start = cursor;
    const end =
      group === 'week'
        ? (() => {
            const sunday = addDays(weekStart(cursor), 6);
            return sunday < to ? sunday : to;
          })()
        : cursor;
    const inPeriod = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (byDate.has(d)) inPeriod.push(byDate.get(d));
    }
    periods.push({
      key: start,
      from: start,
      to: end,
      label: start === end ? start : `${start} – ${end}`,
      hasData: inPeriod.length > 0,
      docs: inPeriod,
    });
    cursor = addDays(end, 1);
  }
  return periods;
}
