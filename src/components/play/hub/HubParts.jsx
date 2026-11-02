'use client';

import Image from 'next/image';
import Link from 'next/link';
import { BookOpenText, Lock, Play, Plus, Sparkles } from 'lucide-react';

import { STAR_FILLED } from '../Stars';
import { follow, usePointerVars } from './usePointerVars';

/** Display heading with the lime italic accent tucked under its right end. */
export function SectionHeading({ title, accent, sub, id, as: Tag = 'h2' }) {
  return (
    <div className="text-center">
      <Tag id={id} className="relative inline-block font-en text-4xl font-bold uppercase leading-none tracking-tight text-white md:text-5xl">
        {title}
        <span className="absolute -bottom-6 right-0 block -rotate-6 whitespace-nowrap font-en text-2xl font-bold normal-case italic text-[#D4F73F] md:text-3xl">
          {accent}
        </span>
      </Tag>
      {sub && <p className="mx-auto mt-10 max-w-xl font-heading text-base text-white/70">{sub}</p>}
    </div>
  );
}

export function scrollToMap(e) {
  const el = document.getElementById('map');
  if (!el) return;
  e.preventDefault();
  let smooth = true;
  try {
    smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* keep smooth */
  }
  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  history.replaceState(null, '', '#map');
}

const ORBIT_ICONS = [
  { src: '/play/programs/excel.webp', pos: 'left-[6%] top-[58%]', size: 'w-16', depth: 22 },
  { src: '/play/programs/power-bi.webp', pos: 'left-[18%] top-[10%]', size: 'w-14', depth: 14 },
  { src: '/play/programs/power-apps.webp', pos: 'right-[6%] top-[22%]', size: 'w-14', depth: 30 },
  { src: '/play/programs/power-automate.webp', pos: 'right-[12%] bottom-[8%]', size: 'w-16', depth: 18 },
];

