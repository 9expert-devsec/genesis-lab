/**
 * The Masterclass level label — the ONE mapping the /masterclass listing card
 * renders (`level` enum → display word), lifted out of MasterclassCard.jsx so
 * the chat-card endpoint (src/lib/corpus/masterclassCards.js) says the same
 * word the card does. An unknown level falls back to the raw value, exactly
 * as the card did.
 */
export const MASTERCLASS_LEVEL_LABEL = Object.freeze({
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
});

/** @param {string|null|undefined} level  the course's `level` enum value */
export function masterclassLevelLabel(level) {
  return MASTERCLASS_LEVEL_LABEL[level] ?? level;
}
