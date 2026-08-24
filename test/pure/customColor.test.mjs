import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HEX_COLOR_RE,
  isHexColor,
  hexOrNull,
  COLOR_MODES,
  GRADIENT_DIRECTIONS,
  DEFAULT_GRADIENT_DIRECTION,
  customBackgroundStyle,
  hasCustomBackground,
  THEME_TEXT_RGB,
  contrastRatio,
  CONTRAST_MIN,
  backgroundContrastOk,
  accentContrastOk,
} from "@/lib/pageBuilder/customColor";
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import {
  backgroundClass,
  isDarkBackground,
  accentVars,
  backgroundClassFor,
  backgroundStyleFor,
  isDarkBackgroundFor,
  accentVarsFor,
} from "@/lib/pageBuilder/presets";
import {
  BACKGROUNDS,
  ACCENTS,
  settingsSchema,
  styleSchema,
} from "@/lib/schemas/sections/base";
import {
  DRAFT_CONTENT_KEYS,
  LIVE_ONLY_KEYS,
  pageBuilderSchema,
} from "@/lib/schemas/pageBuilder";
import { readSource } from "../sourceScan.mjs";

/**
 * Round 39 — the custom-colour model, without a browser.
 *
 * Everything about how a colour RESOLVES is here. What a colour LOOKS LIKE once
 * the browser has followed a var-through-var chain is not, and cannot be: JSDOM
 * resolves none of it (rounds 23-25), so the visual claims are measured in
 * Chrome and reported with the round rather than asserted here.
 */

// ── B. what is accepted, and what is refused ───────────────────────────────

/**
 * The forms this system takes, and the forms it refuses — each refusal with the
 * reason it is a refusal rather than an omission. Written out so a failure says
 * WHICH form changed side.
 */
const ACCEPTED = ["#0d1b2a", "#F8FAFD", "#000000", "#ffffff", "#AbCdEf"];

const REFUSED = Object.freeze({
  "#abc": "three-digit shorthand — a second spelling of one colour",
  "#0d1b2aff":
    "eight-digit alpha — a colour nobody can predict over an unknown surface",
  "0d1b2a": "no hash — not a CSS colour at all",
  "#0d1b2": "five digits",
  "#0d1b2az": "a non-hex digit",
  "rgb(13,27,42)": "a second vocabulary for the same value",
  navy: "a named colour — a third vocabulary",
  "#0d1b2a;": "a trailing semicolon — the style-injection shape",
  "#0d1b2a; color:red": "a full injection attempt",
  " #0d1b2a": "leading whitespace",
  "#0d1b2a ": "trailing whitespace",
  "var(--9e-navy)":
    "a token reference — legitimate elsewhere, not an author colour",
});

test("the accepted forms are exactly six digits, either case", () => {
  for (const v of ACCEPTED) {
    assert.equal(isHexColor(v), true, `${v} is no longer accepted`);
    assert.equal(
      hexOrNull(v),
      v,
      "an accepted value was rewritten rather than passed through",
    );
  }
});

test("every refused form is refused, and each names why", () => {
  for (const [value, why] of Object.entries(REFUSED)) {
    assert.equal(
      isHexColor(value),
      false,
      `"${value}" is now accepted as an author colour. It was refused because it is ${why}.`,
    );
    assert.equal(
      hexOrNull(value),
      null,
      `"${value}" did not fall back to null`,
    );
  }
  // Non-strings too — a directly-seeded document can carry anything.
  for (const v of [null, undefined, 42, {}, [], true])
    assert.equal(hexOrNull(v), null);
});

test("the SCHEMA refuses the same set the render layer refuses", () => {
  /**
   * TWO LAYERS, and they are named honestly as two rather than three. The
   * schema is the WRITE gate — the action layer validates through it, so
   * "the action rejects it" and "the schema rejects it" are one mechanism, not
   * two independent ones, and claiming two would overstate the guard.
   *
   * The second, genuinely independent layer is hexOrNull at RENDER: a document
   * seeded straight into Mongo never passed the schema at all, and presets.js
   * has carried that warning since Phase 2.
   */
  for (const value of Object.keys(REFUSED)) {
    assert.equal(
      styleSchema.safeParse({ accentMode: "custom", accentCustom: value })
        .success,
      false,
      `the schema now stores "${value}" as an accent`,
    );
    assert.equal(
      settingsSchema.safeParse({ backgroundCustom: { from: value } }).success,
      false,
      `the schema now stores "${value}" as a background stop`,
    );
  }
  for (const value of ACCEPTED) {
    assert.equal(
      styleSchema.safeParse({ accentMode: "custom", accentCustom: value })
        .success,
      true,
    );
  }
});

