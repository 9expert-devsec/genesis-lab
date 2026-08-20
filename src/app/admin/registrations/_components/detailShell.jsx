'use client';

import { Fragment, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, MoreHorizontal, Pencil, Check, X, Loader2, Copy } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { anchoredMenuPosition } from '@/lib/anchoredMenu';

/**
 * `useLayoutEffect` in the browser, `useEffect` on the server.
 *
 * The menu below MUST position itself before paint — an effect that runs after
 * it shows the sheet at its unpositioned spot for one frame, which on the last
 * row of the roster is precisely the wrong place and reads as a flicker into
 * position. `useLayoutEffect` runs before paint and is the correct hook.
 *
 * It also WARNS on the server, where it does nothing, and this file is rendered
 * by `renderToStaticMarkup` in ~40 tests. The warning would be noise in every
 * one of them and the standing instruction in this suite is that noise gets
 * read as signal eventually. The branch is on `window` rather than on a state
 * flag because the choice is per-ENVIRONMENT, not per-render: both branches are
 * called unconditionally from the same position in the hook order, so this is
 * not a conditional hook.
 */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * THE REGISTRATION DETAIL SHELL — the frame both detail screens are drawn in.
 *
 * ══ WHAT IS IN HERE AND WHAT IS DELIBERATELY NOT ═════════════════════════════
 *
 * Everything here is PRESENTATIONAL. No component takes a `source` prop, none
 * imports the status module, none knows there are two collections, and none
 * branches on which document it is drawing. Every one of them takes its data as
 * props and would render the same way for a third collection nobody has built.
 *
 * That constraint is the whole reason the file exists, and it is the same
 * constraint tableParts.jsx is held to on the list screen. The failure it
 * prevents is on record: a single body branching on `source` per cell is how an
 * in-house document came to be rendered through public columns, and the fix was
 * two components rather than ten `source ===` tests inside one.
 *
 * So the CONTENT stays in two files — RegistrationDetailClient and
 * InhouseDetailClient — which share this frame and share almost no fields. A
 * "unified detail client" that branches per section is exactly the shape that
 * was already paid for once.
 *
 * The test for whether something belongs here is not "do both screens use it".
 * It is "would a change to this be WRONG for one of them". A card header is a
 * card header. A card's field LIST is not, which is why no field list is here.
 *
 * ══ THE GEOMETRY ════════════════════════════════════════════════════════════
 *
 * Measured from the Figma file at a 1080 container. VERTICAL RHYTHM AND INTERNAL
 * PADDING ARE ABSOLUTE and are written as arbitrary-value classes. HORIZONTAL
 * POSITIONS ARE NOT: the admin sidebar collapses, so a column stated as `w-[500px]`
 * would be wrong the moment it does.
 *
 * ── ROUND 4'S TWO-COLUMN DEFINITION LIST IS SUPERSEDED ─────────────────────
 * It was `grid-cols-2 gap-x-[36px]` — two 500px columns at a 1080 container —
 * with the ข้อมูลระบบ card at `grid-cols-3 gap-x-[20px]`. BOTH ARE GONE. Every
 * field on both screens is now one row spanning the card's full inner width,
 * label left and value right; ข้อมูลระบบ is no longer an exception. See
 * `FIELD_ROW_COLUMNS` for the split, the breakpoint and the arithmetic behind
 * both.
 *
 * The one absolute horizontal number is the container's max-width, which is a
 * cap rather than a position and is what the proportions are proportions OF.
 *
 * ══ EVERY OPTIONAL LINE IS ABSENT, NEVER BLANK ══════════════════════════════
 *
 * Each component below returns `null` for the line it cannot fill rather than
 * rendering an empty element to hold the space. That is not tidiness: an empty
 * `<p>` is invisible to text matching, so a dropped line looks identical to a
 * present one in every assertion that reads for a string. It got through twice
 * on the list screen before a guard that reads for ELEMENTS caught it, and the
 * same guard is pointed at these components.
 */

// ── Back link ───────────────────────────────────────────────────────────────

/**
 * The back link: a 40.5px block holding a 20px line.
 *
 * `onClick` rather than an `<a>` because the target is "where the reader came
 * from" — `router.back()` — and that is not a URL this component can know. The
 * list screen's row link is the opposite case and is a real anchor for the
 * reasons tableParts spells out; this is a return, not a destination.
 *
 * ── THERE IS NO TOP PADDING, AND THAT SUPERSEDES THE GEOMETRY ──────────────
 * The Figma read puts this block 30px down and it shipped as `pt-[30px]`. THE
 * PADDING WAS REMOVED BY HAND, DELIBERATELY, AND THE MEASUREMENT DOES NOT WIN
 * AGAINST THAT. Do not restore it from the design file; the admin layout already
 * supplies the space above this element, so the 30px was being added twice.
 *
 * Nothing in the suite pins it in either direction — checked, not assumed — so
 * this comment is the only record of the decision. If the vertical rhythm ever
 * makes the gap look necessary again, that is a conversation, not a re-add.
 */
