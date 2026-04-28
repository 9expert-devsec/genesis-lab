'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, KeyRound, X } from 'lucide-react';
import {
  createAdmin,
  updateAdmin,
  resetAdminPassword,
  deleteAdmin,
} from '@/lib/actions/admin-accounts';
import { cn } from '@/lib/utils';

const ROLE_STYLES = {
  superadmin: 'bg-blue-100 text-blue-700',
  owner:      'bg-blue-100 text-blue-700',
  admin:      'bg-gray-100 text-gray-700',
  editor:     'bg-yellow-100 text-yellow-700',
};

function RoleBadge({ role }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
        ROLE_STYLES[role] ?? 'bg-gray-100 text-gray-700'
      )}
    >
      {role}
    </span>
  );
}

function fmt(date) {
  return date ? new Date(date).toLocaleString('th-TH') : '—';
}

export function AccountsClient({ initialAdmins, currentUserId }) {
  const router = useRouter();
  const [admins, setAdmins] = useState(initialAdmins);
  const [isPending, startTransition] = useTransition();
  const [globalError, setGlobalError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null); // admin doc
  const [resetting, setResetting] = useState(null);
  const [deleting, setDeleting] = useState(null);

  function refresh() {
    // Server action mutations already revalidatePath. Re-fetch via
    // a router refresh so the server component re-runs `listAdmins()`.
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {globalError && (
        <div className="rounded-9e-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {globalError}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-9e-md bg-9e-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" />
          สร้างบัญชีใหม่
        </button>
      </div>

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">อีเมล</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">ชื่อ</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Role</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">สถานะ</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">เข้าใช้ล่าสุด</th>
              <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const isSelf = String(a._id) === String(currentUserId);
              return (
                <tr
                  key={a._id}
                  className="border-b border-[var(--surface-border)] last:border-b-0"
                >
                  <td className="px-4 py-3 text-[var(--text-primary)]">
                    {a.email}
                    {isSelf && (
                      <span className="ml-2 text-xs text-[var(--text-muted)]">(คุณ)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">{a.name}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={a.role} />
                  </td>
                  <td className="px-4 py-3">
                    {a.active ? (
                      <span className="text-green-600">ใช้งาน</span>
                    ) : (
                      <span className="text-[var(--text-muted)]">ปิดใช้</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                    {fmt(a.lastLoginAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(a)}
                        className="rounded-9e-sm p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-9e-primary"
                        aria-label="แก้ไข"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetting(a)}
                        className="rounded-9e-sm p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-9e-primary"
                        aria-label="รีเซ็ตรหัสผ่าน"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(a)}
                        disabled={isSelf}
                        className="rounded-9e-sm p-1.5 text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="ลบ"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {admins.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[var(--text-muted)]"
                >
                  ไม่มีบัญชี
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            refresh();
          }}
          onError={setGlobalError}
        />
      )}

      {editing && (
        <EditModal
          admin={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            refresh();
          }}
          onError={setGlobalError}
        />
      )}

      {resetting && (
        <ResetPasswordModal
          admin={resetting}
          onClose={() => setResetting(null)}
          onSuccess={() => {
            setResetting(null);
            refresh();
          }}
          onError={setGlobalError}
        />
      )}

      {deleting && (
        <DeleteConfirm
          admin={deleting}
          onClose={() => setDeleting(null)}
          onSuccess={() => {
            setDeleting(null);
            refresh();
          }}
          onError={setGlobalError}
        />
      )}
    </div>
  );
}

// ── Modal scaffold ──────────────────────────────────────────────

function ModalShell({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-9e-lg bg-[var(--surface)] p-6 shadow-9e-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Create ──────────────────────────────────────────────────────

function CreateModal({ onClose, onSuccess, onError }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      const result = await createAdmin({ email, name, password, role });
      if (!result.ok) {
        setError(result.error ?? 'สร้างบัญชีไม่สำเร็จ');
      } else {
        onSuccess();
      }
    } catch (err) {
      onError(err?.message ?? 'เกิดข้อผิดพลาด');
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <ModalShell title="สร้างบัญชีใหม่" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="อีเมล" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input"
          />
        </Field>
        <Field label="ชื่อ" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input"
          />
        </Field>
        <Field label="รหัสผ่าน (อย่างน้อย 8 ตัว)" required>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="input"
          />
        </Field>
        <Field label="Role" required>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="input"
          >
            <option value="superadmin">superadmin</option>
            <option value="admin">admin</option>
            <option value="editor">editor</option>
          </select>
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-9e-md bg-9e-primary px-4 py-2 text-sm font-medium text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังสร้าง...' : 'สร้างบัญชี'}
        </button>
        <FieldStyles />
      </form>
    </ModalShell>
  );
}

// ── Edit ────────────────────────────────────────────────────────

function EditModal({ admin, onClose, onSuccess, onError }) {
  const [name, setName] = useState(admin.name ?? '');
  const [role, setRole] = useState(admin.role ?? 'admin');
  const [active, setActive] = useState(Boolean(admin.active));
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      const result = await updateAdmin(admin._id, { name, role, active });
      if (!result.ok) {
        setError(result.error ?? 'บันทึกไม่สำเร็จ');
      } else {
        onSuccess();
      }
    } catch (err) {
      onError(err?.message ?? 'เกิดข้อผิดพลาด');
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <ModalShell title={`แก้ไข ${admin.email}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="ชื่อ">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="input"
          >
            <option value="superadmin">superadmin</option>
            <option value="admin">admin</option>
            <option value="editor">editor</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          เปิดใช้งาน (active)
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-9e-md bg-9e-primary px-4 py-2 text-sm font-medium text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        <FieldStyles />
      </form>
    </ModalShell>
  );
}

// ── Reset password ──────────────────────────────────────────────

function ResetPasswordModal({ admin, onClose, onSuccess, onError }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      const result = await resetAdminPassword(admin._id, password);
      if (!result.ok) {
        setError(result.error ?? 'รีเซ็ตไม่สำเร็จ');
      } else {
        onSuccess();
      }
    } catch (err) {
      onError(err?.message ?? 'เกิดข้อผิดพลาด');
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <ModalShell title={`รีเซ็ตรหัสผ่าน — ${admin.email}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" required>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="input"
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-9e-md bg-9e-primary px-4 py-2 text-sm font-medium text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก...' : 'รีเซ็ต'}
        </button>
        <FieldStyles />
      </form>
    </ModalShell>
  );
}

// ── Delete ──────────────────────────────────────────────────────

function DeleteConfirm({ admin, onClose, onSuccess, onError }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setError('');
    setPending(true);
    try {
      const result = await deleteAdmin(admin._id);
      if (!result.ok) {
        setError(result.error ?? 'ลบไม่สำเร็จ');
      } else {
        onSuccess();
      }
    } catch (err) {
      onError(err?.message ?? 'เกิดข้อผิดพลาด');
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <ModalShell title="ยืนยันการลบบัญชี" onClose={onClose}>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        ลบบัญชี <strong>{admin.email}</strong>? การกระทำนี้ไม่สามารถย้อนกลับได้
      </p>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm hover:bg-[var(--surface-muted)]"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="rounded-9e-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? 'กำลังลบ...' : 'ลบบัญชี'}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Tiny shared bits ────────────────────────────────────────────

function Field({ label, required, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--text-secondary)]">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function FieldStyles() {
  // Inline-only styles for the form inputs — keeps the file
  // self-contained without leaking utility classes elsewhere.
  return (
    <style jsx>{`
      :global(.input) {
        border: 1px solid var(--surface-border);
        background: var(--surface);
        color: var(--text-primary);
        border-radius: 8px;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        outline: none;
      }
      :global(.input:focus) {
        border-color: #005cff;
        box-shadow: 0 0 0 2px rgba(0, 92, 255, 0.2);
      }
    `}</style>
  );
}
