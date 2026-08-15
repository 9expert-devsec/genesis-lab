/**
 * THE PUBLIC REGISTRATION STATUS SET — one ordered list and one transition
 * table, and every enumeration of a status is derived from them rather than
 * written out again.
 *
 * The sibling file lib/registrations/inhouseStatuses.js exists for exactly this
 * reason and its header records the defect: THREE hand-maintained in-house
 * status lists that had already drifted, producing a summary strip that read
 * ทั้งหมด 6 over cards summing to 5. Public was in the same shape — a status
 * list in RegistrationsClient's STATUS_OPTIONS, a second in its STATUS_LABEL, a
 * third in its stat-card literal, a fourth in RegistrationDetailClient and a
 * fifth as a bare Set in lib/actions/registrations.js — and this module is what
 * collapses them.
 *
 * IN-HOUSE IS NOT FOLDED IN HERE. It still stores new / contacted / quoted /
 * closed-won / closed-lost, which is a different vocabulary for a different
 * collection, and it is migrated separately. Two modules for two enums is the
 * honest shape until then.
 *
 * ── THE ORDER IS THE PIPELINE ORDER ─────────────────────────────────────────
 * pending → confirmed → paid → cancelled is the order a public registration
 * actually moves through, so the cards and the chips read left to right as
 * progress. It is not alphabetical and should not be sorted.
 *
 * ── `accent` IS A COMPLETE TAILWIND CLASS ───────────────────────────────────
 * Never an interpolated fragment. Tailwind scans source text for whole class
 * names, so `border-l-${color}-400` is purged and the card renders with no
 * colour at all.
 *
 * ── NO IMPORTS, ON PURPOSE ──────────────────────────────────────────────────
 * A `'use server'` module may only export async functions, so a shared constant
 * cannot live in lib/actions/registrations.js — which is why the canonical list
 * lives here and that file imports it. Keeping this module import-free also
 * means the pure test tier can load it with nothing stubbed.
 */

export const PUBLIC_STATUSES = [
  { value: 'pending',   label: 'รอดำเนินการ',        accent: 'border-l-amber-400' },
  // RELABELLED. The stored value is still `confirmed` — this is a label change
  // with no migration. What the admin actually does at this step is send the
  // quotation, and 'ยืนยันแล้ว' read as though money had changed hands.
  { value: 'confirmed', label: 'ส่งใบเสนอราคาแล้ว',  accent: 'border-l-blue-400' },
  { value: 'paid',      label: 'ชำระแล้ว',           accent: 'border-l-emerald-400' },
  { value: 'cancelled', label: 'ยกเลิก',             accent: 'border-l-slate-300' },
];

/** The stored enum values, in pipeline order. */
export const PUBLIC_STATUS_VALUES = PUBLIC_STATUSES.map((s) => s.value);

/**
 * WHAT AN ADMIN MAY DO, keyed by the state the record is IN.
 *
 * ── (a) `confirmed → paid` IS DELIBERATELY ABSENT ───────────────────────────
 * It looks like an omission and it is not. `paid` is written by exactly two
 * places — src/app/api/registration/public/charge/route.js and
 * src/app/api/webhooks/omise/route.js — i.e. by Omise settling a real charge.
 * An admin asserting `paid` by hand would put the record in a state no payment
 * exists for, and the receipt, the reconciliation and the refund path all read
 * that field as though money arrived. So there is no admin edge into `paid` at
 * all, from any state.
 *
 * The accepted consequence, stated so nobody "fixes" it later: a course whose
 * CourseExtension.omisePaymentEnabled is false has no online payment path, so
 * it can never reach `paid` and sits at `confirmed` permanently. That is
 * intended. Those registrations are settled off-platform and the record's job
 * is to say a quotation went out, not to claim a payment nothing observed.
 *
 * ── (b) `cancelled` HAS NO OUTGOING TRANSITIONS ─────────────────────────────
 * Also deliberate. Cancellation is TERMINAL: once cancelled, a registration
 * cannot be revived into any state, and lib/actions/registrations.js additionally
 * refuses field edits on a cancelled record. An empty array here is the whole
 * rule — an admin who cancelled the wrong row deletes it and the customer
 * registers again, which leaves an honest trail, where un-cancelling would
 * leave a record whose history says two contradictory things.
 *
 * Note what is NOT expressible here: `pending` is not a target of anything, so
 * there is no way back to it either.
 */
