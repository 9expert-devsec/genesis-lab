'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Settings, Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CookieMascot } from './CookieMascot';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CookieBanner — PRESENTATION ONLY. STILL NOT WIRED TO CONSENT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Built from the Figma frame `cookie-banner` (file lWoAUx7CkpGmY79jAKAtWe,
 * node 7:2). Round CB-A; mounted for team review in round CB-A2.
 *
 * ── WHAT IT STILL DOES NOT DO ───────────────────────────────────────────────
 * This component holds its four category states in `useState` and does NOTHING
 * ELSE with them. It does not write a cookie, does not touch localStorage, and
 * does not call gtag('consent', 'update', …). Consent Mode defaults elsewhere
 * in the app are untouched by this file and remain `granted`.
 *
 * ── IT IS NOW ON SCREEN, AND THAT NEEDED A GUARD ────────────────────────────
 * CB-A left this unmounted on the grounds that a banner whose
 * "ปฏิเสธคุกกี้ที่ไม่จำเป็น" visibly moves three toggles but changes no tracking
 * tells users they have a control they do not have. That reasoning has not
 * changed — genesis-lab simply is not in production yet (real users are still
 * on the old site), so the only people who can see it are the team.
 *
 * The mount therefore comes with a compensating control: CookieBannerPreview
 * passes a Thai warning strip through the `notice` prop saying in plain words
 * that the choices do not yet take effect. That strip is TEMPORARY and is
 * deleted in the wiring round along with the preview wrapper.
 *
 * If this component ever renders WITHOUT that notice on a site real users can
 * reach, the CB-A objection is live again and mounting is a defect.
 *
 * ── THE INITIAL STATE DIVERGES FROM THE MOCKUP ON PURPOSE ───────────────────
 * The Figma renders all three optional pills in their CHECKED state. They start
 * UNCHECKED here. Pre-ticked boxes are not valid consent under PDPA (nor GDPR):
 * consent has to be an affirmative act, and a box the user never touched records
 * nothing about their intent. The mockup is showing the "accepted" visual, not
 * a legal default.
 *
 * DO NOT "fix" this back to match the mockup. If a future round wants the
 * mockup's look for a screenshot, add a Storybook-style prop — do not change
 * the default.
 *
 * ── LAYOUT / PLACEMENT ──────────────────────────────────────────────────────
 * The Figma frame is `size-full` — the card fills whatever box it is dropped
 * into, and carries no max-width of its own. This component matches that and
 * does NOT impose `max-w-[1200px]`. The container discipline belongs to
 * whatever mounts it (a fixed bottom dock, most likely), which is the same
 * place that decides the viewport gutters. Pass it through `className`.
 */

/**
 * The three optional categories, in the Figma's pill order. `key` is the local
 * state key; there is deliberately no mapping to Consent Mode signal names
 * (ad_storage / analytics_storage / …) in this round — that mapping is the
 * wiring round's job and inventing it here would invite someone to wire it up
 * halfway.
 */
export const OPTIONAL_CATEGORIES = [
  { key: 'analytics',  label: 'คุกกี้วิเคราะห์' },
  { key: 'functional', label: 'คุกกี้ด้านฟังก์ชัน' },
  { key: 'marketing',  label: 'คุกกี้การตลาด' },
];

/**
 * ── WHY THE STATE TRANSITIONS ARE PURE FUNCTIONS OUT HERE ───────────────────
 * These three could all have been inline arrow functions inside the component,
 * and that is what they were first. They are exported module-level functions
 * instead because of a hard constraint in this repo's test suite: `createRoot`
 * is BANNED in the node tiers (see the note in test/render/courseListUrlFilter
 * — it leaks globalThis.window across the shared process and once reddened 28
 * render tests), and the browser tier needs a mounted URL, which this component
 * deliberately does not have because it is not in the layout.
 *
 * So there is no way to click this component in an automated test. Inline
 * handlers would make "ยอมรับทั้งหมด turns all three on" an unverifiable claim
 * resting on my reading of the code. As pure functions the transitions are
 * directly assertable (test/pure/cookieBannerState.test.mjs), and the component
 * below is reduced to wiring them to onClick — which SSR markup can confirm.
 */

