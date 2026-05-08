import { Zap, Users, Laptop, TrendingUp, BookOpen, Award } from 'lucide-react';

const BENEFITS = [
  {
    icon: Zap,
    title: 'เติบโตเร็ว',
    sub: 'พัฒนาทักษะกับผู้เชี่ยวชาญตัวจริง',
  },
  {
    icon: Users,
    title: 'ทีมเวิร์คดี',
    sub: 'วัฒนธรรมองค์กรที่เปิดกว้างและสนับสนุน',
  },
  {
    icon: Laptop,
    title: 'Work Flexibility',
    sub: 'ชั่วโมงทำงานยืดหยุ่น Hybrid working',
  },
  {
    icon: TrendingUp,
    title: 'ค่าตอบแทนแข่งขันได้',
    sub: 'เงินเดือนตามความสามารถ ปรับได้ทุกปี',
  },
  {
    icon: BookOpen,
    title: 'เรียนรู้ตลอดชีพ',
    sub: 'เข้าเรียนคอร์สทุกหลักสูตรของ 9Expert ฟรี',
  },
  {
    icon: Award,
    title: 'Recognition',
    sub: 'ผลงานดีได้รับการยอมรับและรางวัล',
  },
];

const STATS = [
  { value: '15+ ปี',  label: 'ประสบการณ์' },
  { value: '90,000+', label: 'ผู้เรียน' },
  { value: '5,000+',  label: 'องค์กร' },
];

export default function WhyJoinSection() {
  return (
    <section className="bg-white py-20 dark:bg-[var(--page-bg)]">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start gap-12 lg:flex-row lg:gap-16">
          {/* Left — text + stats (5/12) */}
          <div className="w-full lg:w-5/12">

            <h2 className="font-heading text-3xl font-bold leading-tight text-9e-navy dark:text-white lg:text-4xl">
              <span className="block">
                เหตุผลที่
                <span className="bg-9e-gradient-hero bg-clip-text text-transparent">
                  คนเก่ง
                </span>
              </span>
              <span className="block">เลือกมาร่วมงานกับเรา</span>
            </h2>

            <p className="mt-4 max-w-md font-thai text-base leading-relaxed text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
              เราเชื่อในการเติบโตร่วมกัน ทีมที่แข็งแกร่ง และโอกาสที่ไม่สิ้นสุดในโลกของการเรียนรู้เทคโนโลยี
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              {STATS.map((stat, i) => (
                <div key={stat.label} className="flex items-center gap-4">
                  <div>
                    <p className="font-heading text-2xl font-bold text-9e-brand">
                      {stat.value}
                    </p>
                    <p className="font-thai text-sm text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
                      {stat.label}
                    </p>
                  </div>
                  {i < STATS.length - 1 && (
                    <span
                      aria-hidden
                      className="h-10 w-px bg-9e-slate-lt-300 dark:bg-9e-slate-dp-200"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right — 6 benefit chips (7/12) */}
          <div className="w-full lg:w-7/12">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map(({ icon: Icon, title, sub }) => (
                <div key={title} className="card-9e p-4">
                  <div className="mb-3 inline-flex rounded-9e-sm bg-9e-signature-950 p-2 dark:bg-9e-signature-900">
                    <Icon className="h-6 w-6 text-9e-brand" strokeWidth={2} />
                  </div>
                  <h3 className="font-heading text-sm font-bold text-9e-navy dark:text-white">
                    {title}
                  </h3>
                  <p className="mt-1 font-thai text-xs text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
                    {sub}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
