import Link from "next/link";
import { Check, ArrowRight, Clock, FileText } from "lucide-react";
import { FaqAccordionSection } from "@/components/faq/FaqAccordionSection";
import { coursePriceLabel } from "@/lib/coursePriceLabel";
import { sanitizeRichHtml } from "@/lib/sanitizeRichHtml";

function Breadcrumb({ title }) {
  return (
    <nav aria-label="breadcrumb" className="text-sm text-white/60">
      <Link href="/career-path-project" className="hover:text-white">
        เส้นทางอาชีพ
      </Link>
      <span className="mx-2">/</span>
      <span className="text-white/80">{title}</span>
    </nav>
  );
}

function Hero({ careerPath }) {
  const hasHero = Boolean(careerPath.hero_image_url);
  return (
    <section className="bg-gradient-to-br from-[#0D1B2A] to-[#005CFF]">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div
          className={
            hasHero
              ? "grid items-center gap-8 lg:grid-cols-[1fr_360px]"
              : "max-w-2xl"
          }
        >
          <div>
            <Breadcrumb title={careerPath.title} />
            <h1 className="mt-3 text-4xl font-bold leading-tight text-white md:text-5xl">
              {careerPath.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-white/80">
              {careerPath.tagline ||
                careerPath.short_description ||
                careerPath.intro?.slice(0, 200) ||
                ""}
            </p>
          </div>
          {hasHero && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={careerPath.hero_image_url}
              alt={careerPath.hero_image_alt || careerPath.title}
              className="mx-auto h-auto w-full max-w-sm rounded-2xl object-cover shadow-9e-lg"
              loading="eager"
            />
          )}
        </div>
      </div>
    </section>
  );
}

