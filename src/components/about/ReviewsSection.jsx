/**
 * /about-us "ผู้เรียนพูดถึงเราอย่างไร" — the first three of Home's featured
 * reviews (same loader: getLandingData().reviews, admin order), in a STATIC
 * layout so About does not repeat Home's carousel. Hover only
 * (globals.css, .about-card / .about-review-*).
 */
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
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-9e-signature-900 text-base font-bold text-9e-action"
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
    <section className="bg-[var(--page-bg-muted)] px-4 py-20 lg:px-6 lg:py-24">
      <div className="mx-auto max-w-[1200px]">
        <h2 className="text-center font-heading text-3xl font-bold leading-snug text-[var(--text-primary)] md:text-[40px]">
          ผู้เรียนพูดถึงเราอย่างไร
        </h2>

        <div role="region" tabIndex={0} aria-label="รีวิวจากผู้เรียน" className="about-review-scroller mt-10 lg:mt-12">
          <ul className="about-review-row">
            {shown.map((r) => {
              const meta = [r.reviewerRole, r.reviewerCompany].map((s) => String(s ?? '').trim()).filter(Boolean).join(' · ');
              return (
                <li
                  key={r._id ?? r.id ?? r.reviewerName}
                  // Surface = Home's ReviewCard as it renders at desktop (the
                  // non-featured state every card is in there).
                  className="about-card about-review rounded-2xl bg-white opacity-90 dark:bg-9e-navy dark:ring-1 dark:ring-[#1e3a5f]/60"
                >
                  <Stars rating={r.rating} />
                  <blockquote className="mt-4 flex-1 text-base leading-relaxed text-[var(--text-primary)]">
                    <p>“{String(r.comment).trim()}”</p>
                  </blockquote>
                  {r.courseName && (
                    <p className="mt-4 text-sm font-bold text-9e-navy dark:text-[#48B0FF]">{r.courseName}</p>
                  )}
                  <div className="mt-5 flex items-center gap-3 border-t border-[var(--surface-border)] pt-5">
                    <Avatar src={r.avatarUrl} name={r.reviewerName} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-9e-navy dark:text-white">{r.reviewerName}</p>
                      {meta && <p className="truncate text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">{meta}</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
