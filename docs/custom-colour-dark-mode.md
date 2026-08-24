# Deriving a dark-mode counterpart for author-chosen colours

Round 77. **A survey and a decision brief. Nothing here is built.**

The ask: when the site is in dark mode, render an author's custom colour as a
dark-toned equivalent rather than as typed. Round 39 promised the opposite, in
writing, in the control's own hint text — so this cannot be shipped as a bug
fix. It replaces a promise, and §E says which words change.

Instruments: `scripts/_audit-round77-custom-colours.mjs` (read-only over Mongo),
`scripts/_measure-round77-derivation.mjs` (seven algorithms, worked on the real
stored colours, every result verified against headless Chrome).

---

## 0. A correction to the premises, checked first

Three claims in the round 77 brief do not hold on this clone. They matter
because two of them would have made this survey treat a live symptom as
already-fixed.

**Round 74 did not remove `highlight_grid`'s accent bar.** `e835400` is
`fix(page-builder/highlight_grid): tighten the per-child box on mobile only`.
Its own message says the opposite of "removed, 4px → 0":

> *THE ACCENT RULE STILL READS, measured at 390px with one, two and four
> children: the border stays 4px in every case … the border classes are pinned
> by a test so a later round cannot remove them while calling it a spacing
> change.*

`highlight_grid.jsx:50` still carries `border-l-4
border-l-[color:var(--pb-accent-fill)]` today. `git log -S'border-l-4'` on that
file returns one commit, the squash that introduced it. **The accent bar in the
author's screenshot is correct and current.**

**Round 76 changed no source.** It stopped on its own §C condition (three of the
five painting keys in `BACKGROUND_CLASS` have no dark counterpart and would
need a colour nobody has chosen). `BACKGROUND_CLASS` is byte-identical to its
round 75 state. Its "16 of 17 closed" did not happen — §H below re-measures and
finds **17 of 19 rows still failing, identical to round 75**.

**The running dev server confirms both.** A server was already listening on
port 3000 (PID 10132, started 09:21:18) from this clone's `node_modules`.
`GET /promotions/early-bird-claude-code` returns 200 / 1,012,455 bytes
containing `border-l-4`, `dark:bg-[#0D1B2A]/40`, and
`linear-gradient(to bottom left, #f8e7d5, #fefaf5)`. So the page the author
screenshotted is this code, unfixed, and the grey slab and accent bar are real
present-tense symptoms rather than stale ones. (The server was stopped at the
end of this round.)

---

## A. What custom colours exist today

### The fields

| field | stores | written by | read by |
|---|---|---|---|
| `settings.backgroundMode` | `'preset'` \| `'custom'` | `SettingsPanel` background select | `hasCustomBackground()` |
| `settings.backgroundCustom.from` | `#rrggbb` — stop 1 | `ColorInput` | `customBackgroundStyle()` |
| `settings.backgroundCustom.to` | `#rrggbb` or `''` — stop 2; **empty means a flat colour, not a gradient** | `ColorInput` | `customBackgroundStyle()` |
| `settings.backgroundCustom.direction` | one of six | select | `customBackgroundStyle()` |
| `style.accentMode` | `'preset'` \| `'custom'` | `SettingsPanel` accent select | `accentVarsFor()` |
| `style.accentCustom` | `#rrggbb` | `ColorInput` | `accentVarsFor()` |

The render path is short and there is exactly one of it:

- `backgroundClassFor(settings)` → `''` when custom (the preset class is
  **suppressed**, not overridden — two things owning one surface is the shape
  this codebase keeps removing).
- `backgroundStyleFor(settings)` → `customBackgroundStyle()` → an **inline
  `style` object**: `{backgroundColor}` for one stop, `{backgroundImage:
  linear-gradient(…)}` for two. Applied by `SectionRenderer` to the `<section>`.
- `accentVarsFor(style)` → the three `--pb-accent-*` custom properties, applied
  inline on the section, consumed by twelve components.
- `isDarkBackgroundFor(settings)` → **always `false`** for a custom background.
  That is round 39 §D4 written as code.

### What is stored — measured

