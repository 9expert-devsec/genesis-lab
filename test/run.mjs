// npm test entry point (item 1). Runs the gated tiers — pure / fs / render — in
// ONE process so the loader (registered below) applies; `node --test` isolates
// each file into a child the loader never reaches (verified: it does not
// propagate --import), so we drive the programmatic runner with isolation:'none'
// instead.
//
// smoke/ (live MSDB, needs a key + network) is NOT enumerated here and is never
// part of `npm test` — see test/smoke.mjs.
//
// META-CONTROLS (the runner's own controls, per item 1's "every check needs a
// control proving it CAN fail"). Three, because the runner-level false-green —
// where zero or too few tests run and the suite still reports success — has
// three distinct causes and a single check catches only one of them:
//
//   1. EXACT TEST COUNT, not a floor. A minimum catches wholesale disappearance
//      but cannot catch the tests added this week, because the number that
//      would catch them is the one a human forgot to write down. That is not
//      hypothetical: 26 tests landed against a floor of 565 and the suite sat
//      green at 591-passed, so all 26 could have vanished the next day in
//      silence. An exact match makes every addition bump the number
//      deliberately, in the same commit.
//   2. FILE DISCOVERY. The manifest looks one level deep in three named dirs.
//      A *.test.mjs anywhere else under test/ is never run and nothing says so.
//   3. PER-FILE COUNTS. A file that imports cleanly but defines no tests
//      contributes nothing, and under a total-only check is indistinguishable
//      from one that was never written.
//
// All three terminate (a number a human set here vs numbers the runner reports)
// rather than regressing into a check-checking-a-check.
//
// The CANARY (test/canary.mjs) is the other half and is deliberately NOT run
// here: it is a manual affordance a human invokes to watch the suite go red
// before trusting a green. Wiring it into an automated pipeline would just move
// the unread-badge problem down a level (see the CI row in the status doc).
//
// ── READING A CONTROL THAT FIRES NOTHING ────────────────────────────────────
// General rule, earned rather than assumed. When you break the code a test
// claims to guard and the suite stays GREEN, there are three explanations and
// only one of them is the obvious one:
//
//   1. the test is weak (the usual reading — it asserts something the break
//      does not touch, e.g. a `length >= n` floor);
//   2. the two claims genuinely are not separable, and the honest move is to
//      SAY SO rather than manufacture independence;
//   3. THE CODE HAS REDUNDANCY HIDING THE CLAIM — two implementations of one
//      rule, so breaking either leaves the other covering for it.
//
// (3) is the one that gets missed, because it looks exactly like (1) and the
// tempting fix — adjust the test until it goes red — buries the real finding.
// It has now happened here: the chat rate limiter released its window in TWO
// places (a per-key `resetAt <= now` check, and an unconditional expired-bucket
// sweep running just above it), so breaking the per-key check reddened nothing.
// The defect was in the module, not the test; expiry was single-sourced and the
// same break then reddened exactly one test. See src/lib/chat/rateLimit.js.
//
// So: a control that fires nothing is a QUESTION about the code, not a verdict
// on the test. Go and look before touching the assertion.
//
// ── WHEN THE SUBJECT UNDER TEST IS ITSELF A COMMENT ─────────────────────────
// The standing rule in this suite is STRIP COMMENTS BEFORE MATCHING SOURCE, and
// it has been earned six times over: a doc block that quotes the token under
// test will otherwise satisfy an assertion about what the code DOES.
//
// It has exactly one exception, and it arrives looking like a bug in the code.
// Some things a guard legitimately cares about ARE comments — an
// `eslint-disable-next-line`, a pragma, a directive. Asserting one of those
// against scrubbed source fails on a completely correct file, because the
// scrubber deleted the subject before the matcher ran. That happened here to
// the guard on the chat cards' `@next/next/no-img-element` disable, which is
// load-bearing (next/image THROWS on an unlisted host, so the raw <img> and its
// disable are the convention, not a shortcut).
//
// The tell is the direction of the surprise: the usual defect is a test that
// PASSES when it should fail; this one FAILS when it should pass. Both are the
// same question — is the matcher reading the same text the claim is about? — and
// both are answered by looking rather than by adjusting the assertion until it
// goes the way you expected.
//
// So: strip comments by default; read the RAW file for the one assertion whose
// subject is a comment, and say so at that assertion. Mixing the two inside one
// test file is fine and is what test/fs/chatWiring.test.mjs does.

process.env.NODE_ENV = 'production'; // match component runtime branches (fail-closed, no dev blocks)

import { register } from 'node:module';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

register(new URL('./loader.mjs', import.meta.url));
const { run } = await import('node:test');
const { spec } = await import('node:test/reporters');

