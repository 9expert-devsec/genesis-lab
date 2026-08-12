/**
 * THE DOWNGRADE GUARD — on the write path, not on a button.
 *
 * A sync that would replace a stored snapshot with a materially smaller one
 * does not write. It records what it refused, with both counts, and leaves the
 * stored snapshot exactly as it was.
 *
 * ── WHY THE WRITE PATH AND NOT THE CALLERS ──────────────────────────────────
 * The invariant belongs to the write. `syncLandingData` has four callers — the
 * cron route, the admin sync route, the trigger wrapper, and the webhook's
 * background resync — and b10bd54 is the standing evidence for what happens
 * when an invariant is spread across call sites instead: `revalidatePath`
 * ended up in one writer of four and the other three shipped stale pages for
 * months. Putting the guard in the sync means every caller gets it and there is
 * no third site to forget.
 *
 * ── GROWTH ALWAYS WRITES, AND THAT IS LOAD-BEARING ──────────────────────────
 * The guard only ever blocks SHRINKAGE. A run that grows a section, or matches
 * it, writes normally. That is not leniency — it is the repair path. A bad
 * snapshot republishes itself every cycle, so the only thing that can fix one
 * is a fully healthy run, and a guard that blocked writes generally would lock
 * the bad snapshot in permanently.
 *
 * ── COUNTS COME FROM THE PAYLOAD, NEVER FROM THE STORED `sections` ──────────
 * MEASURED, and it is a live inconsistency in the current writer: on a total
 * failure syncLandingData sets `dataToWrite = previousDoc.data` (preserving the
 * last-known-good payload) but still writes the NEW, zeroed `sections` counters
 * alongside it. So a stored snapshot can hold 27 programs while its own
 * `sections.programs` says 0.
 *
 * A guard reading `sections` would therefore compare against zeros, conclude
 * nothing could shrink, and wave through exactly the run it exists to stop.
 * `sectionCountsOf` counts the arrays in `data` because `data` is what the home
 * page renders and is the only description of the snapshot that cannot be out
 * of step with itself.
 */

/**
 * ── THE THRESHOLD, AND WHY IT IS NOT ROUND 3'S 20% ──────────────────────────
 *
 * Round 3's COLLAPSE_SHRINK_RATIO governs MIRROR ROW COUNTS — collections of
 * 10 to 31 rows that change only when a record is created or deleted upstream.
 * 20% there is 2 to 6 rows, which is comfortably more than routine churn.
 *
 * Snapshot SECTIONS are a different kind of quantity and reusing the number
 * because it exists would be the mistake. They are small (banners 3-5, skills
 * ~9, newCourses 8) and they are edited constantly and legitimately: an admin
 * deactivating one banner moves a 5-item section by 20% on its own. At round
 * 3's threshold this guard would refuse the sync after an ordinary content
 * edit, and a guard that refuses constantly gets its threshold raised until it
 * does nothing.
 *
 * 50% is where "an editor changed something" stops being a plausible
 * explanation. Half a section disappearing is not a toggle. The incident this
 * exists for — 22 of 27 programs, 81% — clears it comfortably, and so does any
 * section collapsing to empty, which is 100% by construction and is the shape
 * that puts `ไม่สามารถโหลดรายการได้ในขณะนี้` on a live public page.
 *
 * ONE named constant, distinct from round 3's, so the two can be argued with
 * separately — which is the point, since they are not the same quantity.
 */
export const SNAPSHOT_SECTION_SHRINK_RATIO = 0.5;

