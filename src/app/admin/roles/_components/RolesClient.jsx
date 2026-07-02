'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, ShieldCheck } from 'lucide-react';
import { createRole, updateRole, deleteRole } from '@/lib/actions/roles';
import { roleBadgeStyle, normalizeHex } from '@/lib/rbac/roleColor';

const DEFAULT_COLOR = '#6b7280';

/** Small badge showing a role's name in its own DB color (readable ink). */
function RoleBadge({ name, color }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
      style={roleBadgeStyle(color).soft}
    >
      {name}
    </span>
  );
}

export function RolesClient({ initialRoles, pageGroups = [] }) {
  const router = useRouter();
  const [roles] = useState(initialRoles);
  const [, startTransition] = useTransition();
  const [globalError, setGlobalError] = useState('');

  const [editing, setEditing] = useState(null); // role doc | 'new' | null
  const [deleting, setDeleting] = useState(null);

  // The key of the current superadmin role (singleton) — used to gate the
  // isSuperadmin toggle in the modal.
  const existingSuperKey = useMemo(
    () => roles.find((r) => r.isSuperadmin)?.key ?? null,
    [roles]
  );

  function refresh() {
    startTransition(() => router.refresh());
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
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-2 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" />
          สร้างบทบาทใหม่
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {roles.map((r) => {
          const canDelete = !r.isSystem && !r.isSuperadmin && r.assignedCount === 0;
          const deleteHint = r.isSystem
            ? 'system role ลบไม่ได้'
            : r.isSuperadmin
              ? 'superadmin role ลบไม่ได้'
              : r.assignedCount > 0
                ? 'มีผู้ดูแลใช้บทบาทนี้อยู่'
                : 'ลบบทบาท';
          return (
            <div
              key={r.key}
              className="flex flex-col gap-2 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 flex-none rounded-full border border-[var(--surface-border)]"
                    style={{ backgroundColor: r.color || DEFAULT_COLOR }}
                    aria-hidden="true"
                  />
                  <RoleBadge name={r.name} color={r.color} />
                  {r.isSuperadmin && (
                    <ShieldCheck className="h-4 w-4 text-9e-action" aria-label="superadmin" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(r)}
                    className="rounded-9e-sm p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-9e-action"
                    aria-label="แก้ไข"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => canDelete && setDeleting(r)}
                    disabled={!canDelete}
                    title={deleteHint}
                    className="rounded-9e-sm p-1.5 text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="ลบ"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <p className="font-mono text-xs text-[var(--text-muted)]">{r.key}</p>
              {r.description && (
                <p className="text-sm text-[var(--text-secondary)]">{r.description}</p>
              )}

              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                <span>{r.isSuperadmin ? 'ทุกหน้า' : `${r.pages?.length ?? 0} หน้า`}</span>
                <span>{r.assignedCount} ผู้ดูแล</span>
                {r.isSystem && (
                  <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-medium">
                    system
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <RoleModal
          role={editing === 'new' ? null : editing}
          pageGroups={pageGroups}
          existingSuperKey={existingSuperKey}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            refresh();
          }}
          onError={setGlobalError}
        />
      )}

      {deleting && (
        <DeleteConfirm
          role={deleting}
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

function ModalShell({ title, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={
          'w-full rounded-9e-lg bg-[var(--surface)] p-6 shadow-9e-lg ' +
          (wide ? 'max-w-2xl' : 'max-w-md')
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
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

// ── Create / Edit ───────────────────────────────────────────────

function RoleModal({ role, pageGroups, existingSuperKey, onClose, onSuccess, onError }) {
  const isEdit = Boolean(role);
  const isSystem = Boolean(role?.isSystem);

  const [name, setName] = useState(role?.name ?? '');
  const [keyVal, setKeyVal] = useState(role?.key ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [color, setColor] = useState(role?.color ?? DEFAULT_COLOR);
  const [pages, setPages] = useState(() => new Set(role?.pages ?? []));
  const [isSuper, setIsSuper] = useState(Boolean(role?.isSuperadmin));
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const allKeys = useMemo(
    () => pageGroups.flatMap((g) => g.pages.map((p) => p.key)),
    [pageGroups]
  );

  // isSuperadmin toggle gating (singleton). Locked ON for the existing
  // superadmin role; disabled otherwise if a superadmin already exists
  // elsewhere or this is a system role.
  const lockSuperOn = isEdit && role.isSuperadmin;
  const anotherSuperExists = existingSuperKey && existingSuperKey !== (role?.key ?? null);
  const superDisabled = lockSuperOn || anotherSuperExists || (isSystem && !role?.isSuperadmin);

  function togglePage(k) {
    setPages((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  function setGroupPages(groupKeys, on) {
    setPages((prev) => {
      const next = new Set(prev);
      groupKeys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return next;
    });
  }
  function setAllPages(on) {
    setPages(on ? new Set(allKeys) : new Set());
  }

  function normalizeColorInput() {
    setColor((c) => normalizeHex(c) || DEFAULT_COLOR);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setPending(true);
    const payload = {
      name,
      description,
      color,
      pages: [...pages],
      isSuperadmin: isSuper,
    };
    try {
      const result = isEdit
        ? await updateRole(role.key, payload)
        : await createRole({ key: keyVal, ...payload });
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

  const badge = roleBadgeStyle(color);

  return (
    <ModalShell title={isEdit ? `แก้ไขบทบาท: ${role.name}` : 'สร้างบทบาทใหม่'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="ชื่อบทบาท" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="input"
            />
          </Field>
          <Field label="Key (a-z, 0-9, _)" required>
            <input
              type="text"
              value={keyVal}
              onChange={(e) => setKeyVal(e.target.value)}
              readOnly={isEdit}
              required
              placeholder="เช่น content_lead"
              className={'input' + (isEdit ? ' opacity-60' : '')}
            />
            {isEdit && (
              <span className="text-[11px] text-[var(--text-muted)]">key แก้ไขไม่ได้</span>
            )}
          </Field>
        </div>

        <Field label="คำอธิบาย">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="input"
          />
        </Field>

        {/* Color picker + live, contrast-safe preview */}
        <Field label="สี (hex)">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              value={normalizeHex(color) || DEFAULT_COLOR}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-[var(--surface-border)] bg-transparent p-0"
              aria-label="เลือกสี"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onBlur={normalizeColorInput}
              className="input w-32 font-mono"
              placeholder="#6b7280"
            />
            <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={badge.soft}>
              {name || 'ตัวอย่าง'}
            </span>
            <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={badge.solid}>
              {name || 'ตัวอย่าง'}
            </span>
          </div>
        </Field>

        {/* isSuperadmin toggle */}
        <label className="flex items-start gap-2 rounded-9e-md border border-[var(--surface-border)] p-3 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={isSuper}
            disabled={superDisabled}
            onChange={(e) => setIsSuper(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Superadmin</span>
            <span className="ml-1 text-[var(--text-muted)]">— เข้าถึงทุกหน้าโดยอัตโนมัติ</span>
            {lockSuperOn && (
              <span className="block text-[11px] text-[var(--text-muted)]">
                บทบาท superadmin ต้องคงสิทธิ์นี้ไว้เสมอ
              </span>
            )}
            {!lockSuperOn && anotherSuperExists && (
              <span className="block text-[11px] text-[var(--text-muted)]">
                มี superadmin role อยู่แล้ว ({existingSuperKey}) — จำกัดได้เพียง 1 บทบาท
              </span>
            )}
          </span>
        </label>

        {/* Page picker — hidden/disabled for superadmin (all pages implied) */}
        {isSuper ? (
          <p className="rounded-9e-md bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Superadmin เข้าถึงทุกหน้าโดยอัตโนมัติ
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                สิทธิ์การเข้าถึงหน้า ({pages.size})
              </span>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => setAllPages(true)} className="text-9e-action hover:underline">
                  เลือกทั้งหมด
                </button>
                <button type="button" onClick={() => setAllPages(false)} className="text-9e-action hover:underline">
                  ล้างทั้งหมด
                </button>
              </div>
            </div>

            {pageGroups.map((group) => {
              const groupKeys = group.pages.map((p) => p.key);
              const allOn = groupKeys.every((k) => pages.has(k));
              return (
                <div key={group.group} className="rounded-9e-md border border-[var(--surface-border)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {group.group}
                    </span>
                    <button
                      type="button"
                      onClick={() => setGroupPages(groupKeys, !allOn)}
                      className="text-xs text-9e-action hover:underline"
                    >
                      {allOn ? 'ล้างกลุ่ม' : 'เลือกทั้งกลุ่ม'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {group.pages.map((p) => (
                      <label
                        key={p.key}
                        className="flex items-center gap-2 text-sm text-[var(--text-primary)]"
                      >
                        <input
                          type="checkbox"
                          checked={pages.has(p.key)}
                          onChange={() => togglePage(p.key)}
                        />
                        <span>{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-medium text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก...' : isEdit ? 'บันทึก' : 'สร้างบทบาท'}
        </button>
        <FieldStyles />
      </form>
    </ModalShell>
  );
}

// ── Delete ──────────────────────────────────────────────────────

function DeleteConfirm({ role, onClose, onSuccess, onError }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setError('');
    setPending(true);
    try {
      const result = await deleteRole(role.key);
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
    <ModalShell title="ยืนยันการลบบทบาท" onClose={onClose}>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        ลบบทบาท <strong>{role.name}</strong> ({role.key})? การกระทำนี้ไม่สามารถย้อนกลับได้
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
          {pending ? 'กำลังลบ...' : 'ลบบทบาท'}
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
        width: 100%;
      }
      :global(.input:focus) {
        border-color: #005cff;
        box-shadow: 0 0 0 2px rgba(0, 92, 255, 0.2);
      }
    `}</style>
  );
}
