import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PriceCardSection } from "@/components/pageBuilder/sections/price_card";
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The schema half of each step is asserted here too, because
// "absent renders nothing" is a claim about the pair, not about the component.
import { sectionSchema } from "@/lib/schemas/pageBuilder";
// Step 5 updates the emptiness rule, so the rule is asserted beside the render.
import { sectionRendersEmpty } from "@/lib/pageBuilder/sectionLabels";

/**
 * Round D — docs/promo-card-style.md §I steps 1, 3 and 5.
 *
 * ── THE ONE CLAIM EVERY STEP SHARES ───────────────────────────────────────
 * §H: an ADD renders nothing until an author fills it in, so every card stored
 * before this round is byte-identical after it. That is asserted by EQUALITY
 * against markup captured before the step, not by `includes` — a substring
 * check passes on a card that gained a wrapper, a class or a reordered
 * attribute, which is exactly what "byte-identical" is supposed to exclude.
 */

const R = (content, style) =>
  renderToStaticMarkup(createElement(PriceCardSection, { content, style }));

/** The round-57 fixture: every field that existed before this round, filled. */
const FULL = {
  title: "แพ็กเกจ",
  price: "12,665",
  period: "บาท",
  features: ["เอกสาร", "ใบรับรอง"],
  buttonLabel: "สมัคร",
  buttonHref: "/x",
  originalPrice: "14,900",
  discountBadge: "ลด 15%",
  footnote: "* ราคาดังกล่าวยังไม่รวม VAT 7%",
  ribbon: "Early Bird",
};

/**
 * That fixture's rendered output at 73eb4564 — the commit before step 1 —
 * pasted verbatim. A baseline recomputed from the component cannot notice the
 * component moving, so it is a literal.
 */
const BEFORE_FULL =
  '<div class="flex h-full flex-col rounded-9e-lg p-6 overflow-hidden">' +
  '<span data-pb-ribbon="" class="pointer-events-none -mr-6 -mt-6 mb-4 self-end rounded-bl-9e-lg rounded-tr-9e-lg px-4 py-2 text-sm font-bold leading-tight text-[var(--pb-accent-on)] bg-[color:var(--pb-accent-fill)]">Early Bird</span>' +
  '<h3 class="font-heading text-lg font-bold">แพ็กเกจ</h3>' +
  '<p class="mt-2 flex items-center gap-2 text-sm">' +
  '<span class="text-[color:var(--pb-text-muted,var(--9e-slate-dp-50))] line-through dark:text-[#94a3b8]">14,900</span>' +
  '<span class="rounded-9e-sm bg-[color:var(--pb-accent-fill)]/10 px-1.5 py-0.5 text-xs font-bold text-[var(--pb-accent-text)]">ลด 15%</span>' +
  "</p>" +
  '<p class="mt-2 font-heading text-3xl font-bold text-[var(--pb-accent-text)]">12,665' +
  '<span class="ml-1 text-sm font-normal text-[color:var(--pb-text-muted,var(--9e-slate-dp-50))] dark:text-[#94a3b8]">บาท</span></p>' +
  '<p class="mt-2 text-xs text-[color:var(--pb-text-muted,var(--9e-slate-dp-50))] dark:text-[#94a3b8]">* ราคาดังกล่าวยังไม่รวม VAT 7%</p>' +
  '<ul class="mt-4 space-y-2 text-sm border-t border-[var(--surface-border)] pt-4">' +
  CHECK_LI("เอกสาร") +
  CHECK_LI("ใบรับรอง") +
  "</ul>" +
  '<a href="/x" class="inline-flex w-full items-center justify-center gap-2 rounded-9e-xl px-6 py-3 font-en font-semibold transition-all duration-9e-micro ease-9e hover:-translate-y-[2px] hover:shadow-9e-md mt-auto bg-[var(--pb-accent-fill)] text-[var(--pb-accent-on)] hover:opacity-90">สมัคร</a>' +
  "</div>";

/** One `features` row — the Lucide check plus its label, spelled once. */
function CHECK_LI(text) {
  return (
    '<li class="flex items-start gap-2">' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check mt-0.5 h-4 w-4 shrink-0 text-[var(--pb-accent-fill)]" aria-hidden="true">' +
    '<path d="M20 6 9 17l-5-5"></path></svg>' +
    `<span>${text}</span></li>`
  );
}

