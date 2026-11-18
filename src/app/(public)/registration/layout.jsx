import { UTILITY_ROBOTS } from '@/lib/seo/utilityRobots';

/**
 * D05 — every /registration/** page (public, in-house, bundle, their steps,
 * payment complete) is a form, not content: noindex, follow. Set once here so
 * a new step page inherits it. Metadata only — this layout adds no markup and
 * does not change how any child renders.
 */
export const metadata = {
  robots: UTILITY_ROBOTS,
};

export default function RegistrationLayout({ children }) {
  return children;
}
