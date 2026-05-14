'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Pencil, Trash2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  updateInhouseStatus,
  updateInhouseAdminNotes,
  deleteInhouseRegistration,
} from '@/lib/actions/inhouse-registrations';
import { Button } from '@/components/ui/button';

// ── Constants ──────────────────────────────────────────────────────

const STATUS_BADGE = {
  new:           'bg-violet-100 text-violet-700',
  contacted:     'bg-blue-100 text-blue-700',
  quoted:        'bg-amber-100 text-amber-700',
  'closed-won':  'bg-emerald-100 text-emerald-700',
  'closed-lost': 'bg-slate-100 text-slate-500',
};

const STATUS_LABEL = {
  new:           'ใหม่ — รอติดต่อ',
  contacted:     'ติดต่อแล้ว',
  quoted:        'ส่งใบเสนอราคาแล้ว',
  'closed-won':  'ปิดงานสำเร็จ',
  'closed-lost': 'ปิดงาน — ไม่สำเร็จ',
};

const STATUS_ACTIONS = {
  new:           ['contacted', 'closed-lost'],
  contacted:     ['quoted', 'closed-lost'],
  quoted:        ['closed-won', 'closed-lost'],
  'closed-won':  ['contacted'],
  'closed-lost': ['new'],
};

const ACTION_LABEL = {
  contacted:     'บันทึกว่าติดต่อแล้ว',
  quoted:        'ส่งใบเสนอราคา',
  'closed-won':  'ปิดงานสำเร็จ',
  'closed-lost': 'ปิดงาน — ไม่สำเร็จ',
  new:           'คืนสถานะ "ใหม่"',
};

const ACTION_VARIANT = {
  contacted:     'primary',
  quoted:        'primary',
  'closed-won':  'cta',
  'closed-lost': 'outline',
  new:           'outline',
};

const SKILL_LEVEL_LABEL = {
  beginner:     'Beginner — เริ่มต้น',
  intermediate: 'Intermediate — ปานกลาง',
  advanced:     'Advanced — ขั้นสูง',
  mixed:        'Mixed — มีหลายระดับ',
};

const CONTENT_MODE_LABEL = {
  standard: 'Outline มาตรฐาน',
  custom:   'ปรับเนื้อหา',
  consult:  'ให้แนะนำ',
};

const TRAINING_FORMAT_LABEL = {
  onsite:   'Onsite',
  online:   'Online',
  flexible: 'ยังไม่ระบุ (Flexible)',
};

const PREFERRED_CONTACT_LABEL = {
  email: 'Email',
  phone: 'โทรศัพท์',
  line:  'LINE',
};

