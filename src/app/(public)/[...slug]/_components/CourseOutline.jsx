'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContentSection } from './ContentSection';

/**
 * Outline accordion.
 *
 * Upstream shape: `training_topics` (no `course_` prefix) is an array of
 * `{ title, bullets: string[] }` — each chapter has its own sub-bullets.
 *
 * Every topic defaults to open. The ซ่อน/แสดงทั้งหมด toggle lives in the
 * ContentSection action slot.
 *
 * ══ THE REVEAL HAS NO HEIGHT CEILING, AND MUST NEVER GROW ONE ═══════════════
 *
 * ── THE BUG THIS REPLACES, CONFIRMED IN A BROWSER ──────────────────────────
 * The panel used to animate `overflow-hidden` + `max-h-0` -> `max-h-[800px]`.
 * 800px was a guess, and courses exceed it: on POWER-BI-XDM the panel
 * "1. เข้าใจ Power BI Semantic Model" (27 bullets) was CLIPPED MID-LINE with
 * the remaining bullets unreachable — no scrollbar, no "show more", nothing on
 * screen to say anything was missing. Content loss that reads as the end of the
 * list. Its row 3, "Dimensional Model และ Relationship", is worse: 41 bullets,
 * 2,268 characters.
 *
 * ── WHY RAISING THE NUMBER IS NOT THE FIX ──────────────────────────────────
 * Two reasons, and the second is the one that is easy to miss:
 *   1. a bigger constant relocates the same bug to the next long course — it is
 *      the same guess, made again;
 *   2. it DEGRADES the animation for every short panel. A max-height transition
 *      interpolates toward the DECLARED ceiling, not toward real content
 *      height, so a 3-bullet panel under an 800px ceiling spends most of its
 *      300ms travelling through empty space. Raising the ceiling makes every
 *      short panel worse in order to make one long panel merely less broken.
 *
 * ── WHAT IT DOES INSTEAD: A GRID TRACK, 0fr -> 1fr ─────────────────────────
 * `grid-template-rows` interpolates to the row's REAL content height, so there
 * is no ceiling to exceed and nothing to guess. CSS only — no JS, no
 * ResizeObserver, no re-measure on font load. The same technique already ships
 * in this repo at src/app/(public)/faq/_components/FaqClient.jsx:26-28.
 *
 * The child needs BOTH `min-h-0` and `overflow-hidden`, for different reasons —
 * see the comment at the element.
 *
 * ── BROWSER SUPPORT, AND WHAT AN OLD BROWSER GETS ──────────────────────────
 * Animating `grid-template-rows` between `0fr` and `1fr` needs Chrome/Edge 107+
 * (Oct 2022), Safari 16.0+ (Sep 2022), Firefox 66+ (Mar 2019). Below those the
 * track still resolves — the panel opens and closes correctly and ALL CONTENT
 * IS PRESENT — it simply snaps instead of easing. That is the right direction
 * to degrade in: the old code's failure mode was losing content, this one's is
 * losing an animation.
 *
 * ── prefers-reduced-motion ─────────────────────────────────────────────────
 * UNCHANGED, and handled globally rather than here: globals.css:449-455 clamps
 * `transition-duration` to 0.01ms !important on `*`. That covered the old
 * max-height transition and covers this one identically — a reduced-motion
 * reader saw an instant open before and sees an instant open now.
 */
/**
 * ══ TWO RENDER PATHS, AND THEY ARE DELIBERATELY NOT UNIFIED ════════════════
 *
 * `richHtml` is `string[]` (per-row sanitised HTML, index-aligned with
 * `training_topics`) or NULL. It is prepared ON THE SERVER by
 * lib/courses/courseOutlineView — this component must never import that module
 * or its dependencies, which would ship parse5 and sanitize-html to the browser
 * to re-sanitise stored content on every page view.
 *
 * NULL is every course today: nothing has a rich copy and there is no backfill.
 *
 * ── WHY THE PLAIN PATH IS NOT ROUTED THROUGH THE HTML PATH ─────────────────
 * It would be tidier to escape the plain bullets into markup and render one
 * code path. It would also be wrong, twice:
 *
 *   · UIPATH stores `List<mailmessage>` — a C# generic, the only angle bracket
 *     in 4,443 measured values. React escaping renders it correctly today. Sent
 *     through dangerouslySetInnerHTML it becomes an unknown element and THE
 *     TEXT DISAPPEARS. Unifying would break a live row to simplify a branch.
 *   · It would make the inertness proof unprovable. "Every one of the 79
 *     courses renders byte-identical to before" is only checkable while the
 *     plain path is the SAME CODE it was, not an equivalent rewrite.
 *
 * So: plain content keeps going through React escaping, always.
 */
