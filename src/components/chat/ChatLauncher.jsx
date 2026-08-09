'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { shouldRenderChatLauncher } from '@/lib/floatingDock';
import { CHAT_MARK_SRC } from '@/lib/chat/branding';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useChatStore } from '@/components/chat/useChatStore';

/**
 * The label the button reveals, and the name a screen reader announces.
 *
 * THEY ARE DIFFERENT LANGUAGES ON PURPOSE — do not "fix" this into agreement.
 * The visible "Chat AI" is a recognised product name and reads as a brand mark
 * at 12px in a capsule; the accessible name is a full Thai sentence because a
 * screen-reader user gets no capsule, no gradient and no logo, only the string,
 * and "Chat AI" alone does not say what the control does. `aria-label`
 * overrides the visible text for assistive tech, which is exactly the intent
 * here rather than an accident.
 */
const LAUNCHER_VISIBLE_LABEL = 'Chat AI';
const LAUNCHER_ARIA_LABEL = 'เปิดแชทกับ AI Agent';

/**
 * The collapsed launcher: a 44px circle that grows leftward into a capsule.
 *
 * ── HOW THE EXPANSION WORKS, AND WHY NOT THE OBVIOUS WAYS ───────────────────
 * `max-width` from 0 to a fixed value, plus an opacity fade, on `group-hover`
 * AND `group-focus-visible`.
 *
 *   · NOT `width: auto` — auto is not an animatable value; the transition is
 *     simply ignored and the label snaps.
 *   · NOT an absolutely-positioned tooltip — the button itself has to change
 *     shape. A tooltip would also escape the dock's flex box and stop being
 *     laid out by it.
 *   · `group-focus-visible` is not optional. Hover alone leaves the label
 *     permanently unreachable by keyboard, and the label is the only thing that
 *     says what the circle does.
 *
 * `items-end` on the dock is what makes the growth harmless: the capsule
 * extends to the LEFT into empty page, pushing nothing.
 *
 * On touch there is no hover and no focus-visible, so it simply stays a circle.
 * That is the intended mobile affordance, not a degradation — the aria-label
 * and the logo carry it.
 *
 * ── 44px ────────────────────────────────────────────────────────────────────
 * h-11 (44px) tall, and 44px wide collapsed: p-1 (4px) + a 36px icon + p-1.
 * That clears the 44px minimum tap target, and ScrollToTopButton was raised to
 * match so the two circles in the dock are the same size.
 */
export function ChatLauncherButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={LAUNCHER_ARIA_LABEL}
      data-chat-launcher=""
      className="group flex h-11 items-center rounded-full bg-9e-gradient-hero p-1 text-white shadow-9e-lg ring-1 ring-white/25 transition-shadow duration-9e-micro ease-9e hover:shadow-9e-md"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={CHAT_MARK_SRC} alt="" className="h-6 w-6 object-contain" />
      </span>

      {/*
        The collapsing element. `max-w-0` + `overflow-hidden` + `opacity-0` is
        the collapsed state; the group variants open it. The inner span carries
        the padding so that padding is clipped too — put it on the outer span and
        the "collapsed" button is 16px wider than the circle it is meant to be.
      */}
      <span
        data-chat-launcher-label=""
        className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-9e-reveal ease-9e group-hover:max-w-[7rem] group-hover:opacity-100 group-focus-visible:max-w-[7rem] group-focus-visible:opacity-100"
      >
        <span className="block px-2 text-sm font-semibold">{LAUNCHER_VISIBLE_LABEL}</span>
      </span>
    </button>
  );
}

/**
 * The launcher, gated and stateful.
 *
 * It decides its OWN visibility from the pathname — FloatingActionDock is a
 * layout primitive and never learns that a chat feature exists, and the root
 * layout owns only the env gate. Three separate questions, three owners:
 *
 *   root layout  — is chat configured at all?     (server, reads env)
 *   this file    — is chat appropriate HERE?      (client, reads pathname)
 *   the dock     — where does the bottom slot sit? (neither)
 *
 * The panel is PORTALLED to <body>. It must be: the dock is `fixed z-50`, which
 * creates a stacking context, so an overlay rendered in place would have its
 * z-[9500] confined inside z-50 and SitePopup (9000) would paint over it. Same
 * reason PublicHeaderClient portals its drawer. `mounted` gates the portal
 * because react-dom/server cannot render one.
 */
export function ChatLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // THE STORE LIVES HERE, AND IT IS CALLED ABOVE THE EARLY RETURN BELOW.
  //
  // This component stays mounted for the whole page, so the transcript
  // survives closing the panel — that is the fix. But the placement of this
  // line is load-bearing twice over:
  //
  //   1. Rules of hooks. Every hook must run on every render, so it cannot
  //      move below `if (!shouldRenderChatLauncher(...)) return null`.
  //   2. THE SAME BUG THROUGH A DIFFERENT DOOR. If the early return came
  //      first, the store would unmount on every route where the launcher is
  //      hidden. A user mid-conversation who walks into /registration to check
  //      a price loses the transcript on the way in — and the launcher's
  //      absence there means they cannot even see that it happened.
  //
  // React enforces (1) with a warning. NOTHING enforces (2), which is why
  // test/render/chatTranscript covers walking to a hidden route and back.
  const store = useChatStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!shouldRenderChatLauncher(pathname)) return null;

  return (
    <>
      <ChatLauncherButton onClick={() => setOpen(true)} />
      {/* DO NOT RENDER THE PANEL IN PLACE. This portal is load-bearing and the
          reason is invisible in both files.

          This launcher lives inside FloatingActionDock, whose container is
          `fixed … z-50`. `position: fixed` ALWAYS creates a stacking context,
          and a z-index inside one is resolved against its siblings, never
          against the document. So a panel rendered here would have its
          z-[9500] confined beneath the dock's own 50, and SitePopup — a
          z-[9000] sibling of the dock, not a descendant — would paint straight
          over an open conversation.

          Nothing catches that. The source reads correctly (9500 > 9000), the
          class compiles, every test that inspects the token passes, and jsdom
          computes no stacking. The only symptom is a promo image on top of the
          chat, in a browser, on whichever page happens to fire a popup.

          Portalling to <body> lifts the overlay out of every ancestor context,
          which is the same reason PublicHeaderClient portals its drawer. */}
      {mounted && open
        ? createPortal(<ChatPanel onClose={() => setOpen(false)} store={store} />, document.body)
        : null}
    </>
  );
}
