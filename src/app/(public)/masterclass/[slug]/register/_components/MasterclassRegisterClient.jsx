'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import {
  Loader2, CheckCircle2, CreditCard, QrCode, Lock, ChevronRight,
} from 'lucide-react';
import { InvoiceFields } from '@/components/registration/InvoiceFields';
import { computePricing, formatTHB } from '@/lib/pricing';
import { CountdownTimer } from '../../../_components/CountdownTimer';

const STORAGE_KEY = 'masterclass-register-v1';

const STEPS = ['กรอกข้อมูล', 'ตรวจสอบ', 'ชำระเงิน'];

const CONSENTS = [
  { key: 'dataChecked',   label: 'ข้าพเจ้าตรวจสอบข้อมูลการสมัครเรียบร้อยแล้ว' },
  { key: 'noRefund',      label: 'รับทราบว่าไม่สามารถขอคืนเงินได้หลังชำระเงินแล้ว' },
  { key: 'changePolicy',  label: 'รับทราบเงื่อนไขการเลื่อน/เปลี่ยนแปลงรอบอบรม' },
  { key: 'termsAccepted', label: 'ยินยอมตามเงื่อนไขการอบรมของ 9Expert Training' },
];

const EMPTY_THAI_ADDRESS = {
  addressLine: '', subDistrict: '', district: '', province: '', postalCode: '',
};

const EMPTY_INVOICE = {
  type: 'individual',
  country: 'TH',
  firstName: '',
  lastName: '',
  companyName: '',
  branch: '',
  taxId: '',
  thaiAddress: EMPTY_THAI_ADDRESS,
  internationalAddress: null,
};

const inputCls =
  'w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm dark:bg-[#0D1B2A] dark:text-white focus:outline-none focus:ring-1 focus:ring-9e-action';

const EMPTY_FORM = {
  firstName: '', lastName: '', email: '', phone: '', lineId: '',
  license_choice: null, license_level: '', license_detail: '',
  request_invoice: false,
};

// ── Progress indicator ────────────────────────────────────────────────────────
function Stepper({ step }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {STEPS.map((label, i) => (
        <Fragment key={i}>
          <div
            className={`flex items-center gap-2 text-sm font-medium ${
              step > i + 1 ? 'text-green-600' : step === i + 1 ? 'text-9e-action' : 'text-gray-400'
            }`}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step > i + 1
                  ? 'bg-green-100 text-green-600'
                  : step === i + 1
                    ? 'bg-9e-action text-white'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step > i + 1 ? <CheckCircle2 size={14} /> : i + 1}
            </span>
            {label}
          </div>
          {i < STEPS.length - 1 && <ChevronRight size={14} className="text-gray-300" />}
        </Fragment>
      ))}
    </div>
  );
}

// ── Batch summary card ────────────────────────────────────────────────────────
function BatchSummary({ course, batch }) {
  return (
    <aside className="rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
      <h3 className="text-base font-bold text-9e-navy dark:text-white">{course.title_th}</h3>
      <p className="mt-1 text-sm text-gray-500">
        {batch.batch_label || `รุ่นที่ ${batch.batch_no}`}
      </p>
      {batch.dates?.[0]?.day_label && (
        <p className="mt-1 text-sm text-9e-navy dark:text-white">{batch.dates[0].day_label}</p>
      )}
      {batch.venue_name && <p className="mt-1 text-xs text-gray-400">{batch.venue_name}</p>}

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-9e-action">
          {batch.effective_price?.toLocaleString('th-TH')} บาท
        </span>
        {batch.is_early_bird && (
          <span className="text-sm text-gray-400 line-through">
            {batch.original_price?.toLocaleString('th-TH')} บาท
          </span>
        )}
      </div>
      {batch.is_early_bird && (
        <span className="mt-2 inline-flex w-fit items-center rounded-full bg-9e-lime px-3 py-0.5 text-xs font-semibold text-9e-navy">
          Early Bird
        </span>
      )}
      {batch.is_early_bird && batch.early_bird_deadline && (
        <CountdownTimer deadline={batch.early_bird_deadline} className="mt-3" />
      )}
    </aside>
  );
}