const EXPECTED_TESTS = 1471; // EXACT test count expected across pure/fs/render (see meta-control note). 126 after 2C.2b + 5b-audit + fail-loud hardening + promotion-mode Phases 1-3 + roadmap-svg scrub; 132 after webhook course-revalidate planner (6); 137 after CourseRoadmap dedup (5); 140 after roadmap intrinsic-aspect sizing (+3); 157 after OG image fallback-chain resolver (+17); 167 after course sticky CTA bar (+10); 174 after sticky-bar stacking-order fix + page-centering (net +7); 179 after public z-index scale audit (+5); 238 after the authored inline-colour classifier (+36: 26 pure in test/pure/authoredColors, 10 seam guards in test/fs/authoredColorTokens); 275 after the schedule-status unification (+37: 16 pure in test/pure/scheduleStatus, 21 five-surface render + unknown-status controls in test/render/scheduleStatus); 305 after the program/skill href consolidation (+30: 18 pure in test/pure/pageHrefs incl. the linkability three-state rule and the no-redirect control, 12 chip render in test/render/skillBreadcrumb); 325 after restoring true client-logo colours on a single panel (+20: 15 render in test/render/clientLogos incl. the seam/nesting and panel present-in-dark/absent-in-light controls, 5 marquee/source guards in test/fs/clientLogosMarquee); 349 after the hue-preserving per-theme colour adjustment (+24: 22 pure in test/pure/authoredColors incl. the hue-tolerance sweep and the conditional-adjustment control, 2 seam/token guards in test/fs/authoredColorTokens and test/render/clientLogos height parity); 350 after the monochrome logo wall replaced the light panel (net +1: clientLogos render tests rewritten to the knockout + keepColorOnDark exception, clientLogosMarquee guards re-pointed at the real defect); 373 after removing the /universe route (+23, and NOTHING removed: 7 render in test/render/headerActions pinning the action cluster the deleted Orbit button left behind plus the no-link control, 16 seam guards in test/fs/headerImports — one per lucide specifier — catching the dead import the removal leaves. The route's own deletion cost zero tests: it had none, and the three tests that named it in test/pure/pageHrefs only did so in prose, so the floor did not drop); 382 after extracting the public /schedule course↔schedule join into a pure module (+9 in test/pure/joinCourseSchedules, incl. the PYTHON-L1 regression guard for the incident where 45 of 77 courses were dropped silently, and TWO controls — one replicating the pre-fix no-accounting join, one pinning that `orphans` being empty in production is a measurement and not a literal); 397 after the schedule-webhook visibility assessment (+15 in test/pure/schedulePublicVisibility, incl. the incident row 6931505831d45afebddb77d7 with its real `signup_url: ""`, the `>=` same-day boundary, and the three-way status outcome — exact match passes, a trim/case-folded-only match is reported UNCERTAIN rather than passed because upstream's own casing comparison is unverified and resolving it as "visible" would reproduce the silence the module exists to break, and an unmatched status hard-fails. THREE independent controls: `failures` is measured rather than a constant `[]`, `visible` is derived rather than a constant `true`, and the ambiguity branch is real rather than collapsing back to a case-insensitive compare. Verified independent — each survives the other two's stubs, and the CATEGORY CONTROL on status "full" keeps the fact/doubt categories from merging); 399 after repairing the sticky-bar stacking guard (+2 net in test/render/stickyBarButtonCoordination: the ancestor model is now DERIVED from page.jsx/layout.jsx instead of transcribed — the transcribed copy went stale when be78611 swapped <article> from bg-white to bg-[var(--page-bg)], a colour-only change creating no stacking context, and a missing anchor now THROWS naming the element instead of silently dropping an unchecked ancestor. The single misnamed test was split into the two pairings it actually asserts (sidebar-vs-bar, which only the ancestors BETWEEN aside and article decide, and article-vs-layout-UI), plus a NEW structural tripwire on the aside→article nesting depth that catches an inserted wrapper — the real hole, since the ancestor list had no completeness check and a <div className="isolate"> around the grid traps the sidebar while every class assertion stays green); 401 after the Tailwind content-glob coverage guard (+2 in test/pure/tailwindContentCoverage, closing a gap NOTHING in the suite could see: the JIT only emits classes it can scan, so centralising the schedule-status maps into src/lib/scheduleStatus.js — outside a `content` array that named src/lib/pageBuilder specifically — silently dropped all four status hexes from the CSS while every test stayed green. The guard walks src/ for arbitrary-value literals and asserts each holding file matches a glob, plus a CONTROL that the walker/matcher are live so zero-offenders-of-zero-files cannot pass vacuously. Glob matching is hand-rolled (~20 lines) rather than minimatch/picomatch, which exist only as TRANSITIVE deps — building the guard on a package nobody declared is the same defect it guards against); 422 after single-sourcing the admin schedule horizon (+9 in test/pure/adminScheduleHorizon, raising the grid from 4 months to 12 so whoever manages schedules can see what the public /schedule page already shows). The horizon was ONE concept written as the literal `4` in THREE places that had to agree — the MSDB `to` bound, the column loop, the Thai subtitle — and they did not: `to` was `today + 4 months` (2026-07-29 → 2026-11-29) while the last column was October, so November rows were fetched and then dropped by `monthKey(s.dates[0])` matching no column. Over-fetch plus a silent client-side drop, the same shape as the /schedule join incident above. The bound is now DERIVED from the last rendered column (its last day) in src/lib/adminScheduleHorizon.js, so the two cannot diverge without one being rewritten, and the tests confirm a structural property rather than policing two parallel computations: NONE of the agreement assertions hardcodes 12, so flipping the constant leaves them green (verified at 8) and reddens only the single test that pins the value, deliberately kept separate. A FOURTH `4` — `calendarMonths`, the modal date picker's scroll window — is a FALSE FRIEND, equal by coincidence, and one test pins that it keeps its OWN numeric literal and names nothing from the horizon module, because the plausible next edit here is a "cleanup" unifying all four that would render a 12-month day grid inside a max-h-80 box. Verified red three ways: hardcoding the bound back to `+ 4` months, pointing calendarMonths at the shared constant, and restoring the literal column loop). 436 after decoupling the pin BADGE from manual POSITIONING (+14: 7 in test/pure/articleBadgeVisibility, 7 in test/pure/articlePositioning, over src/lib/articlePositioning.js). `isPinnedOnArticlePage` did two unrelated jobs — it sorted the article into the top block AND drew the pin glyph on the card — so no article could be given a chosen position without also being branded as pinned. `showPinBadge` now owns the badge; the cascade is BYTE-IDENTICAL and the ordering users see is unchanged for every article nobody reconfigures. THE TRAP THIS FILE EXISTS FOR: `getArticles` reads with .lean(), which does not apply Mongoose defaults, and serialize() then drops undefined keys — so all ~200 existing articles read back with the key ABSENT, and a plain truthiness check would strip every badge in production the instant this deployed, with no migration having run. shouldShowPinBadge therefore treats absent as ON via an explicit `!== false`, and one test names that incident in its title; the meta-control confirms swapping in a truthiness check reddens THAT case and only that case. The badge is ALSO gated on positioning, which is not belt-and-braces: `undefined !== false` is true for every legacy document, so a helper keyed on the new field alone would sprout a pin on the entire collection. Badge-without-position is ALLOWED and stored but has no public effect (demoting must not silently erase a preference), and the admin list says so in amber rather than disabling the control. Promotion appends at max(pinOrder)+1 — the END of the block, never the top, which would displace a position the admin deliberately chose — and touches exactly one document; demotion DOES renumber the survivors to 1..M, because a hole inflates the maximum and makes every later promotion drift upward. Tests assert the resulting RANK via the shipped ranker rather than restating pinOrder arithmetic. Verified red two ways: a truthiness badge check (case 3 alone), and promotion inserting at rank 1 (case 6). 444 after giving the article form the BADGE but not POSITIONING (+8 in test/pure/articleFormFieldCoverage, over the new src/lib/articleFormPayload.js). A field reaches the database only if THREE layers name it — the form's FormData, the parser, and articleSchema — and `articleSchema` is a plain z.object(), i.e. STRIP mode: an undeclared key is dropped SILENTLY between parse and $set, so a control wired through two layers out of three saves nothing, returns ok, and shows the old value back after a refresh, with no error anywhere. The first two tests are therefore GENERIC rather than about this field: one walks the form's actual control surface and asserts every name is schema-declared or in a commented NOT_PERSISTED set, the other asserts the parser emits every key the schema declares — the half a JSX scan cannot see. Note the form does NOT use native submission (ONE name= attribute in 1800 lines, a prop on a custom component); it builds FormData imperatively via fd.set in `submit`, so THAT is the surface scanned, scoped to the submit block so the Cloudinary upload's FormData is not mistaken for the save payload — a name=-only scan would have passed while every real field went unchecked. parseFormData was moved out of the 'use server' actions file to be callable at all: Next requires every export of such a module to be async, so a sync helper cannot be exported, and copying it into the test would give a fixture that drifts from the parser it is meant to guard. OWNERSHIP: showPinBadge rides with the save payload (per-document, no cross-row invariant); pinOrder and isPinnedOnArticlePage are absent from the payload AND undeclared in the schema, asserted explicitly, because the block's numbering needs the WHOLE block — the form holds one document, so it routes changes through repositionArticle(), which re-reads the block and reuses planPromotion/planDemotion rather than inventing a second numbering rule. Absent-at-FormData means false (unticked checkbox, the convention `active` already used); absent-at-schema means true (a caller that does not know the field), matching shouldShowPinBadge treating absent as ON. Verified red two ways: removing showPinBadge from articleSchema while leaving it in the parser and the form — the exact false-green — and adding pinOrder to both, which reddens the ownership assertion. 464 after pinning publishedAt to a FIXED SITE TIMEZONE (+19 in test/pure/articlePublishTime.test.mjs plus 1 in test/pure/articleFormFieldCoverage, over the new src/lib/articlePublishTime.js). `<input type="datetime-local">` emits a WALL-CLOCK string with no offset, which ECMAScript reads in the RUNTIME's zone; the parser runs in a 'use server' module, i.e. on Vercel where TZ=UTC and nothing in the repo sets it — so 18:00 picked in Bangkok stored as 18:00Z, +7h, and for anything picked at 17:00 or later the CALENDAR DATE rolled forward a day. The read side was broken the other way — the admin list and the form formatted in BROWSER-local time inside client components Next server-renders first, so the first paint was UTC and hydration silently rewrote it — so a round trip through the form drifted +7h PER SAVE. Both directions now go through one module: fromLocalInput appends the literal `+07:00` before parsing (deterministic, needs no tz database, and does NOT invert a wall clock through Intl), toLocalInput/formatSiteDateTime/siteDateParts read back via Intl pinned to Asia/Bangkok. The two constants agree only because Thailand has never observed DST, and one test pins exactly that so a future divergence reddens instead of drifting. THE TRAP THIS FILE EXISTS FOR, and it is not the timezone: `process.env.TZ` is PROCESS-GLOBAL and this runner uses isolation:'none' + concurrency:true, so every mutation is shared with every other tier. `delete process.env.TZ` DOES NOT RESTORE THE OS ZONE (verified, Node 22/Windows — set it, delete it, and Date parsing stays on the last zone set), so the first draft's naive restore leaked America/Los_Angeles into a page-builder schedule RENDER test 300 lines away; withTZ now captures the RESOLVED ambient zone at module load and assigns it back, is strictly synchronous with a finally, and ships a control asserting the ambient zone survives — reinstating `delete` reddens that control AND reproduces the collateral render failure. The other harness control asserts the OLD expression `new Date('2026-07-30T18:00').toISOString()` genuinely DIFFERS between TZ=UTC and TZ=Asia/Bangkok; if that ever goes green-by-agreement every TZ-independence test here is vacuous, and neutering withTZ reddens it. THE SHARPEST FINDING: reverting articleFormPayload.js to the buggy `new Date(raw).toISOString()` left the ENTIRE suite green on a dev box whose system zone IS Asia/Bangkok — including the newly-pinned instant in articleFormFieldCoverage. Only the one test that drives the REAL parser (parseArticleFormData → articleSchema) under a FORCED zone reddens it, which is why that test names itself the regression guard and why the fixture assertion documents itself as necessary-but-not-sufficient. Verified red six ways: the parser revert (1 test), SITE_UTC_OFFSET → +00:00 (11), SITE_TIME_ZONE → UTC (8), the withTZ delete-restore (2, one of them in an unrelated tier), buildModelData writing undefined instead of null for a draft (1), and neutering withTZ (2). NO MIGRATION SHIPPED: some stored publishedAt values came from the buggy path and some did not, and nothing in the document records which, so a blanket -7h would silently corrupt the correct rows; scripts/audit-article-published-at.mjs is read-only and reports the 17:00-23:59Z band — the signature of a Bangkok evening pick misparsed as UTC — for a human to judge. 501 after making the admin list's WINDOW honest (+37: 17 in test/pure/adminListWindow, 11 in test/pure/articleListFields, 9 in test/render/adminListTruncationBanner, over the new src/lib/adminListWindow.js and src/lib/articleListFields.js). /admin/articles fetched `getArticles({ limit: 200 })` and DISCARDED `total`, which countDocuments had already computed; the collection holds 484, so 284 articles (59%) were absent from the list AND unfindable, because the admin search box is a client-side filter over the rows already fetched — typing the exact title of article #300 returned "ไม่พบบทความ", which reads as "this article was deleted". The header made it worse by being confidently wrong: `ทั้งหมด {rows.length}` reported the FETCH SIZE as the COLLECTION SIZE, so an admin who counted the rows got 200 and had no reason to doubt it. THE FIX IS THE BANNER, NOT THE FETCH SIZE — the limit is deliberately still 200, because raising it moves the cliff instead of removing it and the class of defect here is a SILENT DROP. THE PARAMETER IS `reachable`, NOT `shown`, and the distinction is the whole design: it counts rows this surface can GET THE USER TO with the controls it has, not rows painted right now. Today those are the same number — one fetch, no pager, every fetched row rendered — which is exactly why the wrong one is easy to pick and why the rename happened BEFORE the pager rather than during it. Under commit 3 they diverge: page 1 paints 12 rows while all 484 are one click away, so the caller passes `reachable: total`, `hidden` is 0, and THE BANNER GOES SILENT. That is the correct outcome, not a regression — a pager makes rows reachable, it does not make them missing. Keying off the painted count instead would make the banner fire on every page forever, announcing 472 phantom hidden articles, and a banner that is wrong on every page gets deleted, taking the only guard this commit installs with it. Two escapes are named in the docstring and rejected: keeping the name `shown`, and keeping it while having the paginated caller pass `shown: total` (right boolean, lying parameter — this module exists to stop a surface reporting numbers that are not what they claim, so it does not get to do that itself). There is deliberately NO `shown` alias in the returned shape, since an alias is precisely how the paginated caller ends up passing the wrong one, and one test asserts its absence. `limit` is not a parameter at all: it decided nothing — the predicate is `total > reachable`, never `total > limit` — and nothing renders the window size, so a control pins the case where the two part company (reachable 10, total 100 — truncated, while `total > limit` is FALSE for any limit above 100). Dropping it changed exactly ONE expectation, called out in the test that replaced it: `{reachable: 500, total: 484}` now means "nothing hidden" rather than clamping to a window that no longer exists. The commit-3 contract is pinned NOW, green today, by a plain function call — `{reachable: 484, total: 484}` → silent — so the next commit cannot quietly redefine the semantics or delete the banner to shut it up, and the render tier's absent-half already blocks the deletion from the other side. PROJECTION HAD TO LAND FIRST: getArticles had no .select() at all, so every list read serialised whole documents — every `content` HTML body — into the RSC payload, and raising the limit before projecting would have multiplied it by 2.4x. The projection also removes a quiet disclosure: `jsonLd.rawOverride` is gated to the SUPERADMIN tier in the form and was shipping to every admin's browser, 200 rows at a time, rendered by nothing. `select` is OPT-IN so the shared reader keeps whole-document behaviour for /articles, and countDocuments still runs on the unprojected filter so `total` describes the whole matching set. THE TRAP: a projection fails SILENTLY — a missing or misspelled field reads back `undefined`, which renders as a blank cell, an unlit toggle, or a pin badge that stops appearing, with no error, warning or log. So there are TWO independent guards and neither is the other's control: every projected name must EXIST on the real Mongoose schema paths (catches a typo — passes for a projection of `_id` alone), and every field the client READS must be projected (catches a new column — passes for a projection full of misspellings). Both derive from real source — Article.schema.paths, and a scan of ArticlesAdminClient/articleRank/articlePositioning for `a.`/`r.`/`article.` reads with the optional chain — rather than a transcribed list, with the three assignArticleRanks outputs (rank/rankBasis/pinTie) in a reasoned NOT_STORED exclusion set. A FINDING SHIPPED AS A TEST: PUBLIC_LIST_FIELDS is knowingly SHORT and is NOT wired into /articles, because ArticlesPageClient calls shouldShowPinBadge(article), which reads isPinnedOnArticlePage and showPinBadge — neither is in that set, so projecting it would delete the pin badge from the entire public list, silently; one test pins the gap AND that the public page does not reference the constant, so the discovery happens here rather than in production. Two SEAM guards pin the one line nobody else watches: the render tests hand `total` in as a prop, so they stay green if page.jsx reverts to `const { items } = …` — which IS the original bug — hence a source-anchored check that the page keeps both, passes total= and limit= down, and projects the read. Verified red EIGHT ways: `truncated: false` hardcoded (11 tests, across both tiers), dropping pinOrder from the projection (1 — the coverage guard), typo'ing it to `pinorder` (3 — the schema guard, its bogus-name control, and coverage), the header back to rows.length (2), the banner rendered unconditionally (4 — the absent-half, which is why both halves are mandatory), page.jsx discarding total (1), getArticles no longer applying the projection (1), and wiring PUBLIC_LIST_FIELDS into the public page (1). That first break also caught a WEAK ASSERTION in this suite: the banner's search-warning test matched a bare /ค้นหา/, which the search input's own placeholder satisfies, so it stayed green with no banner on the page at all — it now matches the banner's own sentence and asserts that sentence is ABSENT from a complete list. 518 after stopping the rank column from speaking the BADGE's vocabulary (+17: 9 structural in test/fs/adminRankVocabulary, 8 behavioural in test/render/adminRankVocabulary; presentation only — articlePositioning.js, articleRank.js, the sort cascade, every server action and every stored field are untouched). 436 split `isPinnedOnArticlePage` (has a manual POSITION) from `showPinBadge` (draws the pin BADGE on the public card); the DATA separated cleanly and the ADMIN COPY never followed. RankCell keys entirely off `rankBasis`, i.e. POSITION, and drew a `<Pin>` glyph plus the word ปักหมุด — while the ป้าย switch eight columns over owned the actual badge. One icon and one noun carrying two meanings in the same row: an admin left an article positioned, switched ป้าย OFF, and the ลำดับบน /articles column still showed a pin and said ปักหมุด, which reads as "I removed the pin and the pin is still there". THE TELL THAT IT WAS ALREADY KNOWN: the column header carried `title="… (คนละเรื่องกัน)"` — a tooltip whose only job was to talk the reader out of a conclusion the UI itself was inviting. That clause is now gone; a tooltip that exists to explain why the UI is confusing is the signal to change the UI, not a fix. The rule encoded: the pin glyph and the word หมุด belong to the badge concept and NOWHERE else. Position gets ArrowUpToLine — deliberately the SAME glyph as the จัดตำแหน่ง button that creates the state, so the pill reads as that button's result — and the matched pair กำหนดเอง / ตามวันที่, which is the actual question the column answers: did someone choose this spot, or did the date? THE GUARDS COME IN PAIRS BECAUSE EITHER HALF ALONE IS SATISFIED BY THE WRONG FIX: "RankCell contains no หมุด" is satisfied by deleting the word from the whole file INCLUDING the badge switch's aria-label, where it is correct and load-bearing, so the fs tier also asserts the badge region still HAS both glyph and noun — the rule is about PLACEMENT, not a ban. And in the render tier NEITHER assertion can be made document-wide: `assert(!/หมุด/)` fails on the badge's own legitimate label while `assert(/หมุด/)` passes off that same label with the rank column still broken — both are true of this page at once, so a document-wide matcher cannot tell the fixed page from the broken one. Each `<td>` is therefore extracted first, the rank cell VERIFIED by content (it must carry one of the three labels this column can produce) rather than trusted by index, and the badge cell found by its `role="switch"` rather than by position; both extractors THROW naming the problem instead of returning an empty string, which for a "does not contain" check would look exactly like a pass. THE FILE'S OWN CONTROLS CAUGHT TWO REAL DEFECTS IN THESE TESTS BEFORE THEY SHIPPED: (1) the badge region slices up to `function RankCell(` and therefore swept in RankCell's DOC BLOCK, which quotes both `<Pin` and `หมุด` while explaining the rule — so the badge assertion was passing off PROSE; comments are now stripped before matching, since an assertion about what a component RENDERS must never be satisfiable by a comment about it. (2) `กำหนดเอง` was matched as a SUBSTRING, and the date-ordered branch's own tooltip ends `…ไม่ได้กำหนดเอง`, so the assertion also passed on a row saying the OPPOSITE; every label is now matched as element text (`>กำหนดเอง<`). Same class as the banner suite's bare /ค้นหา/ that matched the search input's placeholder. The `ปลด` button became `ปลดตำแหน่ง` — survivable while one concept wore both names, but with position and badge now spelled differently everywhere else it was the one control left that did not say WHICH of the two it released; the guard strips comments before matching because the explanatory note above the label contains the string `ปลด`, and Thai gives a regex no word boundary, so it tests `ปลด(?!ตำแหน่ง)`. The tie branch (`ลำดับ Pin ซ้ำ` → `ลำดับซ้ำ`) is RENAMED AND OTHERWISE UNTOUCHED: b-005 makes duplicate order numbers unrepresentable and it becomes an unreachable tripwire, so it is not invested in and not deleted, but its tooltip sentence explaining that publishedAt breaks the tie is pinned — it is the only place a user can learn that a duplicate number decides nothing. ZERO existing tests had to change: nothing in the suite asserted ปักหมุด or a Pin glyph in the rank column, so no test was holding the defect in place — it simply had no coverage at all. Verified red SIX ways, and A vs C redden DISJOINT sets, which is the independence the pairing depends on: restoring the word ปักหมุด (7 tests, all rank-side, badge assertions untouched), restoring the Pin glyph in the pill (3 — and this is what proves the render tier's `M12 17v5` pin-path matcher is live rather than vacuous), stripping หมุด from the badge aria-label (3, all badge-side, rank assertions untouched), reverting to a bare ปลด (1), restoring the (คนละเรื่องกัน) disclaimer (1), and leaking `showPinBadge` into RankCell's props (1 — the control that pins the two concepts as independent on screen, not merely in the data). 540 after making duplicate and stray pinOrder values UNREPRESENTABLE (+22 in test/pure/articlePositioning, over planMoveToPosition and planBlockNormalization in the existing src/lib/articlePositioning.js; checkpoint 1 of 2 — planner only, no UI, no deletions, no script). TWO BUGS, ONE ROOT CAUSE: server actions that wrote ONE positioning field without maintaining the block invariant. b-005 — `pinOrder` was a free number input, so duplicates and gaps were reachable and production held `1,1,2,3,4,5,6,7,9,10`; a duplicate is not cosmetic, because the cascade falls through to `publishedAt` so the number the admin typed stops deciding the position, and the tie consumes two slots so pinOrder 2 renders as rank 3. b-006 — ONE unpinned article carried a stale non-zero `pinOrder` and sorted DEAD LAST out of 483. THE DOCSTRING IS WHY b-006 SURVIVED THREE ROUNDS OF INVESTIGATION: this file claimed the model was "positioned articles by pinOrder, then everything else by publishedAt", but `pinOrder` is the SECOND key of `{isPinnedOnArticlePage:-1, pinOrder:1, publishedAt:-1, createdAt:-1}` and a sort key applies to EVERY document — all unpinned rows tie on `false`, so among them `pinOrder` is consulted BEFORE `publishedAt` and is uninformative only because they almost all hold 0. The docstring now states the invariant plainly (unpinned ⇒ pinOrder 0; pinned ⇒ contiguous 1..M) and notes that `compareArticlesForPublicOrder` in articleRank.js always modelled this correctly, which is why the admin rank column showed the right answer while this file's prose said the situation was impossible. Wrong prose is not a documentation defect when it is the reason nothing was tested. planMoveToPosition re-emits the block as contiguous 1..M on EVERY move, so no sequence of moves can reproduce the broken shape — repair by construction rather than by cleanup. Both planners sort with the SHIPPED comparator rather than by raw pinOrder, which is what makes them correct against UN-NORMALIZED data: the repair script runs AFTER this code ships, so a `1,1` tie must be resolved the way the public list already resolves it. Two kinds of bad input get two different answers — an out-of-range `target` CLAMPS (this is a click path; the UI bounds the control, so out-of-range means caller/block disagreement and clamping beats an exception), while an `id` not in the block THROWS a named NotInBlockError (no UI can produce it, and an empty plan would look exactly like a successful no-op move). A BUG THE TESTS CAUGHT DURING IMPLEMENTATION: the guard was first written as `Number.isFinite(Number(target))`, but `Number(null)`, `Number('')`, `Number([])` and `Number(false)` are all 0 — finite, therefore clamped to position 1 — so a select reading back `''` before a choice was made would SILENTLY MOVE THE ARTICLE TO THE TOP of the block. The parse is now type-aware, and the test sweeps all four coercion traps. THE FIXTURE IS RETURNED SCRAMBLED, deliberately: the order-preservation control works by DELETING the comparator sort, and had the fixture arrived in cascade order that deletion would change nothing and the control would pass while proving nothing — one test pins that the array order differs from the cascade order, the same discipline as articleRank's out-of-order control. The two central claims are DISENTANGLED and verified so: renumbering from 0 reddens 8 contiguity/value tests and leaves order-preservation GREEN, while numbering before sorting reddens 3 order tests and leaves every contiguity test GREEN — neither control can stand in for the other. Verified red five ways: renumberWrites numbering from 0 (8), dropping the comparator sort (3), emitting writes for unchanged rows (5), swallowing the not-in-block case (1), and — the fifth — a GAP THE CONTROL PROCESS EXPOSED rather than a planned check: breaking planDemotion's own minimal-write guard produced ZERO failures across the entire suite, because the only assertion on it was `writes.length >= 2`, which a plan that writes every row also satisfies. Demoting the TAIL is the case that separates them (both survivors keep the numbers they hold, so a correct plan touches exactly one row) and now has its own test. test/pure/articleRank.test.mjs is UNTOUCHED and all 12 of its tests still pass — it encodes the ordering users see and this checkpoint changes no ordering, only the numbers underneath it. 565 after retiring every unsafe pinOrder write path and bounding the UI (+25: 10 in the new test/fs/articlePinOrderWrites, 15 in the new test/render/adminPositionControls; checkpoint 2 of 2). THE INVARIANT NOW ENCODED: exactly one thing decides a pinOrder, it is a planner, and it is called ON THE SERVER FROM A FRESH READ. Three write paths are gone. `updateArticlePinOrder` wrote a free integer to one row with no view of the block. `toggleArticlePinnedOnArticlePage` wrote isPinnedOnArticlePage and left pinOrder stale — the only remaining path that could produce b-006 — and had ZERO callers. The third is the subtle one: `applyArticlePositionPlan` was an exported server action taking `{writes:[{_id, pinOrder}]}` STRAIGHT FROM THE BROWSER, and the admin list computed its own plans and POSTed them. In a 'use server' module an export IS a POST endpoint, so that is a free pinOrder write with extra steps — the planner was a convention the client was expected to follow rather than a guarantee — and the client's list is a PAGE-LOAD SNAPSHOT while a move renumbers the WHOLE block, so a tab left open since morning would write a block-wide renumbering from stale data. It is now un-exported, which is what makes the guarantee structural; repositionArticle / moveArticleToPosition / setArticlePinBadge each re-read, plan, apply, and RETURN the plan so the client can replay it for the optimistic update — one piece of arithmetic, computed once, on authoritative data. The fs guard is deliberately TWO-SIDED because "only one file writes it" is satisfied by that file writing whatever it likes (which is what updateArticlePinOrder did): no file outside actions/articles.js persists a pinOrder, AND the single `$set.pinOrder =` in that file must read exactly `Number(w.pinOrder)`, i.e. a plan value. A THIRD guard asserts the client imports no plan BUILDER at all. THE MATCHER WAS WRONG TWICE AND ITS OWN CONTROLS CAUGHT BOTH: the first version, `/(?:^|[^.\w])pinOrder\s*[:=](?!=)/`, MISSED `doc.pinOrder = 7` (the leading `[^.]` excluded the exact `.pinOrder =` shape it claimed to catch) and OVER-FIRED on `.sort({…, pinOrder: 1})` — the cascade itself — and on the JSX prop `<RankCell pinOrder={…}/>`. `pinOrder: 1` is a sort key in one file and a write in another; raw text cannot tell them apart. So the guard targets PERSISTENCE (a union of four narrow `$set`/`$inc` shapes, each pinned by a control) rather than trying to classify syntax, leaving reading/sorting/rendering unrestricted — otherwise every consumer joins the exception list and the list becomes the thing under review. Its honest edges are stated in the test rather than hidden. THE UI: the free `<input type="number">` is gone, replaced by ↑/↓ (disabled at the ends) and a select of exactly 1..M with M DERIVED from the live block, never a constant — a control that cannot ask for a position the model cannot store, since ranks M+1 and beyond belong to the date-ordered mass. A SECOND MATCHER BUG, same class as the banner suite's /ค้นหา/: `arrowDisabled` tested `/\bdisabled\b/`, which matches inside the Tailwind class `disabled:opacity-30` — `:` is a non-word char — so EVERY arrow read as disabled, failing the three "live" assertions and passing the all-dead one for entirely the wrong reason. It now matches the attribute `disabled=""`, with a control distinguishing attribute from class. `pinTie` is kept as a CORRUPTION TRIPWIRE rather than deleted: ties are unreachable now, so if the amber ลำดับซ้ำ pill ever appears something wrote pinOrder outside the planner (a restored backup, a hand edit in Compass) — an unreachable branch that fires is a signal, and deleting it would trade a visible symptom for a silent one. ArticleForm needed NO change: it renders pinOrder as read-only text and already routed promote/demote through server-side repositionArticle. Verified red EIGHT ways: a `$set` pinOrder outside the writer (1), the writer using a literal (1), re-exporting applyArticlePositionPlan (1), the client importing a plan builder (1), reintroducing the number input (1), hardcoding the select options (4), never disabling the arrows (3), and the stub keeping a retired export (1 — the stub is a fixture that can lie, so stub ⊆ real is pinned). THE DRY RUN FOUND THE DATA HAS MOVED SINCE THE INVESTIGATION: the block is now 11 articles numbered 1..11, contiguous, NO duplicate and NO gap — verified independently of the script by a direct read. b-005's data is already clean (a demotion renumbers survivors to 1..M, so an unrelated demote/promote almost certainly repaired it as a side effect); b-005's DEFECT — that the surface allowed it — is real and is what the UI change fixes, and the `1,1,2,3,4,5,6,7,9,10` case remains fully covered in the pure tier because a restore from backup can bring it back. b-006 is present exactly as reported: ONE unpinned row holding pinOrder 2, sitting at position 483 of 483, which the repair returns to 401 where its 2026-06-08 publishedAt puts it. The script reports the two effects in SEPARATE labelled sections because their visibility is opposite — renumbering moves nothing a reader sees, zeroing a stray row moves it 82 places — and a merged before/after list would make that jump read as a bug; section C distinguishes the 82 rows that shift by exactly ONE (correct arithmetic, marked ✔) from any larger movement (marked ⚠), because a warning that fires on every correct run is one nobody reads. THE WRITE-MATCHER WAS THEN WIDENED FROM ONE FAMILY TO THREE, because an operator-shape guard has a blind spot big enough to drive the original bug through: `const a = await Article.findById(id); a.pinOrder = 5; await a.save();` carries no `$set` and sailed straight past it, as does an operator-less `updateOne(filter, { pinOrder: 5 })`. It now also bans PROPERTY ASSIGNMENT (`.pinOrder =` — the sharper end of the Mongoose shape, catching the value at the point it is decided rather than at the save, and needing no reasoning about which variable is a document; verified to occur exactly ONCE in all of src/, inside the sanctioned writer, because plans are built as object literals and never by assignment) and WRITE-CALL WINDOWS (pinOrder within 300 chars of updateOne/findByIdAndUpdate/replaceOne/bulkWrite/… — a window rather than an argument parse, since payloads are variables, spreads, or multi-line; verified not to over-fire, as every one of those call names appears elsewhere in src/ for 2FA, registrations, masterclass and webhooks and none of those windows mentions pinOrder). Each family ships a control proving it is INDEPENDENTLY load-bearing — the operator family is asserted NOT to cover the operator-less update, or the write-call family would be untested dead weight — and a further control proves the UNION is live, since regexes can each be correct while one is dropped from the disjunction (verified: removing the assignment family reddens the shape sweep). Verified red two more ways, both shapes that were INVISIBLE before this widening: a doc-mutation-plus-save and an operator-less update, each appended to an unrelated src file. WHAT IT STILL CANNOT SEE IS NOW WRITTEN DOWN in the test file rather than left to be discovered — computed keys (`doc['pinOrder']`, `doc[field]`), payloads assembled beyond the window, and anything reaching the collection outside this repo (mongosh, Compass, a restored backup). That last one is unfixable by a text scan and is precisely why the `ลำดับซ้ำ` tripwire was kept: the guard covers the code, the tripwire covers everything that is not the code. Finally, the `disabled:opacity-30` lesson is generalised at the point of use: NEVER match a bare HTML attribute NAME in Tailwind markup, match `attr=""`. Every state variant is an attribute name followed by a colon and `:` is a non-word character, so `\b` sits happily inside `checked:`, `required:`, `open:`, `readonly:` and the rest; the class is present on BOTH renders, so a name-only matcher returns true unconditionally — "on" assertions pass for the wrong reason and "off" assertions fail with a confusing diff. The control demonstrates it across four variants rather than only for `disabled`. 591 after the admin action history model + writer (+26 in test/pure/adminAuditLog, over the new src/models/AdminAuditLog.js and src/lib/audit/recordAdminAction.js; model and writer only — NOTHING is instrumented yet, so this number does not move again until the sweep). The writer's contract is that it never throws and never DROPS an event: an unregistered menu key is filed under UNKNOWN_MENU with the offending value kept in `menuRaw` (a phantom key would be an unlabelable filter in the reading surface, since labels come from ADMIN_PAGES — but a trail whose failure mode is "the event vanished" is strictly worse than one with an odd label, and menuRaw makes the bad caller findable by query), an oversized payload becomes {__truncated, chars, preview} rather than null, and an unserialisable one becomes {__unserialisable, reason}. It DIVERGES from pageAudit.js on one point deliberately: that writer is fully silent (`catch {}`), this one warns. A page audit row sits beside a PageVersion snapshot and losing one costs a convenience; this trail is the whole admin's answer to "who changed this", and the first time anyone reads it is the first time it matters, so a month of quiet non-writing must not be invisible — the caller still sees nothing either way, since the return is a boolean nobody has to check. Every assertion is paired with a control and the registry key under test is taken from ALL_PAGE_KEYS[0] AT RUNTIME with the negative being that same key plus one character, so neither a pass-through nor a hardcoded-reject implementation can be green in both directions. Verified red seven ways: normalizeMenu echoing its input (4), capPayload truncating unconditionally (3), capPayload dropping oversize instead of truncating (4), the writer never calling create (6), the writer failing fully silently (1), an unknown menu dropping the row (1), and a pathological entry allowed to throw (1). THIS BUMP IS ALSO THE EVIDENCE THAT THE FLOOR IS THE WRONG SHAPE OF INSTRUMENT: it was NOT raised in the commit that added those 26 tests, because that commit was constrained to new files only, and the suite stayed green at 591-passed-against-a-565-floor — i.e. all 26 could have vanished the next day and the meta-control would have said nothing. A minimum catches only wholesale disappearance (a tier dir that stops being enumerated, a loader that skips every file); it cannot catch the tests you added this week, because the number that would catch them is the one a human forgot to write down. The fix is not a better number but an EXACT match (`total !== EXPECTED` rather than `total < FLOOR`), which makes every test addition bump this line deliberately instead of optionally — the same discipline this comment already documents in prose. Not changed here because the approved edit was the bump alone. 753 after the audit contract module (+24 in test/pure/auditContract, over the new src/lib/audit/auditContract.js; VOCABULARY ONLY — still nothing is instrumented, so this number does not move again until the sweep). The module holds the (menu, entity) pair set, a Thai label for each entity, a diff-policy ceiling and the `courses` dual-key flag; it DELIBERATELY does not hold the recordId/recordLabel prose, which stays in docs/admin-audit-log-plan.md §8.7, because a string in code that nothing executes cannot be kept true by anything — this repo has shipped authoritative-looking-and-wrong artifacts before, and §7 of that same doc justified a design decision with a page-history UI that does not exist. Two assertions encode §1's correction so it cannot drift back: `dashboard`/`landing_cache` ABSENT, `profile` PRESENT (§1 wrongly listed profile as never-appearing because it counted mutating exports by their requireAdmin literal and updateOwnProfile has no guard, though it does mutate — admin-accounts.js:250). The `security` absence test names sweep round 6 in its own title and is EXPECTED to be deleted by that work rather than kept green; it is the one assertion here meant to die. Verified red sixteen ways, with the count of assertions each break reddened: a menu key outside ALL_PAGE_KEYS (2), a non-slug entity key (1), an empty entity key (2), a menu declaring no entities (4), a typo'd diff policy (2), a PII entity raised to a full diff (1), dualKeySpace set on a second menu (1), isDualKeySpace returning true unconditionally (2), an untranslated Latin label (1), a label allow-list entry gone stale (1), profile removed (4), security added early (1), MENUS_WITHOUT_MUTATIONS hardcoded instead of derived from ALL_PAGE_KEYS (2), isValidPair ignoring the menu (1), pairContract throwing instead of returning null (1), and ordered_ids given a rank on the ceiling scale (1). ONE ASSERTION WAS DELETED RATHER THAN SHIPPED: 'entity keys are unique within a menu' CANNOT go red, because the contract is an object literal and JS drops a duplicate key at parse time, so new Set(keys).size === keys.length holds by construction. The hazard is real — the earlier definition vanishes silently — but catching it needs the source text via readSourceForScanning, which is an fs-tier guard, not a pure one. The pure tier now says so in a comment where the test would have been, rather than asserting something true by construction and reporting it as coverage. 760 after the contract amendments (+7 in test/pure/auditContract). THE MODULE IS NOW AN ARRAY OF ENTRIES WITH THE LOOKUP MAP DERIVED FROM IT, and that restructure is the whole point of this bump: the previous commit shipped a COMMENT where a test should have been, explaining that 'entity keys are unique within a menu' could not go red because a nested object literal makes a duplicate key unrepresentable — JS drops the earlier definition at parse time, so new Set(keys).size === keys.length holds by construction. The comment was accurate and the conclusion ('this needs an fs-tier source scan') was the wrong half of the choice. Making the hazard REPRESENTABLE beats making it observable: as an array the duplicate exists as data, a pure test counts it, and the control is appending one and watching it redden. A guard about data beats a guard about text — same lesson as sourceScan.mjs, arrived at from the other side. Also encoded here are the two §8.7 rulings that this bump discovered were UNPROTECTED: pages|preview is split so that 'never log the preview password' is a structural act_only ceiling rather than prose nothing enforces (regeneratePreviewPassword being the most dangerous pair in the table to leave at full), with preview_expiry taking the non-secret expiry date so nobody raises the ceiling to get it back; and local_faq is legal under all FOUR menus pageKeyForType can resolve to, because menu is the RESOLVED key and without the pairs a real row is refused by its own contract. Both were caught by running the break checks and finding NOTHING went red — data with no assertion over it. Verified red six ways: a duplicate (menu,entity) pair appended (3), the derive-reduce altering a label (2), the preview ceiling raised to full (1), preview_expiry deleted (1), a local_faq pair removed from courses (1), and local_faq declared under a menu whose guard cannot resolve to it (1). 768 after sweep round 1 — menu `roles` (+8 in the new test/fs/auditCoverage, over the three instrumented actions in src/lib/actions/roles.js). THE DELIVERABLE OF THAT COMMIT IS THE CALL SHAPE, not the three rows: ~156 more sites copy it, so the decisions are made once and written into the file header rather than inferred later. after() rather than await (nobody consumes the writer's boolean, but the row must really be written and the admin must not wait on it), WRAPPED IN try/catch because after() itself throws outside a request scope — the house pattern from src/lib/*/trigger*Sync.js — since rule 1 of the writer's contract is that a lost audit row must never cost a save, and an unguarded after() breaks precisely that rule in precisely the case where the guard looks unnecessary. The audit call goes after the mutation and immediately before the return, so a failed write leaves no row and nothing mutates the logged values after they are captured. `before` for updateRole is read off the hydrated document ALREADY IN HAND — no second query, and no findOneAndUpdate({new:false}) which would have replaced the hydrated save that function deliberately relies on for its pre-validate hook. THE COVERAGE GUARD IS SCOPED BY AN EXPLICIT SWEPT_FILES LIST, one line per round, so an unswept file is absent rather than silently exempt; I argued in the previous commit that this guard would be vacuous, which was true at zero files swept and is not true at one — prototyping the matcher against a single file is far cheaper than meeting 38 at once. It reads through readSourceForScanning, and the control that matters proves a recordAdminAction call written inside a COMMENT does not satisfy it: verified on the real file, where commenting the createRole block out reddened the coverage assertion exactly as deleting it did. That is the sixth costume of the one matcher defect this suite keeps relearning — matching TEXT that is not CODE. Verified red eight ways: the deleteRole audit block removed (1), the same block commented out rather than removed (1), the updateRole menu literal drifted from its requireAdmin guard (2), an entity typo producing a pair the contract rejects (1), createRole wrongly declared read-only (1), SWEPT_FILES emptied (1), plus the write-call matcher and exempt-list controls that stop the sweep assertions passing by skipping every function. A PARSE CHECK WAS ADDED TO THAT GUARD AFTER IT FAILED TO CATCH A REAL BREAK IN THE VERY FILE IT GUARDS: the reference call shape shipped with a path written literally inside a block comment whose star-slash closed the comment early, roles.js stopped parsing, and all eight assertions stayed green — because every one of them reads the file as TEXT, and a broken module is still a string that includes('recordAdminAction('). Nothing else in the suite imports these action files (they pull in mongoose models and next/server), so a swept file could be syntactically dead and fully green. Parsing via sucrase is the cheapest possible floor under a guard built on text, and its control reintroduces the exact star-slash defect. That is 770, not 768. — STOP. THE NUMBER WAS ALREADY WRONG WHEN THE SKILL-RENAME BATCH STARTED: this constant read 1096 while the suite ran 1146 across 84 files, on a clean `refactor` tree, before a single edit. 50 tests were added at some point without bumping it, so `npm test` exited 1 on its own meta-control and had presumably been doing so for a while — which is the failure mode this constant exists to PREVENT, arriving as a standing red that trains everyone to ignore the line. The +50 correction is NOT part of the skill-rename work and is called out separately in that report. Rebaselined to the measured 1146 and then: 1153 after the /rpa-all-courses soft-404 redirect (+7 in test/fs/skillSlugRedirects — the permanent-vs-temporary control the brief named, the missing/mis-aimed pair, the exact-four-sources set with its extra-source control, and the no-redirect-chain check with its control). 1164 after the site.js skill-config rename + Design addition (+11 in test/pure/skillsConfig: required-field and three-key uniqueness guards with the duplicate-entry control the brief named and a one-key-only control, the Automation/Design identity pins, the exact-seven count, the icon-URL shape/uniqueness check, and the findSkillBySlug `?skill=` contract with the control showing an unresolved slug means "no filter" rather than "no results"). That file asserts NOTHING about the verification stamp, on purpose — see its header. Then +11 more in the SAME commit for legacySlugs (7 pure in test/pure/skillsConfig: the retired-slug resolve, legacySlugs-is-optional, the canonical-wins-on-collision rule, the one-namespace uniqueness guard and its two collision controls; 5 render in test/render/skillFilterOptions pinning that the dropdown offers canonical slugs ONLY — accepted, never offered), and the pre-existing findSkillBySlug contract test was rewritten rather than added to, so COMMIT 2 is +11 then +11. 1196 after the SkillOrder→mega-menu join (+32: 16 pure in test/pure/skillOrder covering the normaliser, the map, the ghost-row-ignored and no-row-sorts-last rules, and the mandatory config-index tie-break with its reverse-the-array and not-a-label-sort controls; 8 render in test/render/skillMenuOrder asserting both menus emit the same sequence, a hidden skill is absent link-and-all, and an empty map renders the config order rather than an empty menu; 8 seam guards in test/fs/skillMenuWiring, which exist because the real panel and drawer are behind useState gates this suite cannot open). 1202 after closing syncNavMenuData's bust-before-read gap (+6 in test/pure/upstreamTagBusters: the sync-job discovery meta-control, the exact-offender list that names syncLandingData as a KNOWN unfixed gap so both adding one and fixing that one redden, and three controls — bust below the read, no bust at all, and a bust that exists only in a comment).
// ── history, one line per bump (the giant line above is legacy; do not extend it) ──
// 772 (round 2, commit 1) — test/fs/actionsParse.test.mjs (+4), and the parse check REMOVED from
//   auditCoverage (-2) where it was scoped to SWEPT_FILES. Net +2. Nothing in this suite imports any
//   src/lib/actions module — they pull in mongoose models and next/server — and the fs-tier guards that
//   do look at them read them as TEXT, so a syntax error in any of 42 server actions was invisible to the
//   entire run. That is how roles.js shipped unparseable while eight coverage assertions stayed green.
//   The list is READ FROM THE DIRECTORY, and instead of a >= 1 floor (the weak-assertion antipattern this
//   repo has already named, which a glob pointing at the wrong directory satisfies) it asserts the derived
//   list contains roles.js, articles.js and pageBuilder.js. Verified red by reintroducing the star-slash
//   defect in a real action file, and by an unbalanced paren.
// 778 (round 2, commit 2) — recordAdminActionAfter() in the writer (+5 in test/pure/adminAuditLog), plus a
//   matcher-widening control in auditCoverage (+1). Three lines of try/after/catch were correct at every
//   call site and noise at every call site; centralising before ~156 copies is the whole point. The catch
//   WARNS AND DROPS THE ROW — it deliberately does NOT fall back to an unawaited recordAdminAction(). The
//   only way to reach that branch is an action invoked outside a request scope (a script, a seed, a test),
//   where a lost row is the correct outcome because nothing a human did in the admin happened; and a
//   floating promise in a serverless runtime can be frozen mid-write, reject unhandled, or hold a
//   connection past the response. Real hazard, zero benefit. NOTE the matcher trap this commit walked into
//   on purpose: a matcher for "recordAdminAction(" does NOT match "recordAdminActionAfter(" — the word
//   After sits between the name and the paren — so the coverage guard went red the moment roles.js was
//   converted, exactly as predicted, and the fix is an optional group plus a control proving the widened
//   matcher still rejects recordAudit(, recordAdminActionLater( and a bare mention.
//   test/stub-next-server.mjs gained an "after"
//   export because the writer now imports it at module scope; without it every test in adminAuditLog dies
//   on load rather than on its assertion. Verified red four ways: the scheduler dropping its callback, a
//   throwing after() falling back to a write, the widened matcher accepting a near-miss name, and a
//   commented-out call of EITHER spelling counting as coverage.
// 787 (round 2, commit 3) — the writer now ENFORCES the diff policy (+9 in test/pure/adminAuditLog).
//   Until now the PII rule of doc 5.2 was 38 hand-written xFields() helpers and a promise: each correct
//   today, each one careless edit away from copying a customer name/email/phone into an append-only
//   collection whose whole premise is that rows are never modified — a deletion request could not redact
//   them. buildAuditRow now looks the (menu, entity) pair up in auditContract and reduces before/after to
//   what the policy permits. REDUCE, NEVER REJECT: rule 2 says the writer never drops an event over a bad
//   field, and stripping a payload keeps the who/what/when. An UNREGISTERED pair fails closed to act_only
//   AND WARNS, which also gives a typo of the free-form "entity" field its first visible symptom — before
//   this it had none, since a typo'd entity writes a row that looks right in the central list and is
//   permanently invisible to the inline widget. Reduction runs BEFORE the size cap on purpose: capping
//   first would turn an oversized status_only payload into a truncation marker carrying 200 characters of
//   exactly the personal data the policy exists to exclude, preserved as evidence. "meta" is NOT reduced —
//   it is outside the scale by design and count_only depends on it surviving. SIX EXISTING WRITER TESTS
//   MOVED, all for one root cause: REAL_KEY is ALL_PAGE_KEYS[0] = dashboard, which is read-only and
//   deliberately has no contract entry, so every payload sent under it is now correctly reduced and
//   warned about. They were re-pointed at FULL_PAIR/STATUS_PAIR taken from the contract AT RUNTIME — same
//   discipline as REAL_KEY, one level down. Verified red five ways: the status_only branch returning its
//   input unchanged, the full branch nulling everything, the fail-closed default flipped to full, the
//   unregistered-pair warning silenced, and the cap moved back in front of the reduction.
// 790 (round 2, commit 4) — sweep round 2, the four PII entities: 11 exports across registrations.js,
//   inhouse-registrations.js, career-path-registrations.js and masterclass-registrations.js (+3 controls
//   in test/fs/auditCoverage). recordLabel is empty for all four, because the reference number the admin
//   reads is String(_id).slice(-8).toUpperCase() and recordId already carries it. Status transitions
//   carry the enum before and after; everything else records the act. THE DELETES ARE THE SIMPLEST IN
//   THE WHOLE SWEEP, and that is the finding rather than an omission: every other delete needs a
//   read-before-delete because the label is unrecoverable afterwards, but here there is nothing we are
//   PERMITTED to capture, so the read does not happen at all. Four status actions flipped
//   findByIdAndUpdate to new:false to obtain the PREVIOUS status — no extra query, the existence checks
//   are unchanged, and the document never reaches the caller. TWO NEW EXEMPTION LISTS, both keyed
//   per-export with a written reason and never a pattern: NOT_LOGGED holds createCareerPathRegistration
//   (a public visitor submitting a form, no admin actor), and MENU_CHECK_EXEMPT holds
//   updateMasterclassRegistrationAttendees, whose bare requireAdmin() leaves no literal to compare the
//   menu against. THE GUARD CAUGHT SOMETHING REAL ON FIRST RUN: registrations.js computes its entity
//   from the source parameter, so there is no literal at all and the pair assertion went red. Rather
//   than waive it, COMPUTED_ENTITY declares the complete value set that expression can produce and
//   checks every one against the contract — the obligation moves from "the matcher can see it" to "a
//   human wrote down what it produces". Verified red four ways: an exemption naming a deleted export, an
//   exemption with no stated reason, a computed-entity entry declaring an empty set, and one declaring a
//   value the contract does not know.
// 794 (pre-round-3, commit 1) — the coverage classifier could not see MSDB writes (+4 in
//   test/fs/auditCoverage). WRITE_CALL listed Mongoose method names only, so courses.js — which writes
//   exclusively through msdbCreate/msdbUpdate/msdbDelete over HTTP and touches Mongo nowhere — had all
//   THREE of its exports classified non-mutating and skipped. Not a red: a silent false-green that would
//   have reported full coverage over a round-3 courses sweep instrumenting nothing. Section 6 of the plan
//   doc ALREADY listed the MSDB writers in its own classifier, so the doc walker saw them and the guard
//   walker did not — two classifiers that must agree, written at different times, with nothing forcing
//   agreement. Fixed in three ways, not one: the pattern gains the MSDB names; the classifier is now
//   exercised over an UNSWEPT file (courses.js) so it has controls of its own rather than only being
//   observable through SWEPT_FILES, which is exactly how the blind spot survived; and the swept-file
//   check now calls the SAME mutatingExports() the count uses, so there is one classifier instead of two.
//   MUTATING_EXPORT_COUNT is pinned at 156 = 143 direct + 13 via a local helper. Section 2 records 159
//   from its own walker; the gap is 3, one-directional, and fully explained — syncFaqsAction,
//   syncPromotionsAction and syncCareerPathsAction write through an IMPORTED helper, which section 2
//   counts only because it hardcodes those three helper names (section 6 says so itself). Direct counts
//   agree exactly at 143, and there is NO export this walker sees that section 2 misses, so the sweep
//   plan's 159 stands. Verified red four ways: msdbCreate removed from the pattern, the count constant
//   moved by one, the module list narrowed to a subset, and the local-helper resolution disabled.
// 796 (round 3) — sweep round 3, the MSDB half: eight exports across courses.js, schedules.js and
//   course-extensions.js (+2 in test/fs/auditCoverage). Every earlier site wrote Mongo; three of these
//   never touch it, which is what hid them from the classifier until the previous commit.
//   COURSE-EXTENSIONS.JS WAS PULLED IN DELIBERATELY, ahead of its round-5 slot: `courses` is the one
//   menu with two key spaces — courses|course logs an MSDB ObjectId, courses|extension logs the course_id
//   CODE — and courses.js alone exercises only the first. Discovering a problem with that shape while
//   ~129 sites are in flight is the outcome this round exists to prevent. course-promos.js stays in
//   round 5 because reorder is its own shape and belongs with the other fifteen.
//   DELETECOURSE TAKES AN UNCACHED READ BEFORE DELETING, which looks like the opposite of round 2 where
//   every delete logs recordLabel: ''. Same principle, different situation: there recordId IS the
//   human-readable reference and the PII policy forbids more; here recordId is an opaque ObjectId and a
//   course name is not personal data, so the snapshotted label is the only thing that can ever answer
//   "what was it called". The read goes through aiFetch(revalidate: 0) — client.js's documented
//   no-store signal — never getPublicCourse (tagged, 1h) or resolveCourseObjectId (resolveIds.js:26,
//   300s, untagged), because a cached read logs the name from BEFORE a rename. It filters on `course`,
//   never `_id`: upstream silently ignores `_id` and returns the whole list, re-verified live at 77 rows
//   vs exactly 1. UPDATESCHEDULE LOGS THE ID THE ACTION RESOLVED, not a second parse of its overloaded
//   signature — two parsers of one overload can disagree, and when they do the row names a record nobody
//   touched, with no symptom. That is a general rule for the remaining ~148 sites, recorded in the doc.
//   DELETESCHEDULE WRITES TWICE (MSDB then Mongo) and can return ok with the second half failed — the
//   sidecar cleanup has a pre-existing .catch() so a stranded sidecar cannot fail a delete that already
//   happened upstream. It is still ONE row, because one thing happened as far as the human is concerned,
//   and meta.sidecarDeleted records which halves landed. Flagged as a pre-existing correctness question,
//   not fixed here. No return value changed anywhere in this round: all eight recordId values were
//   already in scope, so the speculative-field commit was skipped rather than written.
//   Verified red six ways: the audit call removed from an MSDB-only export, the courses menu literal
//   drifted from its guard, an entity typo breaking the pair, the extension entity changed so only one
//   key space is exercised, updateSchedule re-parsing the overload instead of reusing the resolved id,
//   and the uncached read swapped for the cached resolver.
//   796 -> 800: running those controls found TWO of the six firing NOTHING, both on rulings this round
//   was specifically about. No assertion pinned that the deleteCourse label read is uncached, and none
//   pinned that the audit call reuses the resolved id rather than re-reading the overload. Swapping
//   revalidate: 0 for the cached form, and recordId: String(id) for String(idOrFormData), were both
//   silently green. Two guards added (+4 with their controls): the label read must pass revalidate: 0 and
//   must not filter on _id, and no audit call in any swept file may mention a raw overload parameter —
//   stated generally, since ~148 sites remain. The second ships a control asserting updateSchedule is
//   STILL overloaded, so the rule cannot quietly become vacuous if the signature is ever normalised.
// 815 (phase 3a, commit 1) — RBAC groundwork for the audit-log page (+15 in the new
//   test/pure/menusForUser). The audit_log page key joins ADMIN_PAGES in the ระบบ group, which has two
//   INTENDED consequences: it enters MENU_ENUM automatically so the log becomes auditable by its own
//   machinery, and it appears in the sidebar and roles checkbox UI because both render from ADMIN_PAGES.
//   menusForUser() is added beside canAccess — a name invented in an earlier spec that had never existed.
//   THE NARROWING TO ALL_PAGE_KEYS IS THE FAIL-CLOSED MECHANISM, not tidying: rows filed under
//   UNKNOWN_MENU are superadmin-only, and what enforces that is simply that unknown is not a page key, so
//   it cannot survive the filter AND cannot be granted, since there is no checkbox for it. Asserted as a
//   named property with a control that pins the structural fact rather than the special case.
//   WRITING THE TESTS FIRST CAUGHT A DESIGN QUESTION THE SPEC DID NOT COVER: a user object with no pages
//   field at all takes the pages == null sentinel branch (loose equality) and gets allow-all. That is not
//   this function inventing anything — canAccess has always returned true for the same input — and the
//   invariant that matters is that the two AGREE. A stricter clamp would put a user past requirePage and
//   then show them an empty table indistinguishable from a broken query; a looser one leaks. A control
//   now asserts agreement across the whole sentinel matrix, in both directions.
// 834 (phase 3a, commit 2) — the audit-log query builder (+19 in the new test/pure/auditQuery).
//   THE SPLIT HAD TO BE AT FILE LEVEL, not export level, and the meta-control is what found that: the
//   builder first shipped alongside the runner in readAuditLog.js, which imports dbConnect (throws at
//   module load with no MONGODB_URI) and a mongoose model. The whole test file contributed ZERO tests and
//   the per-file meta-control named it — a total-only check would have reported 815-of-815 and moved on.
//   auditQuery.js is now pure, importing nothing but the RBAC predicate. Two properties carry the file:
//   a UI filter can only narrow WITHIN the clamp (asking for a menu you do not hold yields the empty
//   intersection, not the menu, and not an error that would confirm it exists), and an empty clamp stays
//   : [] rather than collapsing to no-filter, which would turn a page-less admin into a superadmin.
//   THE CURSOR IS COMPOUND ON (createdAt, _id) because same-millisecond rows are now likely rather than
//   theoretical — one human action can write two rows and after() schedules them back to back.
//   EXPLAIN() SAYS THE PLAN IS NOT SORT_MERGE, and that is reported rather than patched: sort({createdAt:-1})
//   alone plans SORT_MERGE over six IXSCANs, but adding the _id tie-break forces a SORT stage, because the
//   declared {menu:1, createdAt:-1} index carries no _id component. The tie-break stays anyway — dropping
//   it would let a tied row fall past a page boundary and be excluded by the next cursor forever, which is
//   a silently skipped row in an audit trail. Today it is a BOUNDED top-K sort (limitAmount 50, memLimit
//   32MB) over index-narrowed rows. No index was added: that would be a fifth and sixth index on an
//   append-only collection, which section 8.6 rejected on cost grounds, and reopening it is a decision.
// 853 (phase 3a, commit 3) — the central audit-log page and its health checks (+19 in the new
//   test/pure/auditHealth). THE VERIFICATION WE SKIPPED MOVED INTO THE PAGE: every check that would
//   otherwise have been a throwaway script now runs on every render, against whatever the sweep has
//   written since. Two of them cannot be a writer unit test at all, which is the point. SAME_BEFORE_AFTER
//   catches the new:false -> new:true defect that reverting was verified to redden NOTHING in this suite;
//   POLICY_VIOLATION is the only continuous evidence that round 2 PII reduction holds against real writes
//   — a unit test proves reducePayload is correct, only this proves nothing bypassed it. Each detector
//   ships a control asserting the neighbouring shape stays quiet, because a detector that fires on
//   everything turns the page permanently red and gets ignored, which is the same outcome as no check.
//   The coverage panel says in the UI that most pairs being empty is EXPECTED during the sweep — 56 of 58
//   are empty today, and without that sentence it reads as 56 failures. Three distinct empty states, so a
//   blank table always says WHICH nothing it is: no rows yet, no match for this filter, or you hold no
//   menus at all. Filters live in searchParams so the page stays a server component and links are
//   shareable; the clamp is never among them.
//   853 -> 855: running the controls found one break firing NOTHING — removing the act_only short-circuit
//   from the policy check. It exposed an uncovered case rather than a dead control: a REORDER row has
//   before: null and after: {orderedIds}, which is the shape round 5 will write sixteen times, and
//   without the short-circuit every one of them would be flagged red on correct data. A page that is red
//   on correct data gets ignored, which is the same outcome as having no check at all. Two tests added.
// 870 (phase 3b, commit 1) — refNo extracted (+15: test/pure/refNo and the new fs guard
//   test/fs/refNoSingleSource). §8.7 scheduled this for "when Phase 3 becomes the seventh caller" and
//   recorded SIX copies. THE REAL COUNT WAS FOURTEEN: that grep looked for the name refNo and missed the
//   eight written inline as `referenceNumber = String(doc._id).slice(-8).toUpperCase()` in the API routes
//   and email senders. The guard is therefore a SCAN of src/ rather than a list — a list would have been
//   wrong the same way the doc was. Extraction also fixed one behaviour: the naive expression rendered a
//   missing route param as "ใบสมัคร NDEFINED" — not even the whole word, because slice(-8) eats the
//   leading u of "undefined". A separate displayRecordId() shortens ObjectIds but leaves an
//   already-readable recordId alone, because blind truncation turns COPILOT-STU into ILOT-STU.
// 897 (phase 3b, commits 2-3) — the inline RecordHistory widget and the list-page "edited last" hint
//   (+27 in test/pure/recordHistoryQuery). SWEPT_FILES MOVED OUT OF THE TEST FILE into
//   src/lib/audit/sweptMenus.js, because the widget needs swept-ness at RUNTIME to tell "no history for
//   this record" apart from "this menu is not wired up yet" — and src/ cannot import from test/. One
//   list, two derived views (SWEPT_FILES for the guard, SWEPT_MENUS for the widget); the coverage guard
//   now imports it. It is NOT in auditContract.js, whose docstring explicitly excludes the call-site
//   inventory — the contract is stable vocabulary, this is project state that ends when the sweep does.
//   PERMISSION IS RE-CHECKED IN THE READER, not inherited from the screen requirePage: DENIED and
//   NOT_INSTRUMENTED and OK are three distinct states, and permission is evaluated BEFORE swept-ness so
//   an outsider is never told that a menu exists and is on the roadmap. The courses dual key space is
//   the flag first real consumer — read from isDualKeySpace(), never hardcoded, with a control proving a
//   non-dual menu builds a plain equality. MEASURED AGAIN RATHER THAN ASSUMED: the list-page $in plans
//   LIMIT <- FETCH <- IXSCAN [recordId_1_createdAt_-1] with NO sort stage, exactly as §8.6 predicted.
//   The widget query with AUDIT_SORT planned a blocking SORT, so it got its own RECORD_HISTORY_SORT of
//   {createdAt:-1} — safe here and NOT on the central page, because the _id tie-break exists for cursor
//   pagination and the widget has no cursor. Same reasoning, opposite conclusion, hence a second
//   constant with a control asserting the two never converge.
// 926 (article ordering, round 1 of 2, commit 1) — the pure sortKey planner (+29 in the new
//   test/pure/articleSortKey, over the new src/lib/articleSortKey.js and one extraction in
//   articleRank.js). Every article gets its OWN order number, so ordering stops requiring
//   "จัดตำแหน่ง" to be switched on for the row first. NOTHING READS IT YET — the cascade, the compound
//   index and the admin UI are round 2, and the split is not caution for its own sake: `getArticles`
//   reads with .lean() (no Mongoose defaults) and then JSON round-trips through serialize() (which drops
//   undefined keys), so a schema default does NOT reach a pre-existing document. Switch the cascade
//   before the backfill and 485 articles sort as if they had no key.
//   THE KEYS ARE SPACED, NOT CONTIGUOUS, and that is the one design decision the whole file turns on:
//   contiguous 1..485 (the shape pinOrder uses INSIDE its block) makes every insert-at-top a 485-row
//   write. SORT_KEY_GAP = 1000 buys ~10 successive halvings between any adjacent pair, so a move is one
//   row — max+GAP for a new article, the midpoint for one moved between neighbours — and only an
//   exhausted pair escalates to a rebalance of the AFFECTED SPAN, which grows outward from the collision
//   alternating down and up so a squeeze near the top does not rewrite the bottom.
//   A SIBLING MODULE, NOT MORE OF articlePositioning.js: the two encode OPPOSITE invariants over one
//   collection — pinOrder must be contiguous (a gap inflates the maximum and every later promotion
//   drifts upward, b-005) and sortKey must be spaced. `renumberWrites` and `assignSortKeysFromOrder` look
//   like the same function and are each wrong in the other's file, and the wrong reuse would fail
//   QUIETLY: contiguous sortKeys sort perfectly right up until the first insertion has nowhere to go.
//   EXHAUSTION IS DETECTED RATHER THAN ROUNDED — midpointSortKey returns null instead of a neighbour's
//   value, because two articles on one key means the tie falls through to the date order and the
//   position the admin just chose silently stops deciding anything. That is b-005's failure mode wearing
//   a new field, and its control pins that the collision is real (floor((3002+3001)/2) IS 3001).
//   THE COMPARATOR WAS EXTRACTED, NOT FORKED: the backfill needs publishedAt/createdAt/_id and NOT the
//   two pin tiers above them, and writing a second comparator is how a duplicated cascade starts
//   disagreeing (this repo already keeps one such copy in sync by hand). compareArticlesForPublicOrder
//   now ENDS IN the exported compareArticlesByDate, behaviour unchanged, with a test asserting the two
//   agree wherever the pin tiers tie AND disagree where they do not — so the extraction cannot quietly
//   become a fork or quietly flatten the tiers it sits under. It was ALREADY TOTAL: the `_id` tiebreak
//   was added earlier so a rank would not shuffle between renders, and the backfill needs exactly that
//   property for a stronger reason — publishedAt ties are the normal case (an import burst writes
//   hundreds of rows within minutes, drafts all share null), so without a final discriminator two runs
//   could pick different orders and a re-run would silently renumber the list.
//   PINNED ARTICLES ARE ORDERED BY DATE TOO, with the control pinning that the public cascade and the
//   date ordering genuinely DISAGREE on that fixture — otherwise the claim would pass against an
//   assignment using the wrong comparator.
//   RUNNING THE CONTROLS FOUND A WEAK ASSERTION, the same shape as the `>= 2` demotion control this
//   suite already learned from: R1-n claimed "the rebalance span is narrower than the whole list" but
//   MEASURED writes.length. Seeding the span at the whole collection reddened R1-m and left R1-n GREEN,
//   because the minimal-write filter dropped the one row whose key came out unchanged — 4 writes over a
//   5-row list satisfies `writes.length < list.length` while the rebalance is doing exactly the
//   485-row thing the gap exists to prevent. It now measures plan.span, which is what the claim is
//   about, and the span is REPORTED by the planner rather than inferred by the caller for the same
//   reason. Verified red five ways: SORT_KEY_GAP dropped to 1 (5 — R1-e stays green on purpose, it
//   asserts symbolically), midpointSortKey rounding to a neighbour instead of returning null (6, four
//   of them the rebalance tests, since a silent collision means no rebalance is planned at all), the
//   rebalance span seeded at the whole list (2, after the fix; 1 before it), assignSortKeysFromOrder
//   sorting with compareArticlesForPublicOrder (1 — R2-a's fixture holds no pinned rows, so the two
//   comparators agree on it and only the pinned claim can catch this; that is why R2-c pins the
//   disagreement), and the `_id` tiebreak deleted from compareArticlesByDate (2 — totality AND re-run
//   stability, which is the evidence that the stability test genuinely depends on the tiebreak rather
//   than on V8's sort happening to be stable).
// 938 (round 1, commit 2) — the schema field and the create path (+12: 2 in
//   test/pure/articleFormFieldCoverage, 3 in the new test/pure/articleSortKeySchema, 7 in the new
//   test/fs/articleSortKeyWrites). STILL NOTHING READS IT.
//   TWO ABSENCES ARE THE LOAD-BEARING PART. (1) NO SCHEMA DEFAULT: a default would reach NEW documents
//   only — `.lean()` does not apply defaults and serialize() drops undefined keys — so it would look
//   like coverage and be none, on exactly the 485 rows that need it. Leaving old rows undeclared is what
//   makes "has this been backfilled?" answerable. (2) NO INDEX: it belongs with the cascade switch in
//   round 2; adding it now indexes a field no query sorts by.
//   sortKey NEVER ENTERS THE FORM, same rule as pinOrder: it is an invariant of the whole collection,
//   not a field of one document. Both layers are asserted because either alone is a false green — zod
//   runs in STRIP mode, so a field in the parser but not the schema is dropped SILENTLY between parse
//   and $set (green save, no change, old value back on refresh), while a field in the schema but not the
//   parser takes its zod default on every save, which for sortKey means overwriting a planned key with
//   nothing. The control pins that the three negative assertions are not vacuous by showing showPinBadge
//   present in all three places.
//   createArticle ASSIGNS IN THIS ROUND, not with the cascade: any article created between the two
//   deploys would otherwise carry no key when the cascade starts reading one. It goes to the TOP
//   (max + GAP) regardless of publishedAt — backdating a publish date must not bury an article whose
//   author then cannot find it, and dragging it down is one action away. Article.create DOES apply
//   defaults, but a default cannot compute max+GAP. The assignment sits AFTER the payload spread and the
//   fs guard pins that ordering, so no form key can shadow it. AUDITED: Article.create appears exactly
//   once in the repo and there is no seed, import or API route that inserts an Article.
//   THE WRITE GUARD IS INSTALLED WHILE IT IS CHEAP — one write path, no UI. A rule written after the
//   second caller exists is a rule negotiated with the code that already broke it. Its matchers are the
//   same three families as the pinOrder guard (whose header records why an "is this an assignment?"
//   regex was wrong in both directions), re-stated rather than shared because round 2 gives sortKey a
//   SORT-CASCADE appearance — precisely the shape that over-fired for pinOrder — and the two guards will
//   diverge there. Verified red six ways: sortKey declared in articleSchema (2, one of them the
//   pre-existing generic parser/schema guard), a schema default added (1), a compound index added (1),
//   the create path using a literal instead of the planner (2), a $set in an unrelated action file (1),
//   and updateArticle spreading sortKey into its $set (1).
// 938 (round 1, commit 3) — scripts/backfill-article-sortkey.mjs. NO TEST COUNT CHANGE, and that is
//   correct rather than an omission: the assignment it runs is `assignSortKeysFromOrder`, already
//   covered in test/pure/articleSortKey, so the script contains no ordering logic of its own to test.
//   What it adds is VERIFICATION, and the one piece of real logic it does own — the SIMULATED round-2
//   cascade — ships with an in-script control, because section B's entire claim is "the two cascades
//   agree" and the cheapest false green is a simulation that never reads sortKey and therefore agrees
//   with the live cascade for free. Two synthetic rows whose date order and sortKey order deliberately
//   disagree separate the two functions before the real comparison is trusted; neutering the sortKey
//   tier makes the script refuse to run rather than print a clean report.
//   THE DRY RUN OVER PRODUCTION CORRECTED TWO PREMISES. (1) 486 articles, not 485, all active, none with
//   a null publishedAt. (2) The tie picture is the opposite of a single number: 280 of 486 rows share a
//   publishedAt (largest group 65 rows at exactly 2026-06-12T00:00:00Z, plus a 16:31-16:47 import
//   burst; 71 rows sit at exact midnight), but `createdAt` is DISTINCT on all 486, so the FULL-tie count
//   is 0 and the `_id` tiebreak is not exercised by today's data. The first draft reported only the full
//   count, which came back 0 and read as "there are no ties here" — the reverse of the truth. It now
//   reports both levels, so which tier is doing the separating is visible, and so is the day createdAt
//   stops doing it. The tiebreak stays regardless: nothing enforces createdAt distinctness.
//   B-006 IS STILL LIVE IN PRODUCTION — one unpinned row carrying pinOrder 2, sitting at 486 of 486
//   despite a 2026-06-08 publishedAt. normalize:positions was evidently never applied. It is NOT this
//   script's business (it writes no pinOrder) and does not affect the invisibility claim, since that row
//   is last both before and after; but section C would have shown it at the bottom holding a high
//   sortKey and read as a defect in the assignment, so the script names it and points at the repair.
// 940 (round 2, commit 1) — the ordering index (+3 in test/pure/articleSortKeySchema, -1: round 1's
//   R4-b is DELETED HERE rather than in the cascade commit, because adding the index is what makes
//   "no index declares sortKey" false and a commit cannot be green while asserting the opposite of what
//   it does). DIRECTION IS THE WHOLE POINT AND THE ROUND-1 REPORT GOT IT WRONG: that report proposed
//   {isPinnedOnArticlePage:1, pinOrder:1, sortKey:-1}, which reverses to {-1,-1,1} and matches neither
//   the cascade {-1,1,-1} nor its reverse. An index serves a sort in its own direction or its exact
//   reverse and in no other, so the planner ignores it entirely. MEASURED against a copy of the real 486
//   documents in a scratch database (production read-only throughout, scratch dropped after): the
//   round-1 proposal plans PROJECTION_SIMPLE <- SORT <- COLLSCAN, identical to having no index at all,
//   while {-1,1,-1} and its exact reverse {1,-1,1} both plan LIMIT <- PROJECTION_SIMPLE <- FETCH <-
//   IXSCAN with no SORT stage. The same defect was confirmed live on the PRE-EXISTING
//   {isPinnedOnArticlePage:1, pinOrder:1}: sorting {-1,1} against it plans a blocking SORT while {1,1}
//   and {-1,-1} plan an IXSCAN — so it never served the old cascade either, exactly as the plan doc
//   recorded. It is KEPT, not replaced: the equality-filtered block read
//   find({isPinnedOnArticlePage:true}).sort({pinOrder:1}) plans IXSCAN with 5 keys and 5 docs examined,
//   which is the shape every pinned-block planner wants, and dropping an index is a separate decision.
//   The rule is encoded as a PREDICATE (servesSort) rather than a string compare, so the thing under
//   test is the rule itself; its control feeds it the round-1 proposal, a key-order permutation and a
//   prefix of the cascade, and requires all three to be rejected. Verified red two ways: the index
//   direction flipped back to the round-1 proposal (1), and the pre-existing index dropped (1).
// 951 (round 2, commit 2) — the cascade (+11: 6 in test/pure/articleRank, 5 in the new
//   test/fs/articleCascade). getArticles and compareArticlesForPublicOrder move TOGETHER, because that
//   file's own doc block has always said nothing makes them agree. Now something does for half of it:
//   the SPEC is one exported object (ARTICLE_SORT) and the reader imports it, so the two literals are
//   one. The COMPARATOR still has to be hand-written — a rank must be computable without a database —
//   and the fs guard closes what is left by banning any `.sort({…})` in the reader naming two or more
//   cascade keys, with a control proving the detector fires on a partial literal and NOT on
//   getFeaturedArticlesForLanding's unrelated date sort.
//   THE COMPARATOR NOW HAS MORE TIERS THAN MONGO, deliberately: Mongo stops at sortKey and leaves ties
//   unspecified, so the JS side continues into publishedAt/createdAt/_id for a stable rank. A
//   REFINEMENT, never a contradiction — every pair Mongo orders, this orders the same way.
//   `sortKeyOf` and `compareBySortKeyDesc` MOVED from articleSortKey.js to articleRank.js and are
//   re-exported: the cascade needs them and articleSortKey already imports articleRank, so leaving them
//   would have been a cycle and copying them would have been two readers that must agree.
//   THE PROJECTION GUARD FIRED ON ITS OWN AND WAS RIGHT: adding sortKey to the comparator made
//   ADMIN_LIST_FIELDS incomplete in the same commit, because assignArticleRanks runs IN THE BROWSER over
//   the projected rows — without the field every rank would have been computed against `undefined`, all
//   486 rows tying on "no key" and falling through to the date tiers, and the admin column would have
//   disagreed with /articles for every reordered row, silently. The projection widened here rather than
//   in the UI commit for that reason. Verified red three ways: the sortKey tier removed from the
//   comparator (3), a cascade literal put back in the reader (2), and the _id tiebreak deleted (2,
//   carried over from round 1 and still live).
// 973 (round 2, commit 3) — the cross-tier step planner and the reshaped actions (+21 in the new
//   test/pure/articleOrdering, +1 in test/fs/articlePinOrderWrites for the pin toggle's two planners;
//   the new actions are ADDED here and the old ones removed in commit 4 — see the reorder note). THE LIST IS TWO TIERS, SO WHICH FIELD MOVES A ROW DEPENDS ON WHICH TWO ROWS:
//   sortKey between two unpinned rows, pinOrder between two pinned ones, and a step ACROSS the pin
//   boundary is REFUSED with a coded reason rather than half-done. An arrow that always wrote sortKey
//   would be a lie on the five pinned rows — the cascade never reaches their key, so the number would
//   change and the row would not move, which is b-004's failure shape with the arrow pointing the other
//   way. describeOrderControls derives each button's disabled state BY RUNNING THE PLANNER the action
//   will run, so the button and the refusal cannot describe different situations.
//   b-006 GETS ITS OWN REFUSAL: two unpinned rows disagreeing on pinOrder cannot be reordered by any
//   sortKey, because pinOrder is the second cascade key and applies to every document — so the planner
//   refuses and names normalize:positions instead of writing a key that moves nothing.
//   Verified red three ways: the pin-boundary check deleted (3), the sortKey step planned against the
//   full list instead of the unpinned subset (3, including the filtered-view control), and
//   describeOrderControls computed from a parallel index condition instead of the planner (2).
//   A PERFORMANCE PROBLEM FOUND BY MEASURING RATHER THAN BY A TEST: the first cut answered "is this
//   arrow live?" by BUILDING the plan, so the admin list built 1,458 plans — three controls over 486
//   rows — inside a useMemo that reruns after every click. 244 ms, on a fast machine. The refusal logic
//   is now split into resolveStep (one cheap pass, no plan) with planOrderStep composed on top, and
//   describeAllOrderControls sorts ONCE for the whole list: 17 ms. The property that mattered survives —
//   both paths still go through one refusal function — and the two entry points are pinned as identical
//   row for row, with a control asserting the fixture's descriptors are not all the same shape.
//   Verified red one more way: the bulk form made to disagree with the single-row one (2).
// 985 (round 2, commit 4) — the UI, the copy and the projection walk (+12 net: +5 in
//   test/fs/adminRankVocabulary, +9 in test/render/adminPositionControls, +1 in
//   test/render/adminRankVocabulary, +2 in test/pure/articleListFields, less the assertions retired
//   with the controls they described).
//   จัดตำแหน่ง / ปลดตำแหน่ง are gone and so is the 1..M select: M was the pinned block, about five, and
//   the normal ordering is 486 rows, so the same control becomes a 486-entry dropdown. RankCell is a
//   plain number — กำหนดเอง / ตามวันที่ answered a question that now has one answer for every row, and
//   would be actively wrong for the common case since a row nobody has touched still has a chosen
//   position: the backfill chose it. The pinTie tripwire MOVED rather than being deleted (ruling 2 keeps
//   pinOrder, so b-006 stays reachable) and now sits beside the arrows whose behaviour it explains.
//   TWO CONTROLS FIRED NOTHING AND BOTH EXPOSED REAL GAPS. (1) Deriving the control states from
//   `pageRows` instead of `rows` — the exact defect ruling 3 is about — reddened NOT ONE assertion,
//   because every render fixture had six rows or fewer and fit inside PAGE_SIZE 12, where the two are
//   identical. A 14-row fixture now pins that the last row of page 1 keeps a live ↓, with its own
//   control asserting the fixture really paginates. (2) The fs assertion for the arrow labels was scoped
//   to the JSX zone, but the two arrows are rendered by one parameterised helper declared above the
//   return — so it was looking for a string that could not be in the slice, and would have gone green
//   again the day someone inlined it.
//   THE PROJECTION GUARD IS NOW A WALK, not three hand-written paths: it follows @/lib imports from the
//   admin client, so a helper that reads a field on the client's behalf joins the read-set the moment it
//   is imported. That is the PUBLIC_LIST_FIELDS lesson one level up, and its control pins the property
//   directly — `sortKey` appears nowhere in the client as a property read and is required anyway.
//   Verified red four ways beyond the two above: RankCell given its basis label back (3), toTopTitle
//   hardcoding "position 1" (2), the pin/unpin planners swapped (1 — unpin via planPromotion would leave
//   the released row in the block, recreating b-006), and the import walk stopped at the entry file (3).
// 1002 (sweep round 4, commit 2) — `articles` instrumented (+17 in the new test/fs/auditArticles;
//   commit 1 was SKIPPED, see below). Nine mutating exports, enumerated with the coverage guard's own
//   classifier rather than from the earlier rulings, which named repositionArticle and
//   moveArticleToPosition — both deleted by the ordering rework. The count did not move: 157 stands,
//   because that rework was net +1 and this round adds no exports.
//   THE ROUND EXISTS FOR ONE PROPERTY: this is the only menu where ONE HUMAN ACTION WRITES MANY ROWS. A
//   step between two articles whose keys are one apart rebalances a span; pinning renumbers the block
//   behind it. All of that is ONE row, with the collateral as a COUNT in `meta.alsoTouched` and the plan
//   `kind` alongside it so a rebalance stays identifiable afterwards. Enumerating the ids would be the
//   same list wearing a different hat — and the writer's 2 KB cap would truncate eighty of them into a
//   marker that says nothing, which is the setPromotionPageLink ruling arriving at the same answer from
//   the other side.
//   `entity` is 'article' for all nine and the verb lives in `action`. No ordering entity was invented:
//   the record that changed IS an article, and a second entity would split "everything that happened to
//   this article" across two series that no screen joins — the inline widget queries exactly one pair.
//   RULING 2 HELD BY CONSTRUCTION: every ordering row takes `after` from `plannedFields(plan, id)`, and
//   a guard asserts no audit call in the file invokes a planner. `before` comes off the block context the
//   action already read to plan with, so it is the same snapshot the planner reasoned about and costs no
//   query.
//   MEASURED BEFORE CHOOSING THE PAYLOAD, not after: a whole article document is a median of 4.4 KB and
//   a max of 51 KB against a 2 KB per-field ceiling, so `content` is excluded and its LENGTH recorded.
//   The named field set measures median 947 / p95 1,304 / max 2,165 — ONE article in 486 truncates, which
//   is the marker doing its job. Dropping `excerpt` was tried and moved the median by four characters,
//   because the size is carried by the tag/program/skill arrays, so it stayed.
//   TWO READS FLIPPED TO `new: false` (updateArticle, toggleArticleActive) for the pre-image, the round-2
//   pattern — no extra query, and safe because nothing consumed the returned document except a slug that
//   was already known. That flip also fixed a pre-existing cache gap it exposed: a slug rename left the
//   OLD public path cached, and the pre-image is what made it available to bust.
//   `title` JOINED POSITION_FIELDS — the one field there no planner reads. It is the audit label, and the
//   alternative was a second query per click purely to fetch one string from a read that already returns
//   every article. deleteArticle needs NO read at all (ruling 3 confirmed): unlike deleteCourse, whose
//   record lives upstream in MSDB, findByIdAndDelete hands back what it removed.
//   Verified red eight ways: a second audit row per collateral write (1), an invented `article_order`
//   entity (2 — including the contract-pair guard), an undeclared action verb (1), the collateral ids
//   enumerated in meta (1), `after` recomputed by re-invoking planPromotion (2), a pre-read added to
//   deleteArticle (1), the HTML body put into the snapshot (1), and articles.js dropped from SWEPT_FILES (1).
// 1005 (sweep round 4, commit 3) — the RecordHistory mount, and the list hint DELIBERATELY NOT SHIPPED
//   (+3 in test/fs/auditArticles).
//   THE HINT WAS MEASURED AND REJECTED. The first explain() over the real collection returned
//   keysExamined=1, docsExamined=0 — and proved nothing, because `menu: 'articles'` has zero rows today,
//   so it explained an EMPTY index range. Reporting that as "cheap" would have been measuring the absence
//   of the thing being measured. Re-measured against a scratch copy carrying the real 486 ids and the
//   four production indexes: the plan is fine (IXSCAN on {recordId:1, createdAt:-1}, no blocking sort)
//   and the cost is not — 487/2,431/9,721 keys examined at 1/5/20 rows per article, because
//   `newestPerRecord` keeps one row per record and discards the rest IN JS after Mongo has fetched them
//   all. The query's cost therefore grows with the AGE OF THE TRAIL, not the size of the page, forever,
//   on every render. /admin/registrations pages at twenty rows and reads 100. The payload was the smaller
//   objection and would have been survivable alone: +71.7 KB on 381.2 KB, +18.8%.
//   The widget on the EDIT screen is the valuable half and is mounted there, with literal menu/entity
//   props. Its absence-from-the-list assertion ships with a control pointing the same matchers at the
//   registrations list, which DOES wire the hint — so the absence is a decision about articles rather
//   than a matcher that never fires. Verified red two ways: the mount's menu literal changed (1), and
//   readLastEditedMap imported into the articles list page (1).
// 1014 (pre-round-5, commit 1) — the coverage classifier now follows IMPORTED helpers (+9 in
//   test/fs/auditCoverage). MUTATING_EXPORT_COUNT 157 -> 161. An export writing only through an imported
//   helper was invisible: classified inert, skipped by the coverage assertion, and therefore sweepable
//   green with no audit call in it. Same class as the MSDB gap — and that one was caught by LUCK, someone
//   happening to know createCourse calls msdbCreate. Round 5 is ~129 sites across 30-odd files.
//   IT RESOLVES THE SYMBOL, NOT THE MODULE, and that is the design rather than a detail. Module-scoped
//   would be WORSE than the gap: every export importing anything from a module that happens to contain a
//   writer would classify as mutating, the guard would demand audit calls inside readers, and the first
//   person to meet that turns it off. pageBuilder.js is the live proof — verifyPreviewPassword writes,
//   getPageBuilderPageBySlugAny does not, previewAccess.js imports BOTH.
//   THE FOURTH EXPORT IS THE ARGUMENT FOR HAVING A MECHANISM. §2 already counted the three sync*Action
//   exports, but only because §6 HARDCODES their helper names — so it caught the three someone knew about
//   and missed previewAccess.js::submitPreviewPassword, which writes preview.failedAttempts /
//   preview.lockedUntil through pageBuilder.js#verifyPreviewPassword and appears in neither §2 nor §6.
//   It is a PUBLIC action with no requireAdmin at all, so it needs a NOT_LOGGED entry when that file is
//   swept; recorded in the doc rather than met cold in round 5.
//   DEPTH IS ONE, MEASURED: depth 1 finds four, depth 2 and 3 find exactly the same four, and a test pins
//   that deeper is not different so the day it becomes different the guard says so. Its control asserts
//   depth 0 reproduces 157 exactly, which is what proves the parameter is live.
//   TWO CONTROLS FIRED NOTHING AND BOTH EXPOSED REAL HOLES. (1) Making the walk module-scoped left the
//   COUNT unchanged — the modules it reaches happen to contain only writers — so only the dedicated
//   reader-direction control catches it. That is exactly the control the brief insisted on, and the
//   count would have shipped the over-fire silently. (2) Breaking the alias resolution (looking up the
//   LOCAL name instead of the exported one) reddened nothing, because no action module aliases an import
//   today and the logic was only reachable through real source. parseNamedSpecifiers is now split out and
//   handed the shape that does not exist yet, with an assertion that says to delete the synthetic test
//   the day a real alias appears.
//   Verified red four ways: the walk made module-scoped (2 — and NOT the count), the alias resolved to
//   the local name (1, after the extraction; 0 before it), IMPORT_WALK_DEPTH set to 0 (4), and the
//   pre-existing count left at 157 (1).
// 1014 (pre-round-5, commit 2) — docs only, no test change. §6 loses the imported-helper line from its
//   blind-spot list and gains what the walk does, what it still cannot see at ANY depth, and why the
//   WRITE_CALL name list is complementary rather than superseded (msdbCreate writes over HTTP; its body
//   is a fetch, and no walk derives "write" from that). §2 gains the reconciliation table: guard 161,
//   §2's inventory 160 once the article rework's net +1 is applied, remaining gap ONE and named. Also
//   recorded: §6's list of 16 is stale in the other direction — it names repositionArticle and
//   moveArticleToPosition, both deleted — and one live blind spot the walk cannot reach at any depth,
//   auth.js::adminLogin, whose write happens inside NextAuth's authorize callback via a binding
//   destructured from NextAuth(), not a function declaration.
// 1019 (list trim, commit 1) — the admin article list drops its cover-image column (+5 in the new
//   test/render/adminListColumns). A 40px decorative circle per row, twelve to a page, in a table at
//   min-w-[900px] whose job is to find and order articles: it identified nothing the title did not.
//   THE FIXTURE IS THE TEST. Every other admin fixture in this suite carries `coverUrl: ''`, which under
//   the OLD code rendered the initial-letter FALLBACK and no <img> at all — so "a row contains no <img>"
//   asserted against one of those would have been green before and after the removal, i.e. vacuous. This
//   file's row carries a real Cloudinary URL for that reason, and the control points the same matcher at
//   the markup the deleted column produced so the negative cannot pass against a pattern matching
//   nothing. The header count is EXACT (10, was 11) rather than a floor, and colSpan is asserted EQUAL to
//   the live header width instead of to the literal 10 — two numbers with nothing in React forcing them
//   to agree, and the empty-state cell is the only place the old 11 was written down twice. A MATCHER BUG
//   THE COUNT CAUGHT IMMEDIATELY: slicing from `<thead>` and splitting on `<th` reports one phantom
//   column, because the opening tag itself starts with `<th` — L1-a went red at 11 against a header that
//   really has 10, which is the count assertion doing exactly what a floor would not have.
//   `coverUrl` also left ADMIN_LIST_FIELDS, and NO TEST FORCED THAT: the coverage guard checks only
//   READ ⊆ PROJECTED, so a projected-but-unread field is a superset it passes by construction. That is
//   now written into the docstring where the next person deleting a column will read it. Two headers were
//   renamed with the copy that names them: `ลำดับบน /articles` → `ลำดับ` (the path was doing no work in a
//   24px column and survives in the tooltip) and `Landing` → `Home`, with the star button's aria-label and
//   title moved to แสดงบนหน้าแรก (Home) in the same edit — the list is the only surface that named that
//   column, verified by grep across src/app/admin. Verified red two ways, both new assertions at once:
//   re-adding the <img> column reddens L1-a (11 cells) and L1-b (an <img> in the row), and L1-c as well
//   while colSpan still said 10.
// 1023 (list trim, commit 2) — the ป้าย badge switch leaves the admin list (net +4: fs
//   adminRankVocabulary net +4, render adminRankVocabulary net 0, both re-pointed rather than deleted).
//   The badge had TWO controls for one per-document decoration, and the other one is on the article edit
//   screen beside the pin toggle the badge DEPENDS on — shouldShowPinBadge gates the glyph on the pinned
//   state, so the two halves of one decision were a screen apart while the redundant half sat twelve to a
//   page next to arrows built to be clicked repeatedly. THE SERVER ACTION IS NOT DELETED:
//   setArticlePinBadge is audit-instrumented and un-exporting it would move MUTATING_EXPORT_COUNT and the
//   audit surface in a commit about a switch. It is now a callerless exported action, reported rather
//   than removed.
//   THE b-004 GUARDS WERE RE-POINTED, NOT DELETED, and the re-pointing is the interesting part: the rule
//   ("the pin glyph and the word หมุด belong to the badge and NOWHERE else") is a PAIR, and half of the
//   pair was the switch that just left. The badge half now splits across two files because the noun and
//   the glyph always lived in different places — the WORD is on the control (ArticleForm.jsx's
//   ปักหมุด / ป้าย section), the GLYPH is on the badge itself (the public card in ArticlesPageClient.jsx).
//   That let the list-side assertion get STRONGER: it is no longer "RankCell has no <Pin>" but "the admin
//   list draws no pin glyph in any cell, and the lucide import went with it", which is only a legitimate
//   thing to assert because the other two say where the glyph went. The rank-vs-badge pairing inside the
//   rendered list survives as rank-cell-vs-อยู่กลุ่มปักหมุด-pill, which is the sharper version: that pill
//   is ORDERING vocabulary containing the badge's noun, it is the one phrase a careless "remove หมุด from
//   the admin" would take with it, and it is the only thing on screen explaining a dead arrow.
//   BOTH RENDER EXTRACTORS WERE KEYED ON `role="switch"` — the badge toggle — so after the removal they
//   would have matched ZERO cells, and a zero-length slice satisfies every "does not contain" assertion
//   for free. They are re-keyed on the ขึ้นบนสุด button, chosen because it renders on EVERY row in every
//   state (disabled at the top of a group, never hidden); an anchor on anything conditional returns
//   nothing for the rows where the condition is false. Both still assert EXACTLY one match and throw
//   naming the anchor otherwise. The badge half is an fs guard rather than a render one because
//   ArticleForm mounts TipTap at module scope and does not render under this loader — a source guard that
//   can run beats a render guard that cannot.
//   The `showPinBadge` control also got stronger: it used to assert the RANK cell was unmoved by a badge
//   toggle while the switch beside it flipped; it now asserts the WHOLE DOCUMENT is byte-identical,
//   paired with a control that a change this list DOES report moves the markup, so the equality cannot
//   pass for a component rendering a constant. TWO ANCHOR BUGS caught by running the file rather than
//   reading it: the new zone marker is a plain `/* */` inside `return (`, not a JSX `{/* */}`, so an
//   anchor written with the brace found nothing; and `>จัดลำดับ<` does not occur in the source at all
//   because the header text is on its own JSX line — matched with `>\s*…\s*<` instead, the mirror image
//   of the substring traps this suite already documents. Verified red two ways, and they redden DISJOINT
//   sets, which is the independence the pairing depends on: putting ปักหมุด back in RankCell reddens 7
//   rank-side tests across both tiers (including the render extractor's own `>(\d+|—)<` verification,
//   which throws rather than asserting against the wrong cell) with every badge-side assertion still
//   green, and renaming ArticleForm's badge label off หมุด reddens exactly 1 — the badge-naming
//   assertion — with every rank-side one green. That 1 is worth reading as a measurement rather than a
//   disappointment: the cross-file slicer control did NOT redden, because the new "ที่นี่ที่เดียว" line in
//   the same section still contains หมุด, so the section-level presence check survives a change to the
//   label it is really about. The label assertion is therefore the load-bearing one and the section-level
//   one is a backstop, which is the opposite of how they read.
// 1040 (typed rank, commit 1) — planMoveToRank / describeRankTarget / RANK_REFUSALS in
//   src/lib/articleOrdering.js (+17 in test/pure/articleOrdering). PURE ONLY: no UI, no action, no
//   stored-field semantics touched.
//   THE ONE IDEA IN THIS COMMIT IS THAT A RANK IS NOT AN INDEX. The number the admin types is what the
//   list's first column shows, i.e. the output of assignArticleRanks, which numbers ACTIVE articles only
//   — an inactive row sits in the ordering and holds no rank. So the typed number is resolved to the
//   ANCHOR ROW currently holding it, and the move is planned to THAT ROW'S index inside its own tier.
//   Never `index = rank - 1`. THE ARITHMETIC VERSION IS NOT ALWAYS WRONG, WHICH IS WHY IT NEEDS A TEST
//   RATHER THAN A COMMENT: moving UP past an inactive row lands on the right rank either way (an
//   invisible row is invisible from both sides), so the first fixture I wrote proved nothing. Only a
//   DOWNWARD move separates them — u1 → rank 3 over one inactive row gives rank 3 via the anchor and rank
//   2 via the arithmetic — and R-a2 pins that gap by calling planSortKeyMove with the naive position and
//   asserting it lands at 2, so if the fixture ever loses its inactive row the control reddens instead of
//   the claim quietly becoming vacuous.
//   OUT OF RANGE REFUSES RATHER THAN CLAMPING, and that is a deliberate divergence from the two
//   sub-planners it calls, both of which clamp and are right to: they serve a CLICK, where the UI bounded
//   the control, so out-of-range means caller-and-collection disagreement and the nearest real position
//   beats an exception. A typed number is a CLAIM. Honouring "put this at 900" by putting it at 486 is
//   the "the number changed and nothing moved" defect wearing a smile, so R-h asserts not merely the
//   refusal but that the article's rank is UNCHANGED afterwards.
//   FOUR REFUSALS, TWO OF THEM REUSING STEP_REFUSALS CODES on purpose (pin-boundary, stray-pin-order):
//   the same two facts about the collection reached by a different gesture, and spelling them differently
//   is how the arrow and the input start explaining one situation in two ways. NOT_RANKED is checked
//   BEFORE the target is parsed — "move an unranked row to rank 4" is not a bad number, it is a row that
//   is not in the numbering, and reporting it as a bad number sends the admin to the wrong end of the
//   problem. pinnedRanks counts ACTIVE pinned rows, not block members: an inactive pinned article holds
//   no rank, so the block owns ranks 1..P where P is the visible count, and getting it wrong makes the
//   boundary copy name a range that does not exist (R-d2, with its own control).
//   NO-OP AND REFUSAL ARE DIFFERENT RETURN SHAPES and callers must key on `reason`, not on `kind`: an
//   empty plan WITH a reason is a rejection to show the admin, an empty plan WITHOUT one is agreement
//   with a number that was already right. Reporting the second as a failure would tell the admin their
//   correct input was rejected.
//   R-k is the guard that matters most for the next commit: it sweeps six rows × nine targets through
//   BOTH describeRankTarget and planMoveToRank and asserts they agree on every one, and that every
//   accepted plan lands the article on the rank the descriptor promised — because the client warning and
//   the server refusal are about to read the same function, and the defect this module exists to close is
//   a control that offers what the action rejects. It asserts >5 refusals AND >5 real moves, or
//   "agreement" would be satisfied by a sweep that only ever hit one branch.
//   Verified red five ways: resolving the rank arithmetically (5 tests), clamping instead of refusing
//   (3), the coercive `Number(target)` guard that reads an emptied input as position 0 and promotes the
//   article to the top (1 — the four-trap sweep), dropping the pin-boundary refusal (3), and counting
//   pinnedRanks over the whole block instead of its active part (1).
// 1047 (typed rank, commit 2) — the input, the amber warning and moveArticleToRank (+7: 5 in
//   test/fs/adminRankVocabulary, 3 in test/render/adminPositionControls, and ONE assertion REPLACED in
//   each of those two files rather than deleted).
//   THE TWO REPLACED ASSERTIONS ARE THE POINT OF THIS ENTRY. Both said "no free number field". The
//   invariant they were really protecting is "no free integer reaches pinOrder or sortKey", and
//   test/fs/articlePinOrderWrites enforces THAT structurally — the only value reaching $set is
//   `Number(w.pinOrder)` off a plan, and the client cannot send a plan at all. Banning the WIDGET was a
//   proxy, and a proxy that outlives the thing it proxies for stops guarding the invariant and starts
//   blocking the fix. What replaced them is what has to be true of the widget itself: min AND max derived
//   from the live list (fs pins `max={maxRank}` and rejects any numeric literal; render pins that the
//   ceiling MOVES — 6, 3 and 14 across three fixtures, the last one also proving the bound is the
//   COLLECTION and not the twelve rows painted on page 1), the client imports no plan BUILDER (eight
//   names, not four), and the typed value travels through moveArticleToRank. The select stays banned:
//   486 options is still not a control.
//   THE WARNING IS NOT A SECOND CONDITION. It is `describeRankTarget`'s own sentence, and the same value
//   blocks the submit (`if (warning) return;`); on the server the refusal returns `plan.message`, which
//   the planner copied off the descriptor — so there is ONE evaluation, and the input cannot offer a
//   number the action rejects nor refuse one it would accept. That is why planMoveToRank now attaches
//   `message` to a refusal instead of the action asking a second time.
//   AUDIT IN THE SAME COMMIT, because articles.js is swept and the coverage guard would otherwise report
//   a mutating export with no row: verb `move-to-rank` added to ARTICLE_ACTIONS, one row per human
//   action, `meta: {...orderingMeta(plan, id), targetRank}` — the writes are arithmetic, the NUMBER is
//   the only part a person chose. MUTATING_EXPORT_COUNT 161 → 162 AND the depth-0 figure in W2-b 157 →
//   158: the new export mutates through the file-local `applyPlan`, so the file-local classifier sees it
//   too, and W2-b asserts total = depth0 + the four import-walk exports. Bumping only the total would
//   have left that sum red and taught the next reader it was decorative.
//   TWO DOC BLOCKS WERE REWRITTEN RATHER THAN LEFT TO CONTRADICT THE CODE: OrderCell's "WHY THERE IS NO
//   NUMBER INPUT AND NO POSITION DROPDOWN", and articles.js's "fixed-slot targeting … is not coming
//   back". It came back. Both now state which of the three original objections each answer addresses —
//   the old field WROTE what it was given (this resolves it against a fresh read), the replacement was a
//   1..M SELECT (an input does not grow), and a slot IS NOT A RANK — and both name the two behaviours
//   that make it safe rather than convenient: cross-tier targets refused, out-of-range refused rather
//   than clamped. Also written down rather than fixed: with a search filter or on page 2 the row can
//   appear to jump or vanish, because the number means a position in the WHOLE collection. Already true
//   and already accepted for the arrows; the alternative is a number that changes meaning as you type in
//   the search box. One test pins that the caveat is present at the control.
//   Verified red five ways: hardcoding the ceiling to 486 (4 tests across both tiers), making the client
//   compute the plan and apply it locally (1), dropping the amber warning while keeping the input (1),
//   removing the audit call from the new action (1 — the swept-file coverage guard), and removing
//   `move-to-rank` from ARTICLE_ACTIONS (1). A sixth, deleting the stub export, takes all four render
//   files down at import time — which is the stub ⊆ real fixture doing its job from the other side.
// 1057 (public card) — /articles cards drop the type badge and show SKILLS instead of tags (+10 in the
//   new test/render/publicArticleCard). Display only: the `tags` FIELD, the `?tag=` filter, the toolbar's
//   tag chip and the search box are untouched, so every existing #tag link still works — and two
//   assertions pin that, because "replace tags with skills" is an instruction someone carries out by
//   deleting the filter as well.
//   THE FAILURE MODE OF THIS FEATURE IS SILENCE, which is what shapes the file. An article stores
//   `skill_id` STRINGS and the names come from a separate service; that service can be down (page.jsx
//   catches to `{items: []}`, same shape as listPrograms) and a retired skill's id survives in old
//   articles forever. An unresolved id is DROPPED rather than printed, because `SK-999` on a public card
//   reads as a bug to a human and as data to a crawler. So "renders nothing" is the correct behaviour in
//   three distinct situations — no skills, all unresolvable, empty map — and each is asserted with the
//   chip matcher then pointed at a card that DOES have chips, or all three would pass against a class
//   string that never appears anywhere.
//   THE SCOPING PROBLEM IS THE SAME ONE adminRankVocabulary DOCUMENTS, arriving on a different page:
//   `assert(!/บทความวิดีโอ/)` on the whole document FAILS on a correct page, because the toolbar's type
//   filter legitimately offers that option, while `assert(/บทความวิดีโอ/)` PASSES with the badge still
//   stamped on every card. Both are true at once, so the card is sliced on <article> first and the
//   extractor throws rather than returning ''. S5-e2 pins the filter still offering both options, which
//   is simultaneously the control for the slice and the guard against "fixing" S5-e by deleting the type
//   concept from the page.
//   THE KEY IS `skill_id`, NOT `_id`, and that was verified rather than assumed — the form's picker is
//   built from `s.skill_id` (ArticleForm.jsx:805), the parser and articleSchema both declare `skills` as
//   a string array, and src/models/Article.js comments the field as "skill_id values". Keyed on `_id` the
//   map would resolve NOTHING and every chip would disappear with no error, which is the exact silence
//   the drop-unresolved rule creates — so one source assertion pins the key and one control pins that the
//   model really stores strings. PUBLIC_LIST_FIELDS is still NOT wired in (it lacks
//   isPinnedOnArticlePage and showPinBadge, so it would delete every pin badge on the page); this file
//   asserts its absence from a second angle, and test/pure/articleListFields already holds the same gap.
//   The pin badge survives, top-right, matched by lucide's "12 17v5" stem — the one overlay carrying
//   information the card cannot otherwise convey, and in the corner the type badge never occupied.
//   Verified red three ways: restoring the type badge (1), printing raw ids instead of dropping them
//   (2 — the drop assertion AND the no-chip-row assertion, which is the pair working), and keying the map
//   on `_id` (1 — the source guard, and note that NO render test reddens, because the render tier is
//   handed `skillNames` as a prop; that seam is precisely why the source assertion exists).
// 1096 (skill filter) — /articles trades its ประเภท dropdown for a SKILL filter, `?skill=<skill_id>`
//   (+12: 11 in the new test/render/publicArticleFilters, +1 in publicArticleCard where S5-e2 was
//   RE-POINTED to the opposite claim and S5-e3 added). TWO COMMITS: the `{ skills: 1 }` index lands FIRST, the reader second —
//   the ARTICLE_ORDER_INDEX sequencing rule, so the first request after a deploy does not pay for an
//   index that is not there yet.
//   THE INDEX WAS MEASURED ON A SCRATCH COPY of the real 487 documents with the real production indexes,
//   never against production, and the numbers are in the comment beside it rather than summarised as
//   "faster". THE HEADLINE IS THAT ON THE FATTEST BUCKET IT CHANGES NOTHING: for BUSINESS (45 articles)
//   the planner keeps choosing ARTICLE_ORDER_INDEX, 18 keys / 18 docs, with `skills_1` merely appearing
//   as a rejected plan. The choice INVERTS as the bucket shrinks, because the two plans scale on
//   different axes — the ordering-index plan walks the collection in sort order and fetches until it has
//   12 matches (487/487 examined to return 2 for RPA, i.e. the whole collection), while `skills_1`
//   fetches only the matches and then does a BLOCKING SORT (2/2). The blocking sort is the trade and it
//   is acceptable at these sizes and not unconditionally — at most one skill's worth of documents, 45
//   today, nowhere near the 32 MB limit; the note says what to do if that changes and why the compound
//   index is not built now. THE UNAMBIGUOUS WIN IS THE COUNT: without the index, countDocuments COLLSCANs
//   all 487 documents on EVERY skill-filtered page load, a cost that grows with the collection rather
//   than with the filter. `{ programs: 1 }` already spared the program filter exactly that.
//   THE OPTIONS COME FROM THE ARTICLES, NOT FROM UPSTREAM. The page already fetches every skill to
//   resolve the card chips, so building the dropdown from that list is the shorter code and the wrong
//   list: upstream holds skills nothing has been written about, and each becomes an option whose only
//   possible outcome is "ไม่พบบทความที่ตรงกับเงื่อนไข". A control that can only disappoint is worse than a
//   shorter list. `listUsedArticleSkillIds` does `distinct('skills', {active: true})` — scoped to active
//   because a skill carried only by inactive articles is the same defect one step smaller — and returns
//   IDS, resolved through the map the chips already use, so there is one resolver and one
//   drop-what-you-cannot-name rule. Sorted by localeCompare('th') on the NAME, since the ids sort by an
//   upstream code nobody sees. THAT CLAIM IS A SOURCE ASSERTION BY NECESSITY: the component receives
//   `skillOptions` as a prop, so every render fixture stays green whichever list the page built it from —
//   the same seam as the `program_id` keying guard, and the control confirms it (building from
//   `skillsRes.items` reddens T-f and NOT ONE render test).
//   NO `'all'` SENTINEL, unlike the filter it replaces: that one spelled "no filter" as `'all'` and
//   pushWith had to know to delete it, i.e. a second spelling of empty kept in step by hand. `''` is what
//   pushWith already drops and what page.jsx already reads back, so the value round-trips unchanged.
//   `?type=` IS KEPT AND IS NOW URL-ONLY, stated in page.jsx rather than left to be discovered: the
//   control is gone and the card's type badge went the round before, so articleType has NO public surface
//   left. Old `?type=video` links keep working instead of silently returning an unfiltered list.
//   `initialFilters.type` had exactly ONE reader (the select being replaced) and `isVideo` was already
//   gone with the badge — both verified by grep, not assumed.
//   TWO MATCHER DEFECTS, BOTH CAUGHT BY RUNNING. (1) React injects `selected=""` into whichever option
//   matches the select's value, so the default option is `<option value="">ทุก Skill</option>` WITH a
//   filter active and `<option value="" selected="">…` without one — a literal full-tag anchor locates
//   the element in exactly one of the two states and went red against a correct render. Anchored on the
//   label instead; the `disabled:opacity-30` rule generalised again, this time to a conditional
//   attribute inside a locator. (2) T-h asserts the index CARRIES ITS MEASUREMENT, and a measurement is
//   prose — but readSourceForScanning strips comments, so the scrubbed text is empty of exactly the thing
//   under test. That one assertion reads the RAW file, deliberately and only there, with a control
//   pinning that the scrubbed copy does NOT contain it so the distinction cannot quietly erode.
//   Verified red five ways: building options from the full upstream list (1 — T-f, zero render tests),
//   offering unresolved ids raw (1 — T-f again, same seam), reintroducing the `'all'` sentinel (6),
//   dropping `filter.skills` while leaving the param declared (1 — T-g), and removing the index while
//   keeping the filter (1 — T-h, the filter-and-its-index pairing).
// 1065 (public card, commit 2) — the vacated top-left overlay slot now carries the article's PROGRAM
//   (+8 in test/render/publicArticleCard). The type badge left that slot empty; what a reader scanning a
//   grid of covers actually wants there is which part of the catalogue the article belongs to. Same
//   visual treatment as the badge it replaces, deliberately — the slot's job (one short high-contrast
//   label over artwork) did not change. articleType, the ประเภททั้งหมด filter, the `?type=` param and
//   BlogSection are all untouched.
//   NO SECOND FETCH: page.jsx already called listPrograms() for the filter <select>, and `programNames`
//   is derived from the ALREADY-MAPPED `programs` array rather than from a second call or a second
//   reading of the response. Two calls would be two answers on a slow upstream — a card tagged with a
//   program the dropdown does not offer, from one page render — so one assertion counts `listPrograms(`
//   occurrences and pins it at exactly 1, with a control showing the counter can count 1 and 0.
//   THE S5-h LESSON, APPLIED A SECOND TIME AND MEASURED. The map is keyed on `program_id` because that is
//   what an article stores (src/models/Article.js:26 declares `programs: [String]` and comments it
//   "program_id values"; ArticleForm's ProgramPicker checks `value.includes(p.program_id)` — both ends
//   asserted, not just the near one). Keyed on `_id` it resolves NOTHING, and because an unresolved id is
//   DROPPED rather than printed the symptom is pure silence. The control proves the seam is real: keying
//   by `_id` reddens ONLY the two source-level assertions and NOT ONE render test, because the render
//   tier is handed the map as a prop and every fixture keeps passing its own correct one.
//   THE OVERLAY EXTRACTOR IS DEPTH-MATCHED ON <span>, not sliced to the end of the cover link, because
//   the pin badge is a SIBLING in that subtree and a slice-to-the-end would sweep it in — letting a pin
//   satisfy an assertion about programs. It returns `null` rather than throwing when there is no overlay,
//   since "renders nothing" is the SPECIFIED behaviour and the test has to be able to state it; a test
//   that only asked "is the name absent" would pass against an empty <span> floating on the artwork,
//   which is exactly what a `{tags.map(...)}` with no length guard produces. Unbalanced markup still
//   fails loudly. One assertion pins that the extractor DOES find an overlay on a card that has one, or
//   all four "renders nothing" cases would be null checks against an extractor that never returns.
//   ONE RESOLVER SERVES BOTH ROWS (overlay programs, body skills) so the drop-unresolved rule cannot
//   drift between them — visible in the control: printing raw ids instead of dropping them reddens the
//   program tests AND the two pre-existing skills tests, from one edit.
//   THE FIXTURE NAME CARRIES AN AMPERSAND ON PURPOSE. "Data & AI" renders as `Data &amp; AI`, and the
//   first draft matched the raw `&` and went red against perfectly correct output. Written escaped
//   rather than dodged with a punctuation-free fixture: upstream program names really do contain "&",
//   and the escaping is the proof that the name is rendered as TEXT rather than interpolated as markup.
//   The chips are NON-INTERACTIVE spans and one test says why: they sit inside the cover <Link>, so
//   linking them to `?program=` would nest an anchor inside an anchor — invalid HTML that browsers
//   resolve by splitting the outer link, breaking the card's own click target. The program filter already
//   exists in the toolbar. Capped at 2 with NO "+N" counter, tighter than the body row's 3: this slot
//   overlays artwork, and a `+1` in that position reads as part of the picture.
//   Verified red four ways: printing raw ids instead of dropping them (4 — 2 program, 2 skills, the
//   shared-resolver property), keying the map on `_id` (2, BOTH source-level, zero render), rendering the
//   wrapper unconditionally (1 — the empty case, which no name-absence assertion would have caught), and
//   removing the cap (1).
// 1084 (pinned-block cap) — the pinned block is capped at MAX_PINNED_ARTICLES = 5 (+19: 9 in
//   test/pure/articlePositioning, 9 in the new test/fs/pinBlockCap, 1 in test/pure/articleOrdering).
//   MEASURED FIRST, READ-ONLY: production holds FIVE pinned articles, all active, pinOrder contiguous
//   1..5 — i.e. exactly AT the cap, so the next pin attempt in production will be refused. The previous
//   measurement in this repo found ELEVEN; the block drained on its own between then and now. Nothing was
//   written, repaired or demoted.
//   THE CAP REFUSES NEW PINS AND DOES NOTHING ELSE. An OVER-CAP BLOCK IS A LEGAL STATE, and keeping that
//   straight is the whole design: b-005 (duplicate pinOrder) and b-006 (a stray non-zero on an unpinned
//   row) are states the MODEL cannot express correctly — the number silently stops deciding the position
//   — so the planners repair them by construction. Eleven pinned articles under a cap of five express
//   themselves perfectly: they are numbered 1..11 and the page renders exactly that. It is a POLICY
//   overshoot about what may be ADDED, so it drains as the admin unpins and is never "fixed" by evicting
//   six articles somebody deliberately chose. planDemotion is therefore UNCHANGED and one test asserts it
//   consults nothing about the cap — unpinning is the only way out, so a check there would be a trap.
//   Reordering inside an over-cap block also stays fully allowed.
//   THE COUNT IS OVER THE WHOLE BLOCK, ACTIVE OR NOT, encoded as an assertion rather than left in prose:
//   `pinOrder` is contiguous 1..M over the BLOCK and neither planMoveToPosition nor planDemotion knows
//   what `active` means, so an active-only cap would count a different set from the one being numbered —
//   with one inactive member you could pin a sixth article into a block already numbered to 6. The
//   consequence is stated plainly: AN INACTIVE PINNED ARTICLE OCCUPIES A SLOT. C-f pins it, and pins that
//   the fixture genuinely separates the two counts (whole block = MAX, active-only = MAX-1) so it cannot
//   pass an active-only implementation by coincidence.
//   ENFORCED BY THE PLANNER, NOT THE UI. `describePinCapacity` answers once; planPromotion refuses from it
//   and the form disables from it — the resolveStep pattern. A disabled button is a hint to whoever is
//   looking at the screen and nothing at all to a stale tab, a second admin, or a replayed POST, and
//   setArticlePinned is an exported function in a 'use server' module. The refusal returns `plan.message`
//   verbatim (the planner attached it) rather than re-asking, and NO AUDIT ROW is written: a refused pin
//   is not a thing that happened, the rule moveArticleOneStep and moveArticleToRank already follow. K-e
//   asserts the refusal precedes BOTH the write and the audit call by index, not merely that it exists.
//   EVERY FIXTURE IS SIZED FROM THE CONSTANT, never from the digit it holds, so exactly ONE test names
//   the number. Verified: raising the cap to 6 reddens C-h alone.
//   FOUR EXPORTS, ONE READ. getPinCapacity reuses readBlockContext() rather than adding a countDocuments
//   — cheaper, and a second way of answering one question is how the two halves start disagreeing. It is
//   read-only, so MUTATING_EXPORT_COUNT does not move. planPromotion has exactly ONE caller
//   (setArticlePinned) and the only route to `isPinnedOnArticlePage: true` is that planner's write via
//   applyPlan, which is un-exported; the form payload and articleSchema both omit the field, and both
//   repair scripts touch only pinOrder/sortKey. Verified by grep before writing anything.
//   TWO MATCHER LESSONS, BOTH FOUND BY RUNNING RATHER THAN READING. (1) Anchors on `\/**` all threw:
//   readSourceForScanning STRIPS comments, so a doc-block anchor does not exist in the text being sliced
//   — regions are anchored on the next DECLARATION instead, which is more stable anyway. (2) `\b5\b`
//   fires inside `mt-0.5` and `py-0.5`, because `.` is a non-word character, so the "no literal cap
//   anywhere" check reported the defect unconditionally against a correct component. That is the
//   `disabled:opacity-30` rule one step along — never match a bare DIGIT in Tailwind markup either — and
//   the fix is to strip className values before asking a question about the text, with a control proving
//   the stripper is load-bearing (the form really does carry those decimals) and that it keeps the text.
//   A REAL HOLE THE CONTROL PROCESS EXPOSED, and it is the sharpest finding here: control 5 ("enforce in
//   the UI but not the action") left the ENTIRE SUITE GREEN on its first run. Two reasons at once — the
//   patch's `.replace()` hit moveArticleToRank's IDENTICAL refusal line first, and U4-c6 was matching
//   that line DOCUMENT-WIDE, so setArticlePinned's brand-new copy satisfied an assertion about
//   moveArticleToRank. One function's guard was silently discharged by another function's code the moment
//   the second function adopted the same shape. U4-c6 is now scoped to moveArticleToRank's own body and
//   additionally asserts that at least TWO functions use the shape, so the scoping cannot quietly become
//   unnecessary. Re-verified both ways after the fix.
//   Verified red five ways: raising the constant to 6 (1 — C-h alone, every agreement assertion green),
//   `>` instead of `>=` (3 — the off-by-one at the boundary), the refusal path writing anyway (4,
//   including the fs guard), counting active rows only (1 — C-f), and removing the action's refusal
//   (2 — K-e plus U4-c6's two-callers assertion; ZERO before U4-c6 was scoped).
// 1471 (reviewed '#'→'sharp' substitution) — +9 in test/pure/legacyPublicId.test.mjs, +8 in the new
//   test/pure/legacyResolverRoute.test.mjs. `#` came off UNREVIEWED_INVALID_CHARS the way that list is
//   meant to be emptied: the full-tree backfill hit 13 real deliverable files carrying it (the C# course
//   covers, plus one certificate PDF) and legacyPathToPublicId THREW rather than inventing a mapping. So
//   the graduation is pinned from BOTH sides — '#' must no longer throw, and the remaining five
//   (? % < > \) must still throw, asserted against the exact frozen array so a sixth cannot join the
//   reviewed set unnoticed.
//   THE PART THAT IS NOT A MIRROR OF THE AMPERSAND RULE: over HTTP a literal '#' is the FRAGMENT
//   delimiter, so a client strips it and everything after it before sending. `%23` is therefore the only
//   reachable spelling — where the ampersand rule's dual `&|%26` match was belt-and-braces, here the
//   encoded half is load-bearing and matching only the literal would resolve 0 of 13. The routing file is
//   also the FIRST coverage the resolver-trigger rewrite has ever had, which is why '&' is carried
//   through every case as a control: same rule, already deploy-verified 6/6 in both spellings.
//   Ordering is pinned twice because it is contested twice: the resolver rule must precede the image
//   catch-all for every root (the catch-all matches ANY path, so a later resolver rule can never fire),
//   and the certificate PDF must reach the resolver rather than the extension-keyed RAW rule that would
//   otherwise claim it and send the un-substituted path to Cloudinary for a 400. Controls hold the
//   fallback narrow: six ordinary paths must stay static — a resolver that widens is a bandwidth
//   regression, not a tidy-up — and an unreviewed invalid char must NOT be swept in, since that would
//   convert a loud upload-time throw into a quiet request-time 404.
//   WHAT THESE TESTS CANNOT PROVE, stated so nobody reads them as more than they are: they pin the
//   PATTERN — which paths match, in what order, and that `%23` survives into the compiled destination.
//   Whether Vercel's runtime hands that destination to the route handler with the segment decoded back to
//   '#' is Next's internal plumbing, not a regex, and needs a deployed probe.
// 1454 (Phase 2 revert path) — +15 in test/pure/legacyReferenceRevert.test.mjs. The revert is what we
//   reach for on the worst day: legacy server off, 1651 references already rewritten, something wrong. It
//   gets exercised for real exactly once, in Stage A, so every branch is pinned here instead of being
//   discovered in production. The branch that matters most is CONFLICT: between apply and revert someone
//   may have edited that article in the admin, their edit is newer and more valuable than our rollback,
//   and a revert that silently overwrites it is WORSE THAN NO REVERT because it destroys work while
//   reporting success. Pinned: a one-character edit is still a conflict; a field that changed type is a
//   conflict; a deleted document or removed field is MISSING and is never recreated. Idempotence falls
//   out of checking already-reverted BEFORE conflict — a second run sees originalValue and reports a
//   no-op rather than hundreds of false conflicts. Verification is a SEPARATE pass over freshly-read
//   documents, because a writer reporting its own success is how a revert comes to be believed without
//   being true; its control asserts it does NOT accept newValue as reverted. Dotted paths (including
//   array indices) are covered because promotions and webhook payloads nest. Beyond these, the shipped
//   COMMAND is rehearsed end-to-end against MongoDB by scripts/_rehearse-revert.mjs using two throwaway
//   collections — unit tests cannot prove the guarded updateOne actually matches.
// 1439 (Phase 2 manifest-resolution layer) — +7 in test/pure/legacyReferenceRewrite.test.mjs. Three
//   references sat unclassified because the PATTERN cannot tell a Drupal-appended extension from a
//   genuinely dotted filename: "thailand-4.0.png" is either a dotted name or a .png conversion of
//   "thailand-4.0", and the path does not say. The ruling was NOT to relax resolveDerivative() — a rule
//   that guessed would guess wrong on the first real "chart.2.webp" and nobody would find it — but to
//   answer from evidence: legacy_file_migrations records only files actually downloaded and uploaded, so
//   it knows which reading exists. Measured: all three candidates FOUND status=uploaded, all three
//   stripped alternatives absent. The layering is what these tests pin, not the outcome. The pattern
//   must still refuse on its own (asserted), must hand its candidate forward rather than hide it, and
//   must NOT be re-classified by the evidence layer for any case it already decided (control). A
//   candidate absent from the manifest leaves the reference untouched; one that is present but DEAD is
//   still not rewritten; and manifest-resolved stays a DISTINCT class from pattern-resolved even when
//   the manifest happens to contain a high-confidence derivative — otherwise the report can no longer
//   say which references rest on evidence and which on a rule.
// 1432 (Phase 2 reference rewrite, dry run) — +22 in test/pure/legacyReferenceRewrite.test.mjs. This
//   phase edits ~2000 references inside 850 documents, most of them inside rich-HTML article bodies,
//   and EVERY failure mode is silent: a replacement that re-encodes a path 404s inside a diff too large
//   to eyeball; one that is not idempotent corrupts on the second run; a byte-range splice off by one
//   eats a quote and destroys markup; rewriting a dead link produces a tidy path that still 404s. None
//   of those throw. The four rewriting classes are pinned with their real shapes, plus the three that
//   must NOT be touched — already-root-relative (asserted to return a NULL replacement, which is what
//   guarantees byte-identity), confirmed-dead, and page links that match the audit's host pattern but
//   name a route rather than a file. Percent-encoding and Thai filenames are asserted to survive byte
//   for byte, because decoding and re-encoding would silently normalise thousands of values into a
//   shape nobody reviewed. Idempotence is proven by running every class through classify twice. Two
//   controls on the splicer: overlapping ranges must THROW rather than corrupt, and an empty edit list
//   must return the identical string. The last test is the invariant the whole project rests on — no
//   replacement may contain a host, a transformation, a width, a query or a styles/ segment.
// 1410 (legacy delivery layer finalised) — +14 in test/pure/legacyDerivativeRewrite.test.mjs. Two things
//   derive a Drupal source path from a `styles/<style>/public/foo.png.webp` derivative: resolveDerivative()
//   in scripts/lib/legacy-source-manifest.mjs, and the styles/ REWRITE in next.config.mjs. They cannot
//   share an implementation — a Next rewrite is a regex and cannot call a function per request — so they
//   share only the extension vocabulary in src/lib/legacyTransforms.mjs and are therefore two encodings of
//   one rule. Two encodings of one rule drift, and the failure is silent: a cover 404s, the page renders a
//   broken image, nothing throws. The suite compiles the CONFIG'S OWN source patterns with Next's own
//   path-to-regexp build and asserts they agree with resolveDerivative() across the seven real derivative
//   covers stored on /articles page 1 (all measured returning 404 before this rule existed), the Thai
//   filename, and the three cases the narrow-strip rule exists for: `report.2024.webp` must NOT be stripped
//   (`2024` is not an image extension, so stripping would invent a file), `foo.png.webp.webp` strips
//   exactly one layer, and nested directories survive. Two controls prove the rules can fail to match —
//   an ordinary source path and a styles path outside the files dir must both go unmatched, or a
//   match-everything rule would make every other assertion pass while breaking normal delivery. Four more
//   pin the single-definition property: no destination may request f_auto/q_auto/dpr_auto/w_auto (each
//   makes Cloudinary answer `private` with a `Vary`, measured MISS 4/4 at Vercel's edge against
//   MISS-HIT-HIT-HIT for the fixed string), SVG must stay untransformed on every variant, a width variant
//   must be a transparent alias of the default rules, and no `source` may contain a width or format —
//   that last one is the styles/large_cover trap this migration exists to undo. Verified red by putting
//   f_auto,q_auto back into DELIVERY_VARIANTS.default: 13 pass, 1 fails.
// 1396 (legacy file migration, rulings 1-3) — +5 in test/pure/legacyPublicId.test.mjs. A SECOND rule
//   (trailing-whitespace-trim) joins the ampersand one: Cloudinary refuses an id ending in whitespace, and
//   six real files carry a space before the extension. The rule field became an ARRAY in the same change
//   because one path can need BOTH — "Sales & Marketing .png" trips the ampersand rule and then the trim —
//   and a scalar field would record whichever ran last and silently drop the other. There is a composition
//   test for exactly that. The identity test for INTERNAL spaces is the one that matters most: hundreds of
//   migrated files carry them and they were measured surviving verbatim through upload AND delivery, so a
//   trim-everywhere rule would have broken far more than it fixed.
// 1391 (legacy file migration) — test/pure/legacyPublicId.test.mjs (+9). The legacy→Cloudinary
//   public_id rule gets ONE implementation (src/lib/legacyPublicId.js) because the migration uploader and
//   the delivery resolver both need it, and two copies drifting apart fails as a handful of dead images
//   two years later rather than as a red test. Covers all SIX real filenames containing & (the entire
//   live population — the set was scanned, & was the only invalid character present) plus identity cases
//   for the characters that must NOT be touched: spaces, @, parentheses, Thai script, uppercase extension.
//   Two controls: every OTHER invalid character (? # % < > backslash) must THROW rather than be silently
//   substituted by a rule nobody reviewed, and the substitution is proven NON-REVERSIBLE ("Build and
//   Manage" is a real filename indistinguishable from the substituted "Build & Manage"), which is why the
//   migration record carries a queryable flag instead of the resolver trying to invert it.
const TIERS = ['pure', 'fs', 'render'];
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

