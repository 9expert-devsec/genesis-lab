/**
 * Single source of truth for how a schedule's status is WORDED and COLOURED.
 *
 * Five surfaces used to carry their own copy of this map and had drifted into
 * three different words for the "open" state and two different greens. (The
 * superseded wordings are deliberately not quoted here, so that grepping for
 * them returns only genuine leftovers.) The vocabulary is now exactly three
 * states:
 *
 *   open         green   state เปิดรับ    action ลงทะเบียน
 *   nearly_full  amber   state ใกล้เต็ม   action ใกล้เต็ม
 *   full         red     state เต็ม      action เต็ม
 *
 * TWO words per state, not one — see the note on SCHEDULE_STATUS below for
 * which surface reads which, and why the two equalities are deliberate.
 *
 * PRESENTATION ONLY. Nothing here writes, validates, or reinterprets a stored
 * status. The canonical keys below are the vocabulary MSDB actually emits —
 * the admin form posts exactly `open` / `nearly_full` / `full` into the MSDB
 * payload (see lib/actions/schedules.js shapeMsdbPayload) — and the aliases
 * exist only so a surface fed a differently-spelled key still renders the
 * right words instead of silently falling through to green "open".
 *
 * SHAPE IS NOT SHARED, ONLY THE LABEL AND THE COLOUR. The five call sites draw
 * genuinely different badges (a dot beside text, a solid chip, a tinted pill),
 * so this exports colour tokens per shape and each site composes its own
 * layout. Adding a sixth shape here is preferable to a sixth local map.
 */

/** The vocabulary MSDB emits. Order is display order, least→most full. */
export const SCHEDULE_STATUSES = ['open', 'nearly_full', 'full'];

/**
 * Spellings that mean one of the canonical three but arrive differently.
 *
 *   closed   — the local ScheduleStatus override collection's enum
 *              (src/models/ScheduleStatus.js) uses `closed` where MSDB uses
 *              `full`. Both mean "cannot register".
 *   nearFull — lib/formatScheduleDate.js `formatStatusFromAPI` camel-cases
 *              `nearly_full` on its way into <ScheduleCard />.
 *
 * Mapping them here is what stops a full session from rendering as green.
 */
const ALIASES = {
  closed: 'full',
  nearFull: 'nearly_full',
  nearly_Full: 'nearly_full',
};

/**
 * Colour tokens per status, one entry per badge shape in use:
 *
 *   dot   — background of the small circle beside the label (/schedule, search)
 *   text  — colour of the label text in that same dot+text treatment
 *   solid — filled chip, white text on the status colour (ScheduleCard)
 *   soft  — tinted pill (registration carousel, page-builder section)
 *
 * `soft` uses an alpha tint of the status colour rather than a fixed light
 * shade, so it composes over both the light and the dark surface; the dark
 * override only lifts the tint enough to stay visible on a dark card.
 *
 * The greens/ambers/reds are the ones already in the codebase (#39b980 /
 * #ffc94a / #ff4b55, with #d4a017 as the legible amber for text on light) —
 * deliberately not new values.
 */
/**
 * ── TWO WORDS PER STATUS, NOT ONE `label` ──────────────────────────────────
 *
 * `state`  — what the round IS. A noun phrase, for anywhere the reader is
 *            being told a fact: the /schedule filter dropdown, a legend.
 * `action` — what a visitor can DO about it. The word a BADGE carries, because
 *            every badge in this codebase sits inside a row that is a
 *            registration link.
 *
 * There was one field, `label`, and it was made to mean both. A design change
 * renamed open's to 'ลงทะเบียน' for the badges and the filter dropdown followed
 * it out of the same constant, so the status filter came to offer
 * `<option value="open">ลงทะเบียน</option>` — an ACTION where a reader is
 * choosing a STATE to filter by. The invariant that made that happen is right
 * and is kept: the filter is still driven off this module, so its wording still
 * cannot drift from the badges'. What was wrong is one constant carrying two
 * meanings, so there are now two fields and each surface names the one it means.
 *
 * ── THE EQUALITY ON nearly_full AND full IS DELIBERATE ─────────────────────
 *
 * Both are written out in full rather than defaulting `action` to `state`,
 * because a silent fallback is indistinguishable from an oversight and the next
 * reader cannot tell whether the missing word was decided or forgotten. Nor may
 * they be "tidied up" into one field on the grounds that they are equal today —
 * this repo has already been bitten by two values that were equal by
 * coincidence and got collapsed.
 *
 * They are equal for a REASON, and it differs per status:
 *
 *   nearly_full — still registerable, but 'ใกล้เต็ม' is the urgent thing to say
 *                 and no separate call to action was designed. If one is ever
 *                 added it goes here; nothing else changes.
 *   full        — there IS no action. `scheduleRegistrationHref` returns null
 *                 for a full round (and for the local `closed` spelling), so
 *                 the card is not a link at all. A badge reading 'ลงทะเบียน'
 *                 on an unclickable sold-out round would be the worst wording
 *                 on the page, so `action` MUST stay the state word here. This
 *                 equality is load-bearing, not incidental.
 */
