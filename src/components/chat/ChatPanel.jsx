'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Send as SendIcon, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { sendChatFeedback } from '@/lib/chat/chatClient';
import { AssistantText } from '@/components/chat/AssistantText';
import { CHAT_MARK_SRC } from '@/lib/chat/branding';
import {
  CHAT_UNAVAILABLE_CODE,
  MAX_MESSAGE_CHARS,
  isMessageWithinCap,
  messageOverflow,
} from '@/lib/chat/limits';
import {
  ChatAvatar,
  CourseCarousel,
  PromotionCarousel,
  QuickChatBar,
  TypingBubble,
  WelcomeScreen,
  cx,
  formatTimeHM,
  sortPromotions,
} from '@/components/chat/ChatCards';

/**
 * The chat overlay.
 *
 * ── STACKING ────────────────────────────────────────────────────────────────
 * z-[9500]: above SitePopup (9000) so a promo image cannot cover a conversation
 * the user opened deliberately, below the mobile drawer (9998/9999) so the
 * primary navigation always wins. See the ladder in tailwind.config.js.
 *
 * THE PANEL IS PORTALLED TO <body> BY ChatLauncher, and it has to be. The
 * launcher lives inside FloatingActionDock, which is `fixed z-50` and therefore
 * a stacking context — rendering the overlay in place would trap z-[9500]
 * INSIDE z-50, and SitePopup's 9000 would paint straight over it while the
 * source looked completely correct. Same reason PublicHeaderClient portals its
 * drawer.
 *
 * ── CONVENTIONS COPIED, NOT REINVENTED ──────────────────────────────────────
 * The scroll lock and the ESC handler are SitePopup's, down to the listener
 * target: `document`, not `window`. review-app used `window`. Two modal
 * patterns in one codebase is how one of them ends up subtly wrong.
 */
