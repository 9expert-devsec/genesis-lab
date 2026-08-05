'use client';

import { toBulletGlyphs } from '@/lib/chat/messageText';
import { splitContacts } from '@/lib/chat/contactLinks';

/**
 * The assistant's message body: bullet glyphs, then contact links.
 *
 * ── ORDER MATTERS, AND THE TWO CANNOT CORRUPT EACH OTHER ────────────────────
 * toBulletGlyphs runs FIRST. It only touches a `*` at the start of a line, and
 * `•` appears in none of the contact patterns, so bullets cannot create or
 * destroy a match. splitContacts runs second on the already-substituted string
 * and only ever splits it — it never rewrites the visible text, so it cannot
 * disturb a bullet either. A test drives both together on one line rather than
 * trusting that argument.
 *
 * ── NO MARKUP CROSSES THIS BOUNDARY ─────────────────────────────────────────
 * splitContacts returns DATA. Every segment's `text` becomes a React text node
 * or an anchor's child, both of which React escapes, so upstream content can
 * never be markup. `dangerouslySetInnerHTML` appears nowhere in any chat
 * surface and a guard asserts it.
 *
 * The only href we do not build ourselves is the URL one, and it is allowlisted
 * to http/https in contactLinks.js.
 */
export function AssistantText({ text }) {
  const segments = splitContacts(toBulletGlyphs(text));

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          seg.text
        ) : (
          <a
            key={`${seg.type}-${i}`}
            href={seg.href}
            // Only an external page needs a new tab. mailto:/tel: hand off to
            // another app, and target="_blank" on those leaves a blank tab.
            {...(seg.type === 'url'
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {})}
            className="font-medium text-9e-action underline underline-offset-2 hover:no-underline dark:text-9e-air"
          >
            {seg.text}
          </a>
        ),
      )}
    </>
  );
}