Database reached: **`genesis-cluster0.mrhpieh.mongodb.net / 9exp_genesis`**.
`page_builder_pages` (not `pagebuilders`), `snapshot.sections` (not
`content.sections`); both required to exist, a missing one dies rather than
printing a clean zero. 5 pages, 9 versions, 81 live sections walked to depth 4,
210 snapshot sections walked to depth 4.

| | live pages | version snapshots | total |
|---|---|---|---|
| custom **background** sections | **3** | 10 | **13** |
| custom **accent** sections | **2** | 4 | **6** |

Every distinct author-entered colour in the corpus — six of them:

| value | role | where |
|---|---|---|
| `#f8e7d5 → #fefaf5` `to_bottom_left` | background | `early-bird-claude-code` · `two_column` @d0 |
| `#f8e7d5 → #fefaf5` `to_top` | background | `early-bird-claude-code` · `highlight_grid` @d0 |
| `#65819f → #4394ea` `to_bottom_right` | background | `expo002` · `cta` @d0 |
| `#c88614` | accent | `expo002` · `card_grid` @d0 |
| `#0f5c00` | accent | `expo002` · `cta` @d0 |

All 13 custom backgrounds are **gradients**; zero are flat. That matters for
§C: any algorithm has to keep two stops distinguishable, not just recolour one
swatch.

---

## B. The count is NOT zero

The brief says round 75 measured zero pages using `backgroundMode: 'custom'`
and asks me to say so prominently if that is still the case. **It was never
zero.** Three independent runs — round 75, round 76 and round 77, all against
`9exp_genesis` — return the same 13 sections across 2 published pages. Round
75's document records 13, and §C of its own table classified 7 measured rows as
CONTRACT precisely because they are custom colours.

So the decision does **not** have the comfortable shape the brief hoped for.
Two published pages change the moment this ships, one of them
(`early-bird-claude-code`) built entirely from custom backgrounds. A no-op
migration is not available; whatever ships must either change those pages or
give their author a way to opt out (§F).

The brief also names `#ffcb5c → #fff8e0` as a colour the author has used. It is
**not in the corpus** — not in any live page and not in any version snapshot.
The hero is `#f8e7d5 → #fefaf5`. It is carried through §C as a labelled
hypothetical because the author may be about to use it, never as data.

---

## C. What "dark-toned equivalent" could mean

Seven candidates, worked on all six stored colours plus the two hypotheticals.

**Why OKLab.** HSL "lightness" is not lightness — `#0000FF` and `#FFFF00` are
both L=50% and one is nearly black to the eye. "Invert the lightness" is not a
rule until it names a perceptual space.

**The control.** Every derived colour was painted as a swatch in a real `.dark`
document and Chrome's own computed contrast read back: **56 swatches, maximum
disagreement with the Node arithmetic 0.00**. jsdom cannot do this job — it
compiles no Tailwind and returns `""` for every computed style.

Tokens: `--page-bg` `#FFFFFF` → `#0D1B2A`; `--text-primary` dark `#F8FAFD`.

### The seven

| # | algorithm | rule |
|---|---|---|
| 1 | `oklch-invert` | `L' = 1 − L`, keep C and h |
| 2 | `oklch-anchored` | keep the colour's *distance from the page*: `L' = L_darkbg + (1 − L/L_lightbg)(1 − L_darkbg)` |
| 3 | `darken-fixed-0.25` | `L' = 0.25L` |
| 4 | `slate-dp-nearest` | nearest step of the `9e-slate-dp` ramp by OKLab L |
| 5 | `wcag-preserved` | keep the WCAG ratio it had against the light page, against the dark one |
| 6 | `shipped-floor-vs-text` | **already in production** — `adjustLightnessForContrast`, floor 4.5:1 vs `--text-primary` |
| 7 | `shipped-floor-vs-page` | the same function, floor 4.5:1 vs `--page-bg` dark |

**6 and 7 are not new.** `src/lib/articles/normalizeAuthoredColors.js` ships
them on ~200 article bodies. The function moves lightness nearest-first only
until a stated contrast floor is cleared, keeps hue and saturation, and — the
part none of the other five have — **returns the input unchanged when the floor
is already met**. It was imported here, not reimplemented; a second copy of a
derivation rule is exactly the drift this repo keeps removing.

### Worked results

`t` = contrast vs `--text-primary` dark. `p` = contrast vs `--page-bg` dark.
`CLIP` = the OKLab result left sRGB and chroma had to be reduced.

