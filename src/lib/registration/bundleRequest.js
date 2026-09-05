import { slotsOf } from '@/lib/pageBuilder/containerSlots';
import { isPubliclyVisible } from '@/lib/pageBuilder/visibility';
import { isBundleRegistrationOpen } from '@/lib/pageBuilder/bundleRegistration';
import { chooseItemRound } from '@/lib/pageBuilder/chosenRounds';

/**
 * CAN THIS (pageId, sectionId) PAIR BE REGISTERED FOR? The whole refusal, pure.
 *
 * ══ THE PAIR IS USER INPUT AND IS TREATED AS NOTHING ELSE ═══════════════════
 *
 * It arrives in a URL, which means a bookmark, a forwarded message, a hand-
 * edited query string, or a link that was correct when it was sent and is not
 * any more. So the pair is used ONLY as a lookup key: nothing about the bundle
 * is read from the link, and everything — the name, the courses, the rounds,
 * the prices, whether registration is open at all — is re-derived from the
 * stored page every time the form is opened and again when it is submitted.
 *
 * ── (pageId, sectionId), NEVER sectionId ALONE ────────────────────────────
 * A section id is unique WITHIN A PAGE and not globally, by design:
 * `duplicatePageBuilderPage` strips `_id`, `draft`, `slugHistory`, `preview`
 * and `publishedVersion` and deliberately KEEPS the section ids. So duplicating
 * a promotion page mints two bundles carrying the same section id, and a
 * quotation keyed on that id alone could not say which page it came from. The
 * schema note on `bundleItemShape` states this at the authoring end; this is
 * the reading end it was written for.
 *
 * ══ WHY THE WHOLE REQUEST IS REFUSED, NOT THE BAD ITEM ══════════════════════
 *
 * A bundle states ONE PACKAGE PRICE COMPUTED OVER N NAMED COURSES. The renderer
 * keeps an unresolvable item on the page, marked amber, precisely because
 * dropping it would leave that price describing N−1 courses — wrong in a way no
 * reader can detect. The same fact makes a PARTIAL quotation worse than none: a
 * request the sales team cannot price, for a package the site cannot name, is
 * not a lead, it is a support call.
 *
 * So the refusal is total, and it is the same refusal for one bad item as for
 * five. `unresolvedBundleItems` returns them all rather than the first, because
 * the author fixing them wants the list.
 *
 * ══ THE REFUSAL REASONS, AND WHAT EACH ONE IS FOR ═══════════════════════════
 *
 * Three of them are NOT SPOKEN — the pair names nothing that ever existed, and
 * there is no true sentence to say to a visitor about it:
 *
 *   page_missing      no page with that _id
 *   section_missing   no section with that id on it
 *   wrong_type        that section id is not a promotion_bundle
 *
 * Two of them ARE spoken, and they are deliberately different sentences:
 *
 *   closed            the author turned this bundle's registration off. Final
 *                     for this promotion. BUNDLE_CLOSED_MESSAGE — the same
 *                     string the section itself renders in place of its button,
 *                     so the page and the form cannot say two things.
 *
 *   unavailable       the bundle is not closed, but the site cannot assemble
 *                     it: the page is unpublished / expired / not yet live, the
 *                     section is disabled, or an item's course or round no
 *                     longer resolves. A fault on our side, possibly fixed
 *                     within the hour. BUNDLE_UNAVAILABLE_MESSAGE.
 *
 * `page_not_public`, `section_disabled` and `unresolved_items` are three
 * distinct reasons that all SPEAK as `unavailable`. They are kept apart in the
 * return value rather than collapsed, because the admin side has to be able to
 * tell them apart — see docs/ticket-bundle-unavailable-invisible.md, which
 * files the fact that today nothing tells an author their bundle has stopped
 * accepting registrations.
 *
 * ══ ORDER MATTERS, AND IT IS THE CHEAPEST-TRUEST FIRST ══════════════════════
 *
 * Existence, then visibility, then the switch, then the items. `closed` is
 * checked BEFORE the items so a bundle an author deliberately retired says so,
 * rather than reporting that one of its rounds has rolled off — which is true,
 * uninteresting, and the wrong thing to tell a visitor about a finished
 * promotion.
 *
 * ══ PURE ═══════════════════════════════════════════════════════════════════
 * No db, no fetch, no clock. The page document, the resolved entries and
 * `todayKey` all arrive as arguments, for the reason `chooseRounds` gives:
 * there is exactly one module in this repo that decides what day it is in
 * Asia/Bangkok, and a second clock read here could disagree with the renderer's
 * across a midnight boundary — putting a round in `elapsed` for the form and
 * `live` for the page.
 */

