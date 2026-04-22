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
};

/**
 * Main navigation — rendered in the public header.
 * `external: true` opens in new tab with rel="noopener".
 * Items with `children` render as hover dropdowns on desktop and
 * accordion sections on mobile.
 */
export const mainNav = [
  {
    label: 'หลักสูตร',
    href: '/training-course',
    children: [
      { label: 'หลักสูตรทั้งหมด',  href: '/training-course' },
      { label: 'หลักสูตรออนไลน์', href: siteConfig.academyUrl, external: true },
      { label: 'เส้นทางอาชีพ',    href: '/career-path-project' },
    ],
  },
  { label: 'ตารางอบรม', href: '/schedule' },
  { label: 'โปรโมชัน',  href: '/promotion' },
  { label: 'บทความ',    href: '/articles' },
  {
    label: 'เกี่ยวกับเรา',
    href:  '/about-us',
    children: [
      { label: 'เกี่ยวกับ 9Expert', href: '/about-us' },
      { label: 'ร่วมงานกับเรา',    href: '/join-us' },
      { label: 'คำถามที่พบบ่อย',   href: '/faq' },
    ],
  },
  { label: 'ติดต่อเรา', href: '/contact-us' },
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

/**
 * Skills (6) — used for /<skill>-all-courses catalog routes.
 * Source: originally defined upstream. Keep slug IDs in sync with MSDB.
 */
export const skills = [
  { slug: 'power-platform', label: 'Power Platform' },
  { slug: 'business',       label: 'Business' },
  { slug: 'data',           label: 'Data' },
  { slug: 'ai',             label: 'AI' },
  { slug: 'programming',    label: 'Programming' },
  { slug: 'rpa',            label: 'RPA' },
];

/**
 * Programs (21) — used for /<program>-all-courses catalog routes.
 * NOTE: List to be filled in during Phase 3 once we curl-verify the
 * /programs endpoint from upstream MSDB. Placeholder shape below.
 */
export const programs = [
  // TODO Phase 3: populate from /api/ai/programs (curl-verify first)
  // { slug: 'power-bi',        label: 'Power BI' },
  // { slug: 'excel',           label: 'Microsoft Excel' },
  // { slug: 'power-automate',  label: 'Power Automate' },
  // ...
];
