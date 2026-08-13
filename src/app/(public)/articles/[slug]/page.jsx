import { notFound } from 'next/navigation';
import {
  getArticleBySlug,
  getArticles,
  getArticlesByIds,
} from '@/lib/actions/articles';
import { listPublicCourses } from '@/lib/api/public-courses';
import { buildJsonLd } from '@/lib/articles/buildJsonLd';
import { toMetaDescription } from '@/lib/seo/metaDescription';
import { pickPinnedCourses } from '@/lib/articles/pinnedCourses';
import { normalizeAuthoredColors } from '@/lib/articles/normalizeAuthoredColors';
import { wrapArticleTables } from '@/lib/articles/wrapArticleTables';
import { ArticleDetailClient } from './_components/ArticleDetailClient';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { slug: rawSlug } = await params;
  // Thai slugs arrive URL-encoded from the router — decode before the
  // DB lookup. (`getArticleBySlug` defends against this too, but doing
  // it here keeps the value consistent for any downstream metadata use.)
  let slug = rawSlug;
  try { slug = decodeURIComponent(rawSlug); } catch { /* malformed → keep raw */ }
  const article = await getArticleBySlug(slug);
  if (!article) return { title: 'ไม่พบบทความ' };
  // Truncated at RENDER, not at storage. `seoDescription` is capped at 160 by
  // articleSchema, but the moment the value comes from the FALLBACK that cap
  // does not apply — `excerpt` is capped at 2000 and `title` at 200, so either
  // could put a paragraph in a <meta> tag. See lib/seo/metaDescription.js for
  // the boundary rule and what it does to Thai.
  const description = toMetaDescription(
    article.seoDescription,
    article.excerpt,
    article.title
  );
  const pageUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/articles/${slug}`;
  return {
    title:       article.seoTitle || article.title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title:       article.seoTitle || article.title,
      description,
      url: pageUrl,
      images: article.coverUrl ? [{ url: article.coverUrl }] : [],
      type: 'article',
    },
  };
}

/** Word-based reading time, ~200 wpm. */
function readingTimeMinutes(html) {
  const text = String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 1;
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

export default async function ArticleDetailPage({ params }) {
  const { slug: rawSlug } = await params;
  let slug = rawSlug;
  try { slug = decodeURIComponent(rawSlug); } catch { /* malformed → keep raw */ }

  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  // Related articles: prefer explicit relations the admin set on the
  // doc, fall back to "anything sharing a tag" so we always have
  // something to show.
  let related = [];
  try {
    if (article.relatedArticles?.length) {
      related = await getArticlesByIds(article.relatedArticles);
      related = related.filter((a) => a.slug !== article.slug);
    }
    if (related.length === 0 && article.tags?.[0]) {
      const { items } = await getArticles({
        active: true,
        limit: 6,
        tag: article.tags[0],
      });
      related = items.filter((a) => a.slug !== article.slug).slice(0, 3);
    }
  } catch {
    related = [];
  }

  // Related courses → fetch the public-course catalogue once and
  // resolve the course_ids the admin pinned on the article. One
  // round-trip beats N-by-id lookups when the list is small (it is).
  //
  // Through `pickPinnedCourses`, not a `.filter` over the catalogue: filtering
  // walks the CATALOGUE and therefore returns upstream's order, discarding the
  // sequence the admin arranged — and its `Set.has` was exact-case, so a
  // mixed-case pin resolved to nothing at all. See the module for both.
  let relatedCoursesData = [];
  if (article.relatedCourses?.length) {
    try {
      const { items } = await listPublicCourses();
      relatedCoursesData = pickPinnedCourses(article.relatedCourses, items);
    } catch {
      relatedCoursesData = [];
    }
  }

  const minutes = readingTimeMinutes(article.content);
  // null when the article is a draft, has no publishedAt, JSON-LD is
  // disabled, or rawOverride is on with invalid JSON — in any of those
  // cases we simply omit the script tag.
  const jsonLdData = buildJsonLd(article);

  return (
    <>
      {jsonLdData && (
        <script
          type="application/ld+json"
          // App Router serializes this into the streamed HTML head as
          // part of the page output — search engines pick it up the
          // same as a hand-written <head> include.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
        />
      )}
      <ArticleDetailClient
        // Authored inline colours are classified here, on the server, and only
        // for the render path — `minutes` and the JSON-LD above are computed
        // from the untouched body, and nothing is written back to Mongo.
        //
        // Table wrapping runs AFTER the colour pass, and the order is load
        // bearing in one direction only: the colour pass reads inline styles
        // off existing elements and does not care about the wrapper divs, but
        // running it second would make it re-serialise a body this one already
        // re-serialised, for nothing. Both are server-side and both are
        // complete in the first paint — no part of this waits for hydration,
        // which is what keeps a reader without JS from getting the broken
        // version.
        article={{
          ...article,
          content: wrapArticleTables(normalizeAuthoredColors(article.content)),
        }}
        related={related}
        relatedCoursesData={relatedCoursesData}
        minutes={minutes}
      />
    </>
  );
}