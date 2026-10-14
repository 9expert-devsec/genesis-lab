"use client";

import { useCallback, useRef, useState } from "react";
import { Train, Bus, Car } from "lucide-react";

import { siteConfig } from "@/config/site";
import MapImageDialog from "./MapImageDialog";

/**
 * The embed URL, with its CENTRE read from siteConfig.geo.
 *
 * ── WHAT IS INTERPOLATED AND WHAT IS UNTOUCHED ──────────────────────────────
 * Google's `pb=` parameter is a positional, opaque encoding. Exactly two of its
 * segments are substituted and every other byte is preserved verbatim:
 *
 *   !2d<longitude>   the map centre's longitude
 *   !3d<latitude>    the map centre's latitude
 *
 * Untouched: `!1d15501.899…` (the span, i.e. the zoom), `!4f13.1`, the viewport
 * `!1i1024!2i768`, the locale pair, the cache-buster `!4v…`, and critically
 * `!1s0x30e29d1d9b23ffe5%3A0xea1cd3822743c584` — the Google place ID, which is
 * what actually pins the MARKER to 9Expert Training. So the marker does not move
 * at all; only the centre, and only by the rounding below.
 *
 * ── THE PRECISION CHANGE, STATED ────────────────────────────────────────────
 * The literal this replaced carried the centre at full float precision
 * (100.53041585085921, 13.750209711931717). siteConfig.geo holds the ruled pair
 * rounded to five decimals (100.53042, 13.75021) — the same point to within
 * about half a metre, which is far below the resolution of a map at this zoom.
 * That rounding is the ONLY difference in the rendered src, and it buys the
 * property worth having: the graph's `geo` and this embed are now one value, so
 * they cannot drift ~60m apart again the way they had.
 */
const MAP_EMBED =
  `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15501.899657662734!2d${siteConfig.geo.longitude}!3d${siteConfig.geo.latitude}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x30e29d1d9b23ffe5%3A0xea1cd3822743c584!2s9Expert%20Training!5e0!3m2!1sen!2sus!4v1741239839027!5m2!1sen!2sus`;

/**
 * The "open in Google Maps" target. From siteConfig, which the home graph's
 * `hasMap` now also reads — this link and that one were two different short
 * links to the same place before 2026-09-29.
 */
const MAP_LINK = siteConfig.mapLink;

const TABS = [
  {
    id: "bts",
    label: "BTS",
    icon: Train,
    title: "รถไฟฟ้า BTS",
    lines: [
      "ลงสถานีราชเทวี ทางออก 1",
      "เดินผ่านโรงแรม Hotel Asia ประมาณ 20 เมตร",
      "เลี้ยวซ้ายเข้าซอยวรฤทธิ์",
      "อาคารเอเวอร์กรีน เพลส อยู่ทางซ้ายมือ",
    ],
  },
  {
    id: "bus",
    label: "รถเมล์",
    icon: Bus,
    title: "รถประจำทาง",
    lines: [
      "ลงป้ายโรงแรม Hotel Asia",
      "สายรถที่ผ่าน: 36, 54, 29, 34, 178, 172, 542, 529, 177, 113",
    ],
  },
  {
    id: "car",
    label: "รถยนต์",
    icon: Car,
    title: "รถส่วนบุคคล",
    lines: [
      "มาจากทิศทางสยามสแควร์: เลี้ยวซ้ายเข้าถนนพญาไท แล้วเลี้ยวซ้ายเข้าซอยวรฤทธิ์",
      "มาจากทิศทางอนุสาวรีย์ชัย: เลี้ยวขวาเข้าซอยวรฤทธิ์",
      "จอดรถที่อาคารเอเวอร์กรีน เพลส (มีที่จอดในอาคาร)",
    ],
  },
];

const tabId = (id) => `how-to-get-here-tab-${id}`;
const panelId = (id) => `how-to-get-here-panel-${id}`;

