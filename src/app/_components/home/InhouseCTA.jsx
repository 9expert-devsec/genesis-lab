import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function InhouseCTA() {
  return (
    <section className="relative overflow-hidden bg-9e-gradient-hero px-4 py-16 lg:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-80 w-80 -translate-y-1/2 translate-x-1/4 rounded-full bg-white/5"
      />
      <div className="relative mx-auto max-w-[1280px] text-center">
        <h2 className="mb-4 text-2xl font-bold text-white lg:text-3xl">
          หากท่านต้องการอบรมภายใน
          <br className="hidden md:block" />
          องค์กรของท่าน (Inhouse)
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-sm text-white/80">
          เหมาะสำหรับองค์กรที่ต้องการให้ทางวิทยากรไปอบรมที่บริษัทของท่าน
          หรือตามสถานที่อื่นๆ ที่ท่านต้องการ
        </p>
        <Link
          href="/contact-us"
          className="inline-flex items-center gap-2 rounded-full bg-[#FFB020] px-8 py-4 text-base font-bold text-white shadow-lg transition-colors duration-9e-micro ease-9e hover:bg-[#F5A500]"
        >
          ขอใบเสนอราคา
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </Link>
      </div>
    </section>
  );
}
