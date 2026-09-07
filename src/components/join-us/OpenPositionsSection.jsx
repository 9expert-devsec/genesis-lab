"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { headcountLabel } from "@/lib/recruitHeadcount";
import {
  Briefcase,
  MapPin,
  Clock,
  Mail,
  Eye,
  X,
  ClipboardList,
  GraduationCap,
  Gift,
  // ALIASED. `Users` is a plural common noun and this file talks about
  // `recruits` and a `job` throughout; an unaliased import of that name is one
  // `const Users = …` away from a module-scope shadow that resolves at runtime
  // to a React component. Same reason AdminSidebar imports `Image as ImageIcon`.
  Users as UsersIcon,
} from "lucide-react";

const TYPE_LABEL = {
  "full-time": "งานประจำ",
  "part-time": "พาร์ทไทม์",
  contract: "สัญญาจ้าง",
  internship: "ฝึกงาน",
};

const TYPE_ACCENT = {
  "full-time": "bg-9e-brand",
  "part-time": "bg-9e-air",
  contract: "bg-9e-lime",
  internship: "bg-9e-lime-lt",
};

export default function OpenPositionsSection({ recruits = [] }) {
  const [detailJob, setDetailJob] = useState(null);

  // THE BUTTON THAT OPENED THE DIALOG, captured at click time so focus can go
  // back to it when the dialog closes.
  //
  // A ref to the element rather than "restore whatever was focused", and the
  // reason is measured rather than theoretical: the dialog can be dismissed by
  // clicking the backdrop, which blurs the trigger FIRST, so by the time the
  // cleanup runs `document.activeElement` is <body>. Probed in Chrome before
  // this change — after a backdrop dismiss, focus was on <body> and a keyboard
  // user was returned to the top of the document. ScheduleFilterSheet carries
  // the same `returnFocusRef` for the same reason.
  const triggerRef = useRef(null);
  const openDetail = (recruit, trigger) => {
    triggerRef.current = trigger ?? null;
    setDetailJob(recruit);
  };

  return (
    <section
      id="open-positions"
      className="bg-[var(--page-bg-muted)] py-20 dark:bg-[var(--page-bg)]"
    >
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="font-heading text-3xl font-bold text-9e-navy dark:text-white lg:text-4xl">
            ตำแหน่งงานที่เปิดรับ
          </h2>
          <p className="mt-3 font-thai text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
            ค้นหาตำแหน่งที่ใช่สำหรับคุณ
          </p>
        </div>

        {recruits.length === 0 ? (
          <div className="py-16 text-center">
            <Briefcase
              size={48}
              className="mx-auto mb-4 text-9e-slate-lt-300 dark:text-9e-slate-dp-200"
            />
            <p className="font-thai text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
              ยังไม่มีตำแหน่งงานที่เปิดรับในขณะนี้
            </p>
            <p className="mt-2 font-thai text-sm text-9e-slate-dp-100 dark:text-9e-slate-dp-300">
              ส่ง Resume มาที่ training@9expert.co.th เพื่อให้เราติดต่อกลับ
            </p>
          </div>
        ) : (
          <div className="mt-10 flex flex-wrap justify-center gap-6">
            {recruits.map((recruit) => (
              <div
                key={recruit._id}
                className="w-full max-w-[420px] sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]"
              >
                <PositionCard recruit={recruit} onDetail={openDetail} />
              </div>
            ))}
          </div>
        )}
      </div>

      {detailJob && (
        <JobDetailModal
          job={detailJob}
          onClose={() => setDetailJob(null)}
          returnFocusRef={triggerRef}
        />
      )}
    </section>
  );
}

