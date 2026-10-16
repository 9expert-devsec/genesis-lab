import Image from "next/image";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { FaLine } from "react-icons/fa";

import { siteConfig } from "@/config/site";
import { HOURS } from "./hours";
import MapThumbnailButton from "./MapThumbnailButton";
import styles from "./contactMotion.module.css";

/**
 * The phone and email values are the same literals this section has always
 * rendered — moved into lists, not edited. The LINE target is siteConfig's,
 * which is byte-identical to the literal it replaces.
 */
const PHONES = [
  { label: "ฝ่ายแนะนำหลักสูตร", value: "02-219-4304", href: "tel:022194304" },
  { label: "เบอร์มือถือ", value: "086-322-2423", href: "tel:0863222423" },
];

const EMAILS = [
  {
    label: "ติดต่อหลักสูตร",
    value: "training@9expert.co.th",
    href: "mailto:training@9expert.co.th",
  },
  {
    label: "สอบถามเนื้อหาหลังเรียน",
    value: "instructor@9expert.co.th",
    href: "mailto:instructor@9expert.co.th",
  },
  {
    label: "ติดต่อโฆษณา",
    value: "sponsor@9expert.co.th",
    href: "mailto:sponsor@9expert.co.th",
  },
];

const TRAINING_ROOM =
  "ห้องอบรม Public Training ที่อาคารเอเวอร์กรีน เพลส สยาม ชั้น 2";

const CARD =
  "flex h-full flex-col rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-[0_8px_24px_rgba(13,27,42,0.07)] dark:border-9e-border dark:bg-9e-card dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:p-7";

/**
 * The channel cards' hover / focus-within treatment: a 4px lift (only when
 * motion is allowed), a slightly larger shadow, and the border tinted toward
 * the card's accent. The cards are NOT links — focus-within lifts the card
 * while one of its own links has focus.
 */
const CHANNEL_CARD = `relative overflow-hidden pt-7 transition-[transform,box-shadow,border-color] duration-200 ease-9e motion-safe:hover:-translate-y-1 motion-safe:focus-within:-translate-y-1 hover:shadow-[0_14px_32px_rgba(13,27,42,0.12)] focus-within:shadow-[0_14px_32px_rgba(13,27,42,0.12)] dark:hover:shadow-[0_14px_32px_rgba(0,0,0,0.5)] dark:focus-within:shadow-[0_14px_32px_rgba(0,0,0,0.5)] sm:pt-8`;

/** Per-card accent: the 5px top strip, and the border tint on hover / focus. */
const ACCENTS = {
  line: {
    strip: "bg-[#06C755]",
    border:
      "hover:border-[#06C755]/60 focus-within:border-[#06C755]/60 dark:hover:border-[#06C755]/60 dark:focus-within:border-[#06C755]/60",
  },
  phone: {
    strip: "bg-9e-action",
    border:
      "hover:border-9e-action/50 focus-within:border-9e-action/50 dark:hover:border-9e-action/70 dark:focus-within:border-9e-action/70",
  },
  email: {
    strip: "bg-9e-air",
    border:
      "hover:border-9e-air/70 focus-within:border-9e-air/70 dark:hover:border-9e-air/60 dark:focus-within:border-9e-air/60",
  },
};

function ChannelCard({ accent, children }) {
  const { strip, border } = ACCENTS[accent];
  return (
    <div className={`${CARD} ${CHANNEL_CARD} ${border} ${styles.card}`}>
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-[5px] ${strip}`}
      />
      {children}
    </div>
  );
}

const WEEKDAY_HOURS = HOURS.find((h) => h.open);

function IconTile({ icon: Icon, className }) {
  return (
    <span
      aria-hidden
      className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-white ${className}`}
    >
      <Icon aria-hidden="true" className="h-6 w-6" />
    </span>
  );
}

