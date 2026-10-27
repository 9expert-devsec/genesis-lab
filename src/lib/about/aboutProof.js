/**
 * /about-us Proof section copy that is derived from the stats. Pure.
 *
 * The client-logo heading's "5,000" is the SAME `organizations` value the stats
 * card shows as "5K+", floored to thousands, so the two can never disagree.
 */

/** 5,999 → "5,000" · 12,400 → "12,000" · below 1,000 → the exact number. */
export function organizationsCount(organizations) {
  const n = Number(organizations);
  if (!Number.isFinite(n) || n <= 0) return null;
  const floored = n >= 1000 ? Math.floor(n / 1000) * 1000 : Math.floor(n);
  return floored.toLocaleString('th-TH');
}

export function trustedOrganizationsHeading(organizations) {
  const count = organizationsCount(organizations);
  return count
    ? `องค์กรชั้นนำกว่า ${count} แห่งไว้วางใจ 9Expert`
    : 'องค์กรชั้นนำไว้วางใจ 9Expert';
}
