import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { readSourceForScanning } from '../sourceScan.mjs';

// The transcript survives closing the panel.
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
// useChatStore() was called inside ChatPanel, and ChatPanel is mounted only
// while the panel is open. Clicking X unmounted it, React discarded the
// reducer, and the conversation was gone — while the sessionId survived in
// localStorage, so reopening gave a blank panel still wired to the upstream
// conversation. The same shape as review-app's reset(), reached from the other
// side. The store now lives in ChatLauncher, which stays mounted for the page.
//
// ── WHAT THIS TIER CAN AND CANNOT SEE ───────────────────────────────────────
// renderToStaticMarkup renders once; it cannot mount, unmount and re-mount, so
// "close and reopen keeps the messages" is not directly observable here. What
// IS observable, and is the property the fix actually turns on, is that the
// panel renders a transcript it is HANDED rather than one it owns — that is
// what makes its lifetime irrelevant. The ordering rule that stops the same bug
// arriving through the hidden-route door is a source fact, and is asserted as
// one below with its own control.
//
// (jsdom is present in node_modules but is an UNDECLARED transitive dependency.
// Building a guard on a package nobody chose is the defect test/pure/
// tailwindContentCoverage exists to prevent, so it is not used here.)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });

/** A store shaped like useChatStore's return, with a real transcript in it. */
const storeWith = (messages) => ({
  init() {},
  send() {},
  reset() {},
  messages,
  isLoading: false,
  error: '',
  errorCode: '',
  lastAssistant: messages.findLast?.((m) => m.role === 'assistant') ?? null,
  sessionId: 'sess-test',
});

const TRANSCRIPT = [
  { id: 'u1', role: 'user', text: 'อยากเรียน Power BI ต้องเริ่มยังไง', createdAt: 1 },
  { id: 'a1', role: 'assistant', text: 'แนะนำเริ่มจากหลักสูตร Power BI ระดับพื้นฐานครับ', createdAt: 2 },
];

const render = (store) => renderToStaticMarkup(createElement(ChatPanel, { onClose() {}, store }));

test('the panel renders the transcript it is HANDED, not one it owns', () => {
  const html = render(storeWith(TRANSCRIPT));
  assert.ok(html.includes('อยากเรียน Power BI ต้องเริ่มยังไง'), 'the user turn renders');
  assert.ok(html.includes('แนะนำเริ่มจากหลักสูตร Power BI ระดับพื้นฐานครับ'), 'the assistant turn renders');
  // If the panel still called useChatStore() itself, it would render its own
  // empty initial state and show the welcome screen instead — so this is the
  // decoupling, observed rather than asserted about the source.
  assert.ok(!html.includes('สวัสดีครับ!'), 'the welcome screen is NOT shown when there are messages');
});

test('an empty store still gives the welcome screen', () => {
  // The other half: the panel must not be showing the transcript because it
  // hardcodes something. Same component, different input, different output.
  const html = render(storeWith([]));
  assert.ok(html.includes('สวัสดีครับ!'), 'empty transcript → welcome');
  assert.ok(!html.includes('อยากเรียน Power BI'), 'and none of the other fixture leaks in');
});

test('the panel owns no store of its own', () => {
  const PANEL = src('src/components/chat/ChatPanel.jsx');
  assert.ok(
    !/useChatStore\(/.test(PANEL),
    'ChatPanel must not call useChatStore. It is mounted only while open, so a ' +
    'store it owns dies when the user closes the panel — which is the bug.',
  );
  assert.match(PANEL, /export function ChatPanel\(\{ onClose, store \}\)/, 'it takes the store as a prop');
});

test('the store is created ABOVE the launcher’s visibility early-return', () => {
  // THE HIDDEN-ROUTE DOOR. If `if (!shouldRenderChatLauncher(pathname)) return
  // null` ran first, the store would unmount on every route where the launcher
  // is hidden — so a user mid-conversation who steps into /registration to check
  // a price loses the transcript on the way in, and cannot even see it happen
  // because the launcher is not there. React's rules-of-hooks warning would also
  // fire, but a warning in a console nobody is reading is not a guard.
  const LAUNCHER = src('src/components/chat/ChatLauncher.jsx');
  const hookAt = LAUNCHER.indexOf('const store = useChatStore()');
  const guardAt = LAUNCHER.indexOf('if (!shouldRenderChatLauncher(pathname)) return null');
  assert.ok(hookAt !== -1, 'the launcher owns the store');
  assert.ok(guardAt !== -1, 'and still hides itself on the excluded routes');
  assert.ok(
    hookAt < guardAt,
    'the store must be created before the early return, or walking onto a hidden ' +
    'route destroys the conversation',
  );
});

test('CONTROL: the ordering assertion is a real comparison', () => {
  // An index compare passes trivially if either token is missing (-1 < n), so
  // both are asserted present above. Here the compare itself is shown live.
  const order = (a, b) => a !== -1 && b !== -1 && a < b;
  assert.equal(order(10, 20), true, 'hook first passes');
  assert.equal(order(20, 10), false, 'guard first fails');
  assert.equal(order(-1, 20), false, 'a missing hook is not silently "before" the guard');
});
