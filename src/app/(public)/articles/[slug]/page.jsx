import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ChevronLeft, Clock, User } from 'lucide-react';
import {
  getArticleBySlug,
  getArticles,
  getArticlesByIds,
} from '@/lib/actions/articles';
import { ArticleDetailClient } from './_components/ArticleDetailClient';
import { ShareButtons } from './_components/ShareButtons';

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

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

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

  const minutes = readingTimeMinutes(article.content);

  return (
    <ArticleDetailClient>
      <article className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6">
        <Link
          href="/articles"
          className="inline-flex items-center gap-1 text-sm text-9e-action hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> กลับไปยังบทความทั้งหมด
        </Link>

        {article.coverUrl && (
          <div className="mt-6 aspect-video overflow-hidden rounded-2xl bg-9e-ice dark:bg-[#0D1B2A]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.coverUrl}
              alt={article.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {article.author && (
          <p className="mt-3 text-sm text-gray-400 dark:text-[#94a3b8]">
            บทความโดย: {article.author}
          </p>
        )}

        <h1 className="mt-6 text-4xl font-bold leading-tight text-9e-navy dark:text-white">
          {article.title}
        </h1>

        {article.excerpt && (
          <p className="mt-3 text-lg text-gray-500 dark:text-[#94a3b8]">
            {article.excerpt}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {article.author && (
            <span className="inline-flex items-center gap-1">
              <User className="h-4 w-4" /> {article.author}
            </span>
          )}
          {article.publishedAt && (
            <span>{formatDate(article.publishedAt)}</span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" /> {minutes} นาที
          </span>
        </div>

        {(article.tags?.length ?? 0) > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {article.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-9e-ice px-2 py-0.5 text-xs text-9e-action dark:bg-[#0D1B2A]"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        <ShareButtons slug={article.slug} />

        <hr className="mb-8 mt-8 border-[var(--surface-border)]" />

        <div
          id="article-content"
          className="article-content prose prose-lg max-w-none
            prose-ul:list-disc prose-ul:pl-6
            prose-ol:list-decimal prose-ol:pl-6
            prose-li:my-1
            prose-h2:border-l-4 prose-h2:border-blue-500 prose-h2:pl-4
            prose-blockquote:border-l-4 prose-blockquote:border-blue-500
            prose-blockquote:bg-blue-50 prose-blockquote:py-2 prose-blockquote:px-4
            prose-code:bg-blue-50 prose-code:text-blue-700 prose-code:px-1 prose-code:rounded
            prose-pre:bg-gray-900 prose-pre:text-gray-100
            prose-a:text-blue-600 prose-a:underline
            prose-img:rounded-xl prose-img:shadow-md
            dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: article.content ?? '' }}
        />

        {(article.relatedCourses?.length ?? 0) > 0 && (
          <section className="mt-12 rounded-2xl border border-[var(--surface-border)] bg-9e-ice/50 p-5 dark:bg-[#0D1B2A]/50">
            <h2 className="text-base font-bold text-9e-navy dark:text-white">
              หลักสูตรที่เกี่ยวข้อง
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {article.relatedCourses.map((cid) => (
                <span
                  key={cid}
                  className="rounded-full border border-9e-action bg-white px-3 py-1 text-xs font-mono text-9e-action dark:bg-[#111d2c]"
                >
                  {cid}
                </span>
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-16 border-t border-[var(--surface-border)] pt-10">
            <h2 className="text-xl font-bold text-9e-navy dark:text-white">
              บทความที่เกี่ยวข้อง
            </h2>
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.slice(0, 3).map((a) => (
                <Link
                  key={a._id}
                  href={`/articles/${a.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-white transition-all hover:-translate-y-0.5 hover:shadow-9e-lg dark:bg-[#0D1B2A]"
                >
                  <div className="aspect-video overflow-hidden bg-9e-ice dark:bg-[#111d2c]">
                    {a.coverUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={a.coverUrl}
                        alt={a.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-9e-action">
                        {a.title?.slice(0, 1) ?? '?'}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="line-clamp-2 text-base font-bold text-9e-navy dark:text-white">
                      {a.title}
                    </h3>
                    {a.excerpt && (
                      <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-[#94a3b8]">
                        {a.excerpt}
                      </p>
                    )}
                    <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-9e-action">
                      อ่านเพิ่มเติม <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </ArticleDetailClient>
  );
}