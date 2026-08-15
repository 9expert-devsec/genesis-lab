/**
 * THE REGISTRATION STATUS SETS — one module for BOTH collections, with the two
 * per-source subsets kept distinct.
 *
 * ── WHY THIS FILE IS NAMED `statuses` AND NOT `publicStatuses` ──────────────
 * It was publicStatuses.js and the name stopped being true. In-house used to
 * store a different five-value vocabulary in its own sibling module; round 2
 * collapsed it onto the same three values public already uses, so there is one
 * vocabulary here with two SUBSETS of it, not two vocabularies. Leaving the
 * file called "public" while it also owned in-house would be the same class of
 * lie as a status with no card.
 *
 * ── THE DEFECT THE ABSORBED MODULE EXISTED TO MAKE IMPOSSIBLE ───────────────
 * This paragraph is carried over verbatim in substance from
 * lib/registrations/inhouseStatuses.js, which this file absorbed and which was
 * deleted in the same commit. Its reason must not be deleted with it.
 *
 * There were THREE hand-maintained lists of in-house statuses and they had
 * already drifted:
 *
 *   · the stat cards in RegistrationsClient — five entries, `quoted` MISSING,
 *     inside a hard-coded `grid-cols-5`;
 *   · the filter chips in the same file, fifteen lines below — six entries,
 *     `quoted` present;
 *   · `getRegistrationStatusCounts` in lib/actions/registrations.js — which
 *     counted four statuses by name and never computed `quoted` at all.
 *
 * The visible symptom was a summary strip reading ทั้งหมด 6 over cards summing
 * to 5, with one real record (status `quoted`) counted in the total and shown
 * by nothing. The chip could filter to it; no card could display it. That is
 * the screen asserting two different answers to one question.
 *
 * The public side was in the identical shape and had not yet been bitten — a
 * status list in RegistrationsClient's STATUS_OPTIONS, a second in its
 * STATUS_LABEL, a third in its stat-card literal, a fourth in
 * RegistrationDetailClient and a fifth as a bare Set in
 * lib/actions/registrations.js. Both sides are now derived from the arrays
 * below, which is what makes a card-without-a-chip unrepresentable.
 *
 * ── WHY A LIST OF OBJECTS AND NOT A LIST OF STRINGS ─────────────────────────
 * The label and the accent colour travel WITH the value, so adding a status is
 * one entry in one array and every consumer follows. A parallel `STATUS_LABEL`
 * map keyed by value would reintroduce exactly the drift above, one indirection
 * further away: a value with no label renders a raw enum, which is the same
 * class of bug as a value with no card.
 *
 * ── THE ORDER IS THE PIPELINE ORDER ─────────────────────────────────────────
 * Each list is in the order a registration actually moves through, so the cards
 * and the chips read left to right as progress. Neither is alphabetical and
 * neither should be sorted.
 *
 * ── `accent` AND `badge` ARE COMPLETE TAILWIND CLASSES ──────────────────────
 * Never interpolated fragments. Tailwind scans source text for whole class
 * names, so `border-l-${color}-400` is purged and the card renders with no
 * colour at all. Comments are scanned too, which is why no fragment of that
 * shape is written anywhere in this file.
 *
 * `accent` is the summary card's left edge; `badge` is the status CHIP in the
 * table cell and on the detail header.
 *
 * ── WHY `badge` LIVES HERE AND NOT IN THE SCREENS ───────────────────────────
 * It was a hand-written `STATUS_BADGE` literal in FOUR files — both list
 * clients and both detail clients — and it is keyed by status value, which
 * makes it vocabulary-shaped: the same shape as the label map, which is already
 * here, and as the card list, which is already here. A status added to the
 * arrays above without a matching entry in one of those four literals rendered
 * an UNSTYLED chip, and only on the one screen whose copy was missed.
 *
 * That is the identical class of defect as the drift recorded at the top of
 * this file, one property further along: a value with no colour is a value with
 * no card wearing different clothes. Colour travels with the value now.
 *
 * ── NO IMPORTS, ON PURPOSE ──────────────────────────────────────────────────
 * A `'use server'` module may only export async functions, so a shared constant
 * cannot live in lib/actions/registrations.js — which is why the canonical
 * lists live here and that file imports them. Keeping this module import-free
 * also means the pure test tier can load it with nothing stubbed, and the
 * migration script under scripts/ can import it without pulling in next-auth.
 */

