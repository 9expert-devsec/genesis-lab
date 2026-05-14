'use client';

import Link from 'next/link';
import {
  ArrowRight,
  MonitorPlay,
  Video,
  Building2,
  BookOpen,
} from 'lucide-react';

const SERVICES = [
  {
    icon: MonitorPlay,
    title: 'สอนสด',
    description:
      'อบรมสดกับวิทยากรมืออาชีพที่ Classroom ณ สถาบัน 9Expert Training Center',
    accent: 'border-t-2 border-9e-brand',
    image: '/port/public_0.jpg',
  },
  {
    icon: Video,
    title: 'สอนออนไลน์',
    description:
      'หลักสูตรการอบรมสอนสไตล์ใช้งานจริงในรูปแบบ Video Conference ผ่าน MS Teams ตามรอบอบรม',
    accent: 'border-t-2 border-9e-air',
    image: '/port/online_0.png',
  },
  {
    icon: Building2,
    title: 'สอนนอกสถานที่',
    description:
      'จัดอบรม On-site ณ สถานที่ของท่าน หรือจัดอบรมในรูปแบบ In-house ตามความต้องการขององค์กร',
    accent: 'border-t-2 border-9e-lime',
    image: '/port/inhouse_0.jpg',
  },
  {
    icon: BookOpen,
    title: 'บทความ',
    description:
      'ค้นพบคลังความรู้ที่หลากหลายและมีคุณภาพกับ 9Expert แหล่งรวมบทความที่สร้างสรรค์',
    accent: 'border-t-2 border-9e-lime',
    image: '/port/article_0.jpg',
  },
];

export default function InhouseSection() {
  return (
    <section className="bg-white py-20 dark:bg-[var(--page-bg)]">
      <div className="mx-auto max-w-[1200px] ">
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-16">
          {/* Left — text block (5/12) */}
          <div className="w-full lg:w-5/12">


            <h2 className="font-heading text-3xl font-bold leading-tight text-9e-navy dark:text-white lg:text-4xl">
              <span className="block">บริการด้านการเรียนรู้</span>
              <span className="block">แนะนำสำหรับองค์กรของท่าน</span>
            </h2>

            <p className="mt-4 max-w-sm font-thai text-base leading-relaxed text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
              9Expert เราจะเป็นส่วนของการสนับสนุนให้กับบุคคลและองค์กรในการปรับตัวตามความเปลี่ยนแปลงของเทคโนโลยี
              ในยุคสมัยใหม่เพื่อนำมาใช้เพิ่มประสิทธิภาพการทำงานสร้างความได้เปรียบในการทำงาน ให้เหนือคู่แข่ง
            </p>

            <Link
              href="/registration/in-house"
              className="btn-9e-cta mt-8 inline-flex items-center gap-2"
            >
              สนใจจัดอบรมภายในองค์กรของท่าน
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </div>

          {/* Right — 2×2 service cards (7/12) */}
          <div className="w-full lg:w-7/12">
            <div className="grid grid-cols-2 gap-4">
              {SERVICES.map((service) => (
                <ServiceCard key={service.title} {...service} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServiceCard({ icon: Icon, title, description, accent, image }) {
  return (
    <div
      className={`group relative aspect-[4/3] cursor-default overflow-hidden rounded-9e-lg bg-9e-navy ${accent}`}
    >
      {/* Layer 1 — background photo */}
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-40 transition-transform duration-9e-reveal group-hover:scale-105"
        draggable={false}
      />

      {/* Layer 2 — gradient overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-9e-navy/90 via-9e-navy/50 to-9e-navy/20"
      />

      {/* Layer 3 — dot grid decoration */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'radial-gradient(circle, #ffffff 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* Layer 4 — content */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end p-5">
        <div className="transform transition-transform duration-9e-reveal group-hover:-translate-y-1">
          <Icon
            className="mb-2 h-8 w-8 text-white drop-shadow"
            strokeWidth={1.5}
          />
          <h3 className="font-heading text-lg font-bold leading-tight text-white">
            {title}
          </h3>
          <p className="mt-1 font-thai text-sm leading-snug text-white/80">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