function PositionCard({ recruit, onDetail }) {
  const accent = TYPE_ACCENT[recruit.employmentType] ?? "bg-9e-brand";
  const typeLabel = TYPE_LABEL[recruit.employmentType] ?? "งานประจำ";
  const previewItems = (recruit.responsibilities ?? []).slice(0, 3);
  const applyEmail = recruit.applyEmail || "training@9expert.co.th";
  const subject = encodeURIComponent(`สมัครงาน: ${recruit.title}`);

  return (
    <div className="rounded-9e-lg border shadow-9e-sm transition-all duration-9e-micro ease-9e hover:-translate-y-[2px] hover:shadow-9e-md flex h-full flex-col">
      <div className={` h-3 rounded-t-xl ${accent}`} />

      <div className="p-6 flex h-full flex-col">

      {recruit.department && (
        <span className="inline-flex w-max rounded-full bg-9e-signature-800 px-3 py-1 font-en text-xs text-9e-action dark:bg-9e-signature-900">
          {recruit.department}
        </span>
      )}

      <h3 className="mt-2 font-heading text-lg font-bold text-9e-navy dark:text-white">
        {recruit.title}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-thai text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
        {recruit.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} />
            {recruit.location}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Clock size={12} />
          {typeLabel}
        </span>
        {/* ── THE WHOLE CHIP IS INSIDE THE CONDITION ────────────────────────
            Icon, text, AND the <span> that carries this row's `gap-x-3`. The
            usual way this ships is with only the text conditional, which leaves
            an empty element behind — the icon floating on its own, or a 12px
            gap in the middle of the row with nothing in it.

            `!== null` rather than `{headcountLabel(...) && …}`: the shorthand
            evaluates to the falsy value itself, and for a stored 0 that is `0`,
            which React renders as a bare "0" in the meta row. headcountLabel
            returns null or a string, never '' — see the note there. */}
        {headcountLabel(recruit.headcount) !== null && (
          <span className="inline-flex items-center gap-1">
            <UsersIcon size={12} />
            {headcountLabel(recruit.headcount)}
          </span>
        )}
      </div>

      <div className="my-3 border-t border-[var(--surface-border)]" />

      {previewItems.length > 0 ? (
        <ul className="space-y-1.5">
          {previewItems.map((item, i) => (
            <li
              key={i}
              className="flex gap-2 font-thai text-sm text-9e-slate-dp-50 dark:text-9e-slate-dp-400"
            >
              <span aria-hidden className="text-9e-brand">
                •
              </span>
              <span className="line-clamp-2">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-thai text-sm text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
          คลิกดูรายละเอียดเพื่อดูข้อมูลเพิ่มเติม
        </p>
      )}

      <div className="flex-1" />

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={(e) => onDetail(recruit, e.currentTarget)}
          className="inline-flex items-center justify-center gap-2
           rounded-9e-xl border border-9e-brand bg-transparent px-6 py-3
           font-en font-semibold text-9e-action
           transition-all duration-9e-micro ease-9e
           hover:bg-9e-brand hover:text-9e-ice hover:-translate-y-[2px] text-sm"
        >
          <Eye size={14} /> ดูรายละเอียด
        </button>
        <a
          href={`mailto:${applyEmail}?subject=${subject}`}
          className="inline-flex items-center justify-center gap-2
           rounded-9e-xl bg-9e-lime px-6 py-3
           font-en font-semibold text-9e-navy
           transition-all duration-9e-micro ease-9e
           hover:bg-9e-lime-lt hover:-translate-y-[2px] hover:shadow-9e-md
           active:bg-9e-lime-dk active:translate-y-0 text-sm"
        >
          <Mail size={14} /> สมัครตำแหน่งนี้
        </a>
      </div>

      </div>

    </div>
  );
}

/**
 * The job detail dialog.
 *
 * ══ IT IS PORTALLED, AND IT SITS IN THE OVERLAY TIER ════════════════════════
 * MEASURED IN A REAL BROWSER before this was changed, at 1440x900 on /join-us:
 *
 *   · the overlay computed `z-index: 50`, the site header `60`, so
 *     `elementFromPoint` at the header's centre returned the header's own nav
 *     link — the header painted OVER the dim, and the panel's top (45px) sat
 *     above the header's bottom edge (81px), which is the clipped department
 *     badge in the report;
 *   · the floating dock is also `z-50` and is mounted from the ROOT layout,
 *     after `{children}` — equal z-index, later in tree order, so it won.
 *     `elementFromPoint` over each dock child returned that child: the
 *     back-to-top glyph and the chat launcher's image, both fully bright over
 *     the dim.
 *
 * So the cause of both was the TIER, not the portal — the section this dialog
 * lives in creates no stacking context today (no transform, filter, opacity or
 * z-index on it or any ancestor), so `z-[9700]` alone would have fixed the
 * paint order. The portal is still the right shape and goes in with it:
 * `position: fixed` is defeated outright by a transformed ancestor, and this
 * subtree is one `will-change` or one animation wrapper away from that. The
 * chat panel and the header drawer are portalled for the same reason, and the
 * chat panel's case is the one that has actually bitten this repo.
 *
 * 9700 is a NEW RUNG, not a share of the image lightbox's 9600. The ladder in
 * tailwind.config.js is documented per occupant, and this suite already has a
 * guard for a rung claiming fewer users than it has (see the z-30 occupants
 * test) — so a second modal on 9600 would leave their relative order undefined
 * and the comment wrong. The rule it follows is the lightbox's, verbatim: this
 * is modal, the visitor opened it on purpose, so neither a promo (9000) nor a
 * chat window (9500) may cover it, and it still yields to primary navigation
 * (9998/9999).
 *
 * ── THE `typeof document` BRANCH ────────────────────────────────────────────
 * Same reasoning as ScheduleFilterSheet's: this is a client component and Next
 * still renders it on the server, where `createPortal` throws. Today it is only
 * ever mounted from a click so the server never reaches it, but that is a
 * property of one call site rather than of this component. Rendering in place
 * when there is no document is the honest fallback.
 */
export function JobDetailModal({ job, onClose, returnFocusRef }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── FOCUS IN, AND FOCUS BACK OUT ──────────────────────────────────────────
  // MEASURED IN CHROME before this was added: opening the dialog left focus on
  // the ดูรายละเอียด button behind it — `overlay.contains(document.activeElement)`
  // was false — so a keyboard user's next Tab walked the page UNDERNEATH an
  // element declaring `aria-modal="true"`, and a screen-reader user was told
  // nothing had happened. Closing then dropped focus on <body>.
  //
  // The PANEL takes focus rather than the close button: it is the dialog's own
  // container, so a screen reader announces the dialog's label and its contents
  // from the top, rather than announcing "ปิด" as if that were the point of
  // opening it. It carries `tabIndex={-1}` for that — programmatically
  // focusable, not a tab stop of its own.
  //
  // NO FOCUS TRAP, and no dependency for one. Tab can still leave the dialog,
  // which is a real (and pre-existing) gap; what is fixed here is the pair that
  // makes the dialog usable at all from a keyboard. A trap is a bigger change
  // than a quick fix should carry, and it is named in the round report rather
  // than half-built.
  useEffect(() => {
    panelRef.current?.focus?.();
    const returnTo = returnFocusRef;
    return () => {
      // `focus()` on a detached or hidden node is a no-op, so the guard is
      // cheap insurance rather than ceremony. preventScroll because the page
      // behind is being unlocked in the same tick and we do not want the
      // browser scrolling it to reveal the trigger.
      returnTo?.current?.focus?.({ preventScroll: true });
    };
  }, [returnFocusRef]);

  // ── THE PAGE BEHIND MUST NOT SCROLL ───────────────────────────────────────
  // This used to be four lines inline that set `overflow: hidden` and, on
  // cleanup, wrote `""`. Writing "" rather than the value it found is a real
  // bug rather than a style point: with any other overlay already holding the
  // lock — the chat panel, the mobile drawer, the schedule sheet, all of which
  // lock the body — closing this dialog unlocked the page underneath the one
  // still open.
  //
  // useBodyScrollLock is the repo's one implementation and is ref-counted, so
  // two overlays open at once survive being closed in either order. It also
  // compensates the scrollbar gutter, which the inline copy did not: on a
  // classic-scrollbar platform, hiding the document scrollbar widens the page
  // by ~15px and everything centred on it jumps sideways as the dialog opens.
  useBodyScrollLock(true);

  const typeLabel = TYPE_LABEL[job.employmentType] ?? job.employmentType;
  const accentColor = TYPE_ACCENT[job.employmentType] ?? "bg-9e-brand";
  const applyEmail = job.applyEmail || "training@9expert.co.th";
  const subject = encodeURIComponent(`สมัครงาน: ${job.title}`);

  const overlay = (
    <div
      className="fixed inset-0 z-[9700] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`รายละเอียดตำแหน่ง ${job.title}`}
    >
      {/* dvh, NOT vh. On mobile browsers `vh` is the LARGE viewport — the one
          with the URL bar hidden — so 90vh can exceed what is actually on
          screen and the pinned apply button ends up under the browser chrome.
          `dvh` is what the rest of this repo already uses for full-height
          surfaces (the public layout's min-h-[100dvh], globals.css's body). */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative max-h-[90dvh] flex flex-col w-full max-w-2xl overflow-hidden rounded-9e-xl bg-white shadow-9e-lg outline-none dark:bg-9e-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-1.5 shrink-0 rounded-t-9e-xl ${accentColor}`} />

        <div className="border-b border-[var(--surface-border)] p-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {job.department && (
                <span className="mb-2 inline-block rounded-full bg-9e-signature-900 px-3 py-1 font-en text-xs text-9e-action dark:bg-9e-signature-900">
                  {job.department}
                </span>
              )}
              <h2 className="font-heading text-2xl font-bold text-9e-navy dark:text-white">
                {job.title}
              </h2>
              <div className="mt-2 flex flex-wrap gap-3">
                {job.location && (
                  <span className="flex items-center gap-1 font-thai text-sm text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
                    <MapPin size={13} /> {job.location}
                  </span>
                )}
                <span className="flex items-center gap-1 font-thai text-sm text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
                  <Clock size={13} /> {typeLabel}
                </span>
                {/* Same line, same formatting, same rule as the card's — see
                    the note there. The size is 13 here because every chip in
                    THIS row is 13; the card's are 12. */}
                {headcountLabel(job.headcount) !== null && (
                  <span className="flex items-center gap-1 font-thai text-sm text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
                    <UsersIcon size={13} /> {headcountLabel(job.headcount)}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] transition-colors hover:bg-9e-slate-lt-600 dark:hover:bg-9e-border"
            >
              <X size={16} className="text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 p-6 overflow-y-auto">
          {job.description && (
            <p className="font-thai text-sm leading-relaxed text-[var(--text-secondary)]">
              {job.description}
            </p>
          )}

          {job.responsibilities?.length > 0 && (
            <DetailSection
              icon={<ClipboardList size={16} />}
              title="หน้าที่รับผิดชอบ"
              items={job.responsibilities}
              accent="text-9e-brand"
            />
          )}

          {job.qualifications?.length > 0 && (
            <DetailSection
              icon={<GraduationCap size={16} />}
              title="คุณสมบัติที่ต้องการ"
              items={job.qualifications}
              accent="text-9e-air"
            />
          )}

          {job.benefits?.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold text-9e-navy dark:text-white">
                <Gift size={16} className="text-9e-lime-dk" />
                สวัสดิการ
              </h3>
              <div className="flex flex-wrap gap-2">
                {job.benefits.filter(Boolean).map((b, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-9e-lime/30 bg-9e-lime-scale-950 px-3 py-1.5 font-thai text-xs text-9e-navy dark:bg-9e-lime-scale-900/20 dark:text-9e-lime"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 rounded-b-9e-xl border-t border-[var(--surface-border)] bg-white p-4 dark:bg-9e-card">
          <a
            href={`mailto:${applyEmail}?subject=${subject}`}
            className="btn-9e-cta w-full justify-center gap-2"
          >
            <Mail size={16} /> สมัครตำแหน่งนี้
          </a>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? overlay
    : createPortal(overlay, document.body);
}

function DetailSection({ icon, title, items, accent }) {
  const dotColor = accent.replace("text-", "bg-");
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold text-9e-navy dark:text-white">
        <span className={accent}>{icon}</span>
        <span>{title}</span>
      </h3>
      <ul className="space-y-2">
        {items.filter(Boolean).map((item, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColor}`}
            />
            <span className="font-thai text-sm leading-relaxed text-[var(--text-secondary)]">
              {item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