// ── PUBLIC ──────────────────────────────────────────────────────────────────

export const PUBLIC_STATUSES = [
  { value: 'pending',   label: 'รอดำเนินการ',        accent: 'border-l-amber-400',   badge: 'bg-amber-100 text-amber-700' },
  // RELABELLED in round 1. The stored value is still `confirmed` — this is a
  // label change with no migration. What the admin actually does at this step
  // is send the quotation, and 'ยืนยันแล้ว' read as though money had changed
  // hands.
  { value: 'confirmed', label: 'ส่งใบเสนอราคาแล้ว',  accent: 'border-l-blue-400',    badge: 'bg-blue-100 text-blue-700' },
  { value: 'paid',      label: 'ชำระแล้ว',           accent: 'border-l-emerald-400', badge: 'bg-emerald-100 text-emerald-700' },
  { value: 'cancelled', label: 'ยกเลิก',             accent: 'border-l-slate-300',   badge: 'bg-slate-100 text-slate-500' },
];

// ── IN-HOUSE ────────────────────────────────────────────────────────────────

/**
 * THREE VALUES, SHARED WITH PUBLIC — and `paid` is deliberately not among them.
 *
 * `paid` IS PUBLIC ONLY. An in-house engagement is invoiced and settled off
 * platform entirely; there is no Omise charge, so nothing in the system ever
 * observes the money arriving. A `paid` reachable from an in-house state would
 * be an admin asserting a payment no charge exists for — the same rule that
 * keeps `paid` out of the PUBLIC transition table, applied one step earlier by
 * keeping it out of the in-house VOCABULARY altogether.
 *
 * The labels, accents and badges are the same strings as the public entries for
 * the same values, and that is the point of the collapse rather than a copy:
 * the two strips describe the same three real-world states and must read alike.
 * `pending` and `cancelled` are literally the same rows as above; a test pins
 * that they have not been allowed to drift apart.
 */
export const INHOUSE_STATUSES = [
  { value: 'pending',   label: 'รอดำเนินการ',       accent: 'border-l-amber-400', badge: 'bg-amber-100 text-amber-700' },
  { value: 'quoted',    label: 'ส่งใบเสนอราคาแล้ว', accent: 'border-l-blue-400',  badge: 'bg-blue-100 text-blue-700' },
  { value: 'cancelled', label: 'ยกเลิก',            accent: 'border-l-slate-300', badge: 'bg-slate-100 text-slate-500' },
];

/** The stored enum values, in pipeline order. */
export const PUBLIC_STATUS_VALUES  = PUBLIC_STATUSES.map((s) => s.value);
export const INHOUSE_STATUS_VALUES = INHOUSE_STATUSES.map((s) => s.value);

// ── THE COLLAPSE, AND WHAT IT DESTROYS ──────────────────────────────────────

