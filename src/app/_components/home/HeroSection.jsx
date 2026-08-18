import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HERO_OVERLAY_SENTINEL_ID } from "@/lib/heroOverlay";

/**
 * Home hero — the artwork band the header floats over.
 *
 * ── A SERVER COMPONENT, AND IT STAYS ONE ────────────────────────────────────
 * There is no state and no effect here. The one piece of behaviour this section
 * takes part in — the header turning transparent while it is on screen — is
 * driven by the header, which is already a client component: this file renders
 * a 1px SENTINEL at its TOP edge and PublicHeaderClient observes it. So the
 * hero itself ships no JavaScript at all. See src/lib/heroOverlay.js, and the
 * comment on the sentinel below for why the top and not the bottom.
 *
 * ── WHY THE NEGATIVE TOP MARGIN ─────────────────────────────────────────────
 * The header is `sticky top-0`, not `fixed`. A sticky element still occupies
 * its own height in normal flow, so making it transparent alone would reveal
 * the PAGE BACKGROUND, not this artwork. The hero is therefore pulled up by
 * exactly the header's height (`-mt-[81px]`) and gives the same amount back as
 * padding (`pt-[81px]`) so nothing lands underneath it. Both are complete
 * literals: Tailwind scans raw text, and a class built from the constant in
 * lib/heroOverlay would emit no CSS.
 *
 * ── WIDTH: FULL-BLEED BACKGROUND, CENTRED CONTENT ───────────────────────────
 * The artwork expands with the viewport at every width — no max-width, no
 * rounded corners, no letterboxing. It deliberately no longer mirrors
 * HeroBannerCarousel, which still caps itself at 1440px above 1537px; the two
 * sections therefore disagree about page width above that breakpoint, which is
 * a visible seam and a decision left with the user.
 * The CONTENT does not go edge to edge: it stays inside the page's existing
 * centred max-w-[1200px] container, or the copy drifts to the far left of a
 * 2560px screen. The astronaut is anchored to THAT container, not the viewport.
 *
 * ── HEIGHT IS NOT THE IMAGE'S ASPECT RATIO ──────────────────────────────────
 * A full-bleed 16:9 band would be 1600px tall at 2560 wide. The height comes
 * from the content plus `lg:min-h-[520px]`, so it is identical at 1440 and at
 * 2560 (601px measured, both), and `object-cover object-bottom` crops the
 * background wider instead of growing it taller.
 *
 * ── COLOURS ARE NOT THEME-DEPENDENT ─────────────────────────────────────────
 * The artwork is permanently dark in both themes, so the text and buttons are
 * the dark-on-image treatment unconditionally. No `dark:` variants here.
 */

const HERO_DESCRIPTION =
  "9Expert ช่วยให้คุณเรียนรู้ได้จริง เข้าใจง่าย และนำไปใช้งานได้ทันที ด้วยหลักสูตรคุณภาพจากวิทยากรตัวจริง";