| input | as typed (t) | `oklch-invert` | `oklch-anchored` | `darken-0.25` | `slate-dp-nearest` | `wcag-preserved` | `floor-vs-text` | `floor-vs-page` |
|---|---|---|---|---|---|---|---|---|
| `#f8e7d5` near-white warm | 1.16 ✗ | `#020100` t19.95 CLIP | **`#2f2315` t14.64** | `#271b0e` t16.08 | `#eff0f2` **t1.09 ✗** | `#34281a` t13.71 | `#a7631c` t4.52 | `#f8e7d5` **t1.16 ✗** |
| `#fefaf5` near-white | 1.01 ✗ | **`#000000`** t20.08 | **`#1f1c18` t16.23** | `#23201d` t15.50 | `#f7f8f9` **t1.02 ✗** | **`#000000`** t20.08 | `#a66411` t4.51 | `#fefaf5` **t1.01 ✗** |
| `#65819f` mid blue | 3.87 ✗ | `#324c67` t8.49 | **`#55708d` t4.91** | `#000b1c` t18.86 CLIP | `#6e798b` **t4.21 ✗** | `#617d9a` **t4.09 ✗** | `#5b7693` t4.51 | `#6985a2` t3.67 |
| `#4394ea` saturated blue | 3.01 ✗ | `#00396c` t11.15 CLIP | **`#0060af` t6.10** CLIP | `#000e23` t18.48 CLIP | `#8e97a5` **t2.82 ✗** | `#0e69bc` t5.33 | `#1873d5` t4.51 | `#4394ea` t3.01 |
| `#c88614` amber | 2.92 ✗ | `#4a2e00` t11.94 CLIP | `#7e5200` t6.49 CLIP | `#180c00` t18.40 CLIP | `#8e97a5` **t2.82 ✗** | `#8e5c00` t5.46 CLIP | `#9d6910` t4.50 | **`#c88614` p5.70** |
| `#0f5c00` near-black green | 7.87 ✓ | `#498f3e` **t3.80 ✗** | `#64ac59` **t2.65 ✗** | `#000600` t19.57 CLIP | `#5e6a7e` t5.23 | `#7bc470` **t2.01 ✗** | `#0f5c00` t7.87 | **`#199700` p4.53** |
| `#ffcb5c` *(hypothetical)* | 1.44 ✗ | `#0d0700` t19.17 CLIP | `#433000` t12.09 CLIP | `#241800` t16.66 CLIP | `#cfd2d8` **t1.45 ✗** | `#4b3500` t11.11 CLIP | `#9b6a00` t4.51 | `#ffcb5c` **t1.44 ✗** |
| `#fff8e0` *(hypothetical)* | 1.02 ✗ | **`#000000`** t20.08 | `#231e0b` t15.91 | `#25200d` t15.56 | `#f7f8f9` **t1.02 ✗** | **`#000000`** t20.08 | `#906f00` t4.50 | `#fff8e0` **t1.02 ✗** |

### Gradients — do the two stops stay distinguishable?

OKLab ΔE between the derived stops, as a percentage of the input's ΔE.

| gradient | input ΔE | invert | **anchored** | darken | slate-dp | wcag | floor-vs-text | floor-vs-page |
|---|---|---|---|---|---|---|---|---|
| `#f8e7d5 → #fefaf5` (the hero) | 0.0548 | 132% | **79%** | 47% ✗ | 43% ✗ | **526%** ✗ | **13%** ✗ | 100% |
| `#65819f → #4394ea` | 0.1141 | 70% | **90%** | 15% ✗ | 88% | 100% | 101% | 95% |
| `#ffcb5c → #fff8e0` | 0.1547 | 88% | **60%** | 19% ✗ | 75% | **228%** ✗ | 15% ✗ | 100% |

### What each one actually does — the verdicts

- **`slate-dp-nearest` is out, decisively.** It maps by *lightness* onto a
  neutral ramp, so it preserves the one property that has to change and
  destroys the one that must not: chroma `0.140 → 0.009`, hue drift up to
  **179.3°**. It fails AA on 7 of 8 inputs. It is the brief's own suggestion
  and it is the worst of the seven.
