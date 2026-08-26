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
 *
 * ── WHAT TAKES THE ACCENT, AND WHAT DELIBERATELY DOES NOT ─────────────────
 * The specialty chips, and only those — see the note at them. Everything else
 * here is covered by the rule that headings and body copy are never accented,
 * which holds across every consumer without exception:
 *
 *   the name    a heading
 *   the title   prose
 *   the bio     prose
 *
 * The avatar is a photograph and has no colour of ours to override. The card's
 * own border stays neutral, which is a JUDGEMENT and not one of the rules —
 * flagged here so a later round can overturn it deliberately: accenting a
 * component's structural outline is not something any consumer does.
 *
 * The fixed card width is untouched. It is a separate open finding (the
 * envelope's ความกว้าง cannot change it), it is pinned by its own tripwire, and
 * nothing about a colour belongs in that argument.
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
          {/*
            THE CHIP LABEL TAKES THE SECTION ACCENT, following icon_card's chip
            — the same variable in the same ornament role, on the identical
            shape: a small pill carrying a short label. These were fully
            neutral, which is the finding: the pattern already had a treatment
            for this and one of the two components was not using it.

            ── THE SURFACE IS DELIBERATELY *NOT* COPIED, AND THAT IS A FINDING ─
            icon_card's chip asks for a tenth-strength accent background, and
            its docstring describes the icon as sitting "inside a tinted chip".
            MEASURED, that background does not exist: Tailwind cannot apply an
            opacity modifier to an arbitrary colour that is a bare custom
            property — it cannot decompose it into channels — so it emits no
            rule at all and the chip has been transparent since it shipped.
            Confirmed twice: the class is absent from the compiled stylesheet
            even when forced into the scan as a raw literal, and the painted
            background measures fully transparent in Chrome.

            So copying it verbatim would have DELETED a surface these chips
            really have and replaced it with nothing — a visible regression,
            arrived at by following a precedent that silently does nothing. The
            neutral background stays until that is fixed where it belongs, in
            the precedent. See docs/section-control-audit.md §12.
          */}
          {specialties.map((s, i) => (
            <span key={i} className="rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-[var(--pb-accent-fill)] dark:bg-[#0D1B2A]">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