export const PUBLIC_STATUS_TRANSITIONS = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  paid:      ['cancelled'],
  cancelled: [],
};

/**
 * The "no status filter" pseudo-value, shared by the first card and the first
 * chip so the two cannot label the same control differently.
 *
 * Spelled out again rather than imported from inhouseStatuses.js: this module
 * is deliberately import-free (see the header). The duplication is two fields
 * of a constant and is pinned by the pure tier on both sides.
 */
export const ALL_FILTER = { value: 'all', label: 'ทั้งหมด' };

/**
 * The states from which an admin may move INTO `to`.
 *
 * This is the transition table read backwards, and it is the form the write
 * gate needs: `updateRegistrationStatus` puts it straight into a
 * `status: { $in: … }` filter so the permitted from-states are checked by the
 * database, atomically, rather than by a read the client could race.
 *
 * A target nothing may reach — `pending`, and `paid` for any admin — returns
 * an EMPTY array, and `$in: []` matches no document. That is the correct
 * answer, not a degenerate one: the update finds nothing and is refused.
 *
 * @param {string} to
 * @param {Record<string, string[]>} [table]
 * @returns {string[]}
 */
export function allowedFromStates(to, table = PUBLIC_STATUS_TRANSITIONS) {
  return Object.keys(table).filter((from) => (table[from] ?? []).includes(to));
}

/**
 * The states an admin may move a record in `from` INTO — the table read
 * forwards. This is what the detail screen renders its buttons from, so a
 * button offering a transition the server would reject is not expressible.
 *
 * An unknown `from` returns [] rather than throwing: a legacy document holding
 * a retired status should render no actions, not crash the page.
 *
 * @param {string} from
 * @param {Record<string, string[]>} [table]
 * @returns {string[]}
 */
export function allowedTransitions(from, table = PUBLIC_STATUS_TRANSITIONS) {
  return table[from] ?? [];
}

/**
 * Is this exact move permitted? The single predicate both sides ask.
 *
 * @param {string} from
 * @param {string} to
 * @param {Record<string, string[]>} [table]
 * @returns {boolean}
 */
export function isTransitionAllowed(from, to, table = PUBLIC_STATUS_TRANSITIONS) {
  return allowedTransitions(from, table).includes(to);
}

/**
 * value → Thai label.
 *
 * DERIVED from the array, never written beside it. A hand-maintained map keyed
 * by value is the drift the sibling module's header describes, one indirection
 * further away: a value with no label renders a raw enum on the screen, which
 * is the same class of bug as a value with no card.
 *
 * @param {Array<{value: string, label: string}>} [statuses]
 * @returns {Record<string, string>}
 */
export function buildStatusLabels(statuses = PUBLIC_STATUSES) {
  return Object.fromEntries(statuses.map((s) => [s.value, s.label]));
}

/**
 * The summary strip: one total card, then one card per status.
 *
 * `key` is the status VALUE, which is also the key `getRegistrationStatusCounts`
 * returns each count under, and also the filter value in the URL. One spelling,
 * so no consumer has to bridge between two.
 *
 * @param {Array<{value: string, label: string, accent: string}>} [statuses]
 * @returns {Array<{key: string, label: string, filterVal: string, cls: string}>}
 */
export function buildStatCards(statuses = PUBLIC_STATUSES) {
  return [
    {
      key:       'total',
      label:     ALL_FILTER.label,
      filterVal: ALL_FILTER.value,
      cls:       'border-l-4 border-l-[var(--surface-border)]',
    },
    ...statuses.map((s) => ({
      key:       s.value,
      label:     s.label,
      filterVal: s.value,
      cls:       `border-l-4 ${s.accent}`,
    })),
  ];
}

/**
 * The filter chips: an "all" chip, then one per status — the same members as
 * the cards, in the same order, from the same array.
 *
 * @param {Array<{value: string, label: string}>} [statuses]
 * @returns {Array<{value: string, label: string}>}
 */
export function buildStatusChips(statuses = PUBLIC_STATUSES) {
  return [
    { value: ALL_FILTER.value, label: ALL_FILTER.label },
    ...statuses.map((s) => ({ value: s.value, label: s.label })),
  ];
}