- **`oklch-invert` kills near-whites.** `#fefaf5` and `#fff8e0` both become
  **pure `#000000`**, and the hero's two stops become `#020100` and `#000000` —
  a gradient between two blacks. It also clips on every saturated input.
- **`darken-fixed-0.25` crushes gradients**, to 15–47% of their input
  separation, and clips chroma on every saturated colour (`#c88614`'s C falls
  `0.138 → 0.036` — the amber stops being amber).
- **`wcag-preserved` is unstable.** It sends one hero stop to black and leaves
  the other mid-brown, *inflating* a deliberately subtle gradient to 526% of its
  separation. It also still fails AA on 3 of 8.
- **`shipped-floor-vs-text` is faithful and wrong for this job.** It preserves
  hue and saturation exactly as advertised — and that is the problem: to clear
  4.5:1 against near-white text, a peach must become a burnt orange. The four
  near-whites all converge on `#a7631c / #a66411 / #9b6a00 / #906f00`, and the
  hero gradient collapses to **13%** of its separation. It answers a different
  question (make this text legible) than the one asked (make this surface dark).
- **`shipped-floor-vs-page` is a no-op on light colours** — by design, since a
  near-white already clears 4.5:1 against a dark page at 14–16:1. Correct for an
  accent, useless for a background.
- **`oklch-anchored` is the only candidate that produces a plausible dark
  *surface*.** Near-whites become near-darks of the same hue (drift 1.2–1.4°),
  the hero gradient survives at 79% separation, and it clears AA against
  `--text-primary` on every input except `#0f5c00`.

### The finding that decides the shape

**Backgrounds and accents have different contrast requirements, and no single
algorithm serves both.** A custom background must carry `--text-primary`; a
custom accent must be visible *on* the page (round 21: it is used as an
ornament, as a text colour, and as a button fill). `oklch-anchored` fails on
`#0f5c00` only because that colour is an *accent*, and anchoring correctly
lifts a dark colour on a dark page — which is wrong when text must sit on it
and right when it must sit on the page.

Scored in each colour's **real role**, the pairing clears AA everywhere:

| colour | role | rule | result | contrast |
|---|---|---|---|---|
| `#f8e7d5` | background | `oklch-anchored` | `#2f2315` | 14.64 vs text ✓ |
| `#fefaf5` | background | `oklch-anchored` | `#1f1c18` | 16.23 vs text ✓ |
| `#65819f` | background | `oklch-anchored` | `#55708d` | 4.91 vs text ✓ |
| `#4394ea` | background | `oklch-anchored` | `#0060af` | 6.10 vs text ✓ |
| `#c88614` | accent | `shipped-floor-vs-page` | `#c88614` (unchanged) | 5.70 vs page ✓ |
| `#0f5c00` | accent | `shipped-floor-vs-page` | `#199700` | 4.53 vs page ✓ |

**4/4 backgrounds and 2/2 accents.** That is the strongest measured proposal
this round produced, and it is a *pair* of rules, not one.

---

## D. Where it would run — render time

**Measured: `adjustLightnessForContrast` costs 7,939 ns per colour.** The
author's whole page carries three custom colours: **23.8 µs per render.** The
"colour maths on the public path" worry is 24 microseconds inside an
ISR-cached RSC. It does not weigh anything.

The stored-pair option costs much more than it looks, and for a reason
independent of speed:

- Every stored pair goes **stale the day the algorithm changes**, and there is
  no signal when it does — the page keeps rendering a colour derived by a rule
  that no longer exists. Round 39's `--pb-accent-on` avoided precisely this by
  computing at render.
- It needs a schema change, a migration for 13 sections across 2 published
  pages plus 9 version snapshots, and a decision about what a *version snapshot*
  taken before the migration should render.
- Version snapshots make it worse: a snapshot is a frozen record of what a page
  was. Backfilling derived colours into it rewrites history; not backfilling it
  means old versions render differently from new ones.

**Recommendation: render time.** The emission mechanism is the same either way,
and that is the point that collapses the argument — an inline `style` attribute
has no `.dark` selector, so *both* placements must emit two values and let CSS
choose. The proven form is already in `globals.css:821-825`:

```css
.dark           .article-content [data-authored-fg] { color: var(--authored-fg-dark) !important; }
html:not(.dark) .article-content [data-authored-fg] { color: var(--authored-fg-light) !important; }
```

