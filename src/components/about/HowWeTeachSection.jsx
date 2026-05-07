import { BookOpen, Users, MonitorPlay, Building2, GraduationCap } from 'lucide-react';

const PILLARS = [
  {
    icon: BookOpen,
    subtitle: 'Curriculum',
    title: 'Real-World Curriculum',
    body: 'หลักสูตรออกแบบจากงานจริง ไม่ใช่แค่ทฤษฎี เนื้อหาทุกบทมาจากปัญหาที่องค์กรพบจริง',
    chips: [
      { value: '100%', label: 'อัปเดตทุกปี' },
      { value: 'Real', label: 'Use Cases' },
      { value: 'Pro', label: 'มาตรฐานสากล' },
    ],
  },
  {
    icon: Users,
    subtitle: 'Instructors',
    title: 'Expert Instructors',
    body: 'วิทยากรที่มีประสบการณ์จริงจากอุตสาหกรรม ผ่านงานกับองค์กรชั้นนำกว่า 5,000 แห่ง',
    chips: [
      { value: '10+', label: 'ปีประสบการณ์' },
      { value: 'MVP', label: 'Microsoft' },
      { value: 'Cert', label: 'รับรอง' },
    ],
  },
  {
    icon: MonitorPlay,
    subtitle: 'Hands-on',
    title: 'Hands-on Learning',
    body: 'Workshop, Lab และ Case Study ในทุกหลักสูตร เพื่อให้ผู้เรียนได้ลงมือทำจริง',
    chips: [
      { value: '70%', label: 'Workshop' },
      { value: 'Lab', label: 'ทุกบท' },
      { value: 'Live', label: 'Coding' },
    ],
  },
  {
    icon: Building2,
    subtitle: 'Flexible',
    title: 'Flexible Training',
    body: 'Public Class, In-house, Online และ Onsite ปรับรูปแบบให้ตรงกับความต้องการขององค์กร',
    chips: [
      { value: '4', label: 'รูปแบบเรียน' },
      { value: '24/7', label: 'Support' },
      { value: 'Custom', label: 'จัดเฉพาะ' },
    ],
  },
];

export default function HowWeTeachSection() {
  return (
    <section
      className="relative overflow-hidden bg-[#F8FAFD] py-24 dark:bg-[#0D1B2A]"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(0,92,255,0.06) 0%, transparent 70%)',
      }}
    >
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          {/* <div
            className="mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5"
            style={{
              borderColor: 'rgba(0,92,255,0.3)',
              background: 'rgba(0,92,255,0.05)',
            }}
          >
            <GraduationCap className="h-4 w-4 text-[#005CFF] dark:text-[#48B0FF]" />
            <span
              className="text-sm uppercase text-[#005CFF] dark:text-[#48B0FF]"
              style={{ letterSpacing: '0.7px' }}
            >
              วิธีการสอนของเรา
            </span>
          </div> */}
          <h2 className="text-3xl font-extrabold leading-normal text-[#0D1B2A] dark:text-white md:text-5xl">
            <span className="block leading-normal">สอนสไตล์</span>
            <span
              className="block bg-clip-text text-transparent leading-normal"
              style={{
                backgroundImage:
                  'linear-gradient(90deg,#48B0FF 0%,#005CFF 50%,#48B0FF 100%)',
              }}
            >
              ใช้งานจริง
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#465469] dark:text-[#94a3b8]">
            เราออกแบบประสบการณ์การเรียนรู้ที่ผู้เรียนนำไปใช้ในงานได้ทันที
            ผ่าน 4 หลักการสำคัญ
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map(({ icon: Icon, subtitle, title, body, chips }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-7 transition-all  duration-300 hover:-translate-y-1 hover:border-[#005CFF]/40 hover:shadow-xl dark:border-[#1e2939] dark:bg-transparent dark:hover:shadow-[0_8px_32px_rgba(0,92,255,0.18)]"
            >
              <div
                aria-hidden
                className="absolute inset-0 hidden dark:block"
                style={{
                  backgroundImage:
                    'linear-gradient(130deg,rgba(16,24,40,0.6) 0%,rgba(0,0,0,0.6) 100%)',
                }}
              />

              <div className="relative items-center flex flex-col justify-center">
                <div
                  className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl text-white shadow-lg transition-all duration-300 group-hover:shadow-[0_0_28px_rgba(0,92,255,0.5)]"
                  style={{
                    backgroundImage:
                      'linear-gradient(135deg,#005CFF 0%,#2486FF 100%)',
                  }}
                >
                  <Icon className="h-9 w-9" strokeWidth={2} />
                </div>

                <p
                  className="mb-2 text-xs font-semibold uppercase text-[#005CFF] dark:text-[#48B0FF]"
                  style={{ letterSpacing: '1.5px' }}
                >
                  {subtitle}
                </p>
                <h3 className="text-center mb-3 text-xl font-medium text-[#0D1B2A] dark:text-white">
                  {title}
                </h3>
                <p className="mb-5 text-sm leading-relaxed text-[#465469] dark:text-[#6a7282]">
                  {body}
                </p>

                {/* <div className="flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <div
                      key={chip.label + chip.value}
                      className="flex items-center gap-1 rounded-lg border px-3 py-1.5"
                      style={{
                        borderColor: 'rgba(0,92,255,0.2)',
                        background: 'rgba(0,92,255,0.08)',
                      }}
                    >
                      <span className="text-sm font-medium text-[#005CFF] dark:text-[#48B0FF]">
                        {chip.value}
                      </span>
                      <span className="text-xs text-[#465469] dark:text-[#6a7282]">
                        {chip.label}
                      </span>
                    </div>
                  ))}
                </div> */}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
