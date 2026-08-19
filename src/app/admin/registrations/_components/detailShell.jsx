'use client';

import { ArrowLeft, MoreHorizontal, Pencil, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
 * would be wrong the moment it does. The two 500px DL columns are
 * `grid-cols-2 gap-x-[36px]` inside a 22px inset — which IS 500px at 1080 and
 * stays correct at every other width — and the three ~335px columns of the
 * ข้อมูลระบบ card are `grid-cols-3 gap-x-[20px]` in the same box.
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
 * The back link: a 40.5px block starting 30px down, holding a 20px line.
 *
 * `onClick` rather than an `<a>` because the target is "where the reader came
 * from" — `router.back()` — and that is not a URL this component can know. The
 * list screen's row link is the opposite case and is a real anchor for the
 * reasons tableParts spells out; this is a return, not a destination.
 */
export function BackLink({ label, onClick }) {
  return (
    <div className="pt-[30px]">
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
 */
export function OverflowMenu({ open, onToggle, triggerLabel, closeLabel, compact = false, children }) {
  return (
    <div className="relative">
      <button
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

      <div
        role="menu"
        hidden={!open}
        className={cn(
          'absolute right-0 z-50 w-[200px] overflow-hidden rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] py-[4px] shadow-9e-md',
          compact ? 'top-[30px]' : 'top-[42px]',
        )}
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
            <p className="h-[30px] truncate text-[24px] font-bold leading-[30px] text-[var(--text-primary)]">
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

// ── Dark summary strip ──────────────────────────────────────────────────────

/**
 * The 93px dark strip, 16px below the status bar.
 *
 * ── THE CELLS ARE CONTENT-WIDTH, WHICH IS THE MEASUREMENT ──────────────────
 * They are NOT equal fractions. They sit flush against one another with no gap,
 * 4px inset at each end of the card, and are separated by RULES rather than by
 * space — so a cell holding a course name is wide and a cell holding "3 ท่าน" is
 * narrow, and the strip reads as one continuous band rather than as a row of
 * tiles. `flex` with no `flex-1` is what produces that; `divide-x` is the rule.
 *
 * `cells` is an array so the caller decides how many there are — public has 3
 * and in-house has 4, and this component is not allowed to know which is which.
 *
 * A cell's `sub` is OPTIONAL and its line vanishes with it. The public ยอดสุทธิ
 * cell is the case that matters: a registration taken through the quotation path
 * carries no `pricing`, and a 16.5px empty line under a dash is the invisible
 * defect the file header describes.
 */
export function SummaryStrip({ cells }) {
  return (
    <div className="mt-[16px] flex h-[93px] items-stretch overflow-hidden rounded-9e-lg bg-9e-navy px-[4px] py-[4px]">
      <div className="flex min-w-0 flex-1 divide-x divide-9e-ice/15">
        {cells.map((cell) => (
          <div key={cell.key} className="min-w-0 px-[17px] pt-[14px]">
            <p className="whitespace-nowrap text-[11px] leading-[15px] text-9e-ice/60">{cell.label}</p>
            <p className="truncate text-[20px] font-bold leading-[23.5px] text-9e-ice">{cell.value}</p>
            {cell.sub ? (
              <p className="truncate text-[11px] leading-[16.5px] text-9e-ice/70">{cell.sub}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab list ────────────────────────────────────────────────────────────────

/**
 * The 49px tab list, 16px below the strip: 5px of padding, 39px tabs, 4px gaps,
 * EQUAL WIDTH filling the row.
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
            className={cn(
              'flex h-[39px] flex-1 items-center justify-center gap-[6px] rounded-9e-md text-[13px] font-semibold transition-colors',
              selected
                ? 'bg-9e-navy text-9e-ice shadow-9e-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            <Icon aria-hidden="true" className="h-[14px] w-[14px] shrink-0" />
            <span>{tab.label}</span>
            {tab.count == null ? null : (
              <span
                className={cn(
                  'flex h-[18px] w-[21px] items-center justify-center rounded-full text-[10px] font-bold tabular-nums',
                  selected ? 'bg-9e-ice/20 text-9e-ice' : 'bg-[var(--surface-border)] text-[var(--text-secondary)]',
                )}
              >
                {tab.count}
              </span>
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
 * The definition list: two columns with a 36px gap, 18px between rows.
 *
 * `<dl>` because the rows really are dt/dd pairs. The grid lives on the `<dl>`
 * so each row is a grid ITEM and `wide` is a plain col-span rather than a second
 * container.
 *
 * `columns` exists for the ข้อมูลระบบ card, which measures three. It is a count
 * rather than a width for the reason the file header gives, and the two literal
 * class strings are written out in full because Tailwind scans text: a
 * `grid-cols-${n}` would compile to nothing and the rows would stack in one
 * column with the markup looking perfectly correct.
 */
export function DL({ columns = 2, children }) {
  return (
    <dl
      className={cn(
        'grid gap-y-[18px]',
        columns === 3 ? 'grid-cols-3 gap-x-[20px]' : 'grid-cols-2 gap-x-[36px]',
      )}
    >
      {children}
    </dl>
  );
}

/**
 * One term/description pair: a 16px term line over a 25px description.
 *
 * ── AN ABSENT VALUE MEANS AN ABSENT ROW ────────────────────────────────────
 * Carried over from the in-house client's `Row`, whose docstring earned it: the
 * previous shape rendered `value || '—'`, so every optional field the customer
 * skipped printed an em dash and a typical enquiry was mostly a column of them —
 * reading as "we hold nothing about this company" when the truth was "these
 * questions were not asked".
 *
 * The check lives HERE rather than at each call site, because as a `&&` guard
 * per row it was applied to some fields and forgotten on others, which is how
 * the dashes accumulated in the first place. A caller cannot emit one by
 * accident.
 *
 * `emptyHint` is the deliberate exception, for a missing value that IS the
 * information — an onsite enquiry with no venue, an enquiry naming no course.
 * Those are work for a salesperson, not blanks to hide.
 */
export function DLRow({ label, value, wide = false, emptyHint = '', action = null }) {
  const isEmpty = value === null || value === undefined || value === '' || value === false;
  if (isEmpty && !emptyHint) return null;

  return (
    <div className={cn('min-h-[40px]', wide && 'col-span-full')}>
      <dt className="text-[11px] leading-[16px] text-[var(--text-muted)]">{label}</dt>
      <dd className="flex items-start justify-between gap-[10px] text-[13px] leading-[25px] text-[var(--text-primary)]">
        {isEmpty
          ? <span className="min-w-0 italic text-[var(--text-muted)]">{emptyHint}</span>
          : <span className="min-w-0">{value}</span>}
        {action}
      </dd>
    </div>
  );
}

/**
 * The ข้อมูลระบบ card — the last card on both screens, and shaped unlike the
 * others because it is machine data rather than customer data.
 *
 * Inner container inset 1px; title row 16px in and 14px down with a 25x25 icon
 * and the bold 17px label 33px in (so 8px after the box); a THREE-column
 * definition list.
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
          <DL columns={3}>{children}</DL>
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

/** The page-level error line. Absent when there is nothing to say. */
export function DetailError({ message }) {
  if (!message) return null;
  return <p className="pt-[8px] text-[12px] leading-[18px] text-9e-accent">{message}</p>;
}

// ── Edit-form atoms ─────────────────────────────────────────────────────────

/**
 * The two form controls both edit forms are built out of.
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
