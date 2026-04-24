import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Home hero. Banner carousel is stubbed — a Banners adapter / model is
 * wired up in a later phase. For now we render the static text + a
 * placeholder image card so the layout is correct.
 */
export function HeroBanner() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-white to-[#E8F4FD] px-4 py-12 lg:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-9e-sky/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-9e-primary/5 blur-2xl"
      />

      <div className="relative mx-auto grid min-h-[460px] w-full max-w-[1280px] grid-cols-1 items-center gap-8 lg:grid-cols-2">
        <div>
          <h1 className="mb-4 text-3xl font-bold leading-tight text-9e-navy lg:text-5xl">
            9Expert
            <br />
            Training
          </h1>
          <p className="mb-2 text-base text-9e-slate">
            สอนแบ่งปันความรู้ เทคโนโลยีเพื่อ{' '}
            <span className="font-bold text-9e-navy">
              &ldquo;ขับเคลื่อนประเทศไทย&rdquo;
            </span>
          </p>
          <p className="mb-8 text-sm text-9e-slate">
            Power BI, Excel, RPA, Macro, Power Platform
          </p>
          <Link
            href="/training-course"
            className="inline-flex items-center gap-2 rounded-full bg-[#FFB020] px-6 py-3 text-sm font-bold text-white shadow-md transition-colors duration-9e-micro ease-9e hover:bg-[#F5A500]"
          >
            ดูคอร์สเรียนทั้งหมด
          </Link>

          <div className="mt-8 flex gap-2">
            <span className="h-3 w-3 rounded-full bg-9e-primary" />
            <span className="h-3 w-3 rounded-full bg-gray-300" />
            <span className="h-3 w-3 rounded-full bg-gray-300" />
          </div>
        </div>

        <div className="relative flex justify-center lg:justify-end">
          <div className="aspect-video w-full max-w-[480px] overflow-hidden rounded-2xl bg-9e-navy shadow-xl">
            <div
              className="flex h-full w-full items-center justify-center bg-9e-gradient-signature text-sm text-white/40"
              aria-label="แบนเนอร์"
            >
              9Expert Training
            </div>
          </div>
          <button
            type="button"
            aria-label="ก่อนหน้า"
            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-9e-navy shadow hover:bg-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="ถัดไป"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-9e-navy shadow hover:bg-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
