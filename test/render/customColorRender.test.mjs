import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { readdirSync } from "node:fs";

import {
  SectionRenderer,
  RENDERABLE_SECTION_TYPES,
} from "@/components/pageBuilder/SectionRenderer";
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { backgroundClass, accentVars } from "@/lib/pageBuilder/presets";
import { readSource } from "../sourceScan.mjs";

/**
 * Round 39 commit 2 — the renderer honours the two modes.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE, SAID FIRST ─────────────────────────
 * It sees the EMITTED attributes: which class the wrapper carries, which inline
 * properties, which custom properties, and — for the cascade — where a child
 * sits relative to the element that declares them.
 *
 * It sees NO COLOUR. `var(--pb-accent-fill)` is a string here; only a browser
 * follows a var-through-var chain, and JSDOM resolves none of it (rounds
 * 23-25). Every visual claim in this round is measured in Chrome and reported
 * with it. What is asserted here is the mechanism that makes those measurements
 * come out the way they do.
 */

const html = (section) =>
  renderToStaticMarkup(createElement(SectionRenderer, { section }));
const docOf = (markup) =>
  new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
const wrapperOf = (section) => docOf(html(section)).querySelector("section");

const sec = (over = {}) => ({
  id: "s1",
  type: "heading",
  name: "",
  enabled: true,
  sortOrder: 0,
  content: { text: "หัวข้อ", level: 2 },
  settings: {},
  layout: {},
  style: {},
  advanced: {},
  ...over,
});