export function BackLink({ label, onClick }) {
  return (
    <div>
      <div className="flex h-[40.5px] items-start">
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-[6px] text-[13px] leading-[20px] text-[var(--text-secondary)] transition-colors hover:text-9e-action"
        >
          <ArrowLeft aria-hidden="true" className="h-[14px] w-[14px]" />
          {label}
        </button>
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

/**
 * The 98px header: a 25px row, a 48px H1 block, a 25px subtitle block.
 *
 * `badge` and `timestamp` share row 1 on one baseline with about 10px between
 * them. `subtitle` is optional and its BLOCK disappears with it — a 25px empty
 * paragraph is the defect described in the file header, and the header would be
 * 98px of which 25px said nothing.
 *
 * `refNo` arrives as a node rather than a string so the screen can style the
 * reference number without this component learning what a reference number is.
 */
export function DetailHeader({ badge, timestamp, title, subtitle }) {
  return (
    <div>
      <div className="flex h-[25px] items-center gap-[10px]">
        {badge}
        {timestamp ? (
          <span className="text-[12px] leading-[17px] text-[var(--text-muted)]">{timestamp}</span>
        ) : null}
      </div>

      <h1 className="flex h-[48px] items-center text-[40px] font-bold leading-[48px] text-[var(--text-primary)]">
        {title}
      </h1>

      {subtitle ? (
        <p className="flex h-[25px] items-center text-[14px] leading-[21px] text-[var(--text-secondary)]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The type chip — 25px, the one thing on the page that says which collection
 * this document came out of.
 *
 * It takes its CLASSES as a prop. That is not indirection for its own sake: a
 * chip whose colour was chosen here would be a second place where "public" and
 * "in-house" are given a look, and this file is not allowed to know they exist.
 */
export function TypeBadge({ label, className }) {
  return (
    <span
      className={cn(
        'inline-flex h-[25px] w-fit items-center whitespace-nowrap rounded-full px-[10px] text-[11px] font-semibold',
        className,
      )}
    >
      {label}
    </span>
  );
}

// ── Status bar ──────────────────────────────────────────────────────────────

/**
 * The 87px status card, 22px below the header.
 *
 * ── THE DOT'S COLOUR IS THE VOCABULARY'S, NOT A NEW MAP ────────────────────
 * `dotClassName` is the status module's own `badge` string —
 * `bg-amber-100 text-amber-700` — with `bg-current` appended by the caller, so
 * the 11px disc paints in the badge's TEXT colour and no second colour map
 * exists anywhere. See the note at the call sites; the merge is measured by a
 * render assertion, because `cn` is twMerge and a class it failed to resolve
 * would leave BOTH backgrounds in the markup with the winner decided by
 * emission order.
 *
 * ── THE ACTION SLOTS ARE NODES, AND EITHER MAY BE ABSENT ───────────────────
 * `primary` is the 100x38 button and `overflow` the 39x38 one. Both are passed
 * in already built: which transitions exist is a question for the status module
 * and the screen, and answering it here would put a rules-shaped decision in a
 * presentational file. A record with neither renders neither — not two empty
 * boxes holding the space.
 */
export function StatusBar({ dotClassName, label, name, description, primary, overflow }) {
  return (
    <div className="mt-[22px] flex h-[87px] items-center justify-between rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] pl-[17px] pr-[17px]">
      <div className="flex min-w-0 items-center gap-[23px]">
        {/*
          ORDER IS LOAD-BEARING, AND IT WAS MEASURED. `cn` is twMerge and twMerge
          keeps the LAST of two conflicting classes, so `bg-current` must come
          AFTER `dotClassName` — written the other way round the badge's pale
          `bg-amber-100` wins and the 11px disc is very nearly invisible. The
          first draft of this line had it backwards and a render assertion on the
          resolved class list is what said so.

          `aria-hidden` because the dot carries no information a screen reader
          needs: the status NAME is right beside it, in words.
        */}
        <span
          aria-hidden="true"
          className={cn(dotClassName, 'h-[11px] w-[11px] shrink-0 rounded-full bg-current')}
        />
        <div className="min-w-0">
          <p className="text-[11px] leading-[15px] text-[var(--text-muted)]">{label}</p>
          <p className="text-[17px] font-bold leading-[24px] text-[var(--text-primary)]">{name}</p>
          {description ? (
            <p className="truncate text-[12px] leading-[18px] text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {(primary || overflow) ? (
        <div className="flex shrink-0 items-center gap-[7px]">
          {primary}
          {overflow}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The 100x38 primary action.
 *
 * `title` is the FULL wording of the action. The visible label is the short form
 * the measured width can hold, and a control whose text has been abbreviated to
 * fit should still be able to say what it does in full on a hover.
 */
export function PrimaryAction({ children, title, onClick, disabled, busy }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-[38px] w-[100px] items-center justify-center gap-[5px] rounded-9e-md bg-9e-navy px-[6px] text-[12px] font-semibold text-9e-ice transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {busy ? <Loader2 aria-hidden="true" className="h-[13px] w-[13px] shrink-0 animate-spin" /> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

/**
 * The 39x38 "•••" button and the menu it discloses.
 *
 * ── THE MENU IS ALWAYS IN THE DOM, HIDDEN BY THE `hidden` ATTRIBUTE ────────
 * Not conditionally rendered, and the reason is a test one:
 * `renderToStaticMarkup` cannot click, so a conditionally-rendered menu would
 * put every one of its items behind a state this suite cannot reach. The items
 * in here are not decoration — DELETE lives in this menu, and delete on a
 * CANCELLED record is the single most load-bearing control on the screen,
 * because cancellation is terminal and delete is the only way out of a
 * wrongly-cancelled row. An assertion that cannot see it is not an assertion.
 *
 * `hidden` rather than a `hidden` CLASS: the attribute takes the menu out of the
 * accessibility tree as well as out of the layout, which a `display:none`
 * utility also does but which reads as a styling accident rather than as state.
 * `aria-expanded` on the trigger says the same thing to a screen reader.
 *
 * ── THE TRIGGER AND THE BACKDROP BOTH CARRY TEXT ───────────────────────────
 * Screen-reader-only text, but text. A `<button>` whose only child is an icon
 * renders as `<button …></button>` after the icon is stripped, and that is
 * precisely the shape the empty-button guard exists to catch — a real, clickable
 * control that matches no text assertion anywhere. Two rounds of this work have
 * each found one.
 *
 * ── `compact` IS THE ROW MENU, AND IT IS THE SAME COMPONENT ON PURPOSE ─────
 * The attendee table's per-row menu sits in a 32px column, so its trigger is
 * 28x28 rather than 39x38 and its sheet hangs from a shorter offset. Everything
 * else about it — the always-in-the-DOM items, the `hidden` attribute, the
 * screen-reader text on the trigger and the backdrop — is identical, and that is
 * the reason it is a size variant rather than a second component. Three rounds
 * of this work have each found an empty-content defect in a menu; a second
 * implementation would be a second place to find a fourth.
 *
 * Both class strings are written out in full rather than composed, because
 * Tailwind scans source TEXT and an interpolated size compiles to nothing.
 *
 * ══ THE SHEET IS `position: fixed`, AND HERE IS THE DEFECT THAT MADE IT SO ══
 *
 * It was `absolute right-0 top-[30px]` inside the `relative` wrapper, and on
 * the LAST attendee row it opened downward past the bottom of the screen with
 * no way to reach the rest of it.
 *
 * ── WHAT WAS ACTUALLY CLIPPING IT, MEASURED RATHER THAN ASSUMED ────────────
 * The obvious reading is that a card gained `overflow-hidden` and started
 * clipping a descendant meant to escape. THAT IS NOT WHAT HAPPENED, and it is
 * worth writing down because it is the first place the next reader will look.
 * The ancestor chain of `role="menu"` was walked against the real render, and
 * from the sheet up to the client's own root —
 *
 *     div.mx-auto.max-w-[1080px] > div[role=tabpanel] > section(SectionCard)
 *       > div.pt-[17px] > table > tbody > tr > td > div.relative > div[role=menu]
 *
 * — NOT ONE ancestor carries `overflow-hidden`. `SectionCard` never has. The
 * round-3 `overflow-hidden` a reader is thinking of is on `StatCard` in
 * RegistrationsClient, so the accent bar's corners follow the card's radius;
 * that card is on the LIST screen and is not an ancestor of any menu. It is
 * untouched by this change and must stay that way.
 *
 * The clip is the ADMIN SHELL. src/app/admin/layout.jsx pins the chrome with
 * `div.flex.h-screen.overflow-hidden` and gives `<main>` `h-screen
 * overflow-y-auto`, so `<main>` is the only scrollport on the screen and the
 * document itself has no scrollbar at all — by design, and the layout says so.
 * An `absolute` sheet laid out below that scrollport's bottom edge is outside
 * the only thing that scrolls, which is exactly the reported symptom: clipped,
 * and the page cannot be scrolled to reach the rest.
 *
 * `position: fixed` resolves against the VIEWPORT rather than against any
 * ancestor's scrollport, so the sheet simply stops being in the clipped
 * coordinate space. Nothing about the clip changed; the sheet left.
 *
 * THE CAVEAT, and it is the one that would silently undo this: a fixed
 * descendant IS trapped by an ancestor with `transform`, `filter`,
 * `perspective`, `backdrop-filter`, `will-change` on any of those, or
 * `contain: paint|layout|strict|content`. None is on either chain today —
 * `transition-colors`/`transition-shadow` set transition-property and create
 * nothing. test/render/menuEscapesClip asserts that, against the COMPILED
 * stylesheet rather than against class names, so the day someone adds a
 * `hover:scale-` to a card the guard says which box did it.
 *
 * ── AND IT FLIPS ───────────────────────────────────────────────────────────
 * Escaping the clip while still opening downward would move the same defect
 * one box outward — off the viewport instead of off the scrollport — so the
 * placement is measured. See src/lib/anchoredMenu.js, which is where the
 * arithmetic lives and where it is tested; this component measures and
 * applies, and decides nothing.
 *
 * ── NO POPOVER LIBRARY, AND NO PORTAL EITHER ───────────────────────────────
 * `@radix-ui/react-dropdown-menu` is in package.json and is deliberately not
 * used here, for the reason round 3 gave for the ตัวกรอง disclosure: keyboard
 * and dismissal come from native elements. `position: fixed` is the whole
 * escape mechanism, which means THE DOM DOES NOT MOVE — same parent, same
 * React subtree, same document order. That is not incidental, it is what keeps
 * the four things a portal would have put at risk:
 *
 *   · the items still bubble their clicks to handlers written above them;
 *   · the sheet still follows its trigger in the tab order, with no focus trap
 *     to write and get wrong;
 *   · `hidden` + always-in-the-DOM survives untouched, so every assertion this
 *     suite makes about what is IN the menu is still reachable;
 *   · the full-viewport backdrop is still a plain `<button>` and still the
 *     outside-click target it always was.
 *
 * WHAT IT COSTS: a fixed sheet does not move with the content under it, so
 * this reposition on scroll and resize rather than letting it drift. Those
 * listeners are the price, and `capture: true` on the scroll one is not
 * optional — the scroll that moves the row happens on `<main>`, and a
 * non-capturing window listener never hears it.
 */
export function OverflowMenu({ open, onToggle, triggerLabel, closeLabel, compact = false, children }) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);
  /** Whether the LAST render had the sheet open — the focus-return trigger. */
  const wasOpen = useRef(false);

  /*
   * The gap between the trigger's bottom edge and the sheet's top one, in the
   * two sizes this component ships. These ARE the old `top-[30px]` and
   * `top-[42px]` — 30 less the 28px compact trigger, 42 less the 38px one —
   * carried across rather than re-derived, so the measured geometry survives
   * the change of positioning scheme.
   */
  const gap = compact ? 2 : 4;

  useIsomorphicLayoutEffect(() => {
    if (!open) return undefined;

    const place = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const next = anchoredMenuPosition({
        trigger: trigger.getBoundingClientRect(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        // scrollHeight, not offsetHeight: the sheet may already be carrying a
        // maxHeight from a previous placement, and measuring the CLAMPED box
        // would let one tight placement pin every later one.
        height: menu.scrollHeight,
        gap,
      });
      if (!next) return;
      // Same place as last frame is the common case during a scroll that does
      // not move this row — a fresh object every tick would re-render the whole
      // sheet on every frame of a flick for no visible change.
      setPos((prev) => (prev
        && prev.top === next.top && prev.bottom === next.bottom
        && prev.right === next.right && prev.maxHeight === next.maxHeight
        ? prev : next));
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, gap]);

  /*
   * ESC CLOSES. It did not before — the backdrop was the only way out that was
   * not choosing an item, and a sheet that swallows Esc is worse than one that
   * never looked dismissable. Same ruling FilterPanel already applies to its
   * `<details>`, applied here for the same reason.
   *
   * On `document` rather than on the sheet, because focus is not necessarily
   * inside it: the reader who opened this with the mouse still has focus on
   * the trigger, and a keydown handler on the sheet would never fire for them.
   */
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onToggle();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onToggle]);

  /*
   * FOCUS RETURNS TO THE TRIGGER on close — every close, whichever of the three
   * dismissals it was.
   *
   * Guarded on where focus actually is, and the guard matters. The parent owns
   * `open` and closes this sheet for reasons of its own (opening another row's
   * menu, a save landing), and an unguarded refocus would yank the caret out of
   * whatever the reader had moved on to. So: only when focus is still inside
   * the sheet, or has fallen to `<body>` because the element holding it was
   * just hidden.
   */
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const menu = menuRef.current;
    const active = document.activeElement;
    if (!menu) return;
    if (active === document.body || menu.contains(active)) triggerRef.current?.focus();
  }, [open]);

  return (
    /*
     * NOT `relative` any more, and that is a deletion rather than an omission:
     * the sheet is `fixed` and no longer positions against this box, so a
     * `relative` left here would tell the next reader the opposite.
     */
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'inline-flex items-center justify-center rounded-9e-md text-[var(--text-secondary)] transition-colors hover:text-9e-action',
          compact
            ? 'h-[28px] w-[28px]'
            : 'h-[38px] w-[39px] border border-[var(--surface-border)]',
        )}
      >
        <MoreHorizontal aria-hidden="true" className={compact ? 'h-[14px] w-[14px]' : 'h-[16px] w-[16px]'} />
        <span className="sr-only">{triggerLabel}</span>
      </button>

      {open ? (
        <button type="button" onClick={onToggle} className="fixed inset-0 z-40 cursor-default">
          <span className="sr-only">{closeLabel}</span>
        </button>
      ) : null}

      {/*
        `overflow-y-auto` where this was `overflow-hidden`. It still clips the
        items to the sheet's radius — `overflow-y: auto` forces the x axis to
        `auto` too, so the corners are as clean as they were — and it is what
        makes the maxHeight above USABLE rather than another way to hide items.
        `overscroll-contain` so a flick inside a scrolling sheet does not chain
        out to <main> and drag the row out from under it.

        The offsets are inline `style` and not classes, because they are runtime
        pixels: a class built from a measurement compiles to nothing at all —
        Tailwind scans source text and never evaluates it — which is the exact
        shape test/fs/tailwindArbitraryValueRules exists to catch. Everything
        that CAN be a literal class still is.
      */}
      <div
        ref={menuRef}
        role="menu"
        hidden={!open}
        style={pos ? { top: pos.top, bottom: pos.bottom, right: pos.right, maxHeight: pos.maxHeight } : undefined}
        className="fixed z-50 w-[200px] overflow-y-auto overscroll-contain rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] py-[4px] shadow-9e-md"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The attendee tab's summary row — 75.85px, THREE EQUAL CELLS.
 *
 * ── THIS IS NOT THE DARK STRIP, AND THE DIFFERENCE IS THE MEASUREMENT ──────
 * `SummaryStrip` above has CONTENT-WIDTH cells because its values are a course
 * name beside "3 ท่าน" and equal fractions would read as a row of tiles. This
 * row's three values are all short counts, the frame gives them 359.46px each at
 * 1080 — exactly a third — and equal columns are what make three numbers
 * comparable at a glance. So `flex-1` here where the strip has none, and a 1px
 * inset at the ends rather than 4px.
 *
 * What the two share is that the cells sit FLUSH and are divided by RULES, not
 * by gaps. A separate component rather than a flag on the other, because "equal
 * or content-width" is the whole shape of the thing and a boolean would make one
 * component answer two different measurements.
 *
 * ── ONE STATED DEVIATION FROM THE FRAME ────────────────────────────────────
 * The frame's value type is ~27px in a 30px block. THAI CLIPS AT THAT RATIO:
 * `ยังไม่ครบ` carries an upper tone mark and `ครบ 2/2` sits in the same cell, and
 * 27px of type in a 30px line leaves nothing above the base characters for it.
 * The type is 24px, which is the ratio the dark strip already ships
 * (20px in a 23.5px line) and clears the marks at this leading. The BLOCK is
 * 30px as measured; it is the type inside it that moved.
 */
export function EqualSummaryRow({ cells }) {
  return (
    <div className="flex h-[75.85px] items-stretch overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] px-[1px] py-[1px]">
      <div className="flex min-w-0 flex-1 divide-x divide-[var(--surface-border)]">
        {cells.map((cell) => (
          <div key={cell.key} className="min-w-0 flex-1 px-[17px] pt-[15px]">
            <p className="truncate text-[11px] leading-[15px] text-[var(--text-muted)]">{cell.label}</p>
            {/*
              `tone` IS THE CALLER'S, like every other colour in this file. Round
              8 added it so the เพิ่มรายชื่อแล้ว cell can report a roster that
              exceeds its seat count — a broken invariant, which must LOOK broken.
              This file does not know what a seat count is and must not learn:
              picking the colour here would put a product rule in the frame.

              Absent tone keeps --text-primary, so every existing cell is
              unchanged.
            */}
            <p className={cn(
              'h-[30px] truncate text-[24px] font-bold leading-[30px]',
              cell.tone ?? 'text-[var(--text-primary)]',
            )}>
              {cell.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One row of the overflow menu. `tone` is the caller's, so this file picks no colours. */
export function OverflowItem({ children, onClick, disabled, busy, icon: Icon, tone }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-[34px] w-full items-center gap-[8px] px-[12px] text-left text-[12px] font-medium transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-40',
        tone ?? 'text-[var(--text-primary)]',
      )}
    >
      {busy
        ? <Loader2 aria-hidden="true" className="h-[13px] w-[13px] shrink-0 animate-spin" />
        : <Icon aria-hidden="true" className="h-[13px] w-[13px] shrink-0" />}
      {children}
    </button>
  );
}

/*
 * ── `SummaryStrip` IS GONE. DO NOT REINTRODUCE IT ──────────────────────────
 *
 * The 93px dark strip that sat between the status bar and the tabs was deleted
 * in round 6, on both screens, along with every assertion that stood on its
 * geometry. It is recorded here because "the design has a dark strip" is true
 * and the removal was a ruling against the design, so the next reader comparing
 * the two will otherwise file it as missing work.
 *
 * WHAT IT SHOWED, AND WHERE THAT LIVES NOW — checked cell by cell before the
 * delete, not assumed:
 *   · รอบอบรม + the arrangement → the ข้อมูลคอร์ส card's own two rows
 *   · ผู้เข้าอบรม + รายชื่อครบ N/N → the ผู้เข้าอบรม tab's summary row, which
 *     reads the SAME `rosterState` derivation and words it for its own width
 *   · หลักสูตร / รูปแบบ / ช่วงเวลา / ผู้ติดต่อ (in-house) → the four request
 *     cards, row for row
 * Nothing was the strip's alone. The strip was a second rendering of values the
 * cards below it already carried.
 *
 * ── AND ONE DEFECT WENT WITH IT, DELIBERATELY UNPORTED ────────────────────
 * The public ยอดสุทธิ cell rendered `—` for a QUOTATION-PATH registration,
 * which has no `pricing` at all. That is the strip asserting a total for a
 * record that has none. It is not carried anywhere: `PaymentInfoCard` shows the
 * total instead, and it is correctly absent on the quote path because `pricing`
 * and `payment` are written by the same object literal in
 * lib/registration/build-public.js — so a document with a total always has the
 * card that displays it, and one without has neither.
 */

// ── Tab list ────────────────────────────────────────────────────────────────

/**
 * The 49px tab list, 16px BELOW THE STATUS BAR: 5px of padding, 39px tabs, 4px
 * gaps, EQUAL WIDTH filling the row.
 *
 * The 16px was measured against the dark strip that used to sit between the two.
 * With the strip gone the tabs move up and KEEP the 16px, so the rhythm from the
 * status card down is unchanged — the gap did not belong to the strip, it was
 * the spacing between two stacked blocks and there are still two.
 *
 * Equal width is `flex-1`, not a fraction keyed on the tab count — public has
 * three tabs and in-house has two, and hard-coding either would make this
 * component know which screen it is on.
 *
 * ── THE COUNT BADGE IS 21x18 AND IS OPTIONAL ───────────────────────────────
 * Only ผู้เข้าอบรม carries one. `count == null` renders NO badge rather than an
 * empty one — a 21x18 box with nothing in it is the same class of defect as an
 * empty line, one element larger.
 */
/**
 * ── THE TAB'S TWO STATES, AS A cva VARIANT AND NOT AS A className ──────────
 *
 * The shipped selected tab was `bg-9e-navy text-9e-ice` — a dark slab. The
 * design's treatment is the other way round: the GROUP is a light neutral
 * surface, the SELECTED tab is a raised white card with a BLUE label and icon,
 * and the unselected tabs are transparent.
 *
 * ══ WHY cva — AND A MEASURED CORRECTION TO THE USUAL REASON ═════════════════
 *
 * The reason normally given for this is that `cn` is twMerge and TWMERGE CANNOT
 * MERGE THIS REPO'S `9e-*` SCALES, so two competing colour utilities would both
 * survive and the winner would be decided by CSS emission order.
 *
 * THAT IS NOT TRUE OF THE COLOURS, AND THE MEASUREMENT IS THE POINT — inherit
 * the finding, not a corrected opinion. Run
 * `node scripts/_probe-twmerge-9e.mjs` to reproduce it. What was tested, and
 * exactly what came back:
 *
 *   COLLAPSED — only the last class survives, so an override WOULD work:
 *     cn('text-9e-ice',           'text-9e-action')        → 'text-9e-action'
 *     cn('text-9e-navy',          'text-9e-air')           → 'text-9e-air'
 *     cn('bg-9e-navy',            'bg-[var(--surface-raised)]')
 *                                                          → 'bg-[var(--surface-raised)]'
 *     cn('bg-9e-navy',            'bg-transparent')        → 'bg-transparent'
 *     cn('text-9e-signature-50',  'text-9e-signature-900') → 'text-9e-signature-900'
 *     cn('bg-9e-action-scale-50', 'bg-9e-action-scale-900')→ 'bg-9e-action-scale-900'
 *     cn('bg-9e-action/10',       'bg-9e-air/15')          → 'bg-9e-air/15'
 *     cn('shadow-9e-sm',          'shadow-9e-lg')          → 'shadow-9e-lg'
 *     cn('text-red-500',          'text-blue-500')         → 'text-blue-500'   (stock baseline)
 *
 *   BOTH KEPT — the winner is decided by CSS emission order:
 *     cn('rounded-9e-md',         'rounded-9e-lg')  → 'rounded-9e-md rounded-9e-lg'
 *
 * So the flat tokens, the NUMBERED scales, the opacity-modified forms, the
 * arbitrary `var()` values and even the shadow scale all collapse. twMerge
 * groups by the utility PREFIX (`text-`, `bg-`, `shadow-`) and treats the rest
 * as an opaque value, so it never needs to know that `9e-action` is a colour.
 *
 * WHERE THE RULE IS REAL IS `borderRadius`, and only there: it has a CLOSED SET
 * of known suffixes (none/sm/md/lg/xl/full/arbitrary) and `9e-md` is not one of
 * them, so twMerge cannot tell two `rounded-9e-*` classes apart and emits both.
 * That is the documented hazard, and it applies to `rounded-9e-*` — which this
 * very file uses on every card — rather than to the tab colours.
 *
 * Both behaviours are pinned by test/render/registrationTabColours §3, so a
 * twMerge upgrade that changes either is a red test rather than a comment that
 * has quietly become false again.
 *
 * ── SO WHY IS THIS STILL A VARIANT ────────────────────────────────────────
 * Because the two states are a CLOSED CHOICE, not a base plus an adjustment. A
 * variant makes "selected" and "unselected" the only two things a tab can be and
 * puts both class lists where they can be read side by side; a className
 * override makes them a default and an exception, and leaves a caller free to
 * produce a third state nobody designed. The merge behaviour would decide
 * whether an override WORKED; it was never what decides whether one should
 * exist. `TabList` takes NO className for its tabs, so the question does not
 * arise at any call site.
 *
 * test/render/registrationTabColours pins the measurement in both directions, so
 * if a twMerge upgrade ever changes either behaviour it is a red test rather
 * than a comment that has quietly become false.
 *
 * ══ THE COLOURS, MEASURED — scripts/_probe-tab-contrast.mjs ═════════════════
 *
 * No new colour is introduced. Every value is an existing 9e-* token or an
 * existing CSS variable, and the pair was chosen on the numbers rather than on
 * the design's light-mode drawing:
 *
 *                                       light        dark
 *   SELECTED label                                              (bar: 4.5:1)
 *     9e-action  on --surface-raised     5.28 PASS    2.18 FAIL
 *     9e-air     on --surface-raised     2.35 FAIL    4.89 PASS
 *     9e-brand   on --surface-raised     3.54 FAIL    3.25 FAIL
 *   → `text-9e-action dark:text-9e-air`. NEITHER TOKEN PASSES IN BOTH THEMES,
 *     so a single blue was not available; 9e-brand fails in both and is the one
 *     a reader would reach for first, since it is the logo colour.
 *
 *   UNSELECTED label
 *     --text-muted     on --surface-muted 5.23 PASS   2.56 FAIL
 *     --text-secondary on --surface-muted 7.35 PASS   8.82 PASS
 *   → `--text-secondary`, WHICH IS ALSO WHAT SHIPPED. The design says "muted
 *     labels" and `--text-muted` is the token with that name, and IT FAILS AA IN
 *     DARK BY A WIDE MARGIN. Taking the design literally would have been a
 *     regression. "Muted" is satisfied by being a step down from
 *     --text-primary, which --text-secondary is.
 *
 * The labels are 13px SEMIBOLD — below the 18.66px large-text threshold — so
 * 4.5:1 is the bar that applies, not 3.0.
 *
 * ── THE CARD IS SEPARATED BY ITS SHADOW, NOT BY ITS COLOUR ────────────────
 * --surface-raised against --surface-muted is 1.05:1 in light and 1.22:1 in
 * dark. That is by design — a white card on a near-white group — and it means
 * `shadow-9e-sm` is LOAD-BEARING rather than decorative: remove it and the
 * selected tab is distinguished by its label colour alone. Stated because a
 * future tidy-up will otherwise read the shadow as ornament.
 */
const tabVariants = cva(
  'flex h-[39px] flex-1 items-center justify-center gap-[6px] rounded-9e-md text-[13px] font-semibold transition-colors',
  {
    variants: {
      selected: {
        true:  'bg-[var(--surface-raised)] text-9e-action shadow-9e-sm dark:text-9e-air',
        false: 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
      },
    },
    defaultVariants: { selected: false },
  },
);

/**
 * The count badge follows the tab it sits in.
 *
 * A separate cva rather than more branches inside `tabVariants`, because the two
 * answer different questions and cva composes variants of ONE element. The
 * selected badge is the blue at 12% behind the same blue text — no new colour,
 * and it reads as part of the label rather than as a second chip.
 */
const tabCountVariants = cva(
  'flex h-[18px] w-[21px] items-center justify-center rounded-full text-[10px] font-bold tabular-nums',
  {
    variants: {
      selected: {
        // ── `/10` AND `/15`, NOT `/12` ────────────────────────────────────
        // The first draft wrote `bg-9e-action/12` and it COMPILED TO NOTHING:
        // 12 is not a step of Tailwind's opacity scale, and an out-of-scale
        // modifier is silently dropped rather than rejected. The badge would
        // have had no background at all — a number floating on a white card,
        // which reads as a layout bug rather than a missing class.
        //
        // Caught by the compile-through-Tailwind harvest in
        // test/fs/tailwindArbitraryValueRules, NOT by review and not by any
        // source scan: the class is a complete literal and contains no `[...]`,
        // so every shape-based check passes it. Both steps below are registered
        // there for the same reason.
        true:  'bg-9e-action/10 text-9e-action dark:bg-9e-air/15 dark:text-9e-air',
        false: 'bg-[var(--surface-border)] text-[var(--text-secondary)]',
      },
    },
    defaultVariants: { selected: false },
  },
);

export function TabList({ tabs, active, onSelect, idFor }) {
  return (
    <div
      role="tablist"
      className="mt-[16px] flex h-[49px] items-center gap-[4px] rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-[5px]"
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={idFor(tab.key, 'tab')}
            aria-selected={selected}
            aria-controls={idFor(tab.key, 'panel')}
            onClick={() => onSelect(tab.key)}
            // The variant IS the class list — no `cn` wrapping it and no
            // className prop feeding it. See the note above: this is about the
            // two states being a closed choice, not about what twMerge can do.
            className={tabVariants({ selected })}
          >
            {/*
              The ICON takes the label's colour through `currentColor`, which is
              what lucide renders with by default. That is deliberate: colouring
              it separately would be a second place for the selected blue to
              live, and the two would drift the first time one was changed.
            */}
            <Icon aria-hidden="true" className="h-[14px] w-[14px] shrink-0" />
            <span>{tab.label}</span>
            {tab.count == null ? null : (
              <span className={tabCountVariants({ selected })}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One panel.
 *
 * ── ALL PANELS RENDER; THE INACTIVE ONES CARRY `hidden` ────────────────────
 * Rather than rendering only the active one. Two reasons, and the second is the
 * one that decided it:
 *
 *   · it is the standard ARIA tabs shape, and it keeps a panel's DOM state (a
 *     half-scrolled attendee table) across a tab switch;
 *   · "exactly one panel is visible" becomes an assertion about the RENDERED
 *     SET — N panels, exactly one without `hidden` — rather than about a count
 *     of one, which is satisfied by a screen that lost a panel entirely.
 *
 * The history panel is the reason this matters in practice: it arrives as a
 * server-rendered NODE from page.jsx, so it costs no round trip whether it is
 * mounted now or on the click.
 */
export function TabPanel({ id, labelledBy, hidden, children }) {
  return (
    <div id={id} role="tabpanel" aria-labelledby={labelledBy} hidden={hidden} className="pt-[16px]">
      {children}
    </div>
  );
}

// ── Section cards ───────────────────────────────────────────────────────────

/**
 * A content section card.
 *
 * Header row 22px in and 20px down, 43px tall: a 29x29 icon box, the heading at
 * 38px from the card's inner left (so 9px after a 29px box), and the 46x27 แก้ไข
 * button pinned right on the same 22px inset. The definition list starts 80px
 * from the card top — 20 + 43 + 17.
 *
 * ── `onEdit` ABSENT MEANS NO BUTTON, NOT A DISABLED ONE ────────────────────
 * A greyed-out แก้ไข invites the click and then explains nothing. On a cancelled
 * record the honest surface is a card with no control plus the one line of copy
 * in the status bar saying why — which is round 1's ruling, carried onto the new
 * markup unchanged. It is expressed here as the ABSENCE of a callback rather
 * than as a `readOnly` flag, so a card can only render the button by being given
 * something for it to do.
 */
export function SectionCard({ icon: Icon, title, editLabel, onEdit, editing, saving, onSave, onCancel, children }) {
  return (
    <section
      className={cn(
        'rounded-9e-lg border bg-[var(--surface)] px-[22px] pb-[20px] pt-[20px] transition-colors',
        editing ? 'border-9e-brand/40' : 'border-[var(--surface-border)]',
      )}
    >
      <div className="flex h-[43px] items-center gap-[9px]">
        <span className="flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-9e-md bg-[var(--surface-muted)] text-[var(--text-secondary)]">
          <Icon aria-hidden="true" className="h-[15px] w-[15px]" />
        </span>
        <h2 className="min-w-0 truncate text-[15px] font-bold leading-[23px] text-[var(--text-primary)]">
          {title}
        </h2>

        {editing ? (
          <div className="ml-auto flex shrink-0 items-center gap-[6px]">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="inline-flex h-[27px] items-center gap-[4px] rounded-9e-md border border-[var(--surface-border)] px-[9px] text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-40"
            >
              <X aria-hidden="true" className="h-[12px] w-[12px]" />ยกเลิก
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex h-[27px] items-center gap-[4px] rounded-9e-md bg-9e-navy px-[9px] text-[11px] font-semibold text-9e-ice hover:opacity-90 disabled:opacity-40"
            >
              {saving
                ? <Loader2 aria-hidden="true" className="h-[12px] w-[12px] animate-spin" />
                : <Check aria-hidden="true" className="h-[12px] w-[12px]" />}
              บันทึก
            </button>
          </div>
        ) : onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto inline-flex h-[27px] w-[46px] shrink-0 items-center justify-center gap-[3px] rounded-9e-md border border-[var(--surface-border)] text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:text-9e-action"
          >
            <Pencil aria-hidden="true" className="h-[11px] w-[11px] shrink-0" />
            {editLabel}
          </button>
        ) : null}
      </div>

      <div className="pt-[17px]">{children}</div>
    </section>
  );
}

/**
 * ══ THE FIELD ROW — ONE FIELD PER ROW, LABEL LEFT, VALUE RIGHT ══════════════
 *
 * ROUND 4'S TWO 500px COLUMNS ARE SUPERSEDED AND GONE. That shape was
 * `grid-cols-2 gap-x-[36px]` with each cell stacking its term over its
 * description and the occasional `col-span-full` row. Every field now spans the
 * card's full inner width with its label on the left and its value on the right,
 * on one baseline, separated by a hairline rule.
 *
 * The `wide` prop went with it. It meant "span both columns"; there is one
 * column, so every row is wide and a prop saying so would be a no-op that reads
 * like a choice. `columns` went the same way — see `SystemCard`.
 *
 * ── (1) THE VALUE COLUMN STARTS AT THE SAME PLACE IN EVERY CARD ────────────
 *
 * That single alignment down the whole page is most of the effect, and it is the
 * reason the split is ONE MODULE CONSTANT rather than a prop, a per-card
 * measurement or a `w-fit` label. A card whose labels are all short — ข้อมูลระบบ
 * is the live example — would otherwise compute its own narrower column and
 * break the line the eye is following.
 *
 * `FIELD_ROW_COLUMNS` is that source. It is spelled out as a complete literal
 * for the usual reason (Tailwind matches raw text) and it is asserted to be the
 * only such split in the tree, so a second card cannot quietly grow its own.
 *
 * ── WHY 22% / 1fr AND NOT 22% / minmax(0,1fr) ─────────────────────────────
 *
 * MEASURED, NOT PREFERRED. `lg:grid-cols-[22%_minmax(0,1fr)]` — the form you
 * would reach for first, because `minmax(0,1fr)` is the standard way to stop a
 * track being pushed wide by unbreakable content — COMPILES TO NOTHING.
 * Tailwind splits an arbitrary value on the comma, so the template is rejected
 * and no rule is emitted. It is a complete literal containing no interpolation,
 * so every shape check in this suite passes it, exactly as `bg-9e-action/12`
 * did. Run `node scripts/_probe-field-row-columns.mjs` to reproduce; it prints
 * DEAD for that class and COMPILES for the eight others.
 *
 * `1fr` is `minmax(auto, 1fr)`, so the track CAN be pushed by a long unbroken
 * value. `min-w-0` on the `<dd>` is what prevents it: it clamps the item's
 * automatic minimum size to zero, which is the same mechanism `minmax(0,…)`
 * would have used one level up. That class is load-bearing, not tidiness — see
 * (3) below.
 *
 * ── (3) A LONG VALUE WRAPS INSIDE THE VALUE COLUMN ─────────────────────────
 * Never under the label. The grid guarantees it: the label occupies its own
 * track, so there is no line for the value to wrap onto beneath it. The address
 * and the customer note are the live cases.
 *
 * ── (4) A CHIP KEEPS ITS CHIP ──────────────────────────────────────────────
 * A node value renders in the value cell at the cell's own left edge, which is
 * the same edge a text value starts at. Nothing in the row inspects what the
 * value IS.
 *
 * ── NARROW WIDTHS: THE SPLIT ARRIVES AT `lg`, AND THE ARITHMETIC SAYS WHY ──
 *
 * Below `lg` the row STACKS — label above value, which is what shipped before
 * this round — and the rule between rows survives, because the rule is on the
 * LIST and not on the row.
 *
 * The breakpoint is not a taste call. With the sidebar expanded the card's inner
 * width is `viewport − 256 (sidebar) − 48 (p-6) − 44 (card px-[22px])`, so:
 *
 *     767px  no sidebar   →  inner 675  →  22% = 148px
 *     768px  md, sidebar  →  inner 420  →  22% =  92px   ← the NARROWEST case
 *    1023px               →  inner 675  →  22% = 148px
 *    1024px  lg           →  inner 676  →  22% = 149px
 *    1440px  capped 1080  →  inner 1036 →  22% = 228px
 *
 * The longest label on either screen is `เลขประจำตัวผู้เสียภาษี`, which needs
 * roughly 130px at 11px. 22% clears that only once the inner width passes ~600px,
 * i.e. viewport ≥ ~948px, and `lg` is the first Tailwind step above it.
 *
 * `md` is the WRONG answer and the table above is why: the content area is at its
 * narrowest just ABOVE md, not below it, because that is where the 256px sidebar
 * arrives. A split that switched on at md would turn on precisely where there is
 * least room for it.
 */
export const FIELD_ROW_COLUMNS = 'lg:grid lg:grid-cols-[22%_1fr] lg:items-baseline lg:gap-x-[1%]';

/**
 * The field list.
 *
 * ── (2) THE DIVIDER IS THE LIST'S, NOT THE ROW'S ───────────────────────────
 *
 * `divide-y` compiles to `& > :not([hidden]) ~ :not([hidden])` — a border-TOP on
 * every child after the first. So a trailing rule is not merely avoided, it is
 * UNEXPRESSIBLE: there is no last-child rule to suppress, and a one-row card has
 * no sibling pair and draws nothing at all.
 *
 * That matters more than the tidiness. "Divider after each row except the last"
 * written as a per-row `border-b` plus a `last:border-b-0` is the trailing-element
 * trap this suite has now caught twice, and it fails in the one place nobody
 * looks: a row that returns `null` is still a CHILD as far as `:last-child` is
 * concerned in some hand-rolled variants, so the rule lands under a row that was
 * dropped. Moving the rule to the container removes the question.
 *
 * A dropped row therefore also drops its divider, with nothing to keep in step —
 * which is what (5) requires and is the reason absent-means-absent and
 * no-trailing-divider are ONE mechanism here rather than two that must agree.
 */
export function DL({ children }) {
  return <dl className="divide-y divide-[var(--surface-border)]">{children}</dl>;
}

/**
 * ── (5) ABSENT MEANS ABSENT, AND A WRAPPER DOES NOT DEFEAT IT ──────────────
 *
 * The rule is unchanged from round 4 and its docstring is still the reason for
 * it: the shape before that rendered `value || '—'`, so every optional field the
 * customer skipped printed an em dash and a typical enquiry was mostly a column
 * of them — reading as "we hold nothing about this company" when the truth was
 * "these questions were not asked". The check lives HERE rather than at each call
 * site because as a `&&` per row it was applied to some fields and forgotten on
 * others, which is how the dashes accumulated in the first place.
 *
 * WHAT ROUND 5 FOUND, AND WHAT THIS FIXES. The old test was
 * `value === null || undefined || '' || false`. A REACT ELEMENT IS ALWAYS
 * TRUTHY, so `<span className="font-mono">{''}</span>` — a wrapper around
 * nothing — passed it and rendered a row, a label and a rule around empty space.
 * Every call site that wraps its value therefore had to repeat the guard itself,
 * and `mono()`, the mailto link, the tel link and `CourseList` each do. That is
 * four copies of a rule this component exists to own.
 *
 * `isEmptyValue` recurses instead, and it is deliberately CONSERVATIVE about
 * what it will call empty:
 *
 *   · `true` joins the empty set. React renders a boolean as nothing, so a row
 *     whose value is `true` was always a guaranteed empty row; the old test
 *     caught only `false`.
 *   · ARRAYS and FRAGMENTS are pure wrapping — empty when everything inside is.
 *   · A HOST element (`typeof type === 'string'`) is empty when its children are,
 *     EXCEPT the void and self-drawing tags, which are content in themselves.
 *   · A COMPONENT element is NEVER called empty. Its output cannot be seen from
 *     here, and guessing would drop a row that renders fine. That direction is
 *     the safe one: it is exactly today's behaviour.
 */
const SELF_DRAWING = new Set(['img', 'svg', 'hr', 'br', 'input', 'canvas', 'video', 'iframe', 'picture']);

export function isEmptyValue(value) {
  if (value === null || value === undefined || value === '' || value === false || value === true) return true;
  if (Array.isArray(value)) return value.every(isEmptyValue);
  if (isValidElement(value)) {
    if (typeof value.type === 'string') {
      return SELF_DRAWING.has(value.type) ? false : isEmptyValue(value.props?.children);
    }
    // A fragment wraps and draws nothing of its own; anything else is a
    // component whose output this function cannot see.
    return value.type === Fragment ? isEmptyValue(value.props?.children) : false;
  }
  return false;
}

/**
 * One field: `label` in the left column, `value` in the right.
 *
 * `emptyHint` is the deliberate exception to (5), for a missing value that IS the
 * information — an onsite enquiry with no venue, an enquiry naming no course.
 * Those are work for a salesperson, not blanks to hide. A row with a hint renders
 * and therefore carries its divider like any other; a row without one renders
 * nothing, and the divider goes with it because the divider was never the row's.
 */
export function DLRow({ label, value, emptyHint = '', action = null }) {
  const empty = isEmptyValue(value);
  if (empty && !emptyHint) return null;

  return (
    <div className={cn('py-[11px]', FIELD_ROW_COLUMNS)}>
      <dt className="text-[11px] leading-[16px] text-[var(--text-muted)] lg:leading-[25px]">{label}</dt>
      {/*
        `min-w-0` IS LOAD-BEARING — see the note on FIELD_ROW_COLUMNS. Without it
        the `1fr` track takes its minimum from the value's min-content width, so
        one long unbroken address widens the value column and drags the label
        column out of alignment with every other card on the page. That is the
        one thing (1) cannot survive.
      */}
      <dd className="flex min-w-0 items-start justify-between gap-[10px] text-[13px] leading-[25px] text-[var(--text-primary)]">
        {empty
          ? <span className="min-w-0 italic text-[var(--text-muted)]">{emptyHint}</span>
          : <span className="min-w-0">{value}</span>}
        {action}
      </dd>
    </div>
  );
}

/**
 * The ข้อมูลระบบ card — the last card on both screens.
 *
 * Inner container inset 1px; title row 16px in and 14px down with a 25x25 icon
 * and the bold 17px label 33px in (so 8px after the box).
 *
 * ── IT IS NO LONGER A THREE-COLUMN GRID. IT IS ROWS, LIKE EVERY OTHER CARD ─
 *
 * It measured `grid-cols-3 gap-x-[20px]` and it was the one card on either
 * screen that did not use the shared definition list's shape. That exception is
 * withdrawn, and the reason is (1): the value column starting at the same place
 * in every card is most of what makes the page read as designed, and this is the
 * LAST card on both screens — the one a reader's eye arrives at with the
 * alignment already established. A three-column grid there breaks the line at
 * the bottom of every page.
 *
 * The case for keeping the grid was that the values are short, and they are:
 * `web`, an IP, a date, two ids. But short values are the argument for a grid
 * only if the card is read on its own, and it never is. What the grid actually
 * bought was vertical space — six fields in two rows rather than six — and the
 * card sits at the bottom of a scrolling page where that is worth least.
 *
 * (It holds SIX rows on the public screen and FIVE in-house, not three; the
 * three was the column count. Worth stating because "three short values" is the
 * natural misreading of the old markup and it changes the trade-off.)
 */
export function SystemCard({ icon: Icon, title, children }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-[1px]">
      <div className="rounded-9e-md bg-[var(--surface-muted)]/40 px-[16px] pb-[16px] pt-[14px]">
        <div className="flex items-center gap-[8px]">
          <span className="flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-9e-sm bg-[var(--surface)] text-[var(--text-muted)]">
            <Icon aria-hidden="true" className="h-[13px] w-[13px]" />
          </span>
          <h2 className="text-[12px] font-bold leading-[17px] text-[var(--text-secondary)]">{title}</h2>
        </div>
        <div className="pt-[14px]">
          <DL>{children}</DL>
        </div>
      </div>
    </section>
  );
}

/**
 * A note, rendered as a quoted block: a left accent rule and 15px of padding
 * inside it.
 *
 * ── THE EMPTY STATE IS THE CALLER'S, AND IT IS NOT A BLOCK ─────────────────
 * `children` is only ever the note. A record with no note renders the caller's
 * own muted sentence instead of a quoted block containing nothing — an accent
 * rule beside an empty space asserts there is a quotation there.
 */
export function QuotedNote({ children }) {
  return (
    <blockquote className="border-l-[3px] border-l-9e-brand/40 pl-[15px] text-[13px] leading-[22px] text-[var(--text-primary)]">
      <p className="whitespace-pre-wrap">{children}</p>
    </blockquote>
  );
}

// ── Internal notes ──────────────────────────────────────────────────────────

/**
 * The append-only internal-notes card body, for BOTH screens.
 *
 * ══ NO EDIT, NO DELETE, NO PER-NOTE "•••" — AND THAT IS THE DESIGN ══════════
 *
 * The reason is stated in full where the write happens (`addInternalNote` in
 * lib/actions/registrations.js), and it is repeated in one line here because
 * this is the surface a future reader will be looking at when they think of
 * adding a menu: a single mutable field lets the second writer silently
 * overwrite the first, and an edit control reintroduces that one level up.
 *
 * The absence of UI is NOT the enforcement — the server's `$push` and the
 * action's signature are. This component simply does not contradict them.
 *
 * ══ NO AVATAR ══════════════════════════════════════════════════════════════
 * The design shows one. It is not wanted, so it is not built. Each note renders
 * its BODY, WHO wrote it, and WHEN, which is the whole of what a note is.
 *
 * ══ THE COMPOSER IS AN EDIT AFFORDANCE AND IS GATED LIKE ONE ═══════════════
 * `onAdd` absent ⇒ no composer, exactly as `onEdit` absent ⇒ no แก้ไข on every
 * other card. A cancelled record gets the notes it already has, read-only, and
 * no way to add another — the same rule, expressed the same way, so the
 * cancellation lock has one shape on this screen rather than two.
 */
export function InternalNotesBody({
  notes, draft, onDraftChange, onAdd, adding, formatDate, emptyLabel,
}) {
  return (
    <div className="space-y-[14px]">
      {notes.length === 0 ? (
        // NOT an empty quoted block — an accent rule beside nothing asserts
        // there is a note there. Same rule as QuotedNote's own docstring.
        <p className="text-[13px] italic leading-[22px] text-[var(--text-muted)]">{emptyLabel}</p>
      ) : (
        <ol className="space-y-[12px]">
          {notes.map((note, i) => (
            // The key is the INDEX, and that is correct here rather than lazy:
            // the list is append-only, so an entry's position never changes and
            // nothing is ever inserted, removed or reordered. The subdocument
            // deliberately has no `_id` — see models/internalNoteSchema.
            <li key={i} className="rounded-9e-md border border-[var(--surface-border)] px-[14px] py-[12px]">
              <p className="whitespace-pre-wrap text-[13px] leading-[22px] text-[var(--text-primary)]">
                {note.body}
              </p>
              <p className="pt-[6px] text-[11px] leading-[16px] text-[var(--text-muted)]">
                {/*
                  WHO, then WHEN. `authorName` is the name AT THE TIME OF
                  WRITING and is stored on the note — it is never re-resolved
                  from `authorId`. An entry with no name renders the em dash
                  rather than an empty span, because a byline that collapses to
                  nothing is invisible to every text assertion.
                */}
                {note.authorName || '—'}
                {note.createdAt ? ` · ${formatDate(note.createdAt)}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}

      {onAdd ? (
        <div className="space-y-[8px] border-t border-[var(--surface-border)] pt-[14px]">
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="เพิ่มบันทึกภายใน (บันทึกแล้วแก้ไขไม่ได้)"
            className="w-full resize-y rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand"
          />
          <div className="flex items-center justify-between gap-[10px]">
            {/*
              THE PLACEHOLDER SAYS IT AND SO DOES THIS LINE. Append-only is a
              surprise to anyone who has used a notes box before, and the moment
              to learn it is BEFORE typing, not after clicking save.
            */}
            <p className="text-[11px] leading-[16px] text-[var(--text-muted)]">
              บันทึกจะถูกเก็บถาวร แก้ไขหรือลบภายหลังไม่ได้
            </p>
            <button
              type="button"
              onClick={onAdd}
              disabled={adding || !draft.trim()}
              className="inline-flex h-[30px] shrink-0 items-center gap-[5px] rounded-9e-md bg-9e-navy px-[12px] text-[11px] font-semibold text-9e-ice transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {adding ? <Loader2 aria-hidden="true" className="h-[12px] w-[12px] animate-spin" /> : null}
              เพิ่มบันทึก
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Copy ────────────────────────────────────────────────────────────────────

/**
 * THE COPY CONTROL, FOR BOTH SCREENS.
 *
 * ══ MOVED HERE IN ROUND 8, AND IT PASSES THIS FILE'S OWN TEST ═══════════════
 *
 * It lived privately in InhouseDetailClient. The header's rule for what belongs
 * here is "would a change to this be WRONG for one of them", and the answer is
 * no: a copy button's height, its flash timing and its failure state are a house
 * style. Copying it into the public screen instead would have put a second
 * `navigator.clipboard` implementation in the tree, and the failure that
 * produces is not a crash — it is one screen quietly telling a salesperson the
 * address is on their clipboard when it is not.
 *
 * WHAT IS COPIED is emphatically NOT here. `value` arrives already built, from
 * lib/registrations/copyText or from the formatter the screen already renders
 * with, so this file learns nothing about attendees or addresses.
 *
 * ══ COPYING IS NOT AN EDIT ══════════════════════════════════════════════════
 *
 * It takes no `onEdit`, is gated by nothing, and SURVIVES THE CANCELLATION LOCK
 * — exactly as `คัดลอกอีเมล` already does on the attendee row menu. A cancelled
 * registration is read-only, and reading is what this does. Asserted in
 * test/render/registrationCopyAffordance rather than left as a property of
 * whoever remembers not to gate it.
 *
 * ══ AND IT NEVER WRITES AN AUDIT ROW ════════════════════════════════════════
 *
 * There is no server action here at all — `navigator.clipboard.writeText` is a
 * browser call and nothing crosses the wire. That is the enforcement, and it is
 * structural rather than a decision anyone has to keep making: there is no
 * endpoint to add a `recordAdminActionAfter` to.
 *
 * The reason it matters: the audit log is a record of CHANGES. A read is not
 * one, and this control is on every field row on two screens — filling the trail
 * with copies would bury the changes it exists for under an unbounded number of
 * events nobody can act on.
 *
 * ── IT CAN FAIL, AND THE FAILURE IS VISIBLE ─────────────────────────────────
 * `writeText` rejects on a denied permission and the API is absent entirely
 * outside a secure context. Firing the success state optimistically would tell
 * the reader the value is on their clipboard when it is not, and they would
 * paste the previous one. So success waits for the promise and a rejection shows
 * a distinct failed state — the value stays on screen and selectable, which is
 * the fallback.
 *
 * The label names WHAT is being copied; there are several controls on a page and
 * "คัดลอก" alone is ambiguous to a screen reader. The live region announces the
 * outcome, because the icon swap alone is invisible to one.
 */
export function CopyButton({ value, label }) {
  const [state, setState] = useState('idle'); // 'idle' | 'ok' | 'fail'
  const timer = useRef(null);

  // The flash is on a timer, and a click that unmounts the row mid-flash would
  // otherwise set state on a dead component.
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (next) => {
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1800);
  };

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      flash('ok');
    } catch {
      flash('fail');
    }
  };

  const Icon = state === 'ok' ? Check : state === 'fail' ? X : Copy;

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`คัดลอก${label}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-9e-sm border px-2 py-1 text-[11px] font-medium transition-colors',
        state === 'ok'   && 'border-9e-brand/40 text-9e-action',
        state === 'fail' && 'border-9e-accent/40 text-9e-accent',
        state === 'idle' && 'border-[var(--surface-border)] text-[var(--text-muted)] hover:text-9e-action',
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span aria-live="polite">
        {state === 'ok' ? 'คัดลอกแล้ว' : state === 'fail' ? 'คัดลอกไม่สำเร็จ' : 'คัดลอก'}
      </span>
    </button>
  );
}

/**
 * A COPY CONTROL FOR A FIELD ROW — or NOTHING, when there is nothing to copy.
 *
 * ══ THE ABSENT-MEANS-ABSENT RULE, APPLIED TO THE CONTROL ════════════════════
 *
 * `DLRow` already drops a row whose value is empty, so most of the time this is
 * never reached. It exists for the two cases where it IS:
 *
 *   · a row with an `emptyHint` — an onsite enquiry with no venue renders, on
 *     purpose, and must not offer to copy the hint;
 *   · a row whose value is a NODE built from something else, where the text to
 *     copy can be empty while the row is not.
 *
 * ── AND IT TAKES THE TEXT, NOT THE VALUE ──────────────────────────────────
 * The emptiness test is on the STRING that would reach the clipboard, which is
 * the only thing that matters here. `isEmptyValue` recursing into elements is
 * the right test for whether a ROW renders; it is the wrong test for whether a
 * COPY has anything to put on the clipboard, because a node can render
 * perfectly while the text derived from it is ''. Round 5's wrapped-but-empty
 * defeat came from asking one question with the other's answer.
 */
export function CopyAction({ text, label }) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return null;
  return <CopyButton value={value} label={label} />;
}

/** The page-level error line. Absent when there is nothing to say. */
export function DetailError({ message }) {
  if (!message) return null;
  return <p className="pt-[8px] text-[12px] leading-[18px] text-9e-accent">{message}</p>;
}

// ── Edit-form atoms ─────────────────────────────────────────────────────────

/**
 * The two form controls both edit forms are built out of.
 *
 * ══ THE EDIT VIEW KEEPS LABEL-ABOVE-CONTROL. THAT IS A DECISION, NOT DRIFT ══
 *
 * Round 7 moved the READ view to label-left / value-right. The edit forms were
 * NOT moved with it and stay as they are — a label stacked over its control,
 * two-up at `sm` via the callers' own `sm:grid-cols-2`. Recorded here because
 * "the two views have different layouts" is exactly what an unexplained
 * inconsistency looks like, and the next reader is owed the reason rather than
 * left to assume one of the two was forgotten.
 *
 * The read view's label column exists to buy ONE ALIGNMENT DOWN THE WHOLE PAGE
 * (see `FIELD_ROW_COLUMNS`), and that alignment is worth a fifth of the width
 * because a read view is SCANNED — the reader is looking for one field among
 * twenty and the shared left edge is what makes that a glance instead of a read.
 *
 * An edit form is not scanned, it is filled, one control at a time, and the two
 * properties that matter there are the opposite ones:
 *
 *   · A CONTROL WANTS THE WIDTH. Spending 22% on a label leaves 77% for an
 *     input, and the callers pair their fields two-up at `sm` — so a
 *     label-left row inside a two-column grid gives each input about 39% of the
 *     card. `ที่อยู่` and the international address lines do not fit that.
 *   · A LABEL MUST BE UNAMBIGUOUS AT THE POINT OF FOCUS. Directly above its
 *     control is the shortest possible distance between the two; across a
 *     gutter is further, and it is further in the axis the eye is not moving in
 *     while tabbing down a form.
 *
 * And the difference is legible as STATE rather than as inconsistency, because
 * it never appears next to the read view: `SectionCard` swaps one for the other
 * and also changes its border to `border-9e-brand/40` while editing. The two
 * shapes are never on screen together to be compared.
 *
 * The read view's `emptyHint` rows are the one place the two could have been
 * made to agree cheaply, and they were not, for the same reason: a hint is a
 * sentence to be read, not a field to be filled.
 *
 * ── WHY THESE ARE HERE AND THE FIELD LISTS ARE NOT ──────────────────────────
 * The file header's test is "would a change to this be WRONG for one of them".
 * An input's height, radius and focus ring are a house style; changing them is
 * right for both screens or wrong for both. A card's field LIST is the opposite,
 * which is why none is here and none ever should be.
 *
 * They lived as private copies in RegistrationDetailClient until the in-house
 * screen needed them. Copying rather than moving would have put a second
 * `h-9 rounded-9e-md focus-visible:ring-9e-brand` in the tree, and the failure
 * that produces is not a crash — it is one screen's inputs quietly drifting a
 * pixel and a shade away from the other's, which nothing tests and nobody
 * notices until the two are seen side by side.
 *
 * `selectCls` is a FUNCTION returning a literal rather than a `const` string
 * because the class list is what Tailwind scans, and a bare exported string is
 * just as scannable — the function is for symmetry with the other call sites
 * and costs nothing. Both are COMPLETE LITERALS: nothing here is interpolated,
 * so the JIT can see every class.
 */
export function selectCls() {
  return cn(
    'h-9 w-full rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
    'border-[var(--surface-border)]',
    'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand',
  );
}

export function EditField({ label, value, onChange, type = 'text', required, className, placeholder }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
        {label}{required && <span className="ml-0.5 text-9e-accent">*</span>}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand"
      />
    </div>
  );
}

/** A multi-line field, same frame as EditField. */
export function EditArea({ label, value, onChange, rows = 4, maxLength, placeholder, className }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full resize-y rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand"
      />
    </div>
  );
}

/** A labelled `<select>`. `children` are the options — this file names none. */
export function EditSelect({ label, value, onChange, required, className, children }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
        {label}{required && <span className="ml-0.5 text-9e-accent">*</span>}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls()}>
        {children}
      </select>
    </div>
  );
}