function BulletList({ items, accent = "text-[#005CFF] dark:text-9e-air" }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((it, idx) => (
        <li key={idx} className="flex items-start gap-2 text-[var(--text-secondary)]">
          <Check
            className={`mt-1 h-4 w-4 shrink-0 ${accent}`}
            aria-hidden="true"
          />
          <span className="text-base leading-relaxed">{it}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionHeader({ children }) {
  return (
    <h2 className="border-l-4 border-[#005CFF] pl-3 text-2xl font-bold text-[var(--text-primary)]">
      {children}
    </h2>
  );
}

function AboutSection({ careerPath }) {
  const hasIntro = Boolean(careerPath.intro?.trim());
  const hasHtml = Boolean(careerPath.description_html?.trim());
  if (!hasIntro && !hasHtml) return null;
  return (
    <section className="space-y-4">
      <SectionHeader>เกี่ยวกับเส้นทางอาชีพนี้</SectionHeader>
      {hasIntro && (
        <p className="whitespace-pre-line text-base leading-relaxed text-[var(--text-secondary)]">
          {careerPath.intro}
        </p>
      )}
      {hasHtml && (
        <div
          className="prose prose-lg max-w-none text-[var(--text-secondary)] dark:prose-invert"
          // Admin-writable via a bare <textarea>, no editor at all (see
          // docs/audit/unsanitized-html-render-sites.md's CareerPathForm
          // callout) and dual-written to MSDB + Mongo — sanitised again
          // here since the store is not a trust boundary.
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(careerPath.description_html) }}
        />
      )}
    </section>
  );
}

function HighlightsGrid({ careerPath }) {
  const blocks = [
    {
      title: "วัตถุประสงค์",
      items: careerPath.objectives,
    },
    {
      title: "เหมาะสำหรับ",
      items: careerPath.suitable_for,
    },
    {
      title: "ความรู้พื้นฐานสำหรับการอบรม",
      items: careerPath.prerequisites,
    },
    {
      title: "ประโยชน์ที่ได้รับ",
      items: careerPath.benefits,
    },
  ].filter((b) => Array.isArray(b.items) && b.items.length > 0);

  if (blocks.length === 0) return null;

  return (
    <section className="grid gap-6 md:grid-cols-2">
      {blocks.map((b) => (
        <div
          key={b.title}
          className="rounded-2xl border border-[var(--surface-divider)] bg-[var(--surface-raised)] p-6 shadow-9e-sm"
        >
          <h3 className="mb-3 text-lg font-bold text-[var(--text-primary)]">{b.title}</h3>
          <BulletList items={b.items} />
        </div>
      ))}
    </section>
  );
}

function RoadmapSection({ careerPath }) {
  if (!careerPath.roadmap_image_url) return null;
  return (
    <section className="space-y-4">
      <SectionHeader>เส้นทางการพัฒนาทักษะ</SectionHeader>
      <div className="overflow-hidden rounded-2xl border border-[var(--surface-divider)] bg-[var(--surface-raised)] shadow-9e-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={careerPath.roadmap_image_url}
          alt={careerPath.roadmap_image_alt || `${careerPath.title} roadmap`}
          className="h-auto w-full"
          loading="lazy"
        />
      </div>
    </section>
  );
}

function CourseSnapCard({ snap, externalName, externalUrl, note }) {
  // Curriculum items can be external (just a name/url) or linked to a
  // public/online course with a `snap` payload. Handle both.
  if (!snap) {
    if (!externalName && !externalUrl) return null;
    return (
      <div className="rounded-2xl border border-[var(--surface-divider)] bg-[var(--surface-raised)] p-5 shadow-9e-sm">
        <h3 className="font-bold text-[var(--text-primary)]">
          {externalName || "หลักสูตรเพิ่มเติม"}
        </h3>
        {note && <p className="mt-1 text-xs text-[var(--text-secondary)]">{note}</p>}
        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#2486FF] hover:underline dark:text-9e-air"
          >
            ดูรายละเอียด <ArrowRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-[var(--surface-divider)] bg-[var(--surface-raised)] shadow-9e-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-9e-md">
      {snap.imageUrl && (
        <a
          href={snap.publicUrl || "#"}
          className="block aspect-video overflow-hidden bg-[var(--surface-muted)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snap.imageUrl}
            alt={snap.name || ""}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </a>
      )}
      <div className="flex flex-1 flex-col p-4">
        {snap.code && (
          <p className="text-xs font-mono text-[#2486FF] dark:text-9e-air">{snap.code}</p>
        )}
        <h3 className="mt-1 line-clamp-2 text-base font-bold text-[var(--text-primary)]">
          {snap.publicUrl ? (
            <a href={snap.publicUrl} className="hover:text-[#005CFF] dark:hover:text-9e-air">
              {snap.name}
            </a>
          ) : (
            snap.name
          )}
        </h3>
        {snap.teaser && (
          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            {snap.teaser}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3 text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {snap.days ? `${snap.days} วัน` : "—"}
            {snap.hours ? ` (${snap.hours} ชม.)` : ""}
          </span>
          {/* This row is `justify-between` WITHOUT flex-wrap, so it cannot
              relieve pressure by wrapping the way the catalog card's does. The
              price keeps `whitespace-nowrap` and the duration beside it is the
              flexible half — losing a character off "(6 ชม.)" is recoverable,
              a label broken across two lines is not. */}
          <span className="whitespace-nowrap text-sm font-bold text-[var(--text-primary)]">
            {coursePriceLabel(snap.price, { suffix: ".-" })}
          </span>
        </div>
        {note && (
          <p className="mt-2 text-[11px] italic text-[var(--text-secondary)]">{note}</p>
        )}
      </div>
    </article>
  );
}

function CurriculumSection({ careerPath }) {
  const groups = Array.isArray(careerPath.curriculum)
    ? careerPath.curriculum
    : [];
  const hasContent = groups.some(
    (g) => Array.isArray(g?.items) && g.items.length > 0,
  );
  if (!hasContent) return null;

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <SectionHeader>หลักสูตรที่ต้องอบรม</SectionHeader>

        {groups[0]?.description && (
          <p className="text-base text-[var(--text-secondary)]">{groups[0].description}</p>
        )}
      </div>
      {groups.map((group, gi) => {
        const items = Array.isArray(group?.items) ? group.items : [];
        if (items.length === 0) return null;
        return (
          <div key={gi} className="space-y-2">
            <div className="flex items-baseline gap-3">
              <h3 className="text-xl font-bold text-[var(--text-primary)]">
                {group.title || "หลักสูตร"}
              </h3>
              {/* {group.description && (
                <p className="text-sm text-gray-500">{group.description}</p>
              )} */}
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((it, ii) => (
                <CourseSnapCard
                  key={ii}
                  snap={it?.snap}
                  externalName={it?.externalName}
                  externalUrl={it?.externalUrl}
                  note={it?.note}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function CareerPathPromotionSection() {
  const discounts = [
    { people: "1 - 2 คน", discount: "ลด 15 %" },
    { people: "3 - 5 คน", discount: "ลด 20 %" },
    { people: "6 - 10 คน", discount: "ลด 25 %" },
    {
      people: "11 คนขึ้นไป",
      discount: "ลดสูงสุด",
      discountAmount: "30 %",
      highlighted: true,
    },
  ];

  const benefits = [
    {
      title: "Certificate",
      description:
        "ใบประกาศนียบัตรสำหรับทุกหลักสูตรที่อยู่ในโปรแกรม Career Path ที่ท่านลงเรียน",
    },
    {
      title: "Digital Badge Certificate",
      description:
        "ตรารับรองทักษะและความสามารถของผู้เรียนในโปรแกรม Career Path",
      note: "*ได้รับเมื่อผ่าน Workshop Project ตามเกณฑ์แต่ละ Career Path",
    },
    {
      title: "Cheat Sheet",
      description: "สำหรับใช้เป็นแนวทางในการทำโปรเจกต์และทบทวนความรู้",
    },
  ];

  const promotionConditions = [
    "ราคาก่อนภาษีมูลค่าเพิ่ม",
    "ระยะเวลาโปรโมชั่น 1 ม.ค. 69 - 31 ธ.ค. 69",
    "ต้องชำระค่าใช้จ่ายในการสมัครให้เรียบร้อยภายใน 30 วัน (นับจากวันที่ออกใบเสนอราคา)",
    "สำหรับหลักสูตร Career Path จะไม่สามารถซื้อรวมแพ็กเกจกับ Career Path อื่นได้",
    "โปรโมชั่นดังกล่าว เฉพาะในรอบอบรมที่กำหนดและเลือกรอบอบรมแต่ละหลักสูตรได้ไม่เกิน 6 เดือนนับจากวันที่สมัคร",
    "สงวนสิทธิ์การเรียนซ้ำ เลื่อนรอบอบรม หรือยกเลิก ในทุกกรณี",
    "หากผู้เข้าอบรมไม่สามารถเข้าร่วมในวันอบรมที่กำหนด จะถือว่าสละสิทธิ์ และทางสถาบันขอสงวนสิทธิ์ไม่คืนเงินในทุกกรณี",
    "การสมัคร 1 Career Path ต้องระบุรายชื่อ 1 ท่าน ไม่สามารถเปลี่ยนรายชื่อผู้เข้าอบรมได้ในทุกกรณี",
    "โปรโมชั่นข้างต้นไม่สามารถแยกเอกสารในการชำระเงินได้ในทุกกรณี (ใบเสนอราคา, ใบแจ้งหนี้, ใบเสร็จรับเงิน, ใบกำกับภาษี)",
  ];

  const notes = [
    "สิทธิ์นี้ไม่สามารถแลกเป็นเงินสด",
    "สงวนสิทธิ์ในการเปลี่ยนแปลงวันที่การอบรม",
    "สงวนสิทธิ์สำหรับผู้ที่ชำระเงินภายในระยะเวลาที่กำหนดเท่านั้น",
    "หากมีการเปลี่ยนแปลงสิทธิพิเศษเป็นแบบอื่น ทางสถาบันฯ ขอสงวนสิทธิ์ในการแจ้งให้ท่านทราบล่วงหน้า",
  ];

  return (
    <section
      aria-labelledby="career-path-promotion-heading"
      className="space-y-8"
    >
      <div className="rounded-2xl border border-9e-air bg-[var(--surface-raised)] px-5 py-7 md:px-8">
        <div
          id="career-path-promotion-heading"
          className="text-center text-xl font-bold text-[var(--text-primary)] font-thai"
        >
          <h2 className="text-[#FF4D4F]">โปรโมชันพิเศษ!</h2>{" "}
          รวมทีมแล้วมาสมัครเรียนกัน ลดแรงทุกระดับ
        </div>

        <div className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {discounts.map((item) => (
            <div
              key={item.people}
              className={`flex min-h-32 flex-col items-center justify-center rounded-xl border px-3 py-5 text-center ${
                item.highlighted
                  ? "border-9e-air bg-9e-air text-[#0D1B2A]"
                  : "border-[var(--surface-border)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-9e-sm"
              }`}
            >
              <p className="text-base font-bold">
                สมัคร
                <br />
                {item.people}
              </p>
              <p
                className={`mt-4 font-extrabold ${
                  item.highlighted ? "text-2xl text-white" : "text-xl"
                }`}
              >
                {item.discount}
                {item.discountAmount && (
                  <>
                    <br />
                    <span className="text-2xl">{item.discountAmount}</span>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-[var(--text-primary)] md:text-sm">
          *ส่วนลดสูงสุด 30% สำหรับผู้สมัครพร้อมกัน 11 ท่าน
          (ได้ทั้งนามบุคคลหรือองค์กร) ในแต่ละ Career Path
          ท่านสามารถสอบถามเพื่อรับสิทธิ์ราคาพิเศษได้กับเจ้าหน้าที่ฝ่ายขายทาง
          LINE{" "}
          <a
            href="https://line.me/R/ti/p/%409expert"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#005CFF] hover:underline dark:text-9e-air"
          >
            @9expert
          </a>
        </p>
      </div>

      <div className="space-y-5">
        <h3 className="text-center text-base font-bold text-[var(--text-primary)]">
          สำหรับการเรียนในโปรแกรม Career Path ท่านจะได้รับสิทธิพิเศษดังต่อไปนี้
        </h3>

        <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-3">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="rounded-xl bg-[var(--surface-muted)] px-5 py-5 text-center shadow-9e-sm"
            >
              <h4 className="min-h-10 text-base font-bold leading-5 text-[var(--text-primary)]">
                {benefit.title}
              </h4>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-primary)]">
                {benefit.description}
              </p>
              {benefit.note && (
                <p className="mt-3 text-xs leading-relaxed text-[#FF4D4F]">
                  {benefit.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 text-[var(--text-primary)]">
        <h3 className="text-lg font-bold">เงื่อนไขโปรโมชัน</h3>
        <ul className="list-disc space-y-1 pl-5 text-base leading-relaxed">
          {promotionConditions.map((condition) => (
            <li key={condition}>{condition}</li>
          ))}
        </ul>
      </div>

      <div className="mx-auto max-w-2xl rounded-2xl bg-[var(--surface-muted)] p-6 shadow-9e-sm md:px-8">
        <h3 className="text-lg font-bold text-[var(--text-primary)]">
          กรณีเป็นศิษย์เก่า 9Expert
        </h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-base leading-relaxed text-[var(--text-primary)]">
          <li>
            ผู้เรียนที่เคยเรียนบางคอร์สใน Career Path Program สามารถใช้{" "}
            <strong className="text-[#00AEEF]">สิทธิ์ Transfer Module</strong>{" "}
            เพื่อหักค่าใช้จ่ายในการลงทะเบียนได้
          </li>
          <li>
            ต้องลงทะเบียนเรียนคอร์สที่เหลือในโปรแกรมให้ครบเท่านั้น{" "}
            <strong>
              เพื่อรับใบประกาศนียบัตรพิเศษ (Certificate) สำหรับ Career Path
              Program
            </strong>{" "}
            เพิ่มอีก 1 ใบ
          </li>
          <li>
            <strong className="text-[#00AEEF]">ใช้สิทธิ์ได้ภายใน 10 ปี</strong>{" "}
            นับจากวันเรียนเดิมของคอร์สนั้น ๆ
          </li>
        </ul>
      </div>

      <div className="space-y-3 text-[var(--text-primary)]">
        <h3 className="text-lg font-bold">หมายเหตุ</h3>
        <ul className="list-disc space-y-1 pl-5 text-base leading-relaxed">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 text-base leading-relaxed text-[var(--text-primary)]">
        <p>
          หากมีคำถามหรือข้อสงสัยเพิ่มเติม ติดต่อเราได้ที่ LINE Official{" "}
          <a
            href="https://line.me/R/ti/p/%409expert"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#005CFF] hover:underline dark:text-9e-air"
          >
            @9expert
          </a>
        </p>
        <p>
          หรือสนใจดูรายละเอียดหลักสูตรอื่น ๆ เพิ่มเติม สามารถดูได้ที่นี่ :{" "}
          <Link
            href="/training-course"
            className="font-semibold text-[#005CFF] hover:underline dark:text-9e-air"
          >
            รายละเอียดหลักสูตร
          </Link>
        </p>
      </div>
    </section>
  );
}

function PriceSummary({ careerPath }) {
  const price = careerPath.price;
  const outline = careerPath.links?.outlineUrl;
  const signup = careerPath.links?.signupUrl;

  // api_slug is like "prompt-engineer-career-path" → strip the suffix
  // to land on the local register route /career-path-register/<slug>.
  const registerSlug = careerPath.api_slug
    ? careerPath.api_slug.replace(/-career-path$/, "")
    : "";
  const localRegisterUrl =
    careerPath.registrationOpen && registerSlug
      ? `/career-path-register/${registerSlug}`
      : null;

  // Prefer local registration when open; otherwise fall back to the
  // legacy MSDB external signup URL.
  const signupHref = localRegisterUrl ?? signup;

  // Panel previously hid itself when there was no price/link. Now it
  // also stays visible whenever registration is open, so the CTA
  // surfaces on price-less paths too.
  const hasPrice = price && (price.fullPrice || price.salePrice);
  if (!hasPrice && !careerPath.registrationOpen) return null;

  return (
    <aside className="rounded-2xl border border-[var(--surface-divider)] bg-[var(--surface-raised)] p-6 shadow-9e-sm">
      {hasPrice && (
        <>
          <p className="text-sm text-[var(--text-secondary)]">ราคาทั้งหมด (ก่อน VAT)</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[var(--text-primary)]">
              {Number(price.salePrice ?? price.fullPrice).toLocaleString(
                "th-TH",
              )}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">บาท</span>
          </div>
          {price.salePrice != null &&
            price.fullPrice != null &&
            price.salePrice < price.fullPrice && (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                <span className="line-through">
                  {Number(price.fullPrice).toLocaleString("th-TH")}
                </span>{" "}
                <span className="font-semibold text-red-500">
                  ลด {price.discountPct ?? 0}%
                </span>
              </p>
            )}
        </>
      )}
      <div className="mt-5 flex flex-col gap-2">
        {signupHref &&
          (localRegisterUrl ? (
            <Link
              href={localRegisterUrl}
              className="inline-flex items-center justify-center gap-2 rounded-9e-md bg-[#005CFF] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0046cc]"
            >
              ลงทะเบียน <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <a
              href={signupHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-9e-md bg-[#005CFF] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0046cc]"
            >
              ลงทะเบียน <ArrowRight className="h-4 w-4" />
            </a>
          ))}
        {outline && (
          <a
            href={outline}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-9e-md border border-[#005CFF] px-4 py-2.5 text-sm font-bold text-[#005CFF] hover:bg-[var(--surface-hover)] dark:border-9e-air dark:text-9e-air"
          >
            <FileText className="h-4 w-4" /> ดาวน์โหลด Course Outline
          </a>
        )}
      </div>
    </aside>
  );
}

function CTABanner() {
  return (
    <section className="bg-[#0D1B2A]">
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <h2 className="text-2xl font-bold text-white md:text-3xl">
          พร้อมเริ่มต้นเส้นทางอาชีพของคุณแล้วหรือยัง?
        </h2>
        <Link
          href="/career-path-project"
          className="mt-6 inline-flex items-center gap-2 rounded-9e-md bg-[#D4F73F] px-6 py-3 text-sm font-bold text-[#0D1B2A] hover:bg-[#c5e836]"
        >
          ดูหลักสูตรทั้งหมด <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

export function CareerPathDetail({ careerPath, faqs = [] }) {
  const hasPriceOrLinks =
    careerPath.price?.fullPrice ||
    careerPath.links?.signupUrl ||
    careerPath.links?.outlineUrl ||
    careerPath.registrationOpen;

  return (
    <article className="bg-[var(--page-bg)]">
      <Hero careerPath={careerPath} />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <div
          className={
            hasPriceOrLinks ? "grid gap-10 lg:grid-cols-[1fr_340px]" : ""
          }
        >
          <div className="min-w-0 space-y-12">
            <RoadmapSection careerPath={careerPath} />
            <AboutSection careerPath={careerPath} />
            <HighlightsGrid careerPath={careerPath} />
            <CurriculumSection careerPath={careerPath} />
            <CareerPathPromotionSection />
            <FaqAccordionSection
              faqs={faqs}
              id="faq"
              /* A LITERAL scroll-mt-24 ON PURPOSE — do not "fix" this to
                 SECTION_ANCHOR_CLASS. Four files on the COURSE branch of this
                 same catch-all route import that constant, so one holdout looks
                 like an oversight. It is not. That constant is
                 `scroll-mt-36 lg:scroll-mt-24`, and the extra 48px below lg
                 clears CourseSectionTabs — the course page's sticky mobile tab
                 strip. This page is a different page type and renders no such
                 strip, so importing the constant here would push every anchor
                 jump 48px past chrome that does not exist, leaving a gap above
                 each heading that reads as a broken anchor.
                 If a career-path page ever grows its own sticky strip, the
                 answer is a constant of ITS own height, not this one. */
              className="scroll-mt-24"
              headingClassName="mb-6 border-l-4 border-[#005CFF] pl-3 text-2xl font-bold text-[var(--text-primary)]"
            />
          </div>
          {hasPriceOrLinks && (
            <div className="lg:sticky lg:top-24 lg:self-start">
              <PriceSummary careerPath={careerPath} />
            </div>
          )}
        </div>
      </div>

      <CTABanner />
    </article>
  );
}
