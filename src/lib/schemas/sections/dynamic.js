import { z } from 'zod';
import { defineSection } from './base';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The ONE normaliser for a bundle item's offered rounds,
// shared with every reader; its note in chosenRounds.js explains why both the
// preprocess and the readers need it. No cycle: chosenRounds imports only
// lib/schedule/roundHasStarted and nothing from this schema tree.
import { offeredRoundsOf } from '@/lib/pageBuilder/chosenRounds';

/**
 * §5.4 DYNAMIC sections (MVP — 4). These render live upstream data (courses,
 * schedules, bundles) at request time — the schema only bounds the QUERY
 * config, never the fetched data. The actual fetch + render is Phase 2.
 */

export const DYNAMIC_TYPES = [
  'course_selector', 'course_list', 'course_schedule', 'bundle_courses',
  // A bundle promotion, as one section: its own name, prices, discount code and
  // an ordered list of course+round items. DYNAMIC because it resolves courses
  // AND their rounds at render time, which is what this category's header
  // already names ("courses, schedules, bundles"). Deliberately NOT Advanced —
  // that is the one developer-gated category, and marketing authors these.
  'promotion_bundle',
];

// Admin picks a fixed set of courses to offer as a selector.
const courseSelectorContent = z.object({
  courseIds: z.array(z.string()).default([]),
  heading:   z.string().default(''),
}).passthrough();

// A list of courses. THREE sources (2C.2b widened the enum):
//   'manual'  — an AUTHORED reference: explicit `courseIds`, known at edit time,
//               so the canvas renders the REAL courses (2C.2a).
//   'skill'   — DERIVED: every public course under the skill id in `filter`.
//   'program' — DERIVED: every public course under the program id in `filter`.
// The derived sources are evaluated on the SERVER, at render time
// (listPublicCourses({skill|program})), so the published set is a function of
// when the page was last RENDERED — not of when it is viewed. Both public
// surfaces are ISR at `revalidate = 3600`, so that is up to an hour behind and
// is the same render for every visitor inside the window (round 63 §A.2; the
// editor's own label used to overstate this and was corrected with it). The
// canvas can only show an edit-time SAMPLE the published page won't match. That
// is the labelled exception argued in docs/page-builder-status.md §2C.2b (the
// Browser-pass-#2 precedent): the sample is honest ONLY because the editor labels
// it. `filter` is honoured only for the derived sources; `courseIds` only for
// 'manual'. The enum was narrowed to ['manual'] at 2C.2a so an unhonoured source
// couldn't be SET; 2C.2b honours 'skill'/'program', so widening is now correct.
// DB scan before this pass: 0 stored course_list sections, so nothing to migrate
// (widening is additive regardless — it can reject no stored doc).
const courseListContent = z.object({
  source:    z.enum(['manual', 'skill', 'program']).default('manual'),
  courseIds: z.array(z.string()).default([]), // honoured for source='manual'
  filter:    z.string().default(''),          // skill-id or program-id, for the derived sources
  limit:     z.number().int().min(0).default(0), // 0 = no cap
}).passthrough();

