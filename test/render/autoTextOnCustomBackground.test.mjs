import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { SectionRenderer } from "@/components/pageBuilder/SectionRenderer";
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The mode-blind pair is imported HERE on purpose: the
// "one path" rule is about what SectionRenderer.jsx may import, and the whole
// claim of the last test below is that these two still decide the preset path
// by themselves.
import { backgroundClass, isDarkBackground } from "@/lib/pageBuilder/presets";
import {
  contrastRatio,
  THEME_TEXT_RGB,
  CONTRAST_MIN,
} from "@/lib/pageBuilder/customColor";
// ADDED beside the statements above rather than folded into any — the standing
// rule in this repo. The round-80-fix half of this file reaches one surface
// that is not a cardStyle: promotion_bundle's per-course card, which paints
// `--surface` in its own markup.
import { PromotionBundleSection } from "@/components/pageBuilder/sections/promotion_bundle";
// ADDED beside the statements above rather than folded into any. Round A-fix 2:
// the muted fallback's colour-identity claim is checked against the two files
// that define the token, rather than retyped as a hex here.
import { readSource } from "../sourceScan.mjs";

// A round far enough out that the year label is stable whatever day this runs;
// nothing here asserts on the date, it is only what makes the card render.
const BUNDLE_ROUND = {
  _id: "6500000000000000000000a1",
  dates: ["2030-08-20", "2030-08-21"],
  status: "open",
  type: "classroom",
};

/**
 * Round 80 — the text colour on a background the author painted.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE ─────────────────────────────────────
 * It sees which CLASSES reach the wrapper. It sees no colour: `text-9e-ice` is
 * a string here, JSDOM compiles no Tailwind, and the ratios below are computed
 * from the two channel triples customColor.js pins against tailwind.config.js
 * rather than read off a rendered pixel. What is asserted is the mechanism —
 * that the class which lands is the one the ranking chose.
 */

const html = (section) =>
  renderToStaticMarkup(createElement(SectionRenderer, { section }));
const wrapperOf = (section) =>
  new JSDOM(`<!doctype html><body>${html(section)}</body>`).window.document.querySelector(
    "section",
  );
const classesOf = (section) => wrapperOf(section).className.split(/\s+/);

/**
 * A text COLOUR class, as opposed to `text-lg` / `text-center` / `text-[11px]`.
 *
 * `text-` is Tailwind's prefix for three unrelated things — colour, font size
 * and alignment — so "starts with text-" is not the question this file asks.
 * MEASURED while writing the card tests below: the price_card title carries
 * `text-lg`, which a prefix check reads as "this element names its own colour"
 * and would make the whole boundary assertion vacuously true.
 *
 * A WHITELIST of the colour FORMS, not of colour names: the `9e-*` scales, the
 * three arbitrary-value spellings this repo uses (`[var(`, `[color:var(` and a
 * raw `[#hex`, the last of which scheduleStatus's badges reach this file
 * through), and the handful of stock palettes that appear in Page Builder
 * components. Narrow on purpose — a blocklist of size tokens would silently
 * admit any new `text-*` utility, which is the direction that makes a probe
 * stop probing. The control below keeps the whitelist honest.
 *
 * ONE definition, used by both the section-level and the element-level helper.
 * Two answers to "is this a text colour" in one file is the drift this repo
 * keeps removing, and the section wrapper only escapes the `text-lg` problem by
 * luck rather than by rule.
 */
