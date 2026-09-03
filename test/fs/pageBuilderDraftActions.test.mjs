import { test } from "node:test";
import assert from "node:assert/strict";

import { resetFakeDb, seed, all, count, setSessionUser } from "../fakeDb.mjs";
import { _calls as revalidations } from "../stub-next-cache.mjs";
import { DRAFT_CONTENT_KEYS, LIVE_ONLY_KEYS } from "@/lib/schemas/pageBuilder";
import {
  saveDraftContent,
  publishPageStatus,
  discardDraftContent,
  getPageBuilderPageBySlug,
  getPageBuilderPageBySlugAny,
  duplicatePageBuilderPage,
  updatePageIdentity,
  updatePageStatus,
  createPageBuilderPage,
} from "@/lib/actions/pageBuilder";
// A SECOND import statement rather than an edit of the one above — the standing
// rule in this repo, and what the seam scanners exist to keep true.
import { getPageVersionSnapshot } from "@/lib/actions/pageBuilder";
// Round 37, ADDED beside the statements above rather than folded into any.
import { backupDraftBeforeRestore } from "@/lib/actions/pageBuilder";
import { getPageVersions } from "@/lib/actions/pageBuilder";
// Round 38, ADDED beside the statements above rather than folded into any.
import { getPageAuditLog } from "@/lib/actions/pageBuilder";
import {
  AUDIT_TRAIL_PAGE_SIZE,
  buildPageAuditQuery,
  parseAuditTrailCursor,
} from "@/lib/pageBuilder/auditTrail";
import {
  DRAFT_BACKUP_LABEL,
  isDraftBackup,
  versionRowLabel,
} from "@/lib/pageBuilder/versionLabel";
import { effectiveContent as effectiveContentOf } from "@/lib/pageBuilder/draftState";
import { getActiveBuilderPromotions } from "@/lib/promotions/getPromotions";
import { publishBlockers } from "@/lib/pageBuilder/publishReadiness";

/**
 * Round 2 — the server action layer of the draft/published split, EXECUTED.
 *
 * ── WHY THIS FILE LOOKS UNLIKE EVERY OTHER ACTION TEST HERE ─────────────────
 * Until now nothing in this repo ran a server action. Every action was guarded
 * by source-scanning — reading the real source text and asserting its shape —
 * and the test/stub-*.mjs files exist to make actions UNREACHABLE from render
 * tests, not to make them testable. That was fine while the claims were
 * structural. The claims here are not: "a publish promotes the draft exactly
 * once", "a snapshot never carries a pending edit", "a draft save revalidates
 * nothing" are statements about what the code DOES, and a shape check cannot
 * tell a correct implementation from a merely plausible one.
 *
 * So test/fakeDb.mjs provides in-memory stand-ins for the page models, and
 * test/loader.mjs maps them (plus dbConnect, requireAdmin and the Cloudinary
 * SDK) at resolve time. Everything else — the real actions, the real
 * tierSanitize, the real publishReadiness, the real pageAudit, the real
 * slugGuard — runs for real.
 *
 * ── WHY EVERY CASE IS A SUBTEST OF ONE PARENT ───────────────────────────────
 * MEASURED, not stylistic. The runner calls run({ isolation: 'none',
 * concurrency: true }), which makes root-level tests run CONCURRENTLY. Every
 * other test in this suite is synchronous and stateless, so that has never
 * mattered. These cases are async and share one module-level fake database, so
 * as root tests they interleaved and reset each other's fixtures mid-flight —
 * 24 of 32 failed, all with nonsense diffs. Awaited subtests of a single parent
 * are sequential, which is the guarantee this file needs. Do not flatten them.
 *
 * ── WHAT THE HARNESS CANNOT SEE, said plainly ───────────────────────────────
 * It is not Mongo. It implements the query surface these actions use and THROWS
 * on anything else rather than answering emptily. It does not enforce the
 * Mongoose schema, so nothing here can prove a cast or a required-field rule.
 */

const PAGE_ID = "page-under-test";
const MARKER = "DRAFT_LEAK_MARKER_R2";

/** A live section, in the shape the section union actually validates. */
function section(id, type = "heading") {
  return {
    id,
    type,
    name: "",
    enabled: true,
    sortOrder: 0,
    settings: {},
    layout: {},
    style: {},
    content: {},
    advanced: { sectionId: "", customClass: "", customCss: "", customHtml: "" },
  };
}

/** The nine draft-content keys, all present, distinguishable from the live half. */
function draftContent(overrides = {}) {
  return {
    title: "Drafted Title",
    sections: [section("s-draft", "rich_text")],
    theme: "ai_purple",
    showHeader: false,
    showFooter: true,
    showStickyCta: true,
    seo: { metaTitle: "draft meta" },
    jsonLd: { mode: "off" },
    promotionCover: "https://example.com/draft-cover.jpg",
    ...overrides,
  };
}

function seedPage(overrides = {}) {
  return seed("PageBuilder", {
    _id: PAGE_ID,
    slug: "real-slug",
    title: "Live Title",
    pageType: "general",
    status: "draft",
    theme: "default",
    showHeader: true,
    showFooter: true,
    showStickyCta: false,
    publishStartDate: null,
    publishEndDate: null,
    promotionId: "",
    promotionOrder: 0,
    promotionCover: "",
    sections: [section("s-live")],
    seo: { metaTitle: "live meta" },
    jsonLd: { mode: "auto" },
    slugHistory: [],
    preview: { enabled: false },
    createdBy: { id: "", name: "" },
    updatedBy: { id: "", name: "" },
    draft: null,
    ...overrides,
  });
}

const row = () => all("PageBuilder").find((p) => String(p._id) === PAGE_ID);
const token = (r) => new Date(r.updatedAt).toISOString();
const copy = (v) => JSON.parse(JSON.stringify(v));

