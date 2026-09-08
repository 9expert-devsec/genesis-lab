import { test } from "node:test";
import assert from "node:assert/strict";
import postcss from "postcss";
import tailwind from "tailwindcss";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Round A-fix 3 — the prose palette on a section background the author painted.
 *
 * ── WHY THIS TIER COMPILES TAILWIND INSTEAD OF READING globals.css ────────
 * The claim is about which rule WINS, and that cannot be read off source text:
 * it depends on the plugin's own selectors, on how Tailwind 3.4 compiles the
 * `dark:` variant, and on the order the two land in the output. A source scan
 * would assert the rule EXISTS, which was never in doubt, and would stay green
 * through exactly the change that breaks it — the same false-green
 * test/fs/tailwindArbitraryValueRules exists for, reached from the other side.
 *
 * So this drives postcss + the real config over the real stylesheet, and reads
 * the answer out of the compiled AST.
 */

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

/**
 * Specificity as (id, class-ish, element), counted the way the cascade does:
 * `:is()` contributes its most specific argument, which is the whole reason
 * `dark:prose-invert` is not the 0,2,0 a hand count suggests.
 */
const spec = (sel) => {
  const cls = (sel.match(/\.[\w\\:-]+|\[[^\]]+\]|:(?!not|is|:)[\w-]+/g) || []).length;
  const els = (sel.match(/(?:^|[\s>+~(])(?!\.|#|\[|:)[a-z]+/g) || []).length;
  return `0,${cls},${els}`;
};

/** The compiled stylesheet, once — this is the slow part of the file. */
let compiled;
async function css() {
  if (compiled) return compiled;
  // `pathToFileURL`, not a bare path: on Windows an absolute path starts with a
  // drive letter, which the ESM loader reads as a URL scheme and rejects.
  const cfg = (await import(pathToFileURL(path.join(ROOT, "tailwind.config.js")).href))
    .default;
  const res = await postcss([tailwind(cfg)]).process(
    readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8"),
    { from: path.join(ROOT, "src/app/globals.css") },
  );
  /** Every rule that SETS one of the four variables, in source order. */
  const setters = [];
  let i = 0;
  res.root.walkRules((r) => {
    i += 1;
    const props = {};
    r.walkDecls((d) => {
      if (/^--tw-prose-(body|bold|headings|quotes)$/.test(d.prop))
        props[d.prop] = d.value;
    });
    if (Object.keys(props).length)
      setters.push({ order: i, selector: r.selector, spec: spec(r.selector), props });
  });
  compiled = { text: res.css, setters };
  return compiled;
}

const OURS = "html:not(.dark) [data-pb-auto-text] .prose";

test("the override reaches the compiled stylesheet at all", async () => {
  const { setters } = await css();
  const ours = setters.find((s) => s.selector === OURS);
  assert.notEqual(ours, undefined, `no compiled rule for ${OURS}`);
  /**
   * FOUR, not three. `--tw-prose-quotes` joined after the first ship: it
   * measures 1.02 on the same bed as bold and headings — the invisible-ink
   * number — and had been grouped with the 2.63-3.60 dim band by mistake.
   *
   * The set is asserted EXACTLY, in both directions: a variable that stops
   * being overridden goes red here, and so does one that starts being
   * overridden without the measurement that earns it.
   */
  assert.deepEqual(ours.props, {
    "--tw-prose-body": "var(--pb-text-muted)",
    "--tw-prose-bold": "var(--pb-text)",
    "--tw-prose-headings": "var(--pb-text)",
    "--tw-prose-quotes": "var(--pb-text)",
  });
});

test("it out-ranks the plugin's own palette — by specificity AND by order", async () => {
  /**
   * The whole point of the rule. MEASURED rather than reasoned: the plugin sets
   * these four on a bare `.prose`, and this must beat it without `!important`.
   *
   * BOTH facts are asserted because either alone is fragile. Specificity alone
   * would stop being decisive if the plugin's selector grew; order alone would
   * stop being decisive if globals.css moved above `@tailwind utilities`.
   */
  const { setters } = await css();
  const plugin = setters.find((s) => s.selector === ".prose");
  const ours = setters.find((s) => s.selector === OURS);
  assert.notEqual(plugin, undefined, "the plugin no longer sets these on .prose");

  assert.equal(plugin.spec, "0,1,0");
  assert.equal(ours.spec, "0,3,1");
  assert.ok(
    ours.order > plugin.order,
    `this rule (#${ours.order}) compiles BEFORE the plugin's (#${plugin.order}), so order no longer helps`,
  );
  // …and the plugin really is what would otherwise paint the disappearing run.
  // The three gray-900 entries are one value, which is why they move together.
  assert.equal(plugin.props["--tw-prose-bold"], "#111827");
  assert.equal(plugin.props["--tw-prose-headings"], "#111827");
  assert.equal(plugin.props["--tw-prose-quotes"], "#111827");
  assert.equal(plugin.props["--tw-prose-body"], "#374151");
});

test("dark:prose-invert is NOT fought — and the light-mode scope is what prevents it", async () => {
  /**
   * The check the brief asked for, and the answer is the opposite of the
   * comfortable one. `dark:prose-invert` compiles to
   * `.dark\:prose-invert:is(.dark *)`: one class for the escaped class name,
   * plus `:is()` contributing its most specific argument (`.dark *`), which is
   * one more class and a universal that counts nothing. 0,2,0.
   *
   * THIS RULE IS 0,3,1, SO IT WOULD WIN IN DARK MODE TOO. That is the whole
   * reason `html:not(.dark)` is load-bearing rather than tidy: without it, this
   * rule would out-rank the invert palette and paint LIGHT-mode values over a
   * correct dark one. The two do not fight only because they cannot meet.
   *
   * So the assertion is on the SCOPE, and it is a real tripwire: drop the
   * light-mode prefix and this goes red, which is exactly when someone needs
   * to read the paragraph above.
   */
  const { setters } = await css();
  const invert = setters.find((s) => s.selector.includes("prose-invert"));
  assert.notEqual(invert, undefined, "dark:prose-invert is no longer compiled");
  assert.equal(invert.spec, "0,2,0");

  const ours = setters.find((s) => s.selector === OURS);
  assert.ok(
    ours.selector.startsWith("html:not(.dark)"),
    "the light-mode scope is gone. This rule is " +
      `${ours.spec} against dark:prose-invert's ${invert.spec}, so it now WINS in ` +
      "dark mode and paints light-mode values over the inverted palette",
  );
  // The ordering half of the same claim: it also compiles later, so removing
  // the scope would not merely tie — it would win twice.
  assert.ok(ours.order < invert.order || ours.spec > invert.spec);
});

test("the override cannot reach a section with no authored background", async () => {
  /**
   * Asserted rather than trusted, which is what the brief asked for. The scope
   * is an ATTRIBUTE, so what has to be true is that the attribute appears in
   * the selector and that nothing else in the compiled sheet sets these three
   * variables outside the plugin, this rule, and the invert pair. All four.
   */
  const { setters } = await css();
  assert.ok(OURS.includes("[data-pb-auto-text]"));

  const unexpected = setters.filter(
    (s) =>
      s.selector !== ".prose" &&
      s.selector !== OURS &&
      !s.selector.includes("prose-invert"),
  );
  assert.deepEqual(
    unexpected.map((s) => s.selector),
    [],
    "something else sets the prose palette — the scoping claim above only " +
      "covers the rules this test knows about",
  );
});
