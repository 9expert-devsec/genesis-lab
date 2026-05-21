import { notFound } from 'next/navigation';
import {
  getArticleBySlug,
  getArticles,
  getArticlesByIds,
} from '@/lib/actions/articles';
import { listPublicCourses } from '@/lib/api/public-courses';
import { buildJsonLd } from '@/lib/articles/buildJsonLd';
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
  const description = article.seoDescription || article.excerpt || article.title;
  return {
    title:       article.seoTitle || article.title,
    description,
    openGraph: {
      title:       article.seoTitle || article.title,
      description,
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
  // filter to the course_ids the admin pinned on the article. One
  // round-trip beats N-by-id lookups when the list is small (it is).
  let relatedCoursesData = [];
  if (article.relatedCourses?.length) {
    try {
      const { items } = await listPublicCourses();
      const wanted = new Set(article.relatedCourses);
      relatedCoursesData = (items ?? []).filter((c) => wanted.has(c.course_id));
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
        article={article}
        related={related}
        relatedCoursesData={relatedCoursesData}
        minutes={minutes}
      />
    </>
  );
}