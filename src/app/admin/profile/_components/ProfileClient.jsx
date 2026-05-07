'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateOwnProfile } from '@/lib/actions/admin-accounts';

export function ProfileClient({ initialName }) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setOk('');

    if (newPassword && newPassword !== confirmPassword) {
      setError('รหัสผ่านใหม่ไม่ตรงกัน');
      return;
    }

    setPending(true);
    try {
      const result = await updateOwnProfile({
        name,
        currentPassword,
        newPassword,
      });
      if (!result.ok) {
        setError(result.error ?? 'บันทึกไม่สำเร็จ');
      } else {
        setOk('บันทึกเรียบร้อย');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        router.refresh();
      }
    } catch (err) {
      setError(err?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-5"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
          ชื่อแสดง
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
        />
      </div>

      <div className="border-t border-[var(--surface-border)] pt-4">
        <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">
          เปลี่ยนรหัสผ่าน <span className="text-xs text-[var(--text-muted)]">(เว้นว่างถ้าไม่เปลี่ยน)</span>
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              รหัสผ่านปัจจุบัน
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              ยืนยันรหัสผ่านใหม่
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-9e-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {ok && (
        <p className="rounded-9e-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {ok}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-9e-brand disabled:opacity-50"
      >
        {pending ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </form>
  );
}