// ── Omise card form ───────────────────────────────────────────────────────────
function OmiseCardForm({ amount, onToken }) {
  useEffect(() => {
    if (!window.OmiseCard) return;
    window.OmiseCard.configure({
      publicKey: process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY,
    });
  }, []);

  const openForm = () => {
    if (!window.OmiseCard) return;
    window.OmiseCard.open({
      frameLabel: '9Expert Masterclass',
      submitLabel: `ชำระ ${amount?.toLocaleString('th-TH')} บาท`,
      currency: 'THB',
      amount: Math.round((amount ?? 0) * 100),
      onCreateTokenSuccess: (token) => onToken(token),
      onFormClosed: () => {},
    });
  };

  return (
    <button
      type="button"
      onClick={openForm}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-9e-action py-3 text-sm font-semibold text-white transition-colors hover:bg-9e-brand"
    >
      <Lock size={14} /> ชำระเงินด้วยบัตร {formatTHB(amount)} บาท
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MasterclassRegisterClient({ course, batch }) {
  const [step, setStep] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [registrationId, setRegistrationId] = useState(null);
  const [result, setResult] = useState(null);
  const [channel, setChannel] = useState(null);
  const [charge, setCharge] = useState(null);
  const [payError, setPayError] = useState(null);
  const [consents, setConsents] = useState({
    dataChecked: false, noRefund: false, changePolicy: false, termsAccepted: false,
  });

  const licenseEnabled = Boolean(course.license_options?.enabled);
  const pricing = computePricing(batch.effective_price, 1);

  // Invoice subtree lives in react-hook-form so InvoiceFields keeps its
  // native register/watch/setValue/errors contract.
  const {
    register, watch, setValue, getValues, reset,
    formState: { errors },
  } = useForm({ defaultValues: { invoice: EMPTY_INVOICE } });

  // ── hydration + sessionStorage restore ──────────────────────────────────────
  useEffect(() => {
    setHydrated(true);
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.formState) setFormState({ ...EMPTY_FORM, ...saved.formState });
        if (saved?.invoice) reset({ invoice: saved.invoice });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Omise.js script ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById('omise-js')) return;
    const script = document.createElement('script');
    script.id = 'omise-js';
    script.src = 'https://cdn.omise.co/omise.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const persist = useCallback(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ formState, invoice: getValues('invoice') })
      );
    } catch {}
  }, [formState, getValues]);

  // ── PromptPay polling ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!charge?.pending || !registrationId) return undefined;
    let elapsed = 0;
    const MAX = 10 * 60 * 1000; // 10 minutes
    const iv = setInterval(async () => {
      elapsed += 3000;
      try {
        const r = await fetch(`/api/masterclass/register/status?id=${registrationId}`, {
          cache: 'no-store',
        });
        const d = await r.json();
        if (d.status === 'paid' || d.paymentStatus === 'successful') {
          clearInterval(iv);
          setResult({
            referenceNumber: charge.referenceNumber,
            amount: charge.amount,
            method: 'promptpay',
          });
        }
      } catch {}
      if (elapsed >= MAX) {
        clearInterval(iv);
        setPayError('QR Code หมดอายุ กรุณาลองใหม่');
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [charge, registrationId]);

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-9e-action" />
      </div>
    );
  }

  // ── handlers ────────────────────────────────────────────────────────────────
  function setField(key, value) {
    setFormState((p) => ({ ...p, [key]: value }));
  }

  function handleStep1Next() {
    setSubmitError(null);
    const { firstName, lastName, email, phone } = formState;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setSubmitError('กรุณากรอกข้อมูลผู้เรียนให้ครบถ้วน (ชื่อ นามสกุล อีเมล เบอร์โทร)');
      return;
    }
    persist();
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const allConsented = CONSENTS.every((c) => consents[c.key]);

  async function handleConfirmAndRegister() {
    if (!allConsented) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const invoice = getValues('invoice');
      const payload = {
        batchId: String(batch._id),
        attendee: {
          firstName: formState.firstName.trim(),
          lastName: formState.lastName.trim(),
          email: formState.email.trim(),
          phone: formState.phone.trim(),
          lineId: formState.lineId.trim(),
        },
        license_choice: formState.license_choice ?? null,
        license_level: formState.license_level || null,
        license_detail: formState.license_detail || null,
        request_invoice: formState.request_invoice,
        invoice: formState.request_invoice ? invoice : null,
        consent: {
          ...consents,
          accepted: true,
          acceptedAt: new Date().toISOString(),
        },
      };
      const res = await fetch('/api/masterclass/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSubmitError(data?.message || 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่');
        return;
      }
      setRegistrationId(data.registrationId);
      setStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err?.message ?? 'ลงทะเบียนไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function chargeCard(omiseToken) {
    setPayError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/masterclass/register/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId, paymentMethod: 'credit_card', omiseToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPayError(data?.message || 'การชำระเงินไม่สำเร็จ');
        return;
      }
      setResult({ referenceNumber: data.referenceNumber, amount: data.amount, method: 'credit_card' });
    } catch (err) {
      setPayError(err?.message ?? 'การชำระเงินไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function createPromptPay() {
    setPayError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/masterclass/register/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId, paymentMethod: 'promptpay' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPayError(data?.message || 'สร้าง QR ไม่สำเร็จ');
        return;
      }
      setCharge(data);
    } catch (err) {
      setPayError(err?.message ?? 'สร้าง QR ไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 lg:px-6">
      <Stepper step={result ? 3 : step} />

      {/* ── STEP 1 ── */}
      {step === 1 && !result && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <h2 className="text-lg font-bold text-9e-navy dark:text-white">ข้อมูลผู้เรียน</h2>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">ชื่อ *</label>
                <input type="text" value={formState.firstName} onChange={(e) => setField('firstName', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">นามสกุล *</label>
                <input type="text" value={formState.lastName} onChange={(e) => setField('lastName', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">อีเมล *</label>
                <input type="email" value={formState.email} onChange={(e) => setField('email', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">เบอร์โทร *</label>
                <input type="tel" value={formState.phone} onChange={(e) => setField('phone', e.target.value)} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">LINE ID</label>
                <input type="text" value={formState.lineId} onChange={(e) => setField('lineId', e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* License section */}
            {licenseEnabled && (
              <div className="mt-6">
                <h3 className="mb-3 text-sm font-semibold text-9e-navy dark:text-white">
                  ตัวเลือก License
                </h3>
                {course.license_options.choices.map((choice) => (
                  <label key={choice.value} className="mb-3 flex cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name="license_choice"
                      value={choice.value}
                      checked={formState.license_choice === choice.value}
                      onChange={() => setFormState((p) => ({ ...p, license_choice: choice.value, license_level: '', license_detail: '' }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-9e-navy dark:text-white">{choice.label_th}</span>
                      {formState.license_choice === choice.value && choice.require_detail && (
                        <div className="mt-2">
                          {choice.detail_type === 'dropdown' ? (
                            <select
                              value={formState.license_level ?? ''}
                              onChange={(e) => setFormState((p) => ({ ...p, license_level: e.target.value }))}
                              className={inputCls}
                            >
                              <option value="">-- เลือก --</option>
                              {choice.detail_options.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              placeholder={choice.detail_label_th}
                              value={formState.license_detail ?? ''}
                              onChange={(e) => setFormState((p) => ({ ...p, license_detail: e.target.value }))}
                              className={inputCls}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Invoice section */}
            <div className="mt-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-9e-navy dark:text-white">
                <input
                  type="checkbox"
                  checked={formState.request_invoice}
                  onChange={(e) => setField('request_invoice', e.target.checked)}
                />
                ต้องการใบเสร็จ/ใบกำกับภาษี
              </label>
              {formState.request_invoice && (
                <div className="mt-4">
                  <InvoiceFields register={register} watch={watch} setValue={setValue} errors={errors} />
                </div>
              )}
            </div>

            {submitError && (
              <div className="mt-4 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleStep1Next}
                className="inline-flex items-center gap-1 rounded-full bg-9e-action px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-9e-brand"
              >
                ถัดไป <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <BatchSummary course={course} batch={batch} />
        </div>
      )}

      {/* ── STEP 2 — Review ── */}
      {step === 2 && !result && (
        <div className="mx-auto max-w-2xl">
          <h2 className="text-lg font-bold text-9e-navy dark:text-white">ตรวจสอบข้อมูล</h2>

          <Section title="ข้อมูลผู้เรียน">
            <ReadRow label="ชื่อ-นามสกุล" value={`${formState.firstName} ${formState.lastName}`.trim()} />
            <ReadRow label="อีเมล" value={formState.email} />
            <ReadRow label="เบอร์โทร" value={formState.phone} />
            {formState.lineId && <ReadRow label="LINE ID" value={formState.lineId} />}
          </Section>

          {licenseEnabled && formState.license_choice && (
            <Section title="ตัวเลือก License">
              <ReadRow
                label="License"
                value={
                  course.license_options.choices.find((c) => c.value === formState.license_choice)?.label_th
                  ?? formState.license_choice
                }
              />
              {formState.license_level && <ReadRow label="ระดับ" value={formState.license_level} />}
              {formState.license_detail && <ReadRow label="รายละเอียด" value={formState.license_detail} />}
            </Section>
          )}

          <Section title="หลักสูตร">
            <ReadRow label="หลักสูตร" value={course.title_th} />
            <ReadRow label="รุ่น" value={batch.batch_label || `รุ่นที่ ${batch.batch_no}`} />
            <ReadRow label="วันที่" value={batch.dates?.[0]?.day_label || '—'} />
            <ReadRow label="สถานที่" value={batch.venue_name || '—'} />
          </Section>

          <Section title="ราคา">
            <ReadRow label="ราคาต่อที่นั่ง" value={`${formatTHB(pricing.pricePerSeat)} บาท`} />
            <ReadRow label="ยอดรวมก่อน VAT" value={`${formatTHB(pricing.subtotal)} บาท`} />
            <ReadRow label="VAT 7%" value={`${formatTHB(pricing.vatAmount)} บาท`} />
            <div className="mt-2 flex items-baseline justify-between border-t border-[var(--surface-border)] pt-2">
              <span className="text-sm font-semibold text-9e-navy dark:text-white">ยอดชำระทั้งหมด</span>
              <span className="text-xl font-bold text-9e-action">{formatTHB(pricing.total)} บาท</span>
            </div>
          </Section>

          {/* Consents */}
          <div className="mt-6 space-y-3">
            {CONSENTS.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-start gap-2 text-sm text-9e-navy dark:text-white">
                <input
                  type="checkbox"
                  checked={consents[c.key]}
                  onChange={(e) => setConsents((p) => ({ ...p, [c.key]: e.target.checked }))}
                  className="mt-0.5"
                />
                {c.label}
              </label>
            ))}
          </div>

          {submitError && (
            <div className="mt-4 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="rounded-full border border-[var(--surface-border)] px-5 py-3 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
            >
              ← ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={handleConfirmAndRegister}
              disabled={!allConsented || submitting}
              className="inline-flex items-center gap-2 rounded-full bg-9e-action px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-9e-brand disabled:opacity-50"
            >
              {submitting ? <><Loader2 size={16} className="animate-spin" /> กำลังดำเนินการ…</> : 'ยืนยันและชำระเงิน'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3 — Payment / Receipt ── */}
      {step === 3 && (
        <div className="mx-auto max-w-xl">
          {result ? (
            <div className="py-12 text-center">
              <CheckCircle2 size={56} className="mx-auto text-green-500" />
              <h2 className="mt-4 text-2xl font-bold text-9e-navy dark:text-white">ชำระเงินสำเร็จ!</h2>
              <p className="mt-2 text-gray-500">รหัสอ้างอิง: <strong>{result.referenceNumber}</strong></p>
              <p className="text-gray-500">ยอดชำระ: <strong>{formatTHB(result.amount)} บาท</strong></p>
              <p className="mt-4 text-sm text-gray-400">ระบบส่งอีเมลยืนยันไปที่ {formState?.email} แล้ว</p>
              <Link href="/masterclass" className="mt-8 inline-block rounded-full bg-9e-action px-8 py-3 text-sm font-semibold text-white">
                กลับหน้า Masterclass
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-9e-navy dark:text-white">เลือกวิธีชำระเงิน</h2>
              <p className="mt-1 text-sm text-gray-500">ยอดชำระ {formatTHB(pricing.total)} บาท</p>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setChannel('credit_card')}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 transition-colors ${channel === 'credit_card' ? 'border-9e-action bg-9e-action/5' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  <CreditCard size={20} className="text-9e-action" />
                  <span className="font-medium text-9e-navy dark:text-white">บัตรเครดิต / เดบิต</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChannel('promptpay')}
                  className={`mt-3 flex w-full items-center gap-3 rounded-xl border-2 p-4 transition-colors ${channel === 'promptpay' ? 'border-9e-action bg-9e-action/5' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  <QrCode size={20} className="text-9e-action" />
                  <span className="font-medium text-9e-navy dark:text-white">QR PromptPay</span>
                </button>
              </div>

              {/* Credit card */}
              {channel === 'credit_card' && (
                <OmiseCardForm amount={pricing.total} onToken={chargeCard} />
              )}

              {/* PromptPay */}
              {channel === 'promptpay' && (
                <div className="mt-4 text-center">
                  {charge?.qrUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={charge.qrUrl} alt="QR PromptPay" className="mx-auto h-64 w-64" />
                      <p className="mt-3 inline-flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 size={14} className="animate-spin" /> รอการชำระเงิน… กรุณาสแกน QR เพื่อชำระ
                      </p>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={createPromptPay}
                      disabled={submitting}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-9e-action py-3 text-sm font-semibold text-white transition-colors hover:bg-9e-brand disabled:opacity-50"
                    >
                      {submitting ? <><Loader2 size={14} className="animate-spin" /> กำลังสร้าง…</> : 'สร้าง QR Code'}
                    </button>
                  )}
                </div>
              )}

              {payError && (
                <div className="mt-4 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {payError}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared atoms ──────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <section className="mt-5 rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
      <h3 className="mb-3 text-base font-bold text-9e-navy dark:text-white">{title}</h3>
      {children}
    </section>
  );
}

function ReadRow({ label, value }) {
  return (
    <div className="flex flex-col gap-1 py-1 sm:flex-row sm:items-baseline sm:gap-4">
      <div className="text-xs font-medium uppercase tracking-wide text-9e-slate-dp-50 sm:w-40 sm:flex-none">
        {label}
      </div>
      <div className="text-sm text-9e-navy dark:text-white">{value || '—'}</div>
    </div>
  );
}