/**
 * ── THE ROUND-2 MIGRATION MAP — five stored in-house values become three ────
 *
 *     new         → pending      (รอดำเนินการ)
 *     contacted   → pending
 *     quoted      → quoted       (ส่งใบเสนอราคาแล้ว — unchanged, not listed here)
 *     closed-won  → quoted
 *     closed-lost → cancelled    (ยกเลิก)
 *
 * TWO OF THESE ARE LOSSY AND THE USER ACCEPTED THAT EXPLICITLY. This is the
 * kind of decision a future reader will try to undo, so the reasons are here
 * rather than in a commit message nobody will find:
 *
 *   · `contacted` and `closed-won` are GONE, NOT RENAMED. After this there is
 *     no place to record that a lead was contacted, or that a deal was won. If
 *     the sales team later wants that back, THE CORRECT SHAPE IS A SEPARATE
 *     FIELD — `contactedAt` / `wonAt` — and NOT a re-expanded status enum. The
 *     whole point of the collapse is one vocabulary shared with public, and
 *     re-adding a value would spend that and put the screen back in the state
 *     the header above describes.
 *
 *   · `closed-won → quoted` LOOKS WRONG UNTIL YOU KNOW THE PARALLEL RULING ON
 *     THE PUBLIC SIDE. A public course whose CourseExtension.omisePaymentEnabled
 *     is false has no online payment path, so it can never reach `paid` and
 *     sits at `confirmed` (ส่งใบเสนอราคาแล้ว) PERMANENTLY, because money
 *     arriving is tracked outside the system. In-house behaves the same way —
 *     every in-house engagement is that case. Both flows end at "quotation
 *     sent" and stay there. `closed-won` was not a payment state; it was a
 *     sales outcome, and the system never observed it either.
 *
 * ── THIS MAP IS LOAD-BEARING IN THREE PLACES, WHICH IS WHY IT IS DECLARED ───
 *   1. scripts/migrate-inhouse-status-vocabulary.mjs rewrites documents by it;
 *   2. `storedValuesForFilter` below widens a live filter to include the legacy
 *      values that map onto it, so the list screen and the summary strip stay
 *      correct in the window BETWEEN the code deploy and the migration --apply;
 *   3. `LEGACY_STATUS_LABELS` covers exactly its keys, so the audit trail can
 *      render a retired value without that value becoming selectable.
 *
 * `quoted` IS NOT A KEY HERE. It maps to itself and survives into the live
 * vocabulary, so it is neither legacy nor retired — which is why this map has
 * FOUR entries and not five. A fifth entry would have to be `quoted: 'quoted'`,
 * and that would make a live value reachable through every legacy path above.
 */
export const INHOUSE_LEGACY_STATUS_MAP = {
  new:           'pending',
  contacted:     'pending',
  'closed-won':  'quoted',
  'closed-lost': 'cancelled',
};

/**
 * The RETIRED in-house values → Thai, FOR HISTORY ONLY.
 *
 * ── THIS MAP IS DELIBERATELY SEPARATE FROM THE LIVE VOCABULARY ──────────────
 * `admin_audit_logs` holds rows whose `before`/`after` carry `new`,
 * `contacted`, `closed-won` and `closed-lost`. Those rows are HISTORICAL FACT
 * and are not migrated — the audit trail is only evidence because nothing in it
 * is ever rewritten. So the labels have to survive somewhere, and that somewhere
 * cannot be the live arrays: anything in `INHOUSE_STATUSES` becomes a filter
 * chip, a summary card and a transition target.
 *
 * LIVE STATUSES DRIVE THE FILTERS AND THE BUTTONS. LEGACY LABELS ONLY EVER
 * DECORATE HISTORY. Do not merge the two maps to "simplify" the lookup — a
 * retired value must never be selectable, and `statusLabel` below is the single
 * reader that needs both.
 *
 * Keyed off INHOUSE_LEGACY_STATUS_MAP so the two cannot drift: a value that is
 * migrated away from is exactly a value that needs a legacy label, and a test
 * asserts the key sets are equal and share nothing with the live vocabulary.
 */
export const LEGACY_STATUS_LABELS = {
  new:           'ใหม่',
  contacted:     'ติดต่อแล้ว',
  'closed-won':  'ปิดงานสำเร็จ',
  'closed-lost': 'ไม่สำเร็จ',
};

// ── TRANSITIONS ─────────────────────────────────────────────────────────────

/**
 * WHAT AN ADMIN MAY DO on a PUBLIC registration, keyed by the state the record
 * is IN.
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
 * The same rules for IN-HOUSE, over its three-value subset.
 *
 * ── `paid` IS UNREACHABLE, FROM EVERY STATE ─────────────────────────────────
 * Not by an omission that could be "completed" later — it is not in
 * INHOUSE_STATUS_VALUES at all, so there is no row that could name it and no
 * target it could appear as. See the note on INHOUSE_STATUSES.
 *
 * ── `cancelled` IS TERMINAL HERE TOO ────────────────────────────────────────
 * Round 1 made cancellation terminal for public. In-house had no `cancelled`
 * to apply it to; now it does, and the rule follows the value rather than the
 * collection. A cancelled in-house request is fully read-only and DELETE STAYS
 * AVAILABLE — the same ruling, for the same reason, enforced in
 * lib/actions/inhouse-registrations.js and lib/actions/registrations.js.
 *
 * ── THERE IS NO WAY BACK TO `pending` ───────────────────────────────────────
 * `quoted → pending` would mean un-sending a quotation. The quotation was sent;
 * the record's job is to say so.
 */