test("the draft/publish action layer", async (t) => {
  /** One case, with the shared fake database reset first. */
  const scenario = (name, fn) =>
    t.test(name, async () => {
      resetFakeDb();
      revalidations.length = 0;
      setSessionUser({ id: "u1", name: "Dev", tier: "developer" });
      await fn();
    });

  // ── saveDraftContent ──────────────────────────────────────────────────────

  await scenario(
    "saveDraftContent writes the draft and touches NOTHING else",
    async () => {
      const before = copy(seedPage());
      const res = await saveDraftContent(
        PAGE_ID,
        draftContent(),
        token(before),
      );
      assert.equal(res.ok, true, res.error);

      const after = row();
      // The FULL set of untouched keys, not a sample: everything except the two
      // fields a draft save is allowed to move.
      const movable = new Set(["draft", "updatedAt"]);
      const changed = Object.keys(after).filter(
        (k) =>
          !movable.has(k) &&
          JSON.stringify(after[k]) !== JSON.stringify(before[k]),
      );
      assert.deepEqual(
        changed,
        [],
        "a draft save moved fields it must not touch",
      );

      // And by name, so a failure says WHICH key moved.
      for (const key of LIVE_ONLY_KEYS) {
        assert.deepEqual(
          after[key],
          before[key],
          `live-only key ${key} moved on a draft save`,
        );
      }
      // The LIVE content half must not move either — that is the whole feature.
      for (const key of DRAFT_CONTENT_KEYS) {
        assert.deepEqual(
          after[key],
          before[key],
          `live content ${key} moved on a draft save`,
        );
      }
    },
  );

  await scenario(
    "CONTROL: the draft save really did store the nine content keys",
    async () => {
      // Without this, the "nothing moved" case passes for a save that did nothing.
      const before = copy(seedPage());
      await saveDraftContent(PAGE_ID, draftContent(), token(before));
      const { draft } = row();
      assert.deepEqual(
        Object.keys(draft).sort(),
        [...DRAFT_CONTENT_KEYS, "savedAt", "savedBy"].sort(),
      );
      assert.equal(draft.title, "Drafted Title");
      assert.equal(draft.theme, "ai_purple");
    },
  );

  await scenario(
    "saveDraftContent revalidates NOTHING and snapshots nothing",
    async () => {
      const before = copy(seedPage({ status: "published" }));
      await saveDraftContent(PAGE_ID, draftContent(), token(before));
      assert.deepEqual(
        revalidations,
        [],
        "a draft save busted a cache; the edit would go public",
      );
      assert.equal(count("PageVersion"), 0, "a draft save wrote a snapshot");
    },
  );

  await scenario(
    "CONTROL: a publish on the same fixture DOES revalidate",
    async () => {
      // Proves the empty-revalidations assertion above is observable, not vacuous.
      const before = copy(seedPage({ status: "published" }));
      await publishPageStatus(PAGE_ID, { status: "published" }, token(before));
      assert.ok(
        revalidations.length > 0,
        "the revalidation recorder never sees anything",
      );
    },
  );

  await scenario(
    "saveDraftContent audits a PRESENCE FLAG, never the content",
    async () => {
      const before = copy(seedPage());
      await saveDraftContent(PAGE_ID, draftContent(), token(before));
      const [entry] = all("PageAuditLog");
      assert.equal(entry.action, "draft.save");
      assert.deepEqual(entry.before, { hadDraft: false });
      assert.deepEqual(entry.after, { hasDraft: true });
      assert.ok(
        !JSON.stringify(entry).includes("Drafted Title"),
        "the audit row carries the draft body",
      );
    },
  );

  /**
   * ── ROUND 47: WARN, NEVER EDIT — THE SAVE HALF ──────────────────────────
   * The editor now warns when an authored course list repeats a code
   * (docs/course-picker-proposal.md §G step 1). It is a WARNING and nothing
   * more: the save path must still store both entries, in order, unchanged.
   *
   * Here rather than in a file of its own because this is the ONE
   * fakeDb-owning parent — the note above getPageVersionSnapshot explains why
   * a second one reddens this file's fixtures mid-flight.
   *
   * WHAT WOULD BREAK IT, and would otherwise ship green: a `[...new Set(ids)]`
   * added anywhere between the control and the document — in CourseIdsField's
   * onChange, in a reducer case, in shapePayload, in the zod schema. Every
   * rendered assertion in test/render/courseIdsDuplicateWarning would stay
   * green through all four, because they all read the array BEFORE the save.
   */
  await scenario(
    "a save with a REPEATED course code stores both entries, in order",
    async () => {
      const before = copy(seedPage());
      const authored = ["CLAUDE-AI", "MSE-AI", "CLAUDE-AI", "POWER-BI"];
      const selector = {
        ...section("s-sel", "course_selector"),
        content: { heading: "", courseIds: [...authored] },
      };
      const res = await saveDraftContent(
        PAGE_ID,
        draftContent({ sections: [selector] }),
        token(before),
      );
      assert.equal(res.ok, true, res.error);

      const stored = row().draft.sections[0].content.courseIds;
      assert.deepEqual(
        stored,
        authored,
        "the save rewrote a list that merely repeats a code",
      );
      assert.equal(
        stored.filter((c) => c === "CLAUDE-AI").length,
        2,
        "a duplicate was collapsed",
      );
    },
  );

  await scenario(
    "CONTROL: the same save DOES store a list it was given",
    async () => {
      // Without this, the case above passes against a save that stored nothing at
      // all and left `courseIds` undefined on both sides of a deepEqual against
      // an array it never wrote.
      const before = copy(seedPage());
      const selector = {
        ...section("s-sel", "course_selector"),
        content: { heading: "", courseIds: ["ONLY-ONE"] },
      };
      await saveDraftContent(
        PAGE_ID,
        draftContent({ sections: [selector] }),
        token(before),
      );
      assert.deepEqual(row().draft.sections[0].content.courseIds, ["ONLY-ONE"]);
    },
  );

  await scenario(
    "a save keeps an UNRESOLVABLE code too — nothing validates on the way in",
    async () => {
      // The other half of "warn, never edit", and the one that loses data if it
      // ever changes: a code the catalogue has never heard of must survive the
      // round trip, because that is the only thing that makes the damage
      // recoverable when upstream restores the course (§D.1, §F.3).
      const before = copy(seedPage());
      const selector = {
        ...section("s-sel", "course_selector"),
        content: { heading: "", courseIds: ["CLAUDE-AI", "ZZ-NO-SUCH-COURSE"] },
      };
      const res = await saveDraftContent(
        PAGE_ID,
        draftContent({ sections: [selector] }),
        token(before),
      );
      assert.equal(res.ok, true, res.error);
      assert.deepEqual(
        row().draft.sections[0].content.courseIds,
        ["CLAUDE-AI", "ZZ-NO-SUCH-COURSE"],
        "the save dropped a code it could not resolve",
      );
    },
  );

  /**
   * ── ROUND 51: THE SAME RULE, FOR THE SINGLE-VALUE FIELDS ────────────────
   * Step 4 replaced `course_card`'s and `course_schedule`'s bare text boxes
   * with a picker. The list control's rule carries over unchanged: the stored
   * code is the authority and the catalogue is consulted only for a name, so a
   * code the catalogue lacks must survive the round trip.
   *
   * ADDED here beside round 47's, not in a file of its own — this is the ONE
   * fakeDb-owning parent, and the note above getPageVersionSnapshot explains
   * why a second one reddens this file's fixtures mid-flight.
   *
   * The single-value case loses MORE than the list case when it goes wrong. A
   * dropped entry in a list of six leaves five; a dropped `courseId` leaves the
   * section with nothing to resolve, and §D.2 measured what that publishes —
   * 84 bytes, byte-identical to a section that draws nothing. Round 50
   * reproduced the 84 and measured price-off at 1882, so the two states stay
   * distinguishable; an emptied code would not be.
   */
  await scenario(
    "a save keeps an UNRESOLVABLE course_card code, byte for byte",
    async () => {
      const before = copy(seedPage());
      const card = {
        ...section("s-card", "course_card"),
        content: { courseId: "ZZ-NO-SUCH-COURSE", showPrice: true },
      };
      const res = await saveDraftContent(
        PAGE_ID,
        draftContent({ sections: [card] }),
        token(before),
      );
      assert.equal(res.ok, true, res.error);
      const stored = row().draft.sections[0].content;
      assert.equal(
        stored.courseId,
        "ZZ-NO-SUCH-COURSE",
        "the save dropped a code it could not resolve",
      );
      assert.equal(
        stored.showPrice,
        true,
        "round 50 field lost on the way through",
      );
    },
  );

  await scenario(
    "CONTROL: the same save DOES store the courseId it was given",
    async () => {
      // Without this, the case above passes against a save that stored nothing at
      // all and compared undefined to undefined.
      const before = copy(seedPage());
      const card = {
        ...section("s-card", "course_card"),
        content: { courseId: "CLAUDE-AI" },
      };
      await saveDraftContent(
        PAGE_ID,
        draftContent({ sections: [card] }),
        token(before),
      );
      assert.equal(row().draft.sections[0].content.courseId, "CLAUDE-AI");
    },
  );

  await scenario(
    "a save keeps an UNRESOLVABLE course_schedule code too",
    async () => {
      const before = copy(seedPage());
      const sched = {
        ...section("s-sched", "course_schedule"),
        content: { courseId: "ZZ-NO-SUCH-COURSE", limit: 0 },
      };
      const res = await saveDraftContent(
        PAGE_ID,
        draftContent({ sections: [sched] }),
        token(before),
      );
      assert.equal(res.ok, true, res.error);
      assert.equal(
        row().draft.sections[0].content.courseId,
        "ZZ-NO-SUCH-COURSE",
      );
    },
  );

  await scenario(
    "a hand-typed code is stored verbatim — not trimmed further, not case-folded",
    async () => {
      // Direct entry trims and does nothing else (§F.3, §G step 3). Four of 79
      // upstream ids are mixed-case and the course query is exact-match, so a
      // fold anywhere on this path would make those four unreferenceable.
      const before = copy(seedPage());
      const card = {
        ...section("s-card", "course_card"),
        content: { courseId: "MixedCase-Code" },
      };
      await saveDraftContent(
        PAGE_ID,
        draftContent({ sections: [card] }),
        token(before),
      );
      assert.equal(
        row().draft.sections[0].content.courseId,
        "MixedCase-Code",
        "the save normalised a code the author typed",
      );
    },
  );

  await scenario(
    "saveDraftContent rejects a stale expectedUpdatedAt",
    async () => {
      const before = copy(seedPage());
      const stale = new Date(
        new Date(before.updatedAt).getTime() - 5000,
      ).toISOString();
      const res = await saveDraftContent(PAGE_ID, draftContent(), stale);
      assert.equal(res.ok, false);
      assert.equal(res.conflict, true);
      assert.equal(
        row().draft,
        null,
        "a conflicting save still wrote the draft",
      );
    },
  );

  await scenario(
    "saveDraftContent is uniform — an unpublished page drafts the same way",
    async () => {
      const before = copy(seedPage({ status: "draft" }));
      const res = await saveDraftContent(
        PAGE_ID,
        draftContent(),
        token(before),
      );
      assert.equal(res.ok, true, res.error);
      assert.equal(row().draft.title, "Drafted Title");
      assert.equal(row().status, "draft", "a draft save changed the status");
    },
  );

  // ── tier sanitisation reaches draft saves ─────────────────────────────────

  await scenario(
    "a non-developer draft save has a NEW custom_html section stripped",
    async () => {
      const before = copy(seedPage());
      setSessionUser({ id: "u2", name: "Editor", tier: "editor" });
      const res = await saveDraftContent(
        PAGE_ID,
        draftContent({
          sections: [
            section("s-draft", "rich_text"),
            section("adv-1", "custom_html"),
          ],
        }),
        token(before),
      );
      assert.equal(res.ok, true, res.error);
      assert.deepEqual(
        row().draft.sections.map((s) => s.type),
        ["rich_text"],
        "an editor smuggled an advanced section into the draft",
      );
    },
  );

  await scenario(
    "CONTROL: a developer draft save KEEPS the same custom_html section",
    async () => {
      // Same input, same code path, tier flipped — so the strip above is the tier
      // gate doing its job, not the section being dropped for some other reason.
      const before = copy(seedPage());
      const res = await saveDraftContent(
        PAGE_ID,
        draftContent({
          sections: [
            section("s-draft", "rich_text"),
            section("adv-1", "custom_html"),
          ],
        }),
        token(before),
      );
      assert.equal(res.ok, true, res.error);
      assert.deepEqual(
        row().draft.sections.map((s) => s.type),
        ["rich_text", "custom_html"],
      );
    },
  );

  await scenario(
    "a draft save renumbers sortOrder from array position",
    async () => {
      const before = copy(seedPage());
      const a = { ...section("a", "heading"), sortOrder: 7 };
      const b = { ...section("b", "rich_text"), sortOrder: 3 };
      await saveDraftContent(
        PAGE_ID,
        draftContent({ sections: [a, b] }),
        token(before),
      );
      assert.deepEqual(
        row().draft.sections.map((s) => s.sortOrder),
        [0, 1],
      );
    },
  );

  // ── publishPageStatus: the publish branch ─────────────────────────────────

  await scenario(
    "publish promotes the draft EXACTLY once and clears it",
    async () => {
      const before = copy(seedPage({ status: "draft", draft: draftContent() }));
      const res = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(before),
      );
      assert.equal(res.ok, true, res.error);

      const after = row();
      const expected = draftContent();
      for (const key of DRAFT_CONTENT_KEYS) {
        assert.deepEqual(after[key], expected[key], `${key} was not promoted`);
      }
      assert.equal(after.draft, null, "the draft survived its own promotion");
      assert.equal(after.status, "published");
    },
  );

  await scenario(
    "publish leaves every live-only field except status/dates alone",
    async () => {
      const before = copy(seedPage({ status: "draft", draft: draftContent() }));
      await publishPageStatus(PAGE_ID, { status: "published" }, token(before));
      const after = row();
      const moved = new Set(["status", "publishStartDate", "publishEndDate"]);
      for (const key of LIVE_ONLY_KEYS) {
        if (moved.has(key)) continue;
        assert.deepEqual(
          after[key],
          before[key],
          `publish moved live-only key ${key}`,
        );
      }
    },
  );

  await scenario(
    "publish snapshots on EVERY call — including a republish with no draft",
    async () => {
      // The behaviour change from "snapshot only on the transition into published".
      const first = copy(
        seedPage({ status: "published", draft: draftContent() }),
      );
      const r1 = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(first),
      );
      assert.equal(r1.ok, true, r1.error);
      assert.equal(
        count("PageVersion"),
        1,
        "the first publish did not snapshot",
      );

      const second = row();
      assert.equal(
        second.draft,
        null,
        "precondition: the second publish has NO draft pending",
      );
      assert.equal(
        second.status,
        "published",
        "precondition: the page is ALREADY published",
      );

      const r2 = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(second),
      );
      assert.equal(r2.ok, true, r2.error);
      assert.equal(
        count("PageVersion"),
        2,
        "a republish of an already-published page with no draft did NOT snapshot",
      );
    },
  );

  /**
   * ── SELF-RETIRING (round 33). DELETE THIS WHEN IT GOES RED ────────────────
   * `publishPageStatus` does NOT stamp `updatedBy`. Its $set is status, the two
   * dates, the promoted content and `draft: null` — nothing else. The only
   * writers of `updatedBy` are createPageBuilderPage, duplicatePageBuilderPage
   * and updatePageBuilderPage, and the last of those has had NO LIVE CALLER
   * since round 3. There are no Mongoose hooks on the schema. So on any page
   * edited since it was created, `page.updatedBy` names its CREATOR.
   *
   * This is asserted because the field is the obvious-looking source for the
   * "ผู้แก้ไขล่าสุด" / "ผู้เผยแพร่" lines the version requirements ask for, and
   * it would answer them confidently and wrongly. The honest sources are
   * `draft.savedBy` while an edit is pending and `PageVersion.actor` after a
   * publish — see docs/version-model-proposal.md §0b, §D, §E.
   *
   * A RED HERE IS NOT A BUG. It means publish now stamps the actor, the trap is
   * gone, and this case has paid its debt — delete it.
   */
  await scenario(
    "publish does NOT stamp updatedBy — it stays the creator (round 33)",
    async () => {
      const before = copy(
        seedPage({
          status: "draft",
          draft: draftContent(),
          createdBy: { id: "u-author", name: "Author A" },
          updatedBy: { id: "u-author", name: "Author A" },
        }),
      );

      // A DIFFERENT, NAMED actor publishes — so this cannot pass by both sides
      // being anonymous, and the name below cannot be a coincidence.
      setSessionUser({
        id: "u-publisher",
        name: "Publisher B",
        tier: "developer",
      });
      const res = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(before),
      );
      assert.equal(res.ok, true, res.error); // not vacuous: the publish landed

      const after = row();
      assert.equal(
        after.status,
        "published",
        "precondition: the publish really went live",
      );
      assert.deepEqual(
        after.updatedBy,
        { id: "u-author", name: "Author A" },
        "publish now stamps updatedBy — the round-33 trap is gone, delete this case",
      );

      // CONTROL for the same fact from the other side: the publisher IS recorded,
      // just not on the page. This is the source docs/version-model-proposal.md
      // §D tells a "ผู้เผยแพร่" line to read.
      const [version] = all("PageVersion");
      assert.equal(
        version.actor.name,
        "Publisher B",
        "the snapshot lost the publisher",
      );
    },
  );

  await scenario(
    "the snapshot never carries a draft — not even when the page had one",
    async () => {
      const before = copy(
        seedPage({ status: "draft", draft: draftContent({ title: MARKER }) }),
      );
      await publishPageStatus(PAGE_ID, { status: "published" }, token(before));

      const [version] = all("PageVersion");
      assert.equal(
        "draft" in version.snapshot,
        false,
        "the snapshot carries a draft key",
      );
      // The promoted title IS expected here — it is live content now, not a draft.
      assert.equal(version.snapshot.title, MARKER);
      assert.equal(version.label, "publish");
    },
  );

  await scenario(
    "publish audits as `publish` with presence flags only",
    async () => {
      const before = copy(seedPage({ status: "draft", draft: draftContent() }));
      await publishPageStatus(PAGE_ID, { status: "published" }, token(before));
      const [entry] = all("PageAuditLog");
      assert.equal(entry.action, "publish");
      assert.deepEqual(entry.before, { status: "draft", hadDraft: true });
      assert.deepEqual(entry.after, { status: "published", hasDraft: false });
    },
  );

  await scenario(
    "publishBlockers judge the RESULTING document, not the stale live one",
    async () => {
      // The live page has no sections (would be blocked); the draft supplies one.
      // Judging `existing` would block a publish that is actually fine.
      const before = copy(
        seedPage({ status: "draft", sections: [], draft: draftContent() }),
      );
      const res = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(before),
      );
      assert.equal(
        res.ok,
        true,
        `a publish the draft fixes was blocked: ${res.error}`,
      );
      assert.equal(row().sections.length, 1);
    },
  );

  await scenario(
    "CONTROL: the mirror case — a draft that BREAKS readiness blocks publish",
    async () => {
      // Live content is publishable; the draft empties the sections. Judging the
      // stale live doc would wave this through — the same bug the other way.
      const before = copy(
        seedPage({ status: "draft", draft: draftContent({ sections: [] }) }),
      );
      const res = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(before),
      );
      assert.equal(res.ok, false, "a draft with no sections was published");
      assert.equal(
        row().status,
        "draft",
        "the page was published despite the blocker",
      );
    },
  );

  // ── the defence-in-depth re-validation ────────────────────────────────────

  await scenario(
    "a draft carrying a value the page schema rejects cannot be promoted",
    async () => {
      // `theme` is deliberately the vehicle: publishBlockers does not look at it
      // at all, so ONLY the full-document re-validation can catch this. A draft is
      // stored as a Mixed blob — nothing in the database enforces its shape.
      const before = copy(
        seedPage({
          status: "draft",
          draft: draftContent({ theme: "not-a-real-theme" }),
        }),
      );
      const res = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(before),
      );

      assert.equal(
        res.ok,
        false,
        "an invalid theme was promoted onto the live page",
      );
      assert.match(
        res.error,
        /^theme:/,
        `the rejection did not come from the theme rule: ${res.error}`,
      );
      const after = row();
      assert.equal(after.status, "draft", "the page published anyway");
      assert.equal(
        after.theme,
        "default",
        "the invalid theme reached the live field",
      );
      assert.notEqual(after.draft, null, "a failed publish cleared the draft");
    },
  );

  await scenario(
    "CONTROL: publishBlockers alone would NOT have caught that theme",
    async () => {
      // Proves the case above exercises the re-validation rather than riding along
      // on a readiness check that happens to fire. Readiness passes this document.
      const resulting = {
        ...copy(seedPage()),
        ...draftContent({ theme: "not-a-real-theme" }),
      };
      assert.deepEqual(
        publishBlockers(resulting, "published"),
        [],
        "publishBlockers now checks theme, so that case no longer isolates anything",
      );
    },
  );

  // ── publishPageStatus: the non-publish branch ─────────────────────────────

  for (const target of ["draft", "closed", "archived"]) {
    await scenario(
      `a ${target} target leaves the draft untouched and snapshots nothing`,
      async () => {
        const pending = draftContent();
        const before = copy(seedPage({ status: "published", draft: pending }));
        const res = await publishPageStatus(
          PAGE_ID,
          { status: target },
          token(before),
        );
        assert.equal(res.ok, true, res.error);

        const after = row();
        assert.equal(after.status, target);
        assert.deepEqual(after.draft, copy(pending), "the draft moved");
        assert.equal(
          count("PageVersion"),
          0,
          `a ${target} target wrote a snapshot`,
        );
        assert.equal(
          after.title,
          "Live Title",
          "the draft was promoted on a non-publish target",
        );
        assert.equal(
          all("PageAuditLog")[0].action,
          "status",
          "wrong audit action off the publish branch",
        );
      },
    );
  }

  await scenario(
    "a tier-downgraded publish lands on the fallback and does NOT promote",
    async () => {
      const before = copy(seedPage({ status: "draft", draft: draftContent() }));
      setSessionUser({ id: "u2", name: "Editor", tier: "editor" });
      const res = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(before),
      );
      assert.equal(res.ok, true, res.error);

      const after = row();
      assert.equal(after.status, "draft", "an editor published");
      assert.equal(
        after.title,
        "Live Title",
        "a coerced publish promoted the draft anyway",
      );
      assert.notEqual(after.draft, null, "a coerced publish cleared the draft");
      assert.equal(count("PageVersion"), 0);
    },
  );

  await scenario(
    "publishPageStatus rejects an unknown status and a stale token",
    async () => {
      const before = copy(seedPage());
      assert.equal(
        (
          await publishPageStatus(
            PAGE_ID,
            { status: "nonsense" },
            token(before),
          )
        ).ok,
        false,
      );
      const stale = new Date(
        new Date(before.updatedAt).getTime() - 5000,
      ).toISOString();
      assert.equal(
        (await publishPageStatus(PAGE_ID, { status: "published" }, stale))
          .conflict,
        true,
      );
    },
  );

  // ── retention: the prune is gone ──────────────────────────────────────────

  await scenario(
    "publishing again keeps every earlier snapshot, including the oldest",
    async () => {
      const before = copy(seedPage({ status: "published" }));
      for (let i = 0; i < 21; i += 1) {
        seed("PageVersion", {
          _id: `v${i}`,
          pageId: PAGE_ID,
          snapshot: { marker: `snapshot-${i}` },
          label: "publish",
          actor: { id: "", name: "" },
          createdAt: new Date(1_600_000_000_000 + i * 1000),
        });
      }
      assert.equal(count("PageVersion"), 21, "fixture did not seed 21 rows");

      const res = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(before),
      );
      assert.equal(res.ok, true, res.error);

      assert.equal(
        count("PageVersion"),
        22,
        "the publish pruned rows instead of appending",
      );
      const ids = all("PageVersion").map((v) => String(v._id));
      // The OLDEST specifically — a prune to the newest 20 takes v0 and v1 first.
      assert.ok(
        ids.includes("v0"),
        "the oldest snapshot was pruned; a Cloudinary asset is now stranded",
      );
      assert.ok(ids.includes("v1"), "the second-oldest snapshot was pruned");
      const seeded = ids.filter((id) => /^v\d+$/.test(id));
      assert.equal(seeded.length, 21, "not every seeded row survived");
    },
  );

  // ── discardDraftContent ───────────────────────────────────────────────────

  await scenario(
    "discardDraftContent clears the draft and nothing else",
    async () => {
      const before = copy(
        seedPage({ status: "published", draft: draftContent() }),
      );
      const res = await discardDraftContent(PAGE_ID, token(before));
      assert.equal(res.ok, true, res.error);

      const after = row();
      assert.equal(after.draft, null);
      const movable = new Set(["draft", "updatedAt"]);
      const changed = Object.keys(after).filter(
        (k) =>
          !movable.has(k) &&
          JSON.stringify(after[k]) !== JSON.stringify(before[k]),
      );
      assert.deepEqual(changed, [], "discarding a draft moved something else");
      assert.deepEqual(
        revalidations,
        [],
        "discarding a draft busted a public cache",
      );
      assert.equal(count("PageVersion"), 0);
      assert.equal(all("PageAuditLog")[0].action, "draft.discard");
    },
  );

  await scenario(
    "discardDraftContent is idempotent when there is nothing pending",
    async () => {
      const before = copy(seedPage({ draft: null }));
      const res = await discardDraftContent(PAGE_ID, token(before));
      assert.equal(res.ok, true, res.error);
      assert.equal(row().draft, null);
    },
  );

  // ── item F: a draft must not leave the database on a public read ──────────

  await scenario(
    "getPageBuilderPageBySlug (public) never returns the draft",
    async () => {
      seedPage({ status: "published", draft: draftContent({ title: MARKER }) });
      const got = await getPageBuilderPageBySlug("real-slug");
      assert.ok(got, "fixture did not resolve");
      assert.equal(
        "draft" in got,
        false,
        "the public read carried a draft key",
      );
      assert.ok(
        !JSON.stringify(got).includes(MARKER),
        "the draft body leaked through the public read",
      );
    },
  );

  await scenario(
    "getActiveBuilderPromotions never returns the draft",
    async () => {
      seedPage({
        status: "published",
        pageType: "promotion",
        promotionCover: "https://x/live.png",
        draft: draftContent({ title: MARKER }),
      });
      const got = await getActiveBuilderPromotions();
      assert.equal(
        got.length,
        1,
        "fixture did not survive the visibility gate",
      );
      assert.equal(
        "draft" in got[0],
        false,
        "the promotions grid read carried a draft key",
      );
      assert.ok(
        !JSON.stringify(got).includes(MARKER),
        "the draft body leaked into the promotions grid",
      );
    },
  );

  await scenario(
    "getActiveBuilderPromotions still returns what the card needs",
    async () => {
      // The projection is only safe if it is COMPLETE — a narrower one blanks the
      // grid instead of leaking, which is a different failure, not a fix.
      seedPage({
        status: "published",
        pageType: "promotion",
        promotionOrder: 3,
        promotionCover: "https://x/live.png",
        draft: draftContent(),
      });
      const [got] = await getActiveBuilderPromotions();
      for (const key of [
        "_id",
        "slug",
        "title",
        "pageType",
        "status",
        "promotionOrder",
        "promotionCover",
        "createdAt",
      ]) {
        assert.ok(
          key in got,
          `the projection dropped ${key}, which the grid reads`,
        );
      }
    },
  );

  await scenario(
    "CONTROL: the any-status reader still DOES carry the draft",
    async () => {
      // The strip is targeted, not global. /preview/[slug] and previewAccess share
      // this reader and are allowed to see a draft — round 3 makes preview render
      // it. If this ever passes by stripping, the preview feature is broken.
      seedPage({ status: "published", draft: draftContent({ title: MARKER }) });
      const got = await getPageBuilderPageBySlugAny("real-slug");
      assert.ok(
        JSON.stringify(got).includes(MARKER),
        "the any-status reader lost the draft",
      );
    },
  );

  // ── item H: a duplicate must not inherit a pending draft ──────────────────

  await scenario(
    "duplicatePageBuilderPage does not copy the source draft",
    async () => {
      seedPage({ status: "published", draft: draftContent({ title: MARKER }) });
      const res = await duplicatePageBuilderPage(PAGE_ID);
      assert.equal(res.ok, true, res.error);

      const dupe = all("PageBuilder").find((p) => String(p._id) !== PAGE_ID);
      assert.ok(dupe, "no copy was created");
      assert.equal(
        dupe.draft,
        undefined,
        "the copy inherited the source draft",
      );
      assert.ok(
        !JSON.stringify(dupe).includes(MARKER),
        "the draft body reached the copy",
      );
      // The source keeps its own draft — the strip is on the copy, not a move.
      assert.equal(
        row().draft.title,
        MARKER,
        "duplicating stole the source page draft",
      );
    },
  );

  // ══ ROUND 3: identity writes, and retiring the list's old publish path ══
  //
  // These live inside the SAME parent test as everything above, and that is
  // load-bearing rather than tidy: a second file with its own root test would
  // run CONCURRENTLY with this one (run() uses concurrency:true) while sharing
  // the one module-level fake database, and the two would reset each other's
  // fixtures mid-flight. One parent, one sequence, one owner of the fake db.

  await scenario(
    "updatePageIdentity changes exactly the four keys, and nothing else",
    async () => {
      const before = copy(seedPage({ draft: draftContent() }));
      const res = await updatePageIdentity(
        PAGE_ID,
        {
          slug: "renamed-slug",
          pageType: "promotion",
          promotionId: "PROMO-9",
          promotionOrder: 4,
        },
        token(before),
      );
      assert.equal(res.ok, true, res.error);

      const after = row();
      assert.equal(after.slug, "renamed-slug");
      assert.equal(after.pageType, "promotion");
      assert.equal(after.promotionId, "PROMO-9");
      assert.equal(after.promotionOrder, 4);

      // EXACT set of what moved — never a sample. slugHistory is here because
      // this call renamed; the case below pins that it stays put when it does not.
      const moved = Object.keys(after)
        .filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]))
        .sort();
      assert.deepEqual(
        moved,
        [
          "pageType",
          "promotionId",
          "promotionOrder",
          "slug",
          "slugHistory",
          "updatedAt",
        ],
        "an identity update moved fields outside its four keys",
      );
    },
  );

  await scenario(
    "updatePageIdentity leaves slugHistory alone when the slug does not change",
    async () => {
      const before = copy(seedPage({ slugHistory: ["older-slug"] }));
      const res = await updatePageIdentity(
        PAGE_ID,
        {
          slug: before.slug,
          pageType: "general",
          promotionId: "",
          promotionOrder: 7,
        },
        token(before),
      );
      assert.equal(res.ok, true, res.error);
      assert.deepEqual(
        row().slugHistory,
        ["older-slug"],
        "a non-rename rewrote slugHistory",
      );
      assert.equal(row().promotionOrder, 7);
    },
  );

  await scenario(
    "a rename retires the old slug and never leaves the new one in history",
    async () => {
      const before = copy(
        seedPage({
          slug: "first-slug",
          slugHistory: ["renamed-slug", "older"],
        }),
      );
      const res = await updatePageIdentity(
        PAGE_ID,
        {
          slug: "renamed-slug",
          pageType: "general",
          promotionId: "",
          promotionOrder: 0,
        },
        token(before),
      );
      assert.equal(res.ok, true, res.error);
      // Deduped, old slug added, NEW slug removed — a 301 that resolved to itself
      // would loop. Exact set, order-independent.
      assert.deepEqual(
        [...row().slugHistory].sort(),
        ["first-slug", "older"],
        "slugHistory is wrong after the rename",
      );
    },
  );

  await scenario(
    "a draft survives an identity rename byte-identical",
    async () => {
      const pending = draftContent({ title: MARKER });
      const before = copy(seedPage({ status: "published", draft: pending }));
      const res = await updatePageIdentity(
        PAGE_ID,
        {
          slug: "renamed-slug",
          pageType: "general",
          promotionId: "",
          promotionOrder: 0,
        },
        token(before),
      );
      assert.equal(res.ok, true, res.error);
      assert.deepEqual(
        row().draft,
        copy(pending),
        "the pending draft was disturbed by a rename",
      );
      assert.equal(count("PageVersion"), 0, "an identity update snapshotted");
    },
  );

  await scenario(
    "a rename revalidates BOTH the old and the new public URL",
    async () => {
      // No existing test covered this call shape — the whole-page save has the
      // same `bustCaches(updated, existing.slug)` line and nothing asserted it.
      // Missing the OLD slug leaves the previous URL serving from cache.
      const before = copy(seedPage({ slug: "first-slug" }));
      await updatePageIdentity(
        PAGE_ID,
        {
          slug: "renamed-slug",
          pageType: "general",
          promotionId: "",
          promotionOrder: 0,
        },
        token(before),
      );
      const paths = revalidations
        .filter((c) => c.kind === "path")
        .map((c) => c.path)
        .sort();
      assert.deepEqual(paths, ["/admin/pages", "/first-slug", "/renamed-slug"]);
      assert.deepEqual(
        revalidations.filter((c) => c.kind === "tag").map((c) => c.tag),
        ["page-builder"],
      );
    },
  );

  await scenario(
    "a promotion rename also revalidates /promotions",
    async () => {
      const before = copy(
        seedPage({ slug: "first-slug", pageType: "promotion" }),
      );
      await updatePageIdentity(
        PAGE_ID,
        {
          slug: "renamed-slug",
          pageType: "promotion",
          promotionId: "",
          promotionOrder: 0,
        },
        token(before),
      );
      const paths = revalidations
        .filter((c) => c.kind === "path")
        .map((c) => c.path)
        .sort();
      assert.deepEqual(paths, [
        "/admin/pages",
        "/first-slug",
        "/promotions",
        "/renamed-slug",
      ]);
    },
  );

  await scenario(
    "updatePageIdentity rejects a slug already taken by another builder page",
    async () => {
      const before = copy(seedPage());
      seed("PageBuilder", {
        _id: "other",
        slug: "taken-slug",
        title: "Other",
        status: "draft",
        slugHistory: [],
      });
      const res = await updatePageIdentity(
        PAGE_ID,
        {
          slug: "taken-slug",
          pageType: "general",
          promotionId: "",
          promotionOrder: 0,
        },
        token(before),
      );
      assert.equal(res.ok, false, "a colliding slug was accepted");
      assert.equal(res.error, "Slug นี้ถูกใช้แล้ว");
      assert.equal(
        row().slug,
        "real-slug",
        "the page was renamed despite the collision",
      );
    },
  );

  await scenario(
    "CONTROL: the same slug on the page ITSELF is not a collision",
    async () => {
      // excludeBuilderId is what makes this true; without it every save of an
      // unchanged slug would report a collision with itself.
      const before = copy(seedPage());
      const res = await updatePageIdentity(
        PAGE_ID,
        {
          slug: before.slug,
          pageType: "general",
          promotionId: "",
          promotionOrder: 0,
        },
        token(before),
      );
      assert.equal(
        res.ok,
        true,
        `a page collided with its own slug: ${res.error}`,
      );
    },
  );

  await scenario(
    "updatePageIdentity rejects a slug already taken by a CustomPage",
    async () => {
      const before = copy(seedPage());
      seed("CustomPage", { _id: "cp1", slug: "taken-slug", slugHistory: [] });
      const res = await updatePageIdentity(
        PAGE_ID,
        {
          slug: "taken-slug",
          pageType: "general",
          promotionId: "",
          promotionOrder: 0,
        },
        token(before),
      );
      assert.equal(res.ok, false, "the cross-collection guard did not run");
      assert.equal(res.error, "Slug นี้ถูกใช้แล้ว");
    },
  );

  await scenario(
    "a PROMOTION page also gets the /promotions namespace guard",
    async () => {
      const before = copy(seedPage());
      seed("PromotionConfig", { _id: "pc1", url_slug: "promo-taken" });
      const res = await updatePageIdentity(
        PAGE_ID,
        {
          slug: "promo-taken",
          pageType: "promotion",
          promotionId: "",
          promotionOrder: 0,
        },
        token(before),
      );
      assert.equal(
        res.ok,
        false,
        "a promotion page took a slug an MSDB promotion already claims",
      );
      assert.equal(row().slug, "real-slug");
    },
  );

  await scenario(
    "CONTROL: the promotion guard is SCOPED — a general page may use that slug",
    async () => {
      // Proves the case above is the scoped guard firing and not the general one.
      // Same fixture, same slug, only pageType differs.
      const before = copy(seedPage());
      seed("PromotionConfig", { _id: "pc1", url_slug: "promo-taken" });
      const res = await updatePageIdentity(
        PAGE_ID,
        {
          slug: "promo-taken",
          pageType: "general",
          promotionId: "",
          promotionOrder: 0,
        },
        token(before),
      );
      assert.equal(
        res.ok,
        true,
        `the promotion guard leaked onto a general page: ${res.error}`,
      );
      assert.equal(row().slug, "promo-taken");
    },
  );

  await scenario(
    "updatePageIdentity rejects a malformed slug and a stale token",
    async () => {
      const before = copy(seedPage());
      const bad = await updatePageIdentity(
        PAGE_ID,
        {
          slug: "NOT A SLUG!!",
          pageType: "general",
          promotionId: "",
          promotionOrder: 0,
        },
        token(before),
      );
      assert.equal(bad.ok, false);
      assert.match(bad.error, /^slug:/);

      const stale = new Date(
        new Date(before.updatedAt).getTime() - 5000,
      ).toISOString();
      const conflicted = await updatePageIdentity(
        PAGE_ID,
        {
          slug: "renamed-slug",
          pageType: "general",
          promotionId: "",
          promotionOrder: 0,
        },
        stale,
      );
      assert.equal(conflicted.conflict, true);
      assert.equal(row().slug, "real-slug");
    },
  );

  // ── the regression the admin-list repoint fixes ───────────────────────────

  await scenario(
    "THE TRAP: updatePageStatus snapshots the pending draft (unchanged)",
    async () => {
      // This is the OLD list path, pinned rather than fixed. It is why the toggle
      // moved, and pinning it stops anyone wiring it back up thinking it is safe.
      // updatePageStatus itself is untouched by this round — this documents its
      // behaviour, it does not change it.
      seedPage({ status: "draft", draft: draftContent({ title: MARKER }) });
      const res = await updatePageStatus(PAGE_ID, "published");
      assert.equal(res.ok, true, res.error);

      const [version] = all("PageVersion");
      assert.equal(
        "draft" in version.snapshot,
        true,
        "the trap is gone — update the comment that describes it",
      );
      assert.equal(
        version.snapshot.draft.title,
        MARKER,
        "the unpublished edit is in the archive",
      );
      // And it did NOT promote: the live page went public with the stale content
      // while the archive recorded the new. Wrong in both directions at once.
      assert.equal(
        row().title,
        "Live Title",
        "updatePageStatus started promoting drafts",
      );
      assert.equal(
        row().draft.title,
        MARKER,
        "updatePageStatus started clearing drafts",
      );
    },
  );

  await scenario(
    "THE FIX: publishPageStatus on the SAME fixture snapshots no draft",
    async () => {
      // Byte-for-byte the same starting page as the case above; only the action
      // differs. That is the whole of what the admin-list repoint buys.
      const before = copy(
        seedPage({ status: "draft", draft: draftContent({ title: MARKER }) }),
      );
      const res = await publishPageStatus(
        PAGE_ID,
        {
          status: "published",
          publishStartDate: before.publishStartDate,
          publishEndDate: before.publishEndDate,
        },
        token(before),
      );
      assert.equal(res.ok, true, res.error);

      const [version] = all("PageVersion");
      assert.equal(
        "draft" in version.snapshot,
        false,
        "the snapshot carries a draft key",
      );
      assert.equal(
        version.snapshot.title,
        MARKER,
        "the promoted content is what was archived",
      );
      assert.equal(row().title, MARKER, "the draft was not promoted");
      assert.equal(row().draft, null, "the draft was not cleared");
    },
  );

  await scenario(
    "the list toggle passes the window through, so a schedule is not wiped",
    async () => {
      // publishPageStatus validates the WHOLE window and both dates default to
      // null when absent — so a toggle that omitted them would silently clear a
      // scheduled page's dates. The list reads whole documents and passes both.
      const start = "2026-09-01T00:00:00.000Z";
      const end = "2026-09-30T00:00:00.000Z";
      const before = copy(
        seedPage({
          status: "scheduled",
          publishStartDate: start,
          publishEndDate: end,
        }),
      );
      const res = await publishPageStatus(
        PAGE_ID,
        {
          status: "published",
          publishStartDate: before.publishStartDate,
          publishEndDate: before.publishEndDate,
        },
        token(before),
      );
      assert.equal(res.ok, true, res.error);
      assert.equal(
        new Date(row().publishStartDate).toISOString(),
        start,
        "the schedule start was wiped",
      );
      assert.equal(
        new Date(row().publishEndDate).toISOString(),
        end,
        "the schedule end was wiped",
      );
    },
  );

  await scenario(
    "CONTROL: omitting the window IS what would wipe it",
    async () => {
      // Proves the case above is the pass-through doing the work, not the action
      // happening to preserve dates on its own.
      const before = copy(
        seedPage({
          status: "scheduled",
          publishStartDate: "2026-09-01T00:00:00.000Z",
          publishEndDate: "2026-09-30T00:00:00.000Z",
        }),
      );
      const res = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(before),
      );
      assert.equal(res.ok, true, res.error);
      assert.equal(
        row().publishStartDate,
        null,
        "omitting the window no longer clears it",
      );
      assert.equal(row().publishEndDate, null);
    },
  );

  await scenario(
    "updatePageStatus still has NO conflict check — unchanged, and why it is unused",
    async () => {
      // Pinned because the function now has no caller, and an uncalled function
      // is exactly the one that rots unnoticed. It takes no token at all.
      seedPage({ status: "draft" });
      assert.equal(
        updatePageStatus.length,
        2,
        "updatePageStatus grew or lost a parameter",
      );
      const res = await updatePageStatus(PAGE_ID, "published");
      assert.equal(res.ok, true, "it stopped working");
      assert.deepEqual(
        Object.keys(res).sort(),
        ["ok", "status"],
        "its return shape changed",
      );
      assert.equal(row().status, "published");
    },
  );

  // ══ ROUND 4: creating a page puts its content in the DRAFT ══════════════
  //
  // HARNESS LIMIT, stated because it shapes what these can claim: the fake does
  // not apply Mongoose defaults, so a content field the create simply does not
  // write is ABSENT here where production would show the schema default. That
  // is the claim anyway — "not written live" — so the assertions below check
  // absence rather than a defaulted value.

  await scenario(
    "creating a page stores the authored content in .draft, not live",
    async () => {
      const authored = {
        slug: "fresh-slug",
        title: "Authored Title",
        pageType: "general",
        promotionId: "",
        promotionOrder: 0,
        ...draftContent({ title: "Authored Title" }),
      };
      const res = await createPageBuilderPage(authored);
      assert.equal(res.ok, true, res.error);

      const doc = all("PageBuilder").find((p) => p.slug === "fresh-slug");
      assert.ok(doc, "no document was created");

      // The eight content keys other than `title` are not written live at all.
      for (const key of DRAFT_CONTENT_KEYS) {
        if (key === "title") continue;
        assert.equal(
          key in doc,
          false,
          `${key} was written to the LIVE document on create`,
        );
      }
      // `title` is the documented exception — the model requires it.
      assert.equal(doc.title, "Authored Title");

      // …and the whole authored content half is in the draft.
      assert.deepEqual(
        Object.keys(doc.draft).sort(),
        [...DRAFT_CONTENT_KEYS, "savedAt", "savedBy"].sort(),
      );
      assert.equal(doc.draft.theme, "ai_purple");
      assert.equal(doc.draft.title, "Authored Title");
      assert.deepEqual(
        doc.draft.sections.map((s) => s.type),
        ["rich_text"],
      );
    },
  );

  await scenario(
    "creating a page NEVER publishes it, whatever the input says",
    async () => {
      const res = await createPageBuilderPage({
        slug: "fresh-slug",
        title: "T",
        pageType: "general",
        promotionId: "",
        promotionOrder: 0,
        status: "published", // the editor's local state can say anything
        ...draftContent({ title: "T" }),
      });
      assert.equal(res.ok, true, res.error);
      const doc = all("PageBuilder").find((p) => p.slug === "fresh-slug");
      assert.equal(doc.status, "draft", "a create published the page directly");
      assert.equal(
        count("PageVersion"),
        0,
        "a create wrote a snapshot; only a publish may",
      );
    },
  );

  await scenario(
    "CONTROL: the same input DOES publish through publishPageStatus",
    async () => {
      // Proves the case above is create refusing to publish, not the fixture being
      // unpublishable. Same page, one extra call, and now it is live.
      const created = await createPageBuilderPage({
        slug: "fresh-slug",
        title: "T",
        pageType: "general",
        promotionId: "",
        promotionOrder: 0,
        ...draftContent({ title: "T" }),
      });
      assert.equal(created.ok, true, created.error);
      const res = await publishPageStatus(
        created.id,
        { status: "published" },
        created.updatedAt,
      );
      assert.equal(res.ok, true, res.error);
      const doc = all("PageBuilder").find(
        (p) => String(p._id) === String(created.id),
      );
      assert.equal(doc.status, "published");
      assert.equal(
        doc.title,
        "T",
        "the draft was not promoted onto the live fields",
      );
      assert.equal(doc.draft, null);
      assert.equal(
        count("PageVersion"),
        1,
        "the first publish did not snapshot",
      );
    },
  );

  await scenario(
    "a created draft goes through the SAME tier gate every later save does",
    async () => {
      // Otherwise this would be the one authored payload in the system that never
      // met sanitizePageForTier — and it would be the first one.
      setSessionUser({ id: "u2", name: "Editor", tier: "editor" });
      const res = await createPageBuilderPage({
        slug: "fresh-slug",
        title: "T",
        pageType: "general",
        promotionId: "",
        promotionOrder: 0,
        ...draftContent({
          title: "T",
          sections: [
            section("keep", "rich_text"),
            section("adv", "custom_html"),
          ],
        }),
      });
      assert.equal(res.ok, true, res.error);
      const doc = all("PageBuilder").find((p) => p.slug === "fresh-slug");
      assert.deepEqual(
        doc.draft.sections.map((s) => s.type),
        ["rich_text"],
        "an editor smuggled an advanced section into a brand-new page draft",
      );
      assert.deepEqual(
        doc.draft.sections.map((s) => s.sortOrder),
        [0],
        "sortOrder was not renumbered",
      );
    },
  );

  await scenario(
    "CONTROL: a developer creating the same page KEEPS the advanced section",
    async () => {
      setSessionUser({ id: "u1", name: "Dev", tier: "developer" });
      const res = await createPageBuilderPage({
        slug: "fresh-slug",
        title: "T",
        pageType: "general",
        promotionId: "",
        promotionOrder: 0,
        ...draftContent({
          title: "T",
          sections: [
            section("keep", "rich_text"),
            section("adv", "custom_html"),
          ],
        }),
      });
      assert.equal(res.ok, true, res.error);
      const doc = all("PageBuilder").find((p) => p.slug === "fresh-slug");
      assert.deepEqual(
        doc.draft.sections.map((s) => s.type),
        ["rich_text", "custom_html"],
      );
    },
  );

  await scenario(
    "a create returns the token the editor needs for its next save",
    async () => {
      const res = await createPageBuilderPage({
        slug: "fresh-slug",
        title: "T",
        pageType: "general",
        promotionId: "",
        promotionOrder: 0,
        ...draftContent({ title: "T" }),
      });
      assert.equal(res.ok, true, res.error);
      assert.ok(res.id, "no id came back to adopt");
      assert.ok(
        res.updatedAt,
        "no token came back; the first autosave would be rejected",
      );
      // And that token actually works against the very next save.
      const next = await saveDraftContent(
        res.id,
        draftContent({ title: "Second" }),
        res.updatedAt,
      );
      assert.equal(
        next.ok,
        true,
        `the create token was rejected: ${next.error}`,
      );
    },
  );

  // ══ ROUND 5: discard, reached from the top bar's confirm ════════════════

  await scenario(
    "discardDraftContent takes the CURRENT token and returns a fresh one",
    async () => {
      // The top bar's confirm calls round 4's discard(), which passes tokenRef —
      // the same one-per-document token every other action uses. A stale token
      // must be refused here exactly as it is on a save.
      const before = copy(
        seedPage({
          status: "published",
          draft: draftContent({ title: MARKER }),
        }),
      );
      const stale = new Date(
        new Date(before.updatedAt).getTime() - 5000,
      ).toISOString();
      const refused = await discardDraftContent(PAGE_ID, stale);
      assert.equal(refused.conflict, true, "a stale token was accepted");
      assert.equal(
        row().draft.title,
        MARKER,
        "a refused discard still threw the draft away",
      );

      const res = await discardDraftContent(PAGE_ID, token(before));
      assert.equal(res.ok, true, res.error);
      assert.equal(row().draft, null);
      assert.ok(res.updatedAt, "no fresh token came back");
      assert.notEqual(
        res.updatedAt,
        token(before),
        "the token did not advance",
      );
    },
  );

  await scenario(
    "a discard returns NO content payload — the reload is what restores the view",
    async () => {
      // Round 4 J: the response deliberately carries no live content, which is why
      // discard() reloads the route instead of rebuilding the tree client-side.
      // If this ever grows a payload, that decision should be revisited on purpose.
      const before = copy(
        seedPage({ status: "published", draft: draftContent() }),
      );
      const res = await discardDraftContent(PAGE_ID, token(before));
      assert.deepEqual(Object.keys(res).sort(), ["ok", "updatedAt"]);
    },
  );

  await scenario(
    "after a discard the live content is what remains",
    async () => {
      const before = copy(
        seedPage({
          status: "published",
          draft: draftContent({ title: MARKER }),
        }),
      );
      await discardDraftContent(PAGE_ID, token(before));
      const after = row();
      assert.equal(
        after.title,
        "Live Title",
        "the discard disturbed the live content",
      );
      assert.equal(after.draft, null);
      assert.equal(count("PageVersion"), 0, "a discard wrote a snapshot");
    },
  );

  // ── getPageVersionSnapshot — round 34, commit 1 ───────────────────────────
  //
  // THE EXECUTED HALF LIVES HERE, NOT IN ITS OWN FILE, AND THAT IS FORCED.
  // test/run.mjs uses `isolation: 'none', concurrency: true`, so root-level
  // tests in DIFFERENT files run concurrently in one process over this file's
  // module-level fake database. A second fakeDb-owning root test resets this
  // one's fixtures mid-flight — measured, not feared: it reddened eight cases
  // here on the first attempt. The header note above explains the within-file
  // half of the same hazard. There is exactly ONE fakeDb-owning parent in the
  // suite, and it is this one.
  //
  // The SHAPE half — that getPageVersions' projection is still refusing the
  // snapshot — is source-scanned in test/fs/pageBuilderVersionSnapshot, which
  // touches no database and is therefore safe as a root test.

  const VERSION_ID = "v-restore-me";
  const OTHER_VERSION_ID = "v-not-this-one";

  /** A snapshot in the shape publishPageStatus stores: a whole page, no draft. */
  const snapshotDoc = (overrides = {}) => ({
    _id: PAGE_ID,
    slug: "live-slug",
    title: "Snapshot Title",
    status: "published",
    theme: "default",
    showHeader: true,
    showFooter: true,
    showStickyCta: false,
    sections: [section("s-snap")],
    seo: { metaTitle: "snapshot meta" },
    jsonLd: { mode: "auto" },
    promotionCover: "",
    ...overrides,
  });

  const seedVersion = (id, overrides = {}) =>
    seed("PageVersion", {
      _id: id,
      pageId: PAGE_ID,
      snapshot: snapshotDoc(),
      label: "publish",
      actor: { id: "u-pub", name: "Publisher B" },
      createdAt: new Date("2026-08-01T03:00:00.000Z"),
      ...overrides,
    });

  await scenario(
    "getPageVersionSnapshot returns ONE version, not a list",
    async () => {
      seedPage();
      seedVersion(VERSION_ID);
      seedVersion(OTHER_VERSION_ID, {
        snapshot: snapshotDoc({ title: "The Other One" }),
      });

      const got = await getPageVersionSnapshot(VERSION_ID);
      assert.equal(
        Array.isArray(got),
        false,
        "the fetch-one action returned a list",
      );
      assert.ok(got, "no row came back");
      assert.equal(
        got.snapshot.title,
        "Snapshot Title",
        "the wrong version came back",
      );
      assert.equal(got.label, "publish");
      assert.equal(got.actor.name, "Publisher B");
      assert.ok(got.createdAt, "createdAt did not survive the read");
    },
  );

  await scenario(
    "CONTROL: the OTHER version is reachable by ITS id",
    async () => {
      // Without this, the case above passes for an action that ignores its
      // argument and hands back whichever row it finds first.
      seedPage();
      seedVersion(VERSION_ID);
      seedVersion(OTHER_VERSION_ID, {
        snapshot: snapshotDoc({ title: "The Other One" }),
      });

      const got = await getPageVersionSnapshot(OTHER_VERSION_ID);
      assert.equal(
        got.snapshot.title,
        "The Other One",
        "the id argument is not being honoured",
      );
    },
  );

  await scenario(
    "a missing id and a missing row both answer null, not a throw",
    async () => {
      seedPage();
      seedVersion(VERSION_ID);
      assert.equal(
        await getPageVersionSnapshot(""),
        null,
        "an empty id did not answer null",
      );
      assert.equal(
        await getPageVersionSnapshot("v-deleted"),
        null,
        "a missing row did not answer null",
      );
    },
  );

  await scenario(
    "the fetch-one read NEVER hands back a draft — even when the row carries one",
    async () => {
      // A row in the shape updatePageStatus wrote before round 3 retired it: it
      // snapshots doc.toObject() RAW, so a pending edit went into the archive.
      // THE TRAP case above pins that writer's behaviour; this pins that the READ
      // refuses to hand it back. Measured read-only against the real database
      // before this was written: 0 of 3 stored rows carry one today, so nothing
      // is being repaired — but both writers are still in the action file.
      seedPage();
      seedVersion(VERSION_ID, {
        snapshot: snapshotDoc({ draft: { title: MARKER, sections: [] } }),
      });

      const got = await getPageVersionSnapshot(VERSION_ID);
      assert.equal(
        "draft" in got.snapshot,
        false,
        "the read handed back an unpublished draft",
      );
      assert.equal(
        got.snapshot.title,
        "Snapshot Title",
        "stripping the draft took the content with it",
      );
    },
  );

  await scenario(
    "CONTROL: that fixture really was carrying a draft",
    async () => {
      // Proves the assertion above is observable rather than vacuous — the stored
      // row must actually be in the state the assertion rules out.
      seedPage();
      seedVersion(VERSION_ID, {
        snapshot: snapshotDoc({ draft: { title: MARKER, sections: [] } }),
      });
      const [stored] = all("PageVersion");
      assert.equal(
        "draft" in stored.snapshot,
        true,
        "the fixture was not in the state under test",
      );
      assert.equal(stored.snapshot.draft.title, MARKER);
    },
  );

  await scenario(
    "stripping the draft is not a rewrite — every other key survives",
    async () => {
      seedPage();
      seedVersion(VERSION_ID, { snapshot: snapshotDoc({ draft: null }) });
      const got = await getPageVersionSnapshot(VERSION_ID);
      assert.equal("draft" in got.snapshot, false);
      for (const key of Object.keys(snapshotDoc())) {
        assert.ok(key in got.snapshot, `stripping the draft dropped ${key}`);
      }
    },
  );

  // ── version NUMBERS — round 35, commit 1 ──────────────────────────────────
  //
  // Still inside this one parent, for gate item 5's reason: the runner is
  // isolation:'none' with concurrency:true, so a second fakeDb-owning root test
  // resets this one's fixtures mid-flight. Extending the owner is the only
  // shape available, and round 34 measured what happens otherwise.

  /** The numbers on a page's version rows, oldest row first. */
  const versionNumbers = () =>
    all("PageVersion")
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((v) => v.versionNumber);

  await scenario(
    "a publish increments the page counter and stamps the row",
    async () => {
      const before = copy(seedPage({ status: "draft", draft: draftContent() }));
      assert.equal(
        before.publishedVersion,
        undefined,
        "precondition: the page has no counter yet",
      );

      const res = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(before),
      );
      assert.equal(res.ok, true, res.error);

      assert.equal(row().publishedVersion, 1, "the counter did not reach 1");
      assert.deepEqual(
        versionNumbers(),
        [1],
        "the snapshot was not stamped with the counter",
      );
    },
  );

  await scenario(
    "the number is the POST-increment value — the first version is 1, never 0",
    async () => {
      // $inc runs before the stamp is read off the result. A 0 in the data would
      // mean the stamp was taken from the pre-increment document, and
      // versionLabel refuses to render a 0 for exactly that reason.
      const before = copy(seedPage({ status: "draft", draft: draftContent() }));
      await publishPageStatus(PAGE_ID, { status: "published" }, token(before));
      const [first] = all("PageVersion");
      assert.equal(first.versionNumber, 1);
      assert.notEqual(
        first.versionNumber,
        0,
        "the stamp was read before the increment",
      );
    },
  );

  await scenario(
    "EVERY publish counts — a republish with no draft mints the next number",
    async () => {
      // Round 35's rule, chosen deliberately: one PageVersion row is one version
      // number, always. Round 2 already snapshots a same-status republish; if
      // that call did NOT increment, two rows would SHARE a number, which is a
      // worse failure than a number that moves for a no-op.
      const first = copy(
        seedPage({ status: "published", draft: draftContent() }),
      );
      const r1 = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(first),
      );
      assert.equal(r1.ok, true, r1.error);

      const second = row();
      assert.equal(
        second.draft,
        null,
        "precondition: the republish has NO draft pending",
      );
      assert.equal(
        second.status,
        "published",
        "precondition: already published",
      );

      const r2 = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(second),
      );
      assert.equal(r2.ok, true, r2.error);

      assert.equal(
        count("PageVersion"),
        2,
        "precondition: round 2 still snapshots a republish",
      );
      assert.deepEqual(
        versionNumbers(),
        [1, 2],
        "a republish reused or skipped a number",
      );
      assert.equal(row().publishedVersion, 2);
    },
  );

  await scenario(
    "CONTROL: the numbers are DISTINCT, so a shared number would be caught",
    () => {
      // Without this, [1, 2] above could be read as "the assertion happens to
      // match"; this states the property the assertion is standing in for.
      assert.notDeepEqual([1, 2], [1, 1]);
      assert.equal(
        new Set([1, 1]).size,
        1,
        "a duplicated number would look distinct to a Set check",
      );
    },
  );

  for (const target of ["draft", "closed", "archived"]) {
    // eslint-disable-next-line no-await-in-loop
    await scenario(
      `a ${target} target does NOT increment and does NOT stamp`,
      async () => {
        const before = copy(
          seedPage({ status: "published", publishedVersion: 4 }),
        );
        const res = await publishPageStatus(
          PAGE_ID,
          { status: target },
          token(before),
        );
        assert.equal(res.ok, true, res.error);
        assert.equal(
          row().publishedVersion,
          4,
          `a ${target} target moved the counter`,
        );
        assert.equal(
          count("PageVersion"),
          0,
          `a ${target} target wrote a version row`,
        );
      },
    );
  }

  await scenario(
    "CONTROL: the same fixture DOES increment on a publish target",
    () => {
      // Proves the three cases above are about the branch, not about a fixture
      // that cannot increment at all.
      return (async () => {
        const before = copy(
          seedPage({ status: "published", publishedVersion: 4 }),
        );
        const res = await publishPageStatus(
          PAGE_ID,
          { status: "published" },
          token(before),
        );
        assert.equal(res.ok, true, res.error);
        assert.equal(
          row().publishedVersion,
          5,
          "the publish branch stopped incrementing",
        );
        assert.deepEqual(versionNumbers(), [5]);
      })();
    },
  );

  await scenario(
    "the counter survives history being deleted — it is not derived from it",
    async () => {
      // The reason the counter lives on the PAGE. Item 5b's GC is expected to
      // prune snapshots one day; a number derived from how many rows still exist
      // would start handing out numbers that had already been used.
      const before = copy(
        seedPage({ status: "published", draft: draftContent() }),
      );
      await publishPageStatus(PAGE_ID, { status: "published" }, token(before));
      await publishPageStatus(PAGE_ID, { status: "published" }, token(row()));
      assert.deepEqual(
        versionNumbers(),
        [1, 2],
        "precondition: two versions exist",
      );

      // Delete the whole history, as a GC would.
      const PageVersionModel = (await import("@/models/PageVersion")).default;
      await PageVersionModel.deleteMany({ pageId: PAGE_ID });
      assert.equal(count("PageVersion"), 0, "precondition: history is gone");

      const r3 = await publishPageStatus(
        PAGE_ID,
        { status: "published" },
        token(row()),
      );
      assert.equal(r3.ok, true, r3.error);
      assert.deepEqual(
        versionNumbers(),
        [3],
        "the number restarted after history was deleted",
      );
    },
  );

  await scenario(
    "CONTROL: a count()-derived number WOULD have repeated there",
    () => {
      // The same situation, priced under the rejected design. With the history
      // emptied, countDocuments is 0, so count()+1 is 1 — a number already used.
      const derived = (existingRowCount) => existingRowCount + 1;
      assert.equal(
        derived(0),
        1,
        "the derived design would mint 1 again after a GC",
      );
      assert.notEqual(
        derived(0),
        3,
        "and 3 is what the counter actually minted",
      );
    },
  );

  await scenario(
    "THE RACE: two publishes through the TOCTOU window get distinct numbers",
    async () => {
      /**
       * The measurement `$inc` was chosen for, exercised rather than asserted.
       *
       * publishPageStatus reads `existing` in a SEPARATE query before its write,
       * so two calls carrying the same token can both clear draftConflict and
       * both reach findByIdAndUpdate. Started together, they interleave at the
       * awaits between the read and the write, which is exactly that window.
       */
      const before = copy(seedPage({ status: "published" }));
      const sharedToken = token(before);
      const rowsBefore = count("PageVersion");
      assert.equal(rowsBefore, 0, "precondition: no history yet");

      const results = await Promise.all([
        publishPageStatus(PAGE_ID, { status: "published" }, sharedToken),
        publishPageStatus(PAGE_ID, { status: "published" }, sharedToken),
      ]);

      const landed = results.filter((r) => r?.ok);
      assert.equal(
        landed.length,
        2,
        "the window was NOT exercised — only one call landed, so this proves nothing about $inc",
      );

      const numbers = all("PageVersion")
        .map((v) => v.versionNumber)
        .sort();
      assert.equal(
        numbers.length,
        2,
        "one publish overwrote the other’s version row",
      );
      assert.deepEqual(
        numbers,
        [1, 2],
        "the racing publishes did not get distinct numbers",
      );
      assert.equal(new Set(numbers).size, 2, "the two numbers collided");
      assert.equal(row().publishedVersion, 2, "the counter did not reach 2");
    },
  );

  await scenario(
    "CONTROL: count()+1 would have handed BOTH racers the same number",
    async () => {
      // The discrimination for the case above. Both racers read the collection
      // before either wrote, so a derived design computes the same value twice —
      // and the unique index would then reject the second row, losing a snapshot.
      const before = copy(seedPage({ status: "published" }));
      const sharedToken = token(before);
      const seenByBothRacers = count("PageVersion"); // what each read would see
      const derived = (rowsSeen) => rowsSeen + 1;

      await Promise.all([
        publishPageStatus(PAGE_ID, { status: "published" }, sharedToken),
        publishPageStatus(PAGE_ID, { status: "published" }, sharedToken),
      ]);

      assert.equal(derived(seenByBothRacers), 1);
      assert.deepEqual(
        [derived(seenByBothRacers), derived(seenByBothRacers)],
        [1, 1],
        "the derived design is being credited with distinct numbers it cannot produce",
      );
      // …while what actually happened did not repeat.
      assert.deepEqual(
        all("PageVersion")
          .map((v) => v.versionNumber)
          .sort(),
        [1, 2],
      );
    },
  );

  await scenario(
    "a duplicate does NOT go unnoticed — snapshotVersion logs before it swallows",
    async () => {
      // The index is the backstop; this is what makes the backstop audible.
      // snapshotVersion must never fail a save, so it still swallows — but a
      // swallowed duplicate-key would mean a lost snapshot with no trace.
      const { snapshotVersion } = await import("@/lib/pages/pageAudit");
      const PageVersionModel = (await import("@/models/PageVersion")).default;
      const original = PageVersionModel.create;
      const errors = [];
      const spy = console.error;
      console.error = (...args) => errors.push(args.join(" "));
      PageVersionModel.create = async () => {
        throw new Error("E11000 duplicate key");
      };
      try {
        await snapshotVersion({
          pageId: PAGE_ID,
          snapshot: { title: "x" },
          label: "publish",
          versionNumber: 7,
        });
      } finally {
        PageVersionModel.create = original;
        console.error = spy;
      }
      assert.equal(
        errors.length,
        1,
        "a failed snapshot was swallowed with no trace",
      );
      assert.equal(
        errors[0].includes("E11000"),
        true,
        "the log does not carry the cause",
      );
      assert.equal(
        errors[0].includes("7"),
        true,
        "the log does not say which version was lost",
      );
    },
  );

  await scenario(
    "a duplicated page starts its own numbering at zero",
    async () => {
      // publishedVersion is destructured OUT of the copy. Left in, a duplicate of
      // a page at version 9 would mint version 10 as its FIRST publish.
      seedPage({ status: "published", publishedVersion: 9 });
      const res = await duplicatePageBuilderPage(PAGE_ID);
      assert.equal(res.ok, true, res.error);
      const copyDoc = all("PageBuilder").find((p) => String(p._id) !== PAGE_ID);
      assert.ok(copyDoc, "the duplicate was not created");
      assert.notEqual(
        copyDoc.publishedVersion,
        9,
        "the copy inherited the original’s counter",
      );
      assert.ok(
        copyDoc.publishedVersion === 0 ||
          copyDoc.publishedVersion === undefined,
        `the copy carries a counter of ${copyDoc.publishedVersion}`,
      );
    },
  );

  // ── /preview/[slug], DRIVEN — round 36, commit 1 ─────────────────────────
  //
  // Still inside this one parent (gate item 5 / round 34): the route calls the
  // real getPageBuilderPageBySlugAny, so it needs this file's fake database,
  // and a second fakeDb-owning root test resets these fixtures mid-flight.
  //
  // WHY DRIVEN AND NOT SOURCE-SCANNED. This is a PUBLIC route, and the claims
  // that matter are about what it renders in each state — which content reaches
  // the view, and which banner sits above it. A source scan cannot tell a gate
  // that RUNS from a gate that is merely present, and round 18's inert-control
  // rule applies to security gates before anything else.
  //
  // The component is async and returns an element tree, so it is CALLED rather
  // than rendered: PageBuilderView is itself async and renderToStaticMarkup
  // cannot await it. Reading the returned tree is the stronger assertion
  // anyway — the exact `page` object handed to the view is what a leak test
  // needs to see, and markup would only show its rendered residue.

  const PREVIEW = {
    enabled: true,
    passwordHash: "$2a$10$fakehashfortestingonly",
    passwordUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
    expireDate: null,
  };

  /** Walk a returned element tree and collect elements by their component name. */
  const flatten = (node, out = []) => {
    if (node == null || typeof node !== "object") return out;
    if (Array.isArray(node)) {
      for (const n of node) flatten(n, out);
      return out;
    }
    out.push(node);
    flatten(node.props?.children, out);
    return out;
  };
  const named = (tree, name) =>
    flatten(tree).find((el) => {
      const t = el?.type;
      return (
        typeof t === "function" && (t.name === name || t.displayName === name)
      );
    });

  /**
   * Drive the real route. `authed` mints a genuine cookie through the real
   * signPreviewCookie, so the gate is exercised rather than bypassed.
   */
  async function drivePreview({
    slug = "real-slug",
    mode,
    authed = true,
  } = {}) {
    process.env.AUTH_SECRET =
      process.env.AUTH_SECRET || "round36-preview-secret";
    const headers = await import("../stub-next-headers.mjs");
    const { signPreviewCookie, previewCookieName } =
      await import("@/lib/pageBuilder/previewSession");
    const { default: PreviewPage } =
      await import("@/app/(public)/preview/[slug]/page");

    const stored = row();
    if (authed && stored?.preview?.passwordHash) {
      const minted = signPreviewCookie(slug, stored.preview);
      headers.setCookies(
        minted ? { [previewCookieName(slug)]: minted.value } : {},
      );
    } else {
      headers.clearCookies();
    }
    try {
      return await PreviewPage({
        params: Promise.resolve({ slug }),
        searchParams: Promise.resolve(mode ? { mode } : {}),
      });
    } finally {
      headers.clearCookies();
    }
  }

  const bannerText = (tree) => {
    const banner = named(tree, "PreviewBanner");
    return banner ? banner.props : null;
  };
  const viewPage = (tree) =>
    named(tree, "PageBuilderView")?.props?.page ?? null;
  const gateState = (tree) => named(tree, "PreviewGate")?.props?.state ?? null;

  const { PREVIEW_BANNERS, previewBanner } =
    await import("@/lib/pageBuilder/previewMode");

  await scenario(
    "PRECONDITION: the gate refuses an unauthenticated request in BOTH modes",
    async () => {
      // The security property round 5 established, re-checked for the new mode:
      // no cookie means no content, and the published mode must not be a way
      // around it.
      seedPage({ status: "published", preview: PREVIEW, publishedVersion: 1 });
      seed("PageVersion", {
        _id: "pv1",
        pageId: PAGE_ID,
        snapshot: { title: "Live Title" },
        label: "publish",
        versionNumber: 1,
        actor: { id: "u1", name: "Publisher B" },
        createdAt: new Date("2026-08-20T02:00:00.000Z"),
      });
      for (const mode of [undefined, "published"]) {
        // eslint-disable-next-line no-await-in-loop
        const tree = await drivePreview({ mode, authed: false });
        assert.equal(
          gateState(tree),
          "locked",
          `mode ${mode ?? "draft"} served content with no cookie`,
        );
        assert.equal(
          viewPage(tree),
          null,
          `mode ${mode ?? "draft"} handed a page to the view unauthenticated`,
        );
      }
    },
  );

  await scenario(
    "STATE 1 — published, no pending draft: the live document, published banner",
    async () => {
      seedPage({
        status: "published",
        preview: PREVIEW,
        publishedVersion: 2,
        draft: null,
      });
      seed("PageVersion", {
        _id: "pv2",
        pageId: PAGE_ID,
        snapshot: { title: "archived copy" },
        label: "publish",
        versionNumber: 2,
        actor: { id: "u1", name: "Publisher B" },
        createdAt: new Date("2026-08-20T02:00:00.000Z"),
      });

      const tree = await drivePreview({ mode: "published" });
      assert.equal(
        gateState(tree),
        null,
        "a gate was returned for an authenticated request",
      );
      assert.equal(previewBanner(bannerText(tree)), PREVIEW_BANNERS.published);
      assert.equal(
        viewPage(tree).title,
        "Live Title",
        "the view did not get the live content",
      );
    },
  );

  await scenario(
    "STATE 2 — published WITH a pending draft: still the live document",
    async () => {
      // The leak test that matters most for this round. MARKER lives only in the
      // draft; if it reaches the published view, an unpublished edit is being
      // shown under a banner saying visitors are seeing it.
      seedPage({
        status: "published",
        preview: PREVIEW,
        publishedVersion: 2,
        draft: draftContent({ title: MARKER }),
      });
      seed("PageVersion", {
        _id: "pv2",
        pageId: PAGE_ID,
        snapshot: { title: "archived copy" },
        label: "publish",
        versionNumber: 2,
        actor: { id: "u1", name: "Publisher B" },
        createdAt: new Date("2026-08-20T02:00:00.000Z"),
      });

      const tree = await drivePreview({ mode: "published" });
      const shown = viewPage(tree);
      assert.equal(previewBanner(bannerText(tree)), PREVIEW_BANNERS.published);
      assert.equal(
        shown.title,
        "Live Title",
        "the published view rendered the draft",
      );
      assert.equal(
        "draft" in shown,
        false,
        "the draft key reached the rendered page object",
      );
      assert.equal(
        JSON.stringify(shown).includes(MARKER),
        false,
        "the draft leaked into the published view",
      );
    },
  );

  await scenario(
    "CONTROL: the DRAFT mode on that same page DOES show the draft",
    async () => {
      // Proves the leak assertion above is observable rather than vacuous — the
      // marker must be reachable through the other mode, on the same fixture.
      seedPage({
        status: "published",
        preview: PREVIEW,
        publishedVersion: 2,
        draft: draftContent({ title: MARKER }),
      });
      seed("PageVersion", {
        _id: "pv2",
        pageId: PAGE_ID,
        snapshot: {},
        label: "publish",
        versionNumber: 2,
        actor: { id: "u1", name: "Publisher B" },
        createdAt: new Date("2026-08-20T02:00:00.000Z"),
      });

      const tree = await drivePreview({ mode: undefined });
      const shown = viewPage(tree);
      assert.equal(
        shown.title,
        MARKER,
        "the draft mode stopped showing the draft",
      );
      assert.equal(
        previewBanner(bannerText(tree)),
        PREVIEW_BANNERS.draftPending,
      );
      // …and the LIVE content must not leak the other way either.
      assert.equal(
        JSON.stringify(shown).includes("Live Title"),
        false,
        "the published content leaked into the draft view",
      );
    },
  );

  await scenario(
    "STATE 3 — never published: a dead end, and no content at all",
    async () => {
      // createPageBuilderPage populates the LIVE fields at creation, so this page
      // HAS content where the published view reads from. Rendering it would claim
      // visitors are seeing something they have never been shown.
      seedPage({ status: "draft", preview: PREVIEW, draft: draftContent() });
      assert.equal(count("PageVersion"), 0, "precondition: no history");

      const tree = await drivePreview({ mode: "published" });
      assert.equal(gateState(tree), "unpublished");
      assert.equal(
        viewPage(tree),
        null,
        "a never-published page handed content to the view",
      );
    },
  );

  await scenario(
    "STATE 4 — closed after publishing: history survives, and so does the view",
    async () => {
      // A closed page still HAS a published version; it simply is not public any
      // more. The route shows it — the banner's claim is about the version, and
      // the author asked for it explicitly from an admin surface.
      seedPage({
        status: "closed",
        preview: PREVIEW,
        publishedVersion: 1,
        draft: null,
      });
      seed("PageVersion", {
        _id: "pv1",
        pageId: PAGE_ID,
        snapshot: {},
        label: "publish",
        versionNumber: 1,
        actor: { id: "u1", name: "Publisher B" },
        createdAt: new Date("2026-08-20T02:00:00.000Z"),
      });

      const tree = await drivePreview({ mode: "published" });
      assert.equal(
        gateState(tree),
        null,
        "a closed page was refused the published view",
      );
      assert.equal(viewPage(tree).title, "Live Title");
    },
  );

  await scenario(
    "the meta strip names version, time and publisher off the right sources",
    async () => {
      seedPage({
        status: "published",
        preview: PREVIEW,
        publishedVersion: 2,
        draft: null,
      });
      seed("PageVersion", {
        _id: "pv2",
        pageId: PAGE_ID,
        snapshot: {},
        label: "publish",
        versionNumber: 2,
        actor: { id: "u1", name: "Publisher B" },
        createdAt: new Date("2026-08-20T02:00:00.000Z"),
      });

      const meta = named(
        await drivePreview({ mode: "published" }),
        "PublishedMeta",
      );
      assert.ok(meta, "the meta strip did not render");
      assert.equal(
        meta.props.versionLabel,
        "เวอร์ชัน 2",
        "the number is not the live counter",
      );
      assert.equal(meta.props.publisher, "Publisher B");
      assert.equal(meta.props.publishedAt, "2026-08-20T02:00:00.000Z");
    },
  );

  await scenario(
    "an un-backfilled page OMITS the number and keeps the rest",
    async () => {
      // Round 35's rule, followed rather than re-decided: no counter, no number,
      // no placeholder — and the row's facts still stand because the drift the
      // trust rule guards against cannot be observed without both numbers.
      seedPage({ status: "published", preview: PREVIEW, draft: null });
      seed("PageVersion", {
        _id: "pv0",
        pageId: PAGE_ID,
        snapshot: {},
        label: "publish",
        versionNumber: null,
        actor: { id: "u1", name: "Publisher B" },
        createdAt: new Date("2026-08-20T02:00:00.000Z"),
      });

      const meta = named(
        await drivePreview({ mode: "published" }),
        "PublishedMeta",
      );
      assert.equal(
        meta.props.versionLabel,
        "",
        "a placeholder was rendered for a missing number",
      );
      assert.equal(meta.props.versionLabel.includes("undefined"), false);
      assert.equal(
        meta.props.publisher,
        "Publisher B",
        "the publisher was suppressed with the number",
      );
    },
  );

  await scenario(
    "THE DRIFT CASE: a slug renamed after the last publish",
    async () => {
      /**
       * The measurement that decides A.
       *
       * updatePageIdentity (round 3) writes slug/pageType/promotionId LIVE without
       * publishing, so a page renamed since its last publish has a live document
       * the newest snapshot does not match. The banner claims
       * "ผู้เข้าชมเว็บไซต์กำลังเห็นเวอร์ชันนี้" — a statement about NOW — so the
       * view must carry the identity the public is reading, not the archived one.
       *
       * PageBuilderView does not itself render a slug, so this is asserted on the
       * page object handed to it: that is where the difference between the two
       * candidate sources actually lives, and any later consumer (a canonical URL,
       * step 5's own metadata) reads it from there.
       */
      seedPage({
        slug: "renamed-after-publish",
        status: "published",
        preview: PREVIEW,
        publishedVersion: 1,
        draft: null,
      });
      seed("PageVersion", {
        _id: "pv-old",
        pageId: PAGE_ID,
        label: "publish",
        versionNumber: 1,
        actor: { id: "u1", name: "Publisher B" },
        createdAt: new Date("2026-08-20T02:00:00.000Z"),
        // The archived identity — what the page was called at publish time.
        snapshot: {
          slug: "slug-at-publish-time",
          title: "Live Title",
          pageType: "general",
        },
      });

      const shown = viewPage(
        await drivePreview({
          slug: "renamed-after-publish",
          mode: "published",
        }),
      );
      assert.equal(
        shown.slug,
        "renamed-after-publish",
        "the published view rendered the ARCHIVED identity — visitors are not seeing that page",
      );
      assert.equal(
        shown.slug === "slug-at-publish-time",
        false,
        "the snapshot identity reached the view",
      );
    },
  );

  await scenario(
    "CONTROL: the two identities really do differ on that fixture",
    async () => {
      // Without this, the assertion above passes for a fixture whose snapshot
      // happens to carry the same slug — i.e. for no drift at all.
      seedPage({
        slug: "renamed-after-publish",
        status: "published",
        preview: PREVIEW,
        publishedVersion: 1,
      });
      seed("PageVersion", {
        _id: "pv-old",
        pageId: PAGE_ID,
        label: "publish",
        versionNumber: 1,
        actor: { id: "u1", name: "Publisher B" },
        createdAt: new Date("2026-08-20T02:00:00.000Z"),
        snapshot: { slug: "slug-at-publish-time", title: "Live Title" },
      });
      const [archived] = all("PageVersion");
      assert.equal(row().slug, "renamed-after-publish");
      assert.equal(archived.snapshot.slug, "slug-at-publish-time");
      assert.notEqual(
        row().slug,
        archived.snapshot.slug,
        "the fixture has no drift to detect",
      );
    },
  );

  await scenario(
    "a row BEHIND the counter is not credited — a lost snapshot",
    async () => {
      // publishedVersion 4 with the newest surviving row at 3: that row belongs to
      // an earlier publish, so naming its actor would credit the wrong person.
      seedPage({
        status: "published",
        preview: PREVIEW,
        publishedVersion: 4,
        draft: null,
      });
      seed("PageVersion", {
        _id: "pv3",
        pageId: PAGE_ID,
        snapshot: {},
        label: "publish",
        versionNumber: 3,
        actor: { id: "u9", name: "Earlier Publisher" },
        createdAt: new Date("2026-08-01T02:00:00.000Z"),
      });

      const meta = named(
        await drivePreview({ mode: "published" }),
        "PublishedMeta",
      );
      assert.equal(
        meta.props.versionLabel,
        "เวอร์ชัน 4",
        "the number should still come from the live doc",
      );
      assert.equal(meta.props.publisher, "", "the wrong publisher was named");
      assert.equal(
        meta.props.publishedAt,
        null,
        "the wrong publish time was shown",
      );
    },
  );

  // ── DRAFT BACKUP — round 37, commit 1 ────────────────────────────────────
  //
  // Still inside this one parent (gate item 5 / round 34): these call the real
  // actions against this file's fake database.

  const backupRows = () => all("PageVersion").filter(isDraftBackup);

  await scenario(
    "a backup carries NO version number, and the row is labelled",
    async () => {
      const before = copy(
        seedPage({
          status: "published",
          publishedVersion: 2,
          draft: draftContent({ title: MARKER }),
        }),
      );
      const res = await backupDraftBeforeRestore(PAGE_ID, token(before));
      assert.equal(res.ok, true, res.error);
      assert.equal(
        res.backedUp,
        true,
        "a page with a draft reported nothing to back up",
      );

      const [row] = backupRows();
      assert.ok(row, "no backup row was written");
      assert.equal(row.label, DRAFT_BACKUP_LABEL);
      assert.equal(
        row.versionNumber,
        null,
        "a backup consumed a version number",
      );
      assert.equal(row.pageId, PAGE_ID);
    },
  );

  await scenario(
    "CONTROL: a numbered backup WOULD be a different row, and is refused by shape",
    () => {
      // The index behaviour itself is measured against a real Mongo index in
      // scripts/_probe-round37-index.mjs (two null rows accepted, a duplicate
      // number rejected with E11000). What is asserted here is the WRITER's
      // contract: it must never hand a number out.
      assert.equal(isDraftBackup({ label: DRAFT_BACKUP_LABEL }), true);
      assert.equal(isDraftBackup({ label: "publish" }), false);
      assert.equal(
        versionRowLabel({ label: DRAFT_BACKUP_LABEL, versionNumber: null }),
        "สำรองฉบับร่าง",
      );
      // …and a backup that HAD taken a number would render as a version, which is
      // the confusion the numberless rule exists to prevent.
      assert.equal(
        versionRowLabel({ label: "publish", versionNumber: 4 }),
        "เวอร์ชัน 4",
      );
    },
  );

  await scenario(
    "the backup stores exactly the nine DRAFT_CONTENT_KEYS — no stamps",
    async () => {
      // effectiveContent, not `existing.draft`: savedAt/savedBy are server-set and
      // are not content. Storing them would put them back into a snapshot that
      // the restore path then picks from.
      const before = copy(
        seedPage({
          status: "published",
          draft: draftContent({ title: MARKER }),
        }),
      );
      await backupDraftBeforeRestore(PAGE_ID, token(before));
      const [row] = backupRows();
      assert.deepEqual(
        Object.keys(row.snapshot).sort(),
        [...DRAFT_CONTENT_KEYS].sort(),
      );
      assert.equal(
        row.snapshot.title,
        MARKER,
        "the backup did not capture the draft",
      );
      for (const stamp of ["savedAt", "savedBy"]) {
        assert.equal(
          stamp in row.snapshot,
          false,
          `the backup carried the ${stamp} stamp`,
        );
      }
    },
  );

  await scenario(
    "the backup does NOT touch the draft, and leaves the token valid",
    async () => {
      // What makes two calls safe rather than a new race: page_versions and
      // page_builder_pages are different collections, so the page's updatedAt does
      // not move and the caller's expectedUpdatedAt still holds for the save that
      // follows.
      const before = copy(
        seedPage({
          status: "published",
          draft: draftContent({ title: MARKER }),
        }),
      );
      const tok = token(before);
      const res = await backupDraftBeforeRestore(PAGE_ID, tok);
      assert.equal(res.ok, true, res.error);

      const after = row();
      assert.equal(
        after.draft.title,
        MARKER,
        "the backup disturbed the draft it was preserving",
      );
      assert.equal(token(after), tok, "the backup moved the page token");

      // …and the follow-up save is accepted with the SAME token.
      const saved = await saveDraftContent(
        PAGE_ID,
        draftContent({ title: "Restored" }),
        tok,
      );
      assert.equal(saved.ok, true, saved.error);
      assert.equal(row().draft.title, "Restored");
    },
  );

  await scenario(
    "no draft to back up is a SUCCESS, and writes nothing",
    async () => {
      const before = copy(seedPage({ status: "published", draft: null }));
      const res = await backupDraftBeforeRestore(PAGE_ID, token(before));
      assert.equal(res.ok, true, res.error);
      assert.equal(res.backedUp, false, "an absent draft reported a backup");
      assert.equal(
        count("PageVersion"),
        0,
        "a row was written with nothing to preserve",
      );
    },
  );

  await scenario(
    "a stale token is refused — a backup is not the one write that skips the check",
    async () => {
      seedPage({ status: "published", draft: draftContent() });
      const res = await backupDraftBeforeRestore(
        PAGE_ID,
        "2020-01-01T00:00:00.000Z",
      );
      assert.equal(res.ok, false);
      assert.equal(
        res.conflict,
        true,
        "a stale backup was not reported as a conflict",
      );
      assert.equal(count("PageVersion"), 0);
    },
  );

  await scenario(
    "B — the ปัจจุบัน marker names the newest VERSION, never a backup",
    async () => {
      /**
       * The specific case round 37 was told to verify rather than reason about.
       * A backup is written at restore time and is therefore NEWER than the
       * publish it protects, so `rows[0]` — round 35's rule — would put the
       * live marker on a backup the first time any page restores.
       */
      seedPage({ status: "published", publishedVersion: 2 });
      seed("PageVersion", {
        _id: "pv-pub",
        pageId: PAGE_ID,
        snapshot: {},
        label: "publish",
        versionNumber: 2,
        actor: { id: "u1", name: "Publisher B" },
        createdAt: new Date("2026-08-20T02:00:00.000Z"),
      });
      seed("PageVersion", {
        _id: "pv-backup",
        pageId: PAGE_ID,
        snapshot: {},
        label: DRAFT_BACKUP_LABEL,
        versionNumber: null,
        actor: { id: "u2", name: "Restorer C" },
        createdAt: new Date("2026-08-27T02:00:00.000Z"),
      });

      const rows = await getPageVersions(PAGE_ID);
      assert.equal(
        rows[0]._id,
        "pv-backup",
        "precondition: the backup IS the newest row",
      );
      const newestVersion = rows.find((v) => !isDraftBackup(v));
      assert.equal(
        newestVersion._id,
        "pv-pub",
        "the newest VERSION is not the publish row",
      );
      assert.notEqual(
        newestVersion._id,
        rows[0]._id,
        "the fixture cannot distinguish the two rules — it proves nothing",
      );
    },
  );

  await scenario(
    "B — the PUBLIC published-version reader skips backups entirely",
    async () => {
      // The one that reaches a public page. Without the query filter it would name
      // the person who restored, at the moment they restored, as the publisher of
      // what visitors are reading.
      seedPage({
        status: "published",
        preview: PREVIEW,
        publishedVersion: 2,
        draft: null,
      });
      seed("PageVersion", {
        _id: "pv-pub",
        pageId: PAGE_ID,
        snapshot: {},
        label: "publish",
        versionNumber: 2,
        actor: { id: "u1", name: "Publisher B" },
        createdAt: new Date("2026-08-20T02:00:00.000Z"),
      });
      seed("PageVersion", {
        _id: "pv-backup",
        pageId: PAGE_ID,
        snapshot: {},
        label: DRAFT_BACKUP_LABEL,
        versionNumber: null,
        actor: { id: "u2", name: "Restorer C" },
        createdAt: new Date("2026-08-27T02:00:00.000Z"),
      });

      const meta = named(
        await drivePreview({ mode: "published" }),
        "PublishedMeta",
      );
      assert.ok(meta, "the meta strip did not render");
      assert.equal(
        meta.props.publisher,
        "Publisher B",
        "a restorer was named as the publisher",
      );
      assert.equal(
        meta.props.publishedAt,
        "2026-08-20T02:00:00.000Z",
        "the backup time was shown as a publish time",
      );
      assert.equal(meta.props.versionLabel, "เวอร์ชัน 2");
    },
  );

  await scenario(
    "C — one fetch-one serves both shapes, and the PICK is what normalises them",
    async () => {
      // A version's snapshot is a whole page; a backup's is the nine content keys.
      // effectiveContent picks DRAFT_CONTENT_KEYS off either, so the restore path
      // is identical and neither shape can reach the draft unfiltered.
      seedPage({ status: "published" });
      seed("PageVersion", {
        _id: "pv-backup",
        pageId: PAGE_ID,
        label: DRAFT_BACKUP_LABEL,
        versionNumber: null,
        actor: { id: "u2", name: "Restorer C" },
        createdAt: new Date("2026-08-27T02:00:00.000Z"),
        snapshot: draftContent({ title: MARKER }),
      });

      const got = await getPageVersionSnapshot("pv-backup");
      assert.ok(got, "a backup row is not readable through the fetch-one");
      assert.equal(got.label, DRAFT_BACKUP_LABEL);
      assert.equal(got.versionNumber, null);
      assert.equal(got.snapshot.title, MARKER);
      // The guard: the pick yields exactly the nine keys from EITHER shape.
      assert.deepEqual(
        Object.keys(effectiveContentOf(got.snapshot)).sort(),
        [...DRAFT_CONTENT_KEYS].sort(),
        "the backup shape does not normalise through the same pick",
      );
    },
  );

  // ── H / F / I — the restore SEQUENCE, driven. Round 37, commit 2 ─────────
  //
  // The dialog is a portal and cannot be clicked here, so these drive the two
  // ACTIONS in the order the dialog calls them. That is the sequence whose
  // correctness the round turns on; which button is wired to which mode is
  // asserted from source in test/render/draftBackupChoice.

  /** The dialog's preserving path: back up, then overwrite. */
  const restoreWithBackup = async (versionId) => {
    const tok = token(row());
    const snap = await getPageVersionSnapshot(versionId);
    const backup = await backupDraftBeforeRestore(PAGE_ID, tok);
    if (!backup?.ok) return { aborted: true, backup };
    const saved = await saveDraftContent(
      PAGE_ID,
      effectiveContentOf(snap.snapshot),
      tok,
    );
    return { aborted: false, backup, saved };
  };

  /**
   * `createdAt: new Date(0)` deliberately. fakeDb's clock starts at a fixed base
   * (2023-11-14) and every write advances it, so a row CREATED during a test is
   * stamped from that clock — and a fixture dated 2026 would be "newer" than a
   * backup written seconds later, inverting the ordering these cases turn on.
   * Anchoring the pre-existing version below the clock makes any created row
   * newer by construction rather than by choosing a lucky literal.
   */
  const seedVersionRow = (title) =>
    seed("PageVersion", {
      _id: "pv-old",
      pageId: PAGE_ID,
      label: "publish",
      versionNumber: 1,
      actor: { id: "u1", name: "Publisher B" },
      createdAt: new Date(0),
      snapshot: {
        ...draftContent({ title }),
        slug: "live-slug",
        status: "published",
      },
    });

  await scenario(
    "H(i) — NO draft present: nothing is backed up, the restore lands",
    async () => {
      seedPage({ status: "published", publishedVersion: 1, draft: null });
      seedVersionRow("Version One Content");

      const out = await restoreWithBackup("pv-old");
      assert.equal(out.aborted, false);
      assert.equal(
        out.backup.backedUp,
        false,
        "a backup row was written with no draft to preserve",
      );
      assert.equal(out.saved.ok, true, out.saved.error);
      assert.equal(
        row().draft.title,
        "Version One Content",
        "the restore did not land",
      );
      assert.equal(
        backupRows().length,
        0,
        "the version list gained a backup row for nothing",
      );
    },
  );

  await scenario(
    "H(ii) — a STORED draft: it survives as a backup, and the restore lands",
    async () => {
      seedPage({
        status: "published",
        publishedVersion: 1,
        draft: draftContent({ title: MARKER }),
      });
      seedVersionRow("Version One Content");

      const out = await restoreWithBackup("pv-old");
      assert.equal(out.aborted, false);
      assert.equal(
        out.backup.backedUp,
        true,
        "the stored draft was not backed up",
      );
      assert.equal(
        row().draft.title,
        "Version One Content",
        "the restore did not land",
      );

      const [backup] = backupRows();
      assert.ok(backup, "no backup row exists");
      assert.equal(
        backup.snapshot.title,
        MARKER,
        "the backup does not hold the draft that was replaced",
      );

      // …and the list now shows both, with the backup newest.
      const rows = await getPageVersions(PAGE_ID);
      assert.equal(rows.length, 2);
      assert.equal(
        isDraftBackup(rows[0]),
        true,
        "the backup is not the newest row",
      );
      assert.equal(rows[0].versionNumber, null);
      assert.equal(
        rows[1].versionNumber,
        1,
        "the published version lost its number",
      );
    },
  );

  await scenario(
    "H(iii) — UNSAVED keystrokes are NOT preserved, and nothing pretends they are",
    async () => {
      /**
       * The honest limitation. backupDraftBeforeRestore reads the page document
       * on the SERVER; edits inside the 5s autosave debounce have never been
       * sent, so there is nothing to copy. On a page with no stored draft the
       * backup correctly reports it saved nothing — and the dialog says so
       * through unsavedNotBackedUpNote rather than implying coverage.
       */
      seedPage({ status: "published", publishedVersion: 1, draft: null });
      seedVersionRow("Version One Content");

      const out = await restoreWithBackup("pv-old");
      assert.equal(
        out.backup.backedUp,
        false,
        "the backup claimed to preserve work the server has never seen",
      );
      assert.equal(backupRows().length, 0);
      // The local keystrokes are not representable here at all — which IS the
      // finding: nothing server-side can observe them, so nothing server-side can
      // save them.
      assert.equal(row().draft.title, "Version One Content");
    },
  );

  await scenario(
    "F — when the OVERWRITE fails, the backup is already safe",
    async () => {
      // The recoverable half of the ordering argument, constructed: the backup
      // lands, the save is then refused, and the author has both their draft and
      // a copy of it.
      seedPage({
        status: "published",
        publishedVersion: 1,
        draft: draftContent({ title: MARKER }),
      });
      seedVersionRow("Version One Content");

      const tok = token(row());
      const backup = await backupDraftBeforeRestore(PAGE_ID, tok);
      assert.equal(backup.backedUp, true);

      // A stale token stands in for any reason the second write can fail.
      const saved = await saveDraftContent(
        PAGE_ID,
        draftContent({ title: "x" }),
        "2020-01-01T00:00:00.000Z",
      );
      assert.equal(saved.ok, false, "precondition: the second write must fail");

      assert.equal(
        row().draft.title,
        MARKER,
        "the draft was lost despite the write failing",
      );
      assert.equal(
        backupRows()[0].snapshot.title,
        MARKER,
        "the backup did not survive",
      );
    },
  );

  await scenario(
    "F — when the BACKUP fails, the draft is never touched",
    async () => {
      // The other order's failure, which is the one that must not happen: the
      // caller aborts, so the overwrite never runs.
      seedPage({
        status: "published",
        publishedVersion: 1,
        draft: draftContent({ title: MARKER }),
      });
      seedVersionRow("Version One Content");

      const PageVersionModel = (await import("@/models/PageVersion")).default;
      const original = PageVersionModel.create;
      PageVersionModel.create = async () => {
        throw new Error("disk on fire");
      };
      let out;
      try {
        out = await restoreWithBackup("pv-old");
      } finally {
        PageVersionModel.create = original;
      }

      assert.equal(
        out.aborted,
        true,
        "the restore continued after the backup failed",
      );
      assert.equal(out.backup.ok, false);
      assert.equal(
        out.backup.error.includes("disk on fire"),
        true,
        "the failure was swallowed",
      );
      assert.equal(
        row().draft.title,
        MARKER,
        "the draft was overwritten with no backup — the loss this round prevents",
      );
      assert.equal(backupRows().length, 0);
    },
  );

  await scenario(
    "I — a BACKUP can be restored from, through the same path",
    async () => {
      // A row only worth writing if it is reachable. No new action, no new pick:
      // the same fetch-one and the same effectiveContent round 34 built.
      seedPage({
        status: "published",
        publishedVersion: 1,
        draft: draftContent({ title: "current work" }),
      });
      seed("PageVersion", {
        _id: "pv-backup",
        pageId: PAGE_ID,
        label: DRAFT_BACKUP_LABEL,
        versionNumber: null,
        actor: { id: "u2", name: "Restorer C" },
        createdAt: new Date("2026-08-27T02:00:00.000Z"),
        snapshot: draftContent({ title: MARKER }),
      });

      const out = await restoreWithBackup("pv-backup");
      assert.equal(out.aborted, false);
      assert.equal(out.saved.ok, true, out.saved?.error);
      assert.equal(
        row().draft.title,
        MARKER,
        "restoring FROM a backup did not land",
      );
      // …and the draft it replaced was itself backed up, so the sequence composes.
      const titles = backupRows()
        .map((b) => b.snapshot.title)
        .sort();
      assert.deepEqual(
        titles,
        [MARKER, "current work"].sort(),
        "the second backup was not written",
      );
    },
  );

  // ── ROUND 38: the audit log gets a READ path ───────────────────────────────
  //
  // `PageAuditLog` has been written on every mutation here since round 2 and
  // read by nothing. These cases EXECUTE getPageAuditLog rather than scanning
  // it, because what is at stake is behaviour: which fields come back, and
  // whether a page boundary loses a row.
  //
  // The rows are produced by the REAL actions wherever a real action writes the
  // one the case is about, so the trail under test is the trail production
  // writes. `seedAuditRow` exists only for the volume and tie-break cases,
  // which need more rows than an action sequence would produce and need control
  // over `createdAt` that the fake's advancing clock does not give.

  /** One audit row, straight into the collection. */
  const seedAuditRow = (i, over = {}) =>
    seed("PageAuditLog", {
      _id: `audit${String(i).padStart(4, "0")}`,
      pageId: PAGE_ID,
      pageType: "builder",
      action: "draft.save",
      sectionId: "",
      field: "",
      before: { hadDraft: true },
      after: { hasDraft: true },
      actor: { id: "u1", name: "Dev" },
      // Below the fake's clock base, ASCENDING with i, so row i+1 is newer than
      // row i and nothing an action writes during the case can land among them.
      createdAt: new Date(1000 + i * 1000),
      ...over,
    });

  const auditIds = (res) => res.rows.map((r) => String(r._id));

  await scenario(
    "the read returns the projection and NOTHING else",
    async () => {
      seedPage();
      // A real action, so the row under test is one production writes.
      await saveDraftContent(PAGE_ID, draftContent(), token(row()));
      assert.equal(
        count("PageAuditLog"),
        1,
        "precondition: the save wrote its audit row",
      );

      const { rows, nextCursor } = await getPageAuditLog(PAGE_ID);
      assert.equal(rows.length, 1);
      assert.equal(nextCursor, null);
      assert.deepEqual(Object.keys(rows[0]).sort(), [
        "_id",
        "action",
        "actor",
        "createdAt",
      ]);
      assert.equal(rows[0].action, "draft.save");
      assert.equal(rows[0].actor.name, "Dev");

      // By name, so a failure says WHICH field came back. Each is excluded for a
      // measured reason — see lib/pageBuilder/auditTrail.js.
      for (const field of [
        "before",
        "after",
        "sectionId",
        "field",
        "pageType",
      ]) {
        assert.equal(
          field in rows[0],
          false,
          `getPageAuditLog shipped '${field}'. before/after are PRESENCE FLAGS, not values, ` +
            "and shipping them invites a caller to render them as if they were.",
        );
      }
    },
  );

  await scenario(
    "CONTROL: the stored row really does carry the fields the read drops",
    async () => {
      // Without this, the exclusion above passes for a writer that never wrote
      // them — the check would be pinning an absence nothing created.
      seedPage();
      await saveDraftContent(PAGE_ID, draftContent(), token(row()));
      const [stored] = all("PageAuditLog");
      assert.deepEqual(stored.before, { hadDraft: false });
      assert.deepEqual(stored.after, { hasDraft: true });
      assert.equal(stored.pageType, "builder");
      assert.equal("sectionId" in stored, true);
      assert.equal("field" in stored, true);
    },
  );

  await scenario(
    "a page with MANY actions reads back newest first",
    async () => {
      seedPage({ status: "published", publishedVersion: 1 });
      // Four real actions, in order, each writing its own row.
      await saveDraftContent(PAGE_ID, draftContent(), token(row()));
      await updatePageIdentity(PAGE_ID, { slug: "renamed-slug" }, token(row()));
      await publishPageStatus(PAGE_ID, { status: "published" }, token(row()));
      await discardDraftContent(PAGE_ID, token(row()));

      const { rows } = await getPageAuditLog(PAGE_ID);
      assert.deepEqual(
        rows.map((r) => r.action),
        ["draft.discard", "publish", "update", "draft.save"],
        "the trail is not newest-first, or an action stopped recording",
      );
    },
  );

  await scenario(
    "a page with NO actions returns empty — a normal state, not a failure",
    async () => {
      seedPage();
      assert.deepEqual(await getPageAuditLog(PAGE_ID), {
        rows: [],
        nextCursor: null,
      });
    },
  );

  await scenario(
    "a blank id returns empty rather than every page in the collection",
    async () => {
      seedPage();
      seedAuditRow(1);
      seedAuditRow(2, { pageId: "some-other-page" });
      assert.deepEqual(await getPageAuditLog(""), {
        rows: [],
        nextCursor: null,
      });
      assert.deepEqual(await getPageAuditLog(null), {
        rows: [],
        nextCursor: null,
      });
      // …and a real id returns ONLY its own page's rows.
      assert.deepEqual(auditIds(await getPageAuditLog(PAGE_ID)), ["audit0001"]);
    },
  );

  await scenario(
    "the newest row after a round-37 restore is the BACKUP, then the save",
    async () => {
      // The third fixture: a page whose newest activity is a restore. Driven
      // through the real two-write sequence, so the order is the one the editor
      // produces rather than one this test arranged.
      seedPage({
        status: "published",
        publishedVersion: 1,
        draft: draftContent({ title: "current work" }),
      });
      seedVersionRow("Version One Content");
      const out = await restoreWithBackup("pv-old");
      assert.equal(out.aborted, false, "precondition: the restore ran");

      const { rows } = await getPageAuditLog(PAGE_ID);
      assert.deepEqual(
        rows.map((r) => r.action),
        ["draft.save", "draft.backup"],
        "a restore no longer leaves the backup and the save it protected, in that order",
      );
      // The backup row names its actor and nothing about the version it copied —
      // the trail cannot join a row to a version, so it must not appear to.
      assert.equal(rows[1].actor.name, "Dev");
      assert.equal(
        "after" in rows[1],
        false,
        "the backup row shipped its backupVersionId",
      );
    },
  );

  // ── the page boundary ─────────────────────────────────────────────────────

  await scenario("exactly one page of rows offers no next page", async () => {
    seedPage();
    for (let i = 1; i <= AUDIT_TRAIL_PAGE_SIZE; i += 1) seedAuditRow(i);
    const res = await getPageAuditLog(PAGE_ID);
    assert.equal(res.rows.length, AUDIT_TRAIL_PAGE_SIZE);
    assert.equal(
      res.nextCursor,
      null,
      "a full first page offered a second one — the +1 fetch is off by one",
    );
  });

  await scenario(
    "one row past the boundary pages without losing or repeating a row",
    async () => {
      seedPage();
      const total = AUDIT_TRAIL_PAGE_SIZE + 1;
      for (let i = 1; i <= total; i += 1) seedAuditRow(i);

      const first = await getPageAuditLog(PAGE_ID);
      assert.equal(first.rows.length, AUDIT_TRAIL_PAGE_SIZE);
      assert.ok(
        first.nextCursor,
        "no cursor was offered for the row past the boundary",
      );

      const second = await getPageAuditLog(PAGE_ID, {
        cursor: first.nextCursor,
      });
      assert.equal(
        second.rows.length,
        1,
        "the second page did not hold the one remaining row",
      );
      assert.equal(second.nextCursor, null);

      const seen = [...auditIds(first), ...auditIds(second)];
      assert.equal(
        new Set(seen).size,
        total,
        "a row was repeated across the boundary",
      );
      assert.deepEqual(
        [...seen].sort(),
        Array.from(
          { length: total },
          (_, i) => `audit${String(i + 1).padStart(4, "0")}`,
        ).sort(),
        "a row was SKIPPED across the boundary — the failure a cursor exists to prevent",
      );
      // Newest first, across both pages.
      assert.equal(seen[0], `audit${String(total).padStart(4, "0")}`);
      assert.equal(seen[seen.length - 1], "audit0001");
    },
  );

  /**
   * A page whose two OLDEST rows share a millisecond, so the page boundary
   * falls between them.
   *
   * The tie has to be at the boundary to be worth anything, and the boundary is
   * at the OLD end of a newest-first page: rows 1 and 2 tie, rows 3..26 are
   * strictly newer, so page one holds the 24 newer rows plus one of the tied
   * pair and page two must find the other.
   */
  const seedTieAtBoundary = () => {
    const tie = new Date(1000);
    seedAuditRow(1, { createdAt: tie });
    seedAuditRow(2, { createdAt: tie });
    for (let i = 3; i <= AUDIT_TRAIL_PAGE_SIZE + 1; i += 1) seedAuditRow(i);
  };

  await scenario(
    "SAME-MILLISECOND rows straddling the boundary keep the tie-break",
    async () => {
      // The reason the cursor is compound rather than a createdAt alone. Two rows
      // share an instant and the page edge falls between them; a flat `$lt` would
      // drop the second one and the trail would look complete.
      seedPage();
      seedTieAtBoundary();

      const first = await getPageAuditLog(PAGE_ID);
      assert.equal(first.rows.length, AUDIT_TRAIL_PAGE_SIZE);
      assert.equal(
        auditIds(first).at(-1),
        "audit0002",
        "the boundary did not land on the tie",
      );

      const second = await getPageAuditLog(PAGE_ID, {
        cursor: first.nextCursor,
      });
      const seen = [...auditIds(first), ...auditIds(second)];
      assert.equal(new Set(seen).size, seen.length, "a tied row was repeated");
      assert.deepEqual(
        auditIds(second),
        ["audit0001"],
        "the tied row on the far side of the boundary was SKIPPED",
      );
    },
  );

  await scenario(
    "CONTROL: a flat createdAt cursor DOES lose the tied row",
    async () => {
      // Without this, the tie case above passes for a fake that cannot express
      // the failure. Same fixture, the tie-break clause removed by hand.
      seedPage();
      seedTieAtBoundary();

      const first = await getPageAuditLog(PAGE_ID);
      const flat = buildPageAuditQuery({
        pageId: PAGE_ID,
        cursor: first.nextCursor,
      });
      // The compound $or replaced by the naive bound a first attempt would write.
      delete flat.$or;
      flat.createdAt = {
        $lt: parseAuditTrailCursor(first.nextCursor).createdAt,
      };
      const PageAuditLogModel = (await import("@/models/PageAuditLog")).default;
      const lost = await PageAuditLogModel.find(flat)
        .select("action")
        .sort({ createdAt: -1 })
        .lean();
      assert.equal(
        lost.length,
        0,
        "the flat bound did NOT lose the tied row, so the compound case above proves nothing",
      );
    },
  );
});