export default function MapSection() {
  const [active, setActive] = useState("bts");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const tabRefs = useRef({});
  const mapButtonRef = useRef(null);
  // Stable, so the dialog's open/close effect runs once per opening rather than
  // on every render of this section.
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  // WAI-ARIA tabs pattern: Left/Right move between tabs (wrapping), Home/End
  // jump to the ends, and selection follows focus.
  const onTabKeyDown = (e) => {
    const i = TABS.findIndex((t) => t.id === active);
    let next;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const id = TABS[next].id;
    setActive(id);
    tabRefs.current[id]?.focus();
  };

  return (
    // scroll-mt clears the sticky header when the training-room card's
    // "ดูวิธีการเดินทาง" link jumps here.
    <section
      id="how-to-get-here"
      className="relative scroll-mt-24 bg-white py-16 dark:bg-[#060e1a] md:py-20"
    >
      <div className="relative mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center md:mb-12">
          <h2 className="text-3xl font-bold leading-normal text-9e-navy dark:text-white md:text-4xl">
            รูปแบบการเดินทาง
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[#465469] dark:text-[#94a3b8]">
            เลือกวิธีการเดินทาง และข้อมูลสำหรับเดินทางมาสถาบัน
          </p>
        </div>

        {/* items-stretch: the map card takes the right column's height, and the
            iframe is absolutely positioned to fill it — no strip under the map.
            Stacked on mobile it is a fixed 300px instead. */}
        <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-2">
          {/* LEFT: Map */}
          <div className="relative h-[300px] overflow-hidden rounded-3xl border border-[#E2E8F0] bg-9e-ice shadow-sm dark:border-9e-border dark:bg-9e-card lg:h-auto lg:min-h-[360px]">
            <iframe
              src={MAP_EMBED}
              title="9Expert Training location"
              style={{ border: 0 }}
              className="absolute inset-0 block h-full w-full"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          {/* RIGHT: Tabs */}
          <div className="flex flex-col">
            <div
              role="tablist"
              aria-label="รูปแบบการเดินทาง"
              className="mb-5 flex flex-wrap gap-2"
            >
              {TABS.map(({ id, label, icon: Icon }) => {
                const isActive = active === id;
                return (
                  <button
                    key={id}
                    ref={(el) => {
                      tabRefs.current[id] = el;
                    }}
                    id={tabId(id)}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={panelId(id)}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActive(id)}
                    onKeyDown={onTabKeyDown}
                    // No focus ring classes here: the global `*:focus-visible`
                    // rule in globals.css draws the one keyboard-only ring, so a
                    // mouse click shows just the active pill.
                    className={
                      isActive
                        ? "inline-flex items-center gap-2 rounded-full border border-transparent bg-9e-action px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(0,92,255,0.6)] transition-colors"
                        : "inline-flex items-center gap-2 rounded-full border border-[#CBD5E1] bg-white px-5 py-2.5 text-sm font-medium text-[#465469] transition-colors hover:border-9e-action hover:text-9e-action dark:border-9e-border dark:bg-9e-card dark:text-[#cbd5e1] dark:hover:border-9e-air dark:hover:text-9e-air"
                    }
                  >
                    <Icon aria-hidden className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* ALL panels are rendered, stacked in one grid cell, so the card is
                always as tall as the tallest one (รถยนต์) and nothing moves on a
                tab change. Inactive panels are `invisible` (visibility:hidden —
                still in layout, out of the a11y tree and tab order), never
                display:none, which would drop them from the height and bring the
                jump back. */}
            <div className="grid">
              {TABS.map(({ id, icon: PanelIcon, title, lines }) => {
                const isActive = active === id;
                return (
                  <div
                    key={id}
                    id={panelId(id)}
                    role="tabpanel"
                    aria-labelledby={tabId(id)}
                    aria-hidden={isActive ? undefined : "true"}
                    tabIndex={isActive ? 0 : -1}
                    className={`col-start-1 row-start-1 rounded-3xl border border-[#E2E8F0] bg-9e-ice p-6 dark:border-9e-border dark:bg-9e-card sm:p-7 ${isActive ? "visible" : "invisible"}`}
                  >
                    <div className="mb-5 flex items-center gap-4">
                      <span
                        aria-hidden="true"
                        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-9e-action text-white"
                      >
                        <PanelIcon aria-hidden="true" className="h-6 w-6" strokeWidth={2} />
                      </span>
                      <h3 className="text-xl font-bold text-9e-navy dark:text-white">
                        {title}
                      </h3>
                    </div>

                    <ol className="space-y-3">
                      {lines.map((line, i) => (
                        <li key={line} className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-9e-action text-sm font-semibold text-white"
                          >
                            {i + 1}
                          </span>
                          <span className="pt-0.5 text-base leading-relaxed text-[#334155] dark:text-[#cbd5e1]">
                            {line}
                          </span>
                        </li>
                      ))}
                    </ol>

                    <div className="mt-6 h-px w-full bg-[#E2E8F0] dark:bg-9e-border" />

                    <p className="mt-4 text-sm text-[#465469] dark:text-[#94a3b8]">
                      อาคารเอเวอร์กรีน เพลส ชั้น 2 ห้อง 2B · ซอยวรฤทธิ์
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href={MAP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-9e-action px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#004BD1]"
              >
                ดูแผนที่เส้นทางบน Google Maps →
              </a>
              <button
                ref={mapButtonRef}
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center justify-center rounded-full border-2 border-9e-action px-5 py-2.5 text-sm font-semibold text-9e-action transition-colors hover:bg-9e-action hover:text-white dark:border-9e-air dark:text-9e-air dark:hover:bg-9e-air dark:hover:text-9e-navy"
              >
                ดูภาพแผนที่ขนาดใหญ่
              </button>
            </div>
          </div>
        </div>
      </div>

      <MapImageDialog
        open={isModalOpen}
        onClose={closeModal}
        returnFocusRef={mapButtonRef}
      />
    </section>
  );
}