/**
 * ── NAV'S OWN THRESHOLD, AND WHY IT IS TIGHTER THAN LANDING'S ───────────────
 *
 * MEASURED on the live snapshot, not assumed: `nav_menu_cache.data` has just
 * TWO sections — `programs` with 25 groups and `skills` with SIX — and no
 * `sections` counter field at all, so landing's payload-vs-counter divergence
 * has no analogue here.
 *
 * Six is the number that decides this. At landing's 50%, `skills` would have to
 * lose FOUR of its six groups before anything stopped it — by which point
 * two-thirds of the mega menu, on every public page, has silently gone.
 *
 * 25% instead, and the arithmetic is the argument:
 *   skills   1 of 6 = 17%  → allowed. A skill genuinely retired upstream is a
 *                            legitimate taxonomy change and must not need a
 *                            click, or the guard gets raised until it is inert.
 *   skills   2 of 6 = 33%  → gated. Two whole mega-menu columns disappearing
 *                            at once is worth stopping for.
 *   programs 6 of 25 = 24% → allowed;  7 of 25 = 28% → gated.
 *
 * The deeper reason the numbers differ: landing's sections are ADMIN-EDITED
 * CONTENT (banners, featured courses, reviews) that moves every week, so its
 * threshold has to tolerate ordinary editing. Nav's two sections are UPSTREAM
 * TAXONOMY — programs and skills change rarely and never by an editor's hand —
 * so ordinary churn there is one group, and anything larger deserves a look.
 *
 * A SEPARATE CONSTANT, deliberately not consolidated with landing's. They
 * govern different quantities with different volatility, and a single shared
 * number could only be right for one of them.
 *
 * ── WHAT THIS CANNOT SEE, stated because it is a real limit ─────────────────
 * The count is GROUPS, not courses within them. A skills group collapsing from
 * 29 courses to 1 while remaining present is invisible here. It is not
 * invisible in practice — syncNavMenuData omits a group whose `items` came back
 * empty (buildEntry's caller drops `items.length === 0`), so a fully-failed
 * group leaves the count — but a PARTIAL collapse inside a surviving group is
 * genuinely not covered by this guard.
 */
export const NAV_SECTION_SHRINK_RATIO = 0.25;

export const DOWNGRADE_VERDICT = Object.freeze({
  OK: 'ok',
  REFUSE_DOWNGRADE: 'refuse-downgrade',
});

/**
 * Count every array-valued section of a snapshot payload.
 *
 * Shape-agnostic on purpose: it counts whatever arrays the payload holds rather
 * than naming landing_cache's six sections, so the same guard serves
 * nav_menu_cache — whose payload is two maps of groups — without a second
 * implementation that could drift. A non-array value is not a section and is
 * skipped rather than counted as 1.
 */
export function sectionCountsOf(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) out[key] = value.length;
    // nav_menu_cache stores `{ [id]: {...} }` maps rather than arrays; the
    // number of groups is the comparable quantity.
    else if (value && typeof value === 'object') out[key] = Object.keys(value).length;
  }
  return out;
}

/**
 * Would writing `incoming` over `stored` be a material downgrade?
 *
 * @param {object} storedCounts   sections of the snapshot currently stored
 * @param {object} incomingCounts sections of the snapshot about to be written
 * @param {boolean} allowShrink   an admin override, explicitly confirmed
 *
 * ── NO STORED SNAPSHOT MEANS NO REFUSAL ─────────────────────────────────────
 * The first run on an empty database, or after the document was lost, has
 * nothing to protect and everything to establish. Refusing there would leave
 * the site with no snapshot, which Ruling 1 forbids outright.
 *
 * ── A SECTION MISSING FROM `incoming` IS NOT A SHRINK TO ZERO ───────────────
 * It is a shape change, and treating an absent key as 0 would refuse every run
 * after a section is legitimately renamed or removed from the payload. Only
 * sections present on BOTH sides are compared; a section that vanishes from the
 * shape is reported separately so it is visible rather than silently ignored.
 */
export function assessDowngrade({
  storedCounts,
  incomingCounts,
  allowShrink = false,
  // Which threshold governs THIS snapshot. Defaults to landing's so existing
  // callers are unchanged; nav passes its own. A parameter rather than a
  // lookup keyed on the cache name, so the choice is visible at the call site
  // and a new snapshot cannot silently inherit a number nobody chose for it.
  shrinkRatio = SNAPSHOT_SECTION_SHRINK_RATIO,
} = {}) {
  const stored = storedCounts ?? {};
  const incoming = incomingCounts ?? {};

  const storedKeys = Object.keys(stored);
  if (storedKeys.length === 0) {
    return {
      verdict: DOWNGRADE_VERDICT.OK,
      shrunk: [],
      vanished: [],
      reason: '',
      hadStoredSnapshot: false,
    };
  }

  const shrunk = [];
  const vanished = [];

  for (const key of storedKeys) {
    const before = Number(stored[key]) || 0;
    if (!(key in incoming)) {
      if (before > 0) vanished.push(key);
      continue;
    }
    const after = Number(incoming[key]) || 0;
    // `before <= 0` only — the growth case needs no clause of its own. A
    // section that grew or matched yields a zero-or-negative ratio, which no
    // positive threshold can exceed, so an explicit `after >= before` guard
    // would be a SECOND expression of one rule. Removing a redundant guard was
    // verified to redden nothing, and the runner's own note on that says to
    // single-source the rule rather than manufacture a test that can see the
    // difference. What "growth always writes" rests on is the sign of this
    // ratio, and that is asserted directly.
    if (before <= 0) continue;
    const ratio = (before - after) / before;
    if (ratio > shrinkRatio) {
      shrunk.push({ section: key, before, after, lost: before - after, ratio });
    }
  }

  if (shrunk.length === 0) {
    return {
      verdict: DOWNGRADE_VERDICT.OK, shrunk, vanished, reason: '', hadStoredSnapshot: true,
    };
  }

  const detail = shrunk
    .map((s) => `${s.section} ${s.before} → ${s.after} (-${Math.round(s.ratio * 100)}%)`)
    .join(', ');

  if (allowShrink) {
    return {
      verdict: DOWNGRADE_VERDICT.OK,
      shrunk,
      vanished,
      reason: '',
      hadStoredSnapshot: true,
      overridden: true,
    };
  }

  return {
    verdict: DOWNGRADE_VERDICT.REFUSE_DOWNGRADE,
    shrunk,
    vanished,
    hadStoredSnapshot: true,
    reason:
      `สแนปช็อตใหม่เล็กลงมากเกินเกณฑ์ ${Math.round(shrinkRatio * 100)}% `
      + `จึงไม่เขียนทับของเดิม: ${detail} `
      + '(refused: the incoming snapshot is materially smaller; the stored one is untouched)',
  };
}

