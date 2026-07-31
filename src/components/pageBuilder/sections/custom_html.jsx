import { sanitizePageHtml } from '@/lib/customPages/sanitizePageHtml';

/**
 * custom_html — a developer-tier raw-HTML block (§5.5). Server component.
 *
 * Distinct from the ENVELOPE's `advanced.customHtml` (which every section can
 * carry): this is a section whose whole `content` IS the HTML. Both run through
 * the SAME shared sanitizePageHtml — one whitelist, never a second drift-prone
 * copy. The category is developer-tier, enforced in the action layer
 * (tierSanitize); the store is not a trust boundary, so the sanitize runs on
 * EVERY render regardless of who wrote it.
 *
 * Fails closed: empty input, or input that sanitizes down to nothing, renders
 * NOTHING (the editor warns).
 */
export function CustomHtmlSection({ content }) {
  const raw = typeof content?.html === 'string' ? content.html : '';
  if (!raw.trim()) return null;
  const clean = sanitizePageHtml(raw);
  if (!clean.trim()) return null;
  return <div className="pb-custom-html" dangerouslySetInnerHTML={{ __html: clean }} />;
}
