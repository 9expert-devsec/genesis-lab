import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { PolicyBreadcrumb } from '@/components/policies/PolicyBreadcrumb';
import { getArticles } from '@/lib/actions/articles';
import { buildInstructorCards } from '@/lib/about/instructorCards';
import { getOnlineCourses } from '@/lib/api/online-courses';
import { listPrograms } from '@/lib/api/programs';
import { listSkills } from '@/lib/api/skills';
import { buildProgramNames, buildSkillNames } from '@/lib/articleTaxonomy';
import { PUBLIC_ARTICLE_FILTER, WRITER_ARTICLE_CARD_FIELDS } from '@/lib/articleListFields';
import { truncateForMeta } from '@/lib/seo/metaDescription';
import { OG_DEFAULT_IMAGE } from '@/lib/seo/ogImage';
import {
  WRITER_LIST_NAME,
  buildWriterBreadcrumbJsonLd,
  buildWriterProfileJsonLd,
  serializeJsonLd,
  writerProfileUrl,
} from '@/lib/writers/writerJsonLd';
import {
  WRITER_ARTICLES_PER_PAGE,
  isProfilePageInRange,
  parseProfilePage,
  selectOnlineCourses,
  writerProfileLayout,
  writerRolePills,
  writerRouteAction,
  writerShortName,
} from '@/lib/writers/writerProfile';
import { readProfileInstructor, readWriterBySlug, withCardWriters } from '@/lib/writers/writerReads';
import { DEFAULT_WRITER_PATH, WRITER_LIST_PATH, writerImageUrl, writerPath } from '@/lib/writers/writerUrls';
import { WRITER_HERO_BAND, WriterPager, WriterPhoto, WriterSocialLinks } from '../_components/WriterParts';
import { WriterProfileBody } from '../_components/WriterProfileBody';

/**
 * RENDERED PER REQUEST, unlike the article page's hourly ISR. `?page=` has to be
 * read here so an out-of-range page can answer 404, and reading `searchParams`
 * makes a route dynamic with or without `revalidate`, which would then sit here
 * doing nothing. /articles is dynamic for the same reason. The upstream reads
 * below still go through their one-hour Data Cache.
 */
export const dynamic = 'force-dynamic';

const META_DESCRIPTION_LENGTH = 155;

// generateMetadata and the page need the same row in one request.
const loadWriter = cache((slug) => readWriterBySlug(slug));

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const writer = await loadWriter(slug);
  if (writerRouteAction(writer) !== 'render') return { title: 'ไม่พบผู้เขียน' };

  // The root layout's template appends the brand.
  const title = writer.displayName;
  const description = truncateForMeta(writer.bio || writer.role, META_DESCRIPTION_LENGTH);
  const url = writerProfileUrl(writer);
  const avatar = writerImageUrl(writer);
  const image = avatar ? { url: avatar, width: 256, height: 256 } : OG_DEFAULT_IMAGE;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.name,
      locale: 'th_TH',
      type: 'profile',
      images: [image],
    },
    twitter: { card: 'summary', title, description, images: [image.url] },
  };
}

/**
 * Each read is optional: a missing aside card beats a failed profile.
 *
 * The online-course list is read when the admin picked courses OR an instructor
 * is linked: picks need no instructor, the name-match fallback does.
 */
async function loadAside(writer) {
  const instructor = await readProfileInstructor(writer.instructorId).catch(() => null);
  const wantsCourses = Boolean(instructor) || writer.featuredOnlineCourseIds.length > 0;

  const [cards, online] = await Promise.all([
    instructor ? buildInstructorCards([instructor]).catch(() => []) : [],
    wantsCourses ? getOnlineCourses().catch(() => ({ items: [] })) : { items: [] },
  ]);
  return {
    instructor,
    programs: cards[0]?.programs ?? [],
    onlineCourses: selectOnlineCourses(online.items, writer.featuredOnlineCourseIds, instructor?.name_en),
  };
}