// Schedule table for a single course (2C.2b). `courseId` is the SHORT course code
// (e.g. MSE-AI), same author-facing convention as course_card — the resolver
// turns it into the MSDB ObjectId /schedules needs (§4.7 quirk at the edge).
// Its rows are derived at RENDER time (upcoming, open/nearly_full), bounded by
// the page's own 1-hour ISR window rather than by the visitor's clock, so it is
// canvas-FAKE like the derived course_list: the editor labels the sample. `limit`
// caps the number of upcoming sessions shown (0 = adapter default), honoured in
// resolveSectionData.
/**
 * ── ROUND 64: TWO MODES, AND WHY THE COUNT STAYS ───────────────────────────
 *
 * `source` says how the rows are CHOSEN, and it deliberately reuses the key name
 * and the word `course_list` already uses above, because 'manual' means the same
 * thing on both: the author named them.
 *
 *   'upcoming'  DERIVED — every upcoming round for the course, capped by
 *               `limit`. A STANDING instruction: it stays correct forever with
 *               no author intervention.
 *   'manual'    AUTHORED — exactly the rounds named in `roundIds`, in that
 *               order. A SNAPSHOT instruction: round 63 §A.5 measured a 51-day
 *               median to a round's first day, so a selection decays and has to
 *               be revisited.
 *
 * Both are wanted and the count is NOT being replaced (round 63 §E): of the
 * three `course_schedule` sections stored when this was measured, TWO carry
 * `limit: 1` — "show the next round" — and that is also precisely what round
 * 58's unbuilt `course_card.showRounds` needs. Deleting the count would orphan
 * it.
 *
 * Reusing the key `source` costs nothing elsewhere: `dataRefSignature` already
 * reads `c.source ?? ''` for EVERY data-backed type, this one included, so the
 * canvas already refetches when it changes and lib/pageBuilder/dataRefs.js does
 * not move. A new key name would have needed a line there.
 *
 * ── ABSENT MEANS 'upcoming', AND THAT IS THE WHOLE MIGRATION ───────────────
 * A `.lean()` read applies no Mongoose defaults and JSON drops `undefined`, so
 * every section stored before this field existed reads it back ABSENT — not as
 * its default (round 39, re-proved round 50). None of the stored three carries
 * `source`, so all three take the unchanged path. There is no backfill and no
 * write. Readers must test `=== 'manual'`, never `!== 'upcoming'`.
 *
 * `limit` is honoured ONLY under 'upcoming'. Under 'manual' the author has named
 * the rows, so a leftover cap must not silently shorten their list —
 * `assembleResolved` skips the slice there. The stored value is KEPT rather than
 * cleared so switching mode and back is lossless.
 *
 * ── WHAT A SNAPSHOT MAY REMEMBER, ENFORCED BY THE SCHEMA ───────────────────
 * `roundSnapshots` is the sidecar that lets the page still DRAW a chosen round
 * MSDB no longer returns — the author's rule: a chosen round is never silently
 * dropped. It is read ONLY for an id the live fetch did not return, never
 * beside it, so it cannot disagree with live data (round 63 §C.3). That is what
 * answers the "a stored copy goes stale invisibly" objection: 39 of 88 rounds
 * had their dates mutated in place, and every one of those rounds is still LIVE,
 * so the correction shows immediately.
 *
 * It carries `{id, dates, type}` and NOTHING ELSE. Round 63 §C.2: a stored
 * `status` is the seats-left signal, and 'เปิดรับ' on a round that filled is a
 * lie a visitor acts on; a stored `signup_url` is a link to a round that is not
 * there. Both are forbidden — so this one object is NOT `.passthrough()`, which
 * is the only deviation from the file's convention and is the point of it. Zod
 * STRIPS unknown keys by default, so a `status` written into a snapshot is
 * deleted at this boundary and can never reach a renderer. The prohibition is
 * executable rather than written down.
 */
const roundSnapshotShape = z.object({
  id:    z.string().default(''),
  dates: z.array(z.string()).default([]),
  type:  z.string().default(''),
}); // NOT .passthrough() — see above; the strip IS the guard.

const courseScheduleContent = z.object({
  courseId: z.string().default(''),
  limit:    z.number().int().min(0).default(0),
  source:   z.enum(['upcoming', 'manual']).default('upcoming'),
  roundIds: z.array(z.string()).default([]),          // honoured for source='manual'
  roundSnapshots: z.array(roundSnapshotShape).default([]),
}).passthrough();

// The courses that make up a bundle promo.
//
// ── MEASURED BEFORE `promotion_bundle` SHIPPED BESIDE IT ────────────────────
// scripts/_measure-bundle-courses-stored.mjs, run against 9exp_genesis over all
// three places a page's sections live: FOUR stored occurrences, all of them the
// SAME section — one live copy, its draft, and two version snapshots — on one
// published page (`expo002`). Its `courseIds` is `["MSE-L1","MSE-L1","MSE-L1"]`:
// one course code three times, which is a placeholder rather than a bundle.
//
// So this type is at near-zero real use, and the two types coexisting costs
// almost nothing today. Retiring it (round 80's RETIRED_SECTION_TYPES: stays in
// the union, stays renderable, leaves the picker) is a cheap follow-up with that
// count behind it. It is deliberately NOT done here — this round ships a new
// type, and retiring an old one in the same commit would put two decisions
// behind one proof. What IS done here is the labels: see SECTION_LABELS, where
// the two now say which is which rather than leaving an author to guess.
const bundleCoursesContent = z.object({
  courseIds: z.array(z.string()).default([]),
}).passthrough();

