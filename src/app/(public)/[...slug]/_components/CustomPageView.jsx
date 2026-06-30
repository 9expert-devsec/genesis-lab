import { sanitizePageHtml } from '@/lib/customPages/sanitizePageHtml';

/**
 * Public renderer for a published custom page.
 *
 * Server component — the body is sanitized here (treated as untrusted on
 * every render) before injection. Meta/OG live in generateMetadata and the
 * JSON-LD <script> is emitted by the route's page.jsx, so neither belongs
 * here.
 */
export function CustomPageView({ page }) {
  const cleanHtml = sanitizePageHtml(page?.body);

  return (
    <article className="mx-auto max-w-[1200px] px-4 py-8">
      <h1 className="text-2xl font-bold text-9e-navy md:text-3xl">
        {page?.title}
      </h1>

      <div
        className="custom-page-content prose prose-lg mt-6 max-w-none prose-h2:border-l-4 prose-h2:border-blue-500 prose-h2:pl-4 prose-a:text-blue-600 prose-a:underline prose-img:rounded-xl prose-img:shadow-md dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    </article>
  );
}
