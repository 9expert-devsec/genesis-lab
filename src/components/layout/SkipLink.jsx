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
 * ── LOOKS ───────────────────────────────────────────────────────────────────
 * `sr-only` until focused, then a solid 9e-action button pinned top-left. Its
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
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-80 focus:whitespace-nowrap focus:rounded-9e-sm focus:bg-9e-action focus:px-5 focus:py-2.5 focus:font-thai focus:text-base focus:font-medium focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-9e-navy focus:ring-offset-2 focus:ring-offset-white"
    >
      ข้ามไปยังเนื้อหา
    </a>
  );
}