export const INHOUSE_STATUS_TRANSITIONS = {
  pending:   ['quoted', 'cancelled'],
  quoted:    ['cancelled'],
  cancelled: [],
};

/**
 * The "no status filter" pseudo-value, shared by the first card and the first
 * chip so the two cannot label the same control differently.
 */
export const ALL_FILTER = { value: 'all', label: 'ทั้งหมด' };

// ── PER-SOURCE SELECTION ────────────────────────────────────────────────────

/**
 * `source` is the COLLECTION discriminator used everywhere else in the admin
 * (see getModel in lib/actions/registrations.js), and these two functions are
 * the only place it turns into a vocabulary.
 *
 * Anything that is not 'inhouse' is public, matching `getModel` exactly. If the
 * two ever disagree, a screen renders one collection's chrome over the other's
 * documents — which is the defect RegistrationsClient's header describes.
 *
 * @param {string} source
 */
export function statusesForSource(source) {
  return source === 'inhouse' ? INHOUSE_STATUSES : PUBLIC_STATUSES;
}

/** @param {string} source */
export function statusValuesForSource(source) {
  return source === 'inhouse' ? INHOUSE_STATUS_VALUES : PUBLIC_STATUS_VALUES;
}

/** @param {string} source */
export function transitionsForSource(source) {
  return source === 'inhouse' ? INHOUSE_STATUS_TRANSITIONS : PUBLIC_STATUS_TRANSITIONS;
}

// ── LABELS ──────────────────────────────────────────────────────────────────

/**
 * value → Thai label.
 *
 * DERIVED from the array, never written beside it. A hand-maintained map keyed
 * by value is the drift the header describes, one indirection further away: a
 * value with no label renders a raw enum on the screen, which is the same class
 * of bug as a value with no card.
 *
 * @param {Array<{value: string, label: string}>} [statuses]
 * @returns {Record<string, string>}
 */
export function buildStatusLabels(statuses = PUBLIC_STATUSES) {
  return Object.fromEntries(statuses.map((s) => [s.value, s.label]));
}

/**
 * Every LIVE label, both sources at once.
 *
 * ── THE TWO SUBSETS CAN BE MERGED HERE BECAUSE THEY DO NOT COLLIDE ──────────
 * `pending` and `cancelled` are in both and carry the SAME label in both, by
 * construction — they are the same states. `confirmed` and `paid` are public
 * only; `quoted` is in-house only. So no value maps to two different labels and
 * a merged lookup cannot be ambiguous. A test pins that, because the day it
 * stops being true this function starts silently preferring one source's
 * wording over the other's.
 *
 * This is a LABEL lookup, not a vocabulary. It must not be used to decide what
 * an admin may select — `statusesForSource` is for that, and merging the two
 * subsets into a selectable list is how `paid` would become reachable for
 * in-house.
 */
const LIVE_STATUS_LABELS = {
  ...buildStatusLabels(PUBLIC_STATUSES),
  ...buildStatusLabels(INHOUSE_STATUSES),
};

/**
 * One status value → the Thai a human reads, LIVE OR RETIRED.
 *
 * The live vocabulary is consulted FIRST and the legacy map second, so a value
 * that is both (there is none, and a test pins that) could never be shadowed by
 * its retired wording. An unknown value is returned UNCHANGED rather than
 * replaced by a dash: an audit row from a collection this module has never
 * heard of should show what it actually holds, not hide it.
 *
 * ── WHERE THIS IS USED, AND WHERE IT MUST NOT BE ────────────────────────────
 * Used by components/audit/auditRowParts.jsx to render `{status}` payloads in
 * the audit trail, where retired values legitimately appear forever. NOT used
 * to build any filter, chip, card or button — those all derive from
 * `statusesForSource`, and routing them through here would make a retired value
 * selectable, which is the one thing the split between the two maps exists to
 * prevent.
 *
 * @param {string} value
 * @returns {string}
 */
export function statusLabel(value) {
  return LIVE_STATUS_LABELS[value] ?? LEGACY_STATUS_LABELS[value] ?? String(value);
}

