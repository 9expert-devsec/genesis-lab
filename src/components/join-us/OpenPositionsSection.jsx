"use client";

import { useEffect, useState } from "react";
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
                <PositionCard recruit={recruit} onDetail={setDetailJob} />
              </div>
            ))}
          </div>
        )}
      </div>

      {detailJob && (
        <JobDetailModal job={detailJob} onClose={() => setDetailJob(null)} />
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
        <span className="inline-flex w-max rounded-full bg-9e-signature-800 px-3 py-1 font-en text-xs text-9e-brand dark:bg-9e-signature-900">
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
          onClick={() => onDetail(recruit)}
          className="inline-flex items-center justify-center gap-2
           rounded-9e-xl border border-9e-brand bg-transparent px-6 py-3
           font-en font-semibold text-9e-brand
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

function JobDetailModal({ job, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const typeLabel = TYPE_LABEL[job.employmentType] ?? job.employmentType;
  const accentColor = TYPE_ACCENT[job.employmentType] ?? "bg-9e-brand";
  const applyEmail = job.applyEmail || "training@9expert.co.th";
  const subject = encodeURIComponent(`สมัครงาน: ${job.title}`);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`รายละเอียดตำแหน่ง ${job.title}`}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-9e-xl bg-white shadow-9e-lg dark:bg-9e-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-1.5 rounded-t-9e-xl ${accentColor}`} />

        <div className="border-b border-[var(--surface-border)] p-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {job.department && (
                <span className="mb-2 inline-block rounded-full bg-9e-signature-900 px-3 py-1 font-en text-xs text-9e-brand dark:bg-9e-signature-900">
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

        <div className="space-y-6 p-6">
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