/**
 * ── ONE ITEM IN A BUNDLE: ONE COURSE, ONE ROUND OF IT ──────────────────────
 *
 * ── `id` IS REQUIRED, AND IT IS NOT DECORATION ─────────────────────────────
 * The editor draws these as a reorderable list, and ItemList's own safety note
 * (components/pageBuilder/editor/SectionContentEditor.jsx) says exactly when an
 * index key stops being safe: "give a row local state, or an uncontrolled
 * input, and this stops being safe … The items carry no id to key on today, so
 * that would mean adding one." A bundle row holds `CourseSelectPicker`, which
 * DOES carry local state (its direct-entry `typed` box). So an index key here
 * would carry a half-typed course code to the wrong row the moment an author
 * moved an item. This is that id, added on the schema rather than minted in the
 * component, so the stored document carries it and a reload keeps the identity.
 *
 * Minted with `newSectionId()` (lib/pageBuilder/reidSection.js). That is the
 * section-id minter and the name says so; it is reused rather than twinned
 * because what it does is mint a UUID with a non-secure-context fallback, and a
 * second minter for one job is the drift this repo keeps removing.
 *
 * `reidSection` does NOT re-id these on a duplicate, and must not start. An
 * item id is scoped to its SECTION, and a duplicate gets a fresh section id — so
 * the pair stays unique without touching the items. (Contrast `advanced.
 * sectionId`, which reidSection DOES clear, because that one is a DOM id and
 * therefore page-scoped.)
 *
 * ── WHAT ROUND B MUST KEY ON, WRITTEN WHERE ROUND B WILL READ IT ───────────
 * A quotation request records which bundle it was for. It must key on
 * **(pageId, sectionId)** — never on sectionId alone, and never on an item id
 * alone.
 *
 * A section id is unique WITHIN A PAGE, not globally, and that is by design
 * rather than by accident: `duplicatePageBuilderPage` (lib/actions/
 * pageBuilder.js) strips `_id`, `draft`, `slugHistory`, `preview`,
 * `publishedVersion` and the Cloudinary ownership tokens, and deliberately KEEPS
 * the section ids — `stripImageOwnership` is documented as "the ownership half
 * of a copy, for callers that keep ids". So duplicating a promotion page mints
 * two bundles carrying the same section id, and a quotation keyed on that id
 * alone could not say which page it came from.
 *
 * Every OTHER path preserves a section id unchanged — verified across
 * addSection, updateSection, reorderSections, saveDraftContent,
 * publishPageStatus's draft promotion and the version-restore path — so the pair
 * is stable for the life of the section. `duplicateSection` mints a new id, for
 * the copy only, which is correct.
 *
 * ── THE ROUND, AND ITS SNAPSHOT ────────────────────────────────────────────
 * `roundId` is the MSDB schedule `_id`. `roundSnapshot` is the sidecar that lets
 * the page still DRAW a round MSDB no longer returns, and it REUSES
 * `roundSnapshotShape` above verbatim — same three keys, same deliberate absence
 * of `.passthrough()`. Read that shape's note: a stored `status` is the
 * seats-left signal and would be a lie about a round nobody can fetch, and a
 * stored `signup_url` is a link to a round that is not there. Zod strips unknown
 * keys, so writing either into a snapshot deletes it at this boundary. Reusing
 * the shape rather than restating it is what keeps that prohibition executable
 * in both places instead of true in one and remembered in the other.
 *
 * It is `.optional()` rather than defaulted: an item whose round is still live
 * has no need of one, and a `.default({})` would write three empty keys into
 * every item that merely passes through a parse.
 */