export function ChatPanel({ onClose, store }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [input, setInput] = useState('');
  const [rated, setRated] = useState({});
  const listRef = useRef(null);

  // THE STORE IS A PROP, NOT A HOOK CALL HERE, AND THAT IS THE WHOLE POINT.
  //
  // It used to be `useChatStore()` in this component. This component is
  // mounted only while the panel is open, so closing it unmounted the reducer
  // and threw the transcript away — while the sessionId survived in
  // localStorage, so reopening gave a blank panel still wired to the upstream
  // conversation. Exactly the defect shape as review-app's reset(), reached
  // from the other direction.
  //
  // The store now lives in ChatLauncher, which stays mounted for the page's
  // lifetime. Closing is HIDING. Nothing is lost, so nothing needs confirming.
  const { init, send, reset, messages, isLoading, error, errorCode, lastAssistant, sessionId } =
    store;

  // Not a fault: the service was never configured, so there is nothing to retry
  // and nothing to type into.
  const unavailable = errorCode === CHAT_UNAVAILABLE_CODE;

  // ล้างแชท is now the ONLY destructive control in this panel, so it is the one
  // that confirms. X is a hide (the store outlives the panel), so it does not.
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  // Stick to the newest message. Assignment, not scrollIntoView({smooth}) —
  // instant is correct here and needs no reduced-motion branch.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, isFullscreen]);

  // Body-scroll lock — SitePopup's shape: save, set, restore.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC on DOCUMENT (SitePopup's target). Fullscreen first, then close — one
  // key with two meanings, so the user never loses the conversation to a
  // keypress that was meant to shrink the window.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      // Escape is "back out of the innermost thing". An armed confirmation is
      // the innermost thing, so it disarms first — otherwise a user who armed
      // it by accident has to either click elsewhere or close the whole panel.
      if (confirmingClear) setConfirmingClear(false);
      else if (isFullscreen) setIsFullscreen(false);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmingClear, isFullscreen, onClose]);

  const quickReplies = useMemo(
    () => (Array.isArray(lastAssistant?.quickReplies) ? lastAssistant.quickReplies : []),
    [lastAssistant],
  );

  const overflow = messageOverflow(input);
  const canSend =
    !isLoading && !unavailable && input.trim().length > 0 && isMessageWithinCap(input);

  const onSend = useCallback(
    async (text) => {
      const t = String(text || '').trim();
      // The cap is checked here as well as in the route: the composer must not
      // let a user type 5,000 characters and only learn it was too long after a
      // round trip. Same constant, one definition — src/lib/chat/limits.js.
      if (!t || isLoading || !isMessageWithinCap(t)) return;
      setInput('');
      await send(t);
    },
    [isLoading, send],
  );

  const onRate = useCallback(
    async (msgId, value) => {
      if (!msgId || rated[msgId]) return;
      setRated((prev) => ({ ...prev, [msgId]: value }));

      const idx = messages.findIndex((m) => m.id === msgId);
      let userText = '';
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (messages[i]?.role === 'user') {
          userText = messages[i]?.text || '';
          break;
        }
      }

      await sendChatFeedback({
        rating: value,
        messageId: msgId,
        sessionId,
        userText,
        assistantText: messages[idx]?.text || '',
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        createdAt: Date.now(),
      });
    },
    [messages, rated, sessionId],
  );

  const windowClass = isFullscreen
    ? 'left-1/2 top-1/2 h-screen w-screen -translate-x-1/2 -translate-y-1/2 sm:h-[92vh] sm:max-h-[900px] sm:w-[92vw] sm:max-w-[1200px]'
    : 'inset-0 h-auto w-auto sm:bottom-24 sm:left-auto sm:right-5 sm:top-auto sm:h-[85vh] sm:max-h-[85vh] sm:w-[70vw] sm:max-w-[720px]';

  return (
    <div data-chat-overlay="" className="fixed inset-0 z-[9500]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="แชทกับ 9Expert AI Agent"
        className={cx(
          'absolute flex flex-col overflow-hidden bg-[var(--surface)] shadow-9e-lg ring-1 ring-[var(--surface-border)] sm:rounded-2xl',
          'transition-all duration-9e-reveal ease-9e',
          windowClass,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-9e-gradient-hero px-4 py-3 text-white">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={CHAT_MARK_SRC}
              alt=""
              className="h-10 w-10 rounded-full bg-white/90 object-contain p-1 ring-1 ring-white/20"
            />
            <div>
              <div className="text-sm font-semibold">9Expert AI Agent</div>
              <div className="text-xs text-white/80">ถามเรื่องคอร์ส/โปรโมชันได้เลย</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ClearChatButton
              onConfirm={() => {
                setConfirmingClear(false);
                reset();
              }}
              confirming={confirmingClear}
              onArm={() => setConfirmingClear(true)}
              onCancel={() => setConfirmingClear(false)}
            />

            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              aria-label={isFullscreen ? 'ออกจากโหมดเต็มจอ' : 'ขยายเต็มจอ'}
              className="hidden rounded-lg bg-white/15 p-2 text-white/90 ring-1 ring-white/20 transition-colors duration-9e-micro hover:bg-white/25 md:inline-flex"
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsFullscreen(false);
                onClose();
              }}
              aria-label="ปิดแชท"
              className="rounded-lg bg-white/15 p-2 text-white/90 ring-1 ring-white/20 transition-colors duration-9e-micro hover:bg-white/25"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto bg-[var(--page-bg-muted)] px-4 py-4"
          >
            {messages.length === 0 ? (
              <WelcomeScreen onPick={onSend} />
            ) : (
              <div className="space-y-4">
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <UserBubble key={m.id} message={m} />
                  ) : (
                    <AssistantBubble
                      key={m.id}
                      message={m}
                      rating={rated[m.id]}
                      onRate={onRate}
                    />
                  ),
                )}

                {isLoading ? <TypingBubble /> : null}

                {error ? <ChatErrorNotice code={errorCode} message={error} /> : null}
              </div>
            )}
          </div>

          {quickReplies.length > 0 && !isLoading ? (
            <div className="border-t border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2">
              <QuickChatBar items={quickReplies} onPick={onSend} />
            </div>
          ) : null}

          {/* Composer */}
          <div className="border-t border-[var(--surface-border)] bg-[var(--surface)] p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSend(input);
              }}
              className="flex gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSend(input);
                  }
                }}
                placeholder="พิมพ์คำถามของคุณ…"
                rows={1}
                disabled={unavailable}
                aria-label="ข้อความของคุณ"
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] px-4 py-[10px] text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-9e-brand"
              />

              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-9e-gradient-hero px-4 text-sm font-semibold text-white shadow-9e-sm transition-opacity duration-9e-micro disabled:opacity-50"
              >
                <SendIcon className="h-4 w-4" />
                <span className="hidden sm:inline">ส่ง</span>
              </button>
            </form>

            <div className="mt-2 text-center text-[11px] text-[var(--text-muted)]">
              {overflow > 0 ? (
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  ข้อความยาวเกิน {MAX_MESSAGE_CHARS} ตัวอักษร (เกินอยู่ {overflow})
                </span>
              ) : (
                <>
                  กด <Key>Enter</Key> เพื่อส่ง หรือ <Key>Shift + Enter</Key> เพื่อขึ้นบรรทัดใหม่
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The one place a route error code changes the SHAPE of what the user sees.
 *
 * Two presentations, five codes — see CHAT_UNAVAILABLE_CODE in
 * src/lib/chat/limits.js for why that is the right number. A fault gets the red
 * treatment and the route's own prose; an unconfigured service gets a neutral
 * notice, because nothing went wrong and a red box would be a lie about the
 * deployment. Exported so both branches can be rendered directly: the panel
 * only reaches this state through a failed fetch, which no render test can
 * cause.
 */
export function ChatErrorNotice({ code, message }) {
  const calm = code === CHAT_UNAVAILABLE_CODE;
  return (
    <div
      role="status"
      data-chat-error={code || 'unknown'}
      className={
        calm
          ? 'rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-secondary)]'
          : 'rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300'
      }
    >
      {message}
    </div>
  );
}

/**
 * ล้างแชท, with an inline confirm.
 *
 * ── WHY THIS CONTROL AND NOT THE CLOSE BUTTON ───────────────────────────────
 * Clearing rotates the session id, which abandons the conversation upstream as
 * well as on screen. That is genuinely irreversible and it was one unguarded
 * click. Closing, since the store moved to ChatLauncher, destroys nothing.
 * So the confirmation belongs here and nowhere else: a prompt on the common
 * action teaches people to dismiss prompts, and the one time it matters they
 * dismiss that one too.
 *
 * ── INLINE, NOT A MODAL ─────────────────────────────────────────────────────
 * The panel is already a modal with a scroll lock. A dialog over a dialog means
 * two ESC targets, two focus traps and a second thing to dismiss. The button
 * becomes its own question instead: one tap to arm, one to confirm, and it
 * disarms on ESC or on blur.
 */
function ClearChatButton({ confirming, onArm, onConfirm, onCancel }) {
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onArm}
        data-clear-chat="idle"
        className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 transition-colors duration-9e-micro hover:bg-white/25"
      >
        ล้างแชท
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onConfirm}
        onBlur={onCancel}
        autoFocus
        data-clear-chat="armed"
        className="rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-9e-action ring-1 ring-white/40 transition-colors duration-9e-micro hover:bg-white/80"
      >
        ยืนยันล้างแชท
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="ยกเลิกการล้างแชท"
        className="rounded-lg bg-white/15 px-2 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 transition-colors duration-9e-micro hover:bg-white/25"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function Key({ children }) {
  return (
    <span className="rounded bg-[var(--surface-muted)] px-1 py-0.5 ring-1 ring-[var(--surface-border)]">
      {children}
    </span>
  );
}

function UserBubble({ message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl bg-9e-gradient-hero px-4 py-3 text-sm leading-6 text-white shadow-9e-sm">
        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-white/80">
          <span className="font-semibold">คุณ</span>
          <span>{formatTimeHM(message.createdAt)}</span>
        </div>
        {/* Same treatment, for the same reason: Shift+Enter puts real newlines
            in the user's own message and `normal` collapsed those too. No glyph
            substitution here — the user's asterisks are the user's. */}
        <div className="whitespace-pre-wrap">{message.text}</div>
      </div>
    </div>
  );
}

function AssistantBubble({ message, rating, onRate }) {
  const courses = Array.isArray(message.courses) ? message.courses : [];
  const promotions = sortPromotions(message.promotions);

  return (
    <div className="flex items-start gap-2">
      <ChatAvatar />

      <div className="min-w-0 flex-1">
        <div className="rounded-2xl bg-[var(--surface)] p-4 shadow-9e-sm ring-1 ring-[var(--surface-border)]">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-secondary)]">9Expert AI Agent</span>
            <span>{formatTimeHM(message.createdAt)}</span>
          </div>

          {message.text ? (
            // `whitespace-pre-wrap` is load-bearing, not cosmetic. Measured on a
            // real reply: the upstream sends 10 LINES with two levels of indent,
            // and the default `white-space: normal` collapsed every one of them
            // into a single dense paragraph. We were destroying the structure,
            // not receiving it flat.
            //
            // toBulletGlyphs only swaps a leading `*` for `•` — see the boundary
            // note in src/lib/chat/messageText.js. It is NOT markdown rendering
            // and this is still a plain string that React escapes.
            <div className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">
              <AssistantText text={message.text} />
            </div>
          ) : null}

          {promotions.length > 0 ? (
            <div className="mt-3">
              <div className="text-xs font-semibold text-[var(--text-muted)]">โปรโมชัน</div>
              <PromotionCarousel items={promotions} />
            </div>
          ) : null}

          {courses.length > 0 ? (
            <div className="mt-3">
              <div className="text-xs font-semibold text-[var(--text-muted)]">คอร์สแนะนำ</div>
              <CourseCarousel items={courses} />
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-2">
            <RateButton
              active={rating === 'up'}
              disabled={!!rating}
              onClick={() => onRate(message.id, 'up')}
              label="ดี"
              title="มีประโยชน์"
              activeClass="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
              Icon={ThumbsUp}
            />
            <RateButton
              active={rating === 'down'}
              disabled={!!rating}
              onClick={() => onRate(message.id, 'down')}
              label="ปรับปรุง"
              title="ต้องปรับปรุง"
              activeClass="border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300"
              Icon={ThumbsDown}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function RateButton({ active, disabled, onClick, label, title, activeClass, Icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors duration-9e-micro',
        active
          ? activeClass
          : 'border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
        disabled ? 'opacity-90' : '',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
