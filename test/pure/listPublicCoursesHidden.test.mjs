import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listPublicCourses,
  getCourseByCodeInsensitive,
} from "@/lib/api/public-courses";

/**
 * `listPublicCourses` — the ONE choke point where a hidden course leaves every
 * live listing surface at once.
 *
 * ── THE SHAPE OF THE DEFECT ─────────────────────────────────────────────────
 * Upstream `/public-course` has never heard of `CourseExtension.isPublished`,
 * so before this, un-publishing a course removed it from pretty-URL resolution
 * and from NOTHING ELSE: it stayed in the mega menu, /training-course,
 * /schedule, /search, the article related-course rail and every page-builder
 * course_list, each entry linking at a 404.
 *
 * ── WHY THE DEFAULT IS THE FILTERED ONE ─────────────────────────────────────
 * Opt-OUT, not opt-in. The failure being removed is a surface that was never
 * told the flag existed, so the default has to be the safe answer and the
 * exceptions have to be typed out at the call site. The tests below pin BOTH
 * directions, because a filter that also fired for admin callers would break
 * the previous_course picker and the duplicate-code guard silently.
 */

const UPSTREAM = {
  items: [
    { _id: "1", course_id: "COPILOT-STU", course_name: "Copilot for Students" },
    { _id: "2", course_id: "MSE-AI", course_name: "Excel AI" },
    { _id: "3", course_id: "Power-Apps", course_name: "Power Apps" },
  ],
  summary: { total: 3 },
};

function harness({ hidden = [], upstream = UPSTREAM } = {}) {
  const calls = { upstream: [], hiddenReads: 0 };
  return {
    calls,
    deps: {
      fetchUpstream: async (path, opts) => {
        calls.upstream.push({ path, opts });
        return upstream;
      },
      loadHidden: async () => {
        calls.hiddenReads += 1;
        return new Set(hidden);
      },
      // `null` is "do not order" — see courseOrderStore's note on why that is
      // the safe direction. It leaves the array exactly as the fetchUpstream
      // stub above returned it, which is what every expectation below reads.
      //
      // NOT OPTIONAL, AND NOT COSMETIC. Omitted, `loadOrder` falls through to
      // the real loadCourseOrder, which connects and queries ProgramOrder for
      // real. Measured before this line existed: nine of the twelve tests here
      // each sat on mongoose's 10-second buffering timeout, so a file that runs
      // in 30ms took 10.5 SECONDS and printed nine `[courseOrder] could not read
      // the stored order` lines — and it stayed GREEN throughout, because the
      // store catches its own failure and returns the same null this returns.
      // On a machine where that read is reachable-but-slow, or where nothing
      // stubs @/lib/db/connect, the same omission hangs the suite instead.
      // test/fs/injectedDepCoverage.test.mjs is what now names it.
      loadOrder: async () => null,
    },
  };
}

test("a hidden course is GONE from the default list", async () => {
  const h = harness({ hidden: ["COPILOT-STU"] });
  const { items } = await listPublicCourses({}, h.deps);
  assert.deepEqual(
    items.map((c) => c.course_id),
    ["MSE-AI", "Power-Apps"],
  );
});

test("CONTROL: the same call returns all three when nothing is hidden", async () => {
  // Without this, the assertion above would also pass against a filter that
  // dropped the head of every list. Measured 2026-08-12: 0 of 78 extension rows
  // are hidden in production, so the empty-hidden case is the one every real
  // request takes today.
  const h = harness({ hidden: [] });
  const { items } = await listPublicCourses({}, h.deps);
  assert.deepEqual(
    items.map((c) => c.course_id),
    ["COPILOT-STU", "MSE-AI", "Power-Apps"],
  );
});

test("includeHidden: true gets the WHOLE list back — the admin opt-in", async () => {
  const h = harness({ hidden: ["COPILOT-STU"] });
  const { items } = await listPublicCourses({ includeHidden: true }, h.deps);
  assert.deepEqual(
    items.map((c) => c.course_id),
    ["COPILOT-STU", "MSE-AI", "Power-Apps"],
  );
});

