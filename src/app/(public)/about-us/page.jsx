import Image from "next/image";
import Link from "next/link";
import { Award, Users, BadgeCheck, Monitor, Star } from "lucide-react";
import { listPublicCourses } from "@/lib/api/public-courses";
import { listPrograms } from "@/lib/api/programs";
import { getInstructors, getAboutConfig } from "@/lib/actions/about";
import { StatsCounter } from "@/components/about/StatsCounter";
import { InstructorGrid } from "@/components/about/InstructorGrid";
import { InstructorQuote } from "@/app/_components/home/InstructorQuote";
import { cn } from "@/lib/utils";

export const revalidate = 3600;

export const metadata = {
  title: "เกี่ยวกับเรา | 9Expert Training",
  description:
    "ทำความรู้จักกับ 9Expert Training — ผู้นำด้านการอบรมเทคโนโลยี Microsoft, Power BI, AI, และ Programming",
};

const FEATURE_HIGHLIGHTS = [
  {
    icon: Award,
    title: "หลักสูตรทันสมัย",
    body: "เรามุ่งมั่นในการพัฒนาหลักสูตรให้มีความเหมาะสม และทันสมัยตรงตามความต้องการของธุรกิจพร้อมกรณีศึกษาที่จะทำให้ได้เข้าใจ พร้อมทำได้จริง",
  },
  {
    icon: Users,
    title: "พัฒนาหลักสูตรเฉพาะ",
    body: "หลักสูตรของเราสามารถปรับให้ตรงกับความต้องการเพื่อให้มั่นใจว่าคุณได้รับทักษะและความรู้เฉพาะที่จำเป็นสำหรับการเติบโตส่วนบุคคลหรือในสายอาชีพของคุณ",
  },
  {
    icon: BadgeCheck,
    title: "วิทยากรมืออาชีพ",
    body: "วิทยากรของเรามีประสบการณ์จริงในสายงานมากกว่า 10 ปีและมีความชำนาญทั้งการทำงาน และการถ่ายทอด",
  },
  {
    icon: Monitor,
    title: "มีรูปแบบการเรียนรู้ให้เลือก",
    body: "เรามีทั้งการอบรมแบบ Public อบรมที่ 9Expert และการอบรมให้กับองค์กร ทั้งแบบ Onsite และ Online ให้เหมาะสมกับท่าน",
  },
];

const STATS = [
  { value: "5K+", label: "องค์กร" },
  { value: "90K+", label: "ผู้เรียน" },
  { value: "4.9", label: "รีวิว", star: true },
  { value: "700K+", label: "ผู้ติดตาม" },
  { value: "73", label: "หลักสูตร" },
];

