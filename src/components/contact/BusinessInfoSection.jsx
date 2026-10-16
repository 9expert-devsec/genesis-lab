import { Building2, Globe, Clock } from "lucide-react";

import CopyAddressButton from "./CopyAddressButton";
import { HOURS } from "./hours";
import { siteConfig } from "@/config/site";

/**
 * The two company cards. Every value is the one this section already rendered,
 * from the same source:
 *
 *   · the Thai address lines and the tax ID come from siteConfig — the same
 *     fields lib/seo/homeJsonLd reads for `streetAddress` and `taxID`
 *     (`addressDisplayTh` was defined FROM the two literals this card used to
 *     carry, and already used the ruled building spelling);
 *   · the ENGLISH address lines stay literals: nothing else in the tree spells
 *     them, so they have one reader and belong here rather than in siteConfig.
 *     Only the tax NUMBER is shared, and it comes from the one field.
 *
 * `copyText` is built from the same `name` / `lines` / `taxLine` the card
 * renders, so the card and what the copy button puts on the clipboard cannot
 * drift apart.
 */
const COMPANY_CARDS = [
  {
    key: "th",
    icon: Building2,
    name: "บริษัท นายน์เอ็กซ์เพิร์ท จำกัด (สำนักงานใหญ่)",
    lines: [siteConfig.addressDisplayTh[0], siteConfig.addressDisplayTh[1]],
    taxLine: `เลขประจำตัวผู้เสียภาษี: ${siteConfig.taxId}`,
    copy: {
      label: "คัดลอกที่อยู่",
      copiedLabel: "คัดลอกแล้ว",
      failedLabel: "คัดลอกไม่สำเร็จ",
      ariaLabel: "คัดลอกชื่อบริษัท ที่อยู่ และเลขประจำตัวผู้เสียภาษี (ภาษาไทย)",
    },
  },
  {
    key: "en",
    icon: Globe,
    name: "9 EXPERT COMPANY LIMITED (Head Office)",
    lines: [
      "318 Evergreen Place Tower, 2nd Floor, Room No.2B, Soi Worarit,",
      "Phaya Thai Road, Thanon Phetchaburi Sub-district, Ratchathewi District, Bangkok 10400, Thailand.",
    ],
    taxLine: `Tax ID ${siteConfig.taxId}`,
    copy: {
      label: "Copy address",
      copiedLabel: "Copied",
      failedLabel: "Copy failed",
      ariaLabel: "Copy company name, address and tax ID (English)",
    },
  },
].map((card) => ({
  ...card,
  copyText: [card.name, ...card.lines, card.taxLine].join("\n"),
}));

const CARD =
  "rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-sm dark:border-9e-border dark:bg-9e-card sm:p-7";

export default function BusinessInfoSection() {
  return (
    <section className="relative bg-9e-ice py-16 dark:bg-9e-navy md:py-20">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center md:mb-12">
          <h2 className="text-3xl font-bold leading-normal text-9e-navy dark:text-white md:text-4xl">
            ข้อมูลบริษัทและเวลาทำการ
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ul className="flex flex-col gap-6 lg:col-span-2">
            {COMPANY_CARDS.map(
              ({ key, icon: Icon, name, lines, taxLine, copy, copyText }) => (
                <li
                  key={key}
                  className={`flex flex-col gap-4 sm:flex-row sm:items-start ${CARD}`}
                >
                  <span
                    aria-hidden
                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-9e-action text-white"
                  >
                    <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-9e-navy dark:text-white">
                      {name}
                    </p>
                    <p className="mt-1 break-words text-sm leading-relaxed text-[#465469] dark:text-[#cbd5e1]">
                      {lines.map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                      <span className="mt-1 block">{taxLine}</span>
                    </p>
                  </div>
                  <CopyAddressButton text={copyText} {...copy} />
                </li>
              ),
            )}
          </ul>

          <div className={CARD}>
            <div className="mb-5 flex items-center gap-4">
              <span
                aria-hidden
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-9e-action text-white"
              >
                <Clock aria-hidden="true" className="h-6 w-6" strokeWidth={2} />
              </span>
              <h3 className="text-xl font-bold text-9e-navy dark:text-white">
                เวลาทำการ
              </h3>
            </div>

            <ul className="divide-y divide-[#E2E8F0] dark:divide-9e-border">
              {HOURS.map(({ day, time, open }) => (
                <li
                  key={day}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <span className="text-base font-medium text-9e-navy dark:text-white">
                    {day}
                  </span>
                  <span
                    className={
                      open
                        ? "text-base font-semibold text-9e-action dark:text-9e-air"
                        : "text-base text-[#5E6A7E] dark:text-[#94a3b8]"
                    }
                  >
                    {time}
                  </span>
                </li>
              ))}
            </ul>

            <div className="my-5 h-px w-full bg-[#E2E8F0] dark:bg-9e-border" />

            <p className="text-sm leading-relaxed text-[#465469] dark:text-[#cbd5e1]">
              สามารถส่งข้อความผ่าน{" "}
              <a
                href={siteConfig.lineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-9e-action underline underline-offset-2 hover:no-underline dark:text-9e-air"
              >
                LINE Official Account
              </a>{" "}
              หรืออีเมลได้นอกเวลาทำการ ทีมงานจะตอบกลับในวันทำการถัดไป
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
