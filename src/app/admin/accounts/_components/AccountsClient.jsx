'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, KeyRound, X } from 'lucide-react';
import {
  createAdmin,
  updateAdmin,
  resetAdminPassword,
  deleteAdmin,
} from '@/lib/actions/admin-accounts';
import { roleBadgeStyle } from '@/lib/rbac/roleColor';
import { AdminAvatar } from '@/components/admin/AdminAvatar';

/**
 * Role badge — resolves the admin's roleKey (fallback legacy `role`) to a
 * role from the DB list for its name + free-hex color. Inline style +
 * readable ink keep any custom color legible (Tailwind can't compile
 * dynamic hex). Unknown key → neutral gray via roleBadgeStyle's fallback.
 */
function RoleBadge({ roleKey, roles }) {
  const role = roles.find((r) => r.key === roleKey);
  const label = role?.name ?? roleKey ?? '—';
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
      style={roleBadgeStyle(role?.color).soft}
    >
      {label}
    </span>
  );
}

function fmt(date) {
  return date ? new Date(date).toLocaleString('th-TH') : '—';
}

/**
 * ออนไลน์ / ออฟไลน์ — a dot plus a word, deliberately NOT the plain green text
 * that สถานะ uses two columns to the left: that column is "account enabled",
 * this one is "here right now", and two green words side by side would read
 * as one fact. `online` is decided by the server (listAdmins → isOnline) with
 * the server clock; this component only draws the boolean. Offline shows when
 * the person was last here, in the same format as เข้าใช้ล่าสุด, or nothing
 * when there has never been a beat. A disabled account is always Offline —
 * that is the server's rule, and it arrives here already applied.
 */
function PresenceCell({ online, lastSeenAt }) {
  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]" data-presence="online">
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-green-500" />
        ออนไลน์
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5" data-presence="offline">
      <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full border border-[var(--text-muted)]" />
        ออฟไลน์
      </span>
      {lastSeenAt ? (
        <span className="text-xs text-[var(--text-muted)]" data-last-seen>เห็นล่าสุด {fmt(lastSeenAt)}</span>
      ) : null}
    </span>
  );
}

/** The accounts list re-reads itself this often while the tab is visible. */
const REFRESH_MS = 60_000;
/** Two refreshes are never closer than this (a focus right after an interval tick is one refresh). */
const REFRESH_MIN_GAP_MS = 30_000;

/**
 * ── ROWS RENDER FROM THE PROP, NEVER FROM A STATE COPY ──────────────────────
 * This used to be `const [admins] = useState(initialAdmins)`, and `setAdmins`
 * was never called. React keeps state across re-renders of a surviving
 * instance, so after a create / edit / delete the modals' `router.refresh()`
 * re-ran `listAdmins()` on the server, the page passed a NEW `initialAdmins`
 * down, and the table went on drawing the old array — the list only changed on
 * a full navigation. Reading the prop directly is the whole fix, and it is what
 * lets a periodic refresh (round ③) show up at all. Same rule as the URL
 * filters in test/fs/urlFilterNoState: a value seeded into state goes stale.
 */
export function AccountsClient({ initialAdmins, roles = [], currentUserId }) {
  const router = useRouter();
  const admins = Array.isArray(initialAdmins) ? initialAdmins : [];
  const [isPending, startTransition] = useTransition();
  const [globalError, setGlobalError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null); // admin doc

  /**
   * ── THE LIST RE-READS ITSELF, VISIBLE-ONLY, THROTTLED ─────────────────────
   * Presence is a moving fact, so the page asks the server again every
   * REFRESH_MS — but only while the tab is visible (a hidden tab's timer is
   * throttled anyway, and a refresh nobody sees is a wasted listAdmins), and
   * once more on window focus, so switching back shows the current state at
   * once. The same 30 s throttle as PresenceHeartbeat keeps a focus that
   * lands right after a tick from doubling the request. router.refresh()
   * re-runs the server component; the rows follow the new prop (see above).
   */
  const lastRefreshAt = useRef(0);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const at = Date.now();
      if (at - lastRefreshAt.current < REFRESH_MIN_GAP_MS) return;
      lastRefreshAt.current = at;
      startTransition(() => { router.refresh(); });
    };
    const timer = setInterval(tick, REFRESH_MS);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [router]);
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
          className="inline-flex items-center gap-2 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" />
          สร้างบัญชีใหม่
        </button>
      </div>

      {/* overflow-x-auto, not overflow-hidden: eight columns at phone width
          should scroll sideways, not be crushed into unreadable slivers. */}
      <div className="overflow-x-auto rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
              <th className="w-14 px-4 py-3 text-left font-medium text-[var(--text-secondary)]">โปรไฟล์</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">อีเมล</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">ชื่อ</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Role</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">สถานะ</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">เข้าใช้ล่าสุด</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">ออนไลน์</th>
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
                  <td className="px-4 py-2" data-cell="avatar">
                    {/* The same component and the same bundled default as the
                        sidebar footer — an admin with no photo looks identical
                        in both places. The name is the next column, so alt="". */}
                    <AdminAvatar publicId={a.imagePublicId ?? null} size={36} />
                  </td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">
                    {a.email}
                    {isSelf && (
                      <span className="ml-2 text-xs text-[var(--text-muted)]">(คุณ)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">{a.name}</td>
                  <td className="px-4 py-3">
                    <RoleBadge roleKey={a.roleKey ?? a.role} roles={roles} />
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
                  <td className="px-4 py-3 text-sm" data-cell="presence">
                    <PresenceCell online={a.online === true} lastSeenAt={a.lastSeenAt ?? null} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(a)}
                        className="rounded-9e-sm p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-9e-action"
                        aria-label="แก้ไข"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetting(a)}
                        className="rounded-9e-sm p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-9e-action"
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
                  colSpan={8}
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
          roles={roles}
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
          roles={roles}
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

function CreateModal({ roles = [], onClose, onSuccess, onError }) {
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
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name} ({r.key})
              </option>
            ))}
          </select>
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-medium text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังสร้าง...' : 'สร้างบัญชี'}
        </button>
        <FieldStyles />
      </form>
    </ModalShell>
  );
}

// ── Edit ────────────────────────────────────────────────────────

function EditModal({ admin, roles = [], onClose, onSuccess, onError }) {
  const [name, setName] = useState(admin.name ?? '');
  const [role, setRole] = useState(admin.roleKey ?? 'admin');
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
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name} ({r.key})
              </option>
            ))}
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
          className="mt-2 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-medium text-white hover:bg-9e-brand disabled:opacity-50"
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
          className="mt-2 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-medium text-white hover:bg-9e-brand disabled:opacity-50"
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
