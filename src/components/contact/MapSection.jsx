"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Navigation,
  Train,
  Bus,
  Car,
  ExternalLink,
  MapPin,
} from "lucide-react";

const MAP_EMBED =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15501.899657662734!2d100.53041585085921!3d13.750209711931717!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x30e29d1d9b23ffe5%3A0xea1cd3822743c584!2s9Expert%20Training!5e0!3m2!1sen!2sus!4v1741239839027!5m2!1sen!2sus";

const MAP_LINK = "https://maps.app.goo.gl/?q=9Expert+Training";

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

export default function MapSection() {
  const [active, setActive] = useState("bts");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const current = TABS.find((t) => t.id === active);

  return (
    <section className="relative overflow-hidden bg-white py-20">
      {/* <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(0,92,255,0.10) 0%, transparent 70%)",
        }}
      /> */}

      <div className="relative mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          {/* <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[rgba(0,92,255,0.3)] bg-[rgba(0,92,255,0.05)] px-4 py-1.5">
            <Navigation className="h-4 w-4 text-[#48B0FF]" />
            <span className="text-sm uppercase tracking-[0.7px] text-[#48B0FF]">
              การเดินทาง
            </span>
          </div> */}
          <h2 className="text-3xl font-extrabold leading-normal text-9e-navy md:text-4xl">
            <span className="block">รูปแบบการเดินทาง</span>
            {/* <span className="block bg-[linear-gradient(90deg,#48B0FF_0%,#005CFF_50%,#48B0FF_100%)] bg-clip-text text-transparent">
              หลายเส้นทาง
            </span> */}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* LEFT: Map */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6 }}
          >
            <div className="overflow-hidden rounded-3xl border border-9e-slate-lt-400 dark:border-9e-slate-dp-400 bg-[#0d1f35] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]">
              <iframe
                src={MAP_EMBED}
                title="9Expert Training location"
                width="100%"
                height="420"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <a
              href={MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#48B0FF] transition-all hover:text-white hover:underline"
            >
              <MapPin className="h-4 w-4" />
              ดูแผนที่ขนาดใหญ่บน Google Maps
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </motion.div>

          {/* RIGHT: Tabs */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col "
          >
            <div className="mb-5 flex flex-wrap gap-2">
              {TABS.map(({ id, label, icon: Icon }) => {
                const isActive = active === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActive(id)}
                    className={
                      isActive
                        ? "inline-flex items-center gap-2 rounded-full border border-transparent bg-[#005CFF] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(0,92,255,0.6)] transition-all"
                        : "inline-flex items-center gap-2 rounded-full border border-9e-slate-lt-400 dark:border-9e-slate-dp-400 bg-transparent px-5 py-2.5 text-sm font-medium text-9e-slate-dp-50 transition-all hover:border-[rgba(0,92,255,0.4)] hover:text-9e-action"
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="rounded-3xl border border-9e-brand bg-[linear-gradient(130deg,rgba(233,243,255,0.6)_0%,rgba(189,219,255,0.6)_100%)] p-7">
              <div className="mb-5 flex items-center gap-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg,#005CFF 0%,#2486FF 100%)",
                  }}
                >
                  <current.icon className="h-7 w-7" strokeWidth={2} />
                </div>
                <h3 className="text-xl font-bold text-9e-navy">
                  {current.title}
                </h3>
              </div>

              <ul className="space-y-3">
                {current.lines.map((line, i) => (
                  <li key={line} className="flex items-center gap-3">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(0,92,255,0.15)] text-xs font-semibold text-9e-brand">
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-9e-slate-dp-50">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-[#005CFF]/40 to-transparent" />

              <p className="mt-4 text-xs text-[#6a7282]">
                อาคารเอเวอร์กรีน เพลส ชั้น 2 ห้อง 2B · ซอยวรฤทธิ์
              </p>
            </div>

            <div className=" mx-auto mt-auto max-w-2xl text-center ">
              <button
                onClick={() => setIsModalOpen(true)}
                className={
                  "inline-flex items-center gap-2 rounded-full border border-transparent bg-[#005CFF] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(0,92,255,0.6)] transition-all"
                }
              >
                ดูภาพแผนที่ขนาดใหญ่
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-2xl bg-white p-2 shadow-2xl dark:bg-[#0d1f35]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <Image
              src="/assets/9ExpertMap-Present1.png"
              alt="แผนที่การเดินทางมายัง 9Expert Training"
              width={1920}
              height={1080}
              className="h-auto w-full rounded-xl"
              priority={false}
            />
          </div>
        </div>
      )}
    </section>
  );
}
