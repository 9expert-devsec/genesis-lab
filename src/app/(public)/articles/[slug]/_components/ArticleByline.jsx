import Link from 'next/link';
import { Clock } from 'lucide-react';
import { avatarUrl } from '@/lib/avatar/avatarUrl';
import { WRITER_NAME_SEPARATOR } from '@/lib/writers/articleWriters';
import { writerPath } from '@/lib/writers/writerUrls';

/**
 * The row under the cover: who wrote the article, then how long it takes to read.
 *
 * `writers` are resolved by the server page at read time. An article with none
 * shows its legacy `author` text.
 *
 * This is the only place on the article page that links to a writer's profile.
 * Focus rings come from the app-wide `*:focus-visible` rule in globals.css; the
 * `focus-visible:z-10` lifts a focused avatar out of the overlap so the ring shows.
 *
 * NO PUBLISH DATE, by the owner's decision: articles are evergreen reference
 * material, and a visible date makes a still-accurate 2024 piece look stale.
 * `publishedAt` still orders lists and the sitemap, and still gates publication.
 */
export function ArticleByline({ writers = [], author = '', minutes = null }) {
  const named = writers.length > 0 || Boolean(author);
  const timed = minutes !== null && minutes !== undefined;
  if (!named && !timed) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" data-testid="article-byline">
      {writers.length > 0 ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-gray-400 dark:text-[#94a3b8]">บทความโดย</span>
          <span className="flex -space-x-2">
            {writers.map((writer) => (
              <Link
                key={writer._id}
                href={writerPath(writer.slug)}
                aria-label={writer.displayName}
                className="relative rounded-full focus-visible:z-10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl(writer.avatarPublicId || null, 72)}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full object-cover ring-2 ring-white dark:ring-[#111d2c]"
                />
              </Link>
            ))}
          </span>
          <span className="font-medium text-9e-navy dark:text-white">
            {writers.map((writer, index) => (
              <span key={writer._id}>
                {index > 0 && WRITER_NAME_SEPARATOR}
                <Link href={writerPath(writer.slug)} className="hover:text-9e-action hover:underline dark:hover:text-9e-air">
                  {writer.displayName}
                </Link>
              </span>
            ))}
          </span>
        </span>
      ) : author ? (
        <span className="text-gray-400 dark:text-[#94a3b8]">บทความโดย: {author}</span>
      ) : null}

      {timed && (
        <>
          {named && (
            <span aria-hidden="true" className="hidden h-[18px] w-px bg-[var(--surface-border)] sm:block" data-testid="byline-divider" />
          )}
          <span className="inline-flex items-center gap-1 text-9e-slate-dp-50 dark:text-[#94a3b8]">
            <Clock className="h-4 w-4" aria-hidden="true" /> {minutes} นาที
          </span>
        </>
      )}
    </div>
  );
}
