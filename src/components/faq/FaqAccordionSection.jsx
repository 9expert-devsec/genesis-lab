"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

/**
 * Shared FAQ accordion — the single source of truth for the per-course FAQ
 * look-and-feel used by the masterclass, public course, and career path
 * detail pages. Extracted verbatim from MasterclassDetailClient so all three
 * page types render identically.
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
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-96" : "max-h-0"}`}
      >
        <div
          className="prose prose-base dark:prose-invert px-4 pb-4 text-gray-600 dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: faq.answer_html }}
        />
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
