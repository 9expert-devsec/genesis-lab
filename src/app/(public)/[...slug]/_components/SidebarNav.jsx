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
 * In-page jump links. Each entry is filtered by whether its target
 * section will actually render — no dead anchors.
 */
export function SidebarNav({ course, hasSchedules, hasRelated, hasFaqs }) {
  const links = [
    {
      id: 'schedule',
      label: 'ตารางฝึกอบรม',
      icon: CalendarDays,
      show: hasSchedules,
    },
    {
      id: 'description',
      label: 'รายละเอียดหลักสูตร',
      icon: FileText,
      show: !!course?.course_teaser,
    },
    {
      id: 'objective',
      label: 'วัตถุประสงค์',
      icon: Target,
      show: !!course?.course_objectives?.length,
    },
    {
      id: 'target',
      label: 'หลักสูตรนี้เหมาะสำหรับ',
      icon: Users,
      show: !!course?.course_target_audience?.length,
    },
    {
      id: 'prerequisite',
      label: 'พื้นฐานของผู้เข้าอบรม',
      icon: GraduationCap,
      show: !!course?.course_prerequisites?.length,
    },
    {
      id: 'requirement',
      label: 'ความต้องการของระบบ',
      icon: Monitor,
      show: !!course?.course_system_requirements?.length,
    },
    {
      id: 'outline',
      label: 'หัวข้อการฝึกอบรม',
      icon: ListChecks,
      show: !!course?.training_topics?.length,
    },
    {
      id: 'roadmap',
      label: 'Road Map',
      icon: Map,
      show: !!(
        course?.course_roadmap_desktop_url || course?.course_roadmap_mobile_url
      ),
    },
    {
      id: 'faq',
      label: 'คำถามที่พบบ่อย',
      icon: CircleHelp,
      show: Boolean(hasFaqs),
    },
    {
      id: 'related',
      label: 'หลักสูตรที่เกี่ยวข้อง',
      icon: BookOpen,
      show: hasRelated,
    },
  ].filter((l) => l.show);

  if (!links.length) return null;

  return (
    <nav className="rounded-2xl border border-[var(--surface-divider)] bg-[var(--surface-raised)] p-4 shadow-9e-md">
      <ul className="space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-base text-[var(--text-secondary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-hover)] hover:text-9e-action"
              >
                <Icon
                  className="h-[18px] w-[18px] shrink-0 text-9e-air"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                {link.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