Two custom properties, one selector pair. Storing the second value buys nothing
that this does not already give, and costs the migration and the staleness.

---

## E. The contract copy — every string that becomes false

**One string, used twice, and one test that pins it.**

`SettingsPanel.jsx:309-310`:

> `สีที่กำหนดเองจะถูกใช้ตามที่ระบุในทุกธีมของหน้า — ระบบจะไม่ปรับสีนี้ตามธีมหรือโหมดมืด`
>
> *"A custom colour is used as specified in every page theme — the system will
> not adjust this colour for the theme or for dark mode."*

It is attached to **both** colour controls: `สีเริ่มต้น` (background stop 1,
line 515) and `สีที่กำหนดเอง` (accent, line 563).

**Which clause fails.** The second clause, `ระบบจะไม่ปรับสีนี้ตามธีมหรือโหมดมืด`
("will not adjust … for the theme or for dark mode"), becomes flatly false for
dark mode. The first clause (`ใช้ตามที่ระบุในทุกธีมของหน้า` — used as specified
in every *page theme*) stays true: `page.theme` is a different axis and nothing
proposed here touches it. So the replacement must **split a sentence that
currently conflates two axes**, which is worth doing regardless — round 59
measured those two axes as independent and this copy has always spoken as if
they were one.

Round 18's rule applies with its sign reversed: normally the danger is a
control claiming an effect nothing delivers. Here it would be a promise of
*stability* the system no longer keeps — an author who chose a brand hex,
read this hint, and shipped, would find the colour moved.

**The test that pins it** — `test/render/customColorPanel.test.mjs`:

| line | assertion | after the change |
|---|---|---|
| 145-149 | the caveat is on **both** controls, by exact text | still valid; the constant's value changes |
| 152-168 | the caveat **draws no comparison with preset mode**, and matches `/ทุกธีมของหน้า/` and `/ไม่ปรับ/` | **`/ไม่ปรับ/` must be removed or inverted.** The no-comparison rule should survive — a new hint saying "unlike ตามธีม…" would reintroduce exactly what round 39 forbade |
| 225-232 | the *accent scope* hint is unchanged in custom mode | unaffected |

That is the whole audit: **one constant, two call sites, one test with three
assertions, one of which (`/ไม่ปรับ/`) must be rewritten rather than kept.**

---

## F. A switch, or a rule?

The author asked for automatic derivation. Some authors will want the opposite,
and that is a real requirement rather than a hypothetical one: a brand colour
under a corporate identity guideline **must not shift**. `#c88614` and
`#0f5c00` in `expo002` look like exactly that — chosen values, not decorative
ones. Round 39's whole argument was that "an author who types a brand colour
means that colour."

The trade, both directions stated:

**A RULE (derivation always on).** One behaviour, nothing to explain, nothing
to get wrong. Cost: it takes a capability away that the UI currently promises,
and the author who needs a pinned colour has no recourse except abandoning
custom mode entirely — which drops them onto the preset path, whose five keys
round 76 measured as *also* not theme-aware. That author is left with nothing.

**A THIRD MODE (`ตามธีม` / `กำหนดเอง` / `กำหนดเอง + ปรับตามโหมดมืด`).** Every
author keeps what they have; the new behaviour is opt-in; **no stored section
changes** because absent means today's behaviour. Cost: a third option on two
controls, in a panel where round 39 argued hard for exactly two; a third value
in two schema enums; and the naming problem — the difference between the second
and third options is invisible until you toggle the site theme, so the hint has
to carry the whole explanation.

**A PAGE-LEVEL DEFAULT with a per-section override** is the third shape and
splits the difference: one decision for a whole page, overridable where a brand
colour needs pinning. Cost: two places to look when a colour surprises you,
which is the diagnosis problem round 59 documented for the two theme axes.

**Not picking.** But one measured fact bears on it: **13 sections across 2
published pages** change under a rule and **0** under a switch. Round 76's
audit found the same asymmetry and it was decisive there.

---

## G. What not to build

### G1 — Do not ask the author for a second colour.

