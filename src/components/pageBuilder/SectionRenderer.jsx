import { cn } from "@/lib/utils";
import { sanitizePageHtml } from "@/lib/customPages/sanitizePageHtml";
import { scopeCss, isValidSectionId } from "@/lib/pageBuilder/scopeCss";
import { slotsOf, MAX_SECTION_DEPTH } from "@/lib/pageBuilder/containerSlots";
import {
  containerWidthClass,
  spacingTopClass,
  spacingBottomClass,
  visibilityClass,
  isHiddenVisibility,
} from "@/lib/pageBuilder/presets";
/**
 * Round 39, ADDED beside the statement above rather than folded into it — the
 * standing rule in this repo.
 *
 * `backgroundClass`, `isDarkBackground` and `accentVars` LEFT the statement
 * above, and that removal is load-bearing rather than tidying. Each of the four
 * below wraps one of them and answers identically for any section that has not
 * chosen a custom colour; keeping the raw three importable here would leave a
 * path that resolves a colour WITHOUT consulting the mode, which is how a
 * custom background ends up painted under a preset class. There is one path,
 * and a test asserts this file cannot reach the other.
 */
import {
  backgroundClassFor,
  backgroundStyleFor,
  isDarkBackgroundFor,
  accentVarsFor,
  backgroundKindFor,
  backgroundPinFor,
} from "@/lib/pageBuilder/presets";
/**
 * ADDED beside the statement above rather than folded into it — the standing
 * rule in this repo. Round 78: the renderer needs to know whether the author's
 * own colour owns this surface, because a surface that does not follow the
 * theme cannot inherit text that does. It is the same predicate presets.js
 * uses to suppress the preset class, so the class and the text colour cannot
 * disagree about who owns the background.
 */
import {
  hasCustomBackground,
  isBackgroundPinned,
} from "@/lib/pageBuilder/customColor";
/**
 * Round 45, ADDED beside the statements above.
 *
 * The SAME two functions the structure tree uses for its “ว่าง” badge — not a
 * second emptiness rule written for the canvas. A canvas that decided
 * “empty” differently from the tree would put a marker on one panel and not
 * the other for the same section, which is worse than neither: the author
 * would have to work out which panel is lying.
 */
import { sectionRendersEmpty, labelOf } from "@/lib/pageBuilder/sectionLabels";

import { HeadingSection } from "./sections/heading";
import { RichTextSection } from "./sections/rich_text";
import { ImageSection } from "./sections/image";
import { CtaSection } from "./sections/cta";
import { ChecklistSection } from "./sections/checklist";
import { NoticeSection } from "./sections/notice";
import { FullWidthSection } from "./sections/full_width";
import { ContainerSection } from "./sections/container";
import { TwoColumnSection } from "./sections/two_column";
import { CardGridSection } from "./sections/card_grid";
import { HighlightGridSection } from "./sections/highlight_grid";
import { TimelineSection } from "./sections/timeline";
import { TabsSection } from "./sections/tabs";
import { AccordionSection } from "./sections/accordion";
import { PriceCardSection } from "./sections/price_card";
import { StatCardSection } from "./sections/stat_card";
import { IconCardSection } from "./sections/icon_card";
import { CustomHtmlSection } from "./sections/custom_html";
import { CustomCssSection } from "./sections/custom_css";
import { EmbedSection } from "./sections/embed";
import { DebugJsonSection } from "./sections/debug_json";
import { CourseCardSection } from "./sections/course_card";
import { InstructorCardSection } from "./sections/instructor_card";
import { CourseSelectorSection } from "./sections/course_selector";
import { BundleCoursesSection } from "./sections/bundle_courses";
import { CourseListSection } from "./sections/course_list";
import { CourseScheduleSection } from "./sections/course_schedule";

/**
 * SectionRenderer — dispatches one section to its component and applies the
 * shared wrapper. Server component. Owns recursion (control inversion): it
 * renders a container's child sections and passes them as props, so the
 * layout components stay pure presentational.
 *
 * Wrapper pipeline, in order:
 *   enabled → visibility → container width / spacing / background →
 *   advanced.customClass → advanced.sectionId (DOM id / anchor) →
 *   scoped advanced.customCss (<style>) → sanitized advanced.customHtml.
 *
 * Unknown section types never crash the page: a dev-only warning block in
 * development, nothing in production.
 *
 * ── The optional `path` prop ──────────────────────────────────────────────
 * The editor canvas renders through THIS component — it must, or it would be a
 * second implementation of the tree and would drift from what publishes (see
 * lib/pageBuilder/containerSlots.js). But the canvas also has to map a click
 * back to a section, and it can't wrap nested children in click targets because
 * the recursion below is what creates them.
 *
 * So the canvas passes `path` and this component stamps `data-pb-path` on each
 * rendered <section>, threading the extended path into the recursion. The
 * canvas then reads it back with one delegated click handler. Public callers
 * pass nothing: `path` stays null, the attribute is omitted, and the published
 * HTML is byte-for-byte what it was before. This is the one editor concession
 * in the renderer, and it exists precisely so there is no second renderer.
 */

