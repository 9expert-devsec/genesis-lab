/**
 * Will this schedule row actually be VISIBLE to Genesis?
 *
 * Kept dependency-free ON PURPOSE: no `next/*`, no db, no models — same
 * rationale as `courseRevalidatePlan.js`. That is what lets the predicate be
 * unit-tested in the `pure` tier without a Next request context.
 *
 * WHY THIS EXISTS: the MSDB `/schedules` READ endpoint pre-filters rows before
 * Genesis ever sees them (documented at docs/api-domains.md:276-278 — status
 * open/nearly_full, non-empty signup_url, dates >= today). A row that fails any
 * of those is invisible to every public surface, but the WEBHOOK still fires and
 * still says `status: "ok"`. That is exactly how PYTHON-L1 vanished from
 * /schedule: schedule 6931505831d45afebddb77d7 arrived with `signup_url: ""`,
 * we logged it as processed, and the failing value sat unread in our own
 * `webhook_logs.payload.data` while the row was hunted upstream.
 *
 * So we evaluate the SAME three criteria at receive time — where we still have
 * the raw document — and record which one failed. This is a WARNING, not a gate:
 * the event is still processed and the route still returns 200 (MSDB must never
 * retry). It also NEVER writes back — Genesis does not repair MSDB data from a
 * webhook handler (MANIFESTO §6, dual-write loop rule).
 *
 * The criteria are duplicated from upstream by necessity: they live in MSDB's
 * query, we cannot import them, and the doc line above is the only shared
 * reference. If upstream changes its filter, this drifts — that is a knowable
 * cost, and a drifted warning is still better than the silence it replaces.
 */

// Upstream's accepted statuses, in the exact casing every observed row uses.
//
// WHY A LENIENT MATCH IS NOT TREATED AS A PASS — do not "simplify" this back to
// a case-insensitive compare. This predicate does not judge whether a status is
// VALID; it predicts whether UPSTREAM'S OWN FILTER will return the row. We do
// not know whether that filter compares case-sensitively, and no odd-cased row
// exists upstream to probe with, so it cannot be settled by observation. Folding
// "Open" to "open" and calling it visible resolves that unknown in the direction
// that produces NO warning — which, if upstream is in fact case-sensitive, means
// upstream silently drops the row and we say nothing. That is precisely the
// silence this module exists to break, on precisely the class of row it was
// built to catch. So a lenient-only match is reported as UNCERTAIN, never as a
// pass. (Status casing really is inconsistent across MSDB domains — see
// docs/api-domains.md "Known quirks" #1 — which is what makes this reachable.)
const VISIBLE_STATUSES = ['open', 'nearly_full'];

const CONSEQUENCE_DEFINITE = 'row will not appear in /schedules responses';
const CONSEQUENCE_UNCERTAIN = 'row MAY not appear in /schedules responses';

/**
 * UTC calendar day (`YYYY-MM-DD`) for a date-ish value, or null if unparseable.
 *
 * Day granularity, not instant: upstream stores session dates as UTC midnight
 * standing for a calendar day, so comparing instants would make a session
 * running TODAY look expired for most of the day. Both sides are reduced to the
 * same UTC day and compared as ISO strings, which sort correctly.
 */
function utcDay(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Assess a schedule payload against upstream's three public-visibility criteria.
 *
 * @param {object} data  the schedule document as MSDB sends it (webhook
 *                       `payload.data`): { status, signup_url, dates[], … }
 * @param {Date}  [now]  reference "today". Injectable ON PURPOSE — a predicate
 *                       that reads the clock itself cannot be tested.
 * @returns {{
 *   visible: boolean,
 *   certain: boolean,
 *   failures: {criterion: string, value: *, reason: string}[],
 *   uncertainties: {criterion: string, value: *, reason: string}[]
 * }}
 *   Three outcomes, not two:
 *     visible:true                    — expected to appear upstream.
 *     visible:false, certain:true     — DEFINITELY invisible; `failures` says why.
 *     visible:false, certain:false    — POSSIBLY invisible; `uncertainties` says
 *                                       what we could not decide.
 *   Both arrays list EVERY criterion that tripped, not just the first, so the
 *   audit entry states the full story rather than one reason at a time. They are
 *   kept SEPARATE on purpose: `failures` are facts about upstream's filter,
 *   `uncertainties` are open questions, and a caller that counts them together
 *   would be counting a guess as a fact. `visible` is true exactly when BOTH are
 *   empty — an unresolved question is not a pass.
 */
export function assessSchedulePublicVisibility(data, now = new Date()) {
  const failures = [];
  const uncertainties = [];
  const fail = (criterion, value, reason) =>
    failures.push({ criterion, value, reason: `${reason} → ${CONSEQUENCE_DEFINITE}` });
  const uncertain = (criterion, value, reason) =>
    uncertainties.push({ criterion, value, reason: `${reason} → ${CONSEQUENCE_UNCERTAIN}` });

  // 1. status ∈ { open, nearly_full } — three-way, see VISIBLE_STATUSES above.
  const rawStatus = data?.status;
  const asString = typeof rawStatus === 'string' ? rawStatus : '';
  const folded = asString.trim().toLowerCase();
  if (VISIBLE_STATUSES.includes(asString)) {
    // exact match — the only unambiguous pass
  } else if (VISIBLE_STATUSES.includes(folded)) {
    uncertain(
      'status',
      rawStatus,
      `status is ${JSON.stringify(rawStatus)} — matches ${JSON.stringify(folded)} ` +
        `only after trimming/case-folding, and upstream's own comparison is UNVERIFIED`
    );
  } else {
    fail(
      'status',
      rawStatus,
      folded
        ? `status is ${JSON.stringify(rawStatus)} — not open/nearly_full`
        : 'status is missing'
    );
  }

  // 2. non-empty signup_url — the criterion that hid PYTHON-L1
  const rawSignup = data?.signup_url;
  const signup = typeof rawSignup === 'string' ? rawSignup.trim() : '';
  if (!signup) {
    fail('signup_url', rawSignup, 'signup_url is empty');
  }

  // 3. at least one date on or after `now` (>=, so a session running today counts)
  const rawDates = Array.isArray(data?.dates) ? data.dates : [];
  const today = utcDay(now);
  const days = rawDates.map(utcDay).filter(Boolean);
  const hasFuture = today !== null && days.some((d) => d >= today);
  if (!hasFuture) {
    fail(
      'dates',
      rawDates,
      days.length === 0
        ? 'no usable date on the row'
        : `no date is on or after ${today} (latest is ${days.slice().sort().pop()})`
    );
  }

  return {
    visible: failures.length === 0 && uncertainties.length === 0,
    certain: uncertainties.length === 0,
    failures,
    uncertainties,
  };
}
