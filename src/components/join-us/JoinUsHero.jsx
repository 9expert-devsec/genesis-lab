"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import FloatingDots from "@/components/about/FloatingDots";

export default function JoinUsHero() {
  return (
    <section className="relative overflow-hidden bg-9e-navy text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-9e-gradient-signature opacity-60"
      />

      {/* Radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[30%] top-[60%] h-[400px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-9e-action/20 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(rgba(72,176,255,0.12) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* <div
        aria-hidden
        className="pointer-events-none absolute left-6 top-24 h-32 w-32 border-l-2 border-t-2 border-9e-action/30"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-24 right-6 h-32 w-32 border-b-2 border-r-2 border-9e-action/30"
      /> */}

      <FloatingDots />

      <div className="relative mx-auto flex min-h-[420px] max-w-3xl flex-col items-center justify-center gap-8 px-4 py-24 text-center lg:px-6 lg:py-28">

        <h1 className="font-heading text-4xl font-bold leading-normal text-white md:text-5xl lg:text-4xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="block"
          >
            ร่วมงานกับเรา
          </motion.div>
          {/* <motion.span
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="block bg-9e-gradient-hero bg-clip-text text-transparent"
          >
            9Expert Training
          </motion.span> */}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="max-w-2xl font-thai text-base leading-relaxed text-9e-slate-dp-600 md:text-base"
        >
          เราจะเป็นองค์กรสร้างความรู้คุณภาพสูงเพื่อความพึงพอใจสูงสุดของลูกค้า
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          className="flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <a
            href="#open-positions"
            className="btn-9e-cta inline-flex items-center gap-2"
          >
            ดูตำแหน่งที่เปิดรับ
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </a>
          <Link href="/about-us" className="btn-9e-outline">
            ดูเกี่ยวกับเรา
          </Link>
        </motion.div>
      </div>

      <svg
        aria-hidden
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 h-[80px] w-full md:h-[120px]"
      >
        <path
          d="M0,64 C240,112 480,16 720,48 C960,80 1200,32 1440,72 L1440,120 L0,120 Z"
          className="fill-white dark:fill-[#060e1a]"
        />
      </svg>
    </section>
  );
}
