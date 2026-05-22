'use client';

/**
 * Small client island used by the registration detail page (server
 * component) to flip status without forcing the whole page client-side.
 *
 * Status enum + badge colours must stay in sync with
 * CareerPathRegistrationsClient — both files import nothing from each
 * other on purpose (one runs on the server detail page, the other in
 * the dashboard table), so the constants are duplicated here.
 */

import { useState, useTransition } from 'react';
import { updateRegistrationStatus } from '@/lib/actions/career-path-registrations';

const STATUS_OPTIONS = [
  'ลงทะเบียน',
  'ออกใบเสนอราคาแล้ว',
  'รอเพิ่มข้อมูลผู้เรียน',
  'สำเร็จ',
  'มีรอบถูกยกเลิก',
  'ยกเลิก',
  'ใบเสนอราคาหมดอายุ',
];

const STATUS_BADGE = {
  'ลงทะเบียน':            'bg-blue-50 text-blue-700 border-blue-100',
  'ออกใบเสนอราคาแล้ว':    'bg-yellow-50 text-yellow-700 border-yellow-100',
  'รอเพิ่มข้อมูลผู้เรียน': 'bg-orange-50 text-orange-700 border-orange-100',
  'สำเร็จ':               'bg-green-50 text-green-700 border-green-100',
  'มีรอบถูกยกเลิก':       'bg-red-50 text-red-700 border-red-100',
  'ยกเลิก':               'bg-gray-100 text-gray-600 border-gray-200',
  'ใบเสนอราคาหมดอายุ':    'bg-gray-100 text-gray-600 border-gray-200',
};

export function RegistrationStatusSelect({ id, initialStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();
  const badge = STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600 border-gray-200';

  function handleChange(e) {
    const next = e.target.value;
    if (next === status) return;
    const prev = status;
    setStatus(next); // optimistic
    startTransition(async () => {
      const res = await updateRegistrationStatus(id, next);
      if (!res?.ok) setStatus(prev);
    });
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={pending}
      className={
        'w-full cursor-pointer rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-9e-action disabled:opacity-50 ' +
        badge
      }
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}