const files = TIERS.flatMap((tier) => {
  const dir = path.join(TEST_DIR, tier);
  let entries = [];
  try { entries = readdirSync(dir); } catch { /* tier dir may not exist yet */ }
  return entries.filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(dir, f));
});

// ── DISCOVERY GUARD ─────────────────────────────────────────────────────────
// The manifest above only looks ONE level deep in three named directories. A
// *.test.mjs written anywhere else under test/ — a new tier, a subfolder, the
// root — is silently never run, and its author has no way to tell: the suite is
// green, the count goes up by zero, and nothing says the file was skipped.
// Walk the whole of test/ and compare against what the manifest enumerated.
function walkTests(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walkTests(full, out);
    else if (name.name.endsWith('.test.mjs')) out.push(full);
  }
  return out;
}
const onDisk = walkTests(TEST_DIR).sort();
const enumerated = new Set(files);
const undiscovered = onDisk.filter((f) => !enumerated.has(f));

// CANARY=1 injects the deliberately-failing case (test/canary.case.mjs). A human
// runs `CANARY=1 npm test`, expects EXACTLY ONE failure, and if the run is green
// the runner is not reporting failures. Manual by design — see the case file.
if (process.env.CANARY) files.push(path.join(TEST_DIR, 'canary.case.mjs'));

