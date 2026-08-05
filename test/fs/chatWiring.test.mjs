import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readSourceForScanning } from '../sourceScan.mjs';
import { CHAT_MARK_SRC } from '@/lib/chat/branding';

// The seams around the chat feature that no render test can reach.
//
// Three separate questions decide whether a launcher appears, and each has a
// different owner. The render tier can see the third; the first two are single
// lines in files it never executes.
//
//   root layout   is chat CONFIGURED?        server, reads process.env
//   ChatLauncher  is chat APPROPRIATE here?  client, reads usePathname
//   the dock      where does the slot sit?   neither — it must not know
//
// Comments are stripped before every match: this file's own subjects explain
// themselves in prose that quotes the identifiers under test, and an assertion
// about what code DOES must never be satisfiable by a comment about it.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });

const LAYOUT = src('src/app/layout.jsx');
const DOCK = src('src/components/ui/FloatingActionDock.jsx');
const LAUNCHER = src('src/components/chat/ChatLauncher.jsx');
const PANEL = src('src/components/chat/ChatPanel.jsx');

// ── The env gate ────────────────────────────────────────────────────────────

test('the root layout reads the chat URL server-side and derives a boolean', () => {
  assert.match(
    LAYOUT,
    /const chatEnabled = Boolean\(process\.env\.CHATBOT_V2_API_URL\)/,
    'the gate is computed in the server layout, from the real env var',
  );
});

test('the bottom slot is GATED on that boolean, not passed unconditionally', () => {
  assert.match(
    LAYOUT,
    /bottomSlot=\{chatEnabled \? <ChatLauncher \/> : null\}/,
    'no launcher element is created at all when the service is unconfigured — ' +
    'the point is that no dead button ships to production ahead of the backend',
  );
});

test('CONTROL: a hardcoded gate would not satisfy the two checks above', () => {
  // The pair is what makes it a real gate. Replicated here so the failure mode
  // is demonstrable rather than asserted: each broken form fails exactly one.
  const gateRe = /const chatEnabled = Boolean\(process\.env\.CHATBOT_V2_API_URL\)/;
  const slotRe = /bottomSlot=\{chatEnabled \? <ChatLauncher \/> : null\}/;

  const hardcodedTrue = 'const chatEnabled = true;\n<FloatingActionDock bottomSlot={chatEnabled ? <ChatLauncher /> : null} />';
  assert.equal(gateRe.test(hardcodedTrue), false, 'a hardcoded flag fails the env check');
  assert.equal(slotRe.test(hardcodedTrue), true, 'while still passing the shape check — hence both');

  const ungated = 'const chatEnabled = Boolean(process.env.CHATBOT_V2_API_URL);\n<FloatingActionDock bottomSlot={<ChatLauncher />} />';
  assert.equal(gateRe.test(ungated), true);
  assert.equal(slotRe.test(ungated), false, 'and an ungated slot fails the other');
});

test('the chat URL never becomes a NEXT_PUBLIC_ variable', () => {
  // A NEXT_PUBLIC_ copy would put the upstream host in the browser bundle,
  // which is the one thing the same-origin proxy exists to prevent.
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next') continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|jsx)$/.test(name)) {
        if (/NEXT_PUBLIC_[A-Z_]*(CHATBOT|FEEDBACK)/.test(readSourceForScanning(full))) {
          offenders.push(path.relative(ROOT, full).split(path.sep).join('/'));
        }
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  assert.deepEqual(offenders, [], 'the chatbot/feedback hosts must stay server-side');
});

// ── Dependency direction ────────────────────────────────────────────────────

test('the dock knows nothing about chat', () => {
  // The whole reason the slot is named for a POSITION. If the dock ever imports
  // the launcher, a layout primitive has become a chat component and Phase 4
  // has to reopen a file that is finished.
  for (const token of ['ChatLauncher', 'ChatPanel', 'shouldRenderChatLauncher', '/chat/']) {
    assert.ok(
      !DOCK.includes(token),
      `FloatingActionDock.jsx references "${token}". The dock owns the position ` +
      'and nothing else; whatever occupies the bottom slot is the caller’s business.',
    );
  }
  assert.match(DOCK, /bottomSlot/, 'it does still have a slot, so this is not vacuous');
});