export function HeroSection() {
  return (
    <section className="relative w-full -mt-[81px]  
    min-h-dvh min-[1537px]:h-[601px] min-[1537px]:min-h-0 overflow-hidden min-[1400px]:portrait:h-[601px] min-[1400px]:portrait:min-h-0">
      {/* 2545 จอกลาง - 1425 จอแนวตั้ง */}
      {/* THE LCP ELEMENT, and it is FULL-BLEED at every width — no cap, no
          rounding, no letterboxing. `sizes="100vw"` says exactly that.
          `object-bottom` rather than `object-center`: the box is far wider
          than the source's 16:9 at desktop widths, so a cover crop takes the
          difference off the TOP (empty sky) and leaves the earth's limb —
          which is the whole reason the crop is anchored to the bottom.
          The image never drives the height; see the content box below. */}
      <Image
        src="/hero-img/background.png"
        alt=""
        fill
        priority
        quality={100}
        sizes="100vw"
        className="object-cover object-bottom"
      />

      {/* ── AMBIENT SKY ───────────────────────────────────────────────────────
          Decoration only, and it must stay unable to affect anything else:
          `aria-hidden` so no screen reader announces it, `pointer-events-none`
          on the layer so it cannot swallow a click on the CTAs it overlaps
          (this repo has already shipped a full-width invisible strip that ate
          hero clicks), and `inset-0` inside a section that is already
          `overflow-hidden`, so nothing can widen the document.

          Six elements, all of them empty spans: no image request, nothing that
          competes with the background's `priority` preload. Everything moves by
          `transform`/`opacity` only — never `top`/`left`/`filter` — so no frame
          re-lays-out or repaints the 2880px photo underneath.

          No `will-change` anywhere. Chrome already composites a running
          transform/opacity animation; adding the hint would pin six extra
          layers in memory for a repaint that is not happening. The budget
          allows two — this uses none, deliberately.

          The whole layer, and the mascot below, carry `data-hero-motion` so the
          reduced-motion block in globals.css can switch all of it off. */}
      <div
        aria-hidden="true"
        data-hero-motion="sky"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {/* Three streaks, upper-right → lower-left. The outer span is what
            travels (transform + opacity); the inner one is the graphic and
            carries the static rotation, because an element cannot hold a fixed
            rotation and an animated translate in the same `transform`.
            The gradient IS the streak: bright head at the leading (left) end,
            tapering to nothing along the tail. No image asset. */}
        <span
          data-hero-motion="streak"
          className="animate-9e-shoot-a absolute right-[8%] top-[12%] block"
        >
          <span className="block h-px w-[150px] -rotate-[35deg] bg-gradient-to-r from-white via-white/50 to-transparent" />
        </span>
        <span
          data-hero-motion="streak"
          className="animate-9e-shoot-b absolute right-[22%] top-[5%] block"
        >
          <span className="block h-px w-[110px] -rotate-[35deg] bg-gradient-to-r from-white via-white/40 to-transparent" />
        </span>
        <span
          data-hero-motion="streak"
          className="animate-9e-shoot-c absolute right-[4%] top-[26%] block"
        >
          <span className="block h-px w-[190px] -rotate-[35deg] bg-gradient-to-r from-white via-white/45 to-transparent" />
        </span>

        {/* Three stars, in the dark upper band only, and well left of the
            earth's lit limb where a white dot would be invisible anyway.

            The offsets are PIXELS, not percentages, and that is the second
            attempt: the usable band is bounded by the header's lower edge
            (81px, fixed) and the headline's first line, and percentages of a
            hero that is 601px tall at lg but 763px on a phone do not hold both
            bounds at once — the measured band is 81→129 below lg and 81→214
            from lg up. A percentage set that cleared the copy at 1440 put the
            third star on top of the headline at 390. Pixels hold at every
            width, and the two ranges are what the lg: variants encode. */}
        <span className="animate-9e-twinkle-a absolute left-[5%] top-[92px] block h-[3px] w-[3px] rounded-full bg-white opacity-60 lg:top-[100px]" />
        <span className="animate-9e-twinkle-b absolute left-[27%] top-[104px] block h-[2px] w-[2px] rounded-full bg-white opacity-60 lg:top-[140px]" />
        <span className="animate-9e-twinkle-c absolute left-[49%] top-[116px] block h-[3px] w-[3px] rounded-full bg-white opacity-60 lg:top-[180px]" />
      </div>

      {/* pt-[81px]: the header's height, handed back so the headline never
          sits under the transparent header. */}
      <div className="relative pt-[81px]">
        {/* HEIGHT IS CONTENT-DRIVEN, not aspect-driven: a full-bleed 16:9 band
            would be 1600px tall at 2560 wide. The height is whatever the copy
            needs plus a min-height at lg, so it is the SAME at 1440 and at
            2560 and the background simply crops wider.

            `relative` is load-bearing: the astronaut below is absolutely
            positioned, and this is the element it anchors to — the CENTRED
            1200px container, never the viewport. Anchored to the viewport's
            right edge it would fly away from the text on an ultra-wide screen
            and leave a dead gap in the middle. */}
        <div className="relative mx-auto flex min-h-[calc(100dvh-81px)] max-w-[1200px] flex-col justify-center px-4 py-8 sm:px-6 lg:min-h-[520px] lg:px-8 lg:py-16 min-[1537px]:h-full min-[1537px]:min-h-0">
          {/* The cap is what decides whether the headline is two lines or
              three. Measured in Chrome: at 560px the browser broke
              `มืออาชีพ` across lines — Thai has no inter-word spaces and is
              segmented by dictionary, so `มือ` and `อาชีพ` are both legal
              break points. 600/760 gives line 2 room at every lg+ width. */}
          <div
            className=" relative z-20
                      
                -translate-y-[35%]

                sm:-translate-y-[110px]

                md:-translate-y-[120px]

                lg:translate-y-0
                lg:max-w-[600px]

                xl:max-w-[760px]
                "
          >
            <h2 className="text-3xl font-bold leading-snug text-white sm:text-4xl xl:text-5xl xl:leading-[1.25]">
              <span className="block !font-[inherit]">ค้นหาหลักสูตรที่ใช่</span>
              <span className="block !font-[inherit]">
                {/* TWO mechanisms, because they cover different widths.
                    `lg:whitespace-nowrap` makes the phrase unbreakable from lg
                    up, where the column is wide enough that it costs nothing —
                    it holds even if the copy or the font changes. It must NOT
                    apply below lg: on a 390px phone an unbreakable 19-character
                    Thai phrase would overflow the viewport sideways.
                    `inline-block` is what covers the phone. It makes the phrase
                    one item on its parent's line, so the browser breaks BEFORE
                    it rather than inside it — measured at 390px, that is the
                    difference between `…เป็นมือ / อาชีพ` and a clean break at
                    the space. If it still does not fit alone it wraps
                    internally, so the failure mode stays a wrap, never an
                    overflow. */}
                พัฒนาทักษะ{" "}
                <span className="inline-block !font-[inherit] text-9e-lime lg:whitespace-nowrap">
                  สู่ความเป็นมืออาชีพ
                </span>
              </span>
            </h2>

            <p className="mt-5 text-base leading-relaxed text-white/85 sm:text-lg">
              {HERO_DESCRIPTION}
            </p>

            {/* Mobile: both buttons full-width and stacked, so neither is a
                narrow tap target on a phone. From `sm` up they sit side by
                side at their natural width. */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Link
                href="/training-course"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-9e-lime px-8 py-3.5 text-base font-semibold text-9e-navy transition-colors duration-9e-micro ease-9e hover:bg-9e-lime-scale-400 sm:w-auto"
              >
                เลือกดูหลักสูตร
                <ArrowRight className="h-5 w-5" strokeWidth={2} />
              </Link>
              <Link
                href="/registration/in-house"
                className="inline-flex w-full items-center justify-center rounded-full border border-white/60 px-8 py-3.5 text-base font-semibold text-white transition-colors duration-9e-micro ease-9e hover:border-9e-air hover:bg-9e-air/10 hover:text-9e-air sm:w-auto"
              >
                อบรมภายในองค์กร
              </Link>
            </div>
          </div>

          {/* น้องนาย on the moon. NOT `priority` — the background above is the
              LCP element and preloading two hero images makes them compete.
              `object-contain`, never `object-cover`: this is a transparent PNG
              whose moon runs to the frame edge, and a cover crop would slice
              it.

              Below `lg` it is a normal block BELOW the CTAs, at a reduced
              size, so it can never sit behind or over the text. From `lg` it
              is absolutely positioned into the bottom-right OF THE CENTRED
              1200px CONTAINER — its offset parent is that container, not the
              section — so on a 2560px screen it stays beside the copy instead
              of hugging the viewport edge.

              FIXED widths, not a percentage: a percentage shrinks with the
              container at exactly the width where the text column is already
              tightest (1024–1280), which is where the two would meet. The
              source also carries ~27% empty margin on its own left edge, so
              the painted art starts well right of this box's left edge. */}
          {/* The drift is on THIS box, not on the <Image>: the image is the
              thing that must keep its `object-contain` box, and animating the
              wrapper leaves the layout untouched. Vertical only and downward
              only — see the keyframe's note in tailwind.config.js for both
              reasons (49px of measured horizontal clearance; a flush bottom
              edge that must not lift). No scale, so the mascot never changes
              size. `data-hero-motion` is the reduced-motion hook. */}
          <div
            data-hero-motion="mascot"
            className="
    pointer-events-none
    animate-9e-float
    absolute
    z-10
    max-w-none

    /* Mobile < 640px */
    -bottom-6
    left-0
    right-0
    mx-auto
    h-[380px]
    w-[380px]

    /* Small 640px+ */
    sm:h-[340px]
    sm:w-[440px]

    /* Tablet 768px+ */
    md:-bottom-4
    md:left-1/2
    md:-translate-x-full
    md:h-[360px]
    md:w-[560px]

    /* Desktop 1024px+ */
    lg:left-auto
    lg:translate-x-0
    lg:-bottom-[110px]
    lg:-right-[180px]
    lg:h-[460px]
    lg:w-[640px]

    /* Large Desktop 1280px+ */
    xl:-bottom-[15%]
    xl:-right-[15%]
    xl:h-[500px]
    xl:w-[700px]
  "
          >
            <Image
              src="/hero-img/nongnai.png"
              alt=""
              fill
              sizes="
      (min-width: 1280px) 700px,
      (min-width: 1024px) 640px,
      (min-width: 768px) 560px,
      (min-width: 640px) 440px,
      380px
    "
              className="object-contain object-bottom"
            />
          </div>
        </div>
      </div>

      {/* ── THE SEAM WITH THE SECTION BELOW ──────────────────────────────────
          Layer 1 of 3. The other two are on FeatureContentSection; all three
          are defined together in the "FEATURE CONTENT SECTION" block at the
          bottom of globals.css, which is also where this gradient's height
          (--9e-fc-fade: 120px, 180px from lg) and its colour come from.

          Transparent at the top to that section's base colour at the bottom,
          so the artwork does not simply stop at a horizontal line. It is
          NEVER written as a `to-transparent` gradient: `transparent` is
          transparent BLACK and interpolating through it paints a grey band
          along the very seam this exists to erase. Same R,G,B, alpha 0.

          ── z-[15] IS THE WHOLE POINT OF THIS ELEMENT'S POSITION ────────────
          The hero's internal rungs are: mascot z-10, copy + CTAs z-20. Both
          resolve in the same stacking context — the wrappers between them are
          `position:relative` with `z-index:auto`, which does NOT open a new
          one — so a number between the two lands exactly where it reads.

          ABOVE THE MASCOT (10), and that is not a detail. น้องนาย is parked at
          `lg:-bottom-[110px]` and hard-clipped by this section's
          overflow-hidden, i.e. it is cut off at precisely the seam line. Put
          this fade underneath it and everything else dissolves while the
          mascot keeps a razor-straight cut edge — the seam survives in the one
          place the eye is already looking.

          BELOW THE COPY (20), so the headline and both CTAs stay at full
          contrast no matter how short the viewport gets and the fade never
          washes over a button.

          `pointer-events-none`: it spans the full width across the CTAs' row
          on a short viewport, and this repo has already shipped an invisible
          strip that ate hero clicks. */}
      <div
        aria-hidden="true"
        className="fc-hero-fade pointer-events-none absolute inset-x-0 bottom-0 z-[15]"
      />

      {/* THE SWITCH-BACK MARKER, AND IT IS AT THE TOP OF THE HERO ON PURPOSE.
          DO NOT MOVE IT BACK TO THE BOTTOM.
          At the bottom it marked "any part of the hero is still visible", so
          the header stayed transparent while the whole hero — headline, CTAs
          and all — scrolled up underneath it. The CTAs rendered on top of the
          nav links, both unreadable. That is guaranteed whenever the hero is
          taller than the space under the header, which the notification bar
          makes certain and which happens on any phone.
          At the TOP it marks the only moment transparency is safe: the hero's
          top edge is level with the header's own top (that is what the -mt
          pull-up above arranges), so while this point is at or below the
          viewport top, nothing of the hero has passed under the header yet.
          PublicHeaderClient observes it. Still an IntersectionObserver, never
          a scrollY threshold — TopNotificationBar renders or not, so the
          header's distance from the top of the document is not a constant. */}
      <div
        id={HERO_OVERLAY_SENTINEL_ID}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 h-px w-full"
      />
    </section>
  );
}
