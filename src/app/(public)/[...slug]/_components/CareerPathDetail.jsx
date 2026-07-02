import Link from 'next/link';
import { Check, ArrowRight, Clock, FileText } from 'lucide-react';
import { FaqAccordionSection } from '@/components/faq/FaqAccordionSection';

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
              ? 'grid items-center gap-8 lg:grid-cols-[1fr_360px]'
              : 'max-w-2xl'
          }
        >
          <div>
            <Breadcrumb title={careerPath.title} />
            <h1 className="mt-3 text-4xl font-bold leading-tight text-white md:text-5xl">
              {careerPath.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-white/80">
              {careerPath.tagline ||
                careerPath.short_description ||
                careerPath.intro?.slice(0, 200) ||
                ''}
            </p>
          </div>
          {hasHero && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={careerPath.hero_image_url}
              alt={careerPath.hero_image_alt || careerPath.title}
              className="mx-auto h-auto w-full max-w-sm rounded-2xl object-cover shadow-lg"
              loading="eager"
            />
          )}
        </div>
      </div>
    </section>
  );
}

function BulletList({ items, accent = 'text-[#005CFF]' }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((it, idx) => (
        <li key={idx} className="flex items-start gap-2 text-gray-700">
          <Check
            className={`mt-1 h-4 w-4 shrink-0 ${accent}`}
            aria-hidden="true"
          />
          <span className="text-sm leading-relaxed">{it}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionHeader({ children }) {
  return (
    <h2 className="border-l-4 border-[#005CFF] pl-3 text-2xl font-bold text-[#0D1B2A]">
      {children}
    </h2>
  );
}

function AboutSection({ careerPath }) {
  const hasIntro = Boolean(careerPath.intro?.trim());
  const hasHtml  = Boolean(careerPath.description_html?.trim());
  if (!hasIntro && !hasHtml) return null;
  return (
    <section className="space-y-4">
      <SectionHeader>เกี่ยวกับเส้นทางอาชีพนี้</SectionHeader>
      {hasIntro && (
        <p className="whitespace-pre-line text-base leading-relaxed text-gray-700">
          {careerPath.intro}
        </p>
      )}
      {hasHtml && (
        <div
          className="prose prose-lg max-w-none text-gray-700"
          dangerouslySetInnerHTML={{ __html: careerPath.description_html }}
        />
      )}
    </section>
  );
}

function HighlightsGrid({ careerPath }) {
  const blocks = [
    {
      title: 'วัตถุประสงค์',
      items: careerPath.objectives,
    },
    {
      title: 'เหมาะสำหรับ',
      items: careerPath.suitable_for,
    },
    {
      title: 'พื้นฐานที่ควรมี',
      items: careerPath.prerequisites,
    },
    {
      title: 'สิ่งที่คุณจะได้รับ',
      items: careerPath.benefits,
    },
  ].filter((b) => Array.isArray(b.items) && b.items.length > 0);

  if (blocks.length === 0) return null;

  return (
    <section className="grid gap-6 md:grid-cols-2">
      {blocks.map((b) => (
        <div
          key={b.title}
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h3 className="mb-3 text-lg font-bold text-[#0D1B2A]">{b.title}</h3>
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
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
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
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-[#0D1B2A]">{externalName || 'หลักสูตรเพิ่มเติม'}</h3>
        {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#2486FF] hover:underline"
          >
            ดูรายละเอียด <ArrowRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      {snap.imageUrl && (
        <a href={snap.publicUrl || '#'} className="block aspect-video overflow-hidden bg-[#F8FAFD]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snap.imageUrl}
            alt={snap.name || ''}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </a>
      )}
      <div className="flex flex-1 flex-col p-4">
        {snap.code && (
          <p className="text-xs font-mono text-[#2486FF]">{snap.code}</p>
        )}
        <h3 className="mt-1 line-clamp-2 text-base font-bold text-[#0D1B2A]">
          {snap.publicUrl ? (
            <a href={snap.publicUrl} className="hover:text-[#005CFF]">
              {snap.name}
            </a>
          ) : (
            snap.name
          )}
        </h3>
        {snap.teaser && (
          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-500">
            {snap.teaser}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {snap.days ? `${snap.days} วัน` : '—'}
            {snap.hours ? ` (${snap.hours} ชม.)` : ''}
          </span>
          <span className="text-sm font-bold text-[#0D1B2A]">
            {!snap.price || Number(snap.price) === 0
              ? 'Call .-'
              : `${Number(snap.price).toLocaleString('th-TH')} .-`}
          </span>
        </div>
        {note && <p className="mt-2 text-[11px] italic text-gray-400">{note}</p>}
      </div>
    </article>
  );
}

function CurriculumSection({ careerPath }) {
  const groups = Array.isArray(careerPath.curriculum) ? careerPath.curriculum : [];
  const hasContent = groups.some(
    (g) => Array.isArray(g?.items) && g.items.length > 0
  );
  if (!hasContent) return null;

  return (
    <section className="space-y-8">
      <SectionHeader>หลักสูตรที่แนะนำ</SectionHeader>
      {groups.map((group, gi) => {
        const items = Array.isArray(group?.items) ? group.items : [];
        if (items.length === 0) return null;
        return (
          <div key={gi} className="space-y-4">
            <div className="flex items-baseline gap-3">
              <h3 className="text-xl font-bold text-[#0D1B2A]">
                {group.title || 'หลักสูตร'}
              </h3>
              {group.description && (
                <p className="text-sm text-gray-500">{group.description}</p>
              )}
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

function PriceSummary({ careerPath }) {
  const price = careerPath.price;
  const outline = careerPath.links?.outlineUrl;
  const signup  = careerPath.links?.signupUrl;

  // api_slug is like "prompt-engineer-career-path" → strip the suffix
  // to land on the local register route /career-path-register/<slug>.
  const registerSlug = careerPath.api_slug
    ? careerPath.api_slug.replace(/-career-path$/, '')
    : '';
  const localRegisterUrl = careerPath.registrationOpen && registerSlug
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
    <aside className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      {hasPrice && (
        <>
          <p className="text-sm text-gray-500">ราคาทั้งหมด (ก่อน VAT)</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#0D1B2A]">
              {Number(price.salePrice ?? price.fullPrice).toLocaleString('th-TH')}
            </span>
            <span className="text-sm text-gray-500">บาท</span>
          </div>
          {price.salePrice != null && price.fullPrice != null && price.salePrice < price.fullPrice && (
            <p className="mt-1 text-sm text-gray-400">
              <span className="line-through">
                {Number(price.fullPrice).toLocaleString('th-TH')}
              </span>{' '}
              <span className="font-semibold text-red-500">
                ลด {price.discountPct ?? 0}%
              </span>
            </p>
          )}
        </>
      )}
      <div className="mt-5 flex flex-col gap-2">
        {signupHref && (
          localRegisterUrl ? (
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
          )
        )}
        {outline && (
          <a
            href={outline}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-9e-md border border-[#005CFF] px-4 py-2.5 text-sm font-bold text-[#005CFF] hover:bg-[#F8FAFD]"
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
          href="/training-course"
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
    <article className="bg-white">
      <Hero careerPath={careerPath} />

      <div className="mx-auto max-w-6xl px-4 py-12">
        <div
          className={
            hasPriceOrLinks
              ? 'grid gap-10 lg:grid-cols-[1fr_340px]'
              : ''
          }
        >
          <div className="min-w-0 space-y-12">
            <AboutSection careerPath={careerPath} />
            <HighlightsGrid careerPath={careerPath} />
            <RoadmapSection careerPath={careerPath} />
            <CurriculumSection careerPath={careerPath} />
            <FaqAccordionSection
              faqs={faqs}
              id="faq"
              className="scroll-mt-24"
              headingClassName="mb-6 border-l-4 border-[#005CFF] pl-3 text-2xl font-bold text-[#0D1B2A]"
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