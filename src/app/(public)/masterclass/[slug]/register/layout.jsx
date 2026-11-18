import { UTILITY_ROBOTS } from '@/lib/seo/utilityRobots';

/**
 * D05 — every /masterclass/<slug>/register/** page is a form, not content:
 * noindex, follow. The step pages' generateMetadata sets title/description
 * only, so this merges underneath them. Metadata only — no markup, no change
 * to how the steps render.
 */
export const metadata = {
  robots: UTILITY_ROBOTS,
};

export default function MasterclassRegisterLayout({ children }) {
  return children;
}
