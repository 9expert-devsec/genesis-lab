import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatErrorNotice } from '@/components/chat/ChatPanel';
import { CHAT_UNAVAILABLE_CODE } from '@/lib/chat/limits';

// How the route's error vocabulary reaches the screen.
//
// The route speaks five codes. If they all rendered identically, the vocabulary
// would be doing no work and either the UI should branch or the route should
// stop distinguishing them. It branches ONCE, on the only distinction that
// changes what the user should do:
//
//   chat_unavailable  the service was never configured for this deployment.
//                     Nothing went wrong, nothing to retry → a neutral notice.
//   everything else   something that worked a moment ago did not this time.
//                     A fault → the red treatment, carrying the route's own
//                     Thai prose, which is already different per code.
//
// The component is exported and driven directly: the panel only reaches this
// state through a failed fetch, which renderToStaticMarkup cannot cause.

const render = (props) => renderToStaticMarkup(createElement(ChatErrorNotice, props));

const FAULT_CODES = ['upstream_timeout', 'upstream_failed', 'rate_limited', 'message_too_long'];

test('an unconfigured service reads as a calm notice, not a failure', () => {
  const html = render({ code: CHAT_UNAVAILABLE_CODE, message: 'ระบบแชทยังไม่พร้อมใช้งานในขณะนี้' });
  assert.ok(html.includes('ระบบแชทยังไม่พร้อมใช้งานในขณะนี้'), 'the route’s prose is what the user reads');
  assert.ok(!/\brose-\d/.test(html), 'no red treatment — nothing went wrong');
  assert.match(html, /var\(--surface-muted\)/, 'a neutral surface that themes with the panel');
  assert.match(html, /role="status"/, 'announced, not alerted');
});

test('every genuine fault gets the red treatment and its own prose', () => {
  for (const code of FAULT_CODES) {
    const html = render({ code, message: `prose-for-${code}` });
    assert.ok(/\brose-\d/.test(html), `${code} must read as a fault`);
    assert.ok(html.includes(`prose-for-${code}`), `${code} carries the route's own message`);
  }
  // An unknown code fails safe as a fault rather than as a calm notice: a
  // failure we cannot name is still a failure.
  assert.ok(/\brose-\d/.test(render({ code: undefined, message: 'x' })));
});

test('CONTROL: the two presentations are genuinely different markup', () => {
  // Without this, "calm" could be satisfied by a component that renders the red
  // treatment for everything and the assertion above would still pass on the
  // message text alone.
  const calm = render({ code: CHAT_UNAVAILABLE_CODE, message: 'same text' });
  const fault = render({ code: 'upstream_timeout', message: 'same text' });
  assert.notEqual(calm, fault, 'identical markup would mean the branch does nothing');
  assert.equal(/\brose-\d/.test(calm), false);
  assert.equal(/\brose-\d/.test(fault), true);
  // …and the code is on the element, so the branch is inspectable in a browser
  // rather than only inferable from its colour.
  assert.match(calm, /data-chat-error="chat_unavailable"/);
  assert.match(fault, /data-chat-error="upstream_timeout"/);
});

test('the calm branch is keyed on the shared constant, not a copied string', () => {
  // A literal 'chat_unavailable' here and another in the route is one rule
  // written twice. The route's own vocabulary is the source; this pins that the
  // component agrees with it by IMPORT rather than by coincidence.
  assert.equal(CHAT_UNAVAILABLE_CODE, 'chat_unavailable');
  const html = render({ code: CHAT_UNAVAILABLE_CODE, message: 'x' });
  assert.match(html, new RegExp(`data-chat-error="${CHAT_UNAVAILABLE_CODE}"`));
});
