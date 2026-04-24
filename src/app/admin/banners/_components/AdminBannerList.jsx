'use client';

import { useState, useTransition } from 'react';
import { deleteBanner } from '@/lib/actions/banners';

const TYPE_LABELS = {
  youtube:              'Video Banner',
  image_desktop:        'Hero Image (Desktop)',
  image_mobile:         'Hero Image (Mobile)',
  image_button_desktop: 'Section Banner (Desktop)',
  image_button_mobile:  'Section Banner (Mobile)',
};

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
              <td colSpan={5} className="text-center py-8 text-9e-slate">
                ยังไม่มี Banner
              </td>
            </tr>
          )}
          {items.map((b) => (
            <tr
              key={b._id}
              className="border-b border-[var(--surface-border)] last:border-0 hover:bg-9e-ice/50 transition-colors"
            >
              <td className="px-4 py-3 text-9e-slate text-center">{b.weight}</td>
              <td className="px-4 py-3 font-medium text-9e-navy">{b.title}</td>
              <td className="px-4 py-3 text-9e-slate">
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
                    className="text-xs px-3 py-1 border border-9e-primary text-9e-primary rounded-9e-sm hover:bg-9e-primary hover:text-white transition-colors"
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
