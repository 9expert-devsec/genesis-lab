import { notFound } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { getMasterclassBySlug, getInstructorsByIds } from '@/lib/masterclass/getMasterclass';
import { getLocalFaqsForCourse } from '@/lib/local-faqs/getLocalFaqs';
import { generateMasterclassJsonLd } from '@/lib/masterclass/generateJsonLd';
import { masterclassCanonicalUrl } from '@/lib/masterclass/masterclassUrl';
import { MASTERCLASS_TITLE } from '@/lib/seo/masterclassListJsonLd';
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
    /**
     * THE NOT-FOUND SHARE CARD. Two values, because two consumers.
     *
     * ── THE BRAND USED TO APPEAR TWICE ──────────────────────────────────────
     * This was one string, 'Masterclass — 9Expert Training', used for
     * metadata.title AND for both share titles. The root layout's template is
     * "%s | ${siteConfig.name}", so the <title> it composes read
     * "Masterclass — 9Expert Training | 9Expert Training". The brand belongs to
     * the template; the segment is MASTERCLASS_TITLE, read from the module
     * /masterclass's own metadata.title reads, so the listing and the not-found
     * case are one value. Exactly the fix 65792c3b made next door.
     *
     * ── WHY og/twitter GET THE COMPOSED FORM AND NOT THE SEGMENT ────────────
     * No template applies to them. The root sets openGraph.title as a plain
     * string, so a page-level openGraph.title REPLACES it outright — handing it
     * the bare segment would ship a share card reading just "Masterclass", with
     * the brand nowhere on it. SHARE_TITLE is therefore the same string the
     * <title> resolves to, composed once, the way
     * lib/seo/masterclassListJsonLd composes CollectionPage.name.
     *
     * ── MEASURED, AND WHY THIS IS A SOURCE FIX AND NOT A RENDER FIX ─────────
     * curl'd against a production build, before and after: a missing slug
     * serves 404 with <title>9Expert Training — Knowledge Provider</title> —
     * the ROOT DEFAULT. Next discards a route's generateMetadata entirely when
     * the segment calls notFound(), and renders app/not-found.jsx under the
     * root layout's metadata instead, so NONE of this branch reaches the HTML
     * today; og:title and twitter:title are the root's too. The doubled brand
     * was latent, not shipped, and removing it does not change a byte of what
     * is served. It is fixed anyway: this branch is what a segment-level
     * not-found.jsx would read, and a wrong value parked in the one place a
     * future reader will copy from is worth more to remove than to keep.
     */
    const title = MASTERCLASS_TITLE;
    const shareTitle = `${MASTERCLASS_TITLE} | ${siteConfig.name}`;
    return {
      title,
      openGraph: {
        title: shareTitle,
        url: `${siteConfig.url}/masterclass`,
        images: [{ url: defaultImage, width: OG_DEFAULT_IMAGE.width, height: OG_DEFAULT_IMAGE.height, alt: OG_DEFAULT_IMAGE.alt }],
      },
      twitter: { card: 'summary_large_image', title: shareTitle, images: [defaultImage] },
    };
  }

  const title = `${course.title_th} | Masterclass — 9Expert Training`;
  const description = course.subtitle_th || '';
  /**
   * THE canonical, from the shared function — the same one
   * lib/masterclass/generateJsonLd builds the Course `@id` and `url` from, so the
   * tag and the graph are one value rather than two that happened to agree.
   *
   * It resolves to exactly what `${siteConfig.url}/masterclass/${slug}` produced
   * before, because SITE_URL *is* siteConfig.url — the production value is
   * unchanged. What changed is that the graph no longer names a different host.
   */
  const canonicalUrl = masterclassCanonicalUrl(slug);
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