// ── STEP 1: the round pill ─────────────────────────────────────────────────

test("dateStrip absent renders the pre-step markup, byte for byte", () => {
  /**
   * EQUALITY on the whole render, and both spellings of "not set": the key
   * missing entirely, which is what every stored card reads back as, and the
   * empty string, which is what the schema default and a cleared control give.
   * They must take the same branch or §H's rule holds for only one of them.
   */
  assert.equal(R(FULL, {}), BEFORE_FULL);
  assert.equal(R({ ...FULL, dateStrip: "" }, {}), BEFORE_FULL);
  assert.equal(R({ ...FULL, dateStrip: "   " }, {}), BEFORE_FULL);
});

test("dateStrip set renders the bordered pill, below the ribbon and above the price", () => {
  const html = R({ ...FULL, dateStrip: "เฉพาะรอบอบรมวันที่ 21 - 22 กันยายน 2569" }, {});
  const pill =
    '<p class="mt-2 self-start rounded-full border border-[color:var(--9e-air)] px-3 py-1 text-xs font-medium text-[var(--9e-air)]">' +
    "เฉพาะรอบอบรมวันที่ 21 - 22 กันยายน 2569</p>";
  assert.ok(html.includes(pill), "the pill did not render as specified");

  // ORDER, which is half of what step 1 asks for: below the ribbon, above the
  // price block. Asserted by position rather than by reading the markup.
  const at = (s) => html.indexOf(s);
  assert.ok(at("data-pb-ribbon") < at(pill), "the pill rendered above the ribbon");
  assert.ok(at(pill) < at("14,900"), "the pill rendered below the price block");

  // …and it is ONE token in both themes: the border and the text are the same
  // variable, and no hex reached the class attribute (§H.1, round 30).
  assert.equal((pill.match(/--9e-air/g) ?? []).length, 2);
  assert.equal(/#[0-9a-fA-F]{3,8}/.test(pill), false);
});

test("the field exists in the schema, with the round-57 shape", () => {
  /**
   * The component half is useless if the schema drops the key on save. Same
   * shape as the four it sits with: a string, defaulting to '', so an absent
   * key parses and a stored card gains nothing by passing through.
   */
  // The member of the discriminated union, reached the way
  // test/pure/containerWidthDefault already reaches one.
  const member = sectionSchema.options.find(
    (o) => o.shape.type.value === "price_card",
  );
  assert.notEqual(member, undefined, "the price_card schema moved");
  assert.equal(member.shape.content.parse({}).dateStrip, "");
  // A stored card with no dateStrip key still parses, and reads back as ''.
  assert.equal(member.shape.content.parse({ title: "x" }).dateStrip, "");
});

// ── STEP 3: the price enlarges, and ONLY under promo ───────────────────────

/** Every declared cardStyle value, plus the two shapes that mean "not set". */
const CARD_STYLE_SHAPES = [
  ["absent", {}],
  ["undefined", { cardStyle: undefined }],
  ["plain", { cardStyle: "plain" }],
  ["border", { cardStyle: "border" }],
  ["shadow", { cardStyle: "shadow" }],
  ["filled", { cardStyle: "filled" }],
  ["gradient", { cardStyle: "gradient" }],
];

/** The price line's class attribute, which is what step 3 changes. */
const priceClassOf = (html) => {
  const m = /<p class="(mt-2 font-heading[^"]*)"/.exec(html);
  assert.notEqual(m, null, "the price line is gone — the probe matches nothing");
  return m[1];
};

const PRICE_BEFORE = "mt-2 font-heading text-3xl font-bold text-[var(--pb-accent-text)]";
const PRICE_PROMO =
  "mt-2 font-heading text-5xl md:text-6xl font-bold text-[var(--pb-accent-text)]";

test("promo enlarges the price line", () => {
  assert.equal(priceClassOf(R(FULL, { cardStyle: "promo" })), PRICE_PROMO);
  // The period keeps its size — it is a unit, and at 60px it is a second
  // number. Same span, same classes, in both branches.
  const unit =
    '<span class="ml-1 text-sm font-normal text-[color:var(--pb-text-muted,var(--9e-slate-dp-50))] dark:text-[#94a3b8]">บาท</span>';
  assert.ok(R(FULL, { cardStyle: "promo" }).includes(unit));
  assert.ok(R(FULL, {}).includes(unit));
});