const TEXT_COLOUR =
  /^(?:dark:)?text-(?:9e-|white|black|\[var\(|\[color:var\(|\[#|(?:red|amber|green|orange|slate)-)/;

/** Only the classes that decide text colour — the subject of this file. */
const textClassesOf = (section) =>
  classesOf(section).filter((c) => TEXT_COLOUR.test(c));

const sec = (settings) => ({
  id: "s1",
  type: "heading",
  name: "",
  enabled: true,
  sortOrder: 0,
  content: { text: "หัวข้อ", level: 2 },
  settings,
  layout: {},
  style: {},
  advanced: {},
});

/** A hex an author might really type, and the reason this round exists. */
const DARK_HEX = "#123456";
const THEME_FALLBACK = "dark:text-[color:var(--text-primary)]";

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const ratio = (hex, token) => contrastRatio(rgb(hex), THEME_TEXT_RGB[token]);

// ── PINNED: the literal is gone, and it was wrong ──────────────────────────

test("PINNED + a dark author colour renders the LIGHT token", () => {
  /**
   * A pinned surface is the author's hex verbatim in both themes, so the text
   * on it must not move either — one class, no `dark:` variant, exactly the
   * shape the unconditional `text-9e-navy` had. What changed is WHICH class.
   */
  assert.deepEqual(
    textClassesOf(
      sec({
        backgroundMode: "custom",
        backgroundCustom: { from: DARK_HEX },
        backgroundPin: true,
      }),
    ),
    ["text-9e-ice"],
  );
});

test("CONTROL: the pre-change literal would have been unreadable on that fixture", () => {
  /**
   * Without this the test above passes on any implementation that happens to
   * emit the light token, including one that emits it unconditionally. This
   * says the OLD answer was not merely different — it was below AA, which is
   * the defect and the reason the literal could not stay.
   *
   * 1.37:1. The threshold is 4.5:1 (WCAG 2.1 SC 1.4.3), and the section was
   * dark ink on a dark surface in BOTH themes, because it is pinned.
   */
  assert.ok(
    ratio(DARK_HEX, "navy") < CONTRAST_MIN,
    "the fixture is readable under the old literal, so it proves nothing",
  );
  assert.ok(ratio(DARK_HEX, "ice") >= CONTRAST_MIN);
});

// ── UNPINNED: light mode only, dark mode handed back to the theme ──────────

test("UNPINNED + a dark author colour carries the light token AND the dark: fallback", () => {
  /**
   * An unpinned surface goes dark with the theme by a rule in globals.css
   * (round 79), and the theme's dark text is already correct on it. So the
   * override is LIGHT MODE ONLY and dark mode is handed straight back — which
   * is what the section renders today, unchanged.
   */
  assert.deepEqual(
    textClassesOf(
      sec({ backgroundMode: "custom", backgroundCustom: { from: DARK_HEX } }),
    ),
    ["text-9e-ice", THEME_FALLBACK],
  );
});

test("the two cases differ ONLY in the dark: fallback", () => {
  // Pinning is about whether dark mode moves. It is not a second opinion about
  // which token is legible on the author's colour, and this says so.
  const custom = {
    backgroundMode: "custom",
    backgroundCustom: { from: DARK_HEX },
  };
  assert.deepEqual(
    textClassesOf(sec({ ...custom, backgroundPin: true })),
    textClassesOf(sec(custom)).filter((c) => c !== THEME_FALLBACK),
  );
});

// ── the opt-out ────────────────────────────────────────────────────────────

test("textMode 'theme' renders NEITHER token — the control proving the mode is live", () => {
  /**
   * The author's way back to the theme's text. Without this assertion the
   * schema field could be stored, offered in the panel, and read by nothing —
   * a control that cannot change anything, which is the shape this repo keeps
   * removing.
   */
  const custom = {
    backgroundMode: "custom",
    backgroundCustom: { from: DARK_HEX },
  };
  assert.deepEqual(textClassesOf(sec({ ...custom, textMode: "theme" })), []);
  assert.deepEqual(
    textClassesOf(sec({ ...custom, textMode: "theme", backgroundPin: true })),
    [],
    "the opt-out is ignored on a pinned section",
  );
  // ABSENT means auto — the deliberate change to stored pages. A section that
  // has never seen this field renders the ranking, not the theme.
  assert.equal("textMode" in custom, false);
  assert.deepEqual(textClassesOf(sec(custom)), ["text-9e-ice", THEME_FALLBACK]);
  // …and the word is honoured for its own sake, not as "anything but auto".
  assert.deepEqual(textClassesOf(sec({ ...custom, textMode: "auto" })), [
    "text-9e-ice",
    THEME_FALLBACK,
  ]);
});

// ── the preset path is untouched, which is what keeps the theme's authority ─

test("a PRESET background gains NO class from this round", () => {
  /**
   * D4 narrowed to author-painted surfaces only. On a preset the theme still
   * owns text wholly: the ONLY text class a preset section may carry is the one
   * `isDarkBackground` — a hand-made judgement about six named colours, byte-
   * identical this round — puts there.
   *
   * In particular no preset section may carry the `dark:` fallback, which is
   * the class this round introduced and the one that would show up first if the
   * new resolver ever answered on the preset path.
   */
  for (const bg of [
    "default",
    "white",
    "light",
    "soft_gray",
    "dark",
    "brand_gradient",
  ]) {
    const section = sec({ background: bg });
    assert.deepEqual(
      textClassesOf(section),
      isDarkBackground(bg) ? ["text-9e-ice"] : [],
      `${bg} gained a text class`,
    );
    // The preset's own class is still there — nothing suppressed it.
    const cls = backgroundClass(bg);
    if (cls) assert.ok(classesOf(section).includes(cls), `${bg} lost its class`);
    // textMode is inert on the preset path: there is nothing for it to opt out
    // of, and offering it there would be a control that changes nothing.
    for (const mode of ["auto", "theme"])
      assert.deepEqual(
        textClassesOf(sec({ background: bg, textMode: mode })),
        textClassesOf(section),
        `${bg} + textMode:${mode} rendered differently from ${bg}`,
      );
  }
});

test("CONTROL: the same fixture in CUSTOM mode does gain one", () => {
  // Without this, the test above would pass on a build where the resolver was
  // wired to nothing at all.
  assert.deepEqual(textClassesOf(sec({ background: "dark" })), ["text-9e-ice"]);
  assert.deepEqual(
    textClassesOf(
      sec({
        background: "dark",
        backgroundMode: "custom",
        backgroundCustom: { from: "#f8e7d5" },
      }),
    ),
    ["text-9e-navy", THEME_FALLBACK],
    "a light author colour under a dark preset did not take the dark token",
  );
});

// ── ROUND 80-FIX: a surface that paints itself owns the text on it ─────────

/**
 * The defect this half of the round is for, stated once here because all four
 * tests below are the same claim on different surfaces.
 *
 * `autoTextClassFor` puts `text-9e-ice` on the SECTION whenever the author's
 * background is dark. Inheritance carries that into every descendant that does
 * not name a colour of its own — including a card that paints its OWN opaque,
 * light surface. The parts of a `price_card` that survived were the ones that
 * set a colour (the struck price, the accent price, the footnote); the parts
 * that vanished were the ones that inherit (the title, the `features` rows).
 *
 * The fix is the rule `promo` already stated: text on a surface the theme does
 * not own is chosen by whoever owns the surface. `--text-primary`, not the
 * round-80 token — the card's surface follows the SITE theme, not the author's
 * colour, so its text must follow the site theme too.
 */

const DARK_AUTHORED = {
  backgroundMode: "custom",
  backgroundCustom: { from: DARK_HEX },
};

const card = (cardStyle, content) => ({
  id: "s1",
  type: "price_card",
  name: "",
  enabled: true,
  sortOrder: 0,
  content: {
    title: "แพ็กเกจอบรม",
    price: "฿12,900",
    features: ["เอกสารประกอบ", "ใบรับรอง"],
    ...content,
  },
  settings: DARK_AUTHORED,
  layout: {},
  style: cardStyle ? { cardStyle } : {},
  advanced: {},
});

/** The rendered document for a section, and the classes on any element. */
const cardElOf = (section) =>
  new JSDOM(`<!doctype html><body>${html(section)}</body>`).window.document;
const clsOf = (el) => [...el.classList];
/** The element-level twin of `textClassesOf`, off the SAME `TEXT_COLOUR`. */
const textClsOf = (el) => clsOf(el).filter((c) => TEXT_COLOUR.test(c));

/**
 * The nearest ancestor (or self) that names a text colour — i.e. the element
 * whose choice this text actually renders in.
 *
 * This is the whole round expressed as one function. Inheritance does not care
 * which element "should" own the colour; it takes the first one going up that
 * names one. Before the fix that was the SECTION, whose colour was chosen for
 * the author's background. After it, for a card that paints its own surface, it
 * is the CARD.
 */
const colourOwnerOf = (el) => {
  for (let n = el; n; n = n.parentElement)
    if (textClsOf(n).length) return n;
  return null;
};

test("CONTROL: the colour probe sees colours and is not fooled by text-lg", () => {
  // Otherwise every "names no colour" assertion below is comparing two empty
  // lists, and every "names one" assertion passes on a font size.
  for (const yes of [
    "text-9e-ice",
    "text-9e-navy",
    "text-[var(--text-primary)]",
    "text-[color:var(--pb-accent-fill)]",
    "dark:text-[color:var(--text-primary)]",
    "text-white",
    "text-amber-700",
    "text-9e-slate-dp-50",
    "text-[#39b980]",
    "dark:text-[#94a3b8]",
  ])
    assert.ok(TEXT_COLOUR.test(yes), `${yes} was not seen as a colour`);
  for (const no of [
    "text-lg",
    "text-sm",
    "text-xs",
    "text-3xl",
    "text-center",
    "text-[11px]",
    "text-left",
  ])
    assert.equal(TEXT_COLOUR.test(no), false, `${no} was mistaken for a colour`);
});

test("a FILLED price_card on a dark authored background owns its own text", () => {
  const doc = cardElOf(card("filled"));
  const surface = doc.querySelector(".rounded-9e-lg");
  assert.notEqual(surface, null, "the card surface was not found");

  // It paints an opaque surface AND names the colour of the text on it.
  assert.ok(clsOf(surface).includes("bg-[var(--pb-bg-light)]"));
  assert.deepEqual(textClsOf(surface), ["text-[var(--text-primary)]"]);

  /**
   * THE DEFECT, REPRODUCED — both halves, because either alone proves nothing.
   *
   * (1) the SECTION really is declaring the light token, so there is something
   *     to inherit; and (2) the title and the `features` rows really do name no
   *     colour, so they are the elements that would inherit it. With the card
   *     naming none either, the light token reached them on the card's own
   *     light surface. That is the live page's invisible price card.
   */
  assert.deepEqual(textClsOf(doc.querySelector("section")), [
    "text-9e-ice",
    THEME_FALLBACK,
  ]);
  assert.deepEqual(textClsOf(doc.querySelector("h3")), []);
  assert.deepEqual(textClsOf(doc.querySelector("li span")), []);
  // …and the element whose colour they therefore render in is now the CARD,
  // not the section. That is the whole fix, expressed as inheritance.
  assert.equal(colourOwnerOf(doc.querySelector("h3")), surface);
  assert.equal(colourOwnerOf(doc.querySelector("li span")), surface);
});

test("CONTROL: the same fixture as PLAIN goes red — and plain must stay that way", () => {
  /**
   * Two things at once, and deliberately the same assertion.
   *
   * As a CONTROL it is the pre-fix shape of the identical fixture: `plain`
   * paints nothing and names nothing, so the title inherits the section's
   * `text-9e-ice`. Swap `filled` for `plain` above and the test above fails —
   * which is what makes it a claim about the fix rather than about `price_card`
   * rendering at all.
   *
   * As a BOUNDARY it is the thing that must NOT be "made consistent" later.
   * `plain`, `border` and `shadow` paint no surface, so inheriting the
   * section's text is CORRECT there — pinning a colour on them would break the
   * case the first half of this round just fixed, where the section's derived
   * token is exactly what the text should be.
   */
  for (const style of [undefined, "plain", "border", "shadow"]) {
    const doc = cardElOf(card(style));
    const surface = doc.querySelector(".rounded-9e-lg");
    assert.deepEqual(
      textClsOf(surface),
      [],
      `cardStyle '${String(style)}' pinned a text colour on a surface it does not paint`,
    );
    // The title therefore renders in the SECTION's colour — which is the
    // correct outcome for a card that painted nothing over it, and is exactly
    // the wrong outcome for `filled` above. Same fixture, same title, different
    // owner: that is the difference the fix makes, and it is asserted from both
    // sides rather than asserted once and reasoned about.
    assert.deepEqual(textClsOf(doc.querySelector("section")), [
      "text-9e-ice",
      THEME_FALLBACK,
    ]);
    assert.equal(
      colourOwnerOf(doc.querySelector("h3")),
      doc.querySelector("section"),
      `cardStyle '${String(style)}' stopped the section's colour reaching the title`,
    );
  }
});

test("GRADIENT owns its text too — and what that does not fix is stated", () => {
  const surface = cardElOf(card("gradient")).querySelector(".rounded-9e-lg");
  assert.ok(clsOf(surface).includes("bg-9e-gradient-subtle"));
  assert.deepEqual(textClsOf(surface), ["text-[var(--text-primary)]"]);
  /**
   * NOT asserted, because it is not true: that `gradient` is now readable in
   * both themes. Its surface is a LIGHT-ONLY gradient with no `.dark` form, so
   * in site-dark this pins near-white on a pale gradient — the same 1.05:1 it
   * already rendered by inheritance. The pin is a strict improvement in light
   * mode and a no-op in dark, and presets.js says so at the value itself.
   */
});

/**
 * ── THE FOURTH SURFACE: promotion_bundle's PER-COURSE CARD ────────────────
 * `bg-[var(--surface)]` — the same opaque, theme-aware surface `Card` paints —
 * with no text colour named on it.
 *
 * LATENT RATHER THAN LIVE, and asserted as such. Every text node inside that
 * card already pins its own colour today, so this class changes nothing that
 * renders; the surface is fixed because the rule is about the SURFACE, not
 * about which descendants happen to exist. The assertion below is therefore
 * about the class being present, and the test deliberately does NOT claim to
 * reproduce a visible defect — that claim belongs to `filled` above, where the
 * inheriting text really exists.
 */
test("the bundle's per-course card names the colour of the text on it", () => {
  const doc = new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(
      createElement(PromotionBundleSection, {
        content: {
          name: "Bundle 1",
          items: [{ id: "i1", courseId: "MSE-L1", roundId: BUNDLE_ROUND._id }],
        },
        data: [
          {
            id: "i1",
            courseId: "MSE-L1",
            course: {
              course_id: "MSE-L1",
              course_name: "Microsoft Excel Level 1",
              course_cover_url: "",
            },
            rounds: [BUNDLE_ROUND],
          },
        ],
        pageId: "p1",
        sectionId: "sec-1",
      }),
    )}</body>`,
  ).window.document;

  const item = doc.querySelector('[data-testid="bundle-item"]');
  assert.notEqual(item, null, "the bundle item card was not rendered");
  assert.ok(
    clsOf(item).includes("bg-[var(--surface)]"),
    "the card no longer paints the surface this test is about",
  );
  assert.deepEqual(textClsOf(item), ["text-[var(--text-primary)]"]);
});

// ── ROUND A-fix 2: text that NAMES its colour, on a surface the theme lost ──

/**
 * The mirror image of the card fix above. `01b` was about surfaces that PAINT
 * themselves and name no text colour, so inheritance carried the section's ink
 * onto them. This is the opposite shape: elements that NAME their own colour —
 * chosen against a surface the THEME owns — sitting in a section whose surface
 * the author owns. `autoTextClassFor` cannot reach them at all: they have opted
 * out of inheritance, which is the whole point of naming a colour.
 *
 * `autoTextVarsFor` answers them from the SAME `autoTextToken` decision, as a
 * section-scoped custom property, so the muted ink and the primary ink cannot
 * disagree about which surface they are on.
 *
 * ── WHAT "BYTE-IDENTITY" MEANS HERE, SAID PLAINLY ────────────────────────
 * The CLASS ATTRIBUTE of these consumers DID change: `text-9e-slate-dp-50`
 * became `text-[color:var(--pb-text-muted,var(--9e-slate-dp-50))]`. What is
 * unchanged is the COLOUR — the fallback is the same token, and a section with
 * no authored background sets no variable, so the fallback is what paints. That
 * is the claim asserted below, and it is asserted as those two facts rather
 * than as an equality on the attribute, because the attribute equality is NOT
 * true and a test saying it is would be worse than the change.
 */

const MUTED_LIGHT = "text-[color:var(--pb-text-muted,var(--9e-slate-dp-50))]";
const MUTED_DARK = "dark:text-[#94a3b8]";
const SECONDARY_LABEL = "text-[color:var(--pb-text-muted,var(--9e-navy))]";

const cta = (settings) => ({
  id: "s1",
  type: "cta",
  name: "",
  enabled: true,
  sortOrder: 0,
  content: {
    heading: "หัวข้อ",
    description: "คำอธิบาย",
    buttonLabel: "หลัก",
    buttonHref: "/a",
    secondaryButtonLabel: "รอง",
    secondaryButtonHref: "/b",
  },
  settings,
  layout: {},
  style: {},
  advanced: {},
});

const AUTHORED_DARK = {
  backgroundMode: "custom",
  backgroundCustom: { from: DARK_HEX },
};

/** The style attribute as a { prop: value } map. */
const styleMapOf = (el) => {
  const out = {};
  for (const part of (el?.getAttribute("style") ?? "").split(";")) {
    const at = part.indexOf(":");
    if (at === -1) continue;
    out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
};

test("a cta on a dark authored background gets the section-scoped muted ink", () => {
  const doc = cardElOf(cta(AUTHORED_DARK));
  const section = doc.querySelector("section");

  // The section carries the muted variable, set from the SAME token the primary
  // text used — ice, so the muted ink is the light end of the same scale.
  assert.equal(
    styleMapOf(section)["--pb-text-muted"],
    "var(--9e-slate-dp-700)",
  );
  assert.deepEqual(textClsOf(section), ["text-9e-ice", THEME_FALLBACK]);

  // The description reads it, and its light half is the variable.
  assert.deepEqual(textClsOf(doc.querySelector("p")), [MUTED_LIGHT, MUTED_DARK]);
});

test("CONTROL: without the variable that fixture paints the ink it always did", () => {
  /**
   * The defect, reproduced. With no variable the fallback paints, and the
   * fallback is `--9e-slate-dp-50` — #5E6A7E, MEASURED at 2.32:1 on #123456 and
   * 3.18:1 on #0D1B2A. Dark slate on a dark authored surface, which is the
   * reported symptom.
   *
   * `textMode: 'theme'` reproduces it exactly: same section, same background,
   * variable withheld by the author's own opt-out.
   */
  const optedOut = cardElOf(cta({ ...AUTHORED_DARK, textMode: "theme" }));
  assert.equal(
    "--pb-text-muted" in styleMapOf(optedOut.querySelector("section")),
    false,
  );
  // The two states differ ONLY in the variable — the consumer is byte-identical
  // in both, so the variable is doing all of the work and nothing else moved.
  assert.equal(
    optedOut.querySelector("p").outerHTML,
    cardElOf(cta(AUTHORED_DARK)).querySelector("p").outerHTML,
  );
});

test("a cta on a PRESET background sets no variable, so its colour is unchanged", () => {
  /**
   * The byte-identity half. A section with no authored background emits no
   * `--pb-text-muted` at all — asserted by EQUALITY on the whole style
   * attribute, which for a preset section is nothing at all.
   */
  for (const bg of ["default", "white", "light", "soft_gray", "dark"]) {
    const doc = cardElOf(cta({ background: bg }));
    assert.equal(
      doc.querySelector("section").getAttribute("style"),
      null,
      `${bg} emitted a style attribute`,
    );
    assert.deepEqual(textClsOf(doc.querySelector("p")), [
      MUTED_LIGHT,
      MUTED_DARK,
    ]);
  }
});

test("the muted fallback IS the token the consumers used before — read, not assumed", () => {
  /**
   * The colour-identity claim rests entirely on the fallback being the value
   * the old class compiled to. `text-9e-slate-dp-50` resolved through
   * tailwind.config's `9e-slate-dp.50`; the fallback resolves through
   * globals.css's `--9e-slate-dp-50`. Two files, one value — so both are read
   * rather than either trusted.
   */
  const declared = /--9e-slate-dp-50:\s*(#[0-9a-fA-F]{6})/.exec(
    readSource("src/app/globals.css").raw,
  );
  assert.notEqual(declared, null, "--9e-slate-dp-50 is no longer declared");

  const scale = /'9e-slate-dp':\s*\{[^}]*?\b50:\s*'(#[0-9a-fA-F]{6})'/.exec(
    readSource("tailwind.config.js").raw,
  );
  assert.notEqual(scale, null, "the 9e-slate-dp scale moved");
  assert.equal(
    declared[1].toLowerCase(),
    scale[1].toLowerCase(),
    "the CSS variable and the Tailwind token have drifted — the fallback no " +
      "longer paints what text-9e-slate-dp-50 painted",
  );
});

test("the secondary button LABEL follows the section; its frame is left alone", () => {
  const dark = cardElOf(cta(AUTHORED_DARK));
  const secondary = [...dark.querySelectorAll("a")].at(-1);
  assert.equal(secondary.getAttribute("href"), "/b");
  assert.deepEqual(textClsOf(secondary), [SECONDARY_LABEL, "dark:text-white"]);

  // The same element on a preset background: identical classes, and no variable
  // to read, so it paints `--9e-navy` exactly as `text-9e-navy` did.
  const preset = cardElOf(cta({ background: "light" }));
  assert.equal(
    [...preset.querySelectorAll("a")].at(-1).getAttribute("class"),
    secondary.getAttribute("class"),
  );

  // NOT fixed, and pinned so the report cannot quietly become false: the border
  // and the hover surface are still theme-surface tokens, as wrong on an
  // authored background as the label was. Neither resolves from an existing
  // token, so both are reported rather than given a minted colour.
  for (const c of [
    "border-[var(--surface-border)]",
    "hover:bg-[var(--surface-muted)]",
  ])
    assert.ok(
      [...secondary.classList].includes(c),
      `${c} changed — the report saying the frame was left alone is now wrong`,
    );
});

test("the UNFRAMED card takes the section's muted ink; the FRAMED one hands it back", () => {
  /**
   * ── THE TEST THIS REPLACES ASSERTED A RULE THAT NO LONGER HOLDS ─────────
   * It was "price_card's muted lines were NOT swept in", and it pinned an
   * exclusion. The exclusion was only ever valid while `cardStyle` PAINTS: with
   * `plain` — the default, and what the stored corpus carries — the card paints
   * nothing, so its muted lines sit on the SECTION's surface and were still
   * dark-slate-on-dark there. A green test asserting that is worse than none,
   * so it is replaced rather than amended.
   *
   * ── THE RULE NOW, STATED ONCE ──────────────────────────────────────────
   * WHOEVER PAINTS THE SURFACE OWNS BOTH TOKENS ON IT. `01b` gave the framed
   * styles `--text-primary`; this gives them `--pb-text-muted` too, and the
   * unframed ones simply let the section's value through. Symmetric, and one
   * rule rather than a per-component branch.
   *
   * BOTH HALVES ARE THE CLAIM. The unframed half alone passes on a build where
   * the card style resets nothing; the framed half alone passes on a build
   * where the section never sets the variable. Neither proves the pair.
   */
  const card = (cardStyle) => ({
    id: "p1",
    type: "price_card",
    name: "",
    enabled: true,
    sortOrder: 0,
    content: {
      title: "แพ็กเกจ",
      price: "฿1",
      originalPrice: "฿2",
      footnote: "หมายเหตุ",
    },
    settings: AUTHORED_DARK,
    layout: {},
    style: cardStyle ? { cardStyle } : {},
    advanced: {},
  });
  const surfaceOf = (doc) => doc.querySelector(".rounded-9e-lg");
  const struckOf = (doc) => doc.querySelector(".line-through");

  // Every consumer now names the variable — that half is shared, and it is the
  // card, not the component, that decides what the variable resolves to.
  for (const style of [undefined, "plain", "filled", "promo"]) {
    const struck = struckOf(cardElOf(card(style)));
    assert.notEqual(struck, null, `the struck price is gone for ${style}`);
    assert.deepEqual(textClsOf(struck), [MUTED_LIGHT, MUTED_DARK]);
  }

  // UNFRAMED: nothing resets it, so the SECTION's value reaches the card.
  for (const style of [undefined, "plain", "border", "shadow"]) {
    const surface = surfaceOf(cardElOf(card(style)));
    assert.equal(
      [...surface.classList].some((c) => c.startsWith("[--pb-text-muted:")),
      false,
      `cardStyle '${String(style)}' reset the muted token while painting nothing`,
    );
  }

  // FRAMED: the card paints, so it hands the token back to the theme's value —
  // beside the `--text-primary` pin 01b put there, which is the point of the
  // symmetry.
  for (const style of ["filled", "gradient", "promo"]) {
    const surface = surfaceOf(cardElOf(card(style)));
    const cls = [...surface.classList];
    assert.ok(
      cls.includes("[--pb-text-muted:var(--9e-slate-dp-50)]"),
      `cardStyle '${style}' paints a surface but does not own the muted token on it`,
    );
    assert.ok(
      cls.includes("text-[var(--text-primary)]"),
      `cardStyle '${style}' lost the primary pin — the two must travel together`,
    );
  }

  // …and the section really is setting it, or the unframed half above is
  // asserting the absence of something that was never there.
  assert.equal(
    styleMapOf(cardElOf(card("plain")).querySelector("section"))["--pb-text-muted"],
    "var(--9e-slate-dp-700)",
  );
});

// ── ROUND A-fix 3: the prose palette, reached by attribute ─────────────────

/**
 * `rich_text` was the one consumer neither of the two earlier mechanisms could
 * reach. It does not inherit the section's ink and it names no class of its
 * own: @tailwindcss/typography sets its palette as custom properties ON
 * `.prose` itself, and a property set on an element is not inherited into it.
 *
 * So globals.css overrides those properties, scoped to an attribute. What this
 * tier can assert is the ATTRIBUTE — which sections carry it, and that the
 * variables it depends on travel with it. Whether the rule then WINS is a
 * question about the compiled stylesheet, and is asserted where that can be
 * seen: test/fs/proseOnAuthoredBackground.
 */

const richText = (settings) => ({
  id: "r1",
  type: "rich_text",
  name: "",
  enabled: true,
  sortOrder: 0,
  content: {
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "ปกติ " },
            { type: "text", marks: [{ type: "bold" }], text: "ตัวหนา" },
          ],
        },
      ],
    },
  },
  settings,
  layout: {},
  style: {},
  advanced: {},
});

test("an authored background carries data-pb-auto-text, and the vars it needs", () => {
  const doc = cardElOf(richText(AUTHORED_DARK));
  const section = doc.querySelector("section");
  assert.equal(section.getAttribute("data-pb-auto-text"), "");

  // The rule sets three properties FROM these two. If the attribute were ever
  // emitted without them, every prose colour would be invalid-at-computed-value
  // time — a blank page rather than a wrong colour — so the pair is asserted
  // together rather than the attribute alone.
  const style = styleMapOf(section);
  assert.equal(style["--pb-text"], "var(--9e-ice)");
  assert.equal(style["--pb-text-muted"], "var(--9e-slate-dp-700)");

  // …and the run that disappears really is in there, naming no colour of its
  // own, so the plugin's variable is what paints it.
  const strong = doc.querySelector("strong");
  assert.notEqual(strong, null, "the bold run is gone — the fixture proves nothing");
  assert.deepEqual(textClsOf(strong), []);
});

test("a LIGHT authored background gets the other end of the same pair", () => {
  // One decision, two variables: the primary and the muted move together, and
  // both follow the token `autoTextToken` chose rather than being set apart.
  const style = styleMapOf(
    cardElOf(
      richText({ backgroundMode: "custom", backgroundCustom: { from: "#f8e7d5" } }),
    ).querySelector("section"),
  );
  assert.equal(style["--pb-text"], "var(--9e-navy)");
  assert.equal(style["--pb-text-muted"], "var(--9e-slate-dp-50)");
});

test("the attribute is NARROWER than data-pb-custom-bg — textMode 'theme' opts out", () => {
  /**
   * The hole this attribute exists to close, asserted as the difference between
   * the two. Keying the stylesheet on `data-pb-custom-bg` would have overridden
   * the prose palette on a section whose author asked, by name, to keep the
   * theme's text.
   */
  const section = cardElOf(
    richText({ ...AUTHORED_DARK, textMode: "theme" }),
  ).querySelector("section");

  assert.equal(
    section.getAttribute("data-pb-custom-bg"),
    "flat",
    "the fixture no longer has a custom background, so it proves nothing",
  );
  assert.equal(section.getAttribute("data-pb-auto-text"), null);
  assert.equal(section.getAttribute("style"), "--pb-cbg-from:#123456");
});

test("no authored background means no attribute at all", () => {
  for (const bg of ["default", "white", "light", "soft_gray", "dark"]) {
    const section = cardElOf(richText({ background: bg })).querySelector("section");
    assert.equal(
      section.getAttribute("data-pb-auto-text"),
      null,
      `${bg} emitted the prose-override attribute`,
    );
    assert.equal(section.getAttribute("style"), null);
  }
});