/** The wrapper's inline declarations as a { prop: value } map. */
const styleMap = (el) => {
  const out = {};
  for (const part of (el?.getAttribute("style") ?? "").split(";")) {
    const at = part.indexOf(":");
    if (at === -1) continue;
    out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
};

// ── A, continued: the preset path renders what it always rendered ──────────

test("a section with a PRESET background renders the class and no inline style", () => {
  for (const bg of [
    "default",
    "white",
    "light",
    "soft_gray",
    "dark",
    "brand_gradient",
  ]) {
    const el = wrapperOf(sec({ settings: { background: bg } }));
    const cls = backgroundClass(bg);
    if (cls)
      assert.ok(
        el.className.split(/\s+/).includes(cls),
        `${bg} lost its class`,
      );
    assert.equal(
      el.getAttribute("style"),
      null,
      `a preset background emitted an inline style — "${bg}" would now differ from HEAD`,
    );
  }
});

test("a section with a PRESET accent emits the three token variables", () => {
  const el = wrapperOf(sec({ style: { accentColor: "green" } }));
  assert.deepEqual(styleMap(el), {
    "--pb-accent-fill": accentVars("green")["--pb-accent-fill"],
    "--pb-accent-text": accentVars("green")["--pb-accent-text"],
    "--pb-accent-on": accentVars("green")["--pb-accent-on"],
  });
  // Every one is a token reference, which is what makes it follow dark mode.
  for (const v of Object.values(styleMap(el))) assert.match(v, /^var\(--/);
});

test("a section with NO colour choice emits no style attribute at all", () => {
  // The byte-identical case — 14 of the 18 live sections in the corpus.
  assert.equal(wrapperOf(sec()).getAttribute("style"), null);
  assert.equal(
    wrapperOf(sec({ settings: { background: "default" } })).getAttribute(
      "style",
    ),
    null,
  );
});

// ── E. the gradient CSS ────────────────────────────────────────────────────

const customBg = (backgroundCustom) =>
  sec({
    settings: {
      background: "dark",
      backgroundMode: "custom",
      backgroundCustom,
    },
  });

/**
 * ── ROUND 79 MOVED WHERE THE DECLARATION IS BUILT ────────────────────────
 * These three tests asserted a FINISHED declaration in the style attribute:
 * `background-color: #123456`, `background-image: linear-gradient(...)`. An
 * inline declaration has no selector, so it can never have a `.dark`
 * counterpart — which is exactly why an author's colour could not follow the
 * theme, and exactly what round 79 fixed.
 *
 * The renderer now emits the author's values as CUSTOM PROPERTIES plus a
 * `data-pb-custom-bg` attribute, and globals.css builds the declaration from
 * them once per theme. The light rule is byte-identical to what these tests
 * used to assert, and that equivalence is checked directly against the
 * stylesheet in test/render/customColorDarkDerivation.test.mjs.
 *
 * SO THE CLAIM HERE NARROWS RATHER THAN WEAKENS: the author's exact hexes, the
 * chosen direction, and the one-stop/two-stop distinction all still reach the
 * page on the section wrapper, and the no-colour case still emits nothing.
 * What is no longer asserted here is the CSS property name, because this file
 * is no longer where it is decided.
 */
test("ONE stop reaches the page as a flat custom background", () => {
  const el = wrapperOf(customBg({ from: "#123456" }));
  assert.deepEqual(styleMap(el), { "--pb-cbg-from": "#123456" });
  assert.equal(
    el.getAttribute("data-pb-custom-bg"),
    "flat",
    "a one-stop background is not marked flat, so the gradient rule would paint it",
  );
  assert.equal(
    el.getAttribute("style").includes("linear-gradient"),
    false,
    "a one-stop background emitted a gradient",
  );
});

test("TWO stops reach the page with the stated direction", () => {
  const down = wrapperOf(
    customBg({ from: "#123456", to: "#abcdef", direction: "to_bottom" }),
  );
  const right = wrapperOf(
    customBg({ from: "#123456", to: "#abcdef", direction: "to_right" }),
  );
  for (const [el, dir] of [
    [down, "to bottom"],
    [right, "to right"],
  ]) {
    assert.equal(el.getAttribute("data-pb-custom-bg"), "gradient");
    assert.deepEqual(styleMap(el), {
      "--pb-cbg-from": "#123456",
      "--pb-cbg-to": "#abcdef",
      "--pb-cbg-dir": dir,
    });
  }
  // The direction must actually DIFFER between the two, or it reached the DOM
  // and changed nothing. Round 79 moved it from inside the gradient function
  // into `--pb-cbg-dir`, so that is what is compared; comparing
  // `background-image` here now compares undefined to undefined and passes on
  // a build where the direction was dropped entirely.
  assert.notEqual(
    styleMap(down)["--pb-cbg-dir"],
    styleMap(right)["--pb-cbg-dir"],
    "the direction reached the DOM but changed nothing",
  );
  // No flat colour underneath it — one property owns the surface, and the
  // stylesheet selects on the KIND rather than on which variables are set.
  assert.equal("background-color" in styleMap(down), false);
  assert.equal("--pb-cbg-to" in styleMap(down), true);
});

test("the preset background CLASS is gone when a custom colour takes over", () => {
  /**
   * Two things painting one surface is what the mode prevents. `dark` is set on
   * the fixture above precisely so its class would be visible if it survived.
   */
  const el = wrapperOf(customBg({ from: "#123456" }));
  assert.equal(
    el.className.split(/\s+/).includes(backgroundClass("dark")),
    false,
    "the preset class survived under the custom colour",
  );
  // …and the light-text class the preset carries is gone with it: a custom
  // background does not decide the section's text colour (D4).
  assert.equal(
    el.className.includes("text-9e-ice"),
    false,
    "a custom background set the section text colour — that authority is the theme's",
  );
});

test("an INVALID custom value falls back to the preset, rendered", () => {
  for (const bad of ["#abc", "rgb(1,2,3)", "#123456; color:red", "navy", ""]) {
    const el = wrapperOf(customBg({ from: bad }));
    assert.equal(
      el.getAttribute("style"),
      null,
      `"${bad}" reached the style attribute`,
    );
    assert.ok(
      el.className.split(/\s+/).includes(backgroundClass("dark")),
      `"${bad}" left the section with no background at all`,
    );
  }
});

// ── D. custom accent reaches EXACTLY the surfaces preset accent reaches ────

const SECTIONS_DIR = "src/components/pageBuilder/sections";

/**
 * The types that PAINT with the accent, derived the way the round-18/21 audit
 * tripwire derives it — from the source of the section components, not from a
 * list typed here. `cta` reaches it through the shared button helper.
 */
function accentPaintingTypes() {
  const files = readdirSync(
    new URL(`../../${SECTIONS_DIR}/`, import.meta.url),
  ).filter((f) => f.endsWith(".jsx"));
  const painting = files.filter((f) => {
    const { code } = readSource(`${SECTIONS_DIR}/${f}`);
    return /--pb-accent-/.test(code) || /accentButtonClass/.test(code);
  });
  return painting.map((f) => f.replace(/\.jsx$/, "")).sort();
}

/**
 * Enough content to make each accent-painting type actually draw its accent.
 * Without it the sweep below compares empty sets — see the assertion that names
 * which types painted.
 */
const CONTENT_FOR = {
  checklist: { items: [{ text: "หนึ่ง", checked: true }] },
  cta: {
    heading: "หัวข้อ",
    description: "คำอธิบาย",
    buttonLabel: "กดเลย",
    buttonHref: "/x",
  },
  rich_text: {
    doc: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "ข้อความ" }] },
      ],
    },
  },
  icon_card: { icon: "Star", title: "การ์ด", description: "เนื้อหา" },
  stat_card: { value: "99", label: "สถิติ" },
  price_card: {
    title: "แพ็กเกจ",
    price: "1,900",
    features: ["หนึ่ง"],
    buttonLabel: "ซื้อ",
    buttonHref: "/x",
  },
  timeline: { items: [{ title: "ขั้นที่หนึ่ง", body: "รายละเอียด" }] },
  tabs: { items: [{ title: "แท็บ", body: "เนื้อหา" }] },
  accordion: { items: [{ title: "หัวข้อ", body: "เนื้อหา" }] },
  highlight_grid: { children: [] },
  instructor_card: {
    name: "ผู้สอน",
    title: "อาจารย์",
    bio: "ประวัติ",
    specialties: ["Data"],
  },
  course_schedule: {},
};

