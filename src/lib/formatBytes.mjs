/**
 * A byte count, as a person reads it.
 *
 * ══ THIS IS AN EXTRACTION, NOT A NEW FUNCTION ═══════════════════════════════
 *
 * The exact body below already existed TWICE, byte-identical, as a module-private
 * `formatBytes` in two 'use client' components:
 *
 *   src/app/admin/media/_components/MediaClient.jsx:14
 *   src/app/admin/schedule-pdf/_components/SchedulePDFClient.jsx:24
 *
 * Being private to a client component, neither could be imported by a test —
 * importing either would drag React and next/navigation into a pure tier — so
 * the rule they encode had never been asserted anywhere, in either copy. And
 * being duplicated, a fix to one would silently not reach the other.
 *
 * A THIRD copy was the thing to avoid. The webroot history row was formatting
 * its own way, `(bytes / 1024 / 1024).toFixed(1)`, which reads every file under
 * ~51 KB as "0.0 MB" — a real recorded row of 5,812 bytes displayed as 0.0 MB,
 * i.e. as nothing at all. That row is now this function's caller too.
 *
 * ══ BEHAVIOUR IS PRESERVED EXACTLY ══════════════════════════════════════════
 *
 * Both existing call sites render unchanged. That is deliberate and is what
 * makes this safe to land in one commit: the thresholds, the decimal counts and
 * the empty-string case are copied, not re-designed.
 *
 *   not a number   ''        — including null and undefined. NOT '0 B': a
 *                              missing size and a zero-byte file are different
 *                              claims, and the callers render this inline where
 *                              an em-dash would read as a value.
 *   < 1 KiB        `N B`     exact integer, no decimals
 *   < 1 MiB        `N.N KB`  one decimal
 *   otherwise      `N.NN MB` two decimals
 *
 * ══ KiB, LABELLED KB ════════════════════════════════════════════════════════
 *
 * The divisor is 1024, so these are binary multiples displayed with decimal
 * labels — 44,647,587 B renders "42.58 MB" where SI would say 44.65 MB. That is
 * what both existing call sites already show and what the operators reading
 * this admin are used to; changing the divisor would silently restate every
 * file size in the product to buy a unit-label argument. Recorded rather than
 * corrected.
 *
 * Negative input falls through to the `B` branch (`-1 B`) — preserved from the
 * original, and reachable only from corrupt data.
 */

/**
 * @param {number|null|undefined} bytes
 * @returns {string} '' when there is no number to show
 */
export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
