import Link from 'next/link';
import { Rocket, ArrowRight, GraduationCap } from 'lucide-react';
import FloatingDots from '@/components/about2/FloatingDots';

const TRUST_CHIPS = [
  'ออกแบบเฉพาะองค์กร',
  'วิทยากรมืออาชีพ',
  'มีใบประกาศนียบัตร',
];

export default function ContactCTA() {
  return (
    <section className="relative overflow-hidden bg-[#060e1a] py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(0,92,255,0.18)] blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(rgba(72,176,255,0.18) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <FloatingDots />

      <div
        aria-hidden
        className="pointer-events-none absolute left-6 top-6 h-32 w-32 border-l-2 border-t-2 border-[rgba(0,92,255,0.3)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-6 right-6 h-32 w-32 border-b-2 border-r-2 border-[rgba(0,92,255,0.3)]"
      />

      <div className="relative z-10 mx-auto max-w-[900px] px-4 text-center lg:px-6">
        <div
          className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full shadow-[0_25px_50px_-12px_rgba(0,92,255,0.6)]"
          style={{
            backgroundImage:
              'linear-gradient(135deg,#005CFF 0%,#2486FF 100%)',
          }}
        >
          <Rocket className="h-11 w-11 text-white" strokeWidth={2} />
        </div>

        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[rgba(0,92,255,0.3)] bg-[rgba(0,92,255,0.05)] px-4 py-1.5">
          <GraduationCap className="h-4 w-4 text-[#48B0FF]" />
          <span className="text-sm uppercase tracking-[0.7px] text-[#48B0FF]">
            อบรมเฉพาะองค์กร
          </span>
        </div>

        <h2 className="text-4xl font-extrabold leading-normal text-white md:text-6xl">
          <span className="block">สนใจอบรมภายในองค์กร?</span>
          <span className="block bg-[linear-gradient(90deg,#48B0FF_0%,#005CFF_50%,#48B0FF_100%)] bg-clip-text text-transparent">
            In-house Training
          </span>
        </h2>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#99a1af] md:text-lg">
          ออกแบบหลักสูตรเฉพาะสำหรับองค์กรของคุณ วิทยากรมืออาชีพ
          พร้อมใบประกาศนียบัตร
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/registration/in-house"
            className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-[#005CFF] to-[#2486FF] px-10 py-4 text-base font-semibold text-white shadow-[0_25px_50px_-12px_rgba(0,92,255,0.5)] transition-all duration-300 sm:w-auto sm:text-lg"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-1 rounded-full border-2 border-[rgba(72,176,255,0.3)]"
            />
            <span className="relative z-10 flex items-center gap-2">
              สอบถาม In-house
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
          </Link>
          <Link
            href="/training-course"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#D4F73F]/60 px-10 py-4 text-base font-semibold text-[#D4F73F] transition-all duration-300 hover:border-[#D4F73F] hover:bg-[#D4F73F]/10 sm:w-auto sm:text-lg"
          >
            ดูหลักสูตรทั้งหมด
          </Link>
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
          {TRUST_CHIPS.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#005CFF] shadow-[0_0_10px_rgba(0,92,255,0.8)]" />
              <span className="text-sm text-[#99a1af]">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
