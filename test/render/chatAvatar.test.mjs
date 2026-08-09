import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatAvatar, TypingBubble } from '@/components/chat/ChatCards';
import { CHAT_MARK_SRC } from '@/lib/chat/branding';

// The assistant's avatar, in every row that shows one.
//
// ── THE DEFECT THIS PINS ────────────────────────────────────────────────────
// The typing row rendered an EMPTY circle — a bare div with no <img> — while
// the assistant message rows directly above it rendered the mascot. Both were
// ported from review-app, where the typing placeholder is also empty, so this
// arrived as inherited drift rather than as a mistake made here.
//
// The repair was one component with two call sites, NOT the same markup pasted
// into both rows. That distinction is what these tests are actually about: the
// assertion below is byte-equality against the shared component's own output,
// so a future hand-rolled copy that merely LOOKS the same fails it the moment
// the two drift by a single class.

const render = (el) => renderToStaticMarkup(el);
const avatarHtml = () => render(createElement(ChatAvatar));
const typingHtml = () => render(createElement(TypingBubble));

test('the typing row renders the agent mark, not an empty circle', () => {
  // Asserted against the shared constant, not a literal: the path now lives in
  // src/lib/chat/branding.js and a copy here would be a fifth place it has to
  // agree. That the constant points at a file that EXISTS, with the exact case
  // a Linux build needs, is pinned in test/fs/chatWiring.
  const html = typingHtml();
  assert.ok(html.includes(CHAT_MARK_SRC), 'the avatar has the agent mark in it');
  assert.ok(html.includes('กำลังพิมพ์'), 'and it really is the typing row');
});

test('the typing row uses the SHARED avatar, byte for byte', () => {
  // Byte-equality, not "contains an img". A copy that drifts by one class — the
  // exact way these two came apart — fails here while a "looks right" check
  // would pass.
  assert.ok(
    typingHtml().includes(avatarHtml()),
    'the typing row must embed the shared ChatAvatar output verbatim; if this ' +
    'fails, someone has re-implemented the avatar instead of rendering it',
  );
});

test('CONTROL: the empty placeholder would not satisfy either assertion', () => {
  // The literal markup that shipped, reconstructed. Without this, "the typing
  // row contains the mascot" could pass for a row that renders the mascot
  // somewhere else entirely, and the byte-equality check could pass vacuously
  // if avatarHtml() ever returned an empty string.
  const emptyPlaceholder =
    '<div class="mt-1 h-8 w-8 shrink-0 rounded-full bg-[var(--surface-muted)] ring-1 ring-[var(--surface-border)]"></div>';
  assert.ok(!emptyPlaceholder.includes(CHAT_MARK_SRC), 'the old placeholder had no mark');
  assert.ok(!emptyPlaceholder.includes(avatarHtml()), 'and is not the shared avatar');

  // …and the shared avatar is a real, non-empty string, so `includes()` above is
  // a genuine test rather than "every string contains the empty string".
  assert.ok(avatarHtml().length > 40, 'the shared avatar renders real markup');
  // The path is escaped before going into a RegExp: it contains `.`, which is
  // the any-character wildcard. Unescaped, `ai-chatbot.png` would also match
  // `ai-chatbotXpng` — harmless here, but a matcher that is loose by accident is
  // how the assertions in this repo have gone quietly wrong before.
  const escaped = CHAT_MARK_SRC.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  assert.match(avatarHtml(), new RegExp(`<img[^>]*${escaped}`));
});
