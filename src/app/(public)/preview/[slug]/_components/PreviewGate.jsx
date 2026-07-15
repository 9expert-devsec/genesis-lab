'use client';

import { useActionState } from 'react';
import { Lock } from 'lucide-react';
import { submitPreviewPassword } from '@/lib/actions/previewAccess';

/**
 * PreviewGate — the password form and the terminal states. Client component
 * (form state only). It receives ONLY the slug and a state string: no page
 * content is ever passed here, so an unauthenticated response cannot leak the
 * draft.
 *
 * Terminal states (§13) are distinct: revoked/disabled and expired are dead
 * ends with no form; wrong-password and locked-out come back as `error` from
 * the action (verifyPreviewPassword owns those messages and the lockout).
 */
function Shell({ children }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-9e-sm">
        {children}
      </div>
    </div>
  );
}

function DeadEnd({ title, body }) {
  return (
    <Shell>
      <h1 className="text-lg font-bold text-9e-navy dark:text-white">{title}</h1>
      <p className="mt-2 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">{body}</p>
    </Shell>
  );
}

export function PreviewGate({ slug, state }) {
  const [result, formAction, pending] = useActionState(submitPreviewPassword, { error: null });

  if (state === 'disabled') {
    return (
      <DeadEnd
        title="ลิงก์พรีวิวถูกยกเลิกแล้ว"
        body="ลิงก์พรีวิวนี้ถูกปิดหรือถูกยกเลิกการเข้าถึงแล้ว โปรดติดต่อผู้ดูแลเพื่อขอลิงก์ใหม่"
      />
    );
  }
  if (state === 'expired') {
    return (
      <DeadEnd
        title="ลิงก์พรีวิวหมดอายุแล้ว"
        body="ลิงก์พรีวิวนี้เลยกำหนดวันหมดอายุแล้ว โปรดติดต่อผู้ดูแลเพื่อขอลิงก์ใหม่"
      />
    );
  }

  return (
    <Shell>
      <div className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-9e-action" aria-hidden />
        <h1 className="text-lg font-bold text-9e-navy dark:text-white">หน้านี้อยู่ในโหมดพรีวิว</h1>
      </div>
      <p className="mt-2 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
        กรุณากรอกรหัสผ่านเพื่อดูตัวอย่างหน้าฉบับร่าง
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="slug" value={slug} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-9e-slate-dp-50">รหัสผ่าน</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="off"
            className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          />
        </label>

        {result?.error && (
          <p className="rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {result.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังตรวจสอบ…' : 'เข้าดูตัวอย่าง'}
        </button>
      </form>
    </Shell>
  );
}