export function HubHero({ startHref, levelCount, chapterCount }) {
  const fx = usePointerVars();
  return (
    <section
      ref={fx.ref}
      onPointerMove={fx.onPointerMove}
      onPointerLeave={fx.onPointerLeave}
      aria-labelledby="play-hero-title"
      className="grid items-center gap-10 pt-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:pt-16"
    >
      <div>
        <h1 id="play-hero-title" className="relative inline-block font-en text-6xl font-bold uppercase leading-[0.9] tracking-tight text-white sm:text-7xl lg:text-8xl">
          Level up
          <span className="absolute -bottom-8 right-0 block -rotate-6 whitespace-nowrap text-3xl normal-case italic text-[#D4F73F] sm:text-4xl lg:text-5xl">
            your skills!
          </span>
        </h1>
        <p className="mt-14 font-heading text-2xl font-bold text-white">ฝึก Excel ผ่านภารกิจในอวกาศ ทีละด่าน</p>
        <p className="mt-3 max-w-lg text-base leading-relaxed text-white/70">
          เล่นเป็นนักบินอวกาศของร้านกาแฟ พิมพ์สูตรจริงลงในตารางจริง ถ้าสูตรถูก ช่องจะเขียว แล้วเก็บดาวไปปลดล็อกบทต่อไป
          ไม่ต้องติดตั้งอะไร เล่นได้ทันทีบนเบราว์เซอร์
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={startHref}
            className="inline-flex items-center gap-2 rounded-full bg-[#D4F73F] px-6 py-3 font-bold text-[#0D1B2A] transition-colors hover:bg-[#D8F852] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            เริ่มภารกิจแรก
          </Link>
          <a
            href="#map"
            onClick={scrollToMap}
            className="inline-flex items-center rounded-full border border-white/30 px-6 py-3 font-bold text-white transition-colors hover:border-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            ดูแผนที่ภารกิจ
          </a>
        </div>
        <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
          {[
            [String(levelCount), 'ด่าน รวมบอส'],
            [String(chapterCount), 'บท + บอส'],
            ['FREE', 'ไม่ต้องสมัคร'],
          ].map(([v, l]) => (
            <div key={l} className="flex items-baseline gap-2">
              <dt className="order-2 text-sm text-white/60">{l}</dt>
              <dd className="font-en text-3xl font-bold text-[#D4F73F]">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[520px]" aria-hidden="true">
        <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,rgba(72,176,255,0.35),rgba(212,247,63,0.12)_55%,transparent_72%)] blur-2xl" />
        <svg viewBox="0 0 520 520" className="absolute inset-0 h-full w-full" fill="none">
          <ellipse cx="260" cy="270" rx="236" ry="120" stroke="rgba(72,176,255,0.45)" strokeWidth="1.5" strokeDasharray="6 10" transform="rotate(-14 260 270)" />
          <ellipse cx="260" cy="270" rx="190" ry="210" stroke="rgba(212,247,63,0.25)" strokeWidth="1.5" strokeDasharray="4 12" transform="rotate(24 260 270)" />
        </svg>
        <div className="absolute inset-[8%]" style={follow(10, 8, 3)}>
          <Image src="/play/hero-rocket.webp" alt="" width={1240} height={1240} priority className="h-full w-full object-contain" />
        </div>
        {ORBIT_ICONS.map((ic) => (
          <div key={ic.src} className={`absolute ${ic.pos} ${ic.size}`} style={follow(ic.depth, ic.depth * 0.7)}>
            <Image src={ic.src} alt="" width={384} height={384} className="h-auto w-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)]" />
          </div>
        ))}
        <div className="absolute left-[2%] top-[30%] rounded-[10px] border border-white/15 bg-[#132638]/90 px-3 py-1.5 font-mono text-sm text-[#D4F73F] shadow-lg" style={follow(-14, -10)}>
          =SUM(D2:D6)
        </div>
        <div className="absolute bottom-[18%] right-[0%] inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-[#0D1B2A] shadow-lg" style={follow(-20, -12)}>
          ผ่านด่าน! <span className="text-[#FACC15] [text-shadow:0_0_1px_rgba(0,0,0,0.25)]">★★★</span>
        </div>
      </div>
    </section>
  );
}

export const PLANETS = [
  { key: 'excel', title: 'Excel', sub: 'แสนสนุก', meta: null, open: true, logo: '/play/programs/excel.webp', grad: ['#4FD18F', '#1A8A4F', '#0A3320'] },
  { key: 'power-bi', title: 'Power BI', sub: 'ดาวแดชบอร์ด', meta: 'กำลังสร้างภารกิจ', logo: '/play/programs/power-bi.webp', grad: ['#FFD84D', '#D99A00', '#4A3200'] },
  { key: 'power-apps', title: 'Power Apps', sub: 'ดาวสร้างแอป', meta: 'กำลังสร้างภารกิจ', logo: '/play/programs/power-apps.webp', grad: ['#F08AD8', '#A23A96', '#3A0D38'] },
  { key: 'power-automate', title: 'Power Automate', sub: 'ดาวอัตโนมัติ', meta: 'กำลังสร้างภารกิจ', logo: '/play/programs/power-automate.webp', grad: ['#7AB8FF', '#1A6FD6', '#082A5E'] },
];

function PlanetCard({ planet, index, total }) {
  const fx = usePointerVars();
  const num = String(index + 1).padStart(2, '0');
  return (
    <li className="[perspective:900px]">
      <article
        ref={fx.ref}
        onPointerMove={fx.onPointerMove}
        onPointerLeave={fx.onPointerLeave}
        aria-label={`${planet.title} ${planet.sub} · ${planet.open ? 'เปิดแล้ว' : 'เร็วๆ นี้'}`}
        className={`group relative flex h-[500px] flex-col overflow-hidden rounded-[28px] p-5 text-white ${
          planet.open ? 'border-2 border-[#D4F73F] shadow-[0_0_48px_rgba(79,209,143,0.35)]' : 'border border-white/10'
        }`}
        style={{
          backgroundImage: `linear-gradient(180deg, ${planet.grad[0]} 0%, ${planet.grad[1]} 50%, ${planet.grad[2]} 100%)`,
          transform: 'rotateX(calc(var(--py, 0) * -8deg)) rotateY(calc(var(--px, 0) * 8deg))',
          transition: 'transform 240ms cubic-bezier(0, 0, 0.2, 1)',
        }}
      >
        <span aria-hidden="true" className="pointer-events-none absolute -right-2 top-10 font-en text-[180px] font-bold leading-none text-white/10">
          {num}
        </span>
        <div className="relative flex items-center justify-between">
          {planet.open ? (
            <span className="rounded-full bg-[#D4F73F] px-3 py-1 text-xs font-bold text-[#0D1B2A]">เปิดแล้ว</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-3 py-1 text-xs font-bold text-white/90">
              <Lock className="h-3 w-3" aria-hidden="true" />
              เร็วๆ นี้
            </span>
          )}
          <span className="font-en text-xs font-bold text-white/70">
            {num} / {String(total).padStart(2, '0')}
          </span>
        </div>

        <div className="relative flex flex-1 items-center justify-center">
          <div className="absolute h-40 w-40 rounded-full bg-white/25 blur-3xl" aria-hidden="true" />
          <div className="relative transition-transform duration-300 ease-9e group-hover:-translate-y-2 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
            <Image src={planet.logo} alt="" width={384} height={384} className="h-auto w-36 object-contain drop-shadow-[0_16px_24px_rgba(0,0,0,0.35)]" />
          </div>
          <div className="absolute bottom-6 h-4 w-28 rounded-[50%] bg-black/35 blur-md" aria-hidden="true" />
        </div>

        <div className="relative text-center">
          <h3 className="font-en text-2xl font-bold uppercase tracking-wide">{planet.title}</h3>
          <p className="font-heading text-lg font-bold text-white/90">{planet.sub}</p>
          <p className="mt-1 text-xs text-white/70">{planet.meta}</p>
          <Plus className="mx-auto my-3 h-4 w-4 text-white/50" aria-hidden="true" strokeWidth={1.5} />
          {planet.open ? (
            <a
              href="#map"
              onClick={scrollToMap}
              className="block w-full rounded-full bg-white px-4 py-3 font-bold text-[#0A3320] transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4F73F]"
            >
              เข้าสู่ดาว →
            </a>
          ) : (
            // No notify backend yet, so this is a label, not a button that does nothing.
            <span className="block w-full rounded-full bg-white/15 px-4 py-3 text-center font-bold text-white/80">เร็วๆ นี้</span>
          )}
        </div>
      </article>
    </li>
  );
}

export function PlanetCards({ excelLevelCount }) {
  return (
    <section aria-labelledby="play-planets-title" className="mt-28">
      <SectionHeading id="play-planets-title" title="Choose your planet" accent="missions" sub="เลือกดาวที่อยากฝึก แต่ละดาวคือหนึ่งโปรแกรม ตอนนี้เปิดดาว Excel แล้ว" />
      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PLANETS.map((p, i) => (
          <PlanetCard key={p.key} planet={p.meta ? p : { ...p, meta: `Beginner · ${excelLevelCount} ด่าน` }} index={i} total={PLANETS.length} />
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  { n: '01', icon: BookOpenText, title: 'อ่านภารกิจ', body: 'น้องไนน์จะเล่าโจทย์ของร้าน และบอกว่าต้องทำให้ช่องไหนตรงกับคำตอบเงา' },
  { n: '02', icon: Play, title: 'พิมพ์สูตรแล้วรัน', body: 'พิมพ์สูตรเหมือนใน Excel จริง คลิกช่องในตารางเพื่อใส่ชื่อช่อง แล้วกดรันดูผลทีละช่อง' },
  { n: '03', icon: Sparkles, title: 'เก็บดาว + สูตรลับ', body: 'ผ่านด่านแล้วได้ดาวและ XP พร้อมสูตรอื่นที่ได้ผลเหมือนกัน ใช้คำใบ้น้อยยิ่งได้ดาวมาก' },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="play-how-title" className="mt-28">
      <SectionHeading id="play-how-title" title="How it works" accent="3 steps" />
      <ol className="mt-14 grid gap-5 md:grid-cols-3">
        {STEPS.map(({ n, icon: Icon, title, body }) => (
          <li key={n} className="flex h-full flex-col rounded-[24px] border border-white/10 bg-[#132638] p-6">
            <div className="flex items-center justify-between">
              <span className="font-en text-5xl font-bold leading-none text-[#D4F73F]">{n}</span>
              <Icon className="h-6 w-6 text-[#48B0FF]" aria-hidden="true" />
            </div>
            <h3 className="mt-4 font-heading text-xl font-bold text-white">{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-white/70">{body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-white/50">
        ใช้คำใบ้ 1 ครั้ง หัก 1 ดาว · ต่ำสุด 1 ดาว
        <span className={`inline-flex ${STAR_FILLED}`} aria-hidden="true">★</span>
      </p>
    </section>
  );
}

export function HubCta({ coursesHref }) {
  return (
    <section
      aria-labelledby="play-cta-title"
      className="relative mt-28 overflow-hidden rounded-[32px] bg-[linear-gradient(120deg,#005CFF_0%,#2486FF_60%,#48B0FF_100%)] px-6 py-10 md:px-12 md:py-14"
    >
      <div className="relative z-10 max-w-xl">
        <h2 id="play-cta-title" className="font-en text-3xl font-bold uppercase leading-tight text-white md:text-5xl">
          Ready for real missions?
        </h2>
        <p className="mt-3 font-heading text-lg text-white/90">เล่นจบแล้วอยากใช้จริงในงาน มาเรียน Excel กับผู้เชี่ยวชาญตัวจริงที่ 9Expert</p>
        <Link
          href={coursesHref}
          className="mt-6 inline-flex items-center rounded-full bg-[#D4F73F] px-6 py-3 font-bold text-[#0D1B2A] transition-colors hover:bg-[#D8F852] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          ดูหลักสูตร Excel ทั้งหมด
        </Link>
      </div>
      <Image
        src="/play/mascot-laptop.webp"
        alt=""
        width={720}
        height={800}
        className="pointer-events-none absolute -bottom-6 right-4 hidden h-auto w-56 object-contain md:block lg:right-12 lg:w-64"
      />
    </section>
  );
}
