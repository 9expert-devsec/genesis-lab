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
  concept:     'Never Stop Learning',
  description: 'สอนแบ่งปันความรู้ เทคโนโลยี เพื่อขับเคลื่อนประเทศไทย',
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
 * Mapping verified against /api/ai/skills on 2026-08-04.
 *
 * ── WHAT EACH FIELD IS ACTUALLY LOAD-BEARING FOR (measured 2026-08-04) ──────
 *
 * `upstreamId` (_id)   the durable key. It survived the RPA → Automation
 *                      rename below unchanged, and it is what NavMenuCache
 *                      keys its skill snapshot on, so the mega menu's course
 *                      columns did not notice the rename at all.
 *
 * `upstreamCode`       the VOLATILE key — upstream renamed RPA → AUT under us.
 *                      It is what `skillHref` matches against the
 *                      SkillPageConfig slug map (that map is keyed by
 *                      `skillId`, which is the short code on all 8 live rows),
 *                      and what SkillOrder rows are keyed by. Wrong here means
 *                      wrong menu URLs and a skill that sorts last.
 *
 * `slug`               NOT cosmetic and NOT fallback-only. Two live consumers:
 *                        1. `/training-course?skill=<slug>` — FilterBar builds
 *                           the ทักษะ dropdown from this value and
 *                           CourseListClient resolves it back through
 *                           `findSkillBySlug`. An unknown slug resolves to
 *                           null and the filter SILENTLY DROPS, showing the
 *                           unfiltered catalog rather than an error.
 *                        2. `skillHref`'s last-resort `/skill/<slug>`, reached
 *                           only when no SkillPageConfig row matches by
 *                           upstreamId / _id / skill_id / upstreamCode.
 *                      So renaming a slug breaks existing `?skill=` links in
 *                      the quietest possible way. `rpa` → `automation` was
 *                      renamed deliberately on 2026-08-04; `/rpa-all-courses`
 *                      got a permanent redirect in next.config.mjs and
 *                      `?skill=rpa` kept working via `legacySlugs`.
 *
 * `legacySlugs`        OPTIONAL, and absent on every entry that has never been
 *                      renamed. Slugs this entry used to answer to and still
 *                      accepts. Read ONLY by findSkillBySlug — never offered
 *                      in a control, never used to build a URL. See the rule
 *                      in that function's docstring: renaming a slug and
 *                      recording the old one are the same commit.
 *
 * `label` / `iconUrl`  display only. Both drift silently — Business and AI
 *                      were pointing at superseded Cloudinary icon versions
 *                      for an unknown period before the 2026-08-04 sweep.
 *
 * Note: the `programming` slug is intentional — the URL
 * /programming-all-courses is the legacy route preserved for SEO.
 * The display label is 'Development' to match live-site terminology.
 * Do not rename the slug without an SEO migration plan (redirects).
 *
 * ARRAY ORDER is no longer the display order: PublicHeaderClient sorts by the
 * admin's SkillOrder rows. It remains load-bearing as (a) the order used when
 * that read fails or returns nothing, and (b) the deterministic tie-break
 * between two skills with equal `order`. See lib/navmenu/skillOrder.js.
 */
export const skills = [
  {
    slug: 'power-platform',
    upstreamId: '68d3c5af2c6a2f1315c0bcdc',
    upstreamCode: 'POWERPLATFORM',
    label: 'Power Platform',
    iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1758786278/skills/icons/uharw9ah3z7d7uv6jdwp.svg',
  },
  {
    slug: 'business',
    upstreamId: '68d4f506581cb350290597c6',
    upstreamCode: 'BUSINESS',
    label: 'Business',
    iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1785810294/skills/icons/jmkcrqxll2vzg7tirmwn.svg',
  },
  {
    slug: 'data',
    upstreamId: '68d3c5af2c6a2f1315c0bcdb',
    upstreamCode: 'DATA',
    label: 'Data',
    iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1758785738/skills/icons/zsnmhvevmg6ovrvdq8f2.svg',
  },
  {
    slug: 'ai',
    upstreamId: '68d4f556581cb350290597d1',
    upstreamCode: 'AI',
    label: 'AI',
    iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1785811641/skills/icons/zmi3ins3w55r4mzteogw.svg',
  },
  {
    slug: 'programming',
    upstreamId: '68d4f5b3581cb350290597de',
    upstreamCode: 'DEV',
    label: 'Development',
    iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1758786958/skills/icons/d3ssdmq37a0pwt4mjdrc.svg',
  },
  {
    // Renamed upstream 2026-08-04: skill_name RPA → Automation, skill_id
    // RPA → AUT. The _id did NOT change, which is why the mega menu's course
    // column kept working while the URL and the article chips did not.
    slug: 'automation',
    // The slug this entry used to have. `/training-course?skill=rpa` is a live
    // URL — the filter dropdown emitted it into the query string on every use,
    // so it is in browser histories and anywhere a visitor pasted a filtered
    // list. Renaming `slug` without this line turns that URL into "show every
    // course", silently, which is the same failure as /rpa-all-courses.
    legacySlugs: ['rpa'],
    upstreamId: '68d4f493581cb350290597b5',
    upstreamCode: 'AUT',
    label: 'Automation',
    iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1785810308/skills/icons/tfhdzfm4kjpscos3purp.svg',
  },
  {
    // Added upstream 2026-08-04. Appended rather than inserted at the admin's
    // position (SkillOrder has it at order 2): after the SkillOrder join the
    // array position is only the degraded-mode order and the tie-break, and
    // appending keeps this a pure addition — no existing line moves, so the
    // diff shows exactly one new skill. A new skill sorting last when the DB
    // read fails is the conservative default.
    slug: 'design',
    upstreamId: '6a6b2feffb3b926a738f3bcf',
    upstreamCode: 'DES',
    label: 'Design',
    iconUrl: 'https://res.cloudinary.com/ddva7xvdt/image/upload/v1785810225/skills/icons/ribzalmadwlzbmowkym4.svg',
  },
];

