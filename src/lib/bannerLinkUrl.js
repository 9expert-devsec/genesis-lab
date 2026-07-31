/**
 * `link_url` handling for the public hero carousel banners.
 *
 * ── WHY THIS IS A BLOCKLIST AND NOT src/lib/pageBuilder/safeUrl.js ──────────
 * safeUrl() is a fail-closed ALLOWLIST: anything it does not recognise returns
 * null and the link disappears. That is right for Page Builder rich text, where
 * the href comes from a pasted document and the author is not the person who
 * will notice it is gone.
 *
 * It is WRONG here. A banner is authored in /admin/banners by a human who types
 * one URL into one field and then looks at the homepage. Under an allowlist a
 * typo — `htp://…`, `www.9expert.co.th` with no scheme — renders a banner that
 * looks completely normal and silently does nothing when clicked. A SILENTLY
 * DEAD BANNER IS THE EXACT DEFECT CLASS THIS FILE EXISTS BECAUSE OF: the bug
 * that produced this module was a hero banner that swallowed every desktop
 * click, and it survived in production precisely because nothing looked broken.
 * Trading one silent-dead-link mechanism for another would be a lateral move.
 *
 * So: refuse the three schemes that are dangerous rather than merely wrong, let
 * a malformed URL through to the browser (which will show the user an error —
 * feedback, which is the point), and make the refusal LOUD via
 * warnBlockedBannerLink() rather than silent.
 *
 * The threat model this closes is narrow and real: `link_url` is a free-text
 * admin field rendered into an href, so an `javascript:` URL there is stored
 * XSS executing with the site's origin on the public homepage.
 */

// RELATIVE, AND WITH THE EXTENSION, deliberately — most of src/lib imports via
// the `@/` alias, but that alias is a bundler/editor convention Node knows
// nothing about, and extensionless relative specifiers do not resolve under
// Node's ESM resolver either. scripts/audit-banner-link-urls.mjs runs this
// module under PLAIN node (no bundler, no test loader) precisely so the audit
// measures the shipped predicate rather than a copy of it that can drift. This
// one specifier is what makes that possible.
import { isExternalUrl } from './pageBuilder/safeUrl.js';

/**
 * Characters a browser IGNORES when parsing a URL scheme, and which therefore
 * cannot be trusted to separate `java` from `script`. Chrome/Firefox/Safari all
 * strip TAB, LF and CR from anywhere in a URL and trim leading C0 controls and
 * spaces, so a "javascript:" URL whose scheme is split by a TAB navigates just
 * like an unsplit one. A scheme test that does not strip these is bypassed.
 *
 * ── THIS MUST BE A REGEX LITERAL. DO NOT REWRITE IT AS new RegExp('…') ──────
 * The first version of this module built the same class with new RegExp() from
 * a single-quoted STRING rather than a regex literal. In a string, backslash-s
 * is not a valid escape, so it collapsed to a bare "s" and the class became a
 * matcher that STRIPS THE LETTER "s". `javascript:alert(1)` normalised to
 * `javacript:alert(1)`, matched nothing on the blocklist, and was emitted as a
 * live href. The guard read as working, was tested as working, and passed
 * everything dangerous straight through. A regex literal cannot acquire that
 * bug: the escape is interpreted by the regex grammar, not the string grammar.
 * test/pure/bannerLinkUrl.test.mjs runs that form as a control and it goes red.
 */
const IGNORED_WHEN_PARSING_A_SCHEME = /[\s\u0000-\u001F\u007F]/g;

/**
 * Schemes refused outright. `javascript:` and `vbscript:` execute; `data:` can
 * carry `text/html` and so executes in a top-level navigation too. Nothing else
 * is refused — see the allowlist note at the top of the file.
 */
const DANGEROUS_SCHEMES = ['javascript:', 'data:', 'vbscript:'];

/**
 * True when `href` would navigate to a script-executing scheme.
 *
 * Deliberately a SCHEME test, not a substring search: `/blog/javascript:tips`
 * is a perfectly ordinary article path and must stay clickable. The blocklist
 * is compared against the START of the normalised value only.
 */
export function isDangerousLinkUrl(href) {
  if (typeof href !== 'string') return false;
  const normalized = href.replace(IGNORED_WHEN_PARSING_A_SCHEME, '').toLowerCase();
  return DANGEROUS_SCHEMES.some((scheme) => normalized.startsWith(scheme));
}

/**
 * Classify a banner's `link_url` into the element that should carry it.
 *
 * Returns `{ kind, href }` where kind is one of:
 *
 *   'none'      no link_url at all — render the slide unlinked (NOT an error)
 *   'blocked'   a dangerous scheme — render unlinked, and the caller MUST call
 *               warnBlockedBannerLink() so the drop is observable
 *   'internal'  same-origin path or fragment → next/link (client-side nav)
 *   'external'  http(s) or protocol-relative → <a target="_blank" rel="noopener noreferrer">
 *   'plain'     mailto: / tel: → a bare <a>, no target, no rel
 *
 * `href` is null for 'none' and 'blocked', and a trimmed string otherwise.
 *
 * WHY mailto:/tel: ARE THEIR OWN KIND rather than folded into either side:
 * next/link would try to client-side route them, and `target="_blank"` on a
 * mail or dial handoff opens a blank tab that never navigates and never closes.
 * Both are wrong in a way nobody notices until a customer tries to call.
 *
 * WHY PROTOCOL-RELATIVE (`//host/path`) IS 'external': it navigates off-site,
 * so it needs the same rel="noopener" treatment as an absolute URL. Handing it
 * to next/link as if it were a path would produce a broken route rather than a
 * link. It is NOT blocked — going off-site is not dangerous, it is just not
 * internal.
 */
export function resolveBannerLink(href) {
  if (typeof href !== 'string') return { kind: 'none', href: null };
  const value = href.trim();
  if (!value) return { kind: 'none', href: null };
  if (isDangerousLinkUrl(value)) return { kind: 'blocked', href: null };
  if (isExternalUrl(value) || value.startsWith('//')) return { kind: 'external', href: value };
  if (/^(?:mailto|tel):/i.test(value)) return { kind: 'plain', href: value };
  return { kind: 'internal', href: value };
}

/**
 * Banners already warned about, keyed by _id. A refused link is a permanent
 * property of a stored document, so the warning is worth exactly one line —
 * repeating it on every render (and this is a carousel: it re-renders on every
 * auto-advance, every hover, every drag frame) would flood the console until
 * nobody reads any of it, which is the same "make it invisible" failure the
 * warning exists to avoid.
 */
const alreadyWarned = new Set();

/**
 * Announce, once per banner, that a link_url was refused and the slide is
 * rendering unlinked.
 *
 * This is the whole reason a blocklist is defensible here. Dropping a link
 * SILENTLY is what makes a dead banner survive in production for months; an
 * admin who clicks their own banner and gets nothing has no way to tell "I
 * typed a bad URL" from "the site is broken". The message names the `_id` so it
 * can be looked up in /admin/banners, and the title so it is recognisable
 * without a lookup.
 */
export function warnBlockedBannerLink(banner) {
  const id = banner?._id != null ? String(banner._id) : '(no _id)';
  if (alreadyWarned.has(id)) return;
  alreadyWarned.add(id);
  const title = banner?.title ? String(banner.title) : '(untitled)';
  console.warn(
    `[banner] link_url refused — dangerous scheme (javascript:/data:/vbscript:). ` +
      `Banner _id=${id} title=${JSON.stringify(title)} renders WITHOUT a link. ` +
      `Fix the URL in /admin/banners.`
  );
}
