import { notFound } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { getMasterclassBySlug, getInstructorsByIds } from '@/lib/masterclass/getMasterclass';
import { getLocalFaqsForCourse } from '@/lib/local-faqs/getLocalFaqs';
import { generateMasterclassJsonLd } from '@/lib/masterclass/generateJsonLd';
import { OG_DEFAULT_IMAGE, resolveCourseOgImage, toAbsoluteUrl } from '@/lib/seo/ogImage';
import { MasterclassDetailClient } from './_components/MasterclassDetailClient';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. See /articles/[slug] for why the catch-all's boundary
// cannot be used on an ISR route.
import { recordStaticNotFound } from '@/lib/redirects/recordStaticNotFound';

// ISR, not force-dynamic — and the declaration below is what makes the
// revalidate real: a [param] segment with no generateStaticParams is left out
// of prerender-manifest's dynamicRoutes and rendered per request whatever it
// exports (see /articles/[slug] for the measurement). Empty on purpose: each
// slug renders on its first request and is cached for the hour. Batch state
// (open/full, seats) is refreshed by the registration and payment actions
// through revalidateMasterclassPublic; content edits through
// lib/actions/masterclass.js. `/masterclass/[slug]/register` is its own route
// and stays force-dynamic (it reads searchParams).
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

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
  if (!course) {
    recordStaticNotFound(`/masterclass/${slug}`);
    notFound();
  }
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