/**
 * ── ROUND 70: THE TWO LAYOUTS WHOSE CHILDREN SHARE A TRACK ───────────────
 * A grid ROW is one height; the cards drawn in it were four. Measured, in a
 * four-column `card_grid` with four label lengths: the grid ITEM (this
 * component's own <section>) is the full 272px of its row, and the FIRST
 * element inside it — the container <div> below — stops at 168/204/272/204,
 * tracking label length. Everything under that div inherits the short height,
 * which is why `price_card` already carrying `flex h-full flex-col` still did
 * not fill: `height:100%` against an auto-height parent computes to `auto`.
 *
 * So the container div is told to fill, and ONLY for a child of these two. Not
 * unconditionally: a top-level section, a `two_column` slot, a `container`, a
 * `tabs` panel — none of them puts its children in a shared track, and a
 * blanket fill there would be height nobody asked for on every page. A section
 * outside this set renders byte-for-byte what it rendered before.
 *
 * NOT applied to the <section> itself, and that is not an oversight. In
 * `card_grid` the section IS the grid item and already stretches; a percentage
 * height on a grid item resolves against the whole GRID, so on a two-row grid
 * it would make every card as tall as both rows together. `highlight_grid`
 * needs its child stretched instead, and that is done where its box is
 * composed (sections/highlight_grid.jsx) rather than here.
 */
const FILLS_ITS_TRACK = new Set(["card_grid", "highlight_grid"]);

// type → component
const REGISTRY = {
  heading: HeadingSection,
  rich_text: RichTextSection,
  image: ImageSection,
  cta: CtaSection,
  checklist: ChecklistSection,
  notice: NoticeSection,
  full_width: FullWidthSection,
  container: ContainerSection,
  two_column: TwoColumnSection,
  card_grid: CardGridSection,
  highlight_grid: HighlightGridSection,
  timeline: TimelineSection,
  tabs: TabsSection,
  accordion: AccordionSection,
  // 2C — self-contained Card + Advanced components.
  price_card: PriceCardSection,
  stat_card: StatCardSection,
  icon_card: IconCardSection,
  custom_html: CustomHtmlSection,
  custom_css: CustomCssSection,
  embed: EmbedSection,
  debug_json: DebugJsonSection,
  // 2C.2a — data-backed, authored-reference components. These do NOT fetch; the
  // fetch is hoisted above the renderer (resolveSectionData → the `data` prop),
  // which is what lets them render in the client canvas too.
  course_card: CourseCardSection,
  instructor_card: InstructorCardSection,
  course_selector: CourseSelectorSection,
  bundle_courses: BundleCoursesSection,
  course_list: CourseListSection,
  // 2C.2b — data-backed, DERIVED / time-varying. course_schedule's rows and
  // course_list's skill/program sources are a function of REQUEST time, so the
  // canvas can only show an edit-time SAMPLE the published page won't match — a
  // labelled exception to the Browser-pass-#2 rule (see docs/page-builder-
  // status.md §2C.2b). The label lives in the editor, not here: the resolver
  // returns the same shape for both callers, so ONE renderer still serves both.
  // The picker flips these from "เร็ว ๆ นี้" to clickable automatically now that
  // they are in REGISTRY (RENDERABLE_SECTION_TYPES derives from it).
  course_schedule: CourseScheduleSection,
};

/**
 * The types this renderer can actually DRAW — REGISTRY's keys, not the schema's
 * type list.
 *
 * Those two disagree, and the gap is a trap: lib/schemas/pageBuilder.js declares
 * 27 types, but only the ones with a component in REGISTRY render. After 2C that
 * is 21 (the self-contained Card + Advanced types now render); the 6 data-backed
 * types (course_card, instructor_card, and the 4 Dynamic) still validate, save,
 * survive a reload — and would silently publish an empty page. An add-section
 * picker offering the schema's list would let an author insert one of those.
 *
 * So the picker offers THIS list. It is derived from the registry rather than
 * written out, so a type becomes offerable the moment its component lands here
 * and never one commit earlier.
 */
