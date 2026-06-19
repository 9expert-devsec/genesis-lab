'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import {
  Loader2, CheckCircle2, CreditCard, QrCode, Lock, ChevronRight, ArrowLeft,
} from 'lucide-react';
import { InvoiceFields } from '@/components/registration/InvoiceFields';
import { computePricing, formatTHB } from '@/lib/pricing';
import { CountdownTimer } from '../../../_components/CountdownTimer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'masterclass-register-v1';

const STEPS = ['กรอกข้อมูล', 'ตรวจสอบ + ชำระเงิน', 'สำเร็จ'];

const CONSENT_ITEMS = [
  { key: 'dataChecked',   label: 'ข้าพเจ้าตรวจสอบข้อมูลการสมัครเรียบร้อยแล้ว' },
  { key: 'noRefund',      label: 'ข้าพเจ้ารับทราบว่าไม่สามารถขอคืนเงินได้หลังชำระเงินแล้ว' },
  { key: 'changePolicy',  label: 'ข้าพเจ้ารับทราบเงื่อนไขการเลื่อน/เปลี่ยนแปลงรอบอบรม' },
  { key: 'termsAccepted', label: 'ข้าพเจ้ายินยอมตามเงื่อนไขการอบรมของ 9Expert Training' },
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
  firstName: '', lastName: '', email: '', phone: '',
  coordinator_is_attending: false,
  attendeesCount: 1,
  attendeesListProvided: true,
  attendees: [], // [{firstName, lastName, email, phone}]
  attendee_firstName: '', attendee_lastName: '', attendee_email: '', attendee_phone: '',
  license_choice: null, license_level: '', license_detail: '',
  request_invoice: false,
  notes: '',
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
          {i < STEPS.length - 1 && (
            <span className="mx-2 h-px w-8 bg-gray-200 dark:bg-gray-700" />
          )}
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

// ── Summary / payment atoms (copied from RegisterWizard) ──────────────────────
function SummaryLine({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function MethodRadio({ selected, disabled, onClick, title, subtitle }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-start gap-3 rounded-9e-lg border p-3 text-left transition-all',
        disabled
          ? 'cursor-not-allowed border-[var(--surface-border)] opacity-50'
          : selected
            ? 'border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/15'
            : 'border-[var(--surface-border)] hover:border-9e-brand/40'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-9e-brand' : 'border-[var(--surface-border)]'
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-9e-brand" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function ChannelCard({ selected, onClick, Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-center gap-2 rounded-9e-lg border p-3 text-center transition-all',
        selected
          ? 'border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/15'
          : 'border-[var(--surface-border)] hover:border-9e-brand/40'
      )}
    >
      <Icon className={cn('h-6 w-6', selected ? 'text-9e-brand' : 'text-[var(--text-secondary)]')} />
      <span className="text-xs font-semibold text-[var(--text-primary)]">{label}</span>
    </button>
  );
}

// ── Card input helpers (brand detection / formatting / validation) ──────────────

function detectCardBrand(num) {
  const n = (num || '').replace(/\D/g, '');
  if (/^3[47]/.test(n)) return 'amex';
  if (/^35/.test(n)) return 'jcb';
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(n)) return 'mastercard';
  return 'unknown';
}
function formatCardNumber(value, brand) {
  const max = brand === 'amex' ? 15 : 16;
  const digits = (value || '').replace(/\D/g, '').slice(0, max);
  if (brand === 'amex') {
    return digits.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(' ')
    );
  }
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}
function formatExpiry(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : d.slice(0, 2) + '/' + d.slice(2);
}
function expiryValid(mmYY) {
  const m = (mmYY || '').match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const mm = Number(m[1]);
  const yy = 2000 + Number(m[2]);
  if (mm < 1 || mm > 12) return false;
  return new Date(yy, mm, 0, 23, 59, 59) >= new Date();
}
function cvcMax(brand) { return brand === 'amex' ? 4 : 3; }
function cardNumberValid(num, brand) {
  const n = (num || '').replace(/\D/g, '');
  return brand === 'amex' ? n.length === 15 : n.length >= 16;
}

const CARD_BRAND_LABEL = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  jcb: 'JCB',
  unknown: 'บัตร',
};