const EXPECTED_ACCENT_TYPES = [
  "accordion",
  "checklist",
  "course_schedule",
  "cta",
  "icon_card",
  "instructor_card",
  "price_card",
  "rich_text",
  "stat_card",
  "tabs",
  "timeline",
];

/**
 * Which of the eleven actually PAINT from the fixture above — measured, not
 * predicted. Some need state a static render never reaches (the accordion's
 * open item) or upstream data the fixture has none of, and those are the render
 * tier's known limits rather than gaps in the feature. Named so the sweep's
 * non-vacuity is a fact rather than a hope.
 */
const PAINTS_FROM_FIXTURE = [
  "checklist",
  "cta",
  "icon_card",
  "price_card",
  "rich_text",
  "stat_card",
  "timeline",
];

/**
 * The other four, and why each is out of reach HERE rather than broken:
 *   accordion, tabs        — paint the OPEN/ACTIVE item, which is useState. A
 *                            static render only ever produces the closed branch,
 *                            and mounting a React root is forbidden in this tier
 *                            (isolation:'none' — one leaked root once cost 28
 *                            unrelated failures). Same limit itemAccents states.
 *   instructor_card,
 *   course_schedule        — draw from the upstream data prop the renderer is
 *                            handed, which this fixture has none of.
 * All four are measured in Chrome for round 39's browser pass, where the accent
 * is a resolved colour rather than a class string.
 */

test("the accent-consuming set is the eleven the audit names, unchanged", () => {
  assert.deepEqual(
    accentPaintingTypes(),
    EXPECTED_ACCENT_TYPES,
    "the set of types that paint with the accent moved. Round 39 changed the VALUE the " +
      "variables carry and nothing about which components read them — so this moving means " +
      "something else did. See docs/section-control-audit.md finding 2.",
  );
  assert.equal(EXPECTED_ACCENT_TYPES.length, 11);
});

test("CONTROL: the consumer scan names a type when one is added", () => {
  // Without this, the exact set above could be a scan that returns a constant.
  const withExtra = [...accentPaintingTypes(), "heading"].sort();
  assert.throws(
    () => assert.deepEqual(withExtra, EXPECTED_ACCENT_TYPES),
    "the comparison cannot see a twelfth consumer",
  );
  assert.equal(withExtra.includes("heading"), true);
});

test("a CUSTOM accent reaches every one of those eleven — and only by the same route", () => {
  /**
   * PER SURFACE, and this is the whole of D. The claim is not "a custom accent
   * works"; it is "a custom accent reaches EXACTLY the surfaces a preset
   * reaches, not more". Both are asserted for each of the 27 types by rendering
   * the same section twice — once preset, once custom — and comparing WHICH
   * elements reference an accent variable.
   *
   * That set has to be identical, type by type. A custom accent that reached
   * one extra surface would be a colour appearing somewhere an author has never
   * seen a colour appear, which is a worse defect than reaching one too few.
   */
  const refs = (section) =>
    [...docOf(html(section)).querySelectorAll("*")]
      .filter((n) => /--pb-accent-/.test(n.getAttribute("class") ?? ""))
      .map((n) => `${n.tagName}.${n.getAttribute("class")}`);

  const painted = [];
  for (const type of RENDERABLE_SECTION_TYPES) {
    const base = { type, content: CONTENT_FOR[type] ?? {}, id: `s-${type}` };
    const preset = refs(sec({ ...base, style: { accentColor: "green" } }));
    const custom = refs(
      sec({
        ...base,
        style: { accentMode: "custom", accentCustom: "#123456" },
      }),
    );
    if (preset.length) painted.push(type);
    assert.deepEqual(
      custom,
      preset,
      `${type}: a custom accent reaches a different set of elements than a preset accent. ` +
        "Both travel as the same three CSS variables on the same wrapper, so this differing " +
        "means the renderer grew a second path.",
    );
  }

  /**
   * NOT VACUOUS, and this is the assertion that makes the sweep worth running.
   * Most types draw nothing from an empty content block, so a per-type equality
   * over 27 empties would compare 27 pairs of empty arrays and pass. CONTENT_FOR
   * gives the accent-painting types enough content to actually paint, and this
   * names the ones that did.
   */
  assert.deepEqual(
    painted.sort(),
    PAINTS_FROM_FIXTURE,
    "the fixture stopped making these types paint, so the equality sweep above is comparing " +
      "empty sets and proves nothing",
  );
});

