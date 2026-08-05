import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { readSourceForScanning } from '../sourceScan.mjs';

// ล้างแชท is the only destructive control in the panel, so it is the only one
// that confirms.
//
// ── THE ASYMMETRY IS THE POINT ──────────────────────────────────────────────
// Clearing rotates the session id, abandoning the conversation upstream as well
// as on screen — irreversible, and it was one unguarded click. Closing destroys
// nothing now that the store lives in ChatLauncher. Putting a prompt on the
// common action (open, glance, close) and none on the destructive one is
// exactly backwards, so both halves are asserted: the clear button arms, and
// the close button does not.
//
// renderToStaticMarkup cannot click, so the ARMED state is reached by rendering
// the component that produces it rather than by simulating a press. The wiring
// between the two — that clicking one really produces the other — is the source
// fact asserted at the bottom.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });
const PANEL = src('src/components/chat/ChatPanel.jsx');

const store = {
  init() {}, send() {}, reset() {},
  messages: [], isLoading: false, error: '', errorCode: '', lastAssistant: null,
  sessionId: 'sess-test',
};

const html = () => renderToStaticMarkup(createElement(ChatPanel, { onClose() {}, store }));

test('the clear control starts unarmed and asks nothing', () => {
  const markup = html();
  assert.match(markup, /data-clear-chat="idle"/, 'it renders in the idle state');
  assert.ok(markup.includes('>ล้างแชท<'), 'labelled as itself');
  // Matched as element text, never as a bare substring: Thai negates by prefix
  // and "ล้างแชท" is a substring of the armed label "ยืนยันล้างแชท", so a loose
  // matcher would report the armed state as idle.
  assert.ok(!markup.includes('>ยืนยันล้างแชท<'), 'and is NOT armed on first paint');
});

test('closing asks nothing, because closing destroys nothing', () => {
  // The other half of the asymmetry. If a confirmation ever appears here, the
  // store has moved back inside the panel or someone has taxed the common path.
  const markup = html();
  assert.match(markup, /aria-label="ปิดแชท"/, 'the close button exists');
  const closeTag = markup.match(/<button[^>]*aria-label="ปิดแชท"[^>]*>/)[0];
  assert.ok(!/data-clear-chat/.test(closeTag), 'and carries no confirmation state');
});

test('the armed state is a different control, not a restyled one', () => {
  // Both states must be reachable and distinguishable, or "it confirms" is a
  // claim about nothing. Asserted against the source because the armed branch
  // is behind a click this tier cannot perform.
  assert.match(PANEL, /data-clear-chat="idle"/);
  assert.match(PANEL, /data-clear-chat="armed"/);
  assert.match(PANEL, />\s*ยืนยันล้างแชท\s*</, 'the armed label states what will happen');
  assert.match(PANEL, /aria-label="ยกเลิกการล้างแชท"/, 'and there is an explicit way out');
});

test('only the confirmed press calls reset', () => {
  // The defect this guards: wiring `reset` to the arming press, which would
  // make the confirmation decorative. `onArm` must set state; `onConfirm` must
  // be the one that resets.
  assert.match(PANEL, /onArm=\{\(\) => setConfirmingClear\(true\)\}/, 'arming only arms');
  assert.match(
    PANEL,
    /onConfirm=\{\(\) => \{\s*setConfirmingClear\(false\);\s*reset\(\);\s*\}\}/,
    'and reset happens only after confirmation',
  );
  assert.ok(
    !/onClick=\{reset\}/.test(PANEL),
    'no control may call reset directly — that is the unguarded click this replaces',
  );
});

test('ESC disarms the confirmation before it does anything else', () => {
  // Escape means "back out of the innermost thing". An armed confirmation is
  // innermost, so it must come before the fullscreen and close branches —
  // otherwise arming it by accident forces the user to close the whole panel.
  const armedAt = PANEL.indexOf('if (confirmingClear) setConfirmingClear(false)');
  const fsAt = PANEL.indexOf('else if (isFullscreen) setIsFullscreen(false)');
  const closeAt = PANEL.indexOf('else onClose()');
  assert.ok(armedAt !== -1 && fsAt !== -1 && closeAt !== -1, 'all three branches exist');
  assert.ok(armedAt < fsAt && fsAt < closeAt, 'innermost first');
  assert.match(PANEL, /\}, \[confirmingClear, isFullscreen, onClose\]\)/, 'and the effect sees the state');
});

test('CONTROL: the Thai labels are matched as element text, not as substrings', () => {
  // The convention this repo has already paid for: Thai negates and qualifies by
  // PREFIX, so an affirmative label is a substring of its own qualified form.
  // Here ล้างแชท sits inside ยืนยันล้างแชท, so a bare-substring matcher reports
  // "idle" for a panel that is armed.
  assert.ok('ยืนยันล้างแชท'.includes('ล้างแชท'), 'the trap is real');
  assert.ok(!'ยืนยันล้างแชท'.includes('>ล้างแชท<'), 'and element-text matching avoids it');
});