const PREFERRED_TIME_LABEL = {
  morning:   'เช้า (09:00-12:00)',
  afternoon: 'บ่าย (13:00-17:00)',
  business:  'เวลาทำการ (09:00-17:00)',
};

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} น.`;
}

function refNo(id) { return String(id).slice(-8).toUpperCase(); }

function scheduleSummary(doc) {
  if (doc.scheduleMode === 'month') return `เดือน: ${doc.preferredMonth || '—'}`;
  if (doc.scheduleMode === 'dateRange') return `${doc.preferredDateFrom || '—'} ถึง ${doc.preferredDateTo || '—'}`;
  return 'ยังไม่แน่ใจ';
}

function quotationAddress(doc) {
  if (doc.quotationCountry === 'OTHER' && doc.internationalAddress) {
    return [
      doc.internationalAddress.line1,
      doc.internationalAddress.line2,
      doc.internationalAddress.city,
      doc.internationalAddress.state,
      doc.internationalAddress.postalCode,
      doc.internationalAddress.country,
    ].filter(Boolean).join(', ');
  }
  if (doc.quotationCountry === 'TH' && doc.thaiAddress) {
    return [
      doc.thaiAddress.addressLine,
      doc.thaiAddress.subDistrict,
      doc.thaiAddress.district,
      doc.thaiAddress.province,
      doc.thaiAddress.postalCode,
    ].filter(Boolean).join(' ');
  }
  return '';
}

// ── Main Component ─────────────────────────────────────────────────

export function InhouseDetailClient({ doc }) {
  const router = useRouter();

  const [status,      setStatus]      = useState(doc.status);
  const [adminNotes,  setAdminNotes]  = useState(doc.adminNotes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [busy,        setBusy]        = useState(null);
  const [error,       setError]       = useState(null);
  const [, startTransition] = useTransition();

  const statusActions = STATUS_ACTIONS[status] ?? [];

  const handleStatusAction = (next) => {
    if (!window.confirm(`เปลี่ยนสถานะเป็น "${STATUS_LABEL[next]}"?`)) return;
    setBusy(next); setError(null);
    startTransition(async () => {
      const res = await updateInhouseStatus(doc._id, next);
      if (res.ok) setStatus(next);
      else setError(res.error || 'เกิดข้อผิดพลาด');
      setBusy(null);
    });
  };

  const handleSaveNotes = () => {
    setBusy('save-notes'); setError(null);
    startTransition(async () => {
      const res = await updateInhouseAdminNotes(doc._id, adminNotes);
      if (res.ok) setEditingNotes(false);
      else setError(res.error || 'บันทึกไม่สำเร็จ');
      setBusy(null);
    });
  };

  const handleCancelNotes = () => {
    setAdminNotes(doc.adminNotes ?? '');
    setEditingNotes(false);
  };

  const handleDelete = () => {
    if (!window.confirm(`ลบ Request ${refNo(doc._id)} ถาวร?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    setBusy('delete'); setError(null);
    startTransition(async () => {
      const res = await deleteInhouseRegistration(doc._id);
      if (res.ok) router.push('/admin/registrations?source=inhouse');
      else { setError(res.error || 'ลบไม่สำเร็จ'); setBusy(null); }
    });
  };

  const address = quotationAddress(doc);
  const countryLabel = doc.quotationCountry === 'OTHER' ? 'ต่างประเทศ' : 'ไทย';

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
            In-house Request <span className="font-mono text-9e-action">{refNo(doc._id)}</span>
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">ส่งคำขอเมื่อ {fmtDate(doc.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <span className={cn('inline-block rounded-full px-3 py-1 text-sm font-semibold', STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-600')}>
            {STATUS_LABEL[status] ?? status}
          </span>
          {statusActions.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
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
            ลบ Request นี้
          </button>
          {error && <p className="text-xs text-9e-accent">{error}</p>}
        </div>
      </div>

      {/* ── Contact / Company ── */}
      <Card title="ผู้ประสานงาน & บริษัท">
        <Row label="บริษัท / องค์กร" value={doc.companyName} />
        <Row label="ชื่อ-นามสกุล" value={`${doc.contactFirstName ?? ''} ${doc.contactLastName ?? ''}`.trim()} />
        {(doc.contactRole || doc.contactDepartment) && (
          <Row label="ตำแหน่ง / แผนก" value={[doc.contactRole, doc.contactDepartment].filter(Boolean).join(' · ')} />
        )}
        <Row label="อีเมล" value={<a href={`mailto:${doc.contactEmail}`} className="text-9e-action hover:underline">{doc.contactEmail}</a>} />
        <Row label="เบอร์โทร" value={<a href={`tel:${doc.contactPhone}`} className="text-9e-action hover:underline">{doc.contactPhone}</a>} />
        {doc.contactLine && <Row label="LINE ID" value={doc.contactLine} />}
        <Row label="ช่องทางติดต่อที่สะดวก"
          value={`${PREFERRED_CONTACT_LABEL[doc.preferredContact] ?? doc.preferredContact} · ${PREFERRED_TIME_LABEL[doc.preferredContactTime] ?? doc.preferredContactTime}`} />
      </Card>

      {/* ── Training Requirement ── */}
      <Card title="Training Requirement">
        <Row label="หลักสูตรที่สนใจ"
          value={(doc.coursesInterested ?? []).length > 0 ? doc.coursesInterested.join(', ') : '—'} />
        <Row label="จำนวนผู้เข้าอบรม" value={`${doc.participantsCount} ท่าน`} />
        <Row label="ระดับพื้นฐาน" value={SKILL_LEVEL_LABEL[doc.skillLevel] ?? doc.skillLevel} />
        <Row label="วัตถุประสงค์" value={doc.objective || '—'} />
        <Row label="เนื้อหา" value={CONTENT_MODE_LABEL[doc.contentMode] ?? doc.contentMode} />
        {doc.contentDetails && <Row label="รายละเอียดเนื้อหา" value={doc.contentDetails} />}
      </Card>

      {/* ── Schedule & Format ── */}
      <Card title="ตารางเวลา & รูปแบบการอบรม">
        <Row label="ช่วงเวลา" value={scheduleSummary(doc)} />
        {doc.scheduleNote && <Row label="หมายเหตุเวลา" value={doc.scheduleNote} />}
        <Row label="รูปแบบ" value={TRAINING_FORMAT_LABEL[doc.trainingFormat] ?? doc.trainingFormat} />
        {doc.trainingFormat === 'onsite' && (
          <>
            <Row label="สถานที่จัดอบรม"
              value={[doc.onsiteAddress, doc.onsiteDistrict, doc.onsiteProvince].filter(Boolean).join(', ') || '—'} />
            {(doc.onsiteEquipment ?? []).length > 0 && (
              <Row label="อุปกรณ์ที่มีให้" value={doc.onsiteEquipment.join(', ')} />
            )}
          </>
        )}
        {doc.trainingFormat === 'online' && (doc.onlineRegion || doc.onlineTimezone) && (
          <Row label="Online detail"
            value={[doc.onlineRegion, doc.onlineTimezone].filter(Boolean).join(' · ')} />
        )}
      </Card>

      {/* ── Quotation ── */}
      <Card title="ข้อมูลใบเสนอราคา">
        <Row label="ประเทศ" value={countryLabel} />
        {doc.quotationCompany && <Row label="ชื่อบริษัท" value={doc.quotationCompany} />}
        {doc.taxId  && <Row label="เลขผู้เสียภาษี" value={doc.taxId} />}
        {doc.branch && <Row label="สาขา"           value={doc.branch} />}
        {address    && <Row label="ที่อยู่"         value={address} />}
      </Card>

      {/* ── Message ── */}
      {doc.message && (
        <Card title="หมายเหตุจากลูกค้า">
          <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{doc.message}</p>
        </Card>
      )}

      {/* ── Admin notes (editable) ── */}
      <CardEditable
        title="บันทึกภายในของทีมขาย"
        isEditing={editingNotes}
        isSaving={busy === 'save-notes'}
        onEdit={() => setEditingNotes(true)}
        onSave={handleSaveNotes}
        onCancel={handleCancelNotes}
      >
        {editingNotes ? (
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="บันทึกการติดต่อ ข้อเสนอ การเจรจา ฯลฯ"
            className="w-full resize-y rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand"
          />
        ) : (
          <p className={cn('whitespace-pre-wrap text-sm', adminNotes ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] italic')}>
            {adminNotes || 'ยังไม่มีบันทึกจากทีมขาย'}
          </p>
        )}
      </CardEditable>

      {/* ── Meta ── */}
      <Card title="ข้อมูลระบบ">
        <Row label="Request ID"   value={<span className="font-mono text-xs">{doc._id}</span>} />
        <Row label="แหล่งที่มา"    value={doc.source ?? 'inhouse'} />
        {doc.ipAddress && <Row label="IP Address" value={doc.ipAddress} />}
        <Row label="อัปเดตล่าสุด"  value={fmtDate(doc.updatedAt)} />
      </Card>
    </div>
  );
}

// ── Shared atoms ───────────────────────────────────────────────────

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

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-full text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] sm:w-44 sm:flex-none">{label}</dt>
      <dd className="text-sm text-[var(--text-primary)]">{value || '—'}</dd>
    </div>
  );
}