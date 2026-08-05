import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatLauncherButton } from '@/components/chat/ChatLauncher';

// What the launcher actually renders in its COLLAPSED state.
//
// ── THE ASSERTION IS ABOUT THE MECHANISM, NOT THE WORD ──────────────────────
// "the label is present but collapsed" is easy to test badly: `html.includes(
// 'Chat AI')` is satisfied by a launcher that renders the label at full width,
// by one that renders it inside a tooltip, and by one that renders it twice.
// What has to be true is that the element CARRYING the label is the one that
// carries the collapsing utilities — so the label element is extracted first
// and its own class list is what gets checked.
//
// ── ESCAPING ────────────────────────────────────────────────────────────────
// Phase 2 found that React HTML-escapes `&` and `>` in attribute values, so
// `[&>*]:pointer-events-auto` reaches the markup as `[&amp;&gt;*]:...`. Every
// arbitrary utility on this component was checked against the rendered bytes
// rather than assumed: `max-w-[7rem]` and `transition-[max-width,opacity]`
// contain no escapable character and appear verbatim. One test below pins that,
// so a future utility that DOES need escaping cannot slip in unnoticed.

const html = () => renderToStaticMarkup(createElement(ChatLauncherButton, { onClick() {} }));

/** The element carrying the visible label, by its own anchor — not by index. */
function labelTag(markup) {
  const m = markup.match(/<span[^>]*data-chat-launcher-label[^>]*>/);
  if (!m) {
    throw new Error(
      'the launcher label element is gone, or lost its data-chat-launcher-label ' +
      'anchor. Every assertion here reads its class list; without it they would ' +
      'be checking an empty string, which for a "contains" check fails loudly ' +
      'but for a "does not contain" check would look exactly like a pass.',
    );
  }
  return m[0];
}

const buttonTag = (markup) => markup.match(/<button[^>]*>/)[0];

test('the label element renders, and renders COLLAPSED', () => {
  const markup = html();
  assert.ok(markup.includes('Chat AI'), 'the label text is in the DOM (not a tooltip on demand)');

  const tag = labelTag(markup);
  // The three parts of the collapsing mechanism, all on the label element.
  assert.match(tag, /\bmax-w-0\b/, 'width starts at zero');
  assert.match(tag, /\boverflow-hidden\b/, 'so the text is clipped rather than wrapped');
  assert.match(tag, /\bopacity-0\b/, 'and faded out');
});

test('expansion is max-width, and it is animatable', () => {
  const tag = labelTag(html());
  assert.match(tag, /transition-\[max-width,opacity\]/, 'the transition names the properties it animates');
  assert.ok(
    !/\bw-auto\b/.test(tag),
    'width:auto is not an animatable value — a transition on it is silently ignored ' +
    'and the label snaps open',
  );
});

test('the capsule opens on keyboard focus, not only on hover', () => {
  const tag = labelTag(html());
  assert.match(tag, /group-hover:max-w-\[7rem\]/, 'pointer users get it on hover');
  assert.match(tag, /group-focus-visible:max-w-\[7rem\]/, 'keyboard users get it on focus-visible');
  assert.match(tag, /group-hover:opacity-100/);
  assert.match(tag, /group-focus-visible:opacity-100/);
  // The variants are useless without the `group` marker on the button.
  assert.match(buttonTag(html()), /\bgroup\b/, 'the button is the group the label reacts to');
});

test('the accessible name is the Thai sentence; the visible label stays Latin', () => {
  const markup = html();
  const tag = buttonTag(markup);
  assert.match(tag, /aria-label="เปิดแชทกับ AI Agent"/, 'a screen reader hears what the button does');
  assert.ok(markup.includes('>Chat AI<'), 'sighted users see the product name');
  // Pinned as DIFFERENT on purpose. A screen-reader user gets no capsule, no
  // gradient and no logo — only the string — and "Chat AI" alone does not say
  // what the control does. Anyone "fixing" them into agreement reddens this.
  assert.ok(
    !/aria-label="Chat AI"/.test(tag),
    'the accessible name must NOT be collapsed into the visible label',
  );
});

test('the collapsed circle clears a 44px tap target', () => {
  const tag = buttonTag(html());
  assert.match(tag, /\bh-11\b/, '44px tall');
  // 44px wide collapsed = p-1 (4px) + a 36px icon + p-1. Asserted as its parts,
  // because that is how the width is actually produced — there is no w-11 to
  // check, and there must not be: a fixed width cannot expand into a capsule.
  assert.match(tag, /\bp-1\b/);
  assert.match(html(), /\bh-9 w-9\b/, 'the icon well is 36px');
  assert.ok(!/\bw-11\b/.test(tag), 'a fixed width would stop the capsule expanding');
});

test('the brand fill is the existing gradient token, not a new one', () => {
  assert.match(buttonTag(html()), /\bbg-9e-gradient-hero\b/);
});

test('CONTROL: arbitrary utilities here survive HTML escaping unchanged', () => {
  // Phase 2's trap, pinned rather than remembered. If a future utility contains
  // `&`, `<` or `>`, its rendered bytes differ from its source form and the
  // regexes above would silently match nothing.
  const tag = labelTag(html());
  assert.ok(!tag.includes('&amp;'), 'no escaped ampersand — nothing here needs one');
  assert.ok(!tag.includes('&gt;'), 'no escaped angle bracket');
  // …and prove the check can see an escaped form when there IS one, using the
  // dock's own class, so this is not a claim about an empty string.
  assert.equal('[&>*]:pointer-events-auto'.includes('&'), true);
  assert.match(tag, /max-w-\[7rem\]/, 'the bracket form itself needs no escaping');
});
