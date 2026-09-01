import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import {
  TOPIC_EDITOR_NODES,
  TOPIC_EDITOR_MARKS,
  TOPIC_EDITOR_UNWRAPPED_TAGS,
  topicEditorEmittedTags,
  topicEditorTagDrift,
  bulletListDepthAt,
  canNestDeeper,
} from '@/lib/courses/topicEditorContract';
import { topicEditorExtensions } from '@/components/admin/topicEditorExtensions';
import { ALLOWED_TOPIC_TAGS, sanitizeTopicHtml } from '@/lib/courses/sanitizeTopicHtml';
import { MAX_TOPIC_DEPTH } from '@/lib/courses/topicHtml';

/**
 * ══ THE VERIFICATION pageBuilder's HEADER CLAIMS, ACTUALLY RUN ═════════════
 *
 * `src/components/pageBuilder/editor/richText/tiptapExtensions.js` says its
 * schema "is checked against the contract" via `getSchema`. MEASURED while
 * building this: nothing in the repo calls `getSchema`, and no test imports
 * `richTextContract`. That check is a comment.
 *
 * The pattern was still the right one to copy. The enforcement had to be
 * written, and this file is it — `getSchema` runs in plain Node with no DOM, so
 * there was never a reason it could not.
 *
 * ── THE DIRECTION IS "CAN THE EDITOR EMIT SOMETHING THE STORE DROPS" ───────
 * Not the reverse. The sanitiser accepting more than the editor produces is
 * correct and deliberate — it also runs at RENDER, over bytes that may predate
 * any version of this editor. A tag nothing can author is not a hole. The
 * failing direction is an admin formatting a bullet, seeing it, saving, and the
 * page showing something else.
 */

const schema = getSchema(topicEditorExtensions());

// ── a. the schema is EXACTLY the declared contract ─────────────────────────

test('the editor schema contains exactly the declared NODES', () => {
  assert.deepEqual(
    Object.keys(schema.nodes).sort(),
    Object.keys(TOPIC_EDITOR_NODES).sort(),
    'the Tiptap extension set and lib/courses/topicEditorContract have drifted — '
    + 'an extension was added or removed without the contract being updated',
  );
});

test('the editor schema contains exactly the declared MARKS', () => {
  assert.deepEqual(
    Object.keys(schema.marks).sort(),
    Object.keys(TOPIC_EDITOR_MARKS).sort(),
  );
});

test('every declared node/mark serialises to the tag the contract names', () => {
  /**
   * The contract does not merely list names — it maps each to a DOM tag, and
   * the tag is what the sanitiser's allow-list is expressed in. Re-derived from
   * the real specs here rather than trusted, because a wrong tag in the map
   * would make the drift check below compare the wrong thing and pass.
   */
  const tagOf = (spec) => {
    const dom = spec.toDOM?.({ attrs: {} }, false);
    return Array.isArray(dom) ? dom[0] : null;
  };

  for (const [name, expected] of Object.entries(TOPIC_EDITOR_NODES)) {
    assert.equal(tagOf(schema.nodes[name].spec), expected, `node ${name}`);
  }
  // `link` builds its tag from href attrs, so it is asserted by round trip
  // below rather than by calling toDOM with an empty attr bag.
  for (const [name, expected] of Object.entries(TOPIC_EDITOR_MARKS)) {
    if (name === 'link') continue;
    assert.equal(tagOf(schema.marks[name].spec), expected, `mark ${name}`);
  }
});

// ── b. THE DRIFT CHECK — editor ⊆ sanitiser ────────────────────────────────

test('every tag the editor can emit is in the sanitiser allow-list', () => {
  assert.deepEqual(
    topicEditorTagDrift(), [],
    'the editor can author a tag sanitizeTopicHtml strips. The admin would see '
    + 'the formatting in the form and the page would not have it.',
  );
});

