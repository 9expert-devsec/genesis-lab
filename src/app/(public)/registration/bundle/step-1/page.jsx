import { BundlePageContent } from '../BundlePageContent';

/**
 * ── NO ISR ON THE WIZARD, AND THE REASON IS NOT PERFORMANCE ───────────────
 * This page asks the applicant to PICK a round. A cached render hands them a
 * list of rounds up to an hour old, so they can choose one that has since
 * filled or closed and be refused at submit — a dead end built by our own
 * cache, on the one surface where the data is a question rather than a
 * display.
 *
 * Scoped to the wizard. The promotion page keeps `revalidate = 3600` and
 * every other surface keeps the shared 1800s schedules window; the staleness
 * there costs an out-of-date card, not a refused submission. The schedules
 * FETCH is made live separately — page-level dynamic alone would still serve a
 * cached `listSchedulesByCourse` — see BundlePageContent.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'ขอใบเสนอราคาแพ็กเกจ',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/registration/bundle/step-1` },
};

/** Step 1 — fill in the quotation request. */
export default function Page({ searchParams }) {
  return <BundlePageContent searchParams={searchParams} step={1} />;
}
