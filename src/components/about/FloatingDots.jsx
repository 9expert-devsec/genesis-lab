'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const SEEDS = [
  { x: 8,  y: 12, size: 6,  delay: 0,   duration: 4.5, color: 'rgba(72,176,255,0.45)' },
  { x: 18, y: 78, size: 4,  delay: 0.6, duration: 5.2, color: 'rgba(0,92,255,0.55)' },
  { x: 32, y: 22, size: 8,  delay: 1.2, duration: 6.0, color: 'rgba(72,176,255,0.30)' },
  { x: 48, y: 88, size: 5,  delay: 0.3, duration: 4.8, color: 'rgba(36,134,255,0.50)' },
  { x: 62, y: 14, size: 7,  delay: 1.8, duration: 5.5, color: 'rgba(72,176,255,0.40)' },
  { x: 74, y: 70, size: 4,  delay: 0.9, duration: 4.2, color: 'rgba(0,92,255,0.45)' },
  { x: 86, y: 32, size: 6,  delay: 1.5, duration: 5.8, color: 'rgba(72,176,255,0.35)' },
  { x: 92, y: 84, size: 5,  delay: 0.4, duration: 4.6, color: 'rgba(36,134,255,0.50)' },
  { x: 12, y: 48, size: 3,  delay: 2.1, duration: 5.0, color: 'rgba(72,176,255,0.55)' },
  { x: 56, y: 50, size: 4,  delay: 1.0, duration: 4.4, color: 'rgba(0,92,255,0.40)' },
];

export default function FloatingDots({ className = '' }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {SEEDS.map((d, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.size,
            height: d.size,
            backgroundColor: d.color,
            boxShadow: `0 0 ${d.size * 2}px ${d.color}`,
          }}
          animate={
            mounted
              ? { y: [0, -12, 0], opacity: [0.6, 1, 0.6] }
              : { y: 0, opacity: 0.6 }
          }
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
