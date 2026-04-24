import { ChevronRight } from 'lucide-react';

/**
 * In-page jump links. Each entry is filtered by whether its target
 * section will actually render — no dead anchors.
 */
export function SidebarNav({ course, hasSchedules, hasRelated }) {
  const links = [
    { id: 'schedule', label: 'ตารางฝึกอบรม', show: hasSchedules },
    {
      id: 'description',
      label: 'รายละเอียดหลักสูตร',
      show: !!course?.course_teaser,
    },
    {
      id: 'objective',
      label: 'วัตถุประสงค์',
      show: !!course?.course_objectives?.length,
    },
    {
      id: 'target',
      label: 'หลักสูตรนี้เหมาะสำหรับ',
      show: !!course?.course_target_audience?.length,
    },
    {
      id: 'prerequisite',
      label: 'พื้นฐานของผู้เข้าอบรม',
      show: !!course?.course_prerequisites?.length,
    },
    {
      id: 'requirement',
      label: 'ความต้องการของระบบ',
      show: !!course?.course_system_requirements?.length,
    },
    {
      id: 'outline',
      label: 'หัวข้อการฝึกอบรม',
      show: !!course?.training_topics?.length,
    },
    {
      id: 'roadmap',
      label: 'Road Map',
      show: !!course?.course_roadmap_url,
    },
    { id: 'related', label: 'หลักสูตรที่เกี่ยวข้อง', show: hasRelated },
  ].filter((l) => l.show);

  if (!links.length) return null;

  return (
    <nav className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <ul className="space-y-1">
        {links.map((link) => (
          <li key={link.id}>
            <a
              href={`#${link.id}`}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-9e-slate transition-colors duration-9e-micro ease-9e hover:bg-9e-ice hover:text-9e-primary"
            >
              <ChevronRight
                className="h-3 w-3 text-9e-sky"
                strokeWidth={2.5}
              />
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
