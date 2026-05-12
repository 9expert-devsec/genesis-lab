'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateRegistrationStatus } from '@/lib/actions/registrations';
import { Button } from '@/components/ui/button';

// ── Constants ──────────────────────────────────────────────────────

const STATUS_BADGE = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  paid:      'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const STATUS_LABEL = {
  pending:   'รอดำเนินการ',
  confirmed: 'ยืนยันแล้ว',
  paid:      'ชำระแล้ว',
  cancelled: 'ยกเลิก',
};

// Status flow: which actions are available from each state
const STATUS_ACTIONS = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['paid', 'cancelled'],
  paid:      ['cancelled'],
  cancelled: ['pending'],
};

const ACTION_LABEL = {
  confirmed: 'ยืนยันการสมัคร',
  paid:      'บันทึกชำระแล้ว',
  cancelled: 'ยกเลิกการสมัคร',
  pending:   'คืนสถานะ รอดำเนินการ',
};

const ACTION_VARIANT = {
  confirmed: 'primary',
  paid:      'cta',
  cancelled: 'outline',
  pending:   'outline',
};

const THAI_MONTHS = [
  'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.',
];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} น.`;
}

function refNo(id) {
  return String(id).slice(-8).toUpperCase();
}

// ── Component ──────────────────────────────────────────────────────

export function RegistrationDetailClient({ doc }) {
  const router = useRouter();
  const [status, setStatus] = useState(doc.status);
  const [error, setError]   = useState(null);
  const [busy, setBusy]     = useState(null);
  const [, startTransition] = useTransition();

  const handleAction = (nextStatus) => {
    if (!window.confirm(`เปลี่ยนสถานะเป็น "${STATUS_LABEL[nextStatus]}"?`)) return;
    setBusy(nextStatus);
    setError(null);
    startTransition(async () => {
      const res = await updateRegistrationStatus(doc._id, nextStatus);
      if (res.ok) {
        setStatus(nextStatus);
      } else {
        setError(res.error || 'เกิดข้อผิดพลาด');
      }
      setBusy(null);
    });
  };

  const actions = STATUS_ACTIONS[status] ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-3 flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-9e-action"
          >
            <ArrowLeft className="h-4 w-4" />
            กลับรายการ
          </button>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            ใบสมัคร{' '}
            <span className="font-mono text-9e-action">{refNo(doc._id)}</span>
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            สมัครเมื่อ {fmtDate(doc.createdAt)}
          </p>
        </div>

        {/* Status badge + actions */}
        <div className="flex flex-col items-end gap-3">
          <span className={cn(
            'inline-block rounded-full px-3 py-1 text-sm font-semibold',
            STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-600'
          )}>
            {STATUS_LABEL[status] ?? status}
          </span>

          {actions.length > 0 && (
            <div className="flex gap-2">
              {actions.map((nextStatus) => (
                <Button
                  key={nextStatus}
                  variant={ACTION_VARIANT[nextStatus]}
                  size="sm"
                  onClick={() => handleAction(nextStatus)}
                  disabled={busy !== null}
                >
                  {busy === nextStatus && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {ACTION_LABEL[nextStatus]}
                </Button>
              ))}
            </div>
          )}

          {error && (
            <p className="text-xs text-9e-accent">{error}</p>
          )}
        </div>
      </div>

      {/* ── Course info ── */}
      <Card title="ข้อมูลคอร์ส">
        <Row label="หลักสูตร"     value={doc.courseName} />
        <Row label="รหัสคอร์ส"    value={doc.courseCode || doc.courseId} />
        <Row label="รอบอบรม"      value={doc.classDate || '—'} />
        {doc.scheduleType === 'hybrid' && (
          <Row
            label="รูปแบบการอบรม"
            value={doc.attendanceMode === 'teams' ? 'Online via Microsoft Teams' : 'Classroom'}
          />
        )}
      </Card>

      {/* ── Coordinator ── */}
      <Card title="ผู้ประสานงาน">
        <Row label="ชื่อ-นามสกุล" value={`${doc.coordinator?.firstName ?? ''} ${doc.coordinator?.lastName ?? ''}`.trim()} />
        <Row label="อีเมล"         value={doc.coordinator?.email} />
        <Row label="เบอร์โทร"      value={doc.coordinator?.phone} />
        {doc.coordinator?.lineId && <Row label="LINE ID" value={doc.coordinator.lineId} />}
        <Row label="เข้าอบรมด้วย" value={doc.coordinator?.isAttending ? 'ใช่' : 'ไม่'} />
      </Card>

      {/* ── Attendees ── */}
      <Card title={`ผู้เข้าอบรม (${doc.attendeesCount} ท่าน)`}>
        {!doc.attendeesListProvided ? (
          <p className="text-sm text-[var(--text-secondary)]">
            ยังไม่ได้ระบุรายชื่อ — จะแจ้งภายหลัง
          </p>
        ) : doc.attendees?.length > 0 ? (
          <div className="space-y-2">
            {doc.coordinator?.isAttending && (
              <AttendeeRow
                n={1}
                name={`${doc.coordinator.firstName} ${doc.coordinator.lastName}`}
                email={doc.coordinator.email}
                phone={doc.coordinator.phone}
                isCoord
              />
            )}
            {doc.attendees.map((a, i) => (
              <AttendeeRow
                key={i}
                n={doc.coordinator?.isAttending ? i + 2 : i + 1}
                name={`${a.firstName} ${a.lastName}`}
                email={a.email}
                phone={a.phone}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">ไม่มีข้อมูลผู้เข้าอบรม</p>
        )}
      </Card>

      {/* ── Invoice ── */}
      {doc.requestInvoice && doc.invoice && (
        <Card title="ใบเสนอราคา / ใบกำกับภาษี">
          <Row
            label="ประเภทลูกค้า"
            value={`${doc.invoice.type === 'corporate' ? 'นิติบุคคล / บริษัท' : 'บุคคลทั่วไป'} · ${doc.invoice.country === 'OTHER' ? 'ต่างประเทศ' : 'ไทย'}`}
          />
          {doc.invoice.type === 'individual' ? (
            <Row label="ชื่อ-นามสกุล" value={`${doc.invoice.firstName ?? ''} ${doc.invoice.lastName ?? ''}`.trim()} />
          ) : (
            <>
              <Row label="ชื่อบริษัท" value={doc.invoice.companyName} />
              {doc.invoice.branch && <Row label="สาขา" value={doc.invoice.branch} />}
            </>
          )}
          {doc.invoice.taxId && <Row label="เลขประจำตัวผู้เสียภาษี" value={doc.invoice.taxId} />}
          {doc.invoice.country === 'TH' && doc.invoice.thaiAddress && (
            <Row
              label="ที่อยู่"
              value={[
                doc.invoice.thaiAddress.addressLine,
                doc.invoice.thaiAddress.subDistrict,
                doc.invoice.thaiAddress.district,
                doc.invoice.thaiAddress.province,
                doc.invoice.thaiAddress.postalCode,
              ].filter(Boolean).join(' ')}
            />
          )}
          {doc.invoice.country === 'OTHER' && doc.invoice.internationalAddress && (
            <Row
              label="ที่อยู่"
              value={[
                doc.invoice.internationalAddress.line1,
                doc.invoice.internationalAddress.line2,
                doc.invoice.internationalAddress.city,
                doc.invoice.internationalAddress.state,
                doc.invoice.internationalAddress.postalCode,
                doc.invoice.internationalAddress.country,
              ].filter(Boolean).join(', ')}
            />
          )}
        </Card>
      )}

      {/* ── Notes ── */}
      {doc.notes && (
        <Card title="หมายเหตุ">
          <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{doc.notes}</p>
        </Card>
      )}

      {/* ── Meta ── */}
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

function Card({ title, children }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-full text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] sm:w-44 sm:flex-none">
        {label}
      </dt>
      <dd className="text-sm text-[var(--text-primary)]">{value || '—'}</dd>
    </div>
  );
}

function AttendeeRow({ n, name, email, phone, isCoord }) {
  return (
    <div className={cn(
      'rounded-9e-md border p-3 text-sm',
      isCoord
        ? 'border-9e-brand/30 bg-9e-brand/5'
        : 'border-[var(--surface-border)]'
    )}>
      <div className="font-semibold text-[var(--text-primary)]">
        ท่านที่ {n} · {name}
        {isCoord && <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">(ผู้ประสานงาน)</span>}
      </div>
      <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
        {email} · {phone}
      </div>
    </div>
  );
}