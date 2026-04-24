'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { courseHref } from '@/lib/utils';

export function CourseTableGroup({ program, courses }) {
  const router = useRouter();

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-3">
        {program?.programiconurl && (
          <Image
            src={program.programiconurl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
            unoptimized
          />
        )}
        <h2 className="text-lg font-bold text-9e-navy">
          {program?.program_name ?? 'หลักสูตร'}
        </h2>
        <span className="rounded-full bg-9e-sky/20 px-2 py-0.5 text-xs font-bold text-9e-primary">
          {courses.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="bg-9e-primary px-4 py-3 text-left font-bold text-white">
                ชื่อหลักสูตร
              </th>
              <th className="bg-9e-primary px-4 py-3 text-left font-bold text-white">
                โปรแกรม
              </th>
              <th className="bg-9e-primary px-4 py-3 text-center font-bold text-white">
                วัน
              </th>
              <th className="bg-9e-primary px-4 py-3 text-center font-bold text-white">
                ชม.
              </th>
              <th className="bg-9e-primary px-4 py-3 text-right font-bold text-white">
                ราคา (บาท)
              </th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => {
              const href = courseHref(
                c.course_id ? String(c.course_id).toLowerCase() : ''
              );
              const days = c.course_trainingdays ?? 0;
              return (
                <tr
                  key={c._id ?? c.course_id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(href)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(href);
                    }
                  }}
                  className="cursor-pointer border-b border-gray-100 transition-colors duration-9e-micro ease-9e last:border-b-0 hover:bg-9e-ice"
                >
                  <td className="px-4 py-3 font-medium text-9e-navy">
                    {c.course_name}
                  </td>
                  <td className="px-4 py-3 text-9e-slate">
                    {c.program?.program_name ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-center text-9e-slate">
                    {days || '-'}
                  </td>
                  <td className="px-4 py-3 text-center text-9e-slate">
                    {days ? days * 6 : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-9e-navy">
                    {c.course_price != null
                      ? Number(c.course_price).toLocaleString('th-TH')
                      : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