/**
 * ── ONE OFFERED ROUND ──────────────────────────────────────────────────────
 *
 * An item now OFFERS several rounds and the applicant picks one, so what used
 * to be `roundId` + `roundSnapshot` on the item is a list of these.
 *
 * `snapshot` REUSES `roundSnapshotShape` verbatim — same three keys, same
 * deliberate absence of `.passthrough()`, same prohibition on storing a
 * `status`. Read that shape's note: a stored status would be a lie about a
 * round nobody can fetch, and it matters more now than it did, because the
 * pick rules ask about status on every render. `bundleRoundChoice` takes its
 * status from the LIVE row only and treats a round with no live row as closed;
 * a snapshot that could carry one would be a second, stale answer.
 *
 * ── `pickUntil`: THE AUTHOR'S OWN CUT-OFF, AND ONLY EVER EARLIER ──────────
 * `YYYY-MM-DD`, regex-validated, optional. Absent means the round closes the
 * day before it starts, which is the structural rule and the default.
 *
 * It can only ever close a round SOONER. A value later than the day before the
 * round's first day is refused by the editor at the field and by
 * `publishBlockers` at publish — and clamped at READ by
 * `effectivePickDeadline`, so the rule holds even for a document nobody's
 * editor ever touched. Nothing is silently rewritten; the stored string stays
 * as the author typed it.
 *
 * `.optional()` with no default, the shape every other optional key in this
 * file uses, and for the stated reason: a `.default('')` would write the key
 * into every offered round that merely passes through a parse.
 */
const bundleOfferedRoundShape = z.object({
  id:       z.string().min(1),
  snapshot: roundSnapshotShape.optional(),
  pickUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ต้องเป็นวันที่แบบ YYYY-MM-DD').optional(),
}); // NOT .passthrough() — closed, like the item and the snapshot.

/**
 * ── THE ITEM, AND THE LEGACY KEY IT MUST STILL READ ───────────────────────
 *
 * `rounds` replaces `roundId` + `roundSnapshot`. The editor writes the new
 * shape only; the preprocess below is what lets the 91 items already stored
 * (MEASURED across all three places a page's sections live — every one of them
 * on the legacy shape, zero on the new one) keep rendering and registering.
 *
 * ── WHY A `z.preprocess` AND NOT A `.transform` OR A READ-SITE FALLBACK ───
 * This object is CLOSED — no `.passthrough()` — so Zod strips `roundId` and
 * `roundSnapshot` at the parse boundary. A `.transform` runs AFTER that strip
 * and would find them already gone; a fallback at each read site would be the
 * same rule written four times (renderer, resolver, request guard, route).
 * `z.preprocess` is the one hook that sees the raw document, so the
 * normalisation happens exactly once, before anything can read an item.
 *
 * It does NOT write: parsing a legacy document hands the readers the new shape
 * while the stored bytes stay legacy until an author saves that section. So
 * this is not a migration, and there is no migration to run.
 *
 * The legacy item carried no `pickUntil`, so the normalised round has none —
 * which means it closes the day before it starts, exactly the behaviour the
 * legacy card already had (`chooseItemRound` + the `started` test).
 */
const bundleItemShape = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    // ONE definition, shared with every READER. `offeredRoundsOf` is in
    // chosenRounds.js and its note explains why both moments are needed:
    // nothing parses on read, so the preprocess alone would normalise for
    // saves and leave every public surface looking at a legacy item.
    //
    // An item the author never finished yields an EMPTY list rather than a
    // round with an empty id, which `min(1)` would refuse.
    return { ...raw, rounds: offeredRoundsOf(raw) };
  },
  z.object({
    id:       z.string().min(1),
    courseId: z.string().default(''),
    // Capped at 12. A list an author has to scroll is a list they cannot check,
    // and the applicant's control is a single select per course.
    rounds:   z.array(bundleOfferedRoundShape).max(12).default([]),
  }), // NOT .passthrough() — an item's shape is closed; see roundSnapshotShape.
);