test("the custom accent sets the same three variables, with the author's value", () => {
  const el = wrapperOf(
    sec({ style: { accentMode: "custom", accentCustom: "#123456" } }),
  );
  const map = styleMap(el);
  assert.deepEqual(Object.keys(map).sort(), [
    "--pb-accent-fill",
    "--pb-accent-on",
    "--pb-accent-text",
  ]);
  assert.equal(map["--pb-accent-fill"], "#123456");
  assert.equal(map["--pb-accent-text"], "#123456");
  // Only `on` is a token — the one value the author did not pick.
  assert.match(map["--pb-accent-on"], /^var\(--/);
  // The same three keys a preset sets: the contract with the twelve is identical.
  assert.deepEqual(
    Object.keys(map).sort(),
    Object.keys(accentVars("green")).sort(),
  );
});

test("a custom accent and a custom background share ONE style attribute", () => {
  const el = wrapperOf(
    sec({
      settings: {
        backgroundMode: "custom",
        backgroundCustom: { from: "#123456" },
      },
      style: { accentMode: "custom", accentCustom: "#abcdef" },
    }),
  );
  const map = styleMap(el);
  // ROUND 79: the background half is a custom property now (see the note above).
  // The point of this test is unchanged — ONE style attribute carries both.
  assert.equal(map["--pb-cbg-from"], "#123456");
  assert.equal(map["--pb-accent-fill"], "#abcdef");
  assert.equal(
    docOf(html(sec())).querySelectorAll("section[style]").length,
    0,
    "the no-colour case gained a style attribute",
  );
});

// ── F. the cascade into nested sections, measured ──────────────────────────

test("a CUSTOM accent cascades into children — by containment, not by class", () => {
  /**
   * ── MEASURED, NOT READ ────────────────────────────────────────────────────
   * The cascade is not something a class expresses. It works because the child
   * is rendered INSIDE the element that declares the custom properties, so CSS
   * inheritance carries them down. So what is asserted is exactly that: the
   * child's accent-referencing node is a DESCENDANT of the node carrying the
   * variables, established with `.contains()` on a real DOM.
   *
   * `container` is the wrapper and `checklist` the child, because checklist is
   * one of the twelve that paints and container is one of the four that only
   * forwards.
   */
  const parent = sec({
    id: "outer",
    type: "container",
    style: { accentMode: "custom", accentCustom: "#123456" },
    content: {
      children: [
        sec({
          id: "inner",
          type: "checklist",
          content: {
            items: [
              { text: "หนึ่ง", checked: true },
              { text: "สอง", checked: true },
            ],
          },
        }),
      ],
    },
  });
  const doc = docOf(html(parent));

  const declaring = [...doc.querySelectorAll("section")].find((n) =>
    (n.getAttribute("style") ?? "").includes("--pb-accent-fill"),
  );
  assert.notEqual(
    declaring,
    undefined,
    "no element declared the custom accent",
  );
  assert.equal(styleMap(declaring)["--pb-accent-fill"], "#123456");

  const painting = [...doc.querySelectorAll("*")].filter((n) =>
    /--pb-accent-/.test(n.getAttribute("class") ?? ""),
  );
  assert.ok(
    painting.length > 0,
    "the nested child painted with no accent at all",
  );
  for (const n of painting) {
    assert.ok(
      declaring.contains(n) && declaring !== n,
      "a node painting with the accent is not inside the node declaring it — the cascade is broken",
    );
  }

  // The child declares NOTHING of its own: one authority per subtree.
  const inner = doc.querySelector("[data-pb-inner], section section") ?? null;
  if (inner) {
    assert.equal(
      (inner.getAttribute("style") ?? "").includes("--pb-accent-fill"),
      false,
      "the nested section re-declared the accent — the cascade would then not be a cascade",
    );
  }
});

test("a PRESET accent cascades by the identical mechanism — same containment", () => {
  // The comparison that makes the case above mean "the same as before" rather
  // than "it happens to work".
  const build = (style) =>
    sec({
      id: "outer",
      type: "container",
      style,
      content: {
        children: [
          sec({
            id: "inner",
            type: "checklist",
            content: {
              items: [
                { text: "หนึ่ง", checked: true },
                { text: "สอง", checked: true },
              ],
            },
          }),
        ],
      },
    });
  const shape = (style) => {
    const doc = docOf(html(build(style)));
    const declaring = [...doc.querySelectorAll("section")].find((n) =>
      (n.getAttribute("style") ?? "").includes("--pb-accent-fill"),
    );
    const painting = [...doc.querySelectorAll("*")].filter((n) =>
      /--pb-accent-/.test(n.getAttribute("class") ?? ""),
    );
    return {
      declaringTag: declaring?.tagName ?? null,
      painting: painting.map((n) => n.getAttribute("class")),
      allContained: painting.every((n) => declaring?.contains(n)),
    };
  };
  assert.deepEqual(
    shape({ accentMode: "custom", accentCustom: "#123456" }),
    shape({ accentColor: "green" }),
    "the custom cascade has a different shape from the preset one",
  );
  assert.equal(shape({ accentColor: "green" }).allContained, true);
  // …and NOT vacuously: the first version of this comparison passed with both
  // sides empty, because the checklist fixture used bare strings and the
  // component only paints a CHECKED item. Both sides must actually paint.
  assert.ok(
    shape({ accentColor: "green" }).painting.length > 0,
    "the preset side painted nothing, so the comparison above compares two empties",
  );
  assert.ok(
    shape({ accentMode: "custom", accentCustom: "#123456" }).painting.length >
      0,
  );
});

test("CONTROL: a section with NO accent leaves the children inheriting the page", () => {
  // Without this, the containment checks above would pass for a renderer that
  // stamps the variables on everything unconditionally.
  const doc = docOf(
    html(
      sec({
        id: "outer",
        type: "container",
        content: {
          children: [
            sec({
              id: "inner",
              type: "checklist",
              content: { items: [{ text: "หนึ่ง", checked: true }] },
            }),
          ],
        },
      }),
    ),
  );
  const declaring = [...doc.querySelectorAll("section")].filter((n) =>
    (n.getAttribute("style") ?? "").includes("--pb-accent-fill"),
  );
  assert.deepEqual(
    declaring,
    [],
    "a section that set no accent declared one anyway",
  );
});

// ── the one path ───────────────────────────────────────────────────────────

test("the renderer cannot reach the mode-blind resolvers", () => {
  /**
   * `backgroundClass`, `isDarkBackground` and `accentVars` were REMOVED from
   * SectionRenderer's imports when the wrappers landed. That removal is what
   * makes "custom colours reach exactly the surfaces presets reach" a structural
   * fact rather than a habit: a resolver that does not consult the mode is a
   * path on which a custom background is painted under a preset class.
   */
  const { withImports } = readSource(
    "src/components/pageBuilder/SectionRenderer.jsx",
  );
  for (const raw of ["backgroundClass,", "isDarkBackground,", "accentVars,"]) {
    assert.equal(
      withImports.includes(raw),
      false,
      `SectionRenderer imports the mode-blind "${raw.slice(0, -1)}" again — there must be one path`,
    );
  }
  for (const wrapped of [
    "backgroundClassFor",
    "backgroundStyleFor",
    "isDarkBackgroundFor",
    "accentVarsFor",
  ]) {
    assert.ok(
      withImports.includes(wrapped),
      `SectionRenderer no longer uses ${wrapped}`,
    );
  }
});

test("CONTROL: that import check DOES see a mode-blind name when one is there", () => {
  const planted =
    "import { backgroundClass, spacingTopClass } from '@/lib/pageBuilder/presets';";
  assert.equal(planted.includes("backgroundClass,"), true);
  // …and it is not matching the wrapper by accident.
  assert.equal(
    "import { backgroundClassFor } from 'x';".includes("backgroundClass,"),
    false,
  );
});