function CardHead({ icon, tileClass, title, sub }) {
  return (
    <div className="mb-5 flex items-center gap-4">
      <IconTile icon={icon} className={tileClass} />
      <div>
        <h3 className="text-xl font-bold text-9e-navy dark:text-white">
          {title}
        </h3>
        {sub && (
          <p className="mt-0.5 text-sm text-[#465469] dark:text-[#94a3b8]">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One labelled phone number or email address. Stacked (label over value) on
 * phones, label-left / value-right from sm, and stacked again at lg where the
 * three cards sit side by side and are too narrow for both on one line.
 */
function ContactRow({ label, value, href }) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-[#E2E8F0] py-3 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 lg:flex-col lg:items-start lg:gap-0.5 dark:border-9e-border">
      <span className="text-sm text-[#465469] dark:text-[#94a3b8]">
        {label}
      </span>
      <a
        href={href}
        className="break-words text-base font-semibold text-9e-action hover:underline dark:text-9e-air"
      >
        {value}
      </a>
    </li>
  );
}

export default function GetInTouchSection() {
  return (
    <section className="relative bg-white py-16 dark:bg-[#060e1a] md:py-20">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center md:mb-12">
          <h2 className="text-3xl font-bold leading-normal text-9e-navy dark:text-white md:text-4xl">
            ช่องทางการติดต่อ
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[#465469] dark:text-[#94a3b8]">
            เลือกช่องทางที่สะดวก ทีมงานพร้อมดูแลและตอบกลับโดยเร็วที่สุด
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* LINE */}
          <ChannelCard accent="line">
            <CardHead
              icon={FaLine}
              tileClass="bg-[#06C755]"
              title="LINE Official Account"
              sub="ตอบแชทได้สะดวกทุกอุปกรณ์"
            />
            <p className="text-sm leading-relaxed text-[#465469] dark:text-[#94a3b8]">
              สอบถามหลักสูตร ข้อมูลสื่อ และการอบรมทุกรูปแบบ
            </p>
            {/* #00B900 with white text is the user's choice (2026-10-14). It
                measures ~2.6:1, below WCAG AA's 4.5:1 for this text size —
                recorded, not an oversight. */}
            <a
              href={siteConfig.lineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[#00B900] px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-[#009F00]"
            >
              เพิ่มเพื่อน LINE OA →
            </a>
            {/* Desktop only — a QR on the phone you would scan it with is no
                use. Always on a white pad so it scans in dark mode too. */}
            <div className="mt-6 hidden flex-col items-center gap-2 lg:flex">
              <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-[#E2E8F0] dark:ring-0">
                <Image
                  src="/contact-img/line-oa-qr.png"
                  alt="QR Code เพิ่มเพื่อน LINE Official Account 9Expert"
                  width={128}
                  height={128}
                />
              </div>
              <p className="text-sm text-[#465469] dark:text-[#94a3b8]">
                หรือสแกน QR Code
              </p>
            </div>
          </ChannelCard>

          {/* Phone */}
          <ChannelCard accent="phone">
            <CardHead
              icon={Phone}
              tileClass="bg-9e-action"
              title="โทรศัพท์"
              sub="ฝ่ายแนะนำหลักสูตร และข้อมูลทั่วไป"
            />
            <ul className="flex flex-col">
              {PHONES.map((p) => (
                <ContactRow key={p.href} {...p} />
              ))}
            </ul>
            <p className="mb-5 mt-4 flex items-center gap-1.5 text-sm text-[#465469] dark:text-[#94a3b8]">
              <Clock aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
              {WEEKDAY_HOURS.day} {WEEKDAY_HOURS.time}
            </p>
            <a
              href="tel:022194304"
              className="mt-auto inline-flex w-full items-center justify-center rounded-full border-2 border-9e-action px-5 py-2.5 text-base font-semibold text-9e-action transition-colors hover:bg-9e-action hover:text-white dark:border-9e-air dark:text-9e-air dark:hover:bg-9e-air dark:hover:text-9e-navy"
            >
              โทรเลย →
            </a>
          </ChannelCard>

          {/* Email */}
          <ChannelCard accent="email">
            <CardHead
              icon={Mail}
              tileClass="bg-9e-air"
              title="อีเมล"
              sub="ติดต่อเราได้ตามประเภทด้านล่าง"
            />
            <ul className="flex flex-col">
              {EMAILS.map((e) => (
                <ContactRow key={e.href} {...e} />
              ))}
            </ul>
          </ChannelCard>
        </div>

        {/* Training room */}
        {/* Mobile: icon + h3 on one row, then the line, a full-width 150px
            thumbnail, then the jump link — each full width (col-span-2).
            md+: icon | text block (h3, line, link) | 260x132 thumbnail. DOM
            order is the mobile reading order; md+ places by grid lines.
            The wrapper carries the card's entrance animation. */}
        <div className={styles.room}>
          <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-3xl border border-[#E2E8F0] bg-9e-ice p-6 shadow-[0_8px_24px_rgba(13,27,42,0.07)] dark:border-9e-border dark:bg-9e-card dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:p-7 md:grid-cols-[auto_minmax(0,1fr)_260px] md:gap-x-6 md:gap-y-1">
            <IconTile icon={MapPin} className="bg-9e-action md:row-span-3 md:self-center" />
            <h3 className="text-xl font-bold text-9e-navy dark:text-white md:col-start-2 md:row-start-1">
              สถานที่อบรม
            </h3>
            <p className="col-span-2 text-base leading-relaxed text-[#465469] dark:text-[#94a3b8] md:col-span-1 md:col-start-2 md:row-start-2">
              {TRAINING_ROOM}
            </p>
            <MapThumbnailButton className="col-span-2 h-[150px] w-full md:col-span-1 md:col-start-3 md:row-span-3 md:row-start-1 md:h-[132px]" />
            <a
              href="#how-to-get-here"
              className="col-span-2 inline-flex items-center gap-1 justify-self-start text-base font-semibold text-9e-action hover:underline dark:text-9e-air md:col-span-1 md:col-start-2 md:row-start-3"
            >
              ดูวิธีการเดินทาง ↓
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