export function CourseOutline({ course, richHtml = null }) {
  const topics = Array.isArray(course?.training_topics)
    ? course.training_topics.filter(Boolean)
    : [];

  const [openMap, setOpenMap] = useState(() =>
    Object.fromEntries(topics.map((_, i) => [i, true]))
  );

  if (!topics.length) return null;

  const allOpen = topics.every((_, i) => openMap[i]);

  const toggleAll = () => {
    const next = !allOpen;
    setOpenMap(Object.fromEntries(topics.map((_, i) => [i, next])));
  };

  const toggle = (i) => setOpenMap((prev) => ({ ...prev, [i]: !prev[i] }));

  return (
    <ContentSection
      id="outline"
      title="หัวข้อการฝึกอบรม"
      action={
        <button
          type="button"
          onClick={toggleAll}
          className="text-sm font-medium text-9e-action hover:underline"
        >
          {allOpen ? 'ซ่อนทั้งหมด' : 'แสดงทั้งหมด'}
        </button>
      }
    >
      <div className="space-y-2">
        {topics.map((topic, i) => {
          const open = Boolean(openMap[i]);
          const bullets = Array.isArray(topic?.bullets)
            ? topic.bullets.filter(Boolean)
            : [];
          const title = topic?.title ?? '';
          /**
           * This row's rich HTML, or '' — index-aligned with `topics`, which is
           * why courseOutlineView applies the SAME `.filter(Boolean)` to the
           * same array before resolving. An empty entry falls through to the
           * plain path, which for a bullet-less row renders nothing either way.
           */
          const rich = Array.isArray(richHtml) ? (richHtml[i] || '') : '';
          return (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-[var(--surface-border)]"
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 bg-[var(--surface-raised)] px-5 py-3 text-left transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-hover)]"
              >
                <span className="text-base font-semibold text-[var(--text-primary)]">
                  {i + 1}. {title}
                </span>
                {open ? (
                  <ChevronUp
                    className="h-4 w-4 shrink-0 text-[var(--text-secondary)]"
                    strokeWidth={2}
                  />
                ) : (
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-[var(--text-secondary)]"
                    strokeWidth={2}
                  />
                )}
              </button>

              {/* THE REVEAL ANIMATES A GRID TRACK, NOT A max-height CEILING.
                  See the module header — a ceiling silently ate content. */}
              <div
                className={cn(
                  'grid transition-[grid-template-rows] duration-9e-reveal ease-9e',
                  open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                )}
              >
                {/* The grid item, and it must be able to shrink below its own
                    content. A grid item's `min-height` is `auto`, which refuses
                    to go under min-content — so without `min-h-0` the 0fr track
                    would never actually close and the panel would sit open.
                    `overflow-hidden` is what clips DURING the transition; on its
                    own it is not enough, and neither is enough alone. */}
                <div className="min-h-0 overflow-hidden">
                  {rich ? (
                    /* RICH — server-sanitised HTML for THIS row. The nested list
                       markers are CSS on `.topic-rich`; a real <ul> from HTML
                       cannot carry the hand-rolled <span> the plain path uses. */
                    <div
                      className="topic-rich space-y-1.5 border-t border-[var(--surface-divider)] bg-[color-mix(in_srgb,var(--surface-muted)_40%,transparent)] px-5 py-3 text-base text-[var(--text-secondary)]"
                      dangerouslySetInnerHTML={{ __html: rich }}
                    />
                  ) : (
                    bullets.length > 0 && (
                      <ul className="space-y-1.5 border-t border-[var(--surface-divider)] bg-[color-mix(in_srgb,var(--surface-muted)_40%,transparent)] px-5 py-3">
                        {bullets.map((bullet, j) => (
                          <li
                            key={j}
                            className="flex items-start gap-2 text-base text-[var(--text-secondary)]"
                          >
                            <span className="mt-0.25 shrink-0 text-9e-air">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ContentSection>
  );
}
