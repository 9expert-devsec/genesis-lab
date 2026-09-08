import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { SectionRenderer } from "@/components/pageBuilder/SectionRenderer";
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The last test reads two component sources rather than
// retyping the class string either of them holds.
import { readSource } from "../sourceScan.mjs";

/**
 * Round E — `card_grid` can draw a per-item frame again.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE ─────────────────────────────────────
 * It sees the emitted markup exactly: which elements exist, in what order, with
 * which class attributes. It sees NO layout — `min-w-[80%]`, `p-4 md:p-6` and
 * the single-cell `grid` stretch are strings here, and JSDOM compiles no
 * Tailwind. The carousel test below therefore asserts WHICH ELEMENT the
 * carousel selector now targets, which is a structural fact, and says plainly
 * that the resulting widths are a browser measurement nobody has taken.
 */

const child = (id, text) => ({
  id,
  type: "heading",
  name: "",
  enabled: true,
  sortOrder: 0,
  content: { text, level: 3 },
  settings: {},
  layout: {},
  style: {},
  advanced: {},
});

const grid = (layout) => ({
  id: "g1",
  type: "card_grid",
  name: "",
  enabled: true,
  sortOrder: 0,
  content: { children: [child("c1", "หนึ่ง"), child("c2", "สอง")] },
  settings: {},
  layout,
  style: {},
  advanced: {},
});

const html = (layout) =>
  renderToStaticMarkup(createElement(SectionRenderer, { section: grid(layout) }));
const docOf = (layout) =>
  new JSDOM(`<!doctype html><body>${html(layout)}</body>`).window.document;
/** The grid itself — the div `CardGridSection` renders. */
const gridOf = (doc) => doc.querySelector("section > div > div");

/**
 * ── THE BYTE-IDENTITY BASELINE, CAPTURED BEFORE THE CHANGE ────────────────
 *
 * Rendered from the fixture above at f077c055 — the commit before `itemFrame`
 * existed — and pasted here verbatim. It is a LITERAL rather than a value
 * recomputed from the component, and that is the whole point: a baseline
 * derived from the thing under test cannot notice the thing under test moving.
 *
 * `&amp;&gt;` is React escaping the `[&>*]` in the carousel classes; it is what
 * the published HTML actually contains, so it belongs in the baseline as-is.
 */
const BEFORE_PLAIN =
  '<section class="pt-8 pb-8"><div class="mx-auto px-2 md:px-4 max-w-[1200px]">' +
  '<div class="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">' +
  '<section class="pt-8 pb-8"><div class="mx-auto px-2 md:px-4 max-w-[1200px] h-full">' +
  '<h2 class="font-heading text-2xl font-bold md:text-3xl text-left">หนึ่ง</h2></div></section>' +
  '<section class="pt-8 pb-8"><div class="mx-auto px-2 md:px-4 max-w-[1200px] h-full">' +
  '<h2 class="font-heading text-2xl font-bold md:text-3xl text-left">สอง</h2></div></section>' +
  "</div></div></section>";

const BEFORE_CAROUSEL =
  '<section class="pt-8 pb-8"><div class="mx-auto px-2 md:px-4 max-w-[1200px]">' +
  '<div class="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-md:!flex ' +
  "max-md:overflow-x-auto max-md:flex-nowrap max-md:snap-x " +
  'max-md:[&amp;&gt;*]:min-w-[80%] max-md:[&amp;&gt;*]:snap-start">' +
  '<section class="pt-8 pb-8"><div class="mx-auto px-2 md:px-4 max-w-[1200px] h-full">' +
  '<h2 class="font-heading text-2xl font-bold md:text-3xl text-left">หนึ่ง</h2></div></section>' +
  '<section class="pt-8 pb-8"><div class="mx-auto px-2 md:px-4 max-w-[1200px] h-full">' +
  '<h2 class="font-heading text-2xl font-bold md:text-3xl text-left">สอง</h2></div></section>' +
  "</div></div></section>";

// ── the ADD renders nothing new until it is asked to ───────────────────────

test("an ABSENT itemFrame renders the pre-change markup, byte for byte", () => {
  /**
   * EQUALITY, not `includes`. Round 56 §H's rule is that an add must leave every
   * stored section unchanged, and `includes` cannot express that — a wrapper
   * div, an extra class or a reordered attribute all pass a substring check
   * while changing what every stored `card_grid` publishes.
   */
  assert.equal(html({ columns: 3 }), BEFORE_PLAIN);
  assert.equal(
    html({ columns: 3, mobileBehavior: "carousel" }),
    BEFORE_CAROUSEL,
  );
});

test("itemFrame 'none' renders exactly what ABSENT renders", () => {
  // Absence and the named value are the SAME rendering, which is what lets the
  // panel default its display to 'none' without that being a claim about
  // storage. An author who opens the control and picks ไม่มี writes the word;
  // a section nobody opened stores no key. Both publish this.
  assert.equal(html({ columns: 3, itemFrame: "none" }), BEFORE_PLAIN);
  assert.equal(
    html({ columns: 3, itemFrame: "none", mobileBehavior: "carousel" }),
    BEFORE_CAROUSEL,
  );
});

// ── bordered: one box per child, and the children are unchanged ────────────

const BOX = [
  "grid",
  "rounded-9e-lg",
  "border",
  "border-[var(--surface-border)]",
  "bg-9e-ice/50",
  "p-4",
  "md:p-6",
  "dark:bg-[#0D1B2A]/40",
];

