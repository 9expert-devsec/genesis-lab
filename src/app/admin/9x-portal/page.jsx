import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { LoginForm } from './_components/LoginForm';

export const metadata = {
  title: 'Admin Login',
  robots: { index: false, follow: false },
};

/**
 * THE ADMIN LOGIN SHELL — a two-column split, DARK ONLY.
 *
 * ── WHY THERE IS NO `dark:` VARIANT ANYWHERE IN THIS FILE ───────────────────
 * This page has one appearance. It is not theme-aware and it must not become
 * so: `next-themes` has not mounted a preference for a signed-out visitor, so a
 * theme-following login screen would flash the wrong half of itself on every
 * cold load, on the one screen with nothing else on it to look at. The colours
 * below are therefore the dark values directly — `bg-9e-navy`, `text-9e-ice` —
 * rather than a light default with a dark override.
 *
 * ── IT OWNS THE WHOLE VIEWPORT, AND THAT IS ALREADY TRUE UPSTREAM ───────────
 * src/app/admin/layout.jsx renders this route chrome-free (`isLoginPage` →
 * `<>{children}</>`), so there is no sidebar to sit beside and no rail width to
 * subtract. The 45/55 split is the full window.
 *
 * ── THE SPLIT, AND WHAT MOBILE DOES WITH IT ─────────────────────────────────
 * `lg:grid-cols-[45fr_55fr]` is the brand panel and the form. Below `lg` the
 * grid does not apply at all, so the two children stack in source order and the
 * panel collapses to a fixed-height header (200px, 240px from `sm`) with the
 * form filling the rest. That is a height change, not a second layout.
 */