The obvious alternative to deriving one: add a "dark mode colour" input beside
each existing one. It is worse than it looks. The background control already
has **three** inputs (two stops and a direction); doubling it makes six, and an
author who must pick a dark counterpart for each stop is doing the algorithm's
job by hand, badly, with no contrast feedback. Round 75 §G3 costed the same
shape at "the largest build" for exactly this reason. And it does not even
remove the need for a rule: absent dark values still need a default, which is a
derivation, which is this document.

### G2 — Do not auto-derive the TEXT colour as well.

Round 39 §D4 refused this and **the refusal still holds**. The distinction the
brief asks about is real and it is worth stating precisely:

> Deriving a dark variant of a colour **the author chose** is translating one
> authority's decision into a second context. Deriving a text colour from a
> background is **a second authority overruling the theme**, which owns text.

The first keeps one decision-maker; the second creates two. That is the whole
of rounds 21-25's `container.jsx` argument, and it is why this survey can
propose derivation for `backgroundCustom` and `accentCustom` — both author-owned
— while refusing it for `--text-primary`, which is theme-owned.

The evidence that this is not academic is in round 75 §B: every one of the four
worst rows on the author's page is already two authorities disagreeing about
one pixel (`dark:prose-invert` vs the shell, at 1.22:1;
`dark:bg-[#0D1B2A]/40` vs the shell, producing `#9ea4aa`). Adding a third
cannot be the fix for that.

### G3 — Do not extend derivation to the PRESET path.

The preset background keys are not theme-aware (round 76 measured it; §H
confirms it is still true). It is tempting to point both paths at one
derivation function and call it uniform. Do not: a preset is a **named
decision someone made by hand**, and `BACKGROUND_CLASS` is where that decision
lives. Deriving `soft_gray`'s dark form at render would mean the palette has
two owners — the table and the algorithm — and the table would stop being the
answer to "what colour is `soft_gray`?". Round 76 stopped rather than mint
those three colours precisely so that they would be *chosen*. Let them be
chosen.

### G4 — Do not use `slate-dp-nearest`, and do not use any neutral ramp.

Named in the brief as a candidate; measured as the worst of seven. Hue drift to
179.3°, chroma to 0.009, AA failure on 7 of 8 inputs. A neutral ramp cannot
represent a chosen colour — that is what "neutral" means.

### G5 — Do not derive at author time and store the pair.

§D has the numbers: render-time costs 24 µs for the author's whole page, while
stored pairs need a schema change, a migration across 13 sections and 9 version
snapshots, an answer for what a pre-migration snapshot should render, and they
go stale silently when the algorithm is tuned. The one thing storage would buy
— inspectability — is available anyway, since both values are emitted as CSS
custom properties and are visible in devtools.

### G6 — Do not ship this before round 75's steps 2 and 3.

Derivation makes the author's *custom* surfaces theme-aware. Their page also
has a page shell that stays `#ffffff` in dark mode and a `highlight_grid` box
that composites to `#9ea4aa` (§H). Shipping derivation first would put a
correctly-derived dark hero on a still-white page — a worse-looking page than
today's, and a result that would read as the derivation being wrong.

---

## H. What round 76 achieved, verified

**Nothing, and this is measured rather than inferred.** Round 75's §B/§C
instruments were re-run on this clone today:

| bucket | rows | distinct causes |
|---|---|---|
| CONTRACT | 7 | 2 |
| NO-DARK | 6 | 4 |
| TEXT-AXIS | 4 | 4 |
| OK | 2 | 2 |

**17 of 19 rows still failing** — byte-identical to round 75, every hex and
every ratio. The still-failing rows:

`page shell` `#ffffff` · `section wrapper[0]` `#f8e7d5` · `section wrapper[1..2]`
`#ffffff` · `section wrapper[3]` `#f8e7d5` · `nested section[0..3]` `#f8e7d5` ·
`heading` `#f8e7d5` · **`body text (prose p)` 1.22** · `card surface (shadow)`
`#9ea4aa` · `card surface (filled/ice)` `#f8fafd` · `highlight_grid child box`
`#9ea4aa` · **`muted body text` 2.45** · **`muted text ON the grey box` 1.02** ·
`shadow card ON the grey box` `#9ea4aa`.

Only `route wrapper` and `link` pass.

