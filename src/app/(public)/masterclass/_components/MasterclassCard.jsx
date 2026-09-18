import Image from "next/image";
import Link from "next/link";
import { Clock, BarChart2 } from "lucide-react";
import { CountdownTimer } from "./CountdownTimer";
import { MASTERCLASS_LEVEL_LABEL as LEVEL_MAP } from "@/lib/masterclass/levelLabel";

/**
 * ROUND M-B — restyled to match Figma node 27:5 (expert-masterclass-landing,
 * "courses-section" / course-card-claude + course-card-marketing).
 *
 * Extracted out of MasterclassListingClient.jsx, which used to define this
 * inline and unexported. All data below is REAL — course + batch records
 * from MongoDB via getPublishedMasterclasses(), the same pricing/countdown
 * logic the previous card used. Only the presentation changed to match the
 * new design; no static Figma numbers (its mock 12,900 บาท, 18-day countdown,
 * etc.) were ported — those were placeholder values in the design file, not
 * data. The seat row (รับจำกัด / ว่าง / progress bar) was removed from this
 * card on purpose; the detail page's batch cards still show seat state.
 *
 * ROUND M-C: the top visual band now uses each course's own
 * `cover_image_url` instead of the shared 13/14 orange/blue art — design
 * review flagged the shared background as wrong once real photos exist per
 * course. Both live courses were confirmed (via a direct DB read) to have a
 * real cover_image_url, so FALLBACK_IMAGE below only matters for a future
 * course published without one — it is not in use today. This is the third
 * role this pair of files has had across two rounds (full-card screenshot →
 * background-only art → now an unused fallback); left in place rather than
 * deleted since the role keeps changing — see the M-C report.
 */
// LEVEL_MAP lives in src/lib/masterclass/levelLabel.js — the chat-card corpus
// imports the same mapping so the two surfaces cannot say different words.

/** Card 1 (Claude AI) is themed orange, everything else blue — matches the Figma. */
const PILL_COLOR = { "mas-claude-ai-for-data-analyst": "bg-[#f97316]" };
const DEFAULT_PILL_COLOR = "bg-[#1d64f2]";

/** Only used if a course has no cover_image_url — see the header comment. */
const FALLBACK_IMAGE = {
  "mas-claude-ai-for-data-analyst":
    "/masterclass-element/13_course_claude_ai_card.png",
};
const DEFAULT_FALLBACK_IMAGE =
  "/masterclass-element/14_course_ai_digital_card.png";

export function MasterclassCard({ course }) {
  const firstBatch = course.batches?.[0];
  const pillColor = PILL_COLOR[course.slug] ?? DEFAULT_PILL_COLOR;
  const cardImage =
    course.cover_image_url ||
    FALLBACK_IMAGE[course.slug] ||
    DEFAULT_FALLBACK_IMAGE;
  const scheduleNote = `*เรียนเฉพาะวัน${(course.schedule_days ?? []).join("/")} ${course.time_start ?? ""} - ${course.time_end ?? ""} น.`;

  return (
    <Link
      href={`/masterclass/${course.slug}`}
      className="group flex flex-1 flex-col overflow-hidden rounded-[20px] border border-[#e2e8f0] bg-white transition-shadow hover:shadow-lg"
    >
      {/* Top visual band */}
      <div className="relative aspect-video">
        <div aria-hidden className="absolute inset-0">
          <Image
            src={cardImage}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width:768px) 100vw, 50vw"
          />
          {/* <div className="absolute inset-0 bg-[rgba(3,10,22,0.8)]" /> */}
        </div>
        {/* <div className="relative flex w-full items-center justify-between">
          <span className={`inline-flex items-start rounded-full ${pillColor} px-3 py-1`}>
            <span className="text-xs font-semibold text-white">Masterclass</span>
          </span>
          <span className="text-sm font-bold text-white">9Expert</span>
        </div> */}
      </div>

      {/* Body */}
      <div className="flex flex-col justify-between h-full p-6 gap-2">
        <div className="flex flex-col gap-2">
          <p className="relative w-full text-2xl font-bold text-9e-navy">
            {course.title_th}
          </p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-[13px] text-[#475569]">
              <Clock size={14} />
              {course.duration_days} วัน
            </span>
            {course.level && (
              <span className="flex items-center gap-1.5 text-[13px] text-[#475569]">
                <BarChart2 size={14} />
                {LEVEL_MAP[course.level] ?? course.level}
              </span>
            )}
          </div>

          <div className="h-[63px]">
            {" "}
            {course.subtitle_th && (
              <p className="line-clamp-3 text-sm leading-[1.5] text-[#475569]">
                {course.subtitle_th}
              </p>
            )}
          </div>

          {/* Guarded because `firstBatch` is undefined whenever a published
              course has no `open`/`full` batch — getPublishedMasterclasses
              attaches only those two statuses, so `batches: []` is an ordinary
              state, not an error. Without this the card throws and takes the
              whole /masterclass route to a 500. The card's own no-batch state
              is the `ยังไม่เปิดรับสมัคร` branch at the bottom of this file. */}
          {firstBatch && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <span className="text-[28px] font-bold text-[#1d64f2]">
                  {firstBatch.effective_price?.toLocaleString("th-TH")} บาท
                </span>
                {firstBatch.is_early_bird && (
                  <span className="text-base text-[#64748b] line-through">
                    {firstBatch.original_price?.toLocaleString("th-TH")} บาท
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748b]">
                {firstBatch.is_early_bird
                  ? "*ราคาพิเศษลงทะเบียนล่วงหน้า Early Bird"
                  : scheduleNote}
              </p>
            </div>
          )}
        </div>

        {firstBatch ? (
          <div className="flex flex-col gap-2">
            {/* Countdown */}
            {firstBatch.is_early_bird && firstBatch.early_bird_deadline && (
              <div className="flex w-full flex-col gap-2 rounded-xl bg-[#f1f5f9] p-3">
                <p className="w-full text-center text-xs font-semibold text-[#475569]">
                  ระยะเวลาส่วนลด Early Bird สิ้นสุดใน:
                </p>
                <CountdownTimer
                  deadline={firstBatch.early_bird_deadline}
                  className="justify-center"
                />
              </div>
            )}

            {/* No seat row here — the listing card shows nothing about seats
                (no รับจำกัด / ว่าง figures, no progress bar). The CTA below
                still keys on `batch.status`, which the seat writers maintain
                (auto-flip to `full` at capacity), so "เต็มแล้ว" is decided by
                the batch state, not by a number this card no longer reads.
                test/render/masterclassCardSeats pins the absence. */}

            {/* CTA */}
            {firstBatch.status === "full" ? (
              <span className="flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-gray-200 py-3 text-sm font-semibold text-gray-400">
                เต็มแล้ว
              </span>
            ) : (
              <span className="flex w-full items-center justify-center rounded-xl bg-[#1d64f2] py-3 text-[15px] font-semibold text-white">
                เปิดรับสมัคร
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">ยังไม่เปิดรับสมัคร</p>
        )}
      </div>
    </Link>
  );
}
