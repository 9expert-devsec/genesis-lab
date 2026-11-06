'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { createWriter, discardWriterAvatarUpload, setWriterActive, updateWriter } from '@/lib/actions/writers';
import { saveWithPendingAvatar, uploadWriterAvatar } from '@/lib/writers/avatarSave';
import {
  WRITER_PLATFORMS,
  WRITER_PLATFORM_LABELS,
  WRITER_SECTIONS,
  WRITER_TYPE_LABELS,
  WRITER_TYPES,
  slugFromName,
} from '@/lib/writers/writerFields';
import { writerPath } from '@/lib/writers/writerUrls';
import { ReorderRows, withRowKey } from './ReorderRows';
import { WriterAvatarField } from './WriterAvatarField';
import { useWriterDeactivation } from './WriterDeactivateDialog';

const INPUT = 'w-full rounded-9e-md border border-[var(--surface-border)] px-3 py-2 text-sm text-9e-navy dark:bg-[#0D1B2A] dark:text-white';
const BUTTON_SECONDARY = 'rounded-9e-md border border-[var(--surface-border)] px-3 py-2 text-sm text-9e-navy disabled:cursor-not-allowed disabled:opacity-50 dark:text-white';

function Panel({ title, hint, children, testId }) {
  return (
    <section
      data-testid={testId}
      className="rounded-9e-lg border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]"
    >
      <h2 className="font-bold text-9e-navy dark:text-white">{title}</h2>
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, helper, error, children }) {
  return (
    <div>
      <label className="block">
        <span className="text-xs font-medium text-9e-navy dark:text-white">{label}</span>
        <div className="mt-1">{children}</div>
      </label>
      {helper && <p className="mt-1 text-xs text-[var(--text-muted)]">{helper}</p>}
      {error && <p className="mt-1 text-xs text-red-700" data-testid="field-error">{error}</p>}
    </div>
  );
}

function Switch({ checked, disabled, label, onClick }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed ' +
        (checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600')
      }
    >
      <span
        className={
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ' +
          (checked ? 'translate-x-4' : 'translate-x-1')
        }
      />
    </button>
  );
}

const toValueRows = (items = []) => items.map((value) => withRowKey({ value }));