/** The PDPA-correct starting point: every optional category off. */
export const INITIAL_CONSENT = Object.freeze(
  Object.fromEntries(OPTIONAL_CATEGORIES.map(({ key }) => [key, false])),
);

/** "ยอมรับทั้งหมด" / "ปฏิเสธคุกกี้ที่ไม่จำเป็น" — every optional key to `value`. */
export function applyAll(value) {
  return Object.fromEntries(OPTIONAL_CATEGORIES.map(({ key }) => [key, value]));
}

/** Flip one optional category, leaving the others untouched. */
export function toggleCategory(state, key) {
  return { ...state, [key]: !state[key] };
}

/** Shared pill chrome — Figma: white / 1px #cbd5e1 / r20 / 12×8 / gap 8. */
const PILL_CLASS = cn(
  'flex items-center gap-2 rounded-[20px] border px-3 py-2',
  'border-9e-slate-lt-300 bg-[var(--surface-raised)] dark:border-9e-border',
  'text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap',
);

/** Shared button chrome — Figma: r8 / 16×10 (20×10 on the filled one) / 13px. */
const BUTTON_CLASS = cn(
  'rounded-lg px-4 py-2.5 text-[13px] font-semibold',
  'transition-colors duration-9e-micro ease-9e',
);

/**
 * @param notice      Optional node rendered as the first thing inside the card.
 *                    Generic on purpose — this component does not know the
 *                    word "preview". Round CB-A2 passes the temporary
 *                    preview-warning strip through here; the wiring round
 *                    deletes that call site and this prop goes unused, with no
 *                    edit needed inside this file.
 * @param onDecision  Called with the resulting consent object when the user
 *                    makes a DECISION (accept-all or reject-optional). Not
 *                    called by the individual toggles, and not called by
 *                    "จัดการการตั้งค่า" — see the note on that handler.
 *                    This is the seam the wiring round will hang persistence
 *                    and gtag('consent','update',…) on. It does neither today.
 */
