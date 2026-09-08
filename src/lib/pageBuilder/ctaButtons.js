import { safeUrl } from '@/lib/pageBuilder/safeUrl';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The enum is the schema's, so "is this a style the system
// knows" is asked in exactly one place.
import { BUTTON_STYLES } from '@/lib/schemas/sections/base';

/**
 * `cta` buttons — the list, resolved from a document that may not have one.
 *
 * ── WHY THIS IS A MODULE AND NOT THREE LINES IN THE JSX ──────────────────
 * Two readers need the same answer and they run in different worlds: the
 * server component draws the buttons, and the settings panel decides what to
 * show the author and what to warn about. A rule computed inline in the JSX is
 * a rule the panel cannot import, and this repo has spent several rounds
 * removing exactly that shape (presets.js 2C.3, richTextContract.js).
 *
 * ── THE COMPATIBILITY RULE, AND WHY IT IS A READ AND NOT A MIGRATION ─────
 * Round C turns the fixed primary/secondary PAIR into a list. Every `cta`
 * stored before it reads back with `buttons` ABSENT — not empty, absent —
 * because `.lean()` applies no Mongoose defaults and a JSON round trip drops
 * `undefined`. So ABSENT HAS TO MEAN "what this section already rendered", or
 * every published page changes with nobody touching it.
 *
 * The legacy fields are therefore a READ-COMPATIBILITY PATH, not a second way
 * to author: they stay in the schema, they stay readable, the panel no longer
 * offers them, and nothing writes them again. There is no migration script and
 * there could not be one — the dev database IS production.
 *
 * ── THE CAP IS A UI BOUND AND IS NOT ENFORCED HERE ───────────────────────
 * `MAX_CTA_BUTTONS` stops the editor's add button, and that is all it does.
 * Truncating here would mean a hand-seeded document silently losing a button
 * at render, which is a data rule masquerading as a layout one — see the
 * schema doc block, which makes the same point about not refusing at save.
 */

/** How many buttons the EDITOR will let an author add. A design bound. */
export const MAX_CTA_BUTTONS = 4;

/**
 * The style names a button may name for itself. Anything else is treated as
 * ABSENT rather than passed through, and that distinction is load-bearing:
 * `accentButtonClass` falls back to `primary` for a value it does not know, so
 * a typo'd style on the SECOND button would silently turn it into a second
 * accent fill — the exact thing round 57 argued against. Absent keeps today's
 * cascade; unknown is not a third meaning.
 */
const isKnownStyle = (v) => typeof v === 'string' && BUTTON_STYLES.includes(v);

/**
 * ── THERE IS NO PER-BUTTON `newTab`, AND THAT IS A DECISION ──────────────
 *
 * A first draft of round C carried `newTab` on each button: absent meant
 * "derive from isExternalUrl", present meant the author's answer. Nothing could
 * write it — the schema declared it `.optional()` with no default, the
 * repeater's add button seeded only label/href, and no control offered it — so
 * it was reachable ONLY by writing to the database by hand, which on this
 * system means writing to production. A value that is honoured at render but
 * invisible to the panel is the worst of the three available states: the author
 * cannot see it, cannot explain it, and cannot undo it. So it was removed
 * whole, reads included. A hand-seeded `newTab` is now INERT.
 *
 * Whether a link opens a tab is therefore derived, once, from the href:
 * external opens one, internal does not. That is what every cta has done since
 * there was one button.
 *
 * ── WHAT WOULD REOPEN IT, AND THE MEASUREMENT THAT CLOSED IT ────────────
 * The case for a control is a link the heuristic gets WRONG: a root-relative
 * href that resolves to a FILE rather than a page, which the derivation sends
 * to the same tab because it is internal. That is not hypothetical in general —
 * reference-rewrite converted 1,651 absolute old-server URLs to root-relative,
 * so links that once opened a tab by virtue of being external became internal
 * without an author touching them.
 *
 * MEASURED 2026-09-08, read-only, across page_builder_pages (published and
 * draft) and all 32 page_versions snapshots: 40 cta sections, 76 non-empty
 * hrefs, and **ZERO root-relative hrefs of any kind** — every one is absolute
 * https. So the rewrite did not reach this field, and there is no link on this
 * system the derivation gets wrong.
 *
 * REOPEN IT when that stops being true: a cta button whose href is
 * root-relative AND points at a file (`/sites/default/files/…`, `/legacy-file…`,
 * `/root-file…`, or ending .pdf/.xlsx/.docx/.zip). Re-run that scan before
 * arguing from memory. The shape to build then is a THREE-STATE select
 * (อัตโนมัติ / เปิดแท็บใหม่ / เปิดแท็บเดิม, absent = อัตโนมัติ), because the
 * field has three states and a checkbox has two — and note that the repeater's
 * `select` writes STRINGS, so it needs either a value-mapper in `ItemList` or
 * an enum in the schema, not a bare boolean.
 */