let pass = 0, fail = 0;
// Per-file counts, so "this file ran" can be distinguished from "this file was
// listed". A file that imports cleanly but defines no test contributes nothing
// and, under a total-only check, is indistinguishable from one that was never
// written — which is exactly the shape of a silently-deleted suite.
const perFile = new Map(files.map((f) => [f, 0]));
const bump = (e) => {
  const f = e?.file;
  if (f && perFile.has(f)) perFile.set(f, perFile.get(f) + 1);
};
const stream = run({ files, isolation: 'none', concurrency: true });
stream.on('test:pass', (e) => { pass += 1; bump(e); });
stream.on('test:fail', (e) => { fail += 1; bump(e); });
stream.compose(spec).pipe(process.stdout);

stream.on('close', () => {
  const total = pass + fail;
  const problems = [];

  // EXACT, not a floor. A minimum only catches wholesale disappearance; it
  // cannot catch the tests added this week, because the number that would catch
  // them is the one a human forgot to write down — which is precisely what
  // happened when 26 tests landed against a floor of 565 and the suite stayed
  // green. An exact match makes every test addition bump this line deliberately
  // instead of optionally. Raising it is one line and is part of the same
  // commit that adds the tests.
  if (total !== EXPECTED_TESTS) {
    problems.push(
      `expected EXACTLY ${EXPECTED_TESTS} tests, ran ${total}. ` +
      (total > EXPECTED_TESTS
        ? 'If you added tests, raise EXPECTED_TESTS in test/run.mjs in the same commit.'
        : 'Tests VANISHED — that is what this check is for.')
    );
  }
  if (undiscovered.length) {
    problems.push(
      'these *.test.mjs files exist on disk but the manifest never ran them:\n' +
      undiscovered.map((f) => `    ${path.relative(TEST_DIR, f)}`).join('\n')
    );
  }
  const empty = [...perFile].filter(([, n]) => n === 0).map(([f]) => f);
  if (empty.length) {
    problems.push(
      'these files were enumerated but contributed ZERO tests:\n' +
      empty.map((f) => `    ${path.relative(TEST_DIR, f)}`).join('\n')
    );
  }

  console.log(
    `\n[suite] ${pass} passed, ${fail} failed, ${total} total across ${files.length} files ` +
    `(expected ${EXPECTED_TESTS})`
  );
  for (const p of problems) console.log(`[meta-control] FAIL: ${p}`);
  process.exit(fail > 0 || problems.length ? 1 : 0);
});
