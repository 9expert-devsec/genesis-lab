'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Founder/instructor quote band. Static content — name, title, and
 * portrait don't change often, so we don't gate this on a CMS fetch.
 *
 * Photo bleeds to the bottom edge: the section is `overflow-hidden`
 * and the right column anchors the image with `items-end`. On mobile
 * the photo is hidden so the quote keeps its own breathing room.
 */

/**
 * ROUND HS-C: fade-in ONLY — no translateY, no scale. This is the page's
 * closing statement, deliberately kept still; every other content section
 * moves on entrance, this one just settles into place.
 */
const FADE_ONLY_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.7, ease: 'easeOut' } },
};

export function InstructorQuote() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      className="relative overflow-hidden bg-[#0D1B2A]"
      variants={FADE_ONLY_VARIANTS}
      initial={shouldReduceMotion ? false : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
    >
      {/* Background artwork — the wallpaper this section is dressed in.
          It replaces the hand-drawn circuit-board SVG (a flat #0D1B2A base
          rect, dot grids, traces and glowing junction nodes) that used to
          paint this layer.

          DELIVERY IS UNCHANGED IN KIND: still one absolutely-positioned,
          full-bleed ELEMENT behind the content, not a CSS background and
          deliberately not next/image — this is decoration, not content, and
          the optimiser would re-encode an asset that was placed as-is.

          `object-cover object-center` is the CSS spelling of the SVG's
          `preserveAspectRatio="xMidYMid slice"`, so the crop rule the section
          already had is carried over rather than reinvented: fill the band,
          keep the aspect ratio, centre what does not fit. At desktop widths
          the section is wider than the art's 3:1, so the full width shows and
          the crop is vertical; at phone widths the section is taller than it
          is wide and the crop is horizontal, onto the middle of the frame.

          The SVG's base `<rect fill="#0D1B2A">` moves to the section itself
          (below) so the band keeps exactly that colour while the PNG loads. */}
      <img
        src="/motto/wallpaper-motto.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Scrim between the artwork and the text, LIVE BELOW lg AND ONLY THERE.

          It is a crop problem, not a taste one. `object-cover object-center`
          keeps the middle of a 3:1 frame, so which part of the art ends up
          under the quote depends entirely on the band's shape:

            · at lg and up the band is wider than 3:1, the crop is vertical,
              the full width shows, and the text column sits on the empty space
              at the left of the frame — measured DARKER than the flat #0D1B2A
              this replaced (median white contrast 20.5:1 against 17.4:1). A
              wash there would dull art that costs the text nothing, so at lg
              the element goes back to `display: none`.
            · below lg the band is taller than it is wide, the crop turns
              horizontal, and only the middle ~14% of the frame survives —
              which is the lit limb and two glowing network nodes. Behind the
              stacked mobile text that measured p95 3.5:1 for white and about
              2.9:1 for the lime, with the limb core far worse.

          Hence one breakpoint rather than a blanket overlay: `lg:hidden` with
          no base display class, so the div is block below lg and gone above.
          The 80% #0a1628 lifts the same phone band to the numbers in the
          round's report. Nothing else about the element changed. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] lg:hidden bg-[#0a1628]/80 "
      />

      <div className="relative z-[2] mx-auto grid min-h-[400px] max-w-[1200px] grid-cols-1 lg:grid-cols-2  max-md:px-4">
        <div className="flex flex-col justify-center gap-6 py-12 lg:py-16">
          <span
            className="select-none font-serif text-7xl leading-none text-9e-lime"
            aria-hidden
          >
            &ldquo;
          </span>

          <p className="max-w-2xl text-lg font-bold tracking-wide text-center text-9e-ice sm:text-xl lg:text-2xl lg:leading-[1.5]">
            เราเป็นส่วนหนึ่งของการสนับสนุนบุคคลและองค์กร<br className="hidden lg:inline" />
            ในการปรับตัวตามความเปลี่ยนแปลงของเทคโนโลยี<br className="hidden lg:inline" />
            เพื่อนำมาใช้เพิ่มประสิทธิภาพการทำงาน สร้างความได้เปรียบ{' '}
            <span className="text-9e-lime">ให้เหนือคู่แข่ง</span>
          </p>

          <div className="hidden lg:inline text-center">
            <p className="text-base font-bold text-9e-ice ">
              อ.ชไลเวท พิพัฒพรรณวงศ์
            </p>
            <p className="text-sm text-9e-lime">
              ประธานเจ้าหน้าที่บริหาร
            </p>
            <p className="text-sm text-9e-slate-dp-600">
              บริษัท นายน์เอ็กซ์เพิร์ท จำกัด Microsoft MVP 365 Copilot & Power BI
            </p>
          </div>
        </div>

        <div className=" min-h-[400px] items-center justify-center flex flex-col lg:items-end lg:justify-end">
          <Image
            src="/people/Aj.Chalaivate.webp"
            alt="อ.ชไลเวท พิพัฒนพรรณวงศ์"
            width={400}
            height={500}
            className="object-contain object-bottom"
            style={{ maxHeight: '425px' }}
            priority
          />

          <div className="text-center lg:hidden py-6">
            <p className="text-base font-bold text-9e-ice ">
              อ.ชไลเวท พิพัฒพรรณวงศ์
            </p>
            <p className="text-sm text-9e-lime">
              ประธานเจ้าหน้าที่บริหาร
            </p>
            <p className="text-sm text-9e-slate-dp-600">
              บริษัท นายน์เอ็กซ์เพิร์ท จำกัด Microsoft MVP 365 Copilot & Power BI
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
