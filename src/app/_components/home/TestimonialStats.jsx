import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const TESTIMONIALS = [
  {
    course: 'Microsoft Power BI',
    quote: 'ได้ความรู้ครบถ้วน วิทยากรอธิบายเข้าใจง่าย นำไปใช้ในงานจริงได้เลย',
  },
  {
    course: 'Microsoft Excel Intermediate',
    quote: 'เรียนแล้วสามารถนำความรู้ไปปรับใช้กับงานได้เลยครับ',
    rating: 4.5,
    featured: true,
  },
  {
    course: 'Power Automate for Business',
    quote: 'ช่วยลดเวลาทำงานประจำวันได้มาก สอนตัวอย่างที่ใช้จริงเยอะ',
  },
];

const STATS = [
  { value: '1.5K+', label: 'องค์กร' },
  { value: '100K+', label: 'ผู้เรียน' },
  { value: '4.8', label: 'รีวิว', star: true },
  { value: '200K+', label: 'ผู้ติดตาม' },
];

export function TestimonialStats() {
  return (
    <section className="bg-white px-4 py-14 lg:px-6">
      <div className="mx-auto max-w-[1280px]">
        <h2 className="mb-2 text-center text-2xl font-bold text-9e-navy">
          ส่วนหนึ่งของความภาคภูมิใจ
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-sm text-9e-slate">
          9Expert Training
          เป็นส่วนหนึ่งของการสนับสนุนบุคคลและองค์กรในการปรับตัวตามความเปลี่ยนแปลงของเทคโนโลยี
          เพื่อเพิ่มประสิทธิภาพการทำงานและสร้างความได้เปรียบเหนือคู่แข่ง
        </p>

        <div className="mb-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className={cn(
                'flex gap-3 rounded-2xl p-5',
                t.featured
                  ? 'scale-[1.02] bg-white shadow-9e-md'
                  : 'bg-9e-ice opacity-80'
              )}
            >
              <div className="h-12 w-12 shrink-0 rounded-full bg-gray-200" />
              <div>
                <p className="text-xs text-9e-slate">ผู้เรียนจากคอร์ส</p>
                <p className="text-sm font-bold text-9e-navy">{t.course}</p>
                <p className="mt-1 text-xs text-9e-slate">{t.quote}</p>
                {t.rating && (
                  <div className="mt-2 flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className="text-xs font-bold text-9e-navy">
                      {t.rating}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={cn(
                'flex flex-col items-center gap-1 border-gray-200',
                i < STATS.length - 1 && 'md:border-r'
              )}
            >
              <div className="flex items-center gap-1">
                {s.star && (
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                )}
                <span className="text-2xl font-extrabold text-9e-navy">
                  {s.value}
                </span>
              </div>
              <span className="text-sm text-9e-slate">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