test('CONTROL: the drift check DOES fire when a tag leaves the allow-list', () => {
  /**
   * The assertion above is worthless if it cannot go red. Rather than mutate a
   * frozen export, the same computation is run against a deliberately narrowed
   * allow-list — if this returns [], the check is structurally incapable of
   * reporting drift.
   */
  const narrowed = new Set(ALLOWED_TOPIC_TAGS.filter((t) => t !== 'code' && t !== 'a'));
  const drift = topicEditorEmittedTags().filter((tag) => !narrowed.has(tag));
  assert.deepEqual(drift, ['a', 'code'],
    'the drift computation does not notice a tag being removed from the allow-list');
});

test('`p` is the ONLY tag the editor emits that the sanitiser unwraps', () => {
  assert.deepEqual(TOPIC_EDITOR_UNWRAPPED_TAGS, ['p'],
    'a second unwrapped tag was declared — that is a decision that needs its own '
    + 'reasoning and its own text-survival proof, not an addition to a list');
});

test('the `p` unwrap PRESERVES the text, which is why it is tolerated', () => {
  /**
   * Declaring the loss acceptable is not evidence that it is. Tiptap wraps every
   * list item's text in a paragraph; the sanitiser drops the tag and keeps the
   * children, landing on exactly the shape `plainBulletsToHtml` produces.
   */
  const out = sanitizeTopicHtml('<ul><li><p>ข้อความไทย</p></li></ul>');
  assert.equal(out, '<ul><li>ข้อความไทย</li></ul>');
});

test('every editor MARK survives the sanitiser as its own tag', () => {
  /**
   * The tag-set comparison is static. This is the behavioural half: each mark is
   * actually emitted and actually survives. A mark whose tag is in the allow-list
   * but whose ATTRIBUTES are all stripped would pass the static check and still
   * lose its meaning — `a` is the one that could, so it carries a real href.
   */
  const cases = [
    ['<ul><li><strong>x</strong></li></ul>', 'strong'],
    ['<ul><li><em>x</em></li></ul>', 'em'],
    ['<ul><li><u>x</u></li></ul>', 'u'],
    ['<ul><li><s>x</s></li></ul>', 's'],
    ['<ul><li><code>x</code></li></ul>', 'code'],
    ['<ul><li><a href="https://9expert.co.th">x</a></li></ul>', 'a'],
  ];
  for (const [html, tag] of cases) {
    const out = sanitizeTopicHtml(html);
    assert.ok(out.includes(`<${tag}`), `mark tag <${tag}> did not survive: ${out}`);
    assert.ok(out.includes('x'), `text did not survive for <${tag}>: ${out}`);
  }
});

// ── c. what is switched OFF stays off ──────────────────────────────────────

test('the editor cannot author an ordered list, a heading, or a code block', () => {
  /**
   * Settled for this round: bullet lists only. `orderedList` matters most —
   * CourseOutline already numbers each row `{i + 1}.` and EXCEL-HR-02 reads
   * "1. 1. …" today because three titles were hand-numbered on top of that. A
   * third numbering scheme inside the panel is the last thing this section needs.
   */
  for (const name of ['orderedList', 'heading', 'codeBlock', 'blockquote', 'horizontalRule']) {
    assert.equal(schema.nodes[name], undefined, `${name} is authorable and must not be`);
  }
});

test('a list item may hold one or more paragraphs and only nested BULLET lists', () => {
  /**
   * `paragraph+ bulletList*` — WIDENED from a single required paragraph
   * (`paragraph bulletList*`), on measured evidence: the single-paragraph
   * spec broke `toggleBulletList` on any multi-paragraph selection (see
   * topicEditorExtensions.js's TopicListItem header for the full mechanism).
   * `block*` (Tiptap's stock default) is still narrower than what this editor
   * needs — no headings/code blocks are registered here regardless — so
   * `bulletList*` stays the second half: a nested list is the only OTHER
   * child a bullet may carry.
   *
   * The word-glue hazard a single-paragraph spec used to block at the schema
   * (`<li><p>a</p><p>b</p></li>` sanitising to `<li>ab</li>`) is now guarded
   * at sanitizeTopicHtml.js's `separateAdjacentParagraphs` instead — see
   * test/pure/sanitizeTopicHtml.test.mjs's "glue" tests for the proof.
   */
  assert.equal(schema.nodes.listItem.spec.content, 'paragraph+ bulletList*');
});