test("EVERY other cardStyle value renders the price line byte-identically", () => {
  /**
   * The spec's own proof obligation for this step, and it is a SWEEP rather
   * than a `plain` case: this is the first branch on a shared enum value, so
   * what has to be shown is that the value means something to `price_card` and
   * nothing different to any of the others.
   *
   * The string is compared whole, INCLUDING ORDER. `… font-bold … text-3xl` and
   * `… text-3xl font-bold …` are the same classes and a different render, and
   * the first attempt at this branch appended the size and moved every
   * non-promo card — caught here, which is what the sweep is for.
   */
  for (const [name, style] of CARD_STYLE_SHAPES) {
    assert.equal(
      priceClassOf(R(FULL, style)),
      PRICE_BEFORE,
      `cardStyle '${name}' no longer renders the price line it always did`,
    );
  }
});

test("CONTROL: the sweep would SEE a change, and promo really differs", () => {
  /**
   * Without this the sweep passes on a build where the branch does nothing at
   * all — every value would render `PRICE_BEFORE`, including promo, and the
   * test above would be green while step 3 was absent.
   */
  assert.notEqual(PRICE_PROMO, PRICE_BEFORE);
  assert.notEqual(priceClassOf(R(FULL, { cardStyle: "promo" })), PRICE_BEFORE);
  // …and the difference is the SIZE, not something incidental.
  assert.equal(PRICE_PROMO.replace("text-5xl md:text-6xl", "text-3xl"), PRICE_BEFORE);
});

test("the whole card is byte-identical for a non-promo cardStyle", () => {
  // The line-level sweep above could pass while the branch disturbed something
  // else on the card, so the claim is also made once at full width.
  assert.equal(R(FULL, {}), BEFORE_FULL);
  assert.equal(R(FULL, { cardStyle: "plain" }), BEFORE_FULL);
});

// ── STEP 5: the label/value detail list ────────────────────────────────────

const DETAILS = [
  { label: "จำนวนจำกัด", value: "รับเพียง 30 ที่นั่งเท่านั้น" },
  { label: "รูปแบบการเรียน", value: "Classroom เรียนในห้องจริง" },
];

const cellsOf = (html) =>
  [...html.matchAll(/<div><dt[^>]*>([^<]*)<\/dt>(?:<dd[^>]*>([^<]*)<\/dd>)?<\/div>|<div>(?:<dt[^>]*>([^<]*)<\/dt>)?<dd[^>]*>([^<]*)<\/dd><\/div>/g)]
    .map((m) => [m[1] ?? m[3] ?? null, m[2] ?? m[4] ?? null]);

test("details absent renders nothing, and no rule", () => {
  /**
   * The absent-key trap, which the spec calls the riskiest thing in this round:
   * `.lean()` applies no Mongoose defaults and JSON drops `undefined`, so EVERY
   * stored card reads this key back missing. All three spellings must render
   * the pre-step card, byte for byte.
   */
  assert.equal(R(FULL, {}), BEFORE_FULL);
  assert.equal(R({ ...FULL, details: [] }, {}), BEFORE_FULL);
  assert.equal(R({ ...FULL, details: undefined }, {}), BEFORE_FULL);
  // …and a non-array, which a directly-seeded Mongo document can carry. The
  // read is `Array.isArray(...) ? ... : []`, never `content.details.length`,
  // and this is what says so rather than the comment saying it.
  assert.equal(R({ ...FULL, details: null }, {}), BEFORE_FULL);
  assert.equal(R({ ...FULL, details: "x" }, {}), BEFORE_FULL);
  // No rule either — the <hr> belongs to this block and appears with it.
  assert.equal(BEFORE_FULL.includes("<hr"), false);
});

test("details renders a rule and a one-then-two-column grid", () => {
  const html = R({ ...FULL, details: DETAILS }, {});
  assert.ok(html.includes('<hr class="mt-6 border-t border-[var(--surface-border)]"/>'));
  assert.ok(html.includes('<dl class="mt-5 grid gap-5 sm:grid-cols-2">'));
  assert.deepEqual(cellsOf(html), [
    ["จำนวนจำกัด", "รับเพียง 30 ที่นั่งเท่านั้น"],
    ["รูปแบบการเรียน", "Classroom เรียนในห้องจริง"],
  ]);
});

