/**
 * "Skip to content" — the first thing a keyboard user reaches on every public
 * page (WCAG 2.4.1, Bypass Blocks).
 *
 * ── WHERE IT IS MOUNTED, AND WHY THREE TIMES ────────────────────────────────
 * FIRST child of (public)/layout.jsx, of Home's fragment (src/app/page.jsx — it
 * sits outside the (public) group, so it does not inherit that layout), and of
 * src/app/not-found.jsx (which replaces the group layout on a 404). It must come
 * BEFORE TopNotificationBar: that bar carries a link and a close button, and
 * anything focusable ahead of this takes the first Tab from it. Not on /admin.
 *
 * ── THE TARGET ──────────────────────────────────────────────────────────────
 * `#main` — every one of those three renders `<main id="main" tabIndex={-1}>`.
 * The tabIndex is what makes focus actually MOVE there when this is activated
 * (Safari only scrolls to a fragment otherwise, leaving focus on the link), and
 * those mains suppress their own focus ring so the whole page is not outlined.
 *
 * ── REVEALED ON :focus-visible, NEVER ON PLAIN :focus ───────────────────────
 * After a client-side navigation into a new segment, Next moves focus to that
 * segment's first node — which, in Home and the (public) layout, is this link.
 * With `focus:` reveal classes that showed the button after a MOUSE click on
 * the logo (measured: activeElement = this link, :focus true, :focus-visible
 * false, visible at 16,16). The focus itself is right — it is how a screen
 * reader learns the page changed — so it is not blurred; only the paint is
 * keyed to :focus-visible, which the browser grants for keyboard focus (first
 * Tab, or a navigation the keyboard started) and withholds after a click.
 *
 * ── LOOKS ───────────────────────────────────────────────────────────────────
 * `sr-only` until focus-visible, then a solid 9e-action button pinned top-left. Its
 * own background makes it readable over the transparent Home header too; white
 * on #005CFF is 5.3:1. The ring is navy with a white offset so one of the two
 * bands contrasts with whatever is behind it — the white header, the navy hero,
 * or the dark theme.
 *
 * z-80 is the rung the ladder in tailwind.config.js reserved for chrome above
 * the header (60) and the cookie banner (70), and below the overlay tier.
 *
 * Every class is a complete literal: Tailwind scans source text, and a class
 * assembled at runtime emits no CSS.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-80 focus-visible:whitespace-nowrap focus-visible:rounded-9e-sm focus-visible:bg-9e-action focus-visible:px-5 focus-visible:py-2.5 focus-visible:font-thai focus-visible:text-base focus-visible:font-medium focus-visible:text-white focus-visible:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-navy focus-visible:ring-offset-2 focus-visible:ring-offset-white"
    >
      ข้ามไปยังเนื้อหา
    </a>
  );
}