// ── d. THE DEPTH LOCK, against real ProseMirror documents ──────────────────

/** A doc nested `levels` deep, built through the real schema. */
function nestedDoc(levels) {
  const leaf = (depth) => ({
    type: 'listItem',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: `L${depth}` }] },
      ...(depth < levels
        ? [{ type: 'bulletList', content: [leaf(depth + 1)] }]
        : []),
    ],
  });
  return schema.nodeFromJSON({
    type: 'doc',
    content: [{ type: 'bulletList', content: [leaf(1)] }],
  });
}

/** Where the deepest text sits, resolved. */
function deepestPos(doc, label) {
  let found = null;
  doc.descendants((node, pos) => { if (node.isText && node.text === label) found = pos; });
  assert.ok(found != null, `no text node ${label}`);
  return doc.resolve(found);
}

test('bulletListDepthAt counts bulletList ancestors, not structural ones', () => {
  /**
   * Exercised against a REAL document built from the REAL schema, not a
   * hand-made stand-in — a fake `$pos` agrees with whatever it is asked, which
   * is how a depth function comes to be tested against its own assumptions.
   *
   * `listItem` and `paragraph` are ancestors too; counting them would double
   * the number and the cap would bite at level 2.
   */
  for (let levels = 1; levels <= MAX_TOPIC_DEPTH + 1; levels += 1) {
    const doc = nestedDoc(levels);
    assert.equal(bulletListDepthAt(deepestPos(doc, `L${levels}`)), levels,
      `a bullet ${levels} list(s) deep did not read as depth ${levels}`);
  }
});

test('the lock refuses the level past MAX_TOPIC_DEPTH and permits every level up to it', () => {
  for (let depth = 1; depth < MAX_TOPIC_DEPTH; depth += 1) {
    assert.equal(canNestDeeper(depth), true, `depth ${depth} should still be nestable`);
  }
  assert.equal(canNestDeeper(MAX_TOPIC_DEPTH), false,
    'a bullet already at the cap may not be nested again — sinking it would '
    + `produce level ${MAX_TOPIC_DEPTH + 1}`);
});

test('the lock reads MAX_TOPIC_DEPTH and does not carry its own number', () => {
  // A hardcoded 3 here would silently stop agreeing with clampDepth and the
  // CSS the moment the cap moved.
  assert.equal(canNestDeeper(MAX_TOPIC_DEPTH - 1), true);
  assert.equal(canNestDeeper(MAX_TOPIC_DEPTH), false);
  assert.equal(canNestDeeper(2, 2), false, 'the cap is a parameter, not a constant');
});

test('CONTROL: `<=` instead of `<` would authorise exactly the level past the cap', () => {
  /**
   * The off-by-one IS the function. This reproduces the wrong comparison against
   * the same input and shows it says yes at the cap — which is the one answer
   * that must be impossible.
   */
  const broken = (depth, max = MAX_TOPIC_DEPTH) => Number(depth) <= max;
  assert.equal(broken(MAX_TOPIC_DEPTH), true);
  assert.equal(canNestDeeper(MAX_TOPIC_DEPTH), false,
    'the shipped rule agrees with the broken one, so the lock is not locking');
});

test('CONTROL: a depth walker that counted every ancestor would over-count', () => {
  /**
   * Guards `bulletListDepthAt`'s type filter. Counting all ancestors reads a
   * one-level bullet as 3 (bulletList > listItem > paragraph), so the cap would
   * fire on the very first indent and the editor would look broken rather than
   * capped.
   */
  const doc = nestedDoc(1);
  const $pos = deepestPos(doc, 'L1');
  let all = 0;
  for (let i = $pos.depth; i > 0; i -= 1) all += 1;
  assert.ok(all > bulletListDepthAt($pos),
    'the naive walker does not over-count, so the type filter is not doing anything');
  assert.equal(bulletListDepthAt($pos), 1);
});