test("ONE row survives at sm as a single column — the grid, not two cells", () => {
  /**
   * `sm:grid-cols-2` is a column COUNT, so one row is one cell in a
   * two-column track rather than a cell and an empty one. What this tier can
   * assert is that: one row in, one cell out, and the grid classes unchanged.
   */
  const html = R({ ...FULL, details: [DETAILS[0]] }, {});
  assert.ok(html.includes('<dl class="mt-5 grid gap-5 sm:grid-cols-2">'));
  assert.deepEqual(cellsOf(html), [["จำนวนจำกัด", "รับเพียง 30 ที่นั่งเท่านั้น"]]);
});

test("a both-blank row is skipped; a HALF-filled row renders its half", () => {
  /**
   * The rule the spec states and the one an implementation gets wrong by being
   * tidy: only a row with NEITHER side is dropped. An author who typed a label
   * and not yet a value is mid-thought, and discarding that row silently loses
   * work they can see they did.
   */
  const html = R(
    {
      ...FULL,
      details: [
        { label: "", value: "" },
        { label: "  ", value: "\t" },
        { label: "ป้ายอย่างเดียว", value: "" },
        { label: "", value: "ค่าอย่างเดียว" },
      ],
    },
    {},
  );
  assert.deepEqual(cellsOf(html), [
    ["ป้ายอย่างเดียว", null],
    [null, "ค่าอย่างเดียว"],
  ]);
  // The two blank rows left NOTHING behind — not an empty cell, not a <div>.
  assert.equal((html.match(/<div><d/g) ?? []).length, 2);
});

test("CONTROL: that same fixture asserted against the wrong label goes red", () => {
  /**
   * Without this, `cellsOf` returning `[]` for every input would make the three
   * tests above pass by matching nothing against nothing.
   */
  const html = R({ ...FULL, details: DETAILS }, {});
  assert.throws(
    () =>
      assert.deepEqual(cellsOf(html), [
        ["ไม่ใช่ป้ายนี้", "รับเพียง 30 ที่นั่งเท่านั้น"],
        ["รูปแบบการเรียน", "Classroom เรียนในห้องจริง"],
      ]),
    assert.AssertionError,
    "the cell probe matches nothing, so every assertion above is vacuous",
  );
  assert.equal(cellsOf(html).length, 2);
});

test("features is UNTOUCHED — both lists render, each in its own shape", () => {
  /**
   * §B #10: a tick means something the buyer GETS, and a label/value pair is a
   * fact about the offer. The two are different things and stay separate, so a
   * card with both renders both — features with its ticks, details with none.
   */
  const html = R({ ...FULL, details: DETAILS }, {});
  assert.ok(html.includes(CHECK_LI("เอกสาร")), "features lost its ticks");
  assert.ok(html.includes("จำนวนจำกัด"));
  // No tick reached the detail list: the check glyph appears exactly as many
  // times as there are features.
  assert.equal((html.match(/lucide-check/g) ?? []).length, FULL.features.length);
});

test("the schema keeps an absent array absent-safe, and defaults it to []", () => {
  const member = sectionSchema.options.find(
    (o) => o.shape.type.value === "price_card",
  );
  assert.deepEqual(member.shape.content.parse({}).details, []);
  assert.deepEqual(member.shape.content.parse({ title: "x" }).details, []);
  // A row with one side supplied parses, with the other defaulted — the schema
  // agrees with the render that a half-filled row is legal.
  assert.deepEqual(
    member.shape.content.parse({ details: [{ label: "ก" }] }).details,
    [{ label: "ก", value: "" }],
  );
});

test("a card whose ONLY content is details is not empty", () => {
  /**
   * The structure tree's badge and the panel's warning both read this, so a
   * card that renders would otherwise be marked ว่าง in two places.
   */
  const only = { type: "price_card", content: { details: DETAILS } };
  assert.equal(sectionRendersEmpty(only), false);
  // …and the boundary is still where it was: nothing at all is still empty,
  // and so is a details array whose rows are all blank.
  assert.equal(sectionRendersEmpty({ type: "price_card", content: {} }), true);
  assert.equal(
    sectionRendersEmpty({
      type: "price_card",
      content: { details: [{ label: "", value: "" }] },
    }),
    true,
  );
});