test("includeHidden: true does not even READ the hidden set", async () => {
  // The opt-in must be free. An admin table paying a Mongo round trip to
  // compute an answer it then discards is the kind of cost that gets "optimised"
  // later by deleting the flag.
  const h = harness({ hidden: ["COPILOT-STU"] });
  await listPublicCourses({ includeHidden: true }, h.deps);
  assert.equal(h.calls.hiddenReads, 0);
});

test("the filtered path reads the hidden set exactly ONCE", async () => {
  // The cost ruling: one batched read per call, never one per course.
  const h = harness({ hidden: ["COPILOT-STU"] });
  await listPublicCourses({}, h.deps);
  assert.equal(h.calls.hiddenReads, 1);
});

test("`total` is re-derived, so it matches the list actually returned", async () => {
  // Upstream's summary.total counts the UNFILTERED catalog. Carrying it through
  // gives a caller "3 courses" above a grid of 2 — the same quiet wrongness
  // this change exists to remove.
  const h = harness({ hidden: ["COPILOT-STU"] });
  const res = await listPublicCourses({}, h.deps);
  assert.equal(res.total, 2);
  assert.equal(res.total, res.items.length);
});

test("CONTROL: upstream really does report a total larger than the filtered list", () => {
  // Otherwise the test above could pass on a fixture where the two happened to
  // agree, and would say nothing about the re-derivation.
  assert.equal(UPSTREAM.summary.total, 3);
});

test("hiding is case-tolerant across an upstream rename", async () => {
  // The hidden set is uppercased; upstream renamed Power-Apps → POWER-APPS once
  // already, and the stored extension courseId is a frozen copy.
  const h = harness({ hidden: ["POWER-APPS"] });
  const { items } = await listPublicCourses({}, h.deps);
  assert.deepEqual(
    items.map((c) => c.course_id),
    ["COPILOT-STU", "MSE-AI"],
  );
});

test("the skill/program filters still reach upstream untouched", async () => {
  // The hidden filter must not have quietly eaten the upstream query params —
  // every mega-menu column and every page-builder course_list depends on them.
  const h = harness();
  await listPublicCourses({ skill: "S1", program: "P9" }, h.deps);
  assert.equal(h.calls.upstream.length, 1);
  assert.deepEqual(h.calls.upstream[0].opts.params, {
    skill: "S1",
    program: "P9",
  });
  assert.deepEqual(h.calls.upstream[0].opts.tags, ["public-courses"]);
});

test("includeHidden is NOT forwarded to upstream as a query parameter", async () => {
  // It is ours, not MSDB's. Sent upstream it would either be ignored or, worse,
  // matched against some unrelated field.
  const h = harness();
  await listPublicCourses({ includeHidden: true }, h.deps);
  assert.deepEqual(h.calls.upstream[0].opts.params, {
    skill: undefined,
    program: undefined,
  });
});

// ── the case-insensitive fallback ──────────────────────────────────────────

test("the case-insensitive fallback inherits includeHidden", async () => {
  // Otherwise an admin previewing one of the five mixed-case courses would get
  // a 404 while the other 73 previewed fine: the direct ?course_id= fetch misses
  // on casing, and the list that would recover it has filtered the course out.
  let listArgs = null;
  const course = await getCourseByCodeInsensitive("power-apps", {
    fetchByCode: async (id) =>
      id === "Power-Apps" ? { course_id: "Power-Apps" } : null,
    fetchList: async (opts) => {
      listArgs = opts;
      return { items: UPSTREAM.items };
    },
    info: () => {},
    includeHidden: true,
  });
  assert.deepEqual(listArgs, { includeHidden: true });
  assert.equal(course.course_id, "Power-Apps");
});

test("CONTROL: without the opt-in the fallback asks for the FILTERED list", () => {
  // Proves the flag is threaded rather than hard-coded on.
  let listArgs = null;
  return getCourseByCodeInsensitive("power-apps", {
    fetchByCode: async () => null,
    fetchList: async (opts) => {
      listArgs = opts;
      return { items: [] };
    },
    info: () => {},
  }).then(() => {
    assert.deepEqual(listArgs, { includeHidden: false });
  });
});
