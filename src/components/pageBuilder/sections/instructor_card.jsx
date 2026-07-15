import Image from 'next/image';

/**
 * instructor_card — one instructor, referenced by `content.instructorId` (2C.2a,
 * authored reference). Like course_card, it renders from injected `data`
 * (resolved above the renderer from local Mongo), never a fetch of its own.
 *
 * No reusable instructor tile existed (the instructor components are page-
 * specific), so this is a small presentational card. Its image is the stored
 * `image_url` (existing MSDB/Mongo reference) rendered `unoptimized` — no new
 * upload, so item 5's orphaned-asset gap is not widened.
 *
 * Fails closed: an unresolved / unknown instructorId arrives as null → renders
 * nothing, and the editor warns at the field.
 */
export function InstructorCardSection({ data }) {
  if (!data) return null;
  const name = typeof data.name === 'string' ? data.name : '';
  const title = typeof data.title === 'string' ? data.title : '';
  const bio = typeof data.bio === 'string' ? data.bio : '';
  const image = typeof data.image_url === 'string' ? data.image_url.trim() : '';
  const specialties = Array.isArray(data.specialties) ? data.specialties.filter(Boolean) : [];

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center rounded-9e-lg border border-[var(--surface-border)] p-6 text-center">
      {image && (
        <Image
          src={image}
          alt={name}
          width={96}
          height={96}
          unoptimized
          className="h-24 w-24 rounded-full object-cover"
        />
      )}
      {name && <h3 className="mt-3 font-heading text-lg font-bold">{name}</h3>}
      {title && <p className="mt-0.5 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">{title}</p>}
      {bio.trim() && (
        <p className="mt-2 whitespace-pre-line text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">{bio}</p>
      )}
      {specialties.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {specialties.map((s, i) => (
            <span key={i} className="rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-navy dark:bg-[#0D1B2A] dark:text-white/90">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
