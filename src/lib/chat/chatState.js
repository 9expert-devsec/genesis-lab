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
 * and they key React lists and the thumbs-rating map.
 */
export function nextMessageId(seed = Math.random()) {
  return `m_${Date.now().toString(36)}_${seed.toString(16).slice(2, 10)}`;
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
          },
        ],
      };

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
