/**
 * The FULL-SHAPE header fixture: every key production hands PublicHeaderClient
 * TODAY, before lib/navmenu/headerProps projects it.
 *
 * Key sets were read off the live flight payload on 2026-09-21 (the `$L43`
 * row of a production 404 — programs from the upstream API, career paths /
 * masterclasses / TNHS / online rows from Mongo through `serialize`, the nav
 * snapshot from NavMenuCache). Values are short stand-ins; the SHAPE is the
 * point. A field the menu never reads must be present here, or the parity
 * test proves nothing about dropping it.
 *
 * Shared by test/render/headerPropsProjection.test.mjs and the DOM drive in
 * test/headerPropsParity.case.mjs, so both compare the same two inputs.
 * Not a test file — `.mjs`, neither the manifest nor the discovery guard
 * picks it up.
 */
import { skills as CONFIG_SKILLS } from '@/config/site';

const LONG = (label) => `${label} `.repeat(40).trim();

const program = (id, name, icon) => ({
  _id: `pid-${id.toLowerCase()}`,
  program_id: id,
  program_name: name,
  programiconurl: icon,
  programcolor: '#de7356',
  program_teaser: LONG(`${name} teaser`),
  program_roadmap_url: `https://example.test/roadmap/${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  skills: [
    { skill_id: 'SK1', skill_name: 'Skill One', skilliconurl: '', skillcolor: '#000', skill_teaser: LONG('skill') },
  ],
  skillCount: 1,
});

const careerPath = (slug, title, hero) => ({
  _id: `cp-${slug}`,
  career_path_id: slug.toUpperCase(),
  __v: 0,
  api_slug: slug,
  benefits: [LONG('benefit')],
  createdAt: '2026-01-01T00:00:00.000Z',
  curriculum: [
    { kind: 'publicCourse', sortOrder: 0, price: 9900, note: '', snap: { course_id: 'EXC-L1', course_name: 'Excel' }, prerequisites: [] },
    { kind: 'externalCourse', sortOrder: 1, externalName: 'Ext', externalUrl: 'https://example.test', prerequisites: ['EXC-L1'] },
  ],
  description_html: `<p>${LONG('description')}</p>`,
  display_order: 1,
  hero_image_alt: title,
  hero_image_url: hero,
  intro: LONG('intro'),
  is_active: true,
  links: [],
  objectives: [LONG('objective')],
  prerequisites: [],
  price: 19900,
  roadmap_image_alt: '',
  roadmap_image_url: '',
  short_description: LONG('short'),
  suitable_for: [LONG('suitable')],
  synced_at: '2026-09-01T00:00:00.000Z',
  tagline: 'tagline',
  title,
  updatedAt: '2026-09-01T00:00:00.000Z',
  upstream_order: 1,
  upstream_status: 'active',
  registrationOpen: true,
  requiredSelections: 2,
  registerBannerPublicId: null,
  registerBannerUrl: null,
});

const masterclass = (id, slug, title, cover) => ({
  _id: id,
  slug,
  course_code: `MC-${id}`,
  title_th: title,
  subtitle_th: LONG('subtitle'),
  description_html: `<p>${LONG('masterclass')}</p>`,
  cover_image_url: cover,
  cover_image_public_id: 'x/y',
  course_outline_url: '',
  duration_days: 2,
  duration_hours: 12,
  schedule_days: 'Sat–Sun',
  time_start: '09:00',
  time_end: '16:00',
  level: 'advanced',
  tags: ['ai'],
  suitable_for: [LONG('who')],
  prerequisites: [LONG('pre')],
  objectives: [LONG('obj')],
  benefits: [LONG('ben')],
  equipment_required: '',
  system_requirements: '',
  license_options: [],
  instructor_ids: ['i1'],
  curriculum: [{ title: 'Day 1', items: [LONG('topic')] }],
  is_published: true,
  is_active: true,
  display_order: 1,
  faq_category: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  __v: 0,
  hero_gradient_from: '#000',
  hero_gradient_to: '#fff',
  system_requirements_html: '',
  gallery: [{ type: 'image', url: 'https://example.test/g.jpg' }],
  batches: [{ _id: 'b1', status: 'open', seats: 20 }],
});

const tnhs = (id, name, cover, url) => ({
  _id: id, course_name: name, cover_url: cover, external_url: url,
  sort_order: 1, is_active: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', __v: 0,
});

const online = (id, courseId, name, cover, url) => ({
  _id: id, course_id: courseId, course_name: name, course_cover_url: cover, course_url: url,
  sort_order: 1, active: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', __v: 0,
});

const navItem = (id, name, alias) => ({ course_id: id, course_name: name, urlAlias: alias });
const navGroup = (items, cover) => ({ items, firstCover: cover });

// One skill keyed the way the client keys it: by the config entry's upstreamId.
const FIRST_SKILL = CONFIG_SKILLS[0];

export const FULL_PROPS = Object.freeze({
  programs: [
    program('EXCEL', 'Microsoft Excel', 'https://example.test/excel.png'),
    program('PBI', 'Power BI', 'https://example.test/pbi.png'),
    program('NOICON', 'No Icon Program', ''),
  ],
  dynamicCareerPaths: [
    careerPath('data-analyst-career-path', 'Data Analyst', 'https://example.test/da.jpg'),
    careerPath('prompt-engineer-career-path', '', ''),
  ],
  tnhsCourses: [
    tnhs('t1', 'TNHS One', 'https://example.test/t1.jpg', 'https://www.thenexthumansskills.com/one'),
    tnhs('t2', 'TNHS Two', '', ''),
  ],
  navOnlineCourses: [
    online('o1', 'ON-1', 'Online One', 'https://example.test/o1.jpg', 'https://academy.example.test/one'),
    online('o2', 'ON-2', 'Online Two', '', ''),
  ],
  navMenuData: {
    programs: {
      EXCEL: navGroup(
        [navItem('EXC-L1', 'Excel Level 1', 'excel-level-1-training-course'), navItem('EXC-L2', 'Excel Level 2', null)],
        { course_id: 'EXC-L1', course_name: 'Excel Level 1', course_cover_url: 'https://example.test/exc.jpg', urlAlias: 'excel-level-1-training-course' },
      ),
      PBI: navGroup([navItem('PBI-L1', 'Power BI Level 1', null)], null),
      NOICON: navGroup([navItem('NI-1', 'No Icon Course', null)], null),
    },
    skills: {
      [FIRST_SKILL.upstreamId]: navGroup(
        [navItem('SK-1', 'Skill Course One', 'skill-course-one-training-course')],
        { course_id: 'SK-1', course_name: 'Skill Course One', course_cover_url: null, urlAlias: 'skill-course-one-training-course' },
      ),
    },
    programSlugs: { pbi: 'power-bi-all-courses' },
    skillSlugs: { [String(FIRST_SKILL.upstreamId).toLowerCase()]: `${FIRST_SKILL.slug}-all-courses` },
    skillOrder: {},
  },
  navMasterclasses: [
    masterclass('m1', 'claude-for-analysts', 'Claude for Analysts', 'https://example.test/m1.jpg'),
    masterclass('m2', 'power-bi-masterclass', 'Power BI Masterclass', ''),
  ],
});

/**
 * Fields the menu never reads — at least one per fat prop, for the leak check.
 * Checked as JSON keys against the whole projected output, so a name that is
 * ALSO a legitimate key elsewhere (`skills` is navMenuData's own group map)
 * does not belong here; `skillCount` stands in for the nested skills array.
 */
export const NEVER_READ = Object.freeze({
  programs: ['program_teaser', 'skillCount', 'createdAt'],
  dynamicCareerPaths: ['curriculum', 'description_html', 'benefits'],
  tnhsCourses: ['sort_order', 'createdAt'],
  navOnlineCourses: ['sort_order', 'createdAt'],
  navMasterclasses: ['description_html', 'curriculum', 'batches'],
});