export const RENDERABLE_SECTION_TYPES = Object.freeze(Object.keys(REGISTRY));

// Container slots + the section-nesting depth cap (distinct from the rich-text
// walk cap) live in lib/pageBuilder/containerSlots.js — ONE definition shared
// with the editor, which walks the same tree. See that file for why.

function devError(msg) {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error(`[pageBuilder] ${msg}`);
  }
}

function UnknownBlock({ type }) {
  // Dev-only — production renders nothing for an unknown type.
  return (
    <div className="my-2 rounded border border-dashed border-amber-400 bg-amber-50 p-3 text-xs text-amber-800">
      [pageBuilder] ไม่รู้จัก section ชนิด &quot;{String(type)}&quot; —
      ไม่แสดงผลใน production
    </div>
  );
}

/**
 * ── AN EMPTY SECTION, IN THE EDITOR ONLY ──────────────────────────────────
 * A just-added heading has no text, and heading.jsx returns null for that. So
 * does price_card with no title, price or feature, and eight more besides. The
 * section IS in the tree, IS selected, and draws a zero-height box the author
 * cannot see or click — which is indistinguishable from the canvas being
 * broken, and was reported as exactly that.
 *
 * THE PUBLIC PAGE MUST KEEP RENDERING NOTHING. That is correct behaviour, not
 * a bug to fix: a half-filled section should not publish a stub. So this is
 * gated on `path`, the SAME fact that produces `inEditor` below — one flag,
 * not a second one — and `path` is null for every public and preview caller.
 *
 * IT IS CHROME, NOT CONTENT, and the distinction is deliberate. No sample
 * heading, no grey bars, nothing an author could mistake for something they
 * wrote or something that will publish: a dashed outline, the word the
 * structure tree already uses, and the section's own type name so the author
 * can tell WHICH empty section they are looking at when two sit together.
 *
 * Rendered BESIDE the component's own output rather than instead of it.
 * `sectionRendersEmpty` is a second reader of each component's null guard and
 * its own header says so; if the two ever disagree, this shows a marker next
 * to real content — visibly wrong and fixable — rather than replacing content
 * with a marker, which would hide the author's work.
 */
function EmptyInEditor({ type }) {
  return (
    <div
      data-pb-empty=""
      className="rounded-9e-sm border border-dashed border-[var(--surface-border)] px-3 py-2 text-xs text-9e-slate-dp-50"
    >
      <span className="rounded-full border border-[var(--surface-border)] px-1.5 py-0.5 text-[10px]">
        ว่าง
      </span>{" "}
      {/* The tree's sentence, verbatim, with the type in front of it — so the two
          panels say the same thing about the same section rather than two things. */}
      {`${labelOf(type)} — section นี้ยังว่าง จึงไม่แสดงผลบนหน้าเว็บ`}
    </div>
  );
}