/** Every reason this module can refuse for. The one enumeration. */
export const BUNDLE_REFUSAL_REASONS = Object.freeze([
  'page_missing',
  'section_missing',
  'wrong_type',
  'page_not_public',
  'section_disabled',
  'closed',
  'unresolved_items',
]);

/**
 * The reasons that have nothing true to say to a visitor, and therefore 404.
 *
 * Frozen and exported because the ROUTE reads it to choose between `notFound()`
 * and a spoken page — the mapping is a property of the reason, not of the
 * route, and a route deciding it by hand is how one of these ends up rendering
 * "ปิดรับสมัครแล้ว" for a section id that never existed.
 */
export const SILENT_REFUSALS = Object.freeze(['page_missing', 'section_missing', 'wrong_type']);

/** Does this reason 404, rather than speak? */
export function isSilentRefusal(reason) {
  return SILENT_REFUSALS.includes(reason);
}

/**
 * The section with this id, anywhere in the tree, or null.
 *
 * ── IT WALKS CONTAINER SLOTS, AND THAT IS NOT DEFENSIVE ──────────────────
 * A `promotion_bundle` inside a `two_column` is an ordinary way to lay a
 * promotion page out, and `publishBlockers` already walks for exactly this
 * reason. A top-level-only lookup would 404 a link the page itself rendered —
 * the worst of both, since the button would be there and the form would deny
 * the bundle exists.
 *
 * `slotsOf` is imported rather than restated: one definition of what a
 * container holds, or the two walks find different sections.
 */
export function findSectionById(sections, sectionId) {
  const wanted = String(sectionId ?? '');
  if (!wanted) return null;

  const walk = (arr) => {
    for (const s of Array.isArray(arr) ? arr : []) {
      if (!s || typeof s !== 'object') continue;
      if (String(s.id ?? '') === wanted) return s;
      const slots = slotsOf(s.type);
      if (slots) {
        for (const slot of slots) {
          const hit = walk(s.content?.[slot]);
          if (hit) return hit;
        }
      }
    }
    return null;
  };

  return walk(sections);
}

/**
 * The items this bundle cannot presently state, with the reason for each.
 *
 * @param {Array<object>} items    `content.items`, as authored
 * @param {Array<object>} resolved the parallel entries from `assembleResolved`
 *   — same length, same order, one per item. `undefined`/`[]` means the fetch
 *   has not landed or resolved nothing, and EVERY item is then unresolvable,
 *   which is the correct answer: a form that cannot name one course of the
 *   package must not take a request for it.
 * @param {string} todayKey Asia/Bangkok `YYYY-MM-DD`, from `siteTodayKey()`
 * @returns {Array<{index: number, courseId: string, why: string}>}
 */