test("itemFrame 'bordered' wraps EACH child in the box, in order", () => {
  const doc = docOf({ columns: 3, itemFrame: "bordered" });
  const boxes = [...gridOf(doc).children];
  assert.equal(boxes.length, 2, "one box per child");

  for (const box of boxes) {
    assert.equal(box.tagName, "DIV");
    assert.deepEqual([...box.classList], BOX);
    // Exactly one child per box — the single-cell grid stretch inherited from
    // highlight_grid (round 70) is only correct for one.
    assert.equal(box.children.length, 1);
    assert.equal(box.children[0].tagName, "SECTION");
  }

  // The children are still the same sections, still in the same order, and
  // still rendered exactly as they were — only their parent changed. Compared
  // against the ABSENT render rather than retyped.
  const bare = [...gridOf(docOf({ columns: 3 })).children];
  assert.deepEqual(
    boxes.map((b) => b.children[0].outerHTML),
    bare.map((s) => s.outerHTML),
  );
  assert.deepEqual(
    boxes.map((b) => b.textContent),
    ["หนึ่ง", "สอง"],
  );
});

test("CONTROL: the bordered fixture FAILS the no-frame expectation", () => {
  /**
   * Without this, the equality assertions above are consistent with a build
   * where `bordered` does nothing at all — every one of them would still pass,
   * because they only ever compare unframed output with unframed output.
   */
  assert.throws(
    () => assert.equal(html({ columns: 3, itemFrame: "bordered" }), BEFORE_PLAIN),
    assert.AssertionError,
    "the bordered render is byte-identical to the unframed one — the option does nothing",
  );
  // …and it differs by the box specifically, not by some incidental attribute.
  assert.ok(html({ columns: 3, itemFrame: "bordered" }).includes(BOX.join(" ")));
  assert.equal(BEFORE_PLAIN.includes("bg-9e-ice/50"), false);
});

// ── carousel: the selector's target moves to the box, which is correct ─────

test("carousel + bordered — the carousel classes still target the grid's OWN children", () => {
  /**
   * `card_grid` honours carousel and `highlight_grid` never did, so this
   * combination has never existed. `mobileBehaviorClass('carousel')` styles the
   * grid's DIRECT children (`max-md:[&>*]:min-w-[80%]`, `…:snap-start`), and
   * with a frame those children are the BOXES rather than the sections.
   *
   * That is the correct target: the box is the thing that should be 80% of the
   * viewport and the thing that should snap, and the section inside it fills the
   * box because the box is a single-cell grid. What is asserted here is the
   * STRUCTURE — the carousel classes are on the element whose children are the
   * boxes. The resulting widths are a browser measurement and are NOT claimed.
   */
  const doc = docOf({
    columns: 3,
    itemFrame: "bordered",
    mobileBehavior: "carousel",
  });
  const g = gridOf(doc);
  for (const c of [
    "max-md:!flex",
    "max-md:[&>*]:min-w-[80%]",
    "max-md:[&>*]:snap-start",
  ])
    assert.ok([...g.classList].includes(c), `the grid lost ${c}`);

  // The `&>*` the selector means: the grid's direct children, which are boxes.
  assert.deepEqual(
    [...g.children].map((el) => el.tagName),
    ["DIV", "DIV"],
  );
  for (const box of g.children) assert.deepEqual([...box.classList], BOX);
});

// ── the two copies of the box cannot drift ─────────────────────────────────

test("the box string here is the SAME one highlight_grid uses, read from source", () => {
  /**
   * `card_grid` holds a COPY of `highlight_grid`'s box rather than importing it,
   * because `highlight_grid` is RETIRED — coupling a live type to a dying one
   * would make a later deletion an unannounced change to `card_grid`. This is
   * the test that pays for that decision: both strings are read from the two
   * component sources and compared, so the copy cannot quietly diverge.
   *
   * Read from `code` (comments stripped), which is load-bearing rather than
   * habit: highlight_grid's round-78 doc block QUOTES the box in prose
   * ("surface bg-9e-ice/50, dark:bg-[#0D1B2A]/40 — unchanged"), and a scan over
   * raw text would happily match the comment and pass while the real class
   * attribute said something else.
   */
  const CLASS_STRING = /["'`]([^"'`]*\bbg-9e-ice\/50\b[^"'`]*)["'`]/;

  const pick = (rel) => {
    const m = CLASS_STRING.exec(readSource(rel).code);
    assert.notEqual(m, null, `no box class string found in ${rel}`);
    return m[1];
  };

  const inCardGrid = pick("src/components/pageBuilder/sections/card_grid.jsx");
  const inHighlight = pick(
    "src/components/pageBuilder/sections/highlight_grid.jsx",
  );
  assert.equal(inCardGrid, inHighlight);
  // …and it is the string this file asserts on, so the render tests above and
  // this source test cannot be true of two different strings.
  assert.equal(inCardGrid, BOX.join(" "));
});

test("CONTROL: that source probe reads the class attribute, not the prose", () => {
  /**
   * highlight_grid's doc block mentions the surface in words. If the probe were
   * matching that, it would pass no matter what the component rendered — so the
   * comment must be present in `raw` and absent from what the probe reads.
   */
  const hg = readSource("src/components/pageBuilder/sections/highlight_grid.jsx");
  assert.match(
    hg.raw,
    /surface\s+bg-9e-ice\/50/,
    "the prose this control is about is gone — re-point or delete the control",
  );
  assert.equal(
    /surface\s+bg-9e-ice\/50/.test(hg.code),
    false,
    "the comment survived comment-stripping, so the probe can match prose",
  );
});