test("an INVALID stored value renders the default, never a broken style", () => {
  // The render layer, driven with values the schema would have refused — which
  // is exactly the case the render layer exists for.
  for (const value of Object.keys(REFUSED)) {
    assert.equal(
      backgroundStyleFor({
        backgroundMode: "custom",
        backgroundCustom: { from: value },
      }),
      undefined,
      `"${value}" reached a style attribute`,
    );
    // …and the preset class comes back, so the section is not left unpainted.
    assert.equal(
      backgroundClassFor({
        backgroundMode: "custom",
        background: "dark",
        backgroundCustom: { from: value },
      }),
      backgroundClass("dark"),
    );
    assert.equal(
      accentVarsFor({ accentMode: "custom", accentCustom: value }),
      undefined,
    );
  }
});

test("the schema accepts EMPTY for the second stop, and nothing else non-hex", () => {
  // Empty is a VALUE here — it is how "one stop" is spelled.
  assert.equal(
    settingsSchema.safeParse({ backgroundCustom: { from: "#000000", to: "" } })
      .success,
    true,
  );
  assert.equal(
    settingsSchema.safeParse({
      backgroundCustom: { from: "#000000", to: "#abc" },
    }).success,
    false,
  );
});

// ── D2 / E. one stop and two stops are different things ────────────────────

test("ONE stop emits a flat colour, not a gradient with two identical stops", () => {
  assert.deepEqual(customBackgroundStyle({ from: "#0d1b2a" }), {
    backgroundColor: "#0d1b2a",
  });
  assert.deepEqual(customBackgroundStyle({ from: "#0d1b2a", to: "" }), {
    backgroundColor: "#0d1b2a",
  });
  // A direction with no second stop changes nothing — there is nothing to
  // traverse, and emitting a gradient anyway would invent a stop.
  assert.deepEqual(
    customBackgroundStyle({ from: "#0d1b2a", to: "", direction: "to_right" }),
    { backgroundColor: "#0d1b2a" },
  );
});

test("TWO stops emit a gradient — even when the two are equal", () => {
  /**
   * The distinction D2 asks about. An author who left the second stop empty
   * said "one colour"; an author who set it to the same value said "a gradient
   * between these two". Collapsing the second into the first would rewrite an
   * authored value, and would then surprise whoever edited only the first stop
   * and expected a gradient to appear.
   */
  assert.deepEqual(customBackgroundStyle({ from: "#0d1b2a", to: "#0d1b2a" }), {
    backgroundImage: "linear-gradient(to bottom, #0d1b2a, #0d1b2a)",
  });
  assert.notDeepEqual(
    customBackgroundStyle({ from: "#0d1b2a", to: "#0d1b2a" }),
    customBackgroundStyle({ from: "#0d1b2a" }),
    "an empty second stop and a duplicated first stop produced the same style",
  );
});

test("every direction emits its own CSS, and an unknown one falls back", () => {
  const emitted = GRADIENT_DIRECTIONS.map(
    (d) =>
      customBackgroundStyle({ from: "#000000", to: "#ffffff", direction: d })
        .backgroundImage,
  );
  assert.deepEqual(emitted, [
    "linear-gradient(to bottom, #000000, #ffffff)",
    "linear-gradient(to top, #000000, #ffffff)",
    "linear-gradient(to right, #000000, #ffffff)",
    "linear-gradient(to left, #000000, #ffffff)",
    "linear-gradient(to bottom right, #000000, #ffffff)",
    "linear-gradient(to bottom left, #000000, #ffffff)",
  ]);
  assert.equal(
    new Set(emitted).size,
    emitted.length,
    "two directions emit the same CSS",
  );
  // A direction the enum does not know resolves to the default rather than
  // producing `linear-gradient(undefined, …)`.
  assert.equal(
    customBackgroundStyle({
      from: "#000000",
      to: "#ffffff",
      direction: "sideways",
    }).backgroundImage,
    customBackgroundStyle({
      from: "#000000",
      to: "#ffffff",
      direction: DEFAULT_GRADIENT_DIRECTION,
    }).backgroundImage,
  );
});

