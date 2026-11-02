import { Star } from 'lucide-react';

/**
 * Stars are the ONE yellow thing in 9Expert Play (#FACC15). XP stays lime, and
 * the deprecated brand amber (#FFB020 / #FFBC00) is never used. An unearned
 * star keeps the outline look of wherever it sits, so `emptyClass` varies.
 */
export const STAR_FILLED = 'fill-[#FACC15] text-[#FACC15]';

export function StarIcons({ stars, max = 3, className = 'h-4 w-4', emptyClass = 'text-white/25', label = false }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      {...(label ? { role: 'img', 'aria-label': `ได้ ${stars} จาก ${max} ดาว` } : { 'aria-hidden': 'true' })}
    >
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} aria-hidden="true" strokeWidth={1.75} className={`${className} ${i < stars ? STAR_FILLED : emptyClass}`} />
      ))}
    </span>
  );
}
