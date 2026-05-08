import { Check, GraduationCap, ArrowRight } from 'lucide-react';
import FloatingDots from '@/components/about/FloatingDots';

const INSTRUCTOR_BENEFITS = [
  'รายได้เสริมจากการสอน',
  'สร้าง Personal Brand ในวงการ',
  'เครือข่ายวิทยากรมืออาชีพ',
];

export default function InstructorCTA() {
  return (
    <section className="relative overflow-hidden bg-9e-navy py-24 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-9e-gradient-signature opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-9e-action/20 blur-[120px]"
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

      <div className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          {/* Left — text */}
          <div>
            <p className="mb-4 font-en text-sm font-semibold uppercase tracking-[1.2px] text-9e-lime">
              BECOME AN INSTRUCTOR
            </p>

            <h2 className="font-heading text-3xl font-bold leading-tight text-white md:text-4xl">
              <span className="block">สนใจเป็นวิทยากร</span>
              <span className="block">
                กับ{' '}
                <span className="bg-9e-gradient-hero bg-clip-text text-transparent">
                  9Expert?
                </span>
              </span>
            </h2>

            <p className="mt-4 max-w-xl font-thai text-base leading-relaxed text-9e-slate-dp-600">
              เราเปิดรับผู้เชี่ยวชาญที่มีประสบการณ์จริงในสายงาน
              มาร่วมถ่ายทอดความรู้ให้กับองค์กรชั้นนำ
            </p>

            <ul className="mt-6 space-y-3">
              {INSTRUCTOR_BENEFITS.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-9e-lime/20">
                    <Check size={14} className="text-9e-lime" strokeWidth={3} />
                  </span>
                  <span className="font-thai text-sm text-white/90">{item}</span>
                </li>
              ))}
            </ul>

            <a
              href="mailto:instructor@9expert.co.th?subject=สนใจเป็นวิทยากรกับ%209Expert"
              className="btn-9e-cta mt-8 inline-flex items-center gap-2"
            >
              ส่ง Portfolio มาหาเรา
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </a>
          </div>

          {/* Right — decorative icon */}
          <div className="relative hidden h-[280px] items-center justify-center lg:flex">
            <span
              aria-hidden
              className="absolute h-48 w-48 animate-ping rounded-full border-2 border-9e-brand/20"
              style={{ animationDuration: '3s' }}
            />
            <span
              aria-hidden
              className="absolute h-64 w-64 animate-ping rounded-full border-2 border-9e-brand/10"
              style={{ animationDuration: '4s' }}
            />
            <GraduationCap
              size={120}
              className="relative text-9e-brand/40"
              strokeWidth={1.25}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