export default async function WriterProfilePage({ params, searchParams }) {
  const { slug } = await params;
  const writer = await loadWriter(slug);

  const action = writerRouteAction(writer);
  if (action === 'not-found') notFound();
  if (action === 'redirect') permanentRedirect(DEFAULT_WRITER_PATH);

  const page = parseProfilePage((await searchParams)?.page);
  if (page === null) notFound();

  const [articlesRes, aside, programsRes, skillsRes] = await Promise.all([
    getArticles({
      ...PUBLIC_ARTICLE_FILTER,
      writer: writer._id,
      page,
      limit: WRITER_ARTICLES_PER_PAGE,
      select: WRITER_ARTICLE_CARD_FIELDS,
    }),
    loadAside(writer),
    listPrograms().catch(() => ({ items: [] })),
    listSkills().catch(() => ({ items: [] })),
  ]);

  const { items, total } = articlesRes;
  if (!isProfilePageInRange(page, total)) notFound();

  const articles = await withCardWriters(items);
  const programNames = buildProgramNames(programsRes.items);
  const skillNames = buildSkillNames(skillsRes.items);
  const totalPages = Math.ceil(total / WRITER_ARTICLES_PER_PAGE);

  const shortName = writerShortName(writer);
  const pills = writerRolePills(writer, Boolean(aside.instructor));
  const layout = writerProfileLayout({
    sections: writer.sections,
    programs: aside.programs,
    onlineCourses: aside.onlineCourses,
    videos: writer.youtubeVideos,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildWriterProfileJsonLd(writer)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildWriterBreadcrumbJsonLd(writer)) }}
      />

      <section className={WRITER_HERO_BAND} data-testid="writer-hero">
        <div className="mx-auto max-w-[1200px] px-4 py-8 lg:px-6 lg:py-10">
          <PolicyBreadcrumb
            items={[
              { label: 'หน้าแรก', href: '/' },
              { label: WRITER_LIST_NAME, href: WRITER_LIST_PATH },
              { label: writer.displayName },
            ]}
          />
          <div className="mt-8 flex flex-col items-center gap-6 text-center md:mt-10 md:flex-row md:items-start md:gap-10 md:text-left">
            <WriterPhoto
              writer={writer}
              alt={writer.displayName}
              className="h-[140px] w-[140px] shrink-0 shadow-9e-lg ring-[6px] ring-white md:h-[220px] md:w-[220px] dark:ring-[#111d2c]"
            />
            <div className="min-w-0 flex-1">
              <ul className="flex flex-wrap justify-center gap-2 md:justify-start">
                {pills.map((pill) => (
                  <li key={pill} className="rounded-full bg-9e-action/10 px-3 py-1 text-xs font-semibold text-9e-action dark:text-9e-air">
                    {pill}
                  </li>
                ))}
              </ul>
              <h1 className="mt-3 text-3xl font-bold text-9e-navy lg:text-4xl dark:text-white">{writer.displayName}</h1>
              {writer.role && <p className="mt-2 font-medium text-9e-action dark:text-9e-air">{writer.role}</p>}
              {writer.bio && (
                <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
                  {writer.bio}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-4 md:justify-start">
                <WriterSocialLinks links={writer.socialLinks} />
                <span className="text-sm font-medium text-9e-navy dark:text-white">{total} บทความ</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <WriterProfileBody
        layout={layout}
        programs={aside.programs}
        onlineCourses={aside.onlineCourses}
        videos={writer.youtubeVideos}
        channelUrl={writer.youtubeChannelUrl}
        shortName={shortName}
      />

      {total > 0 && (
        <section className="mx-auto max-w-[1200px] px-4 py-10 lg:px-6" data-testid="writer-articles">
          <div className="mb-6 flex items-center gap-3">
            <h2 className="text-lg font-bold text-9e-navy dark:text-white">บทความโดย {shortName}</h2>
            <span className="rounded-full bg-9e-air/20 px-2 py-0.5 text-xs font-bold text-9e-action dark:bg-[#111d2c] dark:text-9e-air">
              {total}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <ArticleCard key={article._id} article={article} programNames={programNames} skillNames={skillNames} />
            ))}
          </div>
          <WriterPager path={writerPath(writer.slug)} page={page} totalPages={totalPages} />
        </section>
      )}
    </>
  );
}
