import { findSkillBySlug } from '@/config/site';
import { skillHref } from '@/lib/utils';

/**
 * The hero's AI / DATA / AUTOMATION pills, linked exactly the way the header's
 * mega menu links those skills: the site's skill taxonomy (config/site.js) run
 * through skillHref with the admin's custom URL slugs (getNavMenuData's
 * `skillSlugs`). With no custom slug a skill resolves to /skill/<slug>.
 */
const PILL_SKILLS = [
  { label: 'AI', slug: 'ai' },
  { label: 'DATA', slug: 'data' },
  { label: 'AUTOMATION', slug: 'automation' },
];

export function focusPillLinks(skillSlugs = {}) {
  return PILL_SKILLS.map(({ label, slug }) => {
    const skill = findSkillBySlug(slug);
    return { label, href: skill ? skillHref(skill, skillSlugs) : null };
  });
}
