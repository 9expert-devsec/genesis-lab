/**
 * Site-wide constants.
 *
 * Single source of truth for navigation, brand metadata, social links,
 * and any other constant referenced across multiple pages.
 *
 * When adding a new page to the nav, update here — not in the header
 * component.
 */

export const siteConfig = {
  name:        '9Expert Training',
  nameFull:    'บริษัท นายน์เอ็กซ์เพิร์ท จำกัด',
  tagline:     'Knowledge Provider',
  slogan:      'อย่าหยุดเรียนรู้',
  motto:       'สอนสไตล์ใช้งานจริง',
  concept:     'Universe of Learning Technology',
  description: 'ศูนย์ฝึกอบรมคอมพิวเตอร์มืออาชีพ สอนสไตล์ใช้งานจริง',
  url:         process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.9experttraining.com',

  // External academy for online courses (not built here)
  academyUrl: 'https://academy.9experttraining.com',

  // Social
  facebookUrl: 'https://www.facebook.com/9ExpertTraining',
};

/**
 * Skills — static list with upstream MongoDB _id mapping.
 *
 * The _id is what `/public-course?skill=<_id>` accepts for filtering.
 * The `skill_id` short code (e.g. 'AI', 'DEV') is upstream-internal
 * and not used for filtering.
 *
 * Hardcoded because: skills rarely change; runtime fetching adds
 * loading states for zero benefit. If this list drifts from upstream,
 * update here — do not auto-fetch.
 *
 * Mapping verified against /api/ai/skills on 2026-04-22.
 *
 * Note: the `programming` slug is intentional — the URL
 * /programming-all-courses is the legacy route preserved for SEO.
 * The display label is 'Development' to match live-site terminology.
 * Do not rename the slug without an SEO migration plan (redirects).
 */
export const skills = [
  {
    slug: 'power-platform',
    upstreamId: '68d3c5af2c6a2f1315c0bcdc',
    upstreamCode: 'POWERPLATFORM',
    label: 'Power Platform',
  },
  {
    slug: 'business',
    upstreamId: '68d4f506581cb350290597c6',
    upstreamCode: 'BUSINESS',
    label: 'Business',
  },
  {
    slug: 'data',
    upstreamId: '68d3c5af2c6a2f1315c0bcdb',
    upstreamCode: 'DATA',
    label: 'Data',
  },
  {
    slug: 'ai',
    upstreamId: '68d4f556581cb350290597d1',
    upstreamCode: 'AI',
    label: 'AI',
  },
  {
    slug: 'programming',
    upstreamId: '68d4f5b3581cb350290597de',
    upstreamCode: 'DEV',
    label: 'Development',
  },
  {
    slug: 'rpa',
    upstreamId: '68d4f493581cb350290597b5',
    upstreamCode: 'RPA',
    label: 'RPA',
  },
];

/**
 * Look up a skill entry by UI slug. Returns null if unknown.
 */
export function findSkillBySlug(slug) {
  return skills.find((s) => s.slug === slug) ?? null;
}

/**
 * Career paths — hardcoded list for nav.
 * TODO(phase-3): fetch from /api/ai/career-path and cache via ISR.
 * curl-verify the endpoint first — see docs/api-domains.md.
 *
 * First entry is the "all" landing page (empty slug → /career-path-project).
 */
export const careerPaths = [
  { slug: '',                                        label: 'All Career Path' },
  { slug: 'prompt-engineer',                         label: 'Prompt Engineer' },
  { slug: 'business-analytics',                      label: 'Business Analytics' },
  { slug: 'citizen-developer',                       label: 'Citizen Developer' },
  { slug: 'rpa-developer',                           label: 'RPA Developer' },
  { slug: 'accounting-and-finance',                  label: 'Accounting & Finance' },
  { slug: 'data-analyst',                            label: 'Data Analyst' },
  { slug: 'data-engineer-bi',                        label: 'Data Engineering & BI' },
  { slug: 'power-automate-specialist',               label: 'Power Automate Specialist' },
  { slug: 'web-developer',                           label: 'Web Developer' },
  { slug: 'visual-communication-and-presentation',   label: 'Visual Communication & Presentation' },
];

/**
 * Main navigation — rendered in the public header.
 *
 * Three item types:
 *  - `type: 'mega'`   → header renders a full-width mega menu
 *                        (pulls `programs` + `skills` directly)
 *  - `children: [...]` → flat dropdown panel
 *  - neither           → plain link
 *
 * Structure mirrors the live site at 9experttraining.com.
 */
export const mainNav = [
  {
    label: 'หลักสูตร',
    href: '/training-course',
    type: 'mega',
  },
  {
    label: 'Career Path',
    href: '/career-path-project',
    children: careerPaths.map((c) => ({
      label: c.label,
      href: c.slug ? `/${c.slug}-career-path` : '/career-path-project',
    })),
  },
  { label: 'ตารางฝึกอบรม', href: '/schedule' },
  { label: 'โปรโมชัน',     href: '/promotion' },
  { label: 'บทความ',       href: '/articles' },
  { label: 'ผลงานของเรา',  href: '/portfolio' },
  {
    label: 'ติดต่อเรา',
    href: '/contact-us',
    children: [
      { label: 'แผนที่และการเดินทาง',            href: '/contact-us' },
      { label: 'โรงแรมและร้านอาหารใกล้ 9Expert', href: '/contact-us#nearby' },
      { label: 'Facebook',                        href: siteConfig.facebookUrl, external: true },
      { label: 'คำถามที่พบบ่อย',                 href: '/faq' },
      { label: 'เกี่ยวกับเรา',                    href: '/about-us' },
      { label: 'ร่วมงานกับเรา',                  href: '/join-us' },
    ],
  },
];

/**
 * Footer groupings — mirror information architecture without cluttering
 * the top nav.
 */
export const footerNav = {
  company: [
    { label: 'เกี่ยวกับเรา', href: '/about-us' },
    { label: 'ร่วมงานกับเรา', href: '/join-us' },
    { label: 'ติดต่อเรา', href: '/contact-us' },
  ],
  learn: [
    { label: 'หลักสูตร In-Class', href: '/training-course' },
    { label: 'หลักสูตรออนไลน์', href: siteConfig.academyUrl, external: true },
    { label: 'ตารางอบรม', href: '/schedule' },
    { label: 'เส้นทางอาชีพ', href: '/career-path-project' },
  ],
  resources: [
    { label: 'บทความ', href: '/articles' },
    { label: 'โปรโมชั่น', href: '/promotion' },
    { label: 'คำถามที่พบบ่อย', href: '/faq' },
  ],
};