test('the launcher decides its own visibility from the path', () => {
  assert.match(LAUNCHER, /shouldRenderChatLauncher\(pathname\)/, 'it asks the shared rule');
  assert.match(LAUNCHER, /return null/, 'and removes itself rather than being removed');
  assert.match(LAUNCHER, /usePathname\(\)/, 'from the real router');
});

// ── The portal ──────────────────────────────────────────────────────────────

test('the panel is portalled out of the dock’s stacking context', () => {
  // The dock is `fixed z-50`, which creates a stacking context. An overlay
  // rendered in place would have its z-[9500] confined inside z-50 and
  // SitePopup's 9000 would paint straight over it, with the source looking
  // entirely correct. Same reason PublicHeaderClient portals its drawer.
  assert.match(LAUNCHER, /createPortal\(/, 'the panel is portalled');
  assert.match(LAUNCHER, /document\.body/, 'to the body, escaping every ancestor context');
  assert.match(LAUNCHER, /mounted &&/, 'and only after mount — react-dom/server cannot render a portal');
});

// ── The modal conventions are SitePopup's ───────────────────────────────────

test('the panel copies SitePopup’s modal conventions rather than inventing a second set', () => {
  const POPUP = src('src/components/notifications/SitePopup.jsx');
  // ESC on `document`, which is SitePopup's target. review-app used `window`.
  assert.match(POPUP, /document\.addEventListener\('keydown'/, 'the convention exists to be copied');
  assert.match(PANEL, /document\.addEventListener\('keydown'/, 'and the panel copies it');
  assert.ok(
    !/window\.addEventListener\('keydown'/.test(PANEL),
    'two modal patterns in one codebase is how one of them ends up subtly wrong',
  );
  // Scroll lock: save the previous value, set, restore.
  assert.match(PANEL, /const prev = document\.body\.style\.overflow/);
  assert.match(PANEL, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(PANEL, /document\.body\.style\.overflow = prev/);
  assert.match(PANEL, /aria-modal="true"/);
});

// ── The colour rewrite actually happened ────────────────────────────────────
// review-app has no dark mode and hardcodes bg-white / text-slate-900 /
// border-slate-200 throughout. Any survivor is a surface that renders
// white-on-white (or black-on-black) in the other theme — invisible in
// whichever theme the author happened to be looking at.
//
// OPAQUE `bg-white` IS FORBIDDEN; `bg-white/<alpha>` IS NOT, and the distinction
// is real rather than a fudge to make this pass. An opaque white is a SURFACE,
// and a surface must come from a token that has a dark value. An alpha white is
// a translucent plate over something already known — here the brand gradient in
// the panel header and on the launcher, which is the same blue in both themes —
// so it is theme-independent by construction. The alpha suffix is precisely
// what says "over a known backdrop", which is why the matcher keys on it.
//
// ── WHAT THIS GUARD NO LONGER CATCHES ───────────────────────────────────────
// Read this before treating a green run here as "the panel is theme-safe".
//
// The exemption is GLOBAL to the guard, not scoped to the two elements that
// earned it. `bg-white/95` used as a genuine light-mode SURFACE — a card, a
// bubble, a dropdown, anywhere with the page behind it rather than the brand
// gradient — now passes in silence, and renders as a near-white card on the
// dark canvas: exactly the defect this test was written to stop.
//
// That bluntness is INHERENT, not a shortcut. The rule that matters is "is
// there a known backdrop behind this element", and a source-text regex cannot
// see what an element sits on: it reads one class string with no DOM, no
// ancestors and no computed background. Distinguishing the two cases would mean
// resolving the render tree, which is a different kind of tool than this file
// is. The alpha suffix is a PROXY for the real rule, and proxies have gaps.
//
// So what this guard now proves is narrow and worth saying exactly: no OPAQUE
// light-mode literal survives in the ported surfaces. It does not prove that
// every translucent one is legitimate. The two that exist today were read and
// judged by eye; a third arriving later gets no such check from here, and the
// only thing that will catch it is someone opening the panel in dark mode —
// which is why it is on the click-test list rather than assumed covered.
const OPAQUE_WHITE = /\bbg-white\b(?!\/)/;
const LIGHT_ONLY_PALETTE = [OPAQUE_WHITE, /\btext-slate-\d/, /\bborder-slate-\d/, /\bbg-slate-\d/];

test('CONTROL: the palette matcher still catches an opaque white surface', () => {
  // Otherwise the alpha exemption could be widened until the check means
  // nothing. It has to reject the defect AND accept the legitimate case.
  assert.equal(OPAQUE_WHITE.test('rounded-2xl bg-white p-4 shadow'), true, 'a white SURFACE is caught');
  assert.equal(OPAQUE_WHITE.test('rounded-full bg-white/90 p-1'), false, 'a translucent plate is not');
  assert.equal(OPAQUE_WHITE.test('bg-white/15 ring-1'), false);
  // …and the real file genuinely contains the allowed form, so the exemption is
  // load-bearing rather than hypothetical.
  assert.match(PANEL, /bg-white\/\d/, 'the panel does layer white over its gradient header');
});

test('review-app’s hardcoded light-mode palette is gone from the ported surfaces', () => {
  const CARDS = src('src/components/chat/ChatCards.jsx');
  for (const [file, code] of [['ChatPanel.jsx', PANEL], ['ChatCards.jsx', CARDS]]) {
    for (const re of LIGHT_ONLY_PALETTE) {
      assert.ok(
        !re.test(code),
        `${file} still ships ${re} — rewrite it against the semantic tokens ` +
        '(--surface / --surface-border / --text-primary…), which carry their own dark values',
      );
    }
    assert.match(code, /var\(--surface\)/, `${file} does use the tokens (so this is not vacuous)`);
  }
});

test('upstream card images stay on raw <img> with the eslint-disable', () => {
  // next/image THROWS on any host absent from next.config.mjs remotePatterns,
  // and the model returns URLs from hosts nobody has enumerated. This is the
  // repo's existing convention for upstream art, not a shortcut.
  //
  // THIS ONE READS THE RAW FILE, and that is the finding rather than a detail:
  // an eslint-disable IS a comment, so the scrubbed source every other test in
  // this file uses has already deleted it. The first draft asserted its presence
  // against scrubbed text and went red on a completely correct file — the mirror
  // image of the defect this repo keeps hitting, where a comment SATISFIES an
  // assertion about code. When the subject under test is itself a comment, do
  // not strip comments.
  const rawCards = readFileSync(path.join(ROOT, 'src/components/chat/ChatCards.jsx'), 'utf8');
  assert.match(rawCards, /eslint-disable-next-line @next\/next\/no-img-element/);
  assert.match(rawCards, /<img\b/, 'and there is a raw img for it to be disabling');
  // The import check DOES use the scrubbed source: a doc block mentioning
  // next/image must not count as importing it.
  const CARDS = src('src/components/chat/ChatCards.jsx');
  assert.ok(!/from 'next\/image'/.test(CARDS), 'and next/image is not imported');
});

test('the panel BRANCHES on the unavailable code rather than showing one banner', () => {
  // The seam a render test cannot reach: ChatErrorNotice is exercised directly
  // in test/render/chatError, but nothing there proves the PANEL uses it, keys
  // the composer off the same state, or that the store skips its apology.
  assert.match(PANEL, /<ChatErrorNotice code=\{errorCode\} message=\{error\} \/>/, 'the panel renders the branching notice');
  assert.match(PANEL, /const unavailable = errorCode === CHAT_UNAVAILABLE_CODE/, 'and derives the branch from the shared constant');
  assert.match(PANEL, /disabled=\{unavailable\}/, 'the composer is disabled — there is nothing to send to');
  assert.match(PANEL, /!isLoading && !unavailable/, 'and Send stays dead too');

  const STORE = src('src/components/chat/useChatStore.js');
  assert.match(
    STORE,
    /if \(e\?\.code !== CHAT_UNAVAILABLE_CODE\)/,
    'the transcript gets no "temporary problem" apology for a service that was never configured',
  );
});

test('both assistant rows render the ONE avatar component, not a copy each', () => {
  // The render tier proves the typing row embeds ChatAvatar's exact output. It
  // cannot prove the MESSAGE row does — AssistantBubble is internal to the
  // panel and needs a message to render. This is that half.
  const CARDS = src('src/components/chat/ChatCards.jsx');
  assert.match(CARDS, /export function ChatAvatar\(/, 'the avatar is defined once, in one place');
  assert.match(CARDS, /<ChatAvatar \/>/, 'and the typing row renders it');
  assert.match(PANEL, /<ChatAvatar \/>/, 'as does the assistant message row');
  assert.match(PANEL, /ChatAvatar,/, 'by import, so there is only one definition');
});

test('the course cover carries no overlay chips', () => {
  // Measured against the live catalogue before removing them: every cover
  // already bakes the level in, and on e-learning covers the chip row collided
  // with the 9Expert logo. A regression guard rather than a preference — the
  // chips are trivial to reintroduce and the collision is only visible by eye.
  const CARDS = src('src/components/chat/ChatCards.jsx');
  const cover = CARDS.slice(CARDS.indexOf('export function CourseCard'), CARDS.indexOf('export function sortPromotions'));
  assert.ok(!/absolute left-3 top-3/.test(cover), 'no absolutely-positioned chip row over the artwork');
  assert.ok(!/difficulty_text/.test(cover), 'the level is not re-stamped over a cover that already shows it');
  // The promotion card's own badge is a DIFFERENT thing and stays.
  assert.match(CARDS, /absolute left-3 top-3 \$\{OVERLAY_BADGE\}/, 'promotion badges are untouched');
});

test('assistant and user text both preserve the line breaks they arrive with', () => {
  // Measured, not assumed: the upstream sends ten lines with two levels of
  // indent, and `white-space: normal` collapsed every one into a paragraph. The
  // structure was being destroyed here, not arriving flat.
  assert.match(PANEL, /whitespace-pre-wrap text-sm leading-6/, 'the assistant bubble preserves them');
  assert.match(PANEL, /<div className="whitespace-pre-wrap">\{message\.text\}<\/div>/, 'and so does the user bubble (Shift+Enter)');
});

test('the bullet swap is applied to the assistant text and NOTHING is rendered as HTML', () => {
  // The line that would turn a glyph substitution into an XSS surface is
  // dangerouslySetInnerHTML. It must never appear in any chat surface, and the
  // absence is asserted rather than assumed — this is the exact boundary the
  // messageText header describes.
  // The swap and the linkifier both live in AssistantText now; the panel renders
  // that one component rather than calling either directly.
  assert.match(PANEL, /<AssistantText text=\{message\.text\} \/>/, 'the panel renders the assistant body component');
  const BODY = src('src/components/chat/AssistantText.jsx');
  assert.match(BODY, /toBulletGlyphs\(text\)/, 'which applies the bullet swap');
  assert.match(BODY, /splitContacts\(toBulletGlyphs\(text\)\)/, 'and then splits the RESULT for links — order matters');
  const CARDS = src('src/components/chat/ChatCards.jsx');
  for (const [file, code] of [['ChatPanel.jsx', PANEL], ['ChatCards.jsx', CARDS], ['ChatLauncher.jsx', LAUNCHER], ['AssistantText.jsx', BODY]]) {
    assert.ok(
      !/dangerouslySetInnerHTML/.test(code),
      `${file} renders upstream content as HTML. Nothing from the model may ever ` +
      'reach the DOM as markup — see the boundary note in src/lib/chat/messageText.js.',
    );
  }
});

test('the store drops the transcript BEFORE rotating the session id', () => {
  // The one line whose ORDER is the guarantee. Once rotateSessionId() has run
  // the old id is gone and nothing knows which sessionStorage key to remove, so
  // the conversation the user pressed ล้างแชท to destroy stays readable. Both
  // orders leave the panel empty, so nothing on screen can tell them apart.
  const STORE = src('src/components/chat/useChatStore.js');
  const dropAt = STORE.indexOf('dropTranscript(state.sessionId)');
  const rotateAt = STORE.indexOf("dispatch({ type: 'RESET', sessionId: rotateSessionId() })");
  assert.ok(dropAt !== -1, 'the old transcript is dropped');
  assert.ok(rotateAt !== -1, 'and the id is rotated');
  assert.ok(dropAt < rotateAt, 'drop must come FIRST, while the old id is still known');
  // …and the restore side is wired, or persistence would be write-only.
  assert.match(STORE, /readTranscript\(sessionId\)/, 'init restores what the tab still holds');
  assert.match(STORE, /writeTranscript\(state\.sessionId, state\.messages\)/, 'and changes are persisted');
});

// ── The agent's mark ────────────────────────────────────────────────────────

test('every chat surface reads the shared mark constant, never a path literal', () => {
  // Four surfaces draw it: the launcher's icon well, the panel header's plate,
  // the welcome hero, and ChatAvatar. As literals that is one path written four
  // times that must agree, and the next swap means finding all four.
  const CARDS = src('src/components/chat/ChatCards.jsx');
  for (const [file, code] of [['ChatCards.jsx', CARDS], ['ChatPanel.jsx', PANEL], ['ChatLauncher.jsx', LAUNCHER]]) {
    assert.ok(
      !/\/logo\//.test(code),
      `${file} contains a raw asset path. Import CHAT_MARK_SRC from ` +
      '@/lib/chat/branding instead — see the note there.',
    );
    assert.match(code, /CHAT_MARK_SRC/, `${file} does draw the mark (so this is not vacuous)`);
  }
});

test('the mark file exists on disk with EXACTLY the case the constant uses', () => {
  // THE HAZARD THIS EXISTS FOR: development is on Windows (case-insensitive
  // filesystem), the build is Linux (case-sensitive). `AI-Chatbot.png` referenced
  // as `ai-chatbot.png` renders perfectly on a dev machine and 404s in
  // production, and nothing in this suite loads an image so no other test would
  // notice.
  //
  // readdirSync is what makes this work: it returns the real directory entries
  // and the comparison is a STRING compare, which is case-sensitive even on
  // Windows. `existsSync` would NOT catch it — it resolves through the
  // filesystem and would happily accept the wrong case here.
  const rel = CHAT_MARK_SRC.replace(/^\//, '');
  const dir = path.posix.dirname(rel);
  const base = path.posix.basename(rel);
  const entries = readdirSync(path.join(ROOT, 'public', ...dir.split('/')));
  assert.ok(
    entries.includes(base),
    `public/${rel} is not in the directory listing. Present: ${entries.join(', ')}. ` +
    'A case-only mismatch is invisible on Windows and fatal on the Linux build.',
  );
  // …and the control: the same check rejects a case variant, so it is really
  // comparing strings rather than asking the filesystem.
  assert.ok(!entries.includes(base.toUpperCase()), 'the matcher is case-sensitive');
});

test('the SITE mark is untouched — the agent has its own face, the org keeps its logo', () => {
  // The swap is chat-only. These two are claims about the ORGANISATION and must
  // keep pointing at the 9Expert mark: a favicon and an Organization JSON-LD
  // logo showing a chatbot would be wrong in Google's brand panel.
  assert.match(LAYOUT, /icon: '\/logo\/9exp-stand\.png'/, 'favicon unchanged');
  assert.match(LAYOUT, /apple: '\/logo\/9exp-stand\.png'/, 'apple-touch icon unchanged');
  const HOME = src('src/app/page.jsx');
  assert.match(HOME, /logo: `\$\{siteConfig\.url\}\/logo\/9exp-stand\.png`/, 'JSON-LD logo unchanged');
  assert.notEqual(CHAT_MARK_SRC, '/logo/9exp-stand.png', 'and the two marks really are different files');
});