/**
 * The chip colour for a status — merged across both subsets, exactly as
 * `LIVE_STATUS_LABELS` is, and safe for the same measured reason: the two
 * subsets share `pending` and `cancelled` and give them IDENTICAL classes, so
 * no value maps to two different colours. A test pins that.
 */
const LIVE_STATUS_BADGES = Object.fromEntries(
  [...PUBLIC_STATUSES, ...INHOUSE_STATUSES].map((s) => [s.value, s.badge])
);

/**
 * The NEUTRAL chip, used for any value the live vocabulary does not know.
 *
 * A named constant rather than a literal repeated at four call sites, because
 * that repetition is what this whole fold removes. It is deliberately a real
 * colour rather than '' — a chip with no background is invisible against the
 * row, so an unrecognised status would look like an EMPTY CELL rather than like
 * a status nobody has styled. Grey says "unknown", blank says "nothing here",
 * and only one of those is true.
 */
export const NEUTRAL_STATUS_BADGE = 'bg-slate-100 text-slate-600';

/**
 * One status value → the complete Tailwind classes for its chip.
 *
 * ── THE FALLBACK IS INSIDE, NOT AT THE CALL SITE ────────────────────────────
 * Every consumer used to write `STATUS_BADGE[x] ?? 'bg-slate-100
 * text-slate-600'`, which is four copies of a decision. Folding the `??` in
 * here means a caller cannot forget it, and cannot pick a different neutral.
 *
 * ── RETIRED VALUES GET THE NEUTRAL CHIP, AND THAT IS CORRECT NOW ────────────
 * Unlike `statusLabel`, this does NOT consult the legacy map. During the
 * round-2 migration window the two list clients carried retired colours so
 * unmigrated rows would not all turn grey; that window is closed — the
 * migration has run and the enum is narrowed to the three live values, so no
 * document can hold a retired status any more. A retired value reaching this
 * function today would be a genuine anomaly, and grey is the honest way to
 * render an anomaly.
 *
 * The audit trail is unaffected: it renders retired statuses as TEXT through
 * `statusLabel` and draws no chip, so nothing there needs a colour.
 *
 * @param {string} value
 * @returns {string} complete Tailwind classes, never a fragment
 */
export function statusBadge(value) {
  return LIVE_STATUS_BADGES[value] ?? NEUTRAL_STATUS_BADGE;
}

// ── FILTERING ───────────────────────────────────────────────────────────────

/**
 * The STORED values a live status filter should match, for one source.
 *
 * ── WHY A FILTER ON `pending` MUST ALSO MATCH `new` AND `contacted` ─────────
 * There is a WINDOW between this code deploying and the migration's `--apply`
 * being run — deliberately, because the two are separate decisions taken by
 * different people (see the script header). During that window the in-house
 * collection still holds `new` and `contacted` documents while the screen only
 * knows three statuses.
 *
 * Without this widening the summary strip would read ทั้งหมด 8 over cards
 * summing to 2 — which is EXACTLY the defect this module was created to make
 * impossible, arriving from the other direction. So a live status filter
 * matches its own value plus every legacy value that migrates onto it, and the
 * cards go on summing to the total on both sides of the migration.
 *
 * After `--apply` the extra members simply match nothing. Removing them then is
 * optional and is not urgent; leaving them in is what makes the code idempotent
 * with respect to the migration, exactly as the script is.
 *
 * ── AN UNRECOGNISED STATUS RETURNS [] ───────────────────────────────────────
 * Not `[status]`. `[]` is the signal to the caller that there is no clause to
 * apply — see buildRegistrationFilter, which then omits the clause entirely and
 * shows everything. A retired value in the URL (`?status=closed-won`, sitting
 * in someone's bookmark) is unrecognised BY DESIGN and degrades to "show all"
 * rather than to a filter matching the handful of unmigrated documents; the
 * live vocabulary is what the screen offers and what it should answer to.
 *
 * @param {string} status a live status value, or anything at all
 * @param {string} [source]
 * @returns {string[]} stored values to match, or [] for "no clause"
 */
export function storedValuesForFilter(status, source = 'public') {
  if (!statusValuesForSource(source).includes(status)) return [];
  if (source !== 'inhouse') return [status];
  const legacy = Object.entries(INHOUSE_LEGACY_STATUS_MAP)
    .filter(([, live]) => live === status)
    .map(([retired]) => retired);
  return [status, ...legacy];
}