export function SectionRenderer({
  section,
  depth = 0,
  path = null,
  resolvedData = null,
  fillHeight = false,
}) {
  if (!section || typeof section !== "object") return null;
  if (section.enabled === false) return null;

  const settings = section.settings ?? {};
  if (isHiddenVisibility(settings.visibility)) return null; // never rendered anywhere

  if (depth > MAX_SECTION_DEPTH) {
    devError(
      `section nesting exceeded depth ${MAX_SECTION_DEPTH} — dropped "${section.type}"`,
    );
    return null;
  }

  const Component = REGISTRY[section.type];
  if (!Component) {
    devError(`unknown section type "${section.type}"`);
    return process.env.NODE_ENV !== "production" ? (
      <UnknownBlock type={section.type} />
    ) : null;
  }

  const advanced = section.advanced ?? {};
  const style = section.style ?? {};
  const content = section.content ?? {};

  // sectionId → DOM id + CSS scope. Invalid id: drop it, warn LOUDLY — the
  // anchor and any anchor-nav link to this section break, and an editor must
  // learn that at authoring time (2B) rather than from a dead link in prod.
  let domId;
  if (advanced.sectionId) {
    if (isValidSectionId(advanced.sectionId)) {
      domId = advanced.sectionId;
    } else {
      devError(
        `invalid sectionId "${advanced.sectionId}" — anchor id AND scoped customCss dropped for this section`,
      );
    }
  }

  // Recurse child sections (containers only), rendering each and passing the
  // result to the layout component as its slot prop.
  const childProps = {};
  const slots = slotsOf(section.type);
  if (slots) {
    for (const slot of slots) {
      const arr = Array.isArray(content[slot]) ? content[slot] : [];
      childProps[slot] = arr.map((child, i) => (
        <SectionRenderer
          key={child?.id ?? i}
          section={child}
          depth={depth + 1}
          path={path ? [...path, "content", slot, i] : null}
          resolvedData={resolvedData}
          fillHeight={FILLS_ITS_TRACK.has(section.type)}
        />
      ));
    }
  }

  // Render-context props beyond the content/style/layout contract, each for a
  // subset of section types and ignored by the rest:
  //   domId    — custom_css scopes its content.css to #domId (the section's own
  //              wrapper id, valid only when advanced.sectionId is valid), the
  //              same scope the renderer applies to advanced.customCss below.
  //   inEditor — debug_json renders only in the editor canvas (path is non-null
  //              there, null for public/preview callers), never on a live page.
  //   settings — ROUND 71. The envelope, for the two container types that draw
  //              a gap BETWEEN their children (settings.spacingBetween). This
  //              prop did not exist before, and sections/container.jsx said so
  //              in as many words: "SectionRenderer hands components content,
  //              style, layout, domId, inEditor and data, never settings, so
  //              there is no value here to defer to". It does now, and that
  //              note is updated rather than left to rot. Ignored by the other
  //              25 types exactly as domId and data are.
  //   data     — the 2C.2a data-backed components render from this, NOT from a
  //              fetch of their own: the fetch is hoisted above the renderer
  //              (resolveSectionData → resolvedData, keyed by the unique section
  //              id) so ONE sync renderer serves both the server page and the
  //              client canvas. undefined for a section with no resolved data.
  const inner = (
    <Component
      content={content}
      style={style}
      layout={section.layout ?? {}}
      domId={domId}
      inEditor={path != null}
      settings={settings}
      data={resolvedData ? resolvedData[section.id] : undefined}
      {...childProps}
    />
  );

  // advanced.customCss — scoped to #domId (needs a valid id) then injected.
  const scopedCss =
    advanced.customCss && domId ? scopeCss(advanced.customCss, domId) : "";
  // advanced.customHtml — sanitized on EVERY render, reusing the shared
  // whitelist (never a second, drift-prone copy).
  const cleanHtml = advanced.customHtml
    ? sanitizePageHtml(advanced.customHtml)
    : "";

  /**
   * ── ROUND 39: THE SAME THREE CALLS, THROUGH THE MODE-AWARE RESOLVERS ─────
   * `backgroundClassFor` / `isDarkBackgroundFor` / `accentVarsFor` each wrap the
   * function that used to be called here and return exactly its answer unless
   * the author chose `custom`. A section stored before round 39 has no mode, so
   * this renders byte-identically to what it rendered before — which is the
   * property the model commit was built around and is asserted by name.
   *
   * The custom background is an INLINE STYLE and cannot be a class: Tailwind's
   * JIT only emits classes it can see as literals, and an author's colour is a
   * runtime string. That is also why the preset class has to be SUPPRESSED
   * rather than merely overridden — see backgroundClassFor.
   */
  /**
   * ── ROUND 78: A CUSTOM BACKGROUND PINS THE TEXT THAT SITS ON IT ──────────
   * Round 78 made the page shell theme-aware, so `--text-primary` now flips to
   * near-white under `.dark`. A section with a CUSTOM background does not flip
   * — round 39 promised the author's colour verbatim in both themes — so
   * without this the theme's dark text landed on the author's light surface.
   * MEASURED on /promotions/early-bird-claude-code before this line existed:
   * the hero went 14.4 -> 1.16 and the second custom section 5.88 -> 2.83.
   *
   * `text-9e-navy` is the literal the page shell carried before round 78, so
   * this reproduces EXACTLY the behaviour a custom-background section already
   * had, rather than introducing a new rule. It is the same promise applied
   * consistently: if the surface is verbatim in both themes, the text on it
   * has to be too, or the pair answers two different axes — the defect round
   * 59 named and round 75 measured four more instances of.
   *
   * This is NOT deriving a dark counterpart for an author's colour. Nothing
   * here reads or transforms the author's hex; it pins the theme half of the
   * pair to the value it had, which is what keeps the contract coherent.
   * Deriving the surface itself remains a separate, unbuilt proposal
   * (docs/custom-colour-dark-mode.md).
   *
   * ORDER MATTERS: it sits after `isDarkBackgroundFor`, and the two are
   * mutually exclusive by construction — `isDarkBackgroundFor` returns false
   * for every custom background (presets.js says why), so a section can never
   * receive both classes.
   */
  const outerClass = cn(
    backgroundClassFor(settings),
    spacingTopClass(settings.spacingTop),
    spacingBottomClass(settings.spacingBottom),
    isDarkBackgroundFor(settings) && "text-9e-ice",
    // ROUND 79 narrowed this to PINNED sections only. Round 78 added it
    // because a custom surface stayed light while `--text-primary` flipped —
    // but a DERIVED surface now goes dark with the theme, so pinning navy text
    // on it would put dark ink on a dark panel. Measured: the hero derives to
    // L 0.267 and needs the theme's light text, exactly as any other dark
    // surface does. A PINNED section still does not move, so it still needs
    // the literal.
    hasCustomBackground(settings) &&
      isBackgroundPinned(settings) &&
      "text-9e-navy",
    visibilityClass(settings.visibility),
    advanced.customClass || null,
  );
  /**
   * Section accent override cascades to descendants via CSS vars — unchanged,
   * and the cascade is the whole reason a custom accent needs nothing else.
   * The twelve components that paint with the accent read
   * `var(--pb-accent-fill|text|on)`; this sets those three variables on the
   * section wrapper, so a custom colour reaches EXACTLY the surfaces a preset
   * reaches, by the same mechanism, without any of them being touched.
   *
   * Merged with the background style rather than either winning: they are
   * disjoint properties (custom properties vs background-color/-image) and one
   * `style` attribute has to carry both.
   */
  const outerStyle = {
    ...accentVarsFor(style),
    ...backgroundStyleFor(settings),
  };
  const hasOuterStyle = Object.keys(outerStyle).length > 0;

  /**
   * ── ROUND 73: THE MOBILE SIDE INSET IS HALVED, AND NOTHING ELSE MOVES ────
   * `px-4` (16px a side) became `px-2 md:px-4` (8px below 768px, 16px from it).
   * docs/mobile-padding.md §D named this class as the SINGLE source of the
   * per-level compounding: every section renders through this div, nested ones
   * included, so the inset is paid once per level. Measured at 390px, the
   * author's three-level case spent 128 of its 181 lost pixels here.
   *
   * ── md: BECAUSE IT IS THE AUTHOR'S OWN TABLET BUTTON ────────────────────
   * 768px is `VIEWPORT_WIDTH.tablet` in editor/CanvasPanel, so the two sizes
   * land on two of the three buttons the author already has and no third
   * behaviour is invented. At the tablet button they see the desktop inset;
   * at the mobile button, the reduced one.
   *
   * ── WHAT THIS IS NOT ────────────────────────────────────────────────────
   * It is NOT the doc's step 2. That step proposed moving the inset to the page
   * shell so it applies ONCE, and it cannot be done that way: editor/CanvasPanel
   * renders SectionRenderer DIRECTLY and never through PageBuilderView, so an
   * inset that lived on the shell would vanish in the canvas and the two would
   * disagree — which round 72 §E measured as agreeing and called more important
   * than the padding itself. A per-level halving keeps them identical because it
   * is the same component in both.
   *
   * The cost, stated: at TOP level this is now 8px a side, where round 72 §F
   * measured the hand-built reference pages at 16px. Top level was already at
   * the reference; the excess was always compounding, and a uniform per-level
   * rule cannot reduce the deep case without also reducing the shallow one.
   * The alternative — varying the inset by depth — is what §I refused as a
   * layout an author cannot predict from the panel.
   */
  return (
    <section
      id={domId}
      data-pb-path={path ? path.join(".") : undefined}
      /**
       * ROUND 79. The author's colour arrives as custom properties in `style`;
       * these two attributes tell globals.css which declaration to build from
       * them, and whether the author pinned it out of the dark derivation.
       * Both are `undefined` for every section without a custom background, so
       * nothing is emitted and the published HTML is unchanged for them.
       */
      data-pb-custom-bg={backgroundKindFor(settings)}
      data-pb-bg-pin={backgroundPinFor(settings)}
      className={outerClass || undefined}
      style={hasOuterStyle ? outerStyle : undefined}
    >
      {scopedCss && <style dangerouslySetInnerHTML={{ __html: scopedCss }} />}
      <div
        className={cn(
          "mx-auto px-2 md:px-4",
          containerWidthClass(settings.containerWidth),
          fillHeight && "h-full",
        )}
      >
        {inner}
        {path != null && sectionRendersEmpty(section) && (
          <EmptyInEditor type={section.type} />
        )}
        {cleanHtml && (
          <div
            className="pb-custom-html mt-6"
            dangerouslySetInnerHTML={{ __html: cleanHtml }}
          />
        )}
      </div>
    </section>
  );
}