/**
 * Look up a skill entry by UI slug. Returns null if unknown.
 *
 * Matches the canonical `slug` FIRST, then any `legacySlugs`. Canonical wins
 * on a collision — a value that is one entry's current slug and another's
 * retired one must resolve to the live skill, never to the ghost.
 *
 * ── THE RULE THIS ESTABLISHES, FOR THE NEXT RENAME ────────────────────────
 *
 * WHEN A SLUG CHANGES, THE OLD VALUE MOVES INTO `legacySlugs` IN THE SAME
 * COMMIT. Not later, not in a follow-up — the commit that renames is the
 * commit that keeps the old URL working, because between the two there is a
 * deploy that answers the old URL with a plausible wrong page.
 *
 * This is the SECOND defect of exactly that shape found on 2026-08-04, and
 * both came from one upstream rename:
 *
 *   /rpa-all-courses           served the ENTIRE catalog under an H1 of the
 *                              raw slug, HTTP 200. Fixed with a permanent
 *                              redirect in next.config.mjs.
 *   ?skill=rpa                 dropped the filter and showed every course.
 *                              Fixed here.
 *
 * Neither threw, neither logged, and both look like a working page. A slug is
 * a promise to every link that was ever built from it; `slug` is what we
 * OFFER, `legacySlugs` is what we still ACCEPT. Nothing may ever build a
 * control, a menu or a canonical URL from a legacy value — FilterBar's
 * dropdown reads `slug` only, and a test pins that.
 */
export function findSkillBySlug(slug) {
  if (!slug) return null;
  return (
    skills.find((s) => s.slug === slug) ??
    skills.find((s) => s.legacySlugs?.includes(slug)) ??
    null
  );
}

/**
 * Career paths — hardcoded list for nav.
 *
 * Intentionally static: the nav is rendered on every public page and we
 * don't want a DB roundtrip in the header. Public detail/landing pages
 * read from the synced CareerPath cache (see /lib/career-paths/) — keep
 * this list in step with `careerpath.api_slug` (slug without the
 * `-career-path` suffix).
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
  // Career Path, TNHS, and หลักสูตรออนไลน์ are NOT top-level items —
  // they live only inside the หลักสูตร mega menu panel.
  { label: 'ตารางฝึกอบรม', href: '/schedule' },
  { label: 'โปรโมชัน',     href: '/promotions' },
  { label: 'บทความ',       href: '/articles' },
  { label: 'ผลงานของเรา',  href: '/portfolio' },
  {
    label: 'ติดต่อเรา',
    href: '/contact-us',
    children: [
      { label: 'แผนที่และการเดินทาง',            href: '/contact-us' },
      { label: 'โรงแรมและร้านอาหารใกล้ 9Expert', href: '/restaurant-and-hotel-nearby-9expert-training' },
      { label: 'Social Channels',                 href: '/social' },
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
    { label: 'โปรโมชัน', href: '/promotions' },
    { label: 'คำถามที่พบบ่อย', href: '/faq' },
  ],
};

/**
 * Legal links for the footer's bottom bar, beside the © line.
 *
 * Deliberately NOT imported from config/policies.js, for two reasons:
 *
 *  1. policies.js imports siteConfig (for the legal entity name). Importing it
 *     back would close a cycle around a value read at module-init.
 *  2. These labels are not the page titles. A bottom bar has room for
 *     'นโยบายความเป็นส่วนตัว', not
 *     'นโยบายคุ้มครองข้อมูลส่วนบุคคล (Privacy Policy)'. Shorter labels for a
 *     denser context is different data, not a second copy of the same data.
 *
 * The `href`s ARE the same four values, and that is the part worth keeping
 * honest — test/fs/reservedPaths asserts each one is a real route.
 */
export const policyNav = [
  { label: 'นโยบายความเป็นส่วนตัว', href: '/privacy-policy' },
  { label: 'นโยบายการใช้คุกกี้',    href: '/cookie-policy' },
  { label: 'ข้อกำหนดและเงื่อนไข',   href: '/terms' },
  { label: 'การยกเลิกและคืนเงิน',   href: '/refund-policy' },
];
