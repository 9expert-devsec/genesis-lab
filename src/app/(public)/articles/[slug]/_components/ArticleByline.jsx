import { avatarUrl } from '@/lib/avatar/avatarUrl';
import { joinWriterNames } from '@/lib/writers/articleWriters';

/**
 * Who wrote the article.
 *
 * `writers` are resolved by the server page at read time. An article with none
 * has not been migrated, and shows its legacy `author` text.
 *
 * The names are plain text until /writer pages exist.
 */
export function ArticleByline({ writers = [], author = '' }) {
  if (writers.length === 0) {
    if (!author) return null;
    return (
      <p className="mt-2 text-sm text-gray-400 dark:text-[#94a3b8]" data-testid="article-byline">
        บทความโดย: {author}
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid="article-byline">
      <span className="text-gray-400 dark:text-[#94a3b8]">บทความโดย</span>
      <span className="flex -space-x-2">
        {writers.map((writer) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={writer._id}
            src={avatarUrl(writer.avatarPublicId || null, 72)}
            alt=""
            width={28}
            height={28}
            aria-hidden="true"
            className="h-7 w-7 rounded-full object-cover ring-2 ring-white dark:ring-[#111d2c]"
          />
        ))}
      </span>
      <span className="font-medium text-9e-navy dark:text-white">{joinWriterNames(writers)}</span>
    </div>
  );
}
