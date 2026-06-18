'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTHB } from '@/lib/pricing';
import {
  updateMasterclassRegistrationStatus,
  deleteMasterclassRegistration,
} from '@/lib/actions/masterclass-registrations';

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
const PAYMENT_BADGE = {
  successful: 'bg-emerald-100 text-emerald-700',
  pending:    'bg-amber-100 text-amber-700',
  failed:     'bg-red-100 text-red-600',
  expired:    'bg-slate-100 text-slate-500',
};
const PAYMENT_METHOD_LABEL = { credit_card: 'บัตรเครดิต/เดบิต', promptpay: 'QR PromptPay', quote: 'ขอใบเสนอราคา' };
const OMISE_STATUS_LABEL   = { pending: 'รอชำระ', successful: 'สำเร็จ', failed: 'ล้มเหลว', expired: 'หมดอายุ' };
const LICENSE_CHOICE_LABEL = { own: 'ใช้ License ของตนเอง', '9expert': 'ใช้ License ของ 9Expert' };

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`;
}
function refNo(id) { return String(id).slice(-8).toUpperCase(); }

// ── Main Component ─────────────────────────────────────────────────

export function MasterclassRegDetailClient({ reg }) {
  const router = useRouter();
  const [status, setStatus] = useState(reg.status);
  const [error,  setError]  = useState(null);
  const [busy,   setBusy]   = useState(null);
  const [, startTransition] = useTransition();

  const handleSaveStatus = () => {
    setBusy('status'); setError(null);
    startTransition(async () => {
      const res = await updateMasterclassRegistrationStatus(reg._id, status);
      if (res?.ok) startTransition(() => router.refresh());
      else setError(res?.error || 'บันทึกไม่สำเร็จ');
      setBusy(null);
    });
  };

  const handleDelete = () => {
    if (!window.confirm(`ลบใบลงทะเบียน ${refNo(reg._id)} ถาวร?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    setBusy('delete'); setError(null);
    startTransition(async () => {
      const res = await deleteMasterclassRegistration(reg._id);
      if (res?.ok) router.push('/admin/masterclass/registrations');
      else { setError(res?.error || 'ลบไม่สำเร็จ'); setBusy(null); }
    });
  };

  const a = reg.attendee ?? {};
  const p = reg.pricing;
  const pay = reg.payment;
  const inv = reg.invoice;
  const consent = reg.consent;

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/masterclass/registrations"
            className="mb-3 flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-9e-action"
          >
            <ArrowLeft className="h-4 w-4" /> ผู้ลงทะเบียนทั้งหมด
          </Link>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            ใบลงทะเบียน <span className="font-mono text-9e-action">{refNo(reg._id)}</span>
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">ลงทะเบียนเมื่อ {fmtDate(reg.createdAt)}</p>
        </div>
        <span className={cn('inline-block rounded-full px-3 py-1 text-sm font-semibold', STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-600')}>
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── ข้อมูลผู้เรียน ── */}
        <Card title="ข้อมูลผู้เรียน">
          <Row label="ชื่อ-นามสกุล" value={`${a.firstName ?? ''} ${a.lastName ?? ''}`.trim()} />
          <Row label="อีเมล"        value={a.email} />
          <Row label="เบอร์โทร"     value={a.phone} />
          {a.lineId && <Row label="LINE ID" value={a.lineId} />}
        </Card>

        {/* ── หลักสูตร ── */}
        <Card title="หลักสูตร">
          <Row label="หลักสูตร"   value={reg.course_title} />
          <Row label="รุ่น"       value={reg.batch_label} />
          <Row label="วันอบรม"    value={reg.batch_date_label} />
          <Row label="สถานที่"    value={reg.venue_name} />
        </Card>

        {/* ── License ── */}
        {(reg.license_choice || reg.license_level || reg.license_detail) && (
          <Card title="License">
            {reg.license_choice && (
              <Row label="ตัวเลือก" value={LICENSE_CHOICE_LABEL[reg.license_choice] ?? reg.license_choice} />
            )}
            {reg.license_level  && <Row label="ระดับ"      value={reg.license_level} />}
            {reg.license_detail && <Row label="รายละเอียด" value={reg.license_detail} />}
          </Card>
        )}

        {/* ── ราคา ── */}
        {p && (
          <Card title="ราคา">
            <Row label="ราคาต่อท่าน" value={`${formatTHB(p.pricePerSeat)} บาท`} />
            <Row label={`ราคา × ${p.seats ?? 1} ท่าน`} value={`${formatTHB(p.subtotal)} บาท`} />
            <Row label={`VAT ${Math.round((p.vatRate ?? 0.07) * 100)}%`} value={`${formatTHB(p.vatAmount)} บาท`} />
            <Row label="ยอดสุทธิ" value={<span className="font-bold text-9e-action">{formatTHB(p.total)} บาท</span>} />
          </Card>
        )}

        {/* ── การชำระเงิน ── */}
        {pay && (
          <Card title="การชำระเงิน">
            <Row label="วิธีชำระเงิน" value={PAYMENT_METHOD_LABEL[pay.method] ?? pay.method} />
            <Row
              label="สถานะการชำระ"
              value={
                <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', PAYMENT_BADGE[pay.omiseStatus] ?? 'bg-slate-100 text-slate-600')}>
                  {OMISE_STATUS_LABEL[pay.omiseStatus] ?? (pay.omiseStatus || '—')}
                </span>
              }
            />
            {pay.omiseChargeId && (
              <Row
                label="Omise Charge ID"
                value={
                  <a
                    href={`https://dashboard.omise.co/charges/${pay.omiseChargeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block max-w-[200px] truncate font-mono text-xs text-9e-action hover:underline"
                  >
                    {pay.omiseChargeId}
                  </a>
                }
              />
            )}
            {pay.paidAt && <Row label="วันที่ชำระ" value={fmtDate(pay.paidAt)} />}
            {(pay.failureCode || pay.failureMessage) && (
              <Row label="สาเหตุที่ล้มเหลว" value={[pay.failureCode, pay.failureMessage].filter(Boolean).join(' · ')} />
            )}
          </Card>
        )}

        {/* ── ใบเสร็จ / ใบกำกับภาษี ── */}
        <Card title="ใบเสร็จ / ใบกำกับภาษี">
          {!reg.request_invoice || !inv ? (
            <p className="text-sm italic text-[var(--text-muted)]">ไม่ได้ขอใบกำกับภาษี</p>
          ) : (
            <>
              <Row
                label="ประเภทลูกค้า"
                value={`${inv.type === 'corporate' ? 'นิติบุคคล / บริษัท' : 'บุคคลทั่วไป'} · ${inv.country === 'OTHER' ? 'ต่างประเทศ' : 'ไทย'}`}
              />
              {inv.type === 'individual' ? (
                <Row label="ชื่อ-นามสกุล" value={`${inv.firstName ?? ''} ${inv.lastName ?? ''}`.trim()} />
              ) : (
                <>
                  <Row label="ชื่อบริษัท" value={inv.companyName} />
                  {inv.branch && <Row label="สาขา" value={inv.branch} />}
                </>
              )}
              {inv.taxId && <Row label="เลขประจำตัวผู้เสียภาษี" value={inv.taxId} />}
              {inv.country === 'TH' && inv.thaiAddress && (
                <Row
                  label="ที่อยู่"
                  value={[inv.thaiAddress.addressLine, inv.thaiAddress.subDistrict, inv.thaiAddress.district, inv.thaiAddress.province, inv.thaiAddress.postalCode].filter(Boolean).join(' ')}
                />
              )}
              {inv.country === 'OTHER' && inv.internationalAddress && (
                <Row
                  label="ที่อยู่"
                  value={[inv.internationalAddress.line1, inv.internationalAddress.line2, inv.internationalAddress.city, inv.internationalAddress.state, inv.internationalAddress.postalCode, inv.internationalAddress.country].filter(Boolean).join(', ')}
                />
              )}
            </>
          )}
        </Card>

        {/* ── Consent ── */}
        {consent && (
          <Card title="การยอมรับเงื่อนไข (Audit)">
            <ConsentLine ok={consent.dataChecked}   label="ตรวจสอบข้อมูลแล้ว" />
            <ConsentLine ok={consent.noRefund}      label="รับทราบไม่คืนเงิน" />
            <ConsentLine ok={consent.changePolicy}  label="เงื่อนไขเปลี่ยน/เลื่อน/ยกเลิก" />
            <ConsentLine ok={consent.termsAccepted} label="ยินยอมเงื่อนไขอบรม" />
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              เวลา: {consent.acceptedAt ? fmtDate(consent.acceptedAt) : '—'} · IP: {consent.ipAddress || '—'}
            </div>
          </Card>
        )}
      </div>

      {/* ── Admin actions ── */}
      <section className="sticky bottom-0 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-4 shadow-9e-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">สถานะ</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={cn(
                  'h-9 w-44 rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
                  'border-[var(--surface-border)] focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
                )}
              >
                <option value="pending">{STATUS_LABEL.pending}</option>
                <option value="confirmed">{STATUS_LABEL.confirmed}</option>
                <option value="paid">{STATUS_LABEL.paid}</option>
                <option value="cancelled">{STATUS_LABEL.cancelled}</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleSaveStatus}
              disabled={busy !== null || status === reg.status}
              className="flex h-9 items-center gap-1.5 rounded-9e-md bg-9e-navy px-4 text-xs font-semibold text-9e-ice hover:opacity-90 disabled:opacity-40"
            >
              {busy === 'status' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              บันทึก
            </button>
          </div>

          <button
            type="button"
            onClick={handleDelete}
            disabled={busy !== null}
            className="flex h-9 items-center gap-1.5 rounded-9e-md border border-red-200 px-4 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            ลบรายการ
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </section>
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
      <dt className="w-full text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] sm:w-40 sm:flex-none">{label}</dt>
      <dd className="text-sm text-[var(--text-primary)] break-words">{value || '—'}</dd>
    </div>
  );
}

function ConsentLine({ ok, label }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
      <span className={ok ? 'text-emerald-600' : 'text-[var(--text-muted)]'}>{ok ? '✓' : '—'}</span>
      <span>{label}</span>
    </div>
  );
}