/**
 * ── `promotion_bundle` — ONE BUNDLE, AS A SECTION ──────────────────────────
 *
 * 9Expert runs bundle promotions: one page carries several bundles, each a
 * handful of courses at a package price. They were hand-written HTML inside one
 * Advanced HTML page, so every price, date and link was typed by hand.
 *
 * A SECTION, not a collection, and that is the load-bearing choice: a bundle's
 * data lives in `content`, so it inherits the draft/publish split, the version
 * history, the ordering and the duplication that sections already have. Several
 * bundles on one page are several sections rather than a linkage table. One page
 * still produces ONE card on /promotions — nothing here touches the grid, the
 * loader or `promotionOrder`.
 *
 * The same course+round may appear in more than one bundle on the same page.
 * There is deliberately NO uniqueness rule: two bundles overlapping is normal.
 *
 * ── EVERY DEFAULT HERE IS FREE, AND SAYING SO SAVES THE NEXT READER ────────
 * Rounds 39, 50, 57 and 69 each argue at length about what an ABSENT key must
 * mean, because `.lean()` applies no Mongoose defaults and JSON drops
 * `undefined` — so a field ADDED to an existing type reads back absent on every
 * document stored before it, and absent has to mean the incumbent or a published
 * page changes with nobody having touched it.
 *
 * None of that applies to this schema. `promotion_bundle` is a NEW type: zero
 * documents exist, so there is no incumbent to preserve and no reading of absent
 * that can change what a stored page renders. The defaults below are chosen for
 * what a NEW bundle should start as, and nothing else. (The moment a field is
 * added to THIS type in a later round, the usual rule is back in force.)
 *
 * ── PRICES ARE INTEGER BAHT, AND `null` IS NOT `0` ────────────────────────
 * What the codebase already does: `EarlyBirdConfig.special_price` is a Number in
 * whole baht, and upstream `course_price` is a number-or-numeric-string in whole
 * baht. No satang anywhere in this repo, and no float. `price_card.price` is a
 * STRING deliberately ("may carry '฿12,900' / 'สอบถาม'") and is the wrong
 * precedent here: a string cannot be divided, and the discount percentage is
 * DERIVED from these two rather than stored.
 *
 * `null` and `0` are different facts and the schema keeps them apart: `0` is a
 * real price (free), `null` is "not set yet". Collapse them and an unpriced
 * bundle renders a percentage computed from a zero.
 *
 * NOT COERCED FROM A STRING, on purpose. A `z.coerce.number()` here would
 * silently accept an editor that forgot to parse its own input, and the bug
 * would surface much later as a page whose percentage is wrong. Strict means an
 * editor bug fails loudly at the save that introduced it. The editor's job is
 * the '' → null conversion; see the promotion_bundle content editor.
 *
 * ── WHY THE net > list CHECK IS NOT A `.refine()` HERE ─────────────────────
 * It would be the obvious place and it is the wrong one. This content is
 * validated inside `draftContentSchema` on EVERY autosave, and a failure comes
 * back as a save-error banner for the WHOLE PAGE. So an author who types the net
 * price before the list price would have a page that cannot autosave at all
 * while they are mid-edit — the wipe-on-unrelated-edit class this repo keeps
 * fighting, arriving through the front door.
 *
 * The refusal lives in the two guards that already exist instead: the editor
 * warns at the field, synchronously (the CourseIdsWarnings posture — warn, never
 * edit), and `publishBlockers` (lib/pageBuilder/publishReadiness.js) refuses the
 * PUBLISH. That one returns [] for draft/closed/archived, so a half-typed bundle
 * saves freely and a wrong one cannot go public.
 */