test("a second stop with NO first stop is not a background at all", () => {
  // `from` is the required stop; a `to` alone is an incomplete choice, not a
  // flat colour of the second value.
  assert.equal(customBackgroundStyle({ to: "#ffffff" }), null);
  assert.equal(customBackgroundStyle({}), null);
  assert.equal(customBackgroundStyle(undefined), null);
});

// ── A. the preset path is untouched ────────────────────────────────────────

/**
 * The values the REAL corpus stores today — measured read-only, round 39 L:
 * 18 live sections carrying `default`×14, `dark`×2, `soft_gray`×1,
 * `brand_gradient`×1, and one `green` accent. Written out so this check is
 * about the documents that exist, not about the enum.
 */
const STORED_BACKGROUNDS = ["default", "dark", "soft_gray", "brand_gradient"];
const STORED_ACCENTS = ["green"];

test("every stored preset value resolves EXACTLY as it did before this round", () => {
  /**
   * A's load-bearing property. The new resolvers ask one question — did the
   * author choose custom? — and a document written before this round cannot
   * have. So each of them must be indistinguishable from the function it wraps.
   *
   * Asserted over the WHOLE enum, not only the four values stored today: a
   * restore from a stored version snapshot (22 sections) or a page created
   * tomorrow can carry any of them.
   */
  for (const bg of BACKGROUNDS) {
    const settings = { background: bg };
    assert.equal(
      backgroundClassFor(settings),
      backgroundClass(bg),
      `background "${bg}" moved`,
    );
    assert.equal(
      isDarkBackgroundFor(settings),
      isDarkBackground(bg),
      `darkness of "${bg}" moved`,
    );
    assert.equal(
      backgroundStyleFor(settings),
      undefined,
      `background "${bg}" gained an inline style`,
    );
  }
  for (const a of ACCENTS) {
    assert.deepEqual(
      accentVarsFor({ accentColor: a }),
      accentVars(a),
      `accent "${a}" moved`,
    );
  }
  // A section with no style at all still produces no override.
  assert.equal(accentVarsFor({}), undefined);
  assert.equal(accentVarsFor(undefined), undefined);
});

test("the four values the corpus ACTUALLY stores are covered by the sweep above", () => {
  // Without this, the sweep could pass over an enum that no longer contains
  // what the database holds — and the no-change claim would be about values
  // nobody has.
  for (const bg of STORED_BACKGROUNDS)
    assert.ok(BACKGROUNDS.includes(bg), `${bg} left the enum`);
  for (const a of STORED_ACCENTS)
    assert.ok(ACCENTS.includes(a), `${a} left the enum`);
});

test("CONTROL: the comparison WOULD notice the preset path moving", () => {
  // Without this, "every value resolves as before" passes for a comparison of
  // a function with itself.
  assert.throws(
    () => assert.equal(backgroundClass("dark"), backgroundClass("white")),
    "the two preset classes are equal, so the sweep compares nothing",
  );
  assert.notDeepEqual(accentVars("green"), accentVars("purple"));
});

test("a stored section gains NOTHING when it is re-validated", () => {
  /**
   * The other half of "nothing changes for a page nobody edits": the schema
   * must not write new keys into a section that merely passes through it. Every
   * round-39 field is optional with NO default, so a parse of an old block
   * returns the old keys and only those.
   */
  const old = {
    containerWidth: "large",
    spacingTop: "medium",
    spacingBottom: "medium",
    background: "dark",
    visibility: "all",
  };
  assert.deepEqual(
    Object.keys(settingsSchema.parse(old)).sort(),
    Object.keys(old).sort(),
  );
  assert.deepEqual(Object.keys(styleSchema.parse({ accentColor: "green" })), [
    "accentColor",
  ]);
  // An EMPTY block still fills only the five fields that always had defaults.
  assert.deepEqual(Object.keys(settingsSchema.parse(undefined)).sort(), [
    "background",
    "containerWidth",
    "spacingBottom",
    "spacingTop",
    "visibility",
  ]);
  assert.deepEqual(styleSchema.parse(undefined), {});
});