export default async function AboutUsPage() {
  const [instructors, config, stats] = await Promise.all([
    getInstructors(),
    getAboutConfig(),
  ]);

  const description =
    config.description ||
    "เราคือผู้นำด้านการอบรมเทคโนโลยีของไทย ส่งมอบความรู้ทั้งภาคทฤษฎีและภาคปฏิบัติ " +
      "เพื่อให้ผู้เรียนสามารถนำไปใช้งานได้จริงในที่ทำงาน";

  return (
    <div className="bg-[#F8FAFD] dark:bg-[#0D1B2A]">
      {/* ── 1. Hero ─────────────────────────────────────────────── */}
      <section className="relative flex min-h-[300px] items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/assets/asset1.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-30"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#48b0ff]/70 to-[#2486FF]/70" />
        <div className="relative z-10 px-4 text-center flex flex-col gap-7">
          <div>
            <h1 className="text-4xl font-bold text-white md:text-5xl">
              เกี่ยวกับ 9Expert
            </h1>
            <p className="mt-3 text-lg text-white/85">{config.tagline}</p>
          </div>
          {/* <InstructorGrid instructors={instructors} /> */}
        </div>
      </section>

      {/* ── 2. Instructors ──────────────────────────────────────── */}
      {/* <section className="bg-white py-12 dark:bg-[#111d2c] md:py-16">
        <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
          <div className="mb-10 text-center">
            <span className="inline-flex h-1 w-12 rounded-full bg-[#005CFF]" />
            <h2 className="mt-3 text-2xl font-bold text-[#0D1B2A] dark:text-white md:text-3xl">
              ทีมวิทยากร
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-[#465469] dark:text-[#C5CEDA] md:text-base">
              ผู้เชี่ยวชาญที่มีประสบการณ์จริงในอุตสาหกรรม
              พร้อมส่งต่อความรู้และเทคนิคให้กับผู้เรียน
            </p>
          </div>
          <InstructorGrid instructors={instructors} />
        </div>
      </section> */}

      {/* ── 4. เกี่ยวกับ 9Expert Training ────────────────────────── */}
      <section className="bg-white py-12 dark:bg-[#111d2c] md:py-16">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-4 lg:grid-cols-2 lg:gap-14 lg:px-6">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-lg">
            <Image
              src="/assets/asset2.jpg"
              alt="9Expert Training"
              fill
              sizes="(min-width: 1024px) 600px, 100vw"
              className="object-cover"
            />
          </div>

          <div>
            <span className="inline-flex h-1 w-12 rounded-full bg-[#005CFF]" />
            <h2 className="mt-3 text-2xl font-bold text-[#0D1B2A] dark:text-white md:text-3xl">
              9Expert Training คือ
            </h2>
            <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-[#465469] dark:text-[#C5CEDA]">
              {description}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#edf7ff] py-12 md:py-10 dark:bg-[#152e45]">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid grid-cols-2 text-center md:grid-cols-5">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={cn(
                  "flex flex-col items-center gap-1 border-9e-sky dark:border-[#1e3a5f]",
                  i < STATS.length - 1 && "md:border-r-4",
                )}
              >
                <div className="flex items-center gap-1">
                  {s.star && (
                    <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  )}
                  <span className="text-2xl font-extrabold text-9e-navy dark:text-white">
                    {s.value}
                  </span>
                </div>
                <span className="text-sm text-9e-slate dark:text-[#94a3b8]">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. ทำไมต้องเลือก 9Expert ─────────────────────────────── */}
      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
          <div className="mb-10 text-center">
            <span className="inline-flex h-1 w-12 rounded-full bg-[#005CFF]" />
            <h2 className="mt-3 text-2xl font-bold text-[#0D1B2A] dark:text-white md:text-3xl">
              ทำไมต้องเลือก 9Expert
            </h2>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURE_HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-[var(--surface-border)] flex flex-col items-center bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-[#111d2c]"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#005CFF]/10 text-[#005CFF] dark:bg-[#48B0FF]/15 dark:text-[#48B0FF]">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <h3 className="text-base font-bold text-[#0D1B2A] dark:text-white">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#465469] dark:text-[#C5CEDA]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-12 dark:bg-[#111d2c] md:py-16">
        <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
          <div className="mb-10 text-center">
            <span className="inline-flex h-1 w-12 rounded-full bg-[#005CFF]" />
            <h2 className="mt-3 text-2xl font-bold text-[#0D1B2A] dark:text-white md:text-3xl">
              ทีมวิทยากร
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-[#465469] dark:text-[#C5CEDA] md:text-base">
              ผู้เชี่ยวชาญที่มีประสบการณ์จริงในอุตสาหกรรม
              พร้อมส่งต่อความรู้และเทคนิคให้กับผู้เรียน
            </p>
          </div>
          <InstructorGrid instructors={instructors} />
        </div>
      </section>

      {/* ── 5. ร่วมงานกับเรา CTA ────────────────────────────────── */}
      <section className="relative overflow-hidden py-20">
        <div className="absolute inset-0">
          <Image
            src="/assets/asset3.jpg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-25"
          />
        </div>
        <div className="absolute inset-0 bg-[#164a8a]/60" />
        <div className="relative z-10 mx-auto max-w-[900px] px-4 text-center">
          <h2 className="text-3xl font-bold text-white">ร่วมงานกับเรา</h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-white/75">
            เลือกหลักสูตรที่ตอบโจทย์การทำงานของคุณ
            หรือปรึกษาทีมงานเพื่อจัดอบรมเฉพาะองค์กร
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/training-course"
              className="inline-flex w-full items-center justify-center rounded-full bg-[#005CFF] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#2486FF] sm:w-auto"
            >
              ดูหลักสูตรทั้งหมด
            </Link>
            <Link
              href="/contact-us"
              className="inline-flex w-full items-center justify-center rounded-full border border-[#D4F73F] px-8 py-3 text-sm font-semibold text-[#D4F73F] transition hover:bg-[#D4F73F]/10 sm:w-auto"
            >
              ติดต่อเรา
            </Link>
          </div>
        </div>
      </section>

      {/* ── 6. Motto / Founder quote ───────────────────────────── */}
      {/* <InstructorQuote /> */}
    </div>
  );
}