/**
 * ── THE BLURB'S RICH-TEXT TWIN, DECLARED AND RESTRICTED ───────────────────
 *
 * `blurbDoc` is the Tiptap document the staging editor writes; `blurb` stays a
 * plain string and is its plain-text twin. The reasoning for two fields rather
 * than one typed field is in lib/bundle/blurb.js and it is operational: the
 * production branch reads `content.blurb` in five places that THROW, print
 * `[object Object]`, or lock the section out of its own editor when it is not
 * a string, and the two branches share one MongoDB.
 *
 * ── WHY THE SHAPE IS SPELLED OUT RATHER THAN `z.any()` ────────────────────
 * Because this schema is what `updateSection` re-parses the whole merged
 * section against, so it is the last place a malformed doc can be refused
 * before it is stored. A permissive `z.record(z.any())` would accept a
 * heading, a table or a `javascript:` link and leave the narrowing entirely to
 * render time — which is the "looks right in the editor, publishes wrong"
 * failure the rich-text contract file exists to prevent.
 *
 * The node and mark sets are the ones lib/bundle/blurb.js enforces:
 * paragraph / text / hardBreak, with bold / italic / link. They are spelled
 * HERE rather than imported from that module because a schema file importing a
 * renderer-side helper is a cycle risk this tree avoids by convention, and
 * because the two agreeing is asserted by test rather than by sharing a list.
 *
 * `.optional()` with NO default, deliberately. A default would stamp an empty
 * doc onto every bundle section that has never had one — including the ones a
 * production admin saves, where the key would then appear from nowhere. Absent
 * must stay absent, and `resolveBlurbForRender` reads absent as "use the
 * string".
 *
 * Read by: lib/bundle/blurb.js's `resolveBlurbForRender`, through the card's
 * sub-line and the quotation page's header. NOT read by corpus/promotions.js,
 * sectionLabels.js or `sectionRendersEmpty` — those keep reading the
 * always-string `blurb`, which is the point of the arrangement.
 */
const blurbMarkShape = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  /*
    The href is NOT validated against the protocol allowlist here. `safeUrl`
    lives on the render side and this file must stay free of that import; the
    sanitiser strips an unsafe mark on the way in to storage AND on the way out
    to the renderer, so a hand-edited document carrying one renders as plain
    text rather than as a live link. What the schema buys is the SHAPE.
  */
  z.object({ type: z.literal('link'), attrs: z.object({ href: z.string() }).passthrough() }),
]);

const blurbInlineShape = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string(),
    marks: z.array(blurbMarkShape).optional(),
  }),
  z.object({ type: z.literal('hardBreak') }),
]);

export const blurbDocShape = z.object({
  type: z.literal('doc'),
  content: z
    .array(z.object({
      type: z.literal('paragraph'),
      content: z.array(blurbInlineShape).optional(),
    }))
    .default([]),
});