/**
 * One row → a render-ready button, or null when it would draw nothing.
 */
function toRenderable(row) {
  const text = typeof row?.label === 'string' ? row.label.trim() : '';
  const url = safeUrl(row?.href);
  // THE PAIR GUARD, UNCHANGED SINCE THE FIRST BUTTON EXISTED. A label with no
  // href draws nothing rather than a dead button; an href with no label draws
  // nothing rather than an empty one. An unsafe href is the same case as no
  // href — safeUrl already returned null for it.
  if (!text || !url) return null;
  return {
    label: text,
    href: url,
    style: isKnownStyle(row?.style) ? row.style : undefined,
  };
}

/**
 * The buttons a `cta` section renders, in order. Never throws; always an array.
 *
 * `content.buttons` WINS whenever it is a non-empty array, and the legacy
 * fields are then ignored entirely — a document carrying both is one an author
 * edited after round C, and the array is what they edited.
 *
 * A non-empty array whose every row fails the pair guard resolves to zero
 * buttons, which is correct and is NOT the same as falling back to the legacy
 * pair: the author has a list, and the answer for a list of broken rows is "no
 * buttons", not "the two you had in 2025".
 */
export function resolveCtaButtons(content) {
  const list = content?.buttons;
  const rows = Array.isArray(list) && list.length > 0 ? list : legacyPair(content);
  return rows.map(toRenderable).filter(Boolean);
}

/** The legacy pair, in the order the component has always drawn it. */
function legacyPair(content) {
  return [
    { label: content?.buttonLabel, href: content?.buttonHref },
    { label: content?.secondaryButtonLabel, href: content?.secondaryButtonHref },
  ];
}

/**
 * The rows the EDITOR shows — deliberately NOT the same function.
 *
 * The renderer fails closed: a half-filled pair draws nothing. The panel must
 * do the opposite and SHOW that row, because a warning about a row nobody can
 * see is not a warning. If the editor seeded itself from `resolveCtaButtons`,
 * a stored cta with a label and no href would present zero rows and the
 * author's half-filled data would be dropped the first time they touched
 * anything — data loss dressed up as a fail-closed guard.
 *
 * So this keeps any row with EITHER half, and validation lives in the panel.
 * It returns `[]` for a section with nothing at all, so a new cta opens on an
 * empty repeater rather than two blank rows nobody asked for.
 */
export function ctaEditorRows(content) {
  const list = content?.buttons;
  if (Array.isArray(list)) {
    // `newTab` is deliberately NOT carried through — see the decision block
    // above. The key is no longer part of a button's shape, so the editor stops
    // propagating it: a hand-seeded value sits untouched in storage until
    // someone edits that row, and is inert at render either way.
    return list.map((b) => ({
      label: typeof b?.label === 'string' ? b.label : '',
      href: typeof b?.href === 'string' ? b.href : '',
      ...(isKnownStyle(b?.style) ? { style: b.style } : {}),
    }));
  }
  return legacyPair(content)
    .map(({ label, href }) => ({
      label: typeof label === 'string' ? label : '',
      href: typeof href === 'string' ? href : '',
    }))
    .filter((row) => row.label.trim() !== '' || row.href.trim() !== '');
}

/**
 * Does this `cta` draw nothing at all? The one question the structure tree's
 * ว่าง marker and the component's own early return both need, asked once so
 * the marker cannot drift from the render it describes.
 */
export function ctaIsEmpty(content) {
  const heading = typeof content?.heading === 'string' ? content.heading : '';
  const description = typeof content?.description === 'string' ? content.description : '';
  return !heading.trim() && !description.trim() && resolveCtaButtons(content).length === 0;
}
