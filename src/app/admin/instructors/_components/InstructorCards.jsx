'use client';

import { ChevronRight, UserRound } from 'lucide-react';
import { resolveInstructorPrograms } from '@/lib/instructors/instructorPrograms';
import { photoCropValues } from '@/lib/instructors/photoCrop';
import InstructorPhotoPanel from '@/components/about/InstructorPhotoPanel';

/**
 * The /admin/instructors card grid. Its own module, without the server actions
 * InstructorsAdminClient imports, so the render tier can mount it as-is.
 *
 * ACTIVE FIRST, IN THE STORED ORDER; the inactive ones (a dozen or so, most
 * without a photo) used to fill the page as big empty cards. They stay
 * reachable in a collapsed native <details> — keyboard-operable with no script
 * — with the same cards at reduced emphasis and the same Inactive badge.
 */
export function InstructorGroups({ instructors, programs = [], busyId = null, onEdit, onDelete }) {
  // Same rule as the modal's checkbox (the schema defaults it to true).
  const active = instructors.filter((i) => i.is_active !== false);
  const inactive = instructors.filter((i) => i.is_active === false);
  return (
    <>
      {active.length > 0 && (
        <InstructorGrid
          instructors={active}
          programs={programs}
          busyId={busyId}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}

      {inactive.length > 0 && (
        <details data-inactive-group="" className="group rounded-9e-lg border border-[var(--surface-border)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-9e-lg px-4 py-3 text-sm font-semibold text-9e-navy hover:bg-9e-ice focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-action dark:text-white dark:hover:bg-[#0D1B2A] [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90" />
            Inactive ({inactive.length})
            <span className="text-xs font-normal text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ไม่แสดงบนหน้าเว็บ
            </span>
          </summary>
          <div className="px-4 pb-4 pt-1">
            <InstructorGrid
              instructors={inactive}
              programs={programs}
              busyId={busyId}
              onEdit={onEdit}
              onDelete={onDelete}
              dimmed
            />
          </div>
        </details>
      )}
    </>
  );
}

/** 4 columns ≥1280, 3 ≥1024, 2 ≥640, 1 below; capped so a card stays ~320px. */
function InstructorGrid({ instructors, programs, busyId, onEdit, onDelete, dimmed = false }) {
  return (
    <ul className="grid max-w-[1340px] gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {instructors.map((i) => (
        <li key={i._id}>
          <InstructorCard
            instructor={i}
            programs={programs}
            busy={busyId === i._id}
            onEdit={onEdit}
            onDelete={onDelete}
            dimmed={dimmed}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * One card: the photo with the instructor's OWN crop — the same
 * InstructorPhotoPanel + photoCropValues() the /about-us card and the edit
 * dialog's preview use, so the face the admin sees is the face that ships.
 * The panel only reads :root tokens (--9e-card / --9e-action / --9e-brand), so
 * it needs no .about-page wrapper here; the navy frame is the about card's
 * own colour, which the panel's gradient fades out of at the top.
 */
function InstructorCard({ instructor: i, programs, busy, onEdit, onDelete, dimmed }) {
  const crop = photoCropValues(i);
  const programChips = resolveInstructorPrograms(i.programs, programs);
  return (
    <div
      className={
        'flex h-full flex-col overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]'
        + (dimmed ? ' opacity-70' : '')
      }
    >
      <div className={`relative p-3 ${i.image_url ? 'bg-9e-card' : 'bg-[var(--surface-muted)]'}`}>
        {i.image_url ? (
          <InstructorPhotoPanel
            imageUrl={i.image_url}
            alt={i.name}
            scale={crop.scale}
            offsetY={crop.offsetY}
            offsetX={crop.offsetX}
            sizes="(min-width: 1280px) 320px, (min-width: 640px) 50vw, 100vw"
          />
        ) : (
          <div
            data-photo-placeholder=""
            className="flex aspect-[336/330] items-center justify-center rounded-[24px] border border-dashed border-[var(--surface-border)] text-9e-slate-dp-50 dark:text-[#94a3b8]"
          >
            <UserRound aria-hidden="true" className="h-10 w-10" strokeWidth={1.5} />
            <span className="sr-only">ไม่มีรูป</span>
          </div>
        )}
        {i.is_active === false && (
          <span className="absolute right-5 top-5 z-10 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">
            Inactive
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Measured: the ten inactive rows in the local mirror have an empty
            name, title and photo — say so rather than render a blank heading. */}
        <h3 className="text-sm font-bold text-9e-navy dark:text-white">
          {i.name || <span className="font-normal italic text-9e-slate-dp-50 dark:text-[#94a3b8]">(ไม่มีชื่อ)</span>}
        </h3>
        {i.title && (
          <p className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">{i.title}</p>
        )}
        {Array.isArray(i.specialties) && i.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {i.specialties.slice(0, 4).map((s) => (
              <span key={s} className="rounded-full bg-9e-ice px-2 py-0.5 text-[10px] text-9e-navy dark:bg-[#0D1B2A] dark:text-white">
                {s}
              </span>
            ))}
          </div>
        )}
        {programChips.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label={`โปรแกรมที่ ${i.name} สอน`}>
            {programChips.map((p) => (
              <li
                key={p.name}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--surface-border)] py-0.5 pl-1 pr-2 text-[10px] text-9e-navy dark:text-white"
              >
                <img src={p.iconUrl} alt="" className="h-3.5 w-3.5 object-contain" />
                {p.name}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex gap-1 pt-1">
          <button
            type="button"
            onClick={() => onEdit(i)}
            className="flex-1 rounded border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
          >
            แก้ไข
          </button>
          <button
            type="button"
            onClick={() => onDelete(i)}
            disabled={busy}
            className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {busy ? '…' : 'ลบ'}
          </button>
        </div>
      </div>
    </div>
  );
}
