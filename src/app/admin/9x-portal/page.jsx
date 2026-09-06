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
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/admin/login-orbit.svg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/*
          A NAVY SCRIM, bottom-up. The artwork's gradient runs navy → 9e-action
          across the diagonal, so the corner the wordmark sits in is light on
          some viewport ratios and dark on others. This pins the text's
          background to the navy end at every size instead of hoping the crop
          lands somewhere legible. Token-derived opacity, no new colour.
        */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-9e-navy/80 via-9e-navy/25 to-transparent"
        />

        <div className="relative flex h-full flex-col justify-end gap-4 p-8 lg:justify-center lg:gap-5 lg:p-14">
          <Logo variant="white" href={null} priority />
          <div>
            <h1 className="font-heading text-2xl font-bold text-9e-ice lg:text-3xl">
              9Expert Admin
            </h1>
            <p className="mt-1.5 text-sm text-9e-ice/75 lg:text-base">
              Universe of Learning Technology
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
