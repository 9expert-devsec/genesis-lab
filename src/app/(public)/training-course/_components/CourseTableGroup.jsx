'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { courseLinkHref } from '@/lib/courses/courseLinkHref';
import {
  INHOUSE_ONLY_LABEL,
  coursePriceLabel,
  isInhouseOnlyPrice,
} from '@/lib/coursePriceLabel';
import { COLUMNS, TABLE_MIN_WIDTH } from '@/lib/courseTableLayout';

/**
 * What each column puts in a `<td>`, keyed off COLUMNS[].key.
 *
 * Split from the widths (which live in lib/courseTableLayout so the `pure` tier
 * can check them without a DOM) but driven by the SAME array on render, so the
 * colgroup, the header row and the body row cannot drift out of order with each
 * other. Only the cell's own extra classes live here — alignment comes from the
 * column, so a column's heading and its cells cannot disagree about it either.
 */
const CELLS = {
  name: {
    className: 'font-medium text-9e-navy dark:text-white',
    render: (c) => c.course_name,
  },
  program: {
    className: 'text-9e-slate-dp-50 dark:text-[#94a3b8]',
    render: (c) => c.program?.program_name ?? '-',
  },
  days: {
    className: 'text-9e-slate-dp-50 dark:text-[#94a3b8]',
    render: (c) => (c.course_trainingdays ?? 0) || '-',
  },
  hours: {
    className: 'text-9e-slate-dp-50 dark:text-[#94a3b8]',
    render: (c) => {
      const days = c.course_trainingdays ?? 0;
      return days ? days * 6 : '-';
    },
  },
  price: {
    /*
      THE WIDTH IS SET IN lib/courseTableLayout, NOT BY THIS CELL OR BY ITS
      HEADER. This comment used to argue that `ราคา (บาท / ท่าน)` is already
      wider than "Inhouse Only" at this size, so the header — not the cells —
      sizes the column. That reasoning held only under AUTO layout; the table is
      `table-fixed` now, where the colgroup sizes the column and the header
      sizes nothing at all.

      The measured 136px was chosen to fit BOTH, on its own evidence rather than
      on which of the two is larger: the header needs 97.7px + 32px padding =
      129.7px, and "Inhouse Only" needs 86.5px + 32px = 118.5px. 136 clears the
      larger of the two with 6.3px to spare, so `whitespace-nowrap` below is
      safe to keep — it is now a guarantee that the price never wraps, not a
      prop holding the column open.
    */
    className: 'whitespace-nowrap font-semibold text-9e-navy dark:text-white',
    render: (c) =>
      isInhouseOnlyPrice(c.course_price) ? (
        <span className="text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {INHOUSE_ONLY_LABEL}
        </span>
      ) : (
        coursePriceLabel(c.course_price)
      ),
  },
};

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
        <h2 className="text-lg font-bold text-9e-navy dark:text-white">
          {program?.program_name ?? 'หลักสูตร'}
        </h2>
        <span className="rounded-full bg-9e-air/20 px-2 py-0.5 text-xs font-bold text-9e-action dark:bg-[#111d2c] dark:text-9e-air">
          {courses.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:shadow-none">
        {/*
          `table-fixed` plus the colgroup is the whole fix. Without them the
          browser used AUTO layout, sizing each group's table from its OWN
          content — so โปรแกรม, วัน and ชม. landed in different places in the
          Power BI group than in the Microsoft Excel group, because each program
          group is a separate <table> and nothing was shared between them.

          `min-width` is inline and DERIVED from the column array rather than a
          `min-w-[744px]` class: a template-literal arbitrary value would emit no
          class at all (the compiler scans text, it never evaluates it), and a
          hand-written literal would be a second copy of the number free to drift.
          The wrapper above is already `overflow-x-auto`, so below 744px the
          table scrolls instead of squashing every column toward zero.
        */}
        <table
          className="w-full table-fixed border-collapse text-sm"
          style={{ minWidth: TABLE_MIN_WIDTH }}
        >
          <colgroup>
            {COLUMNS.map((col) => (
              <col
                key={col.key}
                style={col.width === null ? undefined : { width: col.width }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`bg-9e-action px-4 py-3 font-bold text-white ${col.align}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => {
              // Canonical path, from the shared rule — the row carries urlAlias.
              const href = courseLinkHref(c);
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
                  className="cursor-pointer border-b border-gray-100 transition-colors duration-9e-micro ease-9e last:border-b-0 hover:bg-9e-ice dark:border-[#1e3a5f] dark:hover:bg-[#0f1e30]"
                >
                  {COLUMNS.map((col) => {
                    const cell = CELLS[col.key];
                    return (
                      <td
                        key={col.key}
                        className={`px-4 py-3 ${col.align} ${cell.className}`}
                      >
                        {cell.render(c)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
