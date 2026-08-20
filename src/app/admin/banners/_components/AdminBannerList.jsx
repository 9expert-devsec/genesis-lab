'use client';

import { useState, useTransition } from 'react';
import { deleteBanner } from '@/lib/actions/banners';
import { ALL_TYPE_LABELS } from '@/lib/banners/bannerTypes';

// Was a local copy of the five legacy labels. It is now the shared map, which
// also covers the four new type ids — so a record saved as `image` or `video`
// gets a name here instead of falling through to its raw id.
const TYPE_LABELS = ALL_TYPE_LABELS;

export function AdminBannerList({ banners }) {
  const [items, setItems] = useState(banners);
  const [pendingId, setPendingId] = useState(null);
  const [, startTransition] = useTransition();

  function handleDelete(id) {
    if (!confirm('ลบ Banner นี้?')) return;
    setPendingId(id);
    startTransition(async () => {
      await deleteBanner(id);
      setItems((prev) => prev.filter((b) => b._id !== id));
      setPendingId(null);
    });
  }

  return (
    <div className="bg-white rounded-9e-lg border border-[var(--surface-border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-9e-ice border-b border-[var(--surface-border)]">
            <th className="text-left px-4 py-3 font-bold text-9e-navy w-16">ลำดับ</th>
            <th className="text-left px-4 py-3 font-bold text-9e-navy">ชื่อ Banner</th>
            <th className="text-left px-4 py-3 font-bold text-9e-navy">ประเภท</th>
            <th className="text-center px-4 py-3 font-bold text-9e-navy w-20">Active</th>
            <th className="text-right px-4 py-3 font-bold text-9e-navy w-36">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center py-8 text-9e-slate-dp-50">
                ยังไม่มี Banner
              </td>
            </tr>
          )}
          {items.map((b) => (
            <tr
              key={b._id}
              className="border-b border-[var(--surface-border)] last:border-0 hover:bg-9e-ice/50 transition-colors"
            >
              <td className="px-4 py-3 text-9e-slate-dp-50 text-center">{b.weight}</td>
              <td className="px-4 py-3 font-medium text-9e-navy">
                {/* `title` is OPTIONAL on course and article records — it is an
                    override of the referenced record's own name, and leaving it
                    blank is the non-stale choice (see the note on `title` in
                    models/Banner.js). So this column can legitimately receive an
                    empty string, and rendering it bare would give a nameless row
                    with no clue why. Say what the record will actually show
                    instead of showing nothing. */}
                {b.title || (
                  <span className="text-9e-slate-dp-50 font-normal italic">
                    (ใช้ชื่อจากคอร์ส/บทความที่อ้างถึง)
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-9e-slate-dp-50">
                {TYPE_LABELS[b.type] ?? b.type}
              </td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    b.active ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <a
                    href={`/admin/banners/${b._id}/edit`}
                    className="text-xs px-3 py-1 border border-9e-action text-9e-action rounded-9e-sm hover:bg-9e-action hover:text-white transition-colors"
                  >
                    แก้ไข
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(b._id)}
                    disabled={pendingId === b._id}
                    className="text-xs px-3 py-1 border border-red-300 text-red-500 rounded-9e-sm hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {pendingId === b._id ? 'กำลังลบ...' : 'ลบ'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