export function unresolvedBundleItems(items, resolved, todayKey) {
  const list = Array.isArray(items) ? items : [];
  const entries = Array.isArray(resolved) ? resolved : [];
  const out = [];

  list.forEach((item, index) => {
    const entry = entries[index] ?? null;
    const courseId = String(entry?.courseId ?? item?.courseId ?? '').trim();

    // No course code at all, or a code the catalogue no longer returns. The
    // renderer draws the amber marked row for both; neither can be quoted.
    if (!courseId) {
      out.push({ index, courseId: '', why: 'no_course' });
      return;
    }
    if (!entry?.course) {
      out.push({ index, courseId, why: 'course_unresolved' });
      return;
    }

    /**
     * `chooseItemRound` and not a local `rounds.find(...)`: it is the one place
     * the live / elapsed / missing split and the snapshot fallback are decided,
     * and its own header says a hand-rolled lookup here would lose both. This
     * guard has to agree with what the page DREW, or a visitor sees a dated
     * round on the card and is refused for not having one.
     */
    const round = chooseItemRound(entry.rounds, item, todayKey);
    if (!round) {
      // The author never chose a round for this item — a claim about the
      // document, not about upstream.
      out.push({ index, courseId, why: 'no_round' });
      return;
    }
    if (round.state !== 'live') {
      // `elapsed` (it has begun) or `missing` (withdrawn upstream). Either way
      // there is no round to book, and the snapshot can draw a date but cannot
      // hold a seat.
      out.push({ index, courseId, why: `round_${round.state}` });
    }
  });

  return out;
}

/**
 * Resolve the pair, or say why not.
 *
 * `resolved` and `todayKey` are OPTIONAL. Omitting them runs every check
 * except the item pass, which is what the link-time guard wants before it has
 * paid for a fetch: a closed or unpublished bundle is refused without any
 * upstream call at all. The form's own render passes both, and so does the
 * submit — the item pass is re-run on submission because a round can roll off
 * between opening the form and sending it.
 *
 * @returns {{ok: true, section: object, content: object}
 *          |{ok: false, reason: string, unresolved?: Array<object>}}
 */
export function resolveBundleRequest({ page, sectionId, resolved, todayKey, now = Date.now() }) {
  if (!page) return { ok: false, reason: 'page_missing' };

  const section = findSectionById(page.sections, sectionId);
  if (!section) return { ok: false, reason: 'section_missing' };
  if (section.type !== 'promotion_bundle') return { ok: false, reason: 'wrong_type' };

  /**
   * `isPubliclyVisible` — the ONE definition, shared with the public route and
   * the publish dialog. Not restated: a second copy here would be a form that
   * accepts registrations for a page the route 404s, which is the same class of
   * silent disagreement that function's own header exists to close.
   *
   * It is checked AFTER the section lookup on purpose. A pair naming a section
   * that does not exist is a bad link whatever the page's status is, and
   * `notFound()` is the honest answer to it; reporting "temporarily
   * unavailable" for a section id nobody ever authored would send the visitor
   * to ring the sales team about a bundle that never existed.
   */
  if (!isPubliclyVisible(page, now)) return { ok: false, reason: 'page_not_public' };

  /**
   * A disabled section draws NOTHING — `SectionRenderer` returns null before it
   * reaches a component. So the page shows no button, and without this line a
   * stale link would still reach a form for a bundle the author has hidden.
   * The renderer's guard is not reachable from here; this is the same rule
   * applied at the other end.
   */
  if (section.enabled === false) return { ok: false, reason: 'section_disabled' };

  const content = section.content ?? {};

  // Before the items, deliberately — see the order note in the header.
  if (!isBundleRegistrationOpen(content)) return { ok: false, reason: 'closed' };

  if (resolved !== undefined) {
    const unresolved = unresolvedBundleItems(content.items, resolved, todayKey);
    if (unresolved.length) return { ok: false, reason: 'unresolved_items', unresolved };
  }

  /**
   * A bundle with NO items is refused as well, and through the same door. An
   * empty package has no courses to attend and no basis for its price; the
   * renderer will happily draw the panel (it fails closed only on
   * nothing-at-all), so this is the only thing standing between an author
   * mid-edit and a quotation request for nothing.
   */
  if (!Array.isArray(content.items) || content.items.length === 0) {
    return { ok: false, reason: 'unresolved_items', unresolved: [] };
  }

  return { ok: true, section, content };
}