const promotionBundleContent = z.object({
  name:  z.string().default(''),   // read by: the renderer's heading; the editor's ชื่อแพ็กเกจ field
  /*
    A STRING, AND IT MUST STAY ONE. See blurbDocShape above and
    lib/bundle/blurb.js: production reads this field and breaks on anything
    else. No path on staging may write an object here — the editor writes it
    through `blurbPatch`, which derives it from the doc's plain text.
  */
  blurb: z.string().default(''),   // read by: the renderer's sub-line, the corpus, sectionLabels, the editor's คำโปรย field
  blurbDoc: blurbDocShape.optional(),

  /**
   * The SHORT label — the dark pill above the headline, and the word inside the
   * course-list heading. Read by: the renderer's pill, the renderer's
   * หลักสูตรที่ร่วมรายการ heading, and the editor's ป้ายสั้น field.
   *
   * ── A SECOND FIELD, NOT A SLICE OF `name` ──────────────────────────────────
   * `name` is the headline — "ดีลสุดคุ้ม! จับคู่ 2 คอร์ส …" — and a pill reading
   * the first N characters of that is not a label, it is a truncation. This is
   * what the author TYPES, and it is theirs: two bundles on one page may be
   * "Bundle 1" and "แพ็กเกจ Pro" and neither is derivable from the other.
   *
   * NOT DERIVED FROM POSITION either. "Bundle 1" looks like an index and is
   * not one: reordering the sections must not silently rename them, and an
   * author who wants the second bundle called "Bundle 1" is allowed to.
   *
   * ── IT DRAFTS BY CONTAINMENT — THERE IS NO SIDE TO ASSIGN ──────────────────
   * A reader arriving here from `DRAFT_CONTENT_KEYS` will look for this key in
   * that list and not find it. That is correct and not an omission: that list
   * names PAGE-level keys of `pageBuilderSchema`, and `sections` is already one
   * of them, so everything inside a section's `content` inherits the draft /
   * publish split by containment. The exact-set test in test/pure/draftState
   * partitions page keys and will never see this one. Editing either would be
   * the mistake.
   *
   * ── THE DECLARATION BUYS A DEFAULT AND A READER, NOT STORABILITY ───────────
   * This object ends in `.passthrough()`, so an undeclared key an editor writes
   * would already survive validation and persist. What declaring it adds is the
   * `''` default, a place to state the reasoning, and — the reason this repo
   * insists — a NAMED READER. A key nothing reads is the thing the rule is
   * against, and `.passthrough()` is exactly why that rule cannot be enforced
   * by the schema alone.
   *
   * DELIBERATELY ABSENT FROM `sectionRendersEmpty`'s bundle branch — see the
   * note there. A label alone is not an authored bundle.
   */
  label: z.string().default(''),

  // Read by: the renderer's struck-through / large price, bundlePricing's
  // discountPercent, and publishBlockers' net-above-list refusal.
  listPrice: z.number().int().min(0).nullable().default(null), // ราคาปกติ
  netPrice:  z.number().int().min(0).nullable().default(null), // ราคาสุทธิ

  discountCode: z.string().default(''),  // read by: the renderer's code chip + its copy button

  /**
   * Closes THIS BUNDLE'S registration only.
   *
   * ── THE CAVEAT THIS NOTE CARRIED IS RETIRED, NOT FORGOTTEN ──────────────
   * It used to say the switch must NOT affect the per-course ลงทะเบียน buttons
   * in the item cards, because those pointed at ordinary rounds through
   * `scheduleRegistrationHref` and a promotion being over does not close a
   * course's rounds. Two kinds of button in one component, with only a comment
   * and a test keeping them apart.
   *
   * THOSE BUTTONS WERE REMOVED — a panel selling a package should not offer a
   * cheaper-looking path to one course of it. The cards now carry a single link
   * each, to a course DETAIL page, which is not a registration affordance in
   * any state. So there is no longer a second thing for this switch to reach,
   * and the rule has become the plain reading of its own name.
   *
   * When closed the bundle STAYS VISIBLE with its button replaced by a state
   * message. Hiding it would read as a broken page to anyone holding a link.
   *
   * Read by: the renderer (button vs state message).
   */
  registrationOpen: z.boolean().default(true),

  /**
   * ── คอร์สต่อเนื่อง: THE ITEMS' ORDER BECOMES THE LEARNING ORDER ─────────
   *
   * Off by default. On, the applicant picks rounds in item order and each
   * course's round must START strictly after the previous course's round ENDS
   * — so the order of `items` stops being presentation and becomes a rule.
   *
   * NO SEPARATE ORDER FIELD, deliberately. The editor already has move up/down
   * on the item rows, so the author sets the order the same way whether this is
   * on or off, and there is no second ordering to keep in step with the first.
   * Turning the switch on cannot reorder anything, which is why it is safe to
   * flip on an existing bundle.
   *
   * `.default(false)` is safe HERE in a way it would not be inside `items`:
   * this is one key on the section's own content, and `promotionBundleContent`
   * is the type whose note above explains why defaults are chosen for what a
   * new bundle should start as. A stored bundle reads it back absent, which is
   * `false`, which is the behaviour it has today.
   *
   * Read by: `bundleRoundChoice`'s `sequential` argument (via the renderer, the
   * wizard and the registration route), the renderer's order labels, and the
   * editor's switch.
   */
  sequential: z.boolean().default(false),

  items: z.array(bundleItemShape).default([]),  // read by: the renderer's item cards; the resolver; the editor's list
}).passthrough();

export const dynamicSectionSchemas = [
  defineSection('course_selector',  courseSelectorContent),
  defineSection('course_list',      courseListContent),
  defineSection('course_schedule',  courseScheduleContent),
  defineSection('bundle_courses',   bundleCoursesContent),
  defineSection('promotion_bundle', promotionBundleContent),
];
