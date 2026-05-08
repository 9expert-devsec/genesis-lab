import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import FloatingDots from '@/components/about/FloatingDots';

export default function PortfolioCTA() {
  return (
    <section className="relative overflow-hidden bg-9e-navy py-24 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-9e-action/20 blur-[120px]"
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

      <div className="relative z-10 mx-auto max-w-[900px] px-4 text-center lg:px-6">
        <h2 className="font-heading text-3xl font-extrabold leading-normal text-white md:text-5xl">
          <span className="block">ให้ 9Expert Training</span>
          <span className="block bg-9e-gradient-hero bg-clip-text text-transparent">
            ดูแลการพัฒนาบุคลากรของคุณ
          </span>
        </h2>

        <p className="mx-auto mt-6 max-w-xl font-thai text-base leading-relaxed text-9e-slate-dp-600 md:text-lg">
          ติดต่อเราเพื่อรับข้อเสนอการอบรมแบบ In-House สำหรับองค์กรของคุณ
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/contact-us" className="btn-9e-cta inline-flex items-center gap-2">
            ติดต่อทีมงาน
            <ArrowRight className="h-5 w-5 transition-transform duration-9e-micro group-hover:translate-x-1" />
          </Link>
          <Link href="/training-course" className="btn-9e-outline">
            ดูหลักสูตรทั้งหมด
          </Link>
        </div>
      </div>
    </section>
  );
}
