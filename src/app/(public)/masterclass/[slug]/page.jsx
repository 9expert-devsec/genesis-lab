import { notFound } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { getMasterclassBySlug, getInstructorsByIds } from '@/lib/masterclass/getMasterclass';
import { getLocalFaqsForCourse } from '@/lib/local-faqs/getLocalFaqs';
import { generateMasterclassJsonLd } from '@/lib/masterclass/generateJsonLd';
import { OG_DEFAULT_IMAGE, resolveCourseOgImage, toAbsoluteUrl } from '@/lib/seo/ogImage';
import { MasterclassDetailClient } from './_components/MasterclassDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const course = await getMasterclassBySlug(slug);

  // Absolute default (used for the not-found share so it isn't imageless).
  const defaultImage = toAbsoluteUrl(OG_DEFAULT_IMAGE.url, siteConfig.url);

  if (!course) {
    const title = 'Masterclass — 9Expert Training';
    return {
      title,
      openGraph: {
        title,
        url: `${siteConfig.url}/masterclass`,
        images: [{ url: defaultImage, width: OG_DEFAULT_IMAGE.width, height: OG_DEFAULT_IMAGE.height, alt: OG_DEFAULT_IMAGE.alt }],
      },
      twitter: { card: 'summary_large_image', title, images: [defaultImage] },
    };
  }

  const title = `${course.title_th} | Masterclass — 9Expert Training`;
  const description = course.subtitle_th || '';
  const canonicalUrl = `${siteConfig.url}/masterclass/${slug}`;
  const imageUrl = resolveCourseOgImage(course, siteConfig.url);

  // Only claim 1200×630 dims when we actually fell back to the default
  // card. Course covers are authored for the site's own layout at unknown
  // dimensions — asserting a size we don't have would mislay the card.
  const image =
    imageUrl === defaultImage
      ? { url: imageUrl, width: OG_DEFAULT_IMAGE.width, height: OG_DEFAULT_IMAGE.height, alt: OG_DEFAULT_IMAGE.alt }
      : { url: imageUrl, alt: course.title_th };

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    // 'article' (not 'website'): a course detail page is a discrete piece
    // of content, not the site hub — matching the sibling articles route.
    openGraph: {
      type: 'article',
      url: canonicalUrl,
      siteName: siteConfig.name,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function MasterclassDetailPage({ params }) {
  const { slug } = await params;
  const course = await getMasterclassBySlug(slug);
  if (!course) notFound();
  const [faqs, instructors] = await Promise.all([
    getLocalFaqsForCourse('masterclass', String(course._id)),
    getInstructorsByIds(course.instructor_ids ?? []),
  ]);

  const jsonLd = generateMasterclassJsonLd(course, instructors, faqs);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MasterclassDetailClient course={course} faqs={faqs} instructors={instructors} />
    </>
  );
}
