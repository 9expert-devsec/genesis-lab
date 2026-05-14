'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Pencil, Trash2, Check, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  updateRegistrationStatus,
  updateRegistration,
  deleteRegistration,
} from '@/lib/actions/registrations';
import { Button } from '@/components/ui/button';

// ── Constants ──────────────────────────────────────────────────────

const STATUS_BADGE   = { pending: 'bg-amber-100 text-amber-700', confirmed: 'bg-blue-100 text-blue-700', paid: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-slate-100 text-slate-500' };
const STATUS_LABEL   = { pending: 'รอดำเนินการ', confirmed: 'ยืนยันแล้ว', paid: 'ชำระแล้ว', cancelled: 'ยกเลิก' };
const STATUS_ACTIONS = { pending: ['confirmed','cancelled'], confirmed: ['paid','cancelled'], paid: ['cancelled'], cancelled: ['pending'] };
const ACTION_LABEL   = { confirmed: 'ยืนยันการสมัคร', paid: 'บันทึกชำระแล้ว', cancelled: 'ยกเลิกการสมัคร', pending: 'คืนสถานะ รอดำเนินการ' };
const ACTION_VARIANT = { confirmed: 'primary', paid: 'cta', cancelled: 'outline', pending: 'outline' };

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear()+543} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} น.`;
}
function refNo(id) { return String(id).slice(-8).toUpperCase(); }

const EMPTY_ATTENDEE = { firstName: '', lastName: '', email: '', phone: '' };

// ── Main Component ─────────────────────────────────────────────────

export function RegistrationDetailClient({ doc }) {
  const router = useRouter();

  // ── Editable state (mirrors doc on load) ────────────────────
  const [status,       setStatus]       = useState(doc.status);
  const [course,       setCourse]       = useState({
    classDate:      doc.classDate      ?? '',
    scheduleType:   doc.scheduleType   ?? 'classroom',
    attendanceMode: doc.attendanceMode ?? 'classroom',
  });
  const [coordinator,  setCoordinator]  = useState({ ...doc.coordinator });
  const [attendeesListProvided, setAttendeesListProvided] = useState(doc.attendeesListProvided ?? true);
  const [attendeesCount, setAttendeesCount] = useState(doc.attendeesCount ?? 1);
  const [attendees,    setAttendees]    = useState(doc.attendees?.length ? [...doc.attendees] : []);
  const [notes,        setNotes]        = useState(doc.notes ?? '');
  const [invoice,      setInvoice]      = useState(
    doc.invoice
      ? { ...doc.invoice,
          thaiAddress:          doc.invoice.thaiAddress          ? { ...doc.invoice.thaiAddress }          : null,
          internationalAddress: doc.invoice.internationalAddress ? { ...doc.invoice.internationalAddress } : null,
        }
      : null
  );
  const [requestInvoice, setRequestInvoice] = useState(doc.requestInvoice ?? false);

  // ── UI state ─────────────────────────────────────────────────
  const [editSection,  setEditSection]  = useState(null); // 'course'|'coordinator'|'attendees'|'notes'|null
  const [error,        setError]        = useState(null);
  const [busy,         setBusy]         = useState(null);
  const [, startTransition] = useTransition();

  // ── Helpers ───────────────────────────────────────────────────
  const save = (payload, busyKey) => {
    setBusy(busyKey); setError(null);
    startTransition(async () => {
      const res = await updateRegistration(doc._id, payload);
      if (res.ok) { setEditSection(null); }
      else { setError(res.error || 'บันทึกไม่สำเร็จ'); }
      setBusy(null);
    });
  };

  const cancelEdit = (section) => {
    setEditSection(null);
    if (section === 'course')      setCourse({ classDate: doc.classDate ?? '', scheduleType: doc.scheduleType ?? 'classroom', attendanceMode: doc.attendanceMode ?? 'classroom' });
    if (section === 'coordinator') setCoordinator({ ...doc.coordinator });
    if (section === 'attendees')   { setAttendees(doc.attendees?.length ? [...doc.attendees] : []); setAttendeesListProvided(doc.attendeesListProvided ?? true); setAttendeesCount(doc.attendeesCount ?? 1); }
    if (section === 'notes')       setNotes(doc.notes ?? '');
    if (section === 'invoice') {
      setRequestInvoice(doc.requestInvoice ?? false);
      setInvoice(doc.invoice
        ? { ...doc.invoice,
            thaiAddress:          doc.invoice.thaiAddress          ? { ...doc.invoice.thaiAddress }          : null,
            internationalAddress: doc.invoice.internationalAddress ? { ...doc.invoice.internationalAddress } : null,
          }
        : null);
    }
  };

  // ── Status action ─────────────────────────────────────────────
  const handleStatusAction = (next) => {
    if (!window.confirm(`เปลี่ยนสถานะเป็น "${STATUS_LABEL[next]}"?`)) return;
    setBusy(next); setError(null);
    startTransition(async () => {
      const res = await updateRegistrationStatus(doc._id, next);
      res.ok ? setStatus(next) : setError(res.error || 'เกิดข้อผิดพลาด');
      setBusy(null);
    });
  };

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = () => {
    if (!window.confirm(`ลบใบสมัคร ${refNo(doc._id)} ถาวร?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    setBusy('delete'); setError(null);
    startTransition(async () => {
      const res = await deleteRegistration(doc._id);
      if (res.ok) router.push('/admin/registrations');
      else { setError(res.error || 'ลบไม่สำเร็จ'); setBusy(null); }
    });
  };

  // ── Invoice save ──────────────────────────────────────────────
  const handleSaveInvoice = () => {
    const payload = requestInvoice && invoice ? { invoice } : { invoice: null };
    save(payload, 'save-invoice');
  };

  // ── Attendee helpers ──────────────────────────────────────────
  const addAttendee = () => setAttendees((prev) => [...prev, { ...EMPTY_ATTENDEE }]);
  const removeAttendee = (i) => setAttendees((prev) => prev.filter((_, idx) => idx !== i));
  const updateAttendee = (i, field, val) =>
    setAttendees((prev) => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a));

  const statusActions = STATUS_ACTIONS[status] ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => router.back()}
            className="mb-3 flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-9e-action">
            <ArrowLeft className="h-4 w-4" />กลับรายการ
          </button>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            ใบสมัคร <span className="font-mono text-9e-action">{refNo(doc._id)}</span>
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">สมัครเมื่อ {fmtDate(doc.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <span className={cn('inline-block rounded-full px-3 py-1 text-sm font-semibold', STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-600')}>
            {STATUS_LABEL[status] ?? status}
          </span>
          {statusActions.length > 0 && (
            <div className="flex gap-2">
              {statusActions.map((next) => (
                <Button key={next} variant={ACTION_VARIANT[next]} size="sm" onClick={() => handleStatusAction(next)} disabled={busy !== null}>
                  {busy === next && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {ACTION_LABEL[next]}
                </Button>
              ))}
            </div>
          )}
          <button type="button" onClick={handleDelete} disabled={busy !== null}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-9e-accent transition-colors disabled:opacity-40">
            {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            ลบใบสมัครนี้
          </button>
          {error && <p className="text-xs text-9e-accent">{error}</p>}
        </div>
      </div>

      {/* ── Course (editable) ── */}
      <CardEditable title="ข้อมูลคอร์ส"
        isEditing={editSection === 'course'} isSaving={busy === 'save-course'}
        onEdit={() => setEditSection('course')}
        onSave={() => save({ classDate: course.classDate, scheduleType: course.scheduleType, attendanceMode: course.attendanceMode }, 'save-course')}
        onCancel={() => cancelEdit('course')}>
        {editSection === 'course' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <EditField label="วันที่อบรม" value={course.classDate}
              onChange={(v) => setCourse((c) => ({ ...c, classDate: v }))} className="sm:col-span-2" />
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">ประเภทรอบ</label>
              <select value={course.scheduleType}
                onChange={(e) => setCourse((c) => ({ ...c, scheduleType: e.target.value }))}
                className={selectCls()}>
                <option value="classroom">Classroom</option>
                <option value="hybrid">Hybrid</option>
                <option value="online">Online</option>
              </select>
            </div>
            {course.scheduleType === 'hybrid' && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">รูปแบบการอบรม</label>
                <select value={course.attendanceMode}
                  onChange={(e) => setCourse((c) => ({ ...c, attendanceMode: e.target.value }))}
                  className={selectCls()}>
                  <option value="classroom">Classroom</option>
                  <option value="teams">Online via Microsoft Teams</option>
                </select>
              </div>
            )}
          </div>
        ) : (
          <>
            <Row label="หลักสูตร"  value={doc.courseName} />
            <Row label="รหัสคอร์ส" value={doc.courseCode || doc.courseId} />
            <Row label="รอบอบรม"   value={course.classDate || '—'} />
            {course.scheduleType === 'hybrid' && (
              <Row label="รูปแบบการอบรม" value={course.attendanceMode === 'teams' ? 'Online via Microsoft Teams' : 'Classroom'} />
            )}
            {course.scheduleType !== 'classroom' && course.scheduleType !== 'hybrid' && (
              <Row label="ประเภท" value={course.scheduleType} />
            )}
          </>
        )}
      </CardEditable>

      {/* ── Coordinator (editable) ── */}
      <CardEditable title="ผู้ประสานงาน"
        isEditing={editSection === 'coordinator'} isSaving={busy === 'save-coord'}
        onEdit={() => setEditSection('coordinator')}
        onSave={() => save({ coordinator }, 'save-coord')}
        onCancel={() => cancelEdit('coordinator')}>
        {editSection === 'coordinator' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <EditField label="ชื่อ" required value={coordinator.firstName ?? ''} onChange={(v) => setCoordinator((c) => ({ ...c, firstName: v }))} />
            <EditField label="นามสกุล" required value={coordinator.lastName ?? ''} onChange={(v) => setCoordinator((c) => ({ ...c, lastName: v }))} />
            <EditField label="อีเมล" type="email" required value={coordinator.email ?? ''} onChange={(v) => setCoordinator((c) => ({ ...c, email: v }))} />
            <EditField label="เบอร์โทร" type="tel" value={coordinator.phone ?? ''} onChange={(v) => setCoordinator((c) => ({ ...c, phone: v }))} />
          </div>
        ) : (
          <>
            <Row label="ชื่อ-นามสกุล" value={`${coordinator.firstName ?? ''} ${coordinator.lastName ?? ''}`.trim()} />
            <Row label="อีเมล"         value={coordinator.email} />
            <Row label="เบอร์โทร"      value={coordinator.phone} />
            <Row label="เข้าอบรมด้วย"  value={doc.coordinator?.isAttending ? 'ใช่' : 'ไม่'} />
          </>
        )}
      </CardEditable>

      {/* ── Attendees (editable) ── */}
      <CardEditable
        title={`ผู้เข้าอบรม (${attendeesCount} ท่าน)`}
        isEditing={editSection === 'attendees'} isSaving={busy === 'save-attendees'}
        onEdit={() => setEditSection('attendees')}
        onSave={() => save({ attendeesListProvided, attendeesCount, attendees }, 'save-attendees')}
        onCancel={() => cancelEdit('attendees')}>
        {editSection === 'attendees' ? (
          <div className="space-y-4">
            {/* Count + listProvided toggle */}
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">จำนวนผู้เข้าอบรม</label>
                <input type="number" min={1} max={50} value={attendeesCount}
                  onChange={(e) => setAttendeesCount(parseInt(e.target.value, 10) || 1)}
                  className="h-9 w-24 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 text-sm focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand" />
              </div>
              <label className="flex cursor-pointer items-center gap-2 pt-5">
                <input type="checkbox" checked={!attendeesListProvided}
                  onChange={(e) => setAttendeesListProvided(!e.target.checked)}
                  className="h-4 w-4 rounded accent-9e-brand" />
                <span className="text-sm text-[var(--text-primary)]">ยังไม่ประสงค์แจ้งรายชื่อ</span>
              </label>
            </div>

            {/* Attendee rows */}
            {attendeesListProvided && (
              <div className="space-y-3">
                {attendees.map((a, i) => (
                  <div key={i} className="rounded-9e-md border border-[var(--surface-border)] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">ท่านที่ {i + 1}</span>
                      <button type="button" onClick={() => removeAttendee(i)}
                        className="text-xs text-[var(--text-muted)] hover:text-9e-accent transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <EditField label="ชื่อ" required value={a.firstName} onChange={(v) => updateAttendee(i, 'firstName', v)} />
                      <EditField label="นามสกุล" required value={a.lastName} onChange={(v) => updateAttendee(i, 'lastName', v)} />
                      <EditField label="อีเมล" type="email" required value={a.email} onChange={(v) => updateAttendee(i, 'email', v)} />
                      <EditField label="เบอร์โทร" type="tel" required value={a.phone} onChange={(v) => updateAttendee(i, 'phone', v)} />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addAttendee}
                  className="flex w-full items-center justify-center gap-1.5 rounded-9e-md border border-dashed border-[var(--surface-border)] py-2.5 text-xs font-medium text-[var(--text-secondary)] hover:border-9e-brand hover:text-9e-brand transition-colors">
                  <Plus className="h-3.5 w-3.5" />
                  เพิ่มผู้เข้าอบรม
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {!attendeesListProvided ? (
              <p className="text-sm text-[var(--text-secondary)]">ยังไม่ได้ระบุรายชื่อ — จะแจ้งภายหลัง</p>
            ) : attendees.length > 0 ? (
              <div className="space-y-2">
                {attendees.map((a, i) => (
                  <AttendeeRow key={i} n={i+1}
                    name={`${a.firstName} ${a.lastName}`}
                    email={a.email} phone={a.phone}
                    isCoord={i === 0 && doc.coordinator?.isAttending} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">ไม่มีข้อมูลผู้เข้าอบรม</p>
            )}
          </>
        )}
      </CardEditable>

      {/* ── Invoice (editable) ── */}
      <CardEditable
        title="ใบเสนอราคา / ใบกำกับภาษี"
        isEditing={editSection === 'invoice'}
        isSaving={busy === 'save-invoice'}
        onEdit={() => setEditSection('invoice')}
        onSave={handleSaveInvoice}
        onCancel={() => cancelEdit('invoice')}
      >
        {editSection === 'invoice' ? (
          <InvoiceEditForm
            requestInvoice={requestInvoice}
            setRequestInvoice={setRequestInvoice}
            invoice={invoice}
            setInvoice={setInvoice}
          />
        ) : (
          <InvoiceReadView requestInvoice={requestInvoice} invoice={invoice} />
        )}
      </CardEditable>

      {/* ── Notes (editable) ── */}
      <CardEditable title="หมายเหตุ"
        isEditing={editSection === 'notes'} isSaving={busy === 'save-notes'}
        onEdit={() => setEditSection('notes')}
        onSave={() => save({ notes }, 'save-notes')}
        onCancel={() => cancelEdit('notes')}>
        {editSection === 'notes' ? (
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={4}
            placeholder="หมายเหตุเพิ่มเติม..."
            className="w-full resize-y rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand" />
        ) : (
          <p className={cn('whitespace-pre-wrap text-sm', notes ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] italic')}>
            {notes || 'ไม่มีหมายเหตุ'}
          </p>
        )}
      </CardEditable>

      {/* ── Meta (read-only) ── */}
      <Card title="ข้อมูลระบบ">
        <Row label="Registration ID" value={<span className="font-mono text-xs">{doc._id}</span>} />
        <Row label="Class ID"        value={<span className="font-mono text-xs">{doc.classId}</span>} />
        <Row label="แหล่งที่มา"       value={doc.source ?? 'web'} />
        {doc.ipAddress && <Row label="IP Address" value={doc.ipAddress} />}
        <Row label="อัปเดตล่าสุด"     value={fmtDate(doc.updatedAt)} />
      </Card>
    </div>
  );
}

// ── Shared atoms ───────────────────────────────────────────────────

function selectCls() {
  return cn(
    'h-9 w-full rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
    'border-[var(--surface-border)]',
    'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
  );
}

function Card({ title, children }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function CardEditable({ title, children, isEditing, isSaving, onEdit, onSave, onCancel }) {
  return (
    <section className={cn('rounded-9e-lg border bg-[var(--surface)] p-6 transition-colors', isEditing ? 'border-9e-brand/40' : 'border-[var(--surface-border)]')}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
        {!isEditing ? (
          <button type="button" onClick={onEdit}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-9e-action transition-colors">
            <Pencil className="h-3.5 w-3.5" />แก้ไข
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} disabled={isSaving}
              className="flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-40">
              <X className="h-3.5 w-3.5" />ยกเลิก
            </button>
            <button type="button" onClick={onSave} disabled={isSaving}
              className="flex items-center gap-1 rounded-9e-md bg-9e-navy px-3 py-1.5 text-xs font-semibold text-9e-ice hover:opacity-90 disabled:opacity-40">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              บันทึก
            </button>
          </div>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function EditField({ label, value, onChange, type = 'text', required, className }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
        {label}{required && <span className="ml-0.5 text-9e-accent">*</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand" />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-full text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] sm:w-44 sm:flex-none">{label}</dt>
      <dd className="text-sm text-[var(--text-primary)]">{value || '—'}</dd>
    </div>
  );
}

function AttendeeRow({ n, name, email, phone, isCoord }) {
  return (
    <div className={cn('rounded-9e-md border p-3 text-sm', isCoord ? 'border-9e-brand/30 bg-9e-brand/5' : 'border-[var(--surface-border)]')}>
      <div className="font-semibold text-[var(--text-primary)]">
        ท่านที่ {n} · {name}
        {isCoord && <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">(ผู้ประสานงาน)</span>}
      </div>
      <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{email} · {phone}</div>
    </div>
  );
}

// ── Invoice edit form ─────────────────────────────────────────────

const EMPTY_THAI_ADDR = { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' };
const EMPTY_INTL_ADDR = { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' };

function InvoiceEditForm({ requestInvoice, setRequestInvoice, invoice, setInvoice }) {
  const isThai = invoice?.country === 'TH' || !invoice?.country;

  const set = (field, val) => setInvoice((prev) => ({ ...prev, [field]: val }));

  const handleCountryChange = (next) => {
    setInvoice((prev) => ({
      ...prev,
      country: next,
      thaiAddress:          next === 'TH'    ? (prev.thaiAddress ?? EMPTY_THAI_ADDR) : null,
      internationalAddress: next === 'OTHER' ? (prev.internationalAddress ?? EMPTY_INTL_ADDR) : null,
    }));
  };

  const setThaiAddr   = (field, val) => setInvoice((prev) => ({ ...prev, thaiAddress:          { ...(prev.thaiAddress          ?? EMPTY_THAI_ADDR), [field]: val } }));
  const setIntlAddr   = (field, val) => setInvoice((prev) => ({ ...prev, internationalAddress: { ...(prev.internationalAddress ?? EMPTY_INTL_ADDR), [field]: val } }));

  return (
    <div className="space-y-4">
      {/* Toggle invoice on/off */}
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={requestInvoice}
          onChange={(e) => {
            setRequestInvoice(e.target.checked);
            if (e.target.checked && !invoice) {
              setInvoice({ type: 'individual', country: 'TH', firstName: '', lastName: '', companyName: '', branch: '', taxId: '', thaiAddress: { ...EMPTY_THAI_ADDR }, internationalAddress: null });
            }
          }}
          className="h-4 w-4 rounded accent-9e-brand"
        />
        <span className="text-sm font-medium text-[var(--text-primary)]">ต้องการใบเสนอราคา / ใบกำกับภาษี</span>
      </label>

      {requestInvoice && invoice && (
        <div className="space-y-4 rounded-9e-md border border-[var(--surface-border)] p-4">

          {/* Type + Country */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">ประเภทลูกค้า</label>
              <select value={invoice.type ?? 'individual'} onChange={(e) => set('type', e.target.value)} className={selectCls()}>
                <option value="individual">บุคคลทั่วไป / Individual</option>
                <option value="corporate">บริษัท / องค์กร / Company</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">ประเทศ / Country</label>
              <select value={invoice.country ?? 'TH'} onChange={(e) => handleCountryChange(e.target.value)} className={selectCls()}>
                <option value="TH">Thailand</option>
                <option value="OTHER">Other country</option>
              </select>
            </div>
          </div>

          {/* Identity */}
          {invoice.type === 'individual' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <EditField label="ชื่อ" required value={invoice.firstName ?? ''} onChange={(v) => set('firstName', v)} />
              <EditField label="นามสกุล" required value={invoice.lastName ?? ''} onChange={(v) => set('lastName', v)} />
            </div>
          ) : (
            <div className="grid gap-3">
              <EditField label={isThai ? 'ชื่อบริษัท' : 'Company name'} required value={invoice.companyName ?? ''} onChange={(v) => set('companyName', v)} />
              <EditField label={isThai ? 'สาขา (ถ้ามี)' : 'Branch / Division (optional)'} value={invoice.branch ?? ''} onChange={(v) => set('branch', v)} />
            </div>
          )}

          {/* Tax ID */}
          <EditField
            label={isThai ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID / VAT ID (optional)'}
            value={invoice.taxId ?? ''}
            onChange={(v) => set('taxId', v)}
            required={isThai}
          />

          {/* Address */}
          {isThai ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">ที่อยู่ (ไทย)</p>
              <EditField label="ที่อยู่" required value={invoice.thaiAddress?.addressLine ?? ''} onChange={(v) => setThaiAddr('addressLine', v)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <EditField label="รหัสไปรษณีย์" required value={invoice.thaiAddress?.postalCode ?? ''} onChange={(v) => setThaiAddr('postalCode', v)} />
                <EditField label="แขวง / ตำบล" required value={invoice.thaiAddress?.subDistrict ?? ''} onChange={(v) => setThaiAddr('subDistrict', v)} />
                <EditField label="เขต / อำเภอ" required value={invoice.thaiAddress?.district ?? ''} onChange={(v) => setThaiAddr('district', v)} />
                <EditField label="จังหวัด" required value={invoice.thaiAddress?.province ?? ''} onChange={(v) => setThaiAddr('province', v)} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">Address</p>
              <EditField label="Address line 1" required value={invoice.internationalAddress?.line1 ?? ''} onChange={(v) => setIntlAddr('line1', v)} />
              <EditField label="Address line 2 (optional)" value={invoice.internationalAddress?.line2 ?? ''} onChange={(v) => setIntlAddr('line2', v)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <EditField label="City" required value={invoice.internationalAddress?.city ?? ''} onChange={(v) => setIntlAddr('city', v)} />
                <EditField label="State / Region (optional)" value={invoice.internationalAddress?.state ?? ''} onChange={(v) => setIntlAddr('state', v)} />
                <EditField label="Postal code (optional)" value={invoice.internationalAddress?.postalCode ?? ''} onChange={(v) => setIntlAddr('postalCode', v)} />
                <EditField label="Country" required value={invoice.internationalAddress?.country ?? ''} onChange={(v) => setIntlAddr('country', v)} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Invoice read view ─────────────────────────────────────────────

function InvoiceReadView({ requestInvoice, invoice }) {
  if (!requestInvoice || !invoice) {
    return <p className="text-sm italic text-[var(--text-muted)]">ไม่ได้ขอใบเสนอราคา</p>;
  }
  return (
    <>
      <Row
        label="ประเภทลูกค้า"
        value={`${invoice.type === 'corporate' ? 'นิติบุคคล / บริษัท' : 'บุคคลทั่วไป'} · ${invoice.country === 'OTHER' ? 'ต่างประเทศ' : 'ไทย'}`}
      />
      {invoice.type === 'individual' ? (
        <Row label="ชื่อ-นามสกุล" value={`${invoice.firstName ?? ''} ${invoice.lastName ?? ''}`.trim()} />
      ) : (
        <>
          <Row label="ชื่อบริษัท" value={invoice.companyName} />
          {invoice.branch && <Row label="สาขา" value={invoice.branch} />}
        </>
      )}
      {invoice.taxId && <Row label="เลขประจำตัวผู้เสียภาษี" value={invoice.taxId} />}
      {invoice.country === 'TH' && invoice.thaiAddress && (
        <Row label="ที่อยู่"
          value={[invoice.thaiAddress.addressLine, invoice.thaiAddress.subDistrict, invoice.thaiAddress.district, invoice.thaiAddress.province, invoice.thaiAddress.postalCode].filter(Boolean).join(' ')}
        />
      )}
      {invoice.country === 'OTHER' && invoice.internationalAddress && (
        <Row label="ที่อยู่"
          value={[invoice.internationalAddress.line1, invoice.internationalAddress.line2, invoice.internationalAddress.city, invoice.internationalAddress.state, invoice.internationalAddress.postalCode, invoice.internationalAddress.country].filter(Boolean).join(', ')}
        />
      )}
    </>
  );
}