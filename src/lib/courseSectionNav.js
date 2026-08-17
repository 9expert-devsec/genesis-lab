// src/lib/courseSectionNav.js
//
// The course detail page's in-page section navigation: WHICH jump links exist
// for a given course, and in what order.
//
// ONE definition, because there are two renderings of it — the desktop sidebar
// (SidebarNav) and the mobile tab strip (CourseSectionTabs). The show/filter
// rules are the interesting part and they are easy to get subtly wrong: every
// entry is gated on whether its target section will actually render, so a
// second copy produces DEAD ANCHORS the first time a section's condition
// changes and only one copy is updated. A link to #roadmap on a course with no
// roadmap scrolls nowhere and looks like a broken page.
//
// This repo has paid for that shape more than once — five schedule-status maps,
// one horizon constant written three ways, a rate-limit window released in two
// places — so the list lives here and both renderings import it.

import {
  BookOpen,
  CalendarDays,
  CircleHelp,
  FileText,
  GraduationCap,
  ListChecks,
  Map,
  Monitor,
  Target,
  Users,
} from 'lucide-react';

/**
 * The scroll offset every jump target on this page must carry, as one class.
 *
 * ── WHY IT IS A CONSTANT AND NOT FOUR COPIES ────────────────────────────────
 * The anchors are spread across ScheduleSection, ContentSection, RelatedCourses
 * and page.jsx's FAQ block. Four copies of a number that must agree is the
 * shape this repo keeps getting bitten by, and the failure here is quiet: a
 * section whose offset was not updated scrolls to a heading hidden UNDER the
 * chrome, which looks like a broken anchor rather than a wrong number.
 *
 * ── THE ARITHMETIC, AND WHERE EACH TERM COMES FROM ──────────────────────────
 * Below lg, two things sit above the content and both are sticky:
 *   80px  the site header — PublicHeaderClient's inner container is `h-20`,
 *         and the header itself is `sticky top-0`;
 *   48px  the section tab strip — CourseSectionTabs pins its row to `h-12`
 *         precisely so this number is a declared height rather than a
 *         measurement nobody can check;
 *   16px  the same breathing room the old lone value already had (96 - 80).
 * 80 + 48 + 16 = 144px = scroll-mt-36.
 *
 * At lg the strip does not exist and the sidebar takes over, so the offset
 * returns to the original 96px. That is why this is a responsive PAIR and not
 * a single number: widening it everywhere would push every desktop jump 48px
 * too far down for a strip that is not on screen.
 *
 * Written as literal class names because Tailwind's content scan reads source
 * text — a class assembled at runtime emits no CSS and fails silently. src/lib
 * is inside the content globs, so these generate. Verified against the real
 * config: scroll-mt-36 is 9rem, lg:scroll-mt-24 is 6rem.
 */
export const SECTION_ANCHOR_CLASS = 'scroll-mt-36 lg:scroll-mt-24';

/**
 * WHAT THE PUBLIC PAGE CALLS EACH SECTION — the one spelling, for both the
 * page and the admin form that edits it.
 *
 * ── WHY THE ADMIN FORM IMPORTS THIS ────────────────────────────────────────
 * /admin/courses' form is used by people who look at the public page all day.
 * When the form said ความรู้พื้นฐาน and the page said พื้นฐานของผู้เข้าอบรม for the
 * same `course_prerequisites`, every edit cost them a translation step — and
 * the two could drift further with nobody noticing, because no code connected
 * them. THE PUBLIC PAGE IS AUTHORITATIVE: these values are what the page
 * already rendered, copied here unchanged, and the form was brought to them.
 *
 * Keyed by SECTION ID, which is also the anchor id and the key
 * `courseSectionLinks` returns — so the label, the jump target and the heading
 * cannot disagree about which section they mean.
 *
 * ── WHAT THIS MODULE CAN AND CANNOT UNIFY ──────────────────────────────────
 * `courseSectionLinks` below now reads from here, so the nav is provably the
 * same string. The four `ContentSection title="…"` props in
 * (public)/[...slug]/_components are NOT re-sourced from here — that would mean
 * editing four public components in a round scoped to the admin labels, on the
 * authoritative side. They are instead PINNED to this map by
 * test/fs/courseLabelParity, which reads their literal titles out of source and
 * compares. A heading changed there without changing this reddens.
 *
 * Safe to import from a client component: this module pulls lucide icons and
 * nothing else — no server config, no upstream client.
 */
export const COURSE_SECTION_LABELS = Object.freeze({
  schedule:     'ตารางฝึกอบรม',
  description:  'รายละเอียดหลักสูตร',
  objective:    'วัตถุประสงค์',
  target:       'หลักสูตรนี้เหมาะสำหรับ',
  prerequisite: 'พื้นฐานของผู้เข้าอบรม',
  requirement:  'ความต้องการของระบบ',
  outline:      'หัวข้อการฝึกอบรม',
  roadmap:      'Road Map',
  faq:          'คำถามที่พบบ่อย',
  related:      'หลักสูตรที่เกี่ยวข้อง',
});

/**
 * The jump links for one course, already filtered to the sections that render.
 *
 * Returns entries of `{ id, label, icon }` — `id` matches the target section's
 * DOM id, so `#${id}` is the href. Order is the page's reading order, which is
 * also the order both renderings display.
 *
 * An empty array is a real answer: a course with none of these sections has no
 * navigation, and both renderings return null rather than an empty shell.
 */
export function courseSectionLinks({ course, hasSchedules, hasRelated, hasFaqs }) {
  return [
    {
      id: 'schedule',
      label: COURSE_SECTION_LABELS.schedule,
      icon: CalendarDays,
      show: hasSchedules,
    },
    {
      id: 'description',
      label: COURSE_SECTION_LABELS.description,
      icon: FileText,
      show: !!course?.course_teaser,
    },
    {
      id: 'objective',
      label: COURSE_SECTION_LABELS.objective,
      icon: Target,
      show: !!course?.course_objectives?.length,
    },
    {
      id: 'target',
      label: COURSE_SECTION_LABELS.target,
      icon: Users,
      show: !!course?.course_target_audience?.length,
    },
    {
      id: 'prerequisite',
      label: COURSE_SECTION_LABELS.prerequisite,
      icon: GraduationCap,
      show: !!course?.course_prerequisites?.length,
    },
    {
      id: 'requirement',
      label: COURSE_SECTION_LABELS.requirement,
      icon: Monitor,
      show: !!course?.course_system_requirements?.length,
    },
    {
      id: 'outline',
      label: COURSE_SECTION_LABELS.outline,
      icon: ListChecks,
      show: !!course?.training_topics?.length,
    },
    {
      id: 'roadmap',
      label: COURSE_SECTION_LABELS.roadmap,
      icon: Map,
      show: !!(
        course?.course_roadmap_desktop_url || course?.course_roadmap_mobile_url
      ),
    },
    {
      id: 'faq',
      label: COURSE_SECTION_LABELS.faq,
      icon: CircleHelp,
      show: Boolean(hasFaqs),
    },
    {
      id: 'related',
      label: COURSE_SECTION_LABELS.related,
      icon: BookOpen,
      show: hasRelated,
    },
  ].filter((l) => l.show);
}