export function CookieBanner({ className, notice = null, onDecision }) {
  // ── PDPA: all three optional categories start OFF. See the header comment
  //    before changing this to match the Figma's all-checked mockup state.
  const [consent, setConsent] = useState(INITIAL_CONSENT);

  // Target for "จัดการการตั้งค่า" — see the note on that button below.
  const firstToggleRef = useRef(null);

  const toggle = (key) => setConsent((prev) => toggleCategory(prev, key));

  /**
   * A DECISION — the two buttons that answer the question the banner asks.
   *
   * The next state is computed once and both used and reported, rather than
   * setting state and reading `consent` in the callback: that read would see
   * the PREVIOUS render's value, so a listener would be handed the state the
   * user just moved away from. It is a stale-closure bug that would be
   * invisible in this round (nothing consumes the value yet) and would surface
   * as inverted consent in the round that does.
   */
  const decide = (value) => {
    const next = applyAll(value);
    setConsent(next);
    onDecision?.(next);
  };

  /**
   * "จัดการการตั้งค่า" — this project ruled that there is NO settings modal and
   * no preference page: the toggles are already right there in the banner. So
   * the button has no destination to navigate to.
   *
   * Rather than remove it (which would drop a control the design calls for) it
   * moves focus to the first optional toggle. That is a real, non-decorative
   * action for exactly the users who need it most: a keyboard or screen-reader
   * user who has just landed on the buttons and would otherwise have to shift-
   * tab back past the links to find the categories. `scrollIntoView` covers the
   * case where the banner is taller than the viewport on a small screen.
   *
   * It is honest about doing nothing else — it does not pretend to open
   * anything, and there is no modal to fail to open.
   */
  const focusToggles = () => {
    firstToggleRef.current?.focus();
    firstToggleRef.current?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <section
      aria-labelledby="cookie-banner-title"
      className={cn(
        // Figma's 24px padding / 20px gap are the sm+ values. Below that they
        // are tightened: on a 375px phone the full-size card stood 536px tall
        // — two thirds of the viewport — which is both bad on its own terms and
        // the direct cause of how far FloatingActionDock has to lift over it.
        'flex w-full flex-col items-start rounded-[16px]',
        'gap-3 p-4 sm:gap-5 sm:p-6',
        'bg-[var(--surface-raised)]',
        'drop-shadow-[0px_12px_12px_rgba(15,23,42,0.15)]',
        className,
      )}
    >
      {/* Caller-supplied slot, rendered before everything else so it is the
          first thing read in the DOM as well as the first thing seen. Null in
          the component's own right — see the prop docs. */}
      {notice}

      {/* ── Row 1 — illustration + copy ───────────────────────────────── */}
      <div className="flex w-full items-center gap-4 sm:gap-6">
        {/* Decorative. Hidden below sm: it costs 80px of height on a phone
            and carries no information the heading does not already give. */}
        <CookieMascot className="hidden h-20 w-20 shrink-0 sm:block" />

        {/* min-w-px is the Figma's own guard: without it the flex child refuses
            to shrink below its longest unbreakable Thai run and overflows. */}
        <div className="flex min-w-px flex-1 flex-col gap-2">
          <div className="flex items-baseline gap-2 whitespace-nowrap">
            <h2
              id="cookie-banner-title"
              className="text-[18px] font-bold text-[var(--text-primary)]"
            >
              เราใช้คุกกี้
            </h2>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Cookie Settings
            </span>
          </div>

          <p className="text-xs leading-[1.5] text-[var(--text-secondary)]">
            เว็บไซต์ของเราใช้คุกกี้ที่จำเป็นอย่างยิ่งเพื่อจัดการการทำงานของเว็บไซต์
            และหากคุณยินยอม เราจะใช้คุกกี้วิเคราะห์ คุกกี้ด้านฟังก์ชัน
            และคุกกี้การตลาด เพื่อช่วยปรับปรุงประสบการณ์การใช้งานของคุณ
          </p>
        </div>
      </div>

      {/* ── Row 2 — category pills ────────────────────────────────────── */}
      <div className="flex w-full flex-wrap items-start gap-2 sm:gap-3">
        {/*
          NECESSARY — always on, genuinely not toggleable.
          A native `disabled checked` input is what carries that to assistive
          tech: it announces as "switch, on, unavailable", and unlike an
          onClick-that-returns-early it cannot be defeated by a handler that
          fails to attach. The trade-off is that `disabled` also removes it from
          the tab order — correct here, since there is nothing to operate, and
          the sr-only sentence plus the visible Lock icon carry the "why".
        */}
        <label className={cn(PILL_CLASS, 'cursor-not-allowed')}>
          <input
            type="checkbox"
            role="switch"
            checked
            disabled
            readOnly
            className="peer sr-only"
          />
          {/* Figma shows this one as a 28×16 filled toggle switch — keep that
              visual so it reads as a switch that is on, not as a checkbox. */}
          <span
            aria-hidden="true"
            className={cn(
              'relative h-4 w-7 shrink-0 rounded-full',
              'bg-9e-action dark:bg-9e-air',
              'after:absolute after:right-0.5 after:top-0.5 after:h-3 after:w-3',
              'after:rounded-full after:bg-white dark:after:bg-9e-navy',
            )}
          />
          <span>คุกกี้ที่จำเป็น</span>
          <Lock
            className="h-3 w-3 shrink-0 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <span className="sr-only">เปิดใช้งานเสมอ ไม่สามารถปิดได้</span>
        </label>

        {/* OPTIONAL — real checkboxes. The visible box is a sibling <span>
            driven by peer-checked:, so the input itself stays a native control
            (focusable, space-toggleable, correctly announced) rather than a div
            wearing a switch costume. */}
        {OPTIONAL_CATEGORIES.map(({ key, label }, index) => (
          <label key={key} className={cn(PILL_CLASS, 'cursor-pointer')}>
            <input
              ref={index === 0 ? firstToggleRef : undefined}
              type="checkbox"
              checked={consent[key]}
              onChange={() => toggle(key)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-lg border',
                // OFF state — not in the Figma, which only supplies the ON
                // state. Hollow box on the same border token as the pill.
                'border-9e-slate-lt-300 bg-transparent dark:border-9e-border',
                // ON state — Figma's filled green box with a check.
                'peer-checked:border-9e-green-50 peer-checked:bg-9e-green-50',
                // The tick is a DESCENDANT of this span, not a sibling of the
                // input, so a bare `peer-checked:opacity-100` on the <Check>
                // itself would compile to `.peer:checked ~ .opacity-100` and
                // never match. Reveal it from here, where the peer relationship
                // actually holds, and reach down with an arbitrary variant.
                'peer-checked:[&>svg]:opacity-100',
                // Focus ring rides the box, since the input is sr-only.
                'peer-focus-visible:ring-2 peer-focus-visible:ring-9e-brand',
                'peer-focus-visible:ring-offset-2',
                'peer-focus-visible:ring-offset-[var(--surface-raised)]',
              )}
            >
              {/*
                The check glyph is NAVY, not the Figma's white. White on
                #1FC17E measures 2.34:1 — it fails WCAG AA for a graphical
                object (3:1) outright, and the mockup's #10b981 is no better.
                Navy on the same green is 7.44:1. The tick is the only thing
                distinguishing on from off, so it has to be legible.
              */}
              <Check
                className="h-2.5 w-2.5 text-9e-navy opacity-0"
                strokeWidth={3}
                aria-hidden="true"
              />
            </span>
            <span>{label}</span>
          </label>
        ))}
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <hr className="w-full border-t border-9e-slate-lt-300 dark:border-9e-border" />

      {/* ── Row 3 — links + buttons ───────────────────────────────────── */}
      <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:gap-4">
        {/*
          The Figma's left group has TWO links. The second — "ตั้งค่าคุกกี้"
          with a settings icon — is GONE, and that is the deliberate resolution
          of the same question the "จัดการการตั้งค่า" button raised.
          With no settings modal and no preference page, that link's only
          possible behaviour is "focus the toggles", which is precisely what the
          button beside it already does. Shipping both would put two differently-
          labelled controls with identical behaviour four inches apart, and
          "ตั้งค่าคุกกี้" reads like a navigation link — it would be the one
          users click expecting a new screen. The button keeps the behaviour
          because a button is the honest element for an in-page action; the link
          slot keeps only the link that has a real destination.
        */}
        <div className="flex items-center gap-6">
          <Link
            href="/cookie-policy"
            className={cn(
              'flex items-center gap-1.5 text-xs font-semibold',
              'text-9e-action hover:underline dark:text-9e-air',
            )}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            อ่านนโยบายการใช้คุกกี้
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={focusToggles}
            className={cn(
              BUTTON_CLASS,
              'flex items-center gap-1.5 border',
              'border-9e-slate-lt-300 bg-[var(--surface-raised)]',
              'text-[var(--text-secondary)] dark:border-9e-border',
              'hover:bg-[var(--surface-hover)]',
            )}
          >
            <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            จัดการการตั้งค่า
          </button>

          <button
            type="button"
            onClick={() => decide(false)}
            className={cn(
              BUTTON_CLASS,
              'border border-9e-action bg-[var(--surface-raised)] text-9e-action',
              'hover:bg-9e-action hover:text-white',
              'dark:border-9e-air dark:text-9e-air',
              'dark:hover:bg-9e-air dark:hover:text-9e-navy',
            )}
          >
            ปฏิเสธคุกกี้ที่ไม่จำเป็น
          </button>

          <button
            type="button"
            onClick={() => decide(true)}
            className={cn(
              BUTTON_CLASS,
              'px-5 bg-9e-action text-white hover:bg-9e-action-scale-100',
              'dark:bg-9e-air dark:text-9e-navy dark:hover:bg-9e-air-scale-100',
            )}
          >
            ยอมรับทั้งหมด
          </button>
        </div>
      </div>

      {/*
        NO DISMISS / CLOSE AFFORDANCE — and none was invented.
        The Figma frame has no X, no "ภายหลัง", and no overlay click-out; the
        only exits it draws are the three buttons. So the banner as specified
        cannot be dismissed without making a choice.
        Whether that is correct is a consent-design question, not a presentation
        one: under PDPA a "close without choosing" affordance has to record the
        same outcome as rejecting, which requires the persistence layer this
        round explicitly does not build. Adding an X now would create a control
        whose meaning is undefined. Left for the wiring round.
      */}
    </section>
  );
}
