import Link from 'next/link';
import { Sparkles, Calendar, GraduationCap, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { siteConfig } from '@/config/site';

export const metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
};

/**
 * Home page.
 *
 * This is the Phase 1 shell: layout + CI tokens + typography + motion.
 * Data wiring (course grid from /public-courses, articles preview,
 * schedule strip) arrives in Phase 2.
 *
 * Because this page is in /app/page.jsx (root), it doesn't inherit the
 * (public) group's layout — we render PublicHeader/Footer inline.
 */
export default function HomePage() {
  return (
    <>
      <PublicHeader />
      <main id="main">
        <Hero />
        <Highlights />
        <ComingNext />
      </main>
      <PublicFooter />
    </>
  );
}

// ── Sections ─────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Signature gradient background — dark in both themes; text below is white */}
      <div
        className="absolute inset-0 bg-9e-gradient-signature opacity-90"
        aria-hidden="true"
      />
      {/* Subtle orbital motif — universe of learning */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(72,176,255,0.25),transparent_60%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-[1280px] px-4 py-20 lg:px-6 lg:py-32">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-9e-lime/30 bg-9e-lime/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-9e-lime">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            {siteConfig.concept}
          </div>

          <h1 className="text-4xl font-extrabold leading-tight text-9e-ice md:text-5xl lg:text-6xl">
            {siteConfig.slogan}
            <br />
            <span className="text-9e-lime">{siteConfig.motto}</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg text-9e-ice/80 leading-relaxed">
            {siteConfig.description} พร้อมผู้เชี่ยวชาญตัวจริง
            ที่จะพาคุณก้าวทันโลกเทคโนโลยีที่เปลี่ยนแปลงทุกวัน
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="cta" size="lg">
              <Link href="/training-course">ดูหลักสูตรทั้งหมด</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-9e-ice text-9e-ice hover:bg-9e-ice hover:text-9e-navy">
              <Link href="/schedule">ตารางอบรม</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Highlights() {
  const items = [
    {
      icon: GraduationCap,
      title: 'หลักสูตรคุณภาพ',
      desc: 'ออกแบบโดยผู้เชี่ยวชาญตัวจริงในสาย Power Platform, Data, AI และ Programming',
    },
    {
      icon: Calendar,
      title: 'ตารางอบรมยืดหยุ่น',
      desc: 'เปิดอบรมทุกเดือน เลือกวันที่ตรงกับตารางของคุณได้ ทั้ง Public Class และ In-house',
    },
    {
      icon: Users,
      title: 'สอนสไตล์ใช้งานจริง',
      desc: 'เน้น Workshop และ Case Study จริง ใช้งานได้ทันทีหลังเรียนจบ',
    },
  ];

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-16 lg:px-6 lg:py-24">
      <div className="grid gap-6 md:grid-cols-3">
        {items.map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="hover:-translate-y-[2px] hover:shadow-9e-md">
            <CardContent className="pt-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-9e-md bg-9e-brand/10">
                <Icon className="h-5 w-5 text-9e-brand" strokeWidth={1.75} />
              </div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription className="mt-2 leading-relaxed">
                {desc}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ComingNext() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 pb-24 lg:px-6">
      <div className="rounded-9e-xl border border-dashed border-[var(--surface-border)] bg-[var(--surface-muted)] p-8 text-center md:p-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-9e-brand">
          Phase 2 (Coming Soon)
        </p>
        <h2 className="mt-2 text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
          คอร์สเรียน · โปรโมชั่น · ตารางอบรม
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--text-secondary)]">
          หน้าหลักจะแสดงหลักสูตรยอดนิยม โปรโมชั่นล่าสุด
          และตารางอบรมเดือนนี้ เชื่อมต่อข้อมูลจาก MSDB API
          กำลังทยอยเปิดใช้งานตามลำดับ
        </p>
      </div>
    </section>
  );
}
