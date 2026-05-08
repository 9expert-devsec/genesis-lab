import Link from 'next/link';
import { Building2, Monitor, Users } from 'lucide-react';

const SERVICES = [
  {
    Icon: Users,
    title: 'สอนสด (Public Training)',
    desc: 'อบรมสดกับวิทยากรมืออาชีพ ทั้ง Classroom ณ สถาบัน 9Expert Training และเรียนสดผ่าน MS Teams ตามรอบอบรมที่ 9Expert Training กำหนด',
    href: '/training-course',
  },
  {
    Icon: Building2,
    title: 'InHouse',
    desc: 'การจัดอบรมคอมพิวเตอร์ให้องค์กรท่าน โดยสามารถเลือกหลักสูตรและกำหนดเวลาการฝึกอบรมที่เหมาะสมกับองค์กร และวิทยากรผู้เชี่ยวชาญของ 9Expert',
    href: '/contact-us',
  },
  {
    Icon: Monitor,
    title: 'e-Learning',
    desc: 'หลักสูตรการอบรมสไตล์ใช้งานจริง ด้วยวิทยากรมากประสบการณ์ จาก 9Expert Training ในรูปแบบ Video',
    href: 'https://academy.9experttraining.com',
  },
];

export function ServicesSection() {
  return (
    <section className="bg-9e-gradient-hero px-4 py-12 sm:px-6 sm:py-14 lg:px-8 dark:bg-none dark:bg-9e-navy">
      <div className="mx-auto max-w-[1200px] text-center">
        <h2 className="mb-2 text-2xl font-bold text-white">
          บริการของเรา
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-sm text-white/80">
          9Expert Training คือสถาบันฝึกอบรมคอมพิวเตอร์ระดับมืออาชีพ
          ที่เปิดสอนให้กับบุคคลทั่วไปและระดับองค์กร ด้วยการสอนให้รู้จริง
          ใช้งานได้จริง วิธีการสอนที่เข้าใจง่าย
          ด้วยวิทยากรที่มีคุณภาพและมีประสบการณ์จริง
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {SERVICES.map(({ Icon, title, desc, href }) => (
            <Link
              key={title}
              href={href}
              className="group flex flex-col items-center gap-4 rounded-2xl border-2 border-transparent bg-white dark:bg-9e-card px-4 py-6 text-center shadow-sm transition-all duration-200 ease-9e hover:-translate-y-1 hover:border-9e-air hover:shadow-9e-md active:scale-95 sm:p-6"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-9e-air text-9e-action transition-all duration-200 group-hover:border-9e-action group-hover:bg-9e-action group-hover:text-white dark:text-white dark:border-white">
                <Icon className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h3 className="text-base font-bold text-9e-navy dark:text-white transition-colors duration-200 group-hover:text-9e-action dark:group-hover:text-9e-air">
                {title}
              </h3>
              <p className="text-sm leading-relaxed text-9e-slate-dp-50 dark:text-[#b6c2d4]">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