export const SCHEDULE_STATUS = {
  open: {
    state: 'เปิดรับ',
    action: 'ลงทะเบียน',
    dot: 'bg-[#39b980]',
    text: 'text-[#39b980]',
    solid: 'bg-[#39b980] text-white',
    soft: 'bg-[#39b980]/10 text-[#39b980] dark:bg-[#39b980]/20',
  },
  nearly_full: {
    state: 'ใกล้เต็ม',
    action: 'ใกล้เต็ม', // equal ON PURPOSE — see the note above
    dot: 'bg-[#ffc94a]',
    text: 'text-[#d4a017] dark:text-[#ffc94a]',
    solid: 'bg-[#ffc94a] text-white',
    soft: 'bg-[#ffc94a]/15 text-[#d4a017] dark:bg-[#ffc94a]/20 dark:text-[#ffc94a]',
  },
  full: {
    state: 'เต็ม',
    action: 'เต็ม', // equal ON PURPOSE, and load-bearing — see the note above
    dot: 'bg-[#ff4b55]',
    text: 'text-[#ff4b55]',
    solid: 'bg-[#ff4b55] text-white',
    soft: 'bg-[#ff4b55]/10 text-[#ff4b55] dark:bg-[#ff4b55]/20',
  },
};

/**
 * Canonical key for a raw status value, or null when it is not a schedule
 * status at all.
 *
 * Returning null rather than defaulting to 'open' is deliberate: defaulting to
 * open is how an unrecognised value ends up advertised as green — and since
 * the state/action split it would be advertised with an IMPERATIVE,
 * "ลงทะเบียน", on a round nothing is known about. Call sites choose their own
 * fallback explicitly.
 */
export function normalizeScheduleStatus(raw) {
  if (typeof raw !== 'string') return null;
  const key = ALIASES[raw] ?? raw;
  return SCHEDULE_STATUSES.includes(key) ? key : null;
}

/**
 * Neutral treatment for a status value we do not recognise. Grey in both
 * themes, and deliberately sharing none of the three status colours.
 */
export const NEUTRAL_STATUS = {
  dot: 'bg-slate-400',
  text: 'text-slate-500 dark:text-slate-300',
  solid: 'bg-slate-400 text-white',
  soft: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
};

/**
 * THE ONE FALLBACK POLICY. Every surface renders its badge from this.
 *
 *   known status      -> the canonical entry (green / amber / red)
 *   unrecognised      -> NEUTRAL grey, labelled with the raw value verbatim
 *   missing / blank   -> null, meaning "render no badge at all"
 *
 * Why grey-and-raw rather than hiding, or rather than assuming open: assuming
 * open is the original defect — it advertises a session as taking bookings on
 * no evidence. Hiding is how that defect stayed invisible for so long. Showing
 * the unrecognised value in grey lies about nothing and is debuggable from a
 * screenshot.
 *
 * `isKnown` lets a caller branch on it without re-deriving the classification.
 */
export function resolveScheduleBadge(raw) {
  const known = normalizeScheduleStatus(raw);
  if (known) return { ...SCHEDULE_STATUS[known], status: known, isKnown: true };

  const verbatim = typeof raw === 'string' ? raw.trim() : '';
  if (!verbatim) return null;
  // Both fields carry the raw value. An unrecognised status has no state/action
  // distinction to make — we do not know what it means, which is the whole
  // point of showing it verbatim — and giving the shape the same keys either
  // way means no call site has to branch on `isKnown` just to read a word.
  return { ...NEUTRAL_STATUS, state: verbatim, action: verbatim, status: null, isKnown: false };
}

/**
 * Just the Thai label, or null when there is nothing to say.
 *
 * Built on resolveScheduleBadge so it shares the single fallback policy. An
 * earlier pair of helpers here took a `fallback = 'open'` argument; they are
 * gone deliberately — a helper that can be made to answer "open" for an
 * unrecognised status is the defect this module exists to prevent, and leaving
 * one exported is leaving it loaded.
 */
export function scheduleStatusLabel(raw) {
  // The STATE word: this answers "what is this round", which is the only
  // question a bare label-getter can be asking. A caller that wants the badge
  // wording reads `.action` off resolveScheduleBadge, where the choice is
  // visible at the call site instead of buried in a helper's name.
  return resolveScheduleBadge(raw)?.state ?? null;
}

/**
 * `[{ value, label }]` for the /schedule filter, so it cannot drift from the
 * badges — the invariant is unchanged, only the FIELD it reads.
 *
 * `state`, never `action`. This is a dropdown of things to filter BY, and the
 * reader is choosing a fact about a round, not an activity: `<option>เปิดรับ`
 * is a state to select, `<option>ลงทะเบียน` reads as a command. The key stays
 * `label` because that is the `<option>`'s label and means nothing else here.
 */
export const SCHEDULE_STATUS_OPTIONS = SCHEDULE_STATUSES.map((value) => ({
  value,
  label: SCHEDULE_STATUS[value].state,
}));
