// src/lib/chat/chatState.js
//
// The chat's state machine, with no React in it.
//
// Split out of the store so the two claims that actually matter — a reset
// really starts a NEW conversation, and history really is bounded — can be
// tested by calling a function, rather than by driving a hook. The store below
// it is then a `useReducer` and nothing else.

import { MAX_HISTORY_TURNS } from '@/lib/chat/limits';

export const initialChatState = {
  sessionId: '',
  messages: [],
  isLoading: false,
  error: '',
  // The route's machine code alongside its prose. The panel needs BOTH: the
  // prose is what the user reads, the code is what decides whether this is a
  // fault at all. See ChatErrorNotice in ChatPanel.jsx.
  errorCode: '',
};

const safeArr = (x) => (Array.isArray(x) ? x : []);

/**
 * Message ids. Not crypto — they only have to be unique within one open panel,
 * and they key React lists and the transcript. They are LOCAL: the backend's
 * own id for an assistant row travels separately as `serverMessageId`.
 */
export function nextMessageId(seed = Math.random()) {
  return `m_${Date.now().toString(36)}_${seed.toString(16).slice(2, 10)}`;
}

/**
 * The two ratings a thumb can express. There is no "cleared" rating — the
 * backend upserts one feedback row per message and offers no delete, so the
 * widget offers no un-thumb either; `null` only ever means "not rated yet".
 */
export const RATINGS = Object.freeze(['up', 'down']);

/** `'up' | 'down'` as given, anything else → null. Shared by the reducer and the transcript reader. */
export function normalizeRating(value) {
  return RATINGS.includes(value) ? value : null;
}

/**
 * The backend's id for the assistant row, or null.
 *
 * Accepted ONLY as a non-empty string of at most 100 characters — the
 * feedback proxy caps `messageId` at 100 and silently truncates, so a longer
 * value would be forwarded as a different id than the one the backend issued.
 * `null` is what upstream sends when it stored no assistant row, and it is
 * what every other shape (number, object, '') becomes.
 */
export const SERVER_MESSAGE_ID_MAX = 100;
export function normalizeServerMessageId(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s !== '' && s.length <= SERVER_MESSAGE_ID_MAX ? s : null;
}

/**
 * The trailing turns that travel with a message as context.
 *
 * Bounded HERE as well as in the route, from the same constant, because an
 * unbounded history grows every turn and is the cheapest way to make a chat get
 * slower and more expensive the longer it goes on.
 */
export function toHistory(messages, limit = MAX_HISTORY_TURNS) {
  return safeArr(messages)
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.text }));
}

export function chatReducer(state, action) {
  switch (action.type) {
    case 'INIT':
      // `messages` is OPTIONAL. When a persisted transcript is restored it
      // arrives here; when there is nothing stored the caller omits it and the
      // current messages are kept, so INIT never silently empties a live panel.
      return {
        ...state,
        sessionId: action.sessionId,
        messages: Array.isArray(action.messages) ? action.messages : state.messages,
      };

    case 'USER':
      return {
        ...state,
        error: '',
        messages: [
          ...state.messages,
          { id: action.id, role: 'user', text: action.text, createdAt: action.createdAt },
        ],
      };

    case 'ASSISTANT':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.id,
            role: 'assistant',
            text: action.text,
            createdAt: action.createdAt,
            quickReplies: safeArr(action.quickReplies),
            courses: safeArr(action.courses),
            promotions: safeArr(action.promotions),
            // The backend's id for this row, or null when it stored none (the
            // apology bubble, an older upstream). The thumbs render only when
            // it is present: a rating with no server id has nothing to attach
            // to. Normalised here as well as in chatClient so a dispatcher
            // cannot smuggle a number or a 200-char string into the transcript.
            serverMessageId: normalizeServerMessageId(action.serverMessageId),
            rating: null,
          },
        ],
      };

    case 'RATE': {
      // Optimistic and idempotent: the thumb lights up before the network
      // answers, the same thumb twice is a no-op that returns the SAME state
      // object (so nothing re-renders and nothing re-sends), the other thumb
      // replaces the rating (the backend upserts one row per message), and an
      // id this transcript does not hold changes nothing.
      const rating = normalizeRating(action.rating);
      if (!rating) return state;
      const idx = state.messages.findIndex((m) => m.id === action.id && m.role === 'assistant');
      if (idx === -1 || state.messages[idx].rating === rating) return state;
      const messages = state.messages.slice();
      messages[idx] = { ...messages[idx], rating };
      return { ...state, messages };
    }

    case 'LOADING':
      return { ...state, isLoading: action.value };

    case 'ERROR':
      return { ...state, error: action.error || '', errorCode: action.code || '' };

    case 'RESET':
      // THE SESSION ID COMES FROM THE ACTION, NEVER FROM `state`.
      //
      // review-app wrote `{...initialState, sessionId: state.sessionId}`, which
      // is what made "ล้างแชท" clear the screen while the upstream service kept
      // the whole prior conversation — the next answer could refer to what the
      // user had just cleared. Reading it from the action is what forces the
      // dispatcher to have rotated it (see rotateSessionId), and is why this
      // case can be tested without touching storage.
      return { ...initialChatState, sessionId: action.sessionId };

    default:
      return state;
  }
}