function CardFields({ card, setCard }) {
  const brand = detectCardBrand(card.number);
  const numDigits = card.number.replace(/\D/g, '');
  const numError = numDigits.length > 0 && !cardNumberValid(card.number, brand);
  const expError = card.expiry.length > 0 && !expiryValid(card.expiry);
  const cvcError = card.cvc.length > 0 && card.cvc.length !== cvcMax(brand);
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label htmlFor="card-number">หมายเลขบัตร</Label>
          {numDigits.length > 0 && (
            <span className="text-xs font-semibold text-9e-action">
              {CARD_BRAND_LABEL[brand]}
            </span>
          )}
        </div>
        <Input
          id="card-number"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          value={card.number}
          onChange={(e) =>
            setCard((c) => ({
              ...c,
              number: formatCardNumber(e.target.value, detectCardBrand(e.target.value)),
            }))
          }
        />
        {numError && <p className="mt-1 text-xs text-red-500">หมายเลขบัตรไม่ถูกต้อง</p>}
      </div>
      <div>
        <Label htmlFor="card-name">ชื่อบนบัตร</Label>
        <Input id="card-name" autoComplete="cc-name" placeholder="NAME SURNAME"
          value={card.name}
          onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="card-expiry">วันหมดอายุ (MM/YY)</Label>
          <Input
            id="card-expiry"
            inputMode="numeric"
            autoComplete="cc-exp"
            maxLength={5}
            placeholder="MM/YY"
            value={card.expiry}
            onChange={(e) => setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))}
          />
          {expError && <p className="mt-1 text-xs text-red-500">วันหมดอายุไม่ถูกต้อง</p>}
        </div>
        <div>
          <Label htmlFor="card-cvc">CVC</Label>
          <Input
            id="card-cvc"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder={brand === 'amex' ? '1234' : '123'}
            value={card.cvc}
            onChange={(e) =>
              setCard((c) => ({
                ...c,
                cvc: e.target.value.replace(/\D/g, '').slice(0, cvcMax(detectCardBrand(card.number))),
              }))
            }
          />
          {cvcError && <p className="mt-1 text-xs text-red-500">CVC ไม่ถูกต้อง</p>}
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <Lock className="h-3.5 w-3.5" />
        ข้อมูลบัตรถูกเข้ารหัสและส่งตรงไปยัง Omise — เราไม่เก็บเลขบัตรของคุณ
      </p>
    </div>
  );
}

