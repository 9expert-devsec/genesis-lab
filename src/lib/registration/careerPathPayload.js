/**
 * The document createCareerPathRegistration hands to
 * CareerPathRegistration.create — PURE, so the one step between the visitor's
 * payload and the write can be executed by a test with no database.
 *
 * Lives here, not in src/lib/actions/career-path-registrations.js, because that
 * file is `'use server'`: every export of it must be an async server action, and
 * a plain function exported from it fails the build.
 *
 * Two fields are REPLACED, never passed through:
 *   · `selectedCourses` — the rows re-resolved from the live rounds by the
 *     action's refusePicks; the browser's own dates are never stored;
 *   · `attribution` — rebuilt by buildAttribution, the only thing allowed to
 *     decide what is stored. undefined when nothing usable was sent, which
 *     Mongoose skips, so a forged blob is removed rather than kept raw.
 *
 * Everything else is the payload as sent; the model's schema strips unknown
 * keys on create, exactly as before this was extracted.
 */
import { buildAttribution } from '@/lib/attribution/attribution';

export function careerPathCreatePayload(data, selectedCourses) {
  return {
    ...data,
    selectedCourses,
    attribution: buildAttribution(data?.attribution),
  };
}
