'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';

const RING1 = [
  { angle: 0,   label: 'Data Analytics',        color: '#005CFF', featured: true  },
  { angle: 120, label: 'AI & Machine Learning', color: '#48B0FF', featured: true  },
  { angle: 240, label: 'Business Skills',       color: '#005CFF', featured: false },
];

const RING2 = [
  { angle: 0,   label: 'Power Platform', color: '#48B0FF', featured: false },
  { angle: 72,  label: 'Python',         color: '#005CFF', featured: false },
  { angle: 144, label: 'Excel',          color: '#48B0FF', featured: false },
  { angle: 216, label: 'RPA',            color: '#005CFF', featured: false },
  { angle: 288, label: 'Cloud',          color: '#48B0FF', featured: false },
];

const cx = 300;
const cy = 300;

function pointOnCircle(r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: parseFloat((cx + r * Math.cos(rad)).toFixed(4)),
    y: parseFloat((cy + r * Math.sin(rad)).toFixed(4)),
  };
}

export default function LearningUniverseSection({ landingData }) {
  const [hovered, setHovered] = useState(null);

  const programs = Array.isArray(landingData?.programs) ? landingData.programs : [];
  const allDomains = [...RING1, ...RING2];

  return (
    <section className="relative overflow-hidden bg-[#F8FAFD] py-24 dark:bg-[#0D1B2A]">
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <div
            className="mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5"
            style={{
              borderColor: 'rgba(0,92,255,0.3)',
              background: 'rgba(0,92,255,0.05)',
            }}
          >
            <Globe className="h-4 w-4 text-[#005CFF] dark:text-[#48B0FF]" />
            <span
              className="text-sm uppercase text-[#005CFF] dark:text-[#48B0FF]"
              style={{ letterSpacing: '0.7px' }}
            >
              จักรวาลแห่งความรู้
            </span>
          </div>
          <h2 className="text-3xl font-extrabold leading-tight text-[#0D1B2A] dark:text-white md:text-5xl">
            <span className="block">ทุกทักษะที่ต้องรู้</span>
            <span
              className="block bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(90deg,#48B0FF 0%,#005CFF 50%,#48B0FF 100%)',
              }}
            >
              ครบในที่เดียว
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#465469] dark:text-[#94a3b8]">
            ทักษะเทคโนโลยีทุกด้านที่คนทำงานยุคใหม่ต้องรู้
            ครบในที่เดียวที่ 9Expert
          </p>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[600px]">
          <svg viewBox="0 0 600 600" className="h-full w-full">
            <defs>
              <radialGradient id="luCenterGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#005CFF" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#005CFF" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="luCenterCore" cx="50%" cy="50%" r="50%">
                <stop offset="0%"  stopColor="#48B0FF" />
                <stop offset="60%" stopColor="#005CFF" />
                <stop offset="100%" stopColor="#003db0" />
              </radialGradient>
              <filter id="luGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="luLimeGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* dashed orbit rings */}
            <circle cx={cx} cy={cy} r="140" fill="none" stroke="#005CFF" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="4 8" />
            <circle cx={cx} cy={cy} r="220" fill="none" stroke="#48B0FF" strokeOpacity="0.20" strokeWidth="1" strokeDasharray="4 8" />

            {/* rotating ring 1 — slow CW */}
            <g style={{ transformOrigin: '300px 300px' }} className="lu-ring-1">
              {RING1.map((node) => {
                const p = pointOnCircle(140, node.angle);
                const isHovered = hovered === node.label;
                return (
                  <DomainNode
                    key={node.label}
                    cx={p.x}
                    cy={p.y}
                    label={node.label}
                    color={node.color}
                    featured={node.featured}
                    hovered={isHovered}
                    onEnter={() => setHovered(node.label)}
                    onLeave={() => setHovered(null)}
                  />
                );
              })}
            </g>

            {/* rotating ring 2 — slow CCW */}
            <g style={{ transformOrigin: '300px 300px' }} className="lu-ring-2">
              {RING2.map((node) => {
                const p = pointOnCircle(220, node.angle);
                const isHovered = hovered === node.label;
                return (
                  <DomainNode
                    key={node.label}
                    cx={p.x}
                    cy={p.y}
                    label={node.label}
                    color={node.color}
                    featured={node.featured}
                    hovered={isHovered}
                    onEnter={() => setHovered(node.label)}
                    onLeave={() => setHovered(null)}
                  />
                );
              })}
            </g>

            {/* center halos + node */}
            <circle cx={cx} cy={cy} r="80" fill="rgba(0,92,255,0.08)" />
            <circle cx={cx} cy={cy} r="60" fill="rgba(0,92,255,0.12)" />
            <circle cx={cx} cy={cy} r="68" fill="url(#luCenterGlow)" opacity="0.7" />
            <motion.circle
              cx={cx}
              cy={cy}
              r={48}
              fill="url(#luCenterCore)"
              filter="url(#luGlow)"
              animate={{ r: [48, 52, 48] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <text
              x={cx}
              y={cy + 6}
              textAnchor="middle"
              fontSize="20"
              fontWeight="800"
              fill="#fff"
              filter="url(#luGlow)"
            >
              9Expert
            </text>
          </svg>

          {/* Tooltip */}
          {hovered && (
            <div
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-[#005CFF]/40 bg-[#0D1B2A]/90 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_24px_rgba(0,92,255,0.4)] backdrop-blur-sm"
            >
              {hovered}
              {programs.length > 0 && (
                <span className="ml-2 text-[#48B0FF]">
                  {programs.length}+ หลักสูตร
                </span>
              )}
            </div>
          )}
        </div>

        {/* Legend chips */}
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {allDomains.map((d) => (
            <Link
              key={d.label}
              href="/training-course"
              className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#0D1B2A] transition-all hover:border-[#005CFF] hover:bg-[#005CFF] hover:text-white hover:shadow-[0_0_16px_rgba(0,92,255,0.25)] dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-white"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: d.featured ? '#D4F73F' : d.color,
                  boxShadow: d.featured
                    ? '0 0 8px rgba(212,247,63,0.7)'
                    : 'none',
                }}
              />
              {d.label}
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes lu-orbit-cw  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes lu-orbit-ccw { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        .lu-ring-1 { animation: lu-orbit-cw 60s linear infinite; }
        .lu-ring-2 { animation: lu-orbit-ccw 90s linear infinite; }
      `}</style>
    </section>
  );
}

function DomainNode({ cx, cy, label, color, featured, hovered, onEnter, onLeave }) {
  const useLime = featured;
  const fill = hovered
    ? useLime
      ? '#D4F73F'
      : color
    : useLime
      ? '#D4F73F'
      : '#0d1f35';
  const stroke = hovered
    ? useLime
      ? '#D4F73F'
      : '#D4F73F'
    : useLime
      ? '#D4F73F'
      : '#005CFF';
  const strokeOpacity = hovered ? 1 : useLime ? 0.7 : 0.4;
  const filter = useLime ? 'url(#luLimeGlow)' : 'url(#luGlow)';
  const textFill = useLime ? '#0D1B2A' : '#fff';

  return (
    <g
      style={{ cursor: 'pointer' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <motion.circle
        cx={cx}
        cy={cy}
        r={hovered ? 36 : 32}
        fill={fill}
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeWidth={hovered ? 2 : 1.5}
        filter={filter}
        animate={hovered ? { r: [36, 40, 36] } : {}}
        transition={hovered ? { duration: 1.4, repeat: Infinity } : {}}
      />
      <text
        x={cx}
        y={cy + 3}
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill={textFill}
        style={{ pointerEvents: 'none' }}
      >
        {label.length > 14 ? label.slice(0, 12) + '…' : label}
      </text>
    </g>
  );
}
