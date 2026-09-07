'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AvatarUploadField } from '@/components/admin/AvatarUploadField';
import { setOwnAvatar } from '@/lib/actions/admin-avatar';

/**
 * The avatar block on /admin/profile: preview, upload, remove, and the save.
 *
 * ── WHY THIS SAVES IMMEDIATELY AND HAS NO SUBMIT BUTTON ─────────────────────
 * Picking a file already uploaded it to Cloudinary. If the write to Mongo then
 * waited for a separate "บันทึก" press, closing the tab would leave a file in
 * storage that no record points at — an orphan the delete path can never find,
 * because finding it needs the publicId that was only ever in React state. The
 * upload IS the intent; the save follows it.
 *
 * ── NO useOptimistic ────────────────────────────────────────────────────────
 * React is 18.3.1 here and the hook does not exist. It is also not wanted: the
 * value that comes back from the action is the value the DATABASE holds, and
 * showing the new photo before the write lands is exactly how a failed save
 * looks identical to a successful one.
 *
 * `value` is therefore local state seeded from the server and advanced only by
 * a confirmed result, and `router.refresh()` re-reads the layout so the sidebar
 * avatar catches up in the same interaction — the whole reason AdminLayout
 * reads this field from Mongo rather than from the session.
 */
export function ProfileAvatarCard({ initialPublicId = null }) {
  const router = useRouter();
  const [value, setValue] = useState(initialPublicId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function commit(nextPublicId) {
    setPending(true);
    setError('');
    setOk('');
    try {
      const result = await setOwnAvatar(nextPublicId);
      if (!result?.ok) {
        setError(result?.error ?? 'บันทึกไม่สำเร็จ');
        return;
      }
      // The DB's value, not the one that was sent. They agree today; if they
      // ever stop agreeing, the screen should show what was actually stored.
      setValue(result.imagePublicId ?? null);
      setOk(nextPublicId === null ? 'ลบรูปแล้ว' : 'บันทึกรูปเรียบร้อย');
      router.refresh();
    } catch (err) {
      setError(err?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-5">
      <p className="mb-4 text-sm font-medium text-[var(--text-primary)]">รูปโปรไฟล์</p>

      <AvatarUploadField value={value} onChange={commit} size={128} busy={pending} />

      {/* Same shapes ProfileClient uses for its two outcomes, so the two cards
          on this page report success and failure identically. */}
      {error && (
        <p role="alert" className="mt-4 rounded-9e-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {ok && (
        <p className="mt-4 rounded-9e-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {ok}
        </p>
      )}
    </div>
  );
}
