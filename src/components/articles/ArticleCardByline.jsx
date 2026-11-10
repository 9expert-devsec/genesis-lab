import { avatarUrl } from '@/lib/avatar/avatarUrl';
import { cardBylineParts } from '@/lib/writers/articleWriters';

/**
 * The writers at the foot of an article card, for ArticleCard and BlogCard.
 *
 * Plain text, never a link: a card is already a link to the article, and an
 * anchor inside it would be invalid HTML. Profile links live on the article page.
 *
 * An article with no writers has no byline, and no empty strip.
 */
export function ArticleCardByline({ writers = [] }) {
  const { shown, label } = cardBylineParts(writers);
  if (shown.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2 border-t border-[var(--surface-border)] bg-gray-50 px-4 py-2.5 text-xs text-9e-slate-dp-50 dark:bg-white/5 dark:text-[#94a3b8]"
      data-testid="article-card-byline"
    >
      <span className="flex shrink-0 -space-x-2">
        {shown.map((writer) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={writer._id}
            src={avatarUrl(writer.avatarPublicId || null, 72)}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            aria-hidden="true"
            className="h-7 w-7 rounded-full object-cover ring-2 ring-white dark:ring-[#111d2c]"
          />
        ))}
      </span>
      <span className="min-w-0 truncate font-medium">{label}</span>
    </div>
  );
}
