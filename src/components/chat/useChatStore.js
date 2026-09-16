'use client';

import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { getOrCreateSessionId, rotateSessionId } from '@/lib/chat/session';
import { sendChat, sendChatFeedback } from '@/lib/chat/chatClient';
import { chatReducer, initialChatState, nextMessageId, toHistory } from '@/lib/chat/chatState';
import { CHAT_UNAVAILABLE_CODE } from '@/lib/chat/limits';
import { dropTranscript, readTranscript, writeTranscript } from '@/lib/chat/transcriptStore';

/**
 * The chat's React binding. Everything decidable without React lives in
 * src/lib/chat/chatState.js; this file is the hook and the network call.
 */
export function useChatStore() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  const init = useCallback(() => {
    const sessionId = getOrCreateSessionId();
    // Restore whatever this tab still holds for this conversation. Keyed by the
    // session id, so the local transcript and the upstream context cannot end
    // up describing two different conversations.
    dispatch({ type: 'INIT', sessionId, messages: readTranscript(sessionId) });
  }, []);

  // Persist on every change. Cheap, and it means no code path has to remember
  // to save — including the error paths, which are exactly the ones a manual
  // save would miss.
  useEffect(() => {
    if (!state.sessionId) return;
    writeTranscript(state.sessionId, state.messages);
  }, [state.sessionId, state.messages]);

  /**
   * Clear the conversation AND abandon it upstream.
   *
   * rotateSessionId() is the whole point: without it the panel goes blank while
   * the service keeps the prior context, and the next answer refers to what the
   * user just cleared. The new id is passed INTO the action — chatReducer reads
   * it from there and never from state, so this cannot silently regress.
   */
  const reset = useCallback(() => {
    // DROP BEFORE ROTATE, and the order is the whole reason this line exists.
    // After rotation the old id is gone and nothing knows which key to remove,
    // so the conversation the user just asked to clear would sit in
    // sessionStorage where devtools can read it. Not a leak of consequence — a
    // promise we made and did not keep.
    dropTranscript(state.sessionId);
    dispatch({ type: 'RESET', sessionId: rotateSessionId() });
  }, [state.sessionId]);

  const send = useCallback(
    async (text) => {
      const msg = String(text || '').trim();
      if (!msg) return;

      const sessionId = state.sessionId || getOrCreateSessionId();
      if (!state.sessionId) dispatch({ type: 'INIT', sessionId });

      dispatch({ type: 'USER', id: nextMessageId(), text: msg, createdAt: Date.now() });
      dispatch({ type: 'LOADING', value: true });
      dispatch({ type: 'ERROR', error: '' });

      try {
        const nextMessages = [...state.messages, { role: 'user', text: msg }];
        const result = await sendChat({
          sessionId,
          message: msg,
          history: toHistory(nextMessages),
        });

        dispatch({
          type: 'ASSISTANT',
          id: nextMessageId(),
          createdAt: Date.now(),
          text: result.reply || '',
          quickReplies: result.quickReplies,
          courses: result.courses,
          promotions: result.promotions,
          masterclasses: result.masterclasses,
          serverMessageId: result.serverMessageId,
        });
      } catch (e) {
        dispatch({ type: 'ERROR', error: e?.message || 'เกิดข้อผิดพลาด', code: e?.code });

        // The apology bubble is for FAULTS only. Its text promises the problem
        // is temporary ("ชั่วคราว"), which is true of a timeout or a dropped
        // connection and false of a service that was never configured — there,
        // an assistant apologising in a transcript would be theatre, and the
        // calm notice says the real thing once instead.
        if (e?.code !== CHAT_UNAVAILABLE_CODE) {
          dispatch({
            type: 'ASSISTANT',
            id: nextMessageId(),
            createdAt: Date.now(),
            text: 'ขออภัย ระบบแชตมีปัญหาชั่วคราว ลองใหม่อีกครั้งได้ไหมครับ',
            quickReplies: [],
            courses: [],
            promotions: [],
            masterclasses: [],
            // Nothing was stored upstream, so there is nothing to rate: no id,
            // and therefore no thumbs on the apology.
            serverMessageId: null,
          });
        }
      } finally {
        dispatch({ type: 'LOADING', value: false });
      }
    },
    [state.messages, state.sessionId],
  );

  /**
   * Thumb an assistant message. OPTIMISTIC and FIRE-AND-FORGET: the reducer
   * lights the thumb first, then the rating is posted and its answer ignored
   * (the route guarantees a 200 whatever happens upstream, and a rating is a
   * courtesy the user does us — never a red error under a good answer).
   *
   * Guarded on `serverMessageId`: a message the backend did not store has no
   * row to rate, so the panel does not show its thumbs and this refuses
   * anyway. The same thumb twice is a no-op here AND in the reducer (which
   * returns the same state object), so nothing re-sends; the other thumb
   * replaces the rating and posts again — the backend upserts one row per
   * message, so the second post overwrites the first.
   *
   * `messageId` on the wire is the SERVER id. `userText`, `assistantText`
   * and `pageUrl` still travel because the old feedback service reads them
   * until FEEDBACK_API_URL is switched to the backend's own endpoint.
   */
  const rate = useCallback(
    (msgId, value) => {
      const idx = state.messages.findIndex((m) => m.id === msgId);
      const msg = idx === -1 ? null : state.messages[idx];
      if (!msg || msg.role !== 'assistant' || !msg.serverMessageId) return;
      if (value !== 'up' && value !== 'down') return;
      if (msg.rating === value) return;

      dispatch({ type: 'RATE', id: msgId, rating: value });

      let userText = '';
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (state.messages[i]?.role === 'user') {
          userText = state.messages[i]?.text || '';
          break;
        }
      }
      void sendChatFeedback({
        rating: value,
        messageId: msg.serverMessageId,
        sessionId: state.sessionId,
        userText,
        assistantText: msg.text || '',
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        createdAt: Date.now(),
      });
    },
    [state.messages, state.sessionId],
  );

  const lastAssistant = useMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      if (state.messages[i].role === 'assistant') return state.messages[i];
    }
    return null;
  }, [state.messages]);

  return { ...state, init, send, reset, rate, lastAssistant };
}
