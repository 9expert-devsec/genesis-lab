import { Suspense } from 'react';
import { AlertTriangle } from 'lucide-react';
import { listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { enrichCoursesWithDetails } from '@/lib/api/enrich-courses';
import { projectCourseListRows } from '@/lib/courses/courseListRow';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { getAllActiveEarlyBirdMap } from '@/lib/actions/course-promos';
import { CourseListClient } from './_components/CourseListClient';
import { siteCurrentYear } from '@/lib/articlePublishTime';
import { getPageLinkability } from '@/lib/resolvePageSlug';
import { SITE_URL } from '@/lib/seo/siteUrl';
import {
  TRAINING_COURSE_TITLE,
  buildCourseListJsonLd,
} from '@/lib/seo/courseListJsonLd';

/**
 * The canonical URL of this page. ONE expression of the origin, shared with the
 * JSON-LD below.
 *
 * ── WHY SITE_URL AND NOT process.env.NEXT_PUBLIC_SITE_URL ───────────────────
 * This line used to read the env var directly. SITE_URL *is* that env var, read
 * through siteConfig (`process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.9experttraining.com'`),
 * so the PRODUCTION VALUE IS UNCHANGED — but it was a second EXPRESSION of the
 * same value sitting on the page whose structured data was about to be built
 * from the first. That is the weaker form of the defect lib/seo/siteUrl.js
 * exists to prevent: not two different hosts, two ways of spelling one host,
 * which is how they eventually become two different hosts. The graph's `url`
 * and this tag are now the same expression and cannot drift.
 *
 * It also gains the fallback the env var does not have: on a deployment that
 * forgets NEXT_PUBLIC_SITE_URL, this emitted `undefined/training-course`.
 */
const CANONICAL_URL = `${SITE_URL}/training-course`;

export const metadata = {
  // The `%s` the root layout's template composes into `<title>`. Read from the
  // JSON-LD module so the tag and CollectionPage.name are one value — see
  // TRAINING_COURSE_TITLE for why the constant lives there and not here.
  title: TRAINING_COURSE_TITLE,
  alternates: { canonical: CANONICAL_URL },
};

export default async function Page() {
  let items = [];
  let programOrder = [];
  let earlyBirdMap = {};
  let fetchError = null;
  // Resolved on the SERVER, once per render, and passed down — the capsule
  // links are not allowed to cost a client fetch. `getPageLinkability` already
  // fails closed to empty maps, which degrades a capsule to the plain <span>
  // it was before rather than taking the page down.
  let skillSlugs = {};

  try {
    const [coursesResult, rawPrograms, earlyBirdMapResult, linkability] = await Promise.all([
      listPublicCourses(),
      listPrograms().catch(() => ({ items: [] })),
      getAllActiveEarlyBirdMap().catch(() => ({})),
      getPageLinkability(),
    ]);
    skillSlugs = linkability.skillSlugs;
    // Trimmed HERE, at the boundary where the row becomes a prop of a client
    // component and is serialised into the page: the enriched row carries
    // the full course body (topics, objectives, related courses, …) and the
    // list reads a fraction of it. See lib/courses/courseListRow for the
    // measurement and the per-consumer key list.
    items = projectCourseListRows(await enrichCoursesWithDetails(coursesResult.items));
    earlyBirdMap = earlyBirdMapResult;
    // Apply admin-set program order. We pass the names down so the
    // client groups + filter dropdown render in the same sequence.
    const ordered = await getOrderedPrograms(rawPrograms.items ?? []).catch(
      () => rawPrograms.items ?? []
    );
    programOrder = ordered
      .map((p) => p.program_name)
      .filter(Boolean);
  } catch (err) {
    console.error('[training-course]', err);
    fetchError = err.message;
  }

  if (fetchError) {
    return <ErrorState message={fetchError} />;
  }

  // The unfiltered catalog, described for readers that never run this page's
  // JavaScript. `null` when there is nothing to describe, in which case no
  // script tag is emitted at all — see lib/seo/courseListJsonLd.js.
  const listJsonLd = buildCourseListJsonLd(items);

  // Suspense boundary — CourseListClient reads useSearchParams, which
  // under Next 15 forces dynamic rendering without a boundary above it.
  return (
    <>
      {/* OUTSIDE the Suspense boundary, ON PURPOSE. CourseListClient is what
          reads useSearchParams, and at prerender that boundary BAILS TO
          CLIENT-SIDE RENDERING — measured on a production build: the served
          HTML carries `<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING">`
          where the grid should be, and not one course anchor. So the card grid
          is invisible to a reader that does not run JavaScript, and this graph
          is the only description of the catalog such a reader gets. Inside the
          boundary it would have shared that fate.

          It is built from server data that does not depend on the query string,
          and that is observable: /training-course and /training-course?skill=data
          return BYTE-IDENTICAL HTML, so the graph a crawler reads is the same
          one the canonical tag points at.

          ── WHAT THIS IS *NOT*, MEASURED RATHER THAN ASSUMED ──────────────────
          It is NOT outside <main>. It cannot be: `<main id="main">{children}</main>`
          lives in app/(public)/layout.jsx, so every page in this group renders
          inside that landmark by construction. app/page.jsx gets to sit between
          the header and <main> only because Home is OUTSIDE the (public) group
          and builds its own chrome. The closest precedent that IS in this group,
          /articles, puts its ItemList script as the first child of <main> — and
          this sits in the same place structurally. Hoisting it above <main>
          means editing the shared layout, which changes every public route.

          In the served HTML it lands inside React's `<div hidden id="S:0">`
          streaming container, because the page body is deferred behind the
          bailing boundary above. That affects neither presence nor parsing: the
          bytes are in the initial response and in the on-disk prerender
          (.next/server/app/training-course.html), and `hidden` governs rendered
          content, not script[type="application/ld+json"].

          The boundary below and its `fallback={null}` are untouched. */}
      {listJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(listJsonLd) }}
        />
      )}
      <Suspense fallback={null}>
        <CourseListClient
          items={items}
          programOrder={programOrder}
          earlyBirdMap={earlyBirdMap}
          currentYear={siteCurrentYear()}
          skillSlugs={skillSlugs}
        />
      </Suspense>
    </>
  );
}

function ErrorState({ message }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 lg:px-6">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-9e-air/20">
          <AlertTriangle className="h-5 w-5 text-9e-action" strokeWidth={1.75} />
        </div>
        <p className="text-base font-semibold text-9e-navy">โหลดข้อมูลไม่สำเร็จ</p>
        <p className="mt-1 text-sm text-9e-slate-dp-50">
          กรุณาลองใหม่อีกครั้ง หรือติดต่อเราหากปัญหายังคงอยู่
        </p>
        {process.env.NODE_ENV !== 'production' && message && (
          <pre className="mt-4 max-w-full overflow-x-auto rounded bg-9e-ice p-3 text-left text-xs text-9e-slate-dp-50">
            {message}
          </pre>
        )}
      </div>
    </div>
  );
}
