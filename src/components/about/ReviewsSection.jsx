/**
 * /about-us "ผู้เรียนพูดถึงเราอย่างไร" — the first three of Home's featured
 * reviews (same loader: getLandingData().reviews, admin order), in a STATIC
 * layout so About does not repeat Home's carousel. Hover is a border colour
 * only (globals.css, .about-card / .about-review-*).
 */
import { AboutSection, AboutSectionHeader } from '@/components/about/AboutSection';

const MAX_REVIEWS = 3;

// Stars exactly as Home's StarRating paints them (★, #FFBC00 / gray-200),
// at ~16px, with the score as text for screen readers.
function Stars({ rating }) {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  if (!n) return null;
  return (
    <p className="flex gap-[2px] text-base leading-none">
      <span className="sr-only">คะแนน {n} จาก 5</span>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden="true" className={i < n ? 'text-[#FFBC00]' : 'text-gray-200'}>
          ★
        </span>
      ))}
    </p>
  );
}

function Avatar({ src, name }) {
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ab-panel-2)] text-base text-[var(--ab-meta)]"
      >
        {(String(name ?? '').trim()[0] ?? '?').toUpperCase()}
      </span>
    );
  }
  // Same Cloudinary trick as Home's reviews: request a 2× crop of the 40px
  // avatar instead of the 800px original.
  const small = src.includes('res.cloudinary.com')
    ? src.replace('/upload/', '/upload/w_80,h_80,c_fill,f_auto,q_auto/')
    : src;
  // eslint-disable-next-line @next/next/no-img-element -- pre-sized remote avatar
  return <img src={small} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
}

export default function ReviewsSection({ reviews = [] }) {
  const shown = reviews.filter((r) => r?.comment && r?.reviewerName).slice(0, MAX_REVIEWS);
  if (!shown.length) return null;

  return (
    <AboutSection>
      <AboutSectionHeader title="ผู้เรียนพูดถึงเราอย่างไร" />

      <div role="region" tabIndex={0} aria-label="รีวิวจากผู้เรียน" className="about-review-scroller mt-10 lg:mt-12">
        <ul data-reveal-group="" className="about-review-row">
          {shown.map((r) => {
            const meta = [r.reviewerRole, r.reviewerCompany].map((s) => String(s ?? '').trim()).filter(Boolean).join(' · ');
            return (
              // An opaque panel object; the stars are its only colour.
              <li key={r._id ?? r.id ?? r.reviewerName} data-reveal="" className="about-card about-review">
                <Stars rating={r.rating} />
                <blockquote className="mt-4 flex-1 text-base leading-relaxed text-[var(--ab-bright)]">
                  <p>“{String(r.comment).trim()}”</p>
                </blockquote>
                {r.courseName && (
                  <p className="mt-4 text-sm text-[var(--ab-meta)]">{r.courseName}</p>
                )}
                <div className="mt-5 flex items-center gap-3 border-t border-[var(--ab-hairline)] pt-5">
                  <Avatar src={r.avatarUrl} name={r.reviewerName} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--ab-bright)]">{r.reviewerName}</p>
                    {meta && <p className="truncate text-xs text-[var(--ab-meta)]">{meta}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </AboutSection>
  );
}
