"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, ArrowRight } from "lucide-react";

const RING1 = [
  { angle: 0, label: "Data", color: "#005CFF" },
  { angle: 120, label: "AI", color: "#48B0FF" },
  { angle: 240, label: "Business", color: "#005CFF" },
];

const RING2 = [
  { angle: 30, label: "Power BI", color: "#48B0FF" },
  { angle: 120, label: "Python", color: "#005CFF" },
  { angle: 210, label: "Excel", color: "#48B0FF" },
  { angle: 300, label: "RPA", color: "#005CFF" },
]; 

const DOTS = Array.from({ length: 24 }, (_, i) => i * 15);

function pointOnCircle(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: parseFloat((cx + r * Math.cos(rad)).toFixed(4)),
    y: parseFloat((cy + r * Math.sin(rad)).toFixed(4)),
  };
}

export default function HeroUniverse() {
  return (
    <section className="relative overflow-hidden bg-9e-ice dark:bg-[#060e1a] text-9e-navy dark:text-white">
      {/* Radial glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[25%] top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"
        style={{ background: "rgba(0,92,255,0.25)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[75%] top-[40%] h-[450px] w-[450px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]"
        style={{ background: "rgba(36,134,255,0.12)" }}
      />

      {/* Dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(rgba(72,176,255,0.15) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Corner decorations */}
      {/* <div
        aria-hidden
        className="pointer-events-none absolute left-6 top-24 h-40 w-40 border-l-2 border-t-2"
        style={{ borderColor: "rgba(0,92,255,0.3)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-10 right-6 h-40 w-40 border-b-2 border-r-2"
        style={{ borderColor: "rgba(0,92,255,0.3)" }}
      /> */}

      <div className="relative mx-auto flex min-h-[88vh] max-w-[1200px] flex-col items-center justify-center gap-10 px-4 py-24 text-center lg:px-6 lg:py-28">
        {/* Badge pill */}
        {/* <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur-sm"
          style={{
            borderColor: 'rgba(0,92,255,0.4)',
            background: 'rgba(0,92,255,0.1)',
            boxShadow: '0 10px 15px rgba(0,92,255,0.2)',
          }}
        >
          <Zap className="h-4 w-4 -rotate-[25deg] text-[#48B0FF]" />
          <span
            className="text-sm font-medium uppercase text-[#48B0FF]"
            style={{ letterSpacing: '0.35px' }}
          >
            Universe of Learning Technology
          </span>
        </motion.div> */}

        {/* H1 — two lines */}
        <div className="max-w-5xl text-3xl font-medium leading-tight md:text-7xl lg:text-5xl">
          <motion.h3
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="block bg-clip-text text-transparent lg:text-3xl bg-[linear-gradient(90deg,#081222_0%,#005cff_50%,#081222_100%)] dark:bg-[linear-gradient(90deg,#ffffff_0%,#93c5fd_50%,#ffffff_100%)]"
          >
            Never Stop Learning
          </motion.h3>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-2 block bg-clip-text text-transparent leading-tight"
            style={{
              backgroundImage:
                "linear-gradient(90deg,#48B0FF 0%,#005CFF 50%,#48B0FF 100%)",
            }}
          >
            In a World where Technology <br />
            Never Stops Changing.
          </motion.h1>
        </div>

        {/* Eyebrow subtext */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="text-sm font-medium uppercase text-[#99a1af]"
          style={{ letterSpacing: "4px" }}
        >
          Data · AI · Business · Technology
        </motion.p>

        {/* Body paragraph */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="max-w-3xl text-lg leading-relaxed text-9e-action dark:text-[#d1d5dc] md:text-2xl"
        >
          สอนแบ่งปันความรู้ เทคโนโลยีเพื่อ
          <span className="text-9e-navy dark:text-[#48B0FF]"> "ขับเคลื่อนประเทศไทย" </span> <br />
        </motion.p>

        {/* Gradient underline */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scaleX: 0.4 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="h-1 w-full max-w-3xl bg-gradient-to-r from-transparent via-[#005CFF] to-transparent"
        />

        {/* CTA buttons */}
        {/* <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-2 flex flex-col gap-4 sm:flex-row"
        >
          <Link
            href="/training-course"
            className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-[#005CFF] to-[#2486FF] px-10 py-4 text-lg font-semibold text-white transition-all duration-300"
            style={{ boxShadow: '0 25px 50px -12px rgba(0,92,255,0.5)' }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-1 rounded-full border-2"
              style={{ borderColor: 'rgba(72,176,255,0.3)' }}
            />
            <span className="relative z-10 flex items-center gap-2">
              ดูหลักสูตรทั้งหมด
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
          </Link>
          <Link
            href="/contact-us"
            className="inline-flex items-center justify-center rounded-full border border-[rgba(72,176,255,0.4)] px-10 py-4 text-lg font-semibold text-[#48B0FF] transition-all duration-300 hover:border-[#48B0FF] hover:bg-[rgba(72,176,255,0.08)]"
          >
            ติดต่อเรา
          </Link>
        </motion.div> */}

        {/* Orbit SVG below the hero — large */}
        {/* <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="mt-8 flex w-full max-w-2xl items-center justify-center"
        >
          <OrbitSvg />
        </motion.div> */}
      </div>

      <style>{`
        @keyframes orbit-cw  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes orbit-ccw { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        .orbit-counter   { animation: orbit-ccw 20s linear infinite; }
        .orbit-counter-2 { animation: orbit-cw 35s linear infinite; }
      `}</style>
    </section>
  );
}

function OrbitSvg() {
  const cx = 200;
  const cy = 200;

  return (
    <svg
      viewBox="0 0 400 400"
      className="w-full max-w-xl drop-shadow-[0_0_80px_rgba(0,92,255,0.45)]"
    >
      <defs>
        <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#005CFF" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#005CFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="centerCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#48B0FF" />
          <stop offset="60%" stopColor="#005CFF" />
          <stop offset="100%" stopColor="#003db0" />
        </radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle
        cx={cx}
        cy={cy}
        r="80"
        fill="none"
        stroke="#005CFF"
        strokeOpacity="0.30"
        strokeWidth="1"
        strokeDasharray="4 8"
      />
      <circle
        cx={cx}
        cy={cy}
        r="140"
        fill="none"
        stroke="#005CFF"
        strokeOpacity="0.20"
        strokeWidth="1"
        strokeDasharray="4 8"
      />
      <circle
        cx={cx}
        cy={cy}
        r="180"
        fill="none"
        stroke="#48B0FF"
        strokeOpacity="0.12"
        strokeWidth="1"
        strokeDasharray="2 6"
      />

      {DOTS.map((angle) => {
        const p = pointOnCircle(cx, cy, 180, angle);
        return (
          <circle
            key={angle}
            cx={p.x}
            cy={p.y}
            r="1.5"
            fill="#48B0FF"
            fillOpacity="0.45"
          />
        );
      })}

      <circle cx={cx} cy={cy} r="70" fill="rgba(0,92,255,0.10)" />
      <circle cx={cx} cy={cy} r="55" fill="rgba(0,92,255,0.18)" />
      <circle cx={cx} cy={cy} r="44" fill="url(#centerGlow)" />
      <circle
        cx={cx}
        cy={cy}
        r="40"
        fill="url(#centerCore)"
        filter="url(#glow)"
      />
      <text
        x={cx}
        y={cy + 9}
        textAnchor="middle"
        fontSize="28"
        fontWeight="900"
        fill="#fff"
        letterSpacing="0.5"
        filter="url(#glow)"
      >
        9E
      </text>

      <g className="orbit-counter" style={{ transformOrigin: "200px 200px" }}>
        {RING1.map((node) => {
          const p = pointOnCircle(cx, cy, 80, node.angle);
          return <Node key={node.label} cx={p.x} cy={p.y} label={node.label} />;
        })}
      </g>

      <g className="orbit-counter-2" style={{ transformOrigin: "200px 200px" }}>
        {RING2.map((node) => {
          const p = pointOnCircle(cx, cy, 140, node.angle);
          return (
            <Node key={node.label} cx={p.x} cy={p.y} label={node.label} small />
          );
        })}
      </g>
    </svg>
  );
}

function Node({ cx, cy, label, small = false }) {
  const r = small ? 18 : 22;
  return (
    <g filter="url(#nodeGlow)">
      <circle cx={cx} cy={cy} r={r + 10} fill="rgba(0,92,255,0.30)" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="#0d1f35"
        stroke="#48B0FF"
        strokeWidth="1.5"
      />
      <text
        x={cx}
        y={cy + 3}
        textAnchor="middle"
        fontSize={small ? "8" : "9"}
        fontWeight="600"
        fill="#fff"
      >
        {label}
      </text>
    </g>
  );
}