The `page.theme` dead-enum finding the brief calls "the seventeenth" is not in
this data at all: `PAGE_THEMES` is `default, promotion_blue, early_bird_orange,
ai_purple, corporate_navy, light_minimal, dark_premium` — there is no `purple`
and no `dark` value. `dark_premium` aliases `default` with a `TODO(design)`,
which round 75 §E recorded and is a different finding.

---

## Proposed build sequence

The public-render-path work is steps 3–5. The riskiest step is not first.

**Step 0 — rule on §F.** *Not shippable; it is the input everything else needs.*
Rule or switch. 13 sections across 2 published pages change under a rule and 0
under a switch. Nothing below can be specified until this is answered, because
the schema shape differs.

**Step 1 — round 75 steps 2 and 3 first.** *Independently shippable; already
specified in `docs/page-builder-dark-mode.md`.* The four TEXT-AXIS deletions,
then the page shell. §G6: derivation on a white page shell looks broken even
when it is right. This is a prerequisite, not a parallel track.

**Step 2 — the derivation module, pure, no callers.** *Independently
shippable, zero render risk.* Export the two rules — `oklch-anchored` for
backgrounds, the shipped `adjustLightnessForContrast` floor for accents — with
the §C table as its test fixtures, including the gradient ΔE and the AA checks
per role. Nothing imports it yet, so it cannot change a page. This is where
`oklch-anchored`'s gamut mapping gets scrutinised: it clips on `#4394ea` and
`#c88614`, and a chroma-reduction map is the correct fix rather than a clamp.

**Step 3 — emit two custom properties on the section wrapper.** *Public path.*
Replace the single inline `backgroundColor`/`backgroundImage` with a
light/dark pair plus the `.dark` / `html:not(.dark)` selector pair, exactly as
`globals.css:821-825` already does for articles. **Ship it with both values
identical**, so light and dark render as they do today. That isolates the
mechanism from the palette change, and makes the byte-identity proof a
one-variable claim.

**Step 4 — turn the derivation on.** *Public path, and the riskiest step —
which is why it is fourth.* Point the dark half at step 2's module. This is the
commit where two published pages change. It needs step 0's ruling and step 3's
mechanism in place, and it should carry the §C per-role AA table as a test so a
future palette edit cannot silently drop a colour below 4.5:1.

**Step 5 — the copy.** *Public-facing text, needs step 0's ruling.* §E's one
constant, two call sites, and the `/ไม่ปรับ/` assertion in
`customColorPanel.test.mjs`. It must land in the **same commit** as step 4 —
a page whose colours moved while the hint still promises they will not is the
lie round 18 forbids, and shipping them apart guarantees a window where it is
true.

| step | independently shippable | needs the §F ruling | touches the public render path |
|---|---|---|---|
| 0 ruling | no | — | no |
| 1 round 75 steps 2-3 | **yes** | no | **yes** |
| 2 derivation module | **yes** | no | no |
| 3 two custom properties | **yes** | no | **yes** |
| 4 derivation on | no | **yes** | **yes** |
| 5 copy | no (must ship with 4) | **yes** | no (editor only) |

Steps 1–3 are worth doing under any ruling. Steps 4 and 5 are one commit and
need the ruling first.

---

## Tests added this round: none, and why

Every fact this survey leans on is already pinned by an existing test. A second
assertion over the same fact is the drift risk this repo keeps removing, so
none was added.

| what this document relies on | already pinned by |
|---|---|
| `highlight_grid`'s accent bar still exists (§0) | `test/fs/mobilePaddingScale.test.mjs:122` — asserts `border`, `border-l-4`, `border-l-[color:var(--pb-accent-fill)]`, `rounded-9e-lg` by name. Round 74 added it *so that* a later round could not remove the bar while calling it a spacing change; it is why the bar is still in the author's screenshot |
| `adjustLightnessForContrast` is a no-op when the floor is already met (§C 6/7) | `test/pure/authoredColors.test.mjs:440` |
| the caveat still promises stability (§E) | `test/render/customColorPanel.test.mjs:168` — `assert.match(CUSTOM_COLOR_CAVEAT, /ไม่ปรับ/)` |

The third is the tripwire for this whole proposal: it fails the moment step 5
rewrites the hint, which is exactly when someone should be forced to look at
§E. Nothing new is needed to make that happen.