test("the page-level DRAFT/LIVE partition is unmoved", () => {
  /**
   * Round 22's cross-source check operates on PAGE keys. This round added
   * fields INSIDE a section's settings and style, and `sections` is one page
   * key either way — so the partition cannot have moved, and this says so
   * rather than leaving it to be inferred.
   */
  assert.deepEqual(DRAFT_CONTENT_KEYS, [
    "title",
    "sections",
    "theme",
    "showHeader",
    "showFooter",
    "showStickyCta",
    "seo",
    "jsonLd",
    "promotionCover",
  ]);
  const all = Object.keys(pageBuilderSchema.shape);
  assert.deepEqual(
    [...DRAFT_CONTENT_KEYS, ...LIVE_ONLY_KEYS].sort(),
    [...all].sort(),
  );
  assert.equal(
    DRAFT_CONTENT_KEYS.filter((k) => LIVE_ONLY_KEYS.includes(k)).length,
    0,
  );
});

// ── D1. the two modes have different contracts ─────────────────────────────

test("a PRESET colour resolves through a var; a CUSTOM one is a literal", () => {
  /**
   * The structural half of "a custom colour does not follow dark mode". A var()
   * is resolved by the browser against whichever theme is active; a literal is
   * the same string in both. What that LOOKS like is measured in Chrome — this
   * pins the mechanism that makes the measurement come out that way.
   */
  for (const a of ACCENTS) {
    for (const v of Object.values(accentVars(a))) {
      assert.match(
        v,
        /^var\(--/,
        `preset accent "${a}" resolved to something other than a token`,
      );
    }
  }
  const custom = accentVarsFor({
    accentMode: "custom",
    accentCustom: "#123456",
  });
  assert.equal(custom["--pb-accent-fill"], "#123456");
  assert.equal(
    custom["--pb-accent-text"],
    "#123456",
    "a custom accent was degraded — the author chose it",
  );
  // Only `on` is a token, and it is the one value the author did not choose.
  assert.match(custom["--pb-accent-on"], /^var\(--/);
});

test("--pb-accent-on flips with the accent luminance, and only that one var", () => {
  const dark = accentVarsFor({ accentMode: "custom", accentCustom: "#000000" });
  const light = accentVarsFor({
    accentMode: "custom",
    accentCustom: "#ffffff",
  });
  assert.notEqual(
    dark["--pb-accent-on"],
    light["--pb-accent-on"],
    "a black and a white accent got the same text colour on the fill",
  );
  // The other two are the author's value in both cases — nothing else moved.
  assert.equal(dark["--pb-accent-fill"], "#000000");
  assert.equal(light["--pb-accent-fill"], "#ffffff");
});

test("a custom BACKGROUND never asks for light text — the theme keeps that", () => {
  // D4 as code. Deriving text from the background is the second authority
  // rounds 21-25 removed from container.jsx.
  for (const from of ["#000000", "#ffffff", "#0d1b2a"]) {
    assert.equal(
      isDarkBackgroundFor({
        backgroundMode: "custom",
        backgroundCustom: { from },
      }),
      false,
      "a custom background decided the section text colour",
    );
  }
  // …while the preset list still does, for the two values it always did.
  assert.equal(isDarkBackgroundFor({ background: "dark" }), true);
  assert.equal(isDarkBackgroundFor({ background: "brand_gradient" }), true);
});

test("the preset class is SUPPRESSED when a custom background takes over", () => {
  // Two things painting one surface is what the mode exists to prevent.
  const settings = {
    background: "dark",
    backgroundMode: "custom",
    backgroundCustom: { from: "#ffffff" },
  };
  assert.equal(backgroundClassFor(settings), "");
  /**
   * ── ROUND 79 CHANGED THE CLAIM HERE, NOT JUST THE EXPECTATION ───────────
   * This used to read `{ backgroundColor: '#ffffff' }` — a FINISHED
   * declaration, emitted inline. A finished inline declaration has no selector
   * and therefore can never have a `.dark` counterpart, which is precisely why
   * an author's colour could not follow the theme.
   *
   * `backgroundStyleFor` now emits the author's value as a CUSTOM PROPERTY and
   * globals.css builds the declaration from it, once per theme. The invariant
   * this test protects is unchanged and is the one still asserted above: the
   * preset class is suppressed, so two things never paint one surface. What the
   * author's colour travels AS is what moved.
   *
   * `customBackgroundStyle` still returns the finished form and is still
   * exported — it is what the contrast warning and the editor preview reason
   * about — so the old shape is asserted directly, one line down.
   */
  assert.deepEqual(backgroundStyleFor(settings), {
    "--pb-cbg-from": "#ffffff",
  });
  assert.deepEqual(
    customBackgroundStyle(settings.backgroundCustom),
    { backgroundColor: "#ffffff" },
    "the finished-declaration form is gone, so the contrast warning and the editor preview " +
      "no longer share a definition of what the author asked for",
  );
  // …and choosing custom without a valid colour leaves the preset in place,
  // rather than a section with no background at all.
  const half = {
    background: "dark",
    backgroundMode: "custom",
    backgroundCustom: {},
  };
  assert.equal(backgroundClassFor(half), backgroundClass("dark"));
  assert.equal(backgroundStyleFor(half), undefined);
});

test("hasCustomBackground needs BOTH the mode and a usable colour", () => {
  assert.equal(
    hasCustomBackground({ backgroundCustom: { from: "#000000" } }),
    false,
    "mode not chosen",
  );
  assert.equal(
    hasCustomBackground({ backgroundMode: "custom" }),
    false,
    "no colour",
  );
  assert.equal(
    hasCustomBackground({
      backgroundMode: "preset",
      backgroundCustom: { from: "#000000" },
    }),
    false,
  );
  assert.equal(
    hasCustomBackground({
      backgroundMode: "custom",
      backgroundCustom: { from: "#000000" },
    }),
    true,
  );
  assert.deepEqual(COLOR_MODES, ["preset", "custom"]);
});

// ── D4. the contrast warning ───────────────────────────────────────────────

test("the theme text triples still equal the tokens they mirror", () => {
  /**
   * The one place a real colour value is written into source, and the check
   * that keeps it from becoming a decision of its own. Read from
   * tailwind.config.js and converted here, so a token edit reddens this rather
   * than silently moving the contrast maths off the real colours.
   */
  const config = readSource("tailwind.config.js").raw;
  const tokenRgb = (name) => {
    const m = config.match(new RegExp(`${name}:\\s*'#([0-9a-fA-F]{6})'`));
    assert.ok(
      m,
      `tailwind.config.js no longer declares a 6-digit hex for "${name}"`,
    );
    return [1, 3, 5].map((i) => parseInt(`#${m[1]}`.slice(i, i + 2), 16));
  };
  assert.deepEqual([...THEME_TEXT_RGB.navy], tokenRgb("navy"));
  assert.deepEqual([...THEME_TEXT_RGB.ice], tokenRgb("ice"));
  assert.deepEqual(Object.keys(THEME_TEXT_RGB).sort(), ["ice", "navy"]);
});

test("contrastRatio matches WCAG at the two ends of the range", () => {
  // Black on white is 21:1 exactly; a colour against itself is 1:1.
  assert.equal(
    Math.round(contrastRatio([0, 0, 0], [255, 255, 255]) * 100) / 100,
    21,
  );
  assert.equal(contrastRatio([13, 27, 42], [13, 27, 42]), 1);
  assert.equal(CONTRAST_MIN, 4.5); // WCAG 2.1 SC 1.4.3, normal text
});

test("the background warning fires only when NEITHER theme text can be read", () => {
  // A mid grey no text survives on.
  assert.equal(backgroundContrastOk({ from: "#808080" }), false);
  // White: navy reads on it. Near-black: ice reads on it. Neither warns.
  assert.equal(backgroundContrastOk({ from: "#ffffff" }), true);
  assert.equal(backgroundContrastOk({ from: "#000000" }), true);
  // No colour is not a warning.
  assert.equal(backgroundContrastOk({}), true);
  assert.equal(backgroundContrastOk({ from: "nonsense" }), true);
});

test("the accent warning fires on a colour too pale to read as text", () => {
  assert.equal(
    accentContrastOk("#ffff00"),
    false,
    "yellow passed as body text on a light page",
  );
  assert.equal(accentContrastOk("#0d1b2a"), true);
  assert.equal(
    accentContrastOk(""),
    true,
    "an empty value warned about nothing",
  );
});

test("CONTROL: the contrast helper discriminates — it is not a constant", () => {
  // Without this, both warnings above could be a function that returns one value.
  //
  // The first version of this control mapped bare STRINGS over
  // backgroundContrastOk, which reads `custom.from` — so every call took the
  // null branch and answered `true`. It went red, which is what a control is
  // for; the shape is spelled out here so it cannot happen again silently.
  const answers = ["#ffffff", "#808080", "#000000"].map((from) =>
    backgroundContrastOk({ from }),
  );
  assert.deepEqual(answers, [true, false, true]);
  assert.equal(new Set(["#ffff00", "#0d1b2a"].map(accentContrastOk)).size, 2);
});

test("the two warnings ask DIFFERENT questions, and yellow proves it", () => {
  /**
   * Measured, and it is why there are two helpers rather than one shared
   * threshold applied twice. Yellow against navy is 16.20:1 and against ice is
   * 1.03:1, so it is a perfectly readable BACKGROUND and an unreadable ACCENT
   * TEXT. A single warning would have to be wrong about one of those.
   */
  assert.equal(backgroundContrastOk({ from: "#ffff00" }), true);
  assert.equal(accentContrastOk("#ffff00"), false);
  // And the reverse case: near-black is a fine accent and a fine background.
  assert.equal(backgroundContrastOk({ from: "#0d1b2a" }), true);
  assert.equal(accentContrastOk("#0d1b2a"), true);
});

// ── the raw-hex guard, and why the new path does not weaken it ─────────────

test("no round-39 SOURCE file carries a hex literal", () => {
  /**
   * The distinction this round rests on. Round 30 bans a hex LITERAL in source
   * because it is a design decision that opts a surface out of dark mode. An
   * author's colour is DATA that arrives at runtime — the scanner cannot see it
   * and correctly should not.
   *
   * So the ban is not weakened, and the way to show that is to hold the new
   * files to it. `customColor.js` writes the two theme text colours as CHANNEL
   * TRIPLES precisely so it can pass this, and the test above pins those
   * triples to the tokens.
   */
  const rawColors = (code) =>
    [
      ...new Set([
        ...(code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []),
        ...(code.match(/rgba?\(\s*[\d.][^)]*\)/g) ?? []),
      ]),
    ].sort();
  for (const rel of [
    "src/lib/pageBuilder/customColor.js",
    "src/lib/pageBuilder/presets.js",
    "src/lib/schemas/sections/base.js",
  ]) {
    assert.deepEqual(
      rawColors(readSource(rel).code),
      [],
      `${rel} carries a raw colour literal. An author's colour is data; a colour written into ` +
        "source is a decision, and round 30 bans the second without touching the first.",
    );
  }
});

test("CONTROL: that same scanner DOES see a hex, and reads the regex as none", () => {
  const rawColors = (code) =>
    [
      ...new Set([
        ...(code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []),
        ...(code.match(/rgba?\(\s*[\d.][^)]*\)/g) ?? []),
      ]),
    ].sort();
  assert.deepEqual(rawColors('const a = "#0D1B2A";'), ["#0D1B2A"]);
  // The validation regex itself is not a colour — if it were, the ban and the
  // feature could not coexist in one file.
  assert.deepEqual(rawColors(String(HEX_COLOR_RE)), []);
  assert.deepEqual(rawColors("const t = [13, 27, 42];"), []);
});
