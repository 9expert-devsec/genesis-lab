/**
 * Public registrations for one training round, tallied by status.
 *
 * Written for /admin/schedules' round details view: a finished round has no
 * แก้ไข and no ลบ, and what replaces them is a read-only answer to "who signed
 * up for this, and where did they get to". That answer is a total and a
 * breakdown, and this is where the arithmetic lives so the panel can be a
 * renderer with nothing to get wrong.
 *
 * ── THE VOCABULARY IS NOT REDECLARED HERE ───────────────────────────────────
 * `PUBLIC_STATUSES` is imported, never copied. That module's own header records
 * what happens otherwise: the status→label map had FOUR hand-written copies
 * across the two list clients and the two detail clients, and a value added to
 * one of them rendered an unstyled chip on whichever screen was missed. This is
 * a fifth screen asking for a fifth copy, and the answer is the same as it was
 * for the fourth.
 *
 * It also settles a question that looked open. The four values `register_public`
 * actually holds — audited 2026-09-02 across all 41 documents: pending 29,
 * paid 9, confirmed 2, cancelled 1 — are EXACTLY `PUBLIC_STATUS_VALUES`, in the
 * same spelling, with nothing stored outside them. One caveat travels with that
 * and is the reason this note exists rather than a bare "they match": `confirmed`
 * does NOT mean "ยืนยันแล้ว". It was relabelled to 'ส่งใบเสนอราคาแล้ว' because
 * what the admin does at that step is send the quotation, and the old wording
 * read as though money had changed hands. Anyone re-deriving these labels from
 * the value names will get that one wrong, which is the other reason not to.
 *
 * ── ZEROS ARE KEPT, AN UNKNOWN VALUE IS KEPT LOUDER ─────────────────────────
 * Every status in the vocabulary comes back whether or not anyone is in it: a
 * round with nobody cancelled should SAY nobody cancelled rather than leave the
 * reader to notice an absence. A stored value the vocabulary does not know is
 * reported separately instead of being dropped into a bucket or silently
 * ignored — the same ruling `resolveScheduleBadge` makes for an unrecognised
 * schedule status, for the same reason: a count that quietly excludes rows is a
 * count that disagrees with the total and cannot be debugged from a screenshot.
 *
 * `total` therefore counts EVERY row handed in, recognised or not, and a test
 * pins `total === known + unrecognised` so the two can never drift.
 *
 * Dependency-free apart from the vocabulary (no next/*, no db, no React), so
 * the `pure` tier exercises it with nothing stubbed.
 */

import { PUBLIC_STATUSES, NEUTRAL_STATUS_BADGE } from './statuses';

/**
 * The bucket for a row whose status is missing or blank.
 *
 * Distinct from an unrecognised VALUE — "the document says `archived` and we do
 * not know that word" and "the document says nothing at all" are different
 * faults with different fixes, and collapsing them into one grey row would hide
 * which one happened. Both are still counted, and both still reach `total`.
 */
export const UNSET_STATUS_LABEL = 'ไม่ระบุสถานะ';

/**
 * @param {Array<{status?: string}>} rows registration documents — only `status`
 *   is read, so a lean projection of that one field is enough.
 * @param {Array<{value: string, label: string, badge: string}>} [vocabulary]
 *   defaults to the public statuses; passed explicitly only by tests.
 * @returns {{
 *   total: number,
 *   known: Array<{value: string, label: string, badge: string, count: number}>,
 *   unrecognised: Array<{value: string, label: string, badge: string, count: number}>,
 * }}
 *
 * Non-array input returns an empty summary rather than throwing: this renders
 * inside an admin panel behind a network call, and a shape change upstream must
 * degrade to "0 registrations" rather than blanking the whole screen.
 */
export function summariseRegistrationsByStatus(rows, vocabulary = PUBLIC_STATUSES) {
  const list = Array.isArray(rows) ? rows : [];

  const tally = new Map();
  for (const row of list) {
    const raw = typeof row?.status === 'string' ? row.status.trim() : '';
    tally.set(raw, (tally.get(raw) ?? 0) + 1);
  }

  const known = vocabulary.map((entry) => ({
    value: entry.value,
    label: entry.label,
    badge: entry.badge,
    count: tally.get(entry.value) ?? 0,
  }));

  const knownValues = new Set(vocabulary.map((entry) => entry.value));
  const unrecognised = [...tally.entries()]
    .filter(([value]) => !knownValues.has(value))
    .map(([value, count]) => ({
      value,
      // The raw value verbatim for an unknown word — it lies about nothing and
      // is debuggable from a screenshot. A blank gets a name instead, because
      // an empty chip reads as an empty cell rather than as a status.
      label: value === '' ? UNSET_STATUS_LABEL : value,
      badge: NEUTRAL_STATUS_BADGE,
      count,
    }))
    // Biggest first, then alphabetical — a stable order, so a snapshot of this
    // panel does not shuffle between reads.
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  return { total: list.length, known, unrecognised };
}
