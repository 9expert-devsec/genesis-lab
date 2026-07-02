'use client';

import { useEffect, useRef } from 'react';

/**
 * Warp starfield hero background — plain Canvas 2D, no dependencies.
 *
 * Stars radiate outward from the center as short streaks whose length
 * scales with speed. On mount the field runs at warp speed for ~1.5s,
 * then eases down to a slow drift where stars read as gently moving dots.
 *
 * Guardrails:
 *  - devicePixelRatio capped at 2
 *  - RAF paused when the tab is hidden (visibilitychange) or the hero
 *    scrolls out of view (IntersectionObserver)
 *  - prefers-reduced-motion renders a single static frame, no loop
 */

const STAR_COUNT = 250;
const WARP_FACTOR = 10; // initial warp multiplier
const DRIFT_FACTOR = 0.12; // settled cruise multiplier
const WARP_MS = 1500; // ease-down duration
const BASE_SPEED = 0.0009; // z units per ms at factor 1

function makeStar() {
  return {
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    z: Math.random() * 0.85 + 0.15,
    color: Math.random() < 0.2 ? '#48B0FF' : '#F8FAFD',
  };
}

export function Starfield({ className }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stars = Array.from({ length: STAR_COUNT }, makeStar);

    let width = 0;
    let height = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function project(star, z) {
      const scale = Math.min(width, height) * 0.5;
      return [width / 2 + (star.x / z) * scale, height / 2 + (star.y / z) * scale];
    }

    function drawStaticFrame() {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        const [sx, sy] = project(star, star.z);
        if (sx < 0 || sx > width || sy < 0 || sy > height) continue;
        ctx.beginPath();
        ctx.arc(sx, sy, (1 - star.z) * 1.6 + 0.4, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = 0.9 - star.z * 0.5;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    resize();

    if (reduceMotion) {
      drawStaticFrame();
      const onResize = () => {
        resize();
        drawStaticFrame();
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    let rafId = 0;
    let running = false;
    let tabVisible = document.visibilityState !== 'hidden';
    let inView = true;
    let lastTime = performance.now();
    const startTime = performance.now();

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(now - lastTime, 64);
      lastTime = now;

      // Ease from warp down to drift over WARP_MS (cubic ease-out).
      const t = Math.min((now - startTime) / WARP_MS, 1);
      const factor = DRIFT_FACTOR + (WARP_FACTOR - DRIFT_FACTOR) * (1 - t) ** 3;

      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = 'round';

      for (const star of stars) {
        const pz = star.z;
        star.z -= BASE_SPEED * factor * dt;
        if (star.z <= 0.03) {
          Object.assign(star, makeStar(), { z: 1 });
          continue;
        }
        const [px, py] = project(star, pz);
        const [sx, sy] = project(star, star.z);
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) {
          Object.assign(star, makeStar(), { z: 1 });
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx, sy);
        ctx.strokeStyle = star.color;
        ctx.globalAlpha = Math.min(1, 1 - star.z + 0.15);
        ctx.lineWidth = (1 - star.z) * 1.8 + 0.4;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function syncLoop() {
      const shouldRun = tabVisible && inView;
      if (shouldRun && !running) {
        running = true;
        lastTime = performance.now();
        rafId = requestAnimationFrame(frame);
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(rafId);
      }
    }

    const onVisibility = () => {
      tabVisible = document.visibilityState !== 'hidden';
      syncLoop();
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = !!entry?.isIntersecting;
      syncLoop();
    });
    observer.observe(canvas);
    const onResize = () => resize();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    syncLoop();

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