/** Does this verdict permit the snapshot write? */
export function permitsSnapshotWrite(verdict) {
  return verdict === DOWNGRADE_VERDICT.OK;
}

/**
 * The record a refusal leaves behind, for the console to render and the admin
 * to override from.
 *
 * ── THE ANSWER TO "WHAT HAPPENS ON THE NEXT RUN" ────────────────────────────
 * This is written with `$set` on a single `lastRefusal` field, so a refusal is
 * REPLACED rather than appended. The chosen behaviour, stated so it is a
 * decision rather than an emergent property:
 *
 *   A refusal PERSISTS and is RE-EVALUATED every run. It never expires on a
 *   timer and never auto-clears. Each subsequent run that would still shrink
 *   refuses again and overwrites this record, so the console shows one current
 *   refusal rather than a growing list and the cron log does not flood.
 *
 *   It clears in exactly two ways:
 *     · a run whose snapshot is NOT materially smaller writes normally, and
 *       writing clears it — the world recovered on its own;
 *     · an admin overrides from /admin/cache, which writes once with the guard
 *       bypassed — the shrinkage was legitimate.
 *
 * The alternative — auto-expiring after N runs — was rejected: it would let the
 * bad snapshot land on the second attempt, which is the guard defeating itself
 * on a timer. The cost of the chosen behaviour is that a LEGITIMATE shrinkage
 * blocks the sync until someone clicks, and that cost is the override's whole
 * reason for existing.
 */
export function buildRefusalRecord({ assessment, incomingCounts, at, actor = 'system:cron' }) {
  return {
    at,
    actor,
    storedSections: undefined, // set by the caller from the payload it read
    incomingSections: incomingCounts,
    shrunk: assessment.shrunk,
    vanished: assessment.vanished,
    reason: assessment.reason,
  };
}

/**
 * The confirm control's own label, as a function of what will be lost.
 *
 * ── WHY THIS IS NOT JUST A TEMPLATE STRING IN THE COMPONENT ─────────────────
 * The ruling is that the override confirm RESTATES THE NUMBERS AT THE POINT OF
 * CLICK — the panel's table above it is not enough, because a button reading
 * "ยืนยัน" under a table is a button people click having read the heading and
 * not the rows.
 *
 * As a template literal inside a client component that only renders after a
 * preview, that ruling had NOTHING over it: a control-break that dropped the
 * numbers from the label left the whole suite green, because
 * renderToStaticMarkup can only reach the component's initial state and no
 * test can mount a React root here (the runner is isolation:'none'). Extracting
 * it makes the claim behavioural — the label is a value a pure test can assert
 * on — rather than text nobody can see.
 */
export function overrideConfirmLabel(shrunk) {
  const list = Array.isArray(shrunk) ? shrunk : [];
  if (list.length === 0) {
    // No numbers to state means no confirmation to give. The caller renders no
    // button in this case; the label exists so the function is total.
    return 'override และ sync ทับเลย';
  }
  const detail = list
    .map((s) => `${s.section} ${s.before}→${s.after}`)
    .join(', ');
  return `override และ sync ทับเลย — ยอมให้หาย ${detail}`;
}
