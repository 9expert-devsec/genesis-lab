import { sanitizePageHtml } from '@/lib/customPages/sanitizePageHtml';
import { embedSrc } from '@/lib/pageBuilder/embedSrc';

/**
 * embed — a developer-tier third-party embed (§5.5). Server component.
 *
 * Two paths, one trust posture:
 *   - youtube / vimeo → a player URL is parsed from the share/watch `url`
 *     (embedSrc, shared with sectionRendersEmpty). The iframe src is a fixed
 *     template with only the extracted id, so no author string reaches it.
 *   - iframe → the raw `html` runs through the SAME shared sanitizePageHtml as
 *     custom_html / advanced.customHtml — its host whitelist (youtube, vimeo,
 *     google, facebook, maps) is the trust boundary. There is exactly ONE
 *     sanitizer by design: a second copy inevitably drifts from the first, and
 *     drift at a sanitizer is a silently re-opened XSS hole. This file adds no
 *     sanitizing of its own; the fuller reasoning lives at sections/custom_html.jsx
 *     and lib/pageBuilder/scopeCss.js — this defers to it rather than restating.
 *
 * `script` was removed from the provider set (schemas/sections/advanced.js): the
 * shared sanitizer strips <script>, so it could only be accepted-not-honoured.
 *
 * Fails closed: a url that yields no id, or iframe html that sanitizes to
 * nothing, renders NOTHING (the editor warns).
 */
export function EmbedSection({ content }) {
  const provider = content?.provider;

  if (provider === 'iframe') {
    const raw = typeof content?.html === 'string' ? content.html : '';
    if (!raw.trim()) return null;
    const clean = sanitizePageHtml(raw);
    if (!clean.trim()) return null;
    return (
      <div
        className="pb-embed [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:rounded-9e-lg"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  const src = embedSrc(provider, content?.url);
  if (!src) return null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-9e-lg">
      <iframe
        src={src}
        title="embedded content"
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
