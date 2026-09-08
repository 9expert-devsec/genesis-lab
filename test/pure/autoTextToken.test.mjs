import { test } from "node:test";
import assert from "node:assert/strict";

import {
  autoTextToken,
  contrastRatio,
  THEME_TEXT_RGB,
  CONTRAST_MIN,
} from "@/lib/pageBuilder/customColor";

/**
 * Round 80 — which of the theme's two text tokens survives an author's colour.
 *
 * ── WHAT THIS TIER CAN SEE ────────────────────────────────────────────────
 * All of it. The function is arithmetic over two channel triples the module
 * already pins against tailwind.config.js, and it returns a NAME rather than a
 * colour — so there is nothing here a browser would have to confirm. The class
 * that name becomes, and the surface it lands on, are the render tier's job
 * (test/render/autoTextOnCustomBackground).
 */

/** `#rrggbb` → [r, g, b]. The test tier's own, so the module exports nothing new. */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const ratio = (hex, token) => contrastRatio(rgb(hex), THEME_TEXT_RGB[token]);

test("a DARK author colour takes the light token", () => {
  // #123456: 1.37:1 against the dark text token, 12.16:1 against the light one.
  // The first number is the defect this round exists for — it is what the
  // theme's near-navy scored on this surface, and 1.37 is not readable text.
  assert.equal(autoTextToken({ from: "#123456" }), "ice");
  assert.ok(ratio("#123456", "navy") < CONTRAST_MIN);
  assert.ok(ratio("#123456", "ice") >= CONTRAST_MIN);
});

test("a LIGHT author colour takes the dark token", () => {
  // #f8e7d5 — the hero's first stop on /promotions/early-bird-claude-code.
  // 14.40:1 navy, 1.16:1 ice. The incumbent answer, and still the right one:
  // this round changes what happens to the OTHER kind of colour.
  assert.equal(autoTextToken({ from: "#f8e7d5" }), "navy");
  assert.ok(ratio("#f8e7d5", "navy") >= CONTRAST_MIN);
  assert.ok(ratio("#f8e7d5", "ice") < CONTRAST_MIN);
});

test("no honourable custom background is null, not a token", () => {
  /**
   * The same contract as customBackgroundStyle and customBackgroundVars, which
   * is what lets the resolver in presets.js treat all three identically. A
   * directly-seeded Mongo document can carry any of these.
   */
  for (const bad of [
    undefined,
    null,
    {},
    { from: undefined },
    { from: "" },
    { from: "#abc" },
    { from: "#12345" },
    { from: "#1234567" },
    { from: "rgb(1,2,3)" },
    { from: "navy" },
    { from: "#123456; color:red" },
    { from: 0x123456 },
  ]) {
    assert.equal(
      autoTextToken(bad),
      null,
      `${JSON.stringify(bad)} produced a token`,
    );
  }
  // A bad SECOND stop is not a bad background — it is one stop, which is the
  // same reading customBackgroundStyle gives it.
  assert.equal(autoTextToken({ from: "#123456", to: "#abc" }), "ice");
});

// ── the two-stop rule, and the control that makes it a rule ────────────────

/**
 * #555555 → #ffffff. Chosen because the two stops DISAGREE:
 *
 *   stop      navy    ice
 *   #555555   2.33    7.13   ← ice wins here
 *   #ffffff  17.39    1.05   ← navy wins here, and ice is invisible
 *
 * Worst case across both: navy 2.33, ice 1.05. So navy, and the section is
 * legible at the dark end and excellent at the light one — where ice would have
 * been comfortable at the top of the gradient and gone at the bottom.
 */
const DISAGREEING = { from: "#555555", to: "#ffffff" };

test("a gradient is judged on BOTH stops, so the token survives the whole surface", () => {
  assert.equal(autoTextToken(DISAGREEING), "navy");
  // The numbers the choice rests on, so a future edit to the ranking cannot
  // pass by moving the fixture instead.
  assert.ok(ratio("#ffffff", "ice") < ratio("#555555", "navy"));
});

test("CONTROL: judged on the FIRST stop alone, that same fixture answers ice", () => {
  /**
   * Without this the two-stop rule is untested — a one-stop implementation
   * returns the right answer for every flat colour and for any gradient whose
   * stops happen to agree, which is most of them.
   *
   * `backgroundContrastOk` really does judge the first stop only, deliberately
   * (customColor.js says why), so this is not a hypothetical implementation: it
   * is the reach the WARNING has, asked of the same fixture, giving the other
   * answer.
   */
  assert.equal(autoTextToken({ from: DISAGREEING.from }), "ice");
  assert.notEqual(
    autoTextToken({ from: DISAGREEING.from }),
    autoTextToken(DISAGREEING),
  );
});

test("the answer is TOTAL and the tie policy holds across the whole grey axis", () => {
  /**
   * Two claims in one sweep, over the 256 greys — the axis the two tokens
   * actually compete on, and the one an author reaches by dragging a picker's
   * saturation to zero.
   *
   * TOTAL: every honourable colour gets one of the two names. Never null, never
   * undefined, never both.
   *
   * THE TIE POLICY: navy wins whenever navy's ratio is GREATER THAN OR EQUAL
   * to ice's. Exact equality is unreachable in float arithmetic on 8-bit
   * channels, so it is asserted the only way it can be observed — as the rule
   * governing every point, which is what `>=` vs `>` means in practice. The
   * crossover is measured at #7b7b7b (navy 4.11, ice 4.05); one step lighter is
   * still ice at #767676 (navy 3.83, ice 4.34).
   */
  let flips = 0;
  for (let v = 0; v < 256; v += 1) {
    const hex = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
    const token = autoTextToken({ from: hex });
    assert.ok(
      token === "navy" || token === "ice",
      `${hex} produced ${String(token)}`,
    );
    assert.equal(
      token,
      ratio(hex, "navy") >= ratio(hex, "ice") ? "navy" : "ice",
      `${hex} did not follow the stated >= rule`,
    );
    if (v > 0 && token !== autoTextToken({ from: `#${(v - 1).toString(16).padStart(2, "0").repeat(3)}` }))
      flips += 1;
  }
  // One crossover, not a scatter — the ranking is monotone in lightness, which
  // is what makes the choice explicable to an author who nudges their colour.
  assert.equal(flips, 1);
  assert.equal(autoTextToken({ from: "#7b7b7b" }), "navy");
  assert.equal(autoTextToken({ from: "#767676" }), "ice");
});
