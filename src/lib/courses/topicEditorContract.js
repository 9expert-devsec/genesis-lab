import { MAX_TOPIC_DEPTH } from '@/lib/courses/topicHtml';
import { ALLOWED_TOPIC_TAGS } from '@/lib/courses/sanitizeTopicHtml';

/**
 * WHAT THE SECTION-7 EDITOR MAY PRODUCE — declared as data, verified by test.
 *
 * ══ WHY THIS IS DECLARED HERE AND NOT READ OFF THE EXTENSION LIST ══════════
 *
 * The pattern is borrowed from lib/pageBuilder/richTextContract.js, and so is
 * the direction of the check: the question is "can the editor emit something
 * the SANITISER drops", not "can the sanitiser handle what the editor emits".
 * That direction is the one that breaks silently — an admin formats a bullet,
 * sees it in the editor, saves, and the page shows something else.
 *
 * ── AND THE HONEST NOTE ABOUT ITS SOURCE ───────────────────────────────────
 * pageBuilder's header states its schema "is checked against the contract"
 * via `getSchema`. MEASURED: nothing in the repo calls `getSchema` and no test
 * imports `richTextContract` — that verification is a comment, not a test. The
 * shape was worth copying; the enforcement had to be built. It is built here,
 * in test/pure/topicEditorContract.test.mjs, and it runs.
 *
 * ══ THE TWO SETS ARE NOT THE SAME SET, DELIBERATELY ════════════════════════
 *
 * `ALLOWED_TOPIC_TAGS` is WIDER than what this editor can author — it also
 * admits `sup`, `sub`, `span` and `a`-with-attributes. That asymmetry is
 * correct and must not be "tidied":
 *
 *   · the sanitiser also runs at RENDER, over bytes that may predate any
 *     version of this editor, so it has to accept more than today's editor
 *     makes;
 *   · a tag the editor cannot produce is not a hole — nothing can author it.
 *
 * The failing direction is the other one, and that is the only one asserted:
 * EDITOR ⊆ SANITISER.
 */

/**
 * Every node the editor's ProseMirror schema may contain, with the DOM tag it
 * serialises to. `null` means the node contributes no element of its own.
 *
 * MEASURED against the real schema, not assumed — `getSchema(...)` then each
 * spec's `toDOM`. The test re-derives both halves and compares.
 */
export const TOPIC_EDITOR_NODES = Object.freeze({
  doc: null,
  text: null,
  paragraph: 'p',
  bulletList: 'ul',
  listItem: 'li',
  hardBreak: 'br',
});

/** Every mark the editor may apply, with the tag it serialises to. */
export const TOPIC_EDITOR_MARKS = Object.freeze({
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  code: 'code',
  link: 'a',
});

/**
 * `p` IS EMITTED AND IS NOT ALLOWED, AND THAT IS THE DESIGNED OUTCOME.
 *
 * Tiptap's `listItem` content spec begins with `paragraph`; there is no
 * configuration in which a list item's text is not wrapped in one. So the
 * editor necessarily emits `<li><p>text</p></li>` while the sanitiser's tag
 * list has no `p`.
 *
 * sanitize-html UNWRAPS a disallowed tag and keeps its children, so what comes
 * out is `<li>text</li>` — which is exactly the shape `plainBulletsToHtml`
 * produces for a plain row. The sanitiser is normalising the two authoring
 * paths onto one stored shape, not losing anything.
 *
 * Declared rather than special-cased inside the test, so that a SECOND node
 * arriving in this list is a decision somebody wrote down. The behavioural half
 * — "the text really does survive the unwrap" — is asserted separately, because
 * a declaration that the loss is fine is not evidence that it is.
 */
export const TOPIC_EDITOR_UNWRAPPED_TAGS = Object.freeze(['p']);

/**
 * The tags this editor can put into the store, minus the unwrapped ones.
 * Every one of these MUST be in `ALLOWED_TOPIC_TAGS`.
 */
export function topicEditorEmittedTags() {
  const tags = new Set();
  for (const tag of Object.values(TOPIC_EDITOR_NODES)) if (tag) tags.add(tag);
  for (const tag of Object.values(TOPIC_EDITOR_MARKS)) if (tag) tags.add(tag);
  for (const tag of TOPIC_EDITOR_UNWRAPPED_TAGS) tags.delete(tag);
  return [...tags].sort();
}

/** Tags the editor emits that the sanitiser would strip. MUST be empty. */
export function topicEditorTagDrift() {
  const allowed = new Set(ALLOWED_TOPIC_TAGS);
  return topicEditorEmittedTags().filter((tag) => !allowed.has(tag));
}

/**
 * ══ THE DEPTH LOCK ═════════════════════════════════════════════════════════
 *
 * `clampDepth` already lifts over-deep items on the way to storage, so why lock
 * the editor too?
 *
 * Because clampDepth is a REPAIR and the admin never sees it happen. Author a
 * fourth level, save, and the bullet silently moves up a level — the editor
 * showed one structure and the store holds another, with nothing anywhere
 * saying so. The lock makes the cap something the admin bumps into while
 * authoring, which is the only place it can be understood.
 *
 * Two independent mechanisms, and they are NOT the same test: this one is
 * "the fourth level cannot be authored", clampDepth's is "a fourth level that
 * arrives anyway is lifted, not dropped". Reverting either must redden its own.
 */

/**
 * How many `bulletList` ancestors enclose this position.
 *
 * A cursor in a top-level bullet is depth 1. Only `bulletList` counts —
 * `listItem` and `paragraph` are structural and would double the number.
 *
 * Takes a resolved position so it can be exercised against a REAL ProseMirror
 * document in a plain-node test (no DOM is needed to build one), rather than
 * against a hand-made stand-in that agrees with whatever it is asked.
 */
export function bulletListDepthAt($pos) {
  if (!$pos || typeof $pos.depth !== 'number') return 0;
  let depth = 0;
  for (let i = $pos.depth; i > 0; i -= 1) {
    if ($pos.node(i)?.type?.name === 'bulletList') depth += 1;
  }
  return depth;
}

/**
 * May a bullet at `depth` be nested one level further?
 *
 * `depth < max`, not `<=`: sinking an item that sits at depth `max` would put it
 * at `max + 1`, so depth `max` is already the floor. THE OFF-BY-ONE IS THE WHOLE
 * FUNCTION — `<=` here would authorise exactly the level this exists to refuse,
 * and would still look correct.
 */
export function canNestDeeper(depth, max = MAX_TOPIC_DEPTH) {
  return Number(depth) < max;
}