export default function Page() {
  return (
    <div className="min-h-dvh bg-9e-navy lg:grid lg:grid-cols-[45fr_55fr]">

      {/* ══ LEFT — the brand panel ══════════════════════════════════════════ */}
      <aside className="relative h-[200px] overflow-hidden sm:h-[240px] lg:h-auto lg:min-h-dvh">
        {/*
          A PLAIN <img>, NOT next/image, and deliberately.

          The asset is an SVG that carries its OWN `viewBox="0 0 720 900"` and
          `preserveAspectRatio="...slice"`. next/image would want intrinsic
          width/height and would route a vector through an optimiser that has
          nothing to optimise — it is already 5 KB of markup. `object-cover`
          here and `slice` inside the file agree with each other: the artwork
          fills the panel and is cropped, never letterboxed, at every ratio.

          `alt=""` + `aria-hidden` because it is decoration. Every word on this
          panel is real text in the DOM below, not baked into the graphic.

          ── IT LIVES UNDER /brand/, AND IT CANNOT LIVE UNDER /admin/ ────────
          The file was public/admin/login-orbit.svg first, and that path 404s in
          deployment. middleware.js matches `/admin/:path*`, and a static file
          under public/admin/ is inside that path space: the request is gated
          before it ever reaches the static handler, so a signed-out visitor —
          which is EVERY visitor to a login page — is 404'd or bounced to the
          login route instead of being served the image. /brand/logo-white.png
          from the same public/ tree has always worked for exactly this reason:
          it is outside the matcher.

          Moving the asset is the fix, NOT widening the matcher. The matcher is
          the admin surface's outermost gate, and carving a static-file hole in
          it to serve decoration would trade a wallpaper for a weaker gate.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/login-orbit.svg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/*
          ══ THE PLANET — layer 3 of 5 ═══════════════════════════════════════

          ── ITS LEFT AND BOTTOM EDGES MUST STAY OFF-CANVAS ─────────────────
          The source is cropped at those two edges, so if either becomes
          visible the artwork ends in a hard straight cut. Measured on the
          asset rather than taken on trust — sampling the alpha along all four
          borders of login-planet.webp: bottom 303/384 sampled pixels opaque
          and left 192/256 opaque (both CROPPED), top 0/384 and right 0/256
          (both clean, and free to be visible).

          That is why the anchors are NEGATIVE `left` and NEGATIVE `bottom`
          rather than a `top`/`left` pair. A negative offset puts the edge past
          the panel boundary at EVERY panel size, so the invariant holds
          without depending on the panel's height or aspect — which a computed
          `top` would. The percentages reproduce the measured desktop placement
          (~55% scale at (-120, 480) on a 648x900 panel) exactly: 130.4% of
          648 = 845px wide, -18.5% = -120px, -15.9% = -143px, putting the
          bottom edge 143px below the panel.

          `max-w-none` is load-bearing. Tailwind's preflight sets
          `img { max-width: 100% }`, which would silently clamp a 130.4% width
          back to the panel and pull the left edge into frame.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/login-planet.webp"
          alt=""
          aria-hidden="true"
          loading="eager"
          className="absolute bottom-[-16%] left-[-18.5%] w-[70%] max-w-none lg:w-[130.4%]"
        />

        {/*
          ══ THE TWO SCRIMS — layer 4 of 5 ═══════════════════════════════════

          Both are gradients TO TRANSPARENT, not flat overlays, and both are
          the 9e-navy token at varying alpha. Their values are the measured
          ones and are not re-derived here: without them the heading sits at
          3.9:1 and the bottom-left line at 1.6:1 over the planet, and both
          fail. With them every zone clears AA at its WORST pixel.

          ── WHY /0 RATHER THAN `to-transparent` ────────────────────────────
          The stop values are unchanged; only the way the far end is spelled
          is. The CSS keyword `transparent` is rgba(0,0,0,0), so a gradient
          running to it interpolates through BLACK and lays a grey haze across
          the planet's midtones. `9e-navy/0` is the same navy at zero alpha,
          so the ramp stays in one hue and fades to genuinely nothing. Same
          geometry, no artifact.
        */}
        {/* LEFT: opaque-ish at the left edge, gone by 80% across. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-9e-navy/90 from-0% to-9e-navy/0 to-80%"
        />
        {/* BOTTOM: nothing until 60% down, then to near-solid at the base. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-9e-navy/0 from-60% to-9e-navy/[0.96]"
        />

        {/*
          ══ THE PANEL'S VERTICAL RHYTHM ═════════════════════════════════════

          DESKTOP: three bands — logo at the top, heading + sub-line at the
          middle, institute line at the bottom. The middle one is centred by
          taking `flex-1` and centring its own child, rather than by
          `justify-between` across three items: between-spacing distributes the
          FREE space evenly, which only lands the middle item on the panel's
          centre line when all three bands are the same height, and these are
          48px / ~70px / ~40px. Measured, this puts the heading group's centre
          within 4px of the panel's.

          MOBILE IS UNCHANGED, and the structure is built so that falls out
          rather than being maintained twice. Below `lg` the middle wrapper is
          a plain block — no flex, no flex-1 — so the outer `justify-end gap-4`
          stacks the logo and the heading group at the bottom of the 200px
          header exactly as before, and the institute band is display:none.
          The distribution only switches on at `lg`, where the panel is
          full-height and there is room to distribute.
        */}
        <div className="relative flex h-full flex-col justify-end gap-4 p-8 lg:justify-start lg:gap-0 lg:p-14">
          {/*
            `cloud`, NOT `white`. The variant named "white" is the CI's
            "Blue & White" LOCKUP name, and its ink is #2486FF — measured, it
            holds no white pixels at all — so on this navy panel it rendered as
            the blue mark. `cloud` is the same artwork in #F8FAFD, which is
            --9e-ice exactly, and is the real knockout. See Logo.jsx.

            ══ WHY THIS LOGO NEEDS TWO CORRECTIONS TO SIT ON THE LEFT EDGE ═══

            It was landing 202.8px right of the heading's "9". Measured in a
            headless browser against this exact markup, that was TWO faults
            stacked, and fixing either one alone leaves the other:

            (1) 194.8px of it was STRETCH. The logo is a flex item in a column,
                and a column's cross axis is horizontal, so the default
                `align-items: stretch` applies to WIDTH. `w-auto` leaves the
                cross size auto, which is exactly the condition that lets
                stretch win — so the <img> box was 536px wide, the full content
                width, not the 146px the artwork occupies. `object-contain`
                then painted the bitmap CENTRED in that box. `self-start` opts
                out of the stretch, and the element sizes from its aspect.

            (2) 8.0px of it is PADDING BAKED INTO THE ASSET. The knockout PNG
                carries 424 fully-transparent columns before its first opaque
                pixel — 5.45% of its 7776px width — so the ink starts inboard
                of the file edge and NO alignment rule can reach it. The
                negative margin is that measurement, scaled: at h-12 the file
                renders 146.4px wide and 5.45% of that is 7.98px, hence -ml-2;
                at h-10 it renders 122.0px and the same fraction is 6.65px.
                The PNG is not cropped or re-exported — the offset lives here.

            THE MARGIN TRACKS THE HEIGHT BREAKPOINT, NOT THE PANEL'S. Logo.jsx
            switches h-10 → h-12 at `md`, so the correction switches there too.
          */}
          <Logo
            variant="cloud"
            href={null}
            priority
            className="self-start -ml-[6.65px] md:-ml-2"
          />

          <div className="lg:flex lg:flex-1 lg:items-center">
            <div>
              <h1 className="font-heading text-2xl font-bold text-9e-ice lg:text-3xl">
                9Expert Admin
              </h1>
              <p className="mt-1.5 text-sm text-9e-ice/75 lg:text-base">
                Universe of Learning Technology
              </p>
            </div>
          </div>

          {/*
            ══ THE BOTTOM-LEFT LINE — the zone the bottom scrim exists for ═══

            DESKTOP ONLY, and that is a deviation worth stating rather than
            burying. The mobile panel is a 200px header (240px from `sm`), and
            it already carries the logo, the heading and the sub-line inside
            56px of vertical padding — roughly 172px of its 200px. Two more
            lines is about 38px more, which overflows the header and pushes the
            logo out of the crop. A "bottom-left corner" is also a thing a tall
            panel has and a short header does not.

            So it renders from `lg` up, where the panel is full-height and the
            corner is real. Nothing else about the mobile header changes.
          */}
          <div className="hidden lg:block">
            <p className="text-sm font-bold text-9e-ice">9Expert Training</p>
            {/*
              dp-400 (#9EA6B2), NOT dp-300 (#8E97A5), and the one step is the
              whole point. At dp-300 this line measured 4.1:1 at its worst
              pixel over the composited panel — under AA, and it does not get
              the large-text allowance that would forgive it: that starts at
              18.66px bold or 24px regular, and this is 11px.

              THE STEP IS THE FIX BECAUSE THE ALTERNATIVES ARE WORSE. Darkening
              the scrim under it would repay a text problem with a change to
              the artwork's whole lower band; growing the type or dropping the
              letter-spacing would change the line's design. Moving one step up
              the slate ramp changes only the ink, and the ramp exists for
              exactly this. dp-400 is also what --admin-rail-item resolves to,
              so this line now sits at the same weight as every inactive label
              on the sidebar an admin sees immediately after signing in.

              The `9Expert Training` line above is ice and was already 10.4:1;
              it is deliberately untouched, and the two-step hierarchy between
              the lines survives the change.
            */}
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-9e-slate-dp-400">
              {"THAILAND'S IT TRAINING INSTITUTE"}
            </p>
          </div>
        </div>
      </aside>

      {/* ══ RIGHT — the form ════════════════════════════════════════════════ */}
      <main className="flex items-center justify-center px-6 py-12 lg:px-12 lg:py-16">
        <div className="w-full max-w-[420px]">
          <LoginForm />

          <p className="mt-8 text-center">
            <Link
              href="/"
              className="rounded-9e-sm text-sm text-9e-slate-dp-300 transition-colors hover:text-9e-air focus:outline-none focus-visible:ring-2 focus-visible:ring-9e-air"
            >
              ← กลับหน้าหลัก
            </Link>
          </p>
        </div>
      </main>

    </div>
  );
}
