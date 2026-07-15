/**
 * Fail-closed URL guard for Page Builder content (link href, button href,
 * inline image src). Shared by the rich-text walker and the section
 * components so there is ONE allowlist.
 *
 * Allowed: same-origin relative (`/…`), fragment (`#…`), and the schemes
 * http / https / mailto / tel. Everything else — protocol-relative (`//`),
 * `data:`, `javascript:`, schemeless hosts — returns null (drop the link).
 */
export function safeUrl(href) {
  if (typeof href !== 'string') return null;
  const v = href.trim();
  if (!v) return null;
  if (v.startsWith('#')) return v;                 // fragment
  if (v.startsWith('//')) return null;             // protocol-relative → reject
  if (v.startsWith('/')) return v;                 // same-origin relative
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(v);
  if (!m) return null;                             // no scheme, not relative → reject
  return ['http', 'https', 'mailto', 'tel'].includes(m[1].toLowerCase()) ? v : null;
}

/** True when the (already safe) URL points off-site — drives target/rel. */
export function isExternalUrl(href) {
  return typeof href === 'string' && /^https?:/i.test(href);
}