function QrDisplay({ charge, pricing, expired, secondsLeft }) {
  const mmss = `${String(Math.floor((secondsLeft ?? 0) / 60)).padStart(2, '0')}:${String(
    (secondsLeft ?? 0) % 60
  ).padStart(2, '0')}`;
  return (
    <div className="flex flex-col items-center rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-4 text-center">
      <h3 className="mb-1 text-sm font-bold text-[var(--text-primary)]">
        สแกนเพื่อชำระเงิน (QR PromptPay)
      </h3>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        เปิดแอปธนาคารของคุณแล้วสแกน QR ด้านล่าง
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={charge.qrUrl}
        alt="PromptPay QR"
        className="h-56 w-56 rounded-9e-md border border-[var(--surface-border)] bg-white p-2"
      />
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        ยอดชำระ:{' '}
        <span className="text-lg font-bold text-9e-action">
          {formatTHB(charge.amount ?? pricing?.total ?? 0)} บาท
        </span>
      </p>
      {!expired ? (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          QR หมดอายุใน <span className="font-semibold">{mmss}</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-red-500">QR หมดอายุแล้ว กรุณาสร้าง QR ใหม่</p>
      )}
    </div>
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
  const [payError, setPayError] = useState(null);
  const [consents, setConsents] = useState({
    dataChecked: false, noRefund: false, changePolicy: false, termsAccepted: false,
  });

  // Step 2 unified payment state (mirrors UnifiedPaymentStep in RegisterWizard)
  const [method, setMethod] = useState(null);          // 'instant' | 'quote'
  const [channel, setChannel] = useState(null);         // 'promptpay' | 'credit_card'
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvc: '' });
  const [omiseReady, setOmiseReady] = useState(false);
  const [qrCharge, setQrCharge] = useState(null);       // PromptPay QR result, once created
  const [qrExpired, setQrExpired] = useState(false);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(600);
  // Dedupes registration across multiple payment attempts (e.g. switch QR → card).
  const registeredRef = useRef(null);

  const licenseEnabled = Boolean(course.license_options?.enabled);
  const pricing = computePricing(batch.effective_price, formState.attendeesCount ?? 1);

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

  // ── Omise.js script — loaded lazily when the card channel is selected ────────
  useEffect(() => {
    if (channel !== 'credit_card') return;
    const pk = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;
    function configure() {
      try {
        if (window.Omise && pk) { window.Omise.setPublicKey(pk); setOmiseReady(true); }
      } catch {}
    }
    if (typeof window !== 'undefined' && window.Omise) { configure(); return; }
    const existing = document.querySelector('script[data-omise]');
    if (existing) { existing.addEventListener('load', configure); return () => existing.removeEventListener('load', configure); }
    const script = document.createElement('script');
    script.src = 'https://cdn.omise.co/omise.js';
    script.async = true;
    script.setAttribute('data-omise', 'true');
    script.addEventListener('load', configure);
    document.body.appendChild(script);
    return () => script.removeEventListener('load', configure);
  }, [channel]);

  // ── QR countdown — counts down from 600s while the QR is live ────────────────
  useEffect(() => {
    if (!qrCharge?.qrUrl || qrExpired) return;
    const iv = setInterval(() => {
      setQrSecondsLeft((s) => {
        if (s <= 1) { setQrExpired(true); clearInterval(iv); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [qrCharge?.qrUrl, qrExpired]);

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
    if (!qrCharge?.pending || !registrationId) return undefined;
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
            kind: 'paid',
            referenceNumber: qrCharge.referenceNumber,
            amount: qrCharge.amount,
            method: 'promptpay',
          });
          setStep(3);
        }
      } catch {}
      if (elapsed >= MAX) {
        clearInterval(iv);
        setPayError('QR Code หมดอายุ กรุณาลองใหม่');
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [qrCharge, registrationId]);

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
      setSubmitError('กรุณากรอกข้อมูลผู้ประสานงานให้ครบถ้วน (ชื่อ นามสกุล อีเมล เบอร์โทร)');
      return;
    }
    // Validate filled attendees when list is provided
    if (formState.attendeesListProvided ?? true) {
      const count = formState.attendeesCount ?? 1;
      for (let i = 0; i < count; i++) {
        const isCoordSlot = i === 0 && formState.coordinator_is_attending;
        if (isCoordSlot) continue;
        const att = formState.attendees?.[i];
        if (!att?.firstName?.trim() || !att?.lastName?.trim() || !att?.email?.trim() || !att?.phone?.trim()) {
          setSubmitError(`กรุณากรอกข้อมูลผู้เข้าอบรมท่านที่ ${i + 1} ให้ครบถ้วน`);
          return;
        }
      }
    }

    // Invoice validation — only when request_invoice is checked
    if (formState.request_invoice) {
      const inv = getValues('invoice');
      const isThai = (inv?.country ?? 'TH') === 'TH';
      const isCorprate = inv?.type === 'corporate';

      // Name / company required
      if (isCorprate) {
        if (!inv?.companyName?.trim()) {
          setSubmitError('กรุณากรอกชื่อบริษัทสำหรับออกใบเสนอราคา');
          return;
        }
      } else {
        if (!inv?.firstName?.trim() || !inv?.lastName?.trim()) {
          setSubmitError('กรุณากรอกชื่อ-นามสกุลสำหรับออกใบเสนอราคา');
          return;
        }
      }

      // Tax ID required for Thai customers
      if (isThai && !inv?.taxId?.trim()) {
        setSubmitError('กรุณากรอกเลขประจำตัวผู้เสียภาษี');
        return;
      }

      // Thai address required
      if (isThai) {
        const addr = inv?.thaiAddress ?? {};
        if (!addr.addressLine?.trim()) {
          setSubmitError('กรุณากรอกที่อยู่สำหรับออกใบเสนอราคา');
          return;
        }
        if (!addr.postalCode?.trim()) {
          setSubmitError('กรุณากรอกรหัสไปรษณีย์');
          return;
        }
        if (!addr.subDistrict?.trim()) {
          setSubmitError('กรุณาเลือกแขวง/ตำบล (กรอกรหัสไปรษณีย์ก่อน)');
          return;
        }
        if (!addr.district?.trim()) {
          setSubmitError('กรุณาเลือกเขต/อำเภอ');
          return;
        }
        if (!addr.province?.trim()) {
          setSubmitError('กรุณาเลือกจังหวัด');
          return;
        }
      }

      // International address required fields
      if (!isThai) {
        const addr = inv?.internationalAddress ?? {};
        if (!addr.line1?.trim()) {
          setSubmitError('Please enter address line 1');
          return;
        }
        if (!addr.city?.trim()) {
          setSubmitError('Please enter city');
          return;
        }
        if (!addr.country?.trim()) {
          setSubmitError('Please enter country');
          return;
        }
      }
    }

    persist();
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const allConsented = CONSENT_ITEMS.every((c) => consents[c.key]);

  // Card validity gates the card pay button (alongside omiseReady + consent).
  const cardBrand = detectCardBrand(card.number);
  const cardValid =
    cardNumberValid(card.number, cardBrand) &&
    expiryValid(card.expiry) &&
    card.cvc.length === cvcMax(cardBrand) &&
    card.name.trim().length > 0;

  const canStep2Confirm =
    method === 'quote'
      ? allConsented
      : method === 'instant' && channel && allConsented &&
        (channel !== 'credit_card' || (cardValid && omiseReady));

  // Registers the attendee exactly once; returns { registrationId, referenceNumber }
  // or null on failure. Deduped via registeredRef so switching payment channel
  // (QR → card) never creates a second registration.
  async function ensureRegistered() {
    if (registeredRef.current) return registeredRef.current;
    const invoice = getValues('invoice');
    const count = formState.attendeesCount ?? 1;
    const resolvedAttendees = Array.from({ length: count }, (_, i) => {
      if (i === 0 && formState.coordinator_is_attending) {
        return {
          firstName: formState.firstName.trim(),
          lastName: formState.lastName.trim(),
          email: formState.email.trim(),
          phone: formState.phone.trim(),
        };
      }
      const att = formState.attendees?.[i] ?? {};
      return {
        firstName: att.firstName?.trim() ?? '',
        lastName: att.lastName?.trim() ?? '',
        email: att.email?.trim() ?? '',
        phone: att.phone?.trim() ?? '',
      };
    });
    const payload = {
      batchId: String(batch._id),
      coordinator: {
        firstName: formState.firstName.trim(),
        lastName: formState.lastName.trim(),
        email: formState.email.trim(),
        phone: formState.phone.trim(),
        isAttending: formState.coordinator_is_attending ?? false,
      },
      // Keep single attendee field for backward-compat (first in list)
      attendee: resolvedAttendees[0],
      attendees: resolvedAttendees,
      attendeesCount: count,
      license_choice: formState.license_choice ?? null,
      license_level: formState.license_level || null,
      license_detail: formState.license_detail || null,
      request_invoice: formState.request_invoice,
      invoice: formState.request_invoice ? invoice : null,
      notes: formState.notes?.trim() || null,
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
      return null;
    }
    const reg = { registrationId: data.registrationId, referenceNumber: data.referenceNumber };
    registeredRef.current = reg;
    setRegistrationId(data.registrationId);
    return reg;
  }

  // Quote path: register without payment, then advance to the success screen.
  async function handleConfirmAndRegister() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const reg = await ensureRegistered();
      if (!reg) return;
      setResult({ kind: 'quote', referenceNumber: reg.referenceNumber });
      setStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err?.message ?? 'ลงทะเบียนไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  // Charges an already-created registration with an Omise card token.
  async function chargeCard(omiseToken, regId) {
    setPayError(null);
    try {
      const res = await fetch('/api/masterclass/register/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: regId, paymentMethod: 'credit_card', omiseToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPayError(data?.message || 'การชำระเงินไม่สำเร็จ');
        return;
      }
      setResult({ kind: 'paid', referenceNumber: data.referenceNumber, amount: data.amount, method: 'credit_card' });
      setStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setPayError(err?.message ?? 'การชำระเงินไม่สำเร็จ');
    }
  }

  // Inline card flow: register, tokenize the card via Omise.js, then charge.
  async function chargeCardDirect() {
    setPayError(null);
    setSubmitting(true);
    try {
      const reg = await ensureRegistered();
      if (!reg) return;
      const tokenId = await new Promise((resolve, reject) => {
        window.Omise.createToken('card', {
          name: card.name,
          number: card.number.replace(/\s/g, ''),
          expiration_month: parseInt(card.expiry.split('/')[0]),
          expiration_year: parseInt('20' + card.expiry.split('/')[1]),
          security_code: card.cvc,
        }, (statusCode, response) => {
          if (response.object === 'error') reject(new Error(response.message));
          else resolve(response.id);
        });
      });
      await chargeCard(tokenId, reg.registrationId);
    } catch (err) {
      setPayError(err?.message ?? 'สร้าง token ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  async function createPromptPay() {
    setPayError(null);
    setSubmitting(true);
    try {
      const reg = await ensureRegistered();
      if (!reg) return;
      const res = await fetch('/api/masterclass/register/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: reg.registrationId, paymentMethod: 'promptpay' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPayError(data?.message || 'สร้าง QR ไม่สำเร็จ');
        return;
      }
      setQrExpired(false);
      setQrSecondsLeft(600);
      setQrCharge(data);
    } catch (err) {
      setPayError(err?.message ?? 'สร้าง QR ไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStep2Confirm() {
    setSubmitError(null);
    setPayError(null);
    if (method === 'quote') {
      await handleConfirmAndRegister();
      return;
    }
    if (method === 'instant' && channel === 'promptpay') {
      await createPromptPay();
      return;
    }
    if (method === 'instant' && channel === 'credit_card') {
      await chargeCardDirect();
      return;
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 lg:px-6">
      <Stepper step={result ? 3 : step} />

      {/* ── STEP 1 ── */}
      {step === 1 && !result && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
          <div>
            <h2 className="text-lg font-bold text-9e-navy dark:text-white">ข้อมูลผู้ประสานงาน</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              ผู้ติดต่อที่ 9Expert จะใช้ในการสื่อสารเรื่องการอบรมและใบแจ้งหนี้
            </p>

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
              <div className="mt-3 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-9e-navy dark:text-white">
                  <input
                    type="checkbox"
                    checked={formState.coordinator_is_attending ?? false}
                    onChange={(e) => setField('coordinator_is_attending', e.target.checked)}
                    className="mt-0.5"
                  />
                  ผู้ประสานงานเป็นผู้เข้าอบรม
                </label>
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

            {/* ── Attendee section ── */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-9e-navy dark:text-white">ข้อมูลผู้เข้าอบรม</h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 mb-3">
                ระบุจำนวนและข้อมูลของผู้เข้าอบรม หากยังไม่ทราบรายชื่อสามารถข้ามได้
              </p>

              {/* Count + skip row */}
              <div className="flex items-end gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">จำนวนผู้สมัคร</label>
                  <select
                    value={formState.attendeesCount ?? 1}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setFormState((p) => ({
                        ...p,
                        attendeesCount: n,
                        coordinator_is_attending: p.coordinator_is_attending,
                        attendees: Array.from({ length: n }, (_, i) => p.attendees?.[i] ?? { firstName: '', lastName: '', email: '', phone: '' }),
                      }));
                    }}
                    className={`${inputCls} w-28`}
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-9e-navy dark:text-white">
                  <input
                    type="checkbox"
                    checked={!(formState.attendeesListProvided ?? true)}
                    onChange={(e) => setField('attendeesListProvided', !e.target.checked)}
                    className="mt-0.5"
                  />
                  ยังไม่ประสงค์แจ้งรายชื่อผู้เข้าอบรม
                </label>
              </div>

              {/* If list skipped */}
              {!(formState.attendeesListProvided ?? true) && (
                <p className="mt-3 rounded-9e-md border border-dashed border-[var(--surface-border)] p-3 text-sm text-gray-500 dark:text-gray-400">
                  จะแจ้งรายชื่อผู้เข้าอบรมภายหลัง — ทีมงานจะติดต่อเพื่อเก็บข้อมูลเพิ่มเติม
                </p>
              )}

              {/* If list provided — render per-attendee forms */}
              {(formState.attendeesListProvided ?? true) && (
                <div className="mt-3 space-y-3">
                  {Array.from({ length: formState.attendeesCount ?? 1 }, (_, i) => {
                    const isCoordinatorSlot = i === 0 && formState.coordinator_is_attending;
                    const displayIndex = i + 1;
                    const att = formState.attendees?.[i] ?? { firstName: '', lastName: '', email: '', phone: '' };

                    if (isCoordinatorSlot) {
                      return (
                        <div key={i} className="rounded-9e-md border border-9e-brand/30 bg-9e-brand/5 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-9e-action mb-1">
                            ผู้เข้าอบรมท่านที่ 1 (ผู้ประสานงาน)
                          </p>
                          <p className="text-sm font-semibold text-9e-navy dark:text-white">
                            {`${formState.firstName} ${formState.lastName}`.trim() || '—'}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {formState.email || '—'} · {formState.phone || '—'}
                          </p>
                          <p className="mt-2 text-xs text-gray-400">
                            ข้อมูลนี้อ้างอิงจากผู้ประสานงานด้านบน ไม่สามารถแก้ไขได้ที่นี่
                          </p>
                        </div>
                      );
                    }

                    const updateAttendee = (field, value) => {
                      setFormState((p) => {
                        const next = [...(p.attendees ?? [])];
                        next[i] = { ...next[i], [field]: value };
                        return { ...p, attendees: next };
                      });
                    };

                    return (
                      <div key={i} className="rounded-9e-md border border-[var(--surface-border)]">
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-sm font-semibold text-9e-navy dark:text-white">
                            ผู้เข้าอบรมท่านที่ {displayIndex}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 border-t border-[var(--surface-border)] p-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">ชื่อ *</label>
                            <input type="text" value={att.firstName} onChange={(e) => updateAttendee('firstName', e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">นามสกุล *</label>
                            <input type="text" value={att.lastName} onChange={(e) => updateAttendee('lastName', e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">อีเมล *</label>
                            <input type="email" value={att.email} onChange={(e) => updateAttendee('email', e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">เบอร์โทร *</label>
                            <input type="tel" value={att.phone} onChange={(e) => updateAttendee('phone', e.target.value)} className={inputCls} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="mt-6">
              <label className="mb-1 block text-sm font-semibold text-9e-navy dark:text-white">
                หมายเหตุเพิ่มเติม
              </label>
              <textarea
                value={formState.notes ?? ''}
                onChange={(e) => setField('notes', e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="เช่น อาหาร/เพลาอาหาร คำถามเกี่ยวกับหลักสูตร ฯลฯ (ไม่เกิน 500 ตัวอักษร)"
                className={`${inputCls} resize-none`}
              />
            </div>

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

          <div className="lg:sticky lg:top-24 lg:self-start">
            <BatchSummary course={course} batch={batch} />
          </div>
        </div>
      )}

      {/* ── STEP 2 — Unified Review + Payment ── */}
      {step === 2 && !result && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(340px,400px)] lg:items-start">
          {/* LEFT — read-only preview */}
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-9e-navy dark:text-white">ตรวจสอบข้อมูล</h2>

            <Section title="ข้อมูลผู้ประสานงาน">
              <ReadRow label="ชื่อ-นามสกุล" value={`${formState.firstName} ${formState.lastName}`.trim()} />
              <ReadRow label="อีเมล" value={formState.email} />
              <ReadRow label="เบอร์โทร" value={formState.phone} />
              <ReadRow label="ผู้ประสานงานเข้าอบรม" value={formState.coordinator_is_attending ? 'ใช่' : 'ไม่'} />
            </Section>

            <Section title={`ผู้เข้าอบรม (${formState.attendeesCount ?? 1} ท่าน)`}>
              {(formState.attendeesListProvided ?? true) ? (
                Array.from({ length: formState.attendeesCount ?? 1 }, (_, i) => {
                  const att = (i === 0 && formState.coordinator_is_attending)
                    ? { firstName: formState.firstName, lastName: formState.lastName, email: formState.email, phone: formState.phone }
                    : (formState.attendees?.[i] ?? {});
                  return (
                    <div key={i} className="mb-2 pb-2 border-b border-[var(--surface-border)] last:border-0 last:mb-0 last:pb-0">
                      <ReadRow label={`ท่านที่ ${i + 1}`} value={`${att.firstName ?? ''} ${att.lastName ?? ''}`.trim()} />
                      <ReadRow label="อีเมล" value={att.email ?? ''} />
                      <ReadRow label="เบอร์โทร" value={att.phone ?? ''} />
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500">จะแจ้งรายชื่อผู้เข้าอบรมภายหลัง — ทีมขายจะติดต่อเพื่อเก็บข้อมูลเพิ่มเติม</p>
              )}
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

            {formState.request_invoice && (
              <Section title="ใบเสนอราคา / ใบกำกับภาษี">
                <ReadRow label="ประเภท" value={getValues('invoice.type') === 'individual' ? 'บุคคลทั่วไป' : 'นิติบุคคล'} />
              </Section>
            )}

            {formState.notes && (
              <Section title="หมายเหตุ">
                <p className="text-sm text-9e-navy dark:text-white">{formState.notes}</p>
              </Section>
            )}
          </div>

          {/* RIGHT — sticky payment card */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="space-y-5 rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
              {/* สรุปยอด */}
              <div>
                <h3 className="mb-3 text-base font-bold text-9e-navy dark:text-white">สรุปยอด</h3>
                <div className="space-y-2 text-sm">
                  <SummaryLine label={`ราคาต่อที่นั่ง × ${formState.attendeesCount ?? 1}`} value={`${formatTHB(pricing.pricePerSeat)} บาท`} />
                  <SummaryLine label="ส่วนลด" value={`${formatTHB(0)} บาท`} />
                  <SummaryLine label="VAT 7%" value={`${formatTHB(pricing.vatAmount)} บาท`} />
                  <div className="mt-2 flex items-baseline justify-between border-t border-[var(--surface-border)] pt-2">
                    <span className="font-semibold text-9e-navy dark:text-white">ยอดรวมสุทธิ</span>
                    <span className="text-xl font-bold text-9e-action">{formatTHB(pricing.total)} บาท</span>
                  </div>
                </div>
              </div>

              {/* เลือกวิธีดำเนินการ */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">เลือกวิธีดำเนินการ</h3>
                <div className="space-y-2">
                  <MethodRadio
                    selected={method === 'instant'}
                    onClick={() => setMethod('instant')}
                    title="ชำระทันที"
                    subtitle="ชำระผ่าน PromptPay QR หรือบัตรเครดิต/เดบิต"
                  />
                  <MethodRadio
                    selected={method === 'quote'}
                    onClick={() => { setMethod('quote'); setChannel(null); }}
                    title="ขอใบเสนอราคา"
                    subtitle="เหมาะสำหรับบริษัทที่ต้องใช้เอกสารก่อนชำระเงิน"
                  />
                </div>
              </div>

              {/* เลือกช่องทางชำระเงิน */}
              {method === 'instant' && !qrCharge?.qrUrl && (
                <>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">เลือกช่องทางชำระเงิน</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <ChannelCard
                        selected={channel === 'promptpay'}
                        onClick={() => setChannel('promptpay')}
                        Icon={QrCode}
                        label="PromptPay QR"
                      />
                      <ChannelCard
                        selected={channel === 'credit_card'}
                        onClick={() => setChannel('credit_card')}
                        Icon={CreditCard}
                        label="บัตรเครดิต/เดบิต"
                      />
                    </div>
                  </div>

                  {channel === 'credit_card' && <CardFields card={card} setCard={setCard} />}
                  {channel === 'promptpay' && (
                    <p className="rounded-9e-md bg-9e-brand/5 p-3 text-xs text-gray-500 dark:text-gray-400">
                      กด &quot;ยืนยันการสมัครและชำระด้วย PromptPay&quot; เพื่อสร้าง QR สำหรับสแกนชำระเงิน
                    </p>
                  )}

                  {/* เงื่อนไขการชำระเงิน */}
                  {channel && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">เงื่อนไขการชำระเงิน</h3>
                      <div className="space-y-3">
                        {CONSENT_ITEMS.map((c) => (
                          <label key={c.key} className="flex cursor-pointer items-start gap-3 text-sm text-9e-navy dark:text-white">
                            <input
                              type="checkbox"
                              checked={consents[c.key]}
                              onChange={(e) => setConsents((p) => ({ ...p, [c.key]: e.target.checked }))}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-9e-brand"
                            />
                            <span className="leading-5">{c.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* QR displayed after creation */}
              {qrCharge?.qrUrl && (
                <QrDisplay
                  charge={qrCharge}
                  pricing={pricing}
                  expired={qrExpired}
                  secondsLeft={qrSecondsLeft}
                />
              )}

              {/* Quote path — consent only */}
              {method === 'quote' && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">เงื่อนไข</h3>
                  <div className="space-y-3">
                    {CONSENT_ITEMS.map((c) => (
                      <label key={c.key} className="flex cursor-pointer items-start gap-3 text-sm text-9e-navy dark:text-white">
                        <input
                          type="checkbox"
                          checked={consents[c.key]}
                          onChange={(e) => setConsents((p) => ({ ...p, [c.key]: e.target.checked }))}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-9e-brand"
                        />
                        <span className="leading-5">{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {(submitError || payError) && (
                <div className="rounded-9e-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
                  {submitError || payError}
                </div>
              )}

              {/* Confirm button */}
              {!qrCharge?.qrUrl && (
                <button
                  type="button"
                  onClick={handleStep2Confirm}
                  disabled={!canStep2Confirm || submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-9e-lime py-3 text-sm font-bold text-9e-navy transition-colors hover:bg-9e-lime/80 disabled:opacity-50"
                >
                  {submitting ? (
                    <><Loader2 size={16} className="animate-spin" /> กำลังดำเนินการ…</>
                  ) : (
                    <>
                      {method === 'instant' && <Lock size={14} />}
                      {method === 'quote' ? 'ยืนยันการขอใบเสนอราคา' :
                       channel === 'credit_card' ? 'ยืนยันการสมัครและชำระด้วยบัตร' :
                       channel === 'promptpay' ? 'ยืนยันการสมัครและชำระด้วย PromptPay' :
                       'เลือกวิธีดำเนินการ'}
                    </>
                  )}
                </button>
              )}

              {qrCharge?.qrUrl && !qrExpired && (
                <p className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 size={14} className="animate-spin" />
                  สถานะ: รอตรวจสอบผลการชำระเงิน
                </p>
              )}

              {qrCharge?.qrUrl && qrExpired && (
                <button
                  type="button"
                  onClick={() => { setQrCharge(null); setQrExpired(false); setQrSecondsLeft(600); }}
                  className="w-full rounded-full border border-[var(--surface-border)] py-3 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white"
                >
                  สร้าง QR ใหม่
                </button>
              )}

              <button
                type="button"
                onClick={() => { setStep(1); setMethod(null); setChannel(null); setQrCharge(null); registeredRef.current = null; window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-gray-500 hover:bg-9e-ice dark:hover:bg-white/5"
              >
                <ArrowLeft size={14} /> ย้อนกลับไปแก้ไขข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3 — Success ── */}
      {step === 3 && (
        <div className="mx-auto max-w-xl py-12 text-center">
          <CheckCircle2 size={56} className="mx-auto text-green-500" />
          <h2 className="mt-4 text-2xl font-bold text-9e-navy dark:text-white">
            {result?.kind === 'quote' ? 'ส่งคำขอใบเสนอราคาแล้ว!' : 'ชำระเงินสำเร็จ!'}
          </h2>
          {result?.referenceNumber && (
            <p className="mt-2 text-gray-500">รหัสอ้างอิง: <strong>{result.referenceNumber}</strong></p>
          )}
          {result?.amount && (
            <p className="text-gray-500">ยอดชำระ: <strong>{formatTHB(result.amount)} บาท</strong></p>
          )}
          <p className="mt-4 text-sm text-gray-400">ระบบส่งอีเมลยืนยันไปที่ {formState?.email} แล้ว</p>
          <Link href="/masterclass" className="mt-8 inline-block rounded-full bg-9e-action px-8 py-3 text-sm font-semibold text-white">
            กลับหน้า Masterclass
          </Link>
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
