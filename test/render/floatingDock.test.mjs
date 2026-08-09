import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FloatingActionDockView } from '@/components/ui/FloatingActionDock';

// What the dock actually RENDERS, as opposed to what its source says.
//
// ── WHY THE VIEW AND NOT THE EXPORTED DOCK ──────────────────────────────────
// FloatingActionDock reads usePathname(). The shared next/navigation stub
// returns a constant '/', and it must STAY constant: this runner uses
// isolation:'none' with concurrency:true, so mutating that stub to steer one
// test would change the pathname under every other render file mid-flight —
// the same process-global trap that leaked a timezone across tiers once
// already. FloatingActionDockView takes the pathname as a prop for exactly this
// reason, and test/pure/floatingDockStack pins that the exported wrapper really
// feeds it the router's value.
//
// ── ScrollToTopButton IS ABSENT HERE, AND THAT IS THE CASE UNDER TEST ────────
// It starts at show=false and only flips inside a scroll effect, which
// renderToStaticMarkup never runs. So every render below is the
// "back-to-top hidden" state — which is precisely the state the bottom slot has
// to survive unchanged.

const SLOT_MARK = 'data-chat-slot';
const launcher = () => createElement('button', { [SLOT_MARK]: '', type: 'button' }, 'Chat AI');

const render = (props) =>
  renderToStaticMarkup(createElement(FloatingActionDockView, props));

const dockOpenTag = (html) => {
  const m = html.match(/<div[^>]*data-floating-dock[^>]*>/);
  if (!m) {
    throw new Error(
      'the dock container did not render, or lost its data-floating-dock anchor. ' +
      'Every assertion in this file reads that tag; without it they would all be ' +
      'checking an empty string, which for a "does not contain" check looks ' +
      'exactly like a pass.',
    );
  }
  return m[0];
};

test('the bottom slot renders while back-to-top is hidden', () => {
  const html = render({ pathname: '/', bottomSlot: launcher() });
  assert.ok(html.includes(SLOT_MARK), 'the launcher slot rendered');
  // back-to-top is genuinely absent in this state — so the launcher is the only
  // child, and it is still the LAST one.
  assert.ok(!html.includes('aria-label="กลับขึ้นด้านบน"'), 'back-to-top is hidden');
  const tag = dockOpenTag(html);
  assert.ok(
    html.indexOf(tag) < html.indexOf(SLOT_MARK),
    'the launcher is inside the dock, not a sibling of it',
  );
});

test('the dock is anchored at the bottom, never the top', () => {
  const tag = dockOpenTag(render({ pathname: '/', bottomSlot: launcher() }));
  assert.match(tag, /\bbottom-8\b/, 'pinned to the bottom edge');
  assert.ok(
    !/\btop-\d/.test(tag) && !/\binset-y-0\b/.test(tag),
    'a top anchor (or a full-height inset) would make the bottom slot move every ' +
    'time ScrollToTopButton shows or hides — the exact jitter the bottom anchor ' +
    `prevents. Shipped: "${tag}"`,
  );
});

test('the container is click-through and its children are not', () => {
  const tag = dockOpenTag(render({ pathname: '/', bottomSlot: launcher() }));
  assert.match(tag, /\bpointer-events-none\b/);

  // THE CLASS IS HTML-ESCAPED IN RENDERED MARKUP, and this is not a detail to
  // paper over. In source the utility reads `[&>*]:pointer-events-auto`; React
  // escapes `&` and `>` when serialising an attribute, so the bytes here are
  // `[&amp;&gt;*]:pointer-events-auto`. The source-form regex does not match
  // rendered HTML and the rendered-form regex does not match source — this
  // file must use one, test/pure/floatingDockStack the other. A browser decodes
  // it back before matching CSS, so the shipped behaviour is unaffected.
  assert.match(tag, /\[&amp;&gt;\*\]:pointer-events-auto/);
  assert.ok(
    !tag.includes('[&>*]'),
    'the raw source form must NOT appear in rendered markup. If it ever does, ' +
    'React changed its attribute escaping and the assertion above needs to be ' +
    'the one that goes red, rather than both quietly matching nothing.',
  );
});

test('the register lift raises the whole stack, not one button', () => {
  const plain = dockOpenTag(render({ pathname: '/promotions', bottomSlot: launcher() }));
  const lifted = dockOpenTag(render({ pathname: '/power-bi/register', bottomSlot: launcher() }));
  assert.match(plain, /\bbottom-8\b/);
  assert.ok(!/\bbottom-24\b/.test(plain), 'no lift off a register flow');
  assert.match(lifted, /\bbottom-24\b/, 'lifted clear of the mobile bottom bar');
  assert.match(lifted, /\blg:bottom-8\b/, 'and back to the resting offset at lg, where no bar exists');
});

test('the dock renders nothing at all on /admin', () => {
  assert.equal(render({ pathname: '/admin', bottomSlot: launcher() }), '');
  assert.equal(render({ pathname: '/admin/articles', bottomSlot: launcher() }), '');
});

test('CONTROL: the admin assertion is not passing because the dock never renders', () => {
  // An empty string is what a component that always returns null produces, so
  // "renders nothing on /admin" is only evidence if it renders SOMETHING
  // elsewhere with the same props.
  const publicHtml = render({ pathname: '/', bottomSlot: launcher() });
  assert.notEqual(publicHtml, '', 'the same call on a public path DOES render');
  assert.ok(publicHtml.includes(SLOT_MARK), 'and carries the slot content through');
});

test('CONTROL: the slot is a real slot — nothing passed means nothing rendered', () => {
  // Otherwise "the chat slot renders" could be satisfied by markup the dock
  // hardcodes, and Phase 3's gate (no launcher when the chat is unconfigured)
  // would have nothing holding it.
  const html = render({ pathname: '/' });
  assert.equal(dockOpenTag(html).length > 0, true, 'the dock still renders');
  assert.ok(!html.includes(SLOT_MARK), 'but the bottom slot is empty');
});
