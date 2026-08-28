"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

/**
 * Shared FAQ accordion — the single source of truth for the per-course FAQ
 * look-and-feel. FIVE page types render it, not three: masterclass
 * ([slug]/_components/MasterclassDetailClient.jsx:894), program
 * (program/[slug]/…:145), skill (skill/[slug]/…:136), public course
 * ((public)/[...slug]/page.jsx:881) and career path (…/CareerPathDetail.jsx:625).
 * Extracted verbatim from MasterclassDetailClient so all of them render
 * identically — which is also why a defect here reaches all of them at once.
 *
 * It renders LocalFaq documents (`question_th` / `answer_html`), not the
 * upstream Faq sync collection — that one is rendered by
 * (public)/faq/_components/FaqClient.jsx.
 *
 * ══ THE REVEAL HAS NO HEIGHT CEILING, AND MUST NEVER GROW ONE ═══════════════
 *
 * ── THE BUG THIS REPLACES ──────────────────────────────────────────────────
 * The body animated `overflow-hidden` + `max-h-0` -> `max-h-96` — a 384px
 * ceiling on `answer_html`, which is admin-authored HTML with NO length limit
 * (LocalFaq.js:35 is a plain String, no maxlength). Over the ceiling the answer
 * was CLIPPED MID-LINE with no scrollbar and no affordance, reading as the end
 * of the answer.
 *
 * MEASURED over all 36 active LocalFaq documents rather than assumed. On a
 * desktop text column (~704px) NONE exceeded 384px — the worst estimated ~336px,
 * one line of headroom. On a PHONE the column is ~296px, the same text wraps to
 * roughly twice the lines, and TWO answers land around 550px — ~45% past the
 * ceiling:
 *   · skill/AI      "เริ่มต้นเรียน AI ต้องมีพื้นฐานอะไรมาก่อนบ้าง ?"
 *   · program/POWER-BI "คอร์ส Power BI ของ 9Expert มีกี่หลักสูตร…"
 * So this was already losing content in production, on the viewport where most
 * of the traffic is, and was invisible on the desktop where it gets reviewed.
 *
 * ── WHY RAISING THE NUMBER IS NOT THE FIX ──────────────────────────────────
 * A ceiling is a guess about content height made at author time, and answers are
 * unbounded. A bigger constant relocates the bug to the next long answer, and it
 * degrades every SHORT one: a max-height transition interpolates toward the
 * DECLARED ceiling, not real content height, so a one-line answer under a taller
 * ceiling spends even more of its 300ms travelling through empty space.
 *
 * ── WHAT IT DOES INSTEAD: A GRID TRACK, 0fr -> 1fr ─────────────────────────
 * Same fix, same reasoning and same shape as CourseOutline.jsx (11e460d) and the
 * pre-existing FaqClient.jsx:26-28. `grid-template-rows` interpolates to the
 * row's REAL height, so there is no ceiling and nothing to guess. CSS only.
 *
 * ── TIMING IS UNCHANGED, AND THAT IS CHECKED, NOT ASSUMED ──────────────────
 * `transition-all duration-300` became `transition-[grid-template-rows]
 * duration-9e-reveal ease-9e`. Every value is identical: `9e-reveal` IS 300ms
 * (tailwind.config.js:140, commented "Accordion, dropdown"), and `ease-9e` IS
 * `cubic-bezier(0.4, 0, 0.2, 1)`, which is also Tailwind's default and therefore
 * exactly what this element already used with no `ease-*` class. So the tokens
 * were adopted because they are free here, not to change motion — 300ms before,
 * 300ms after.
 *
 * The property narrowed on purpose: `transition-all` animated everything
 * animatable on this element. Nothing else on it transitions, so narrowing costs
 * nothing and stops a future style from being animated by accident.
 *
 * ── BROWSER SUPPORT ────────────────────────────────────────────────────────
 * Animating grid-template-rows 0fr<->1fr: Chrome/Edge 107+, Safari 16.0+,
 * Firefox 66+. Below those it snaps instead of easing and ALL CONTENT IS
 * PRESENT — the old failure mode lost content, this one loses an animation.
 *
 * ── prefers-reduced-motion ─────────────────────────────────────────────────
 * UNCHANGED, handled globally: globals.css:449-455 clamps transition-duration to
 * 0.01ms !important on `*`, which covered the old transition and covers this one.
 */
export function FaqAccordionItem({ faq }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`border rounded-2xl dark:border-gray-700 ${open ? "border-9e-action-scale-600 shadow-lg shadow-9e-action-scale-600/20" : "border-gray-200"}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left text-base md:text-[17px] font-bold text-9e-navy dark:text-white"
      >
        <span>{faq.question_th}</span>
        <div
          className="p-2
         rounded-full bg-9e-signature-900"
        >
          <Plus
            size={16}
            className={`shrink-0 transition-transform duration-200 text-9e-action ${open ? "rotate-45" : ""}`}
          />
        </div>
      </button>
      {/* THE REVEAL ANIMATES A GRID TRACK, NOT A max-height CEILING.
          See the header — a 384px ceiling was clipping answers on mobile. */}
      <div
        className={`grid transition-[grid-template-rows] duration-9e-reveal ease-9e ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        {/* The grid item, and it must be able to shrink below its own content.
            A grid item's `min-height` is `auto`, which refuses to go under
            min-content — so without `min-h-0` the 0fr track never closes and
            every answer sits permanently open. `overflow-hidden` is what clips
            DURING the transition. Neither is enough on its own. */}
        <div className="min-h-0 overflow-hidden">
          <div
            className="prose prose-base dark:prose-invert px-4 pb-4 text-gray-600 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: faq.answer_html }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * FAQ section wrapper. Renders nothing when there are no FAQs (no heading, no
 * empty box) — same guard as the masterclass page.
 *
 * `className` / `headingClassName` let each page match the container width and
 * heading style of its surrounding sections (the masterclass page is a
 * full-width centered block; the course/career pages sit inside a narrower
 * content column), so the defaults reproduce the original masterclass markup
 * exactly.
 *
 * @param {Array}  faqs             Active FAQs, already ordered by display_order.
 * @param {string} [title]         Heading text.
 * @param {string} [id]            Section id (jump-anchor target).
 * @param {string} [className]     Classes for the <section> wrapper.
 * @param {string} [headingClassName] Classes for the <h2> heading.
 */
export function FaqAccordionSection({
  faqs,
  title = "คำถามที่พบบ่อย",
  id = "faq",
  className = "max-w-3xl mx-auto px-4 py-10 md:py-16",
  headingClassName = "mb-8 text-center text-xl md:text-2xl font-bold text-9e-navy dark:text-white",
}) {
  if (!faqs?.length) return null;

  return (
    <section id={id} className={className}>
      <h2 className={headingClassName}>{title}</h2>
      <div className="flex flex-col gap-4">
        {faqs.map((f) => (
          <FaqAccordionItem key={f._id} faq={f} />
        ))}
      </div>
    </section>
  );
}