export function WriterForm({ writer = null, instructors }) {
  const router = useRouter();
  const editing = Boolean(writer);

  const [displayName, setDisplayName] = useState(writer?.displayName ?? '');
  const [slug, setSlug] = useState(writer?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState(writer?.type ?? 'person');
  const [role, setRole] = useState(writer?.role ?? '');
  const [bio, setBio] = useState(writer?.bio ?? '');
  const [avatarPublicId, setAvatarPublicId] = useState(writer?.avatarPublicId ?? '');
  const [pendingAvatar, setPendingAvatar] = useState(null);
  const [isActive, setIsActive] = useState(writer?.isActive ?? true);
  const [instructorId, setInstructorId] = useState(writer?.instructorId ?? '');

  const [initialLinks] = useState(() => (writer?.socialLinks ?? []).map(withRowKey));
  const [socialRows, setSocialRows] = useState(initialLinks);
  const [initialSections] = useState(() => Object.fromEntries(
    WRITER_SECTIONS.map(({ key }) => [key, toValueRows(writer?.sections?.[key])]),
  ));
  const [sections, setSections] = useState(initialSections);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const { begin: beginDeactivation, dialog } = useWriterDeactivation({
    onDone: () => {
      setIsActive(false);
      router.refresh();
    },
    onError: setFormError,
  });

  const isDefault = writer?.isDefault === true;
  const selectedInstructor = instructors.find((i) => i.id === instructorId) ?? null;

  function payload(uploadedId) {
    const fields = {
      displayName,
      type,
      role,
      bio,
      avatarPublicId: uploadedId ?? avatarPublicId,
      instructorId: instructorId || null,
      socialLinks: socialRows
        .filter((row) => row.url.trim())
        .map(({ platform, url }) => ({ platform, url })),
      sections: Object.fromEntries(
        WRITER_SECTIONS.map(({ key }) => [key, sections[key].map((row) => row.value)]),
      ),
    };
    // On edit the active flag is the toggle's own action, not part of a save.
    return editing ? { ...fields, slug: writer.slug } : { ...fields, slug, isActive };
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setFormError(null);
    setFieldErrors({});
    try {
      const { res, uploadedId } = await saveWithPendingAvatar({
        blob: pendingAvatar,
        upload: uploadWriterAvatar,
        write: (id) => (editing ? updateWriter(writer._id, payload(id)) : createWriter(payload(id))),
        discard: discardWriterAvatarUpload,
      });
      if (!res?.ok) {
        setFormError(res?.error ?? 'บันทึกไม่สำเร็จ');
        setFieldErrors(res?.errors ?? {});
      } else if (editing) {
        if (uploadedId) {
          setAvatarPublicId(uploadedId);
          setPendingAvatar(null);
        }
        setMessage('บันทึกแล้ว');
        router.refresh();
      } else {
        router.push(`/admin/writers/${res.id}`);
      }
    } catch (err) {
      setFormError(err?.message ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!editing) {
      setIsActive((v) => !v);
      return;
    }
    if (isDefault) return;
    setSaving(true);
    setMessage(null);
    setFormError(null);
    try {
      if (isActive) {
        await beginDeactivation(writer);
        return;
      }
      const res = await setWriterActive(writer._id, true);
      if (res?.ok) {
        setIsActive(true);
        router.refresh();
      } else {
        setFormError(res?.error ?? 'บันทึกไม่สำเร็จ');
      }
    } catch (err) {
      setFormError(err?.message ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {dialog}
      <nav className="text-sm text-[var(--text-muted)]" aria-label="breadcrumb">
        <Link href="/admin/writers" className="hover:underline">ผู้เขียน</Link>
        {' › '}
        {editing ? 'แก้ไข' : 'เพิ่มผู้เขียน'}
      </nav>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
          {displayName || (editing ? writer.displayName : 'เพิ่มผู้เขียน')}
        </h1>
        <div className="flex items-center gap-2">
          {editing && isActive ? (
            <a
              href={writerPath(writer.slug)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="writer-view-profile"
              className={BUTTON_SECONDARY}
            >
              ดูหน้าโปรไฟล์
            </a>
          ) : (
            <button
              type="button"
              disabled
              data-testid="writer-view-profile"
              title={editing ? 'ผู้เขียนถูกปิดใช้งาน — หน้าโปรไฟล์ redirect ไปที่ 9Expert Academy' : 'บันทึกผู้เขียนก่อน'}
              className={BUTTON_SECONDARY}
            >
              ดูหน้าโปรไฟล์
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            data-testid="writer-save"
            className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>

      {formError && <p className="mt-3 text-sm text-red-700" role="alert" data-testid="writer-error">{formError}</p>}
      {message && <p className="mt-3 text-sm text-9e-action">{message}</p>}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel title="ข้อมูลพื้นฐาน" testId="panel-basics">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="ชื่อที่แสดง *" error={fieldErrors.displayName}>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (!editing && !slugTouched) setSlug(slugFromName(e.target.value));
                    }}
                    className={INPUT}
                  />
                </Field>
                <Field
                  label="URL (slug) *"
                  helper={editing ? 'ตั้งได้ตอนสร้างเท่านั้น — หลังบันทึกครั้งแรกแก้ไม่ได้' : undefined}
                  error={fieldErrors.slug}
                >
                  <div className="flex items-center rounded-9e-md border border-[var(--surface-border)] pl-3 text-sm dark:bg-[#0D1B2A]">
                    <span className="text-[var(--text-muted)]">/writer/</span>
                    <input
                      type="text"
                      value={slug}
                      readOnly={editing}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(e.target.value.toLowerCase());
                      }}
                      data-testid="writer-slug"
                      className="min-w-0 flex-1 rounded-r-9e-md bg-transparent py-2 pr-3 font-mono text-sm text-9e-navy outline-none read-only:text-[var(--text-muted)] dark:text-white"
                    />
                  </div>
                </Field>
              </div>

              <div>
                <span className="text-xs font-medium text-9e-navy dark:text-white">ประเภท</span>
                <div className="mt-1">
                  <div className="inline-flex rounded-9e-md border border-[var(--surface-border)] p-0.5">
                    {WRITER_TYPES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={type === value}
                        onClick={() => setType(value)}
                        className={
                          'rounded-9e-sm px-3 py-1 text-sm font-medium transition-colors ' +
                          (type === value ? 'bg-9e-action text-white' : 'text-[var(--text-secondary)]')
                        }
                      >
                        {WRITER_TYPE_LABELS[value]}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">มีผลกับ JSON-LD (Person / Organization) เท่านั้น</p>
              </div>

              <Field label="ตำแหน่ง / บทบาท" error={fieldErrors.role}>
                <input type="text" value={role} onChange={(e) => setRole(e.target.value)} className={INPUT} />
              </Field>

              <Field label="แนะนำตัว (bio)" helper="แสดงใต้ชื่อบนหน้าโปรไฟล์" error={fieldErrors.bio}>
                <textarea value={bio} rows={4} onChange={(e) => setBio(e.target.value)} className={INPUT} />
              </Field>
            </div>
          </Panel>

          <Panel title="ลิงก์โซเชียล" hint="ไม่มีลิงก์ → ไม่แสดงแถวไอคอนบนหน้าเว็บ" testId="panel-social">
            <ReorderRows
              initial={initialLinks}
              onChange={setSocialRows}
              blank={{ platform: 'facebook', url: '' }}
              addLabel="เพิ่มลิงก์"
              testId="writer-social-rows"
              renderRow={(row, update) => (
                <>
                  <select
                    value={row.platform}
                    aria-label="แพลตฟอร์ม"
                    onChange={(e) => update({ platform: e.target.value })}
                    className="shrink-0 rounded-9e-md border border-[var(--surface-border)] px-2 py-2 text-sm text-9e-navy dark:bg-[#0D1B2A] dark:text-white"
                  >
                    {WRITER_PLATFORMS.map((platform) => (
                      <option key={platform} value={platform}>{WRITER_PLATFORM_LABELS[platform]}</option>
                    ))}
                  </select>
                  <input
                    type="url"
                    value={row.url}
                    placeholder="https://"
                    aria-label="ลิงก์"
                    onChange={(e) => update({ url: e.target.value })}
                    className={INPUT}
                  />
                </>
              )}
            />
            {fieldErrors.socialLinks && (
              <p className="mt-2 text-xs text-red-700" data-testid="field-error">{fieldErrors.socialLinks}</p>
            )}
          </Panel>

          {WRITER_SECTIONS.map(({ key, label }) => (
            <Panel key={key} title={label} testId={`panel-${key}`}>
              <ReorderRows
                initial={initialSections[key]}
                onChange={(rows) => setSections((prev) => ({ ...prev, [key]: rows }))}
                blank={{ value: '' }}
                addLabel="เพิ่มรายการ"
                emptyHint="ยังไม่มีรายการ — ส่วนนี้จะไม่แสดงบนหน้าโปรไฟล์"
                renderRow={(row, update) => (
                  <input
                    type="text"
                    value={row.value}
                    aria-label={label}
                    onChange={(e) => update({ value: e.target.value })}
                    className={INPUT}
                  />
                )}
              />
            </Panel>
          ))}
        </div>

        <div className="space-y-5">
          <Panel title="รูปโปรไฟล์" testId="panel-avatar">
            <WriterAvatarField
              value={avatarPublicId}
              pending={pendingAvatar}
              onCrop={setPendingAvatar}
              onRemove={() => { setPendingAvatar(null); setAvatarPublicId(''); }}
            />
            {fieldErrors.avatarPublicId && (
              <p className="mt-2 text-xs text-red-700" data-testid="field-error">{fieldErrors.avatarPublicId}</p>
            )}
          </Panel>

          <Panel title="สถานะ" testId="panel-status">
            <div className="flex items-center gap-2">
              <Switch
                checked={isActive}
                disabled={isDefault || saving}
                label="สถานะของผู้เขียน"
                onClick={toggleActive}
              />
              <span className="text-sm text-[var(--text-secondary)]">{isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}</span>
              {isDefault && <Lock className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              ปิดใช้งาน → บทความทั้งหมดของผู้เขียนนี้จะถูกโอนไปเป็นของ 9Expert Academy (ยืนยันก่อนทุกครั้ง)
            </p>
          </Panel>

          <Panel
            title="ผูกกับวิทยากร"
            hint={'ไม่บังคับ — ถ้าผูก หน้าโปรไฟล์จะแสดง "เชี่ยวชาญด้าน" (โปรแกรมที่สอน) และหลักสูตรออนไลน์ของวิทยากร'}
            testId="panel-instructor"
          >
            <select
              value={instructorId}
              aria-label="วิทยากร"
              data-testid="writer-instructor"
              onChange={(e) => setInstructorId(e.target.value)}
              className={INPUT}
            >
              <option value="">ไม่ผูก</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>{i.active ? i.name : `${i.name} (ปิดใช้งาน)`}</option>
              ))}
            </select>
            {selectedInstructor && (
              <>
                <ul className="mt-3 flex flex-wrap gap-1.5" data-testid="writer-instructor-programs">
                  {selectedInstructor.programs.map((program) => (
                    <li
                      key={program.name}
                      className="rounded-full bg-9e-ice px-2 py-0.5 text-xs text-[var(--text-secondary)] dark:bg-[#0D1B2A]"
                    >
                      {program.name}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-[var(--text-muted)]">ดึงจากข้อมูลวิทยากร — แก้ที่หน้าวิทยากร ไม่ใช่ที่นี่</p>
              </>
            )}
            {fieldErrors.instructorId && (
              <p className="mt-2 text-xs text-red-700" data-testid="field-error">{fieldErrors.instructorId}</p>
            )}
          </Panel>

          <Panel title="บทความ" testId="panel-articles">
            <p className="text-2xl font-bold text-9e-navy dark:text-white" data-testid="writer-article-count">
              {writer?.articleCount ?? 0}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