/**
 * A STORED value → the LIVE value it behaves as.
 *
 * Identity for anything already live. For a RETIRED in-house value it returns
 * the status that value migrates to, so a document the migration has not
 * reached yet acts exactly like the document it is about to become.
 *
 * ── WHY THIS IS NEEDED AND `storedValuesForFilter` IS NOT ENOUGH ────────────
 * That function widens a QUERY: "which stored values does this live filter
 * match". This is the inverse and it answers a different question: "given this
 * one document, what may be done to it".
 *
 * Without it the window between deploying and `--apply` is not merely cosmetic,
 * it is BROKEN. `allowedTransitions('new')` is [] — `new` has no row in the
 * three-value table — so the detail screen would render no status buttons and
 * the write gate would refuse every move, for EVERY in-house document that has
 * not been migrated. At the time this was written that was six of the eight
 * documents in the collection: the whole backlog, frozen, until someone ran a
 * script. "Tolerate both vocabularies" has to mean the product keeps working,
 * not just that it does not crash.
 *
 * ── WHAT THIS MUST NOT BE USED FOR ──────────────────────────────────────────
 * DISPLAY. The badge on the detail screen and the cell in the list both render
 * `statusLabel(doc.status)` — the value the document ACTUALLY holds. Showing a
 * `new` enquiry as 'รอดำเนินการ' would be the screen quietly asserting the
 * migration had run. What the record says and what an admin may do to it are
 * two questions, and only the second one is this.
 *
 * Once `--apply` has run this is the identity function for every stored value.
 * It costs one lookup and is what makes the ordering safe, so it stays.
 *
 * @param {string} value a stored status
 * @param {string} [source]
 * @returns {string}
 */
export function effectiveStatus(value, source = 'public') {
  if (source !== 'inhouse') return value;
  return INHOUSE_LEGACY_STATUS_MAP[value] ?? value;
}

/**
 * A `status` search param → the value the screen should behave as.
 *
 * Returns `'all'` for anything the source's live vocabulary does not contain,
 * which is the same shape page.jsx already applies to `source` and `range`.
 *
 * ── WHY THE UI NEEDS THIS AS WELL AS THE QUERY ──────────────────────────────
 * `storedValuesForFilter` makes the QUERY degrade to "show all". This makes the
 * SCREEN agree with it: without it, `?status=closed-won` would list every row
 * while no chip and no card appeared selected, and the ทั้งหมด chip — which is
 * what the list is actually showing — would render inactive. Two answers to one
 * question again, in the small.
 *
 * @param {string} status
 * @param {string} [source]
 */
export function normaliseStatusParam(status, source = 'public') {
  return statusValuesForSource(source).includes(status) ? status : ALL_FILTER.value;
}

// ── TRANSITION READERS ──────────────────────────────────────────────────────

/**
 * The states from which an admin may move INTO `to`.
 *
 * This is the transition table read backwards, and it is the form the write
 * gate needs: `updateRegistrationStatus` puts it straight into a
 * `status: { $in: … }` filter so the permitted from-states are checked by the
 * database, atomically, rather than by a read the client could race.
 *
 * A target nothing may reach — `pending` on either side, and `paid` for any
 * admin — returns an EMPTY array, and `$in: []` matches no document. That is
 * the correct answer, not a degenerate one: the update finds nothing and is
 * refused.
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
 * forwards. This is what the detail screens render their buttons from, so a
 * button offering a transition the server would reject is not expressible.
 *
 * An unknown `from` returns [] rather than throwing: a document still holding a
 * RETIRED status — every in-house document does, until the migration runs —
 * should render no actions, not crash the page. That is not a hypothetical
 * during this round; it is the normal case for the whole window.
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

// ── BUILDERS ────────────────────────────────────────────────────────────────

/**
 * The summary strip: one total card, then one card per status.
 *
 * `key` is the status VALUE, which is also the key `getRegistrationStatusCounts`
 * returns each count under, and also the filter value in the URL. One spelling,
 * so no consumer has to bridge between two. Those used to disagree on the
 * in-house side — the action returned `closedWon`/`closedLost` in camelCase
 * while the filter value was `closed-won`/`closed-lost`, so the card carried a
 * third spelling to bridge them.
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
