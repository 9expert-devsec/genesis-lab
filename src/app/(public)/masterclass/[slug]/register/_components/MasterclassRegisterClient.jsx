"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import {
  Loader2,
  CheckCircle2,
  CreditCard,
  QrCode,
  Lock,
  ChevronRight,
  ArrowLeft,
  ChevronDown,
  Download,
  RefreshCw,
  ChevronUp,
  X,
} from "lucide-react";
import { InvoiceFields } from "@/components/registration/InvoiceFields";
import { computePricing, formatTHB } from "@/lib/pricing";
import { CountdownTimer } from "../../../_components/CountdownTimer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "masterclass-register-v1";

const STEPS = ["กรอกข้อมูล", "ตรวจสอบและดำเนินการ", "สำเร็จ"];

const EMPTY_THAI_ADDRESS = {
  addressLine: "",
  subDistrict: "",
  district: "",
  province: "",
  postalCode: "",
};

const EMPTY_INVOICE = {
  type: "individual",
  country: "TH",
  firstName: "",
  lastName: "",
  companyName: "",
  branch: "",
  taxId: "",
  thaiAddress: EMPTY_THAI_ADDRESS,
  internationalAddress: null,
};

const inputCls =
  "w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm dark:bg-[#0D1B2A] dark:text-white focus:outline-none focus:ring-1 focus:ring-9e-action";

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  coordinator_is_attending: false,
  attendeesCount: 1,
  attendeesListProvided: true,
  attendees: [], // [{firstName, lastName, email, phone}]
  attendee_firstName: "",
  attendee_lastName: "",
  attendee_email: "",
  attendee_phone: "",
  license_choice: null,
  license_level: "",
  license_detail: "",
  license_scope: "all", // 'all' | 'per_attendee'
  license_per_attendee: [], // Array<{ choice, level, detail }> indexed by attendee slot
  request_invoice: false,
  notes: "",
};

const LICENSE_LEVELS = ["Personal", "Business", "Enterprise", "Academic"];

// ── Progress indicator ────────────────────────────────────────────────────────
function Stepper({ step }) {
  return (
    <div className="relative mb-8 grid w-full grid-cols-3 items-start">
      {STEPS.map((label, i) => (
        <div
          key={i}
          className={`relative flex flex-col items-center gap-2 text-center text-sm font-medium ${
            step > i + 1
              ? "text-green-600"
              : step === i + 1
                ? "text-9e-action"
                : "text-gray-400"
          }`}
        >
          {i < STEPS.length - 1 && (
            <span className="absolute left-[calc(50%+20px)] top-3.5 h-px w-[calc(100%-40px)] bg-gray-200 dark:bg-gray-700" />
          )}

          <span
            className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              step > i + 1
                ? "bg-green-100 text-green-600"
                : step === i + 1
                  ? "bg-9e-action text-white"
                  : "bg-gray-100 text-gray-400"
            }`}
          >
            {step > i + 1 ? <CheckCircle2 size={14} /> : i + 1}
          </span>

          <span className="max-w-[100px] leading-snug md:max-w-none md:whitespace-nowrap">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Batch summary card ────────────────────────────────────────────────────────
function BatchSummary({ course, batch }) {
  return (
    <aside className="rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
      <h3 className="text-base font-bold text-9e-navy dark:text-white">
        {course.title_th}
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        {batch.batch_label || `รุ่นที่ ${batch.batch_no}`}
      </p>
      {batch.dates?.[0]?.day_label && (
        <p className="mt-1 text-sm text-9e-navy dark:text-white">
          {batch.dates[0].day_label}
        </p>
      )}
      {batch.venue_name && (
        <p className="mt-1 text-xs text-gray-400">{batch.venue_name}</p>
      )}

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-9e-action">
          {batch.effective_price?.toLocaleString("th-TH")} บาท
        </span>
        {batch.is_early_bird && (
          <span className="text-sm text-gray-400 line-through">
            {batch.original_price?.toLocaleString("th-TH")} บาท
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

// Step 2 mobile-only bottom bar: collapsed total + CTA, with an expandable summary sheet.
// Extracted as a component (not an inline IIFE) so its useState hook is called unconditionally.
function Step2MobileBar({
  pricing,
  canStep2Confirm,
  submitting,
  method,
  onConfirm,
  onBack,
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  return (
    <>
      {/* Expandable summary sheet */}
      {summaryOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end lg:hidden"
          onClick={() => setSummaryOpen(false)}
        >
          <div
            className="w-full rounded-t-2xl border-t border-[var(--surface-border)] bg-white p-5 shadow-2xl dark:bg-[#0D1B2A]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-9e-navy dark:text-white">
                สรุปยอด
              </h3>
              <button
                type="button"
                onClick={() => setSummaryOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <SummaryLine
                label={`ราคาต่อที่นั่ง × ${pricing.seats}`}
                value={`${formatTHB(pricing.subtotal)} บาท`}
              />
              <SummaryLine label="ส่วนลด" value={`${formatTHB(0)} บาท`} />
              <SummaryLine
                label="VAT 7%"
                value={`${formatTHB(pricing.vatAmount)} บาท`}
              />
              <div className="mt-2 flex items-baseline justify-between border-t border-[var(--surface-border)] pt-2">
                <span className="font-semibold text-9e-navy dark:text-white">
                  ยอดรวมสุทธิ
                </span>
                <span className="text-xl font-bold text-9e-action">
                  {formatTHB(pricing.total)} บาท
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--surface-border)] bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] dark:bg-[#0D1B2A] lg:hidden">
        <div className="flex items-center gap-2">
          {/* Price + expand toggle */}
          <button
            type="button"
            onClick={() => setSummaryOpen((v) => !v)}
            className="flex flex-1 flex-col items-start"
          >
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ยอดรวมสุทธิ
            </span>
            <span className="flex items-center gap-1 text-base font-bold text-9e-action">
              {formatTHB(pricing.total)} บาท
              <ChevronUp
                size={14}
                className={cn(
                  "transition-transform",
                  summaryOpen && "rotate-180",
                )}
              />
            </span>
          </button>
          {/* Back button */}
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="flex shrink-0 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold border border-[var(--surface-border)] text-gray-500 hover:bg-9e-ice dark:hover:bg-white/5"
          >
            ย้อนกลับ
          </button>
          {/* CTA — quote path only */}
          {method === "quote" && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canStep2Confirm || submitting}
              className={cn(
                "rounded-full px-5 py-3 text-sm font-semibold transition-colors",
                canStep2Confirm && !submitting
                  ? "bg-9e-lime text-9e-navy hover:bg-9e-lime/80"
                  : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500",
              )}
            >
              {submitting ? "..." : "ขอใบเสนอราคา"}
            </button>
          )}
        </div>
      </div>
    </>
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
        "flex w-full items-start gap-3 rounded-9e-lg border p-3 text-left transition-all",
        disabled
          ? "cursor-not-allowed border-[var(--surface-border)] opacity-50"
          : selected
            ? "border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/15"
            : "border-[var(--surface-border)] hover:border-9e-brand/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-9e-brand" : "border-[var(--surface-border)]",
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-9e-brand" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </span>
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
        "flex flex-col items-center gap-2 rounded-9e-lg border p-3 text-center transition-all",
        selected
          ? "border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/15"
          : "border-[var(--surface-border)] hover:border-9e-brand/40",
      )}
    >
      <Icon
        className={cn(
          "h-6 w-6",
          selected ? "text-9e-brand" : "text-[var(--text-secondary)]",
        )}
      />
      <span className="text-xs font-semibold text-[var(--text-primary)]">
        {label}
      </span>
    </button>
  );
}

// ── Card input helpers (brand detection / formatting / validation) ──────────────

function detectCardBrand(num) {
  const n = (num || "").replace(/\D/g, "");
  if (/^3[47]/.test(n)) return "amex";
  if (/^35/.test(n)) return "jcb";
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(n))
    return "mastercard";
  return "unknown";
}
function formatCardNumber(value, brand) {
  const max = brand === "amex" ? 15 : 16;
  const digits = (value || "").replace(/\D/g, "").slice(0, max);
  if (brand === "amex") {
    return digits.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(" "),
    );
  }
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}
function formatExpiry(value) {
  const d = (value || "").replace(/\D/g, "").slice(0, 4);
  return d.length <= 2 ? d : d.slice(0, 2) + "/" + d.slice(2);
}
function expiryValid(mmYY) {
  const m = (mmYY || "").match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const mm = Number(m[1]);
  const yy = 2000 + Number(m[2]);
  if (mm < 1 || mm > 12) return false;
  return new Date(yy, mm, 0, 23, 59, 59) >= new Date();
}
function cvcMax(brand) {
  return brand === "amex" ? 4 : 3;
}
function cardNumberValid(num, brand) {
  const n = (num || "").replace(/\D/g, "");
  return brand === "amex" ? n.length === 15 : n.length >= 16;
}

const CARD_BRAND_LABEL = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  jcb: "JCB",
  unknown: "บัตร",
};

function CardFields({ card, setCard }) {
  const brand = detectCardBrand(card.number);
  const numDigits = card.number.replace(/\D/g, "");
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
              number: formatCardNumber(
                e.target.value,
                detectCardBrand(e.target.value),
              ),
            }))
          }
        />
        {numError && (
          <p className="mt-1 text-xs text-red-500">หมายเลขบัตรไม่ถูกต้อง</p>
        )}
      </div>
      <div>
        <Label htmlFor="card-name">ชื่อบนบัตร</Label>
        <Input
          id="card-name"
          autoComplete="cc-name"
          placeholder="NAME SURNAME"
          value={card.name}
          onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))}
        />
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
            onChange={(e) =>
              setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))
            }
          />
          {expError && (
            <p className="mt-1 text-xs text-red-500">วันหมดอายุไม่ถูกต้อง</p>
          )}
        </div>
        <div>
          <Label htmlFor="card-cvc">CVC</Label>
          <Input
            id="card-cvc"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder={brand === "amex" ? "1234" : "123"}
            value={card.cvc}
            onChange={(e) =>
              setCard((c) => ({
                ...c,
                cvc: e.target.value
                  .replace(/\D/g, "")
                  .slice(0, cvcMax(detectCardBrand(card.number))),
              }))
            }
          />
          {cvcError && (
            <p className="mt-1 text-xs text-red-500">CVC ไม่ถูกต้อง</p>
          )}
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <Lock className="h-3.5 w-3.5" />
        ข้อมูลบัตรถูกเข้ารหัสและส่งตรงไปยัง Omise — เราไม่เก็บเลขบัตรของคุณ
      </p>
    </div>
  );
}

// ── Expanded PromptPay panel (left column, after charge created) ──────────────
function QrPanelFull({ charge, pricing, expired, secondsLeft, onRegenerate }) {
  const mmss = `${String(Math.floor((secondsLeft ?? 0) / 60)).padStart(2, "0")}:${String(
    (secondsLeft ?? 0) % 60,
  ).padStart(2, "0")}`;
  return (
    <section className="mt-5 rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
      <h3 className="text-base font-bold text-9e-navy dark:text-white">
        ชำระเงินผ่าน PromptPay QR
      </h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        สแกน QR ผ่าน Mobile Banking
        แล้วระบบจะตรวจสอบสถานะการชำระเงินให้อัตโนมัติ
      </p>

      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* left: QR + amount + timer */}
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={charge.qrUrl}
            alt="PromptPay QR"
            className="h-56 w-56 rounded-9e-md border border-[var(--surface-border)] bg-white p-2"
          />
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            ยอดชำระ:{" "}
            <span className="text-lg font-bold text-9e-action">
              {formatTHB(charge.amount ?? pricing?.total ?? 0)} บาท
            </span>
          </p>
          {!expired ? (
            <span className="mt-2 inline-flex items-center rounded-full border border-amber-400 px-3 py-0.5 text-xs font-semibold text-amber-600">
              ชำระภายใน {mmss}
            </span>
          ) : (
            <span className="mt-2 text-sm text-red-500">
              QR หมดอายุแล้ว กรุณาสร้าง QR ใหม่
            </span>
          )}
        </div>

        {/* right: reference, status, steps */}
        <div className="space-y-3">
          {charge.referenceNumber && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-9e-slate-dp-50">
                เลขที่อ้างอิง
              </p>
              <p className="text-sm font-semibold text-9e-navy dark:text-white">
                {charge.referenceNumber}
              </p>
            </div>
          )}
          <div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-semibold",
                expired
                  ? "bg-red-100 text-red-600"
                  : "bg-amber-100 text-amber-700",
              )}
            >
              {expired ? "หมดอายุ" : "รอการชำระเงิน"}
            </span>
          </div>
          <ol className="space-y-1 text-sm text-[var(--text-secondary)]">
            <li>1. เปิดแอปธนาคารบนมือถือ</li>
            <li>2. สแกน QR Code นี้</li>
            <li>3. ตรวจสอบยอดและยืนยันการชำระเงิน</li>
          </ol>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={charge.qrUrl}
          download="promptpay-qr.png"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--surface-border)] px-4 py-2 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white"
        >
          <Download size={14} /> ดาวน์โหลด QR
        </a>
        {expired && (
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--surface-border)] px-4 py-2 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white"
          >
            <RefreshCw size={14} /> สร้าง QR ใหม่
          </button>
        )}
      </div>
    </section>
  );
}

// ── Expanded card panel (left column, after confirm) ──────────────────────────
function CardPanelFull({
  card,
  setCard,
  pricing,
  onCharge,
  onChangeMethod,
  submitting,
  processing,
  payError,
  cardValid,
  omiseReady,
}) {
  return (
    <section className="mt-5 rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
      <h3 className="text-base font-bold text-9e-navy dark:text-white">
        ชำระเงินผ่านบัตรเครดิต / เดบิต
      </h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        กรอกข้อมูลบัตรอย่างปลอดภัยผ่าน Card Secure Fields
      </p>

      <div className="mt-3 flex items-start gap-2 rounded-9e-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        กรอกข้อมูลผ่าน Card Secure Fields จาก Payment Gateway
        โดยไม่เก็บเลขบัตรเต็มในระบบ
      </div>

      <div className="mt-4">
        <CardFields card={card} setCard={setCard} />
      </div>

      {payError && (
        <div className="mt-3 rounded-9e-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
          {payError}
        </div>
      )}

      <button
        type="button"
        onClick={onCharge}
        disabled={submitting || processing || !cardValid || !omiseReady}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-9e-lime py-3 text-sm font-bold text-9e-navy transition-colors hover:bg-9e-lime/80 disabled:opacity-50"
      >
        {submitting || processing ? (
          <>
            <Loader2 size={16} className="animate-spin" />{" "}
            {processing ? "กำลังตรวจสอบการชำระเงิน…" : "กำลังดำเนินการ…"}
          </>
        ) : (
          <>
            <Lock size={14} /> ชำระเงิน {formatTHB(pricing.total)} บาท
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onChangeMethod}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-gray-500 hover:bg-9e-ice dark:hover:bg-white/5"
      >
        เปลี่ยนวิธีชำระเงิน
      </button>
    </section>
  );
}

// ── License info popup ────────────────────────────────────────────────────────
// Shown when a choice has info_popup enabled. User must tick the acknowledgement
// checkbox before they can confirm; closing without confirming leaves the choice
// unselected.
function LicenseInfoPopup({ choice, onConfirm, onCancel }) {
  const [acked, setAcked] = useState(false);

  useEffect(() => {
    setAcked(false);
  }, [choice.value]);

  const displayLabel = choice.label_th || choice.value;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-9e-xl bg-white shadow-2xl dark:bg-[#132638]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-none border-b border-[var(--surface-border)] px-6 pb-4 pt-6">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-semibold text-9e-navy dark:text-white">
              {choice.info_popup?.popup_title ||
                choice.label_th ||
                displayLabel}
            </h3>
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 text-[var(--text-secondary)] hover:text-9e-navy dark:hover:text-white"
              aria-label="ปิด"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: choice.info_popup.html_content }}
          />
        </div>

        {/* Footer */}
        <div className="flex-none space-y-3 border-t border-[var(--surface-border)] px-6 py-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acked}
              onChange={(e) => setAcked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-9e-brand accent-9e-brand"
            />
            <span className="text-sm text-[var(--text-primary)]">
              {choice.info_popup.checkbox_label}
            </span>
          </label>
          <button
            type="button"
            disabled={!acked}
            onClick={onConfirm}
            className={cn(
              "w-full rounded-9e-md py-2.5 text-sm font-semibold transition-all",
              acked
                ? "bg-9e-brand text-white hover:bg-9e-action"
                : "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-white/10 dark:text-white/30",
            )}
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}

// ── License choice list (shared by 'all' and 'per_attendee' scopes) ───────────
// value: { choice, level, detail }; onChange receives a partial patch.
// ── Global license acknowledgement (per_attendee mode) ────────────────────────
// A single checkbox card that, once acknowledged, bypasses the per-choice
// info_popup on every individual attendee's LicenseChoices.
function GlobalLicenseAckBlock({ config, acked, onAck }) {
  const [showPopup, setShowPopup] = useState(false);
  return (
    <div className="mb-4">
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-9e-lg border-2 border-dashed p-4 select-none transition-colors",
          acked
            ? "border-9e-brand/40 bg-9e-brand/5"
            : "border-9e-brand/30 bg-white dark:bg-transparent hover:border-9e-brand/50",
        )}
      >
        <input
          type="checkbox"
          checked={acked}
          onChange={(e) => {
            if (e.target.checked && config.html_content) {
              setShowPopup(true);
            } else {
              onAck(e.target.checked);
            }
          }}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-9e-brand"
        />
        <span className="text-sm font-medium text-9e-navy dark:text-white">
          {config.label_th ||
            "รับทราบเงื่อนไขการใช้ License สำหรับผู้เข้าอบรมทุกท่าน"}
        </span>
      </label>
      {showPopup && (
        <LicenseInfoPopup
          key="global-ack-popup"
          choice={{
            label_th: config.label_th,
            info_popup: {
              popup_title: config.popup_title || config.label_th,
              html_content: config.html_content,
              checkbox_label: config.checkbox_label || "รับทราบเงื่อนไขทั้งหมด",
            },
          }}
          onConfirm={() => {
            onAck(true);
            setShowPopup(false);
          }}
          onCancel={() => setShowPopup(false)}
        />
      )}
    </div>
  );
}

function LicenseChoices({ choices, value, onChange, globalAcked = false }) {
  const chosen = choices.find((c) => c.value === value.choice);
  const [pendingChoice, setPendingChoice] = useState(null); // choice object awaiting confirmation
  const [popupKey, setPopupKey] = useState(0); // increment to reset acked state on reopen
  return (
    <div>
      {/* Choice cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {choices.map((choice) => {
          const isSelected = value.choice === choice.value;
          const displayLabel =
            choice.label_th ||
            (choice.value === "own"
              ? "ใช้ License ของผู้เข้าอบรมเอง"
              : choice.value === "9expert"
                ? "ให้ 9Expert จัดเตรียม License ให้"
                : choice.value);
          return (
            <button
              key={choice.value}
              type="button"
              onClick={() => {
                if (
                  !globalAcked &&
                  choice.info_popup?.enabled &&
                  choice.info_popup?.html_content
                ) {
                  setPendingChoice(choice);
                  setPopupKey((k) => k + 1);
                } else {
                  onChange({ choice: choice.value, level: "", detail: "" });
                }
              }}
              className={cn(
                "flex items-start gap-3 rounded-9e-lg border p-4 text-left transition-all",
                isSelected
                  ? "border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/15"
                  : "border-[var(--surface-border)] hover:border-9e-brand/40",
              )}
            >
              {/* Radio dot */}
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                  isSelected
                    ? "border-9e-brand"
                    : "border-[var(--surface-border)]",
                )}
              >
                {isSelected && (
                  <span className="h-2 w-2 rounded-full bg-9e-brand" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">
                  {displayLabel}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {pendingChoice && (
        <LicenseInfoPopup
          key={popupKey}
          choice={pendingChoice}
          onConfirm={() => {
            onChange({ choice: pendingChoice.value, level: "", detail: "" });
            setPendingChoice(null);
          }}
          onCancel={() => {
            setPendingChoice(null);
          }}
        />
      )}

      {/* Detail fields — shown below the card grid when a choice requiring detail is selected */}
      {chosen?.require_detail && (
        <div className="mt-3 space-y-3">
          {chosen.value === "own" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">
                ประเภท License *
              </label>
              <select
                value={value.level ?? ""}
                onChange={(e) => onChange({ level: e.target.value })}
                className={inputCls}
              >
                <option value="">-- เลือกประเภท --</option>
                {LICENSE_LEVELS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(chosen.value !== "own" || value.level) &&
            (chosen.detail_type === "dropdown" ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">
                  {chosen.detail_label_th || "รายละเอียด"}
                </label>
                <select
                  value={value.level ?? ""}
                  onChange={(e) => onChange({ level: e.target.value })}
                  className={inputCls}
                >
                  <option value="">-- เลือก --</option>
                  {chosen.detail_options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">
                  {chosen.detail_label_th || "รายละเอียดเพิ่มเติม"}
                </label>
                <input
                  type="text"
                  placeholder={chosen.detail_label_th}
                  value={value.detail ?? ""}
                  onChange={(e) => onChange({ detail: e.target.value })}
                  className={inputCls}
                />
              </div>
            ))}
        </div>
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
  const [allConsented, setAllConsented] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);

  // Step 2 unified payment state (mirrors UnifiedPaymentStep in RegisterWizard)
  const [method, setMethod] = useState(null); // 'instant' | 'quote'
  const [channel, setChannel] = useState(null); // 'promptpay' | 'credit_card'
  const [card, setCard] = useState({
    number: "",
    name: "",
    expiry: "",
    cvc: "",
  });
  const [omiseReady, setOmiseReady] = useState(false);
  const [qrCharge, setQrCharge] = useState(null); // PromptPay QR result, once created
  const [qrExpired, setQrExpired] = useState(false);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(600);
  const [cardPending, setCardPending] = useState(null); // async card awaiting settlement
  // Step 2 document sub-option + inline-panel state
  const [wantsDoc, setWantsDoc] = useState(null); // null | false | true
  const [quoteNeedsInvoice, setQuoteNeedsInvoice] = useState(false); // quote path inline invoice reveal
  const [paymentStarted, setPaymentStarted] = useState(false);
  const [openSections, setOpenSections] = useState({
    course: true,
    coordinator: false,
    attendees: false,
    license: false,
    invoice: false,
    notes: false,
  });
  const [globalLicenseAcked, setGlobalLicenseAcked] = useState(false);
  // Dedupes registration across multiple payment attempts (e.g. switch QR → card).
  const registeredRef = useRef(null);
  // Anchor for scrolling to the left-column payment panel after a charge is created.
  const leftPanelRef = useRef(null);
  // Anchor for the QR/Card payment panel itself (status widget "scroll to" target).
  const paymentPanelRef = useRef(null);

  const toggleSection = useCallback((key) => {
    setOpenSections((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const licenseEnabled = Boolean(course.license_options?.enabled);
  const pricing = computePricing(
    batch.effective_price,
    formState.attendeesCount ?? 1,
  );
  // Anchor for scrolling to the deferred-invoice zone in the left column.
  const invoiceZoneRef = useRef(null);

  // Invoice subtree lives in react-hook-form so InvoiceFields keeps its
  // native register/watch/setValue/errors contract.
  const {
    register,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm({ defaultValues: { invoice: EMPTY_INVOICE } });

  // Reactive read of the invoice subtree — drives "is the invoice filled?" gating.
  const invoiceData = watch("invoice");
  const invoiceFilled = Boolean(
    invoiceData?.companyName?.trim() ||
    invoiceData?.firstName?.trim() ||
    invoiceData?.lastName?.trim(),
  );

  // ── hydration + sessionStorage restore ──────────────────────────────────────
  useEffect(() => {
    setHydrated(true);
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.formState)
          setFormState({ ...EMPTY_FORM, ...saved.formState });
        if (saved?.invoice) reset({ invoice: saved.invoice });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Omise.js script — loaded lazily when the card channel is selected ────────
  useEffect(() => {
    if (channel !== "credit_card") return;
    const pk = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;
    function configure() {
      try {
        if (window.Omise && pk) {
          window.Omise.setPublicKey(pk);
          setOmiseReady(true);
        }
      } catch {}
    }
    if (typeof window !== "undefined" && window.Omise) {
      configure();
      return;
    }
    const existing = document.querySelector("script[data-omise]");
    if (existing) {
      existing.addEventListener("load", configure);
      return () => existing.removeEventListener("load", configure);
    }
    const script = document.createElement("script");
    script.src = "https://cdn.omise.co/omise.js";
    script.async = true;
    script.setAttribute("data-omise", "true");
    script.addEventListener("load", configure);
    document.body.appendChild(script);
    return () => script.removeEventListener("load", configure);
  }, [channel]);

  // ── QR countdown — counts down from 600s while the QR is live ────────────────
  useEffect(() => {
    if (!qrCharge?.qrUrl || qrExpired) return;
    const iv = setInterval(() => {
      setQrSecondsLeft((s) => {
        if (s <= 1) {
          setQrExpired(true);
          clearInterval(iv);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [qrCharge?.qrUrl, qrExpired]);

  const persist = useCallback(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ formState, invoice: getValues("invoice") }),
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
        const r = await fetch(
          `/api/masterclass/register/status?id=${registrationId}`,
          {
            cache: "no-store",
          },
        );
        const d = await r.json();
        if (d.status === "paid" || d.paymentStatus === "successful") {
          clearInterval(iv);
          setResult({
            kind: "paid",
            referenceNumber: qrCharge.referenceNumber,
            amount: qrCharge.amount,
            method: "promptpay",
            requestInvoice:
              Boolean(formState.request_invoice) || wantsDoc === true,
          });
          setStep(3);
        }
      } catch {}
      if (elapsed >= MAX) {
        clearInterval(iv);
        setPayError("QR Code หมดอายุ กรุณาลองใหม่");
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [qrCharge, registrationId]);

  // ── Card settlement polling (async / 3DS cards) ─────────────────────────────
  // Mirrors the PromptPay poll above: when a card charge comes back not-yet-paid,
  // poll the same status endpoint until Omise settles it (or time out).
  useEffect(() => {
    if (!cardPending || !registrationId) return undefined;
    let elapsed = 0;
    const MAX = 10 * 60 * 1000; // 10 minutes
    const iv = setInterval(async () => {
      elapsed += 3000;
      try {
        const r = await fetch(
          `/api/masterclass/register/status?id=${registrationId}`,
          { cache: "no-store" },
        );
        const d = await r.json();
        if (d.status === "paid" || d.paymentStatus === "successful") {
          clearInterval(iv);
          setCardPending(null);
          setResult({
            kind: "paid",
            referenceNumber: cardPending.referenceNumber,
            amount: cardPending.amount,
            method: "credit_card",
            requestInvoice:
              Boolean(formState.request_invoice) || wantsDoc === true,
          });
          setStep(3);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (d.paymentStatus === "failed") {
          // Charge declined (e.g. insufficient funds) — surface immediately
          // instead of waiting out the 10-minute timeout.
          clearInterval(iv);
          setCardPending(null);
          setPayError(
            "การชำระเงินไม่สำเร็จ กรุณาตรวจสอบยอดเงินในบัตรหรือลองใหม่อีกครั้ง",
          );
        }
      } catch {}
      if (elapsed >= MAX) {
        clearInterval(iv);
        setCardPending(null);
        setPayError(
          "ไม่สามารถยืนยันการชำระเงินได้ในขณะนี้ กรุณาตรวจสอบสถานะหรือลองใหม่",
        );
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [cardPending, registrationId]);

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

  // Field-by-field invoice validation; returns an error message or null when valid.
  function validateInvoiceFields() {
    const inv = getValues("invoice");
    const isThai = (inv?.country ?? "TH") === "TH";
    const isCorprate = inv?.type === "corporate";

    // Name / company required
    if (isCorprate) {
      if (!inv?.companyName?.trim())
        return "กรุณากรอกชื่อบริษัทสำหรับออกใบเสนอราคา";
    } else {
      if (!inv?.firstName?.trim() || !inv?.lastName?.trim()) {
        return "กรุณากรอกชื่อ-นามสกุลสำหรับออกใบเสนอราคา";
      }
    }

    // Tax ID required for Thai customers
    if (isThai && !inv?.taxId?.trim()) return "กรุณากรอกเลขประจำตัวผู้เสียภาษี";

    // Thai address required
    if (isThai) {
      const addr = inv?.thaiAddress ?? {};
      if (!addr.addressLine?.trim())
        return "กรุณากรอกที่อยู่สำหรับออกใบเสนอราคา";
      if (!addr.postalCode?.trim()) return "กรุณากรอกรหัสไปรษณีย์";
      if (!addr.subDistrict?.trim())
        return "กรุณาเลือกแขวง/ตำบล (กรอกรหัสไปรษณีย์ก่อน)";
      if (!addr.district?.trim()) return "กรุณาเลือกเขต/อำเภอ";
      if (!addr.province?.trim()) return "กรุณาเลือกจังหวัด";
    }

    // International address required fields
    if (!isThai) {
      const addr = inv?.internationalAddress ?? {};
      if (!addr.line1?.trim()) return "Please enter address line 1";
      if (!addr.city?.trim()) return "Please enter city";
      if (!addr.country?.trim()) return "Please enter country";
    }

    return null;
  }

  function validateLicense() {
    if (!licenseEnabled) return null; // license not applicable for this course

    const count = formState.attendeesCount ?? 1;
    const listProvided = formState.attendeesListProvided ?? true;
    const effectiveScope =
      !listProvided || count <= 1
        ? "all"
        : (formState.license_scope ?? "all");

    const choices = course.license_options?.choices ?? [];

    if (effectiveScope === "all") {
      if (!formState.license_choice) {
        return "กรุณาเลือก License ก่อนดำเนินการต่อ";
      }
      const chosen = choices.find((c) => c.value === formState.license_choice);
      if (chosen?.require_detail) {
        if (chosen.value === "own" && !formState.license_level) {
          return "กรุณาเลือกประเภท License (License Level)";
        }
        if (chosen.value !== "own" && !formState.license_detail?.trim()) {
          return "กรุณากรอกรายละเอียด License";
        }
      }
    } else {
      // per_attendee: validate each slot
      for (let i = 0; i < count; i++) {
        const slot = formState.license_per_attendee?.[i] ?? {};
        if (!slot.choice) {
          return `กรุณาเลือก License สำหรับผู้เข้าอบรมท่านที่ ${i + 1}`;
        }
        const chosen = choices.find((c) => c.value === slot.choice);
        if (chosen?.require_detail) {
          if (chosen.value === "own" && !slot.level) {
            return `กรุณาเลือกประเภท License สำหรับผู้เข้าอบรมท่านที่ ${i + 1}`;
          }
          if (chosen.value !== "own" && !slot.detail?.trim()) {
            return `กรุณากรอกรายละเอียด License สำหรับผู้เข้าอบรมท่านที่ ${i + 1}`;
          }
        }
      }
    }

    return null; // valid
  }

  function handleStep1Next() {
    setSubmitError(null);
    const { firstName, lastName, email, phone } = formState;
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !phone.trim()
    ) {
      setSubmitError(
        "กรุณากรอกข้อมูลผู้ประสานงานให้ครบถ้วน (ชื่อ นามสกุล อีเมล เบอร์โทร)",
      );
      return;
    }
    // Validate filled attendees when list is provided
    if (formState.attendeesListProvided ?? true) {
      const count = formState.attendeesCount ?? 1;
      for (let i = 0; i < count; i++) {
        const isCoordSlot = i === 0 && formState.coordinator_is_attending;
        if (isCoordSlot) continue;
        const att = formState.attendees?.[i];
        if (
          !att?.firstName?.trim() ||
          !att?.lastName?.trim() ||
          !att?.email?.trim() ||
          !att?.phone?.trim()
        ) {
          setSubmitError(
            `กรุณากรอกข้อมูลผู้เข้าอบรมท่านที่ ${i + 1} ให้ครบถ้วน`,
          );
          return;
        }
      }
    }

    // Validate license selection
    const licenseErr = validateLicense();
    if (licenseErr) {
      setSubmitError(licenseErr);
      return;
    }

    persist();
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Card validity gates the card pay button (alongside omiseReady + consent).
  const cardBrand = detectCardBrand(card.number);
  const cardValid =
    cardNumberValid(card.number, cardBrand) &&
    expiryValid(card.expiry) &&
    card.cvc.length === cvcMax(cardBrand) &&
    card.name.trim().length > 0;

  const canStep2Confirm =
    method === "quote"
      ? allConsented &&
        (formState.request_invoice
          ? invoiceFilled
          : quoteNeedsInvoice
            ? invoiceFilled
            : false)
      : method === "instant"
        ? Boolean(channel) &&
          allConsented &&
          wantsDoc !== null &&
          (wantsDoc !== true || formState.request_invoice || invoiceFilled)
        : false;

  // Whether the Step 1 form has minimum data to proceed (coordinator fields filled)
  const canStep1 = (() => {
    if (
      !formState.firstName?.trim() ||
      !formState.lastName?.trim() ||
      !formState.email?.trim() ||
      !formState.phone?.trim()
    )
      return false;
    if (licenseEnabled && validateLicense() !== null) return false;
    return true;
  })();

  // Step 2 left-column invoice form shows when a document was requested in Step 1
  // or opted into via the wantsDoc toggle on Step 2.
  const showStep2InvoiceZone =
    formState.request_invoice || // filled in Step 1
    wantsDoc === true || // user opted in via instant + doc sub-option
    quoteNeedsInvoice; // quote path auto-reveal

  // Registers the attendee exactly once; returns { registrationId, referenceNumber }
  // or null on failure. Deduped via registeredRef so switching payment channel
  // (QR → card) never creates a second registration.
  async function ensureRegistered(method = null) {
    if (registeredRef.current) return registeredRef.current;
    const invoice = getValues("invoice");
    const wantsInvoice =
      Boolean(formState.request_invoice) ||
      wantsDoc === true ||
      quoteNeedsInvoice;
    const perAttendeeLicense =
      (formState.license_scope ?? "all") === "per_attendee";
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
      const att = formState.attendees?.[i];
      return {
        firstName: att?.firstName?.trim() || formState.firstName?.trim() || "",
        lastName: att?.lastName?.trim() || formState.lastName?.trim() || "",
        email: att?.email?.trim() || formState.email?.trim() || "",
        phone: att?.phone?.trim() || formState.phone?.trim() || "",
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
      attendees: (formState.attendeesListProvided ?? true) ? resolvedAttendees : [],
      attendeesCount: count,
      attendeesListProvided: formState.attendeesListProvided ?? true,
      license_scope: formState.license_scope ?? "all",
      license_choice: perAttendeeLicense
        ? null
        : (formState.license_choice ?? null),
      license_level: perAttendeeLicense
        ? null
        : formState.license_level || null,
      license_detail: perAttendeeLicense
        ? null
        : formState.license_detail || null,
      license_per_attendee: perAttendeeLicense
        ? Array.from({ length: count }, (_, i) => {
            const slot = formState.license_per_attendee?.[i] ?? {};
            return {
              choice: slot.choice ?? null,
              level: slot.level || null,
              detail: slot.detail || null,
            };
          })
        : null,
      request_invoice: wantsInvoice,
      invoice: wantsInvoice ? invoice : null,
      notes: formState.notes?.trim() || null,
      method: method ?? null,
      consent: {
        accepted: allConsented,
        acceptedAt: allConsented ? new Date().toISOString() : null,
        dataChecked: allConsented,
        noRefund: allConsented,
        changePolicy: allConsented,
        termsAccepted: allConsented,
      },
    };
    const res = await fetch("/api/masterclass/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setSubmitError(data?.message || "ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่");
      return null;
    }
    const reg = {
      registrationId: data.registrationId,
      referenceNumber: data.referenceNumber,
    };
    registeredRef.current = reg;
    setRegistrationId(data.registrationId);
    return reg;
  }

  // Quote path: register without payment, then advance to the success screen.
  async function handleConfirmAndRegister() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const reg = await ensureRegistered('quote');
      if (!reg) return;
      setResult({
        kind: "quote",
        referenceNumber: reg.referenceNumber,
        requestInvoice: Boolean(formState.request_invoice) || quoteNeedsInvoice,
      });
      setStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setSubmitError(err?.message ?? "ลงทะเบียนไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  // Charges an already-created registration with an Omise card token.
  async function chargeCard(omiseToken, regId) {
    setPayError(null);
    try {
      const res = await fetch("/api/masterclass/register/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId: regId,
          paymentMethod: "credit_card",
          omiseToken,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPayError(data?.message || "การชำระเงินไม่สำเร็จ");
        return;
      }
      if (!data.paid) {
        // Card not settled synchronously.
        if (data.authorizeUrl) {
          // 3DS / bank authorization required — hand the user off to Omise's
          // authorize page. They return to /masterclass/payment/complete
          // (our return_uri), which polls status until the charge settles.
          window.location.href = data.authorizeUrl;
          return;
        }
        // Async capture without a redirect — poll the status endpoint instead
        // of showing success prematurely.
        setCardPending({
          referenceNumber: data.referenceNumber,
          amount: data.amount,
        });
        return;
      }
      setResult({
        kind: "paid",
        referenceNumber: data.referenceNumber,
        amount: data.amount,
        method: "credit_card",
        requestInvoice: Boolean(formState.request_invoice) || wantsDoc === true,
      });
      setStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setPayError(err?.message ?? "การชำระเงินไม่สำเร็จ");
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
        window.Omise.createToken(
          "card",
          {
            name: card.name,
            number: card.number.replace(/\s/g, ""),
            expiration_month: parseInt(card.expiry.split("/")[0]),
            expiration_year: parseInt("20" + card.expiry.split("/")[1]),
            security_code: card.cvc,
          },
          (statusCode, response) => {
            if (response.object === "error")
              reject(new Error(response.message));
            else resolve(response.id);
          },
        );
      });
      await chargeCard(tokenId, reg.registrationId);
    } catch (err) {
      setPayError(err?.message ?? "สร้าง token ไม่สำเร็จ กรุณาลองใหม่");
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
      const res = await fetch("/api/masterclass/register/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId: reg.registrationId,
          paymentMethod: "promptpay",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPayError(data?.message || "สร้าง QR ไม่สำเร็จ");
        return;
      }
      setQrExpired(false);
      setQrSecondsLeft(600);
      setQrCharge(data);
      setPaymentStarted(true);
      // Defer scroll until the left-column panel has rendered.
      setTimeout(
        () =>
          leftPanelRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        50,
      );
    } catch (err) {
      setPayError(err?.message ?? "สร้าง QR ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStep2Confirm() {
    setSubmitError(null);
    setPayError(null);

    // Quote always needs billing data for the invoice — reveal the form inline
    // on first press, then validate + register on the second.
    if (method === "quote") {
      if (!formState.request_invoice && !quoteNeedsInvoice) {
        setQuoteNeedsInvoice(true);
        setOpenSections((p) => ({ ...p, invoice: true }));
        setTimeout(
          () =>
            invoiceZoneRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          50,
        );
        return;
      }
      const invErr = validateInvoiceFields();
      if (invErr) {
        setSubmitError(invErr);
        setOpenSections((p) => ({ ...p, invoice: true }));
        invoiceZoneRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }
      await handleConfirmAndRegister();
      return;
    }

    // Instant + document requested: validate the invoice form before charging.
    if (
      method === "instant" &&
      (wantsDoc === true || formState.request_invoice)
    ) {
      const invErr = validateInvoiceFields();
      if (invErr) {
        setSubmitError(invErr);
        setOpenSections((p) => ({ ...p, invoice: true }));
        invoiceZoneRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }
    }

    if (method === "instant" && channel === "promptpay") {
      // On success createPromptPay flips paymentStarted and scrolls to the left panel.
      await createPromptPay();
      return;
    }
    if (method === "instant" && channel === "credit_card") {
      // Move the card form into the left-column panel; charge happens there.
      setPaymentStarted(true);
      setTimeout(
        () =>
          leftPanelRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        50,
      );
      return;
    }
  }

  // Whether to render an inline per-attendee license picker inside each card.
  // Force false when count ≤ 1 — per_attendee scope has no meaning with a single slot.
  const perAttendeeLicense =
    licenseEnabled &&
    (formState.attendeesCount ?? 1) > 1 &&
    (formState.license_scope ?? "all") === "per_attendee";

  // Inline license sub-form for attendee slot `i`. Rendered as plain JSX (not a
  // nested component) so the controlled inputs keep focus across re-renders.
  const renderAttendeeLicense = (i, locked = false) => {
    const slot = formState.license_per_attendee?.[i] ?? {
      choice: null,
      level: "",
      detail: "",
    };
    return (
      <div className="relative mt-4 border-t border-[var(--surface-border)] pt-4">
        <p className="mb-2 text-xs font-semibold text-9e-action">
          ตัวเลือก License
        </p>
        <div
          className={cn(
            "transition-opacity",
            locked ? "pointer-events-none opacity-40" : "",
          )}
        >
          <LicenseChoices
            choices={course.license_options.choices}
            value={slot}
            onChange={(partial) =>
              setFormState((p) => {
                const next = [...(p.license_per_attendee ?? [])];
                next[i] = {
                  ...(next[i] ?? { choice: null, level: "", detail: "" }),
                  ...partial,
                };
                return { ...p, license_per_attendee: next };
              })
            }
            globalAcked={globalLicenseAcked}
          />
        </div>
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center rounded-9e-md">
            <p className="rounded-9e-md bg-white/90 px-3 py-1.5 text-xs font-medium text-9e-navy shadow-sm ring-1 ring-9e-brand/20 dark:bg-[#0D1B2A]/90 dark:text-white">
              กรุณาติ๊ก{" "}
              <span className="font-semibold text-9e-brand">
                {course.license_options?.global_ack?.label_th ||
                  "รับทราบเงื่อนไข"}
              </span>{" "}
              ก่อน
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <TermsModal
        open={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
      />
      <div className="mx-auto max-w-[1200px] px-4 py-10 lg:px-6">
        <Stepper step={result ? 3 : step} />

        {/* ── STEP 1 ── */}
        {step === 1 && !result && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_330px] lg:items-start pb-24 lg:pb-0">
            <div>
              {/* Course card — shown on mobile only (top of form), hidden on lg+ where it's in the right column */}
              <div className="mb-6 lg:hidden">
                <BatchSummary course={course} batch={batch} />
              </div>
              <div></div>
              <h2 className="text-lg font-bold text-9e-navy dark:text-white">
                ข้อมูลผู้ประสานงาน
              </h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                ผู้ติดต่อที่ 9Expert จะใช้ในการสื่อสารเรื่องการอบรมและใบแจ้งหนี้
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">
                    ชื่อ *
                  </label>
                  <input
                    type="text"
                    value={formState.firstName}
                    onChange={(e) => setField("firstName", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">
                    นามสกุล *
                  </label>
                  <input
                    type="text"
                    value={formState.lastName}
                    onChange={(e) => setField("lastName", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">
                    อีเมล *
                  </label>
                  <input
                    type="email"
                    value={formState.email}
                    onChange={(e) => setField("email", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-9e-navy dark:text-white">
                    เบอร์โทร *
                  </label>
                  <input
                    type="tel"
                    value={formState.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="mt-3 sm:col-span-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-9e-navy dark:text-white">
                    <input
                      type="checkbox"
                      checked={formState.coordinator_is_attending ?? false}
                      onChange={(e) =>
                        setField("coordinator_is_attending", e.target.checked)
                      }
                      className="mt-0.5"
                    />
                    ผู้ประสานงานเป็นผู้เข้าอบรม
                  </label>
                </div>
              </div>

              {/* ── Attendee section ── */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-9e-navy dark:text-white">
                  ข้อมูลผู้เข้าอบรม
                </h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  ระบุจำนวนและข้อมูลของผู้เข้าอบรม
                  หากยังไม่ทราบรายชื่อสามารถข้ามได้
                </p>

                {/* Count + skip row */}
                <div className="flex items-end gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">
                      จำนวนผู้สมัคร
                    </label>
                    <select
                      value={formState.attendeesCount ?? 1}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setFormState((p) => ({
                          ...p,
                          attendeesCount: n,
                          coordinator_is_attending: p.coordinator_is_attending,
                          attendees: Array.from(
                            { length: n },
                            (_, i) =>
                              p.attendees?.[i] ?? {
                                firstName: "",
                                lastName: "",
                                email: "",
                                phone: "",
                              },
                          ),
                          // Reset scope to 'all' when count drops to 1 — per_attendee has no meaning with a single slot
                          ...(n <= 1
                            ? { license_scope: "all", license_per_attendee: [] }
                            : {}),
                        }));
                      }}
                      className={`${inputCls} w-28`}
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!(
                    (formState.attendeesCount ?? 1) === 1 &&
                    (formState.coordinator_is_attending ?? false)
                  ) && (
                    <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-9e-navy dark:text-white">
                      <input
                        type="checkbox"
                        checked={!(formState.attendeesListProvided ?? true)}
                        onChange={(e) =>
                          setField("attendeesListProvided", !e.target.checked)
                        }
                        className="mt-0.5"
                      />
                      ยังไม่ประสงค์แจ้งรายชื่อผู้เข้าอบรม
                    </label>
                  )}
                </div>

                {/* License sub-section */}
                {licenseEnabled &&
                  (() => {
                    const _count = formState.attendeesCount ?? 1;
                    const _listProvided =
                      formState.attendeesListProvided ?? true;
                    const _effectiveScope =
                      !_listProvided || _count <= 1
                        ? "all"
                        : (formState.license_scope ?? "all");
                    const _showToggle = _count > 1 && _listProvided;
                    return (
                      <div className="mt-4 rounded-9e-lg border border-[var(--surface-border)] p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-9e-navy dark:text-white">
                            ตัวเลือก License
                          </h4>
                          {_showToggle && (
                            <div className="inline-flex rounded-9e-md border border-[var(--surface-border)] p-0.5">
                              {[
                                { value: "all", label: "ทุกคน" },
                                { value: "per_attendee", label: "แยกรายคน" },
                              ].map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    setField("license_scope", opt.value);
                                    if (opt.value === "all")
                                      setGlobalLicenseAcked(false);
                                  }}
                                  className={cn(
                                    "rounded-[6px] px-4 py-1.5 text-xs font-semibold transition-colors",
                                    _effectiveScope === opt.value
                                      ? "bg-9e-action text-white"
                                      : "text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-white/5",
                                  )}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {_effectiveScope === "all" && (
                          <LicenseChoices
                            choices={course.license_options.choices}
                            value={{
                              choice: formState.license_choice,
                              level: formState.license_level,
                              detail: formState.license_detail,
                            }}
                            onChange={(partial) =>
                              setFormState((p) => ({
                                ...p,
                                ...(partial.choice !== undefined
                                  ? { license_choice: partial.choice }
                                  : {}),
                                ...(partial.level !== undefined
                                  ? { license_level: partial.level }
                                  : {}),
                                ...(partial.detail !== undefined
                                  ? { license_detail: partial.detail }
                                  : {}),
                              }))
                            }
                            globalAcked={false}
                          />
                        )}
                        {_effectiveScope === "per_attendee" &&
                          (() => {
                            const _globalAckEnabled = Boolean(
                              course.license_options?.global_ack?.enabled,
                            );
                            const _locked =
                              _globalAckEnabled && !globalLicenseAcked;
                            return (
                              <div>
                                {_globalAckEnabled && (
                                  <GlobalLicenseAckBlock
                                    config={course.license_options.global_ack}
                                    acked={globalLicenseAcked}
                                    onAck={setGlobalLicenseAcked}
                                  />
                                )}
                                <p className="rounded-9e-md bg-9e-brand/5 p-3 text-xs text-gray-500 dark:text-gray-400">
                                  เลือก License
                                  ของผู้เข้าอบรมแต่ละท่านได้ในการ์ดผู้เข้าอบรมด้านล่าง
                                </p>
                              </div>
                            );
                          })()}
                      </div>
                    );
                  })()}

                {/* If list skipped */}
                {!(formState.attendeesListProvided ?? true) &&
                  (() => {
                    const _count = formState.attendeesCount ?? 1;
                    const _coordAttending =
                      formState.coordinator_is_attending ?? false;
                    const _showCoordCard = _coordAttending && _count > 1;

                    const _licenseLabel =
                      licenseEnabled && formState.license_choice
                        ? formState.license_choice === "own"
                          ? "ใช้ License ของผู้เข้าอบรมเอง"
                          : formState.license_choice === "9expert"
                            ? "ให้ 9Expert จัดเตรียม License ให้"
                            : formState.license_choice
                        : null;

                    if (_showCoordCard) {
                      return (
                        <div className="mt-3 space-y-3">
                          {/* Coordinator card — read-only */}
                          <div className="rounded-9e-md border border-9e-brand/30 bg-9e-brand/5 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-9e-action mb-1">
                              ผู้เข้าอบรมท่านที่ 1 (ผู้ประสานงาน)
                            </p>
                            <p className="text-sm font-semibold text-9e-navy dark:text-white">
                              {`${formState.firstName} ${formState.lastName}`.trim() ||
                                "—"}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {formState.email || "—"} ·{" "}
                              {formState.phone || "—"}
                            </p>
                            {/* {_licenseLabel && (
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            License: <span className="font-medium text-9e-navy dark:text-white">{_licenseLabel}</span>
                          </p>
                        )} */}
                          </div>
                          {/* Notice for remaining attendees */}
                          <div className="rounded-9e-md border border-dashed border-[var(--surface-border)] p-3 text-sm text-gray-500 dark:text-gray-400">
                            ผู้เข้าอบรมท่านที่ 2{_count > 2 ? `–${_count}` : ""}{" "}
                            จะแจ้งรายชื่อภายหลัง —
                            ทีมงานจะติดต่อเพื่อเก็บข้อมูลเพิ่มเติม
                            {/* {_licenseLabel && <span className="block mt-1">License: {_licenseLabel}</span>} */}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="mt-3 rounded-9e-md border border-dashed border-[var(--surface-border)] p-3 text-sm text-gray-500 dark:text-gray-400">
                        <p>
                          จะแจ้งรายชื่อผู้เข้าอบรมภายหลัง —
                          ทีมงานจะติดต่อเพื่อเก็บข้อมูลเพิ่มเติม
                        </p>
                        {_licenseLabel && (
                          <p className="mt-1">
                            License:{" "}
                            <span className="font-medium text-9e-navy dark:text-white">
                              {_licenseLabel}
                            </span>
                          </p>
                        )}
                      </div>
                    );
                  })()}

                {/* If list provided — render per-attendee forms */}
                {(formState.attendeesListProvided ?? true) && (
                  <div className="mt-3 space-y-3">
                    {Array.from(
                      { length: formState.attendeesCount ?? 1 },
                      (_, i) => {
                        const isCoordinatorSlot =
                          i === 0 && formState.coordinator_is_attending;
                        const displayIndex = i + 1;
                        const att = formState.attendees?.[i] ?? {
                          firstName: "",
                          lastName: "",
                          email: "",
                          phone: "",
                        };

                        if (isCoordinatorSlot) {
                          return (
                            <div
                              key={i}
                              className="rounded-9e-md border border-9e-brand/30 bg-9e-brand/5 p-4"
                            >
                              <p className="text-xs font-semibold uppercase tracking-wide text-9e-action mb-1">
                                ผู้เข้าอบรมท่านที่ 1 (ผู้ประสานงาน)
                              </p>
                              <p className="text-sm font-semibold text-9e-navy dark:text-white">
                                {`${formState.firstName} ${formState.lastName}`.trim() ||
                                  "—"}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {formState.email || "—"} ·{" "}
                                {formState.phone || "—"}
                              </p>
                              <p className="mt-2 text-xs text-gray-400">
                                ข้อมูลนี้อ้างอิงจากผู้ประสานงานด้านบน
                                ไม่สามารถแก้ไขได้ที่นี่
                              </p>
                              {perAttendeeLicense &&
                                renderAttendeeLicense(
                                  i,
                                  Boolean(
                                    course.license_options?.global_ack?.enabled,
                                  ) && !globalLicenseAcked,
                                )}
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
                          <div
                            key={i}
                            className="rounded-9e-md border border-[var(--surface-border)]"
                          >
                            <div className="flex items-center justify-between px-4 py-3">
                              <span className="text-sm font-semibold text-9e-navy dark:text-white">
                                ผู้เข้าอบรมท่านที่ {displayIndex}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 gap-3 border-t border-[var(--surface-border)] p-4 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">
                                  ชื่อ *
                                </label>
                                <input
                                  type="text"
                                  value={att.firstName}
                                  onChange={(e) =>
                                    updateAttendee("firstName", e.target.value)
                                  }
                                  className={inputCls}
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">
                                  นามสกุล *
                                </label>
                                <input
                                  type="text"
                                  value={att.lastName}
                                  onChange={(e) =>
                                    updateAttendee("lastName", e.target.value)
                                  }
                                  className={inputCls}
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">
                                  อีเมล *
                                </label>
                                <input
                                  type="email"
                                  value={att.email}
                                  onChange={(e) =>
                                    updateAttendee("email", e.target.value)
                                  }
                                  className={inputCls}
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-9e-navy dark:text-white">
                                  เบอร์โทร *
                                </label>
                                <input
                                  type="tel"
                                  value={att.phone}
                                  onChange={(e) =>
                                    updateAttendee("phone", e.target.value)
                                  }
                                  className={inputCls}
                                />
                              </div>
                              {perAttendeeLicense && (
                                <div className="sm:col-span-2">
                                  {renderAttendeeLicense(
                                    i,
                                    Boolean(
                                      course.license_options?.global_ack
                                        ?.enabled,
                                    ) && !globalLicenseAcked,
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mt-6">
                <label className="mb-1 block text-sm font-semibold text-9e-navy dark:text-white">
                  หมายเหตุเพิ่มเติม
                </label>
                <textarea
                  value={formState.notes ?? ""}
                  onChange={(e) => setField("notes", e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="หมายเหตุ"
                  className={`${inputCls} resize-none`}
                />
              </div>

              {submitError && (
                <div className="mt-4 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              {/* Desktop next button (hidden on mobile — use bottom bar instead) */}
              <div className="mt-6 hidden justify-end lg:flex">
                <button
                  type="button"
                  onClick={handleStep1Next}
                  className="inline-flex items-center gap-1 rounded-full bg-9e-action px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-9e-brand"
                >
                  ถัดไป <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Course card — desktop right column (hidden on mobile) */}
            <div className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
              <BatchSummary course={course} batch={batch} />
            </div>
          </div>
        )}

        {/* ── STEP 1 Mobile bottom bar ── */}
        {step === 1 && !result && (
          <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--surface-border)] bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] dark:bg-[#0D1B2A] lg:hidden">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleStep1Next}
                disabled={!canStep1}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-full py-3 text-sm font-semibold transition-colors",
                  canStep1
                    ? "bg-9e-action text-white hover:bg-9e-brand"
                    : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500",
                )}
              >
                ถัดไป <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2 — Unified Review + Payment ── */}
        {step === 2 && !result && (
          <div className="grid grid-cols-1 gap-6 pb-24 lg:grid-cols-[1fr_minmax(340px,400px)] lg:items-start lg:pb-0">
            {/* LEFT — read-only preview + payment options (full width on mobile) */}
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-9e-navy dark:text-white">
                ตรวจสอบข้อมูล
              </h2>

              <Section
                title="หลักสูตร"
                collapsible
                open={openSections.course}
                onToggle={() => toggleSection("course")}
              >
                <ReadRow label="หลักสูตร" value={course.title_th} />
                <ReadRow
                  label="รุ่น"
                  value={batch.batch_label || `รุ่นที่ ${batch.batch_no}`}
                />
                <ReadRow
                  label="วันที่"
                  value={batch.dates?.[0]?.day_label || "—"}
                />
                <ReadRow label="สถานที่" value={batch.venue_name || "—"} />
              </Section>

              <Section
                title="ข้อมูลผู้ประสานงาน"
                collapsible
                open={openSections.coordinator}
                onToggle={() => toggleSection("coordinator")}
              >
                <ReadRow
                  label="ชื่อ-นามสกุล"
                  value={`${formState.firstName} ${formState.lastName}`.trim()}
                />
                <ReadRow label="อีเมล" value={formState.email} />
                <ReadRow label="เบอร์โทร" value={formState.phone} />
                <ReadRow
                  label="ผู้ประสานงานเข้าอบรม"
                  value={formState.coordinator_is_attending ? "ใช่" : "ไม่"}
                />
              </Section>

              <Section
                title={`ผู้เข้าอบรม (${formState.attendeesCount ?? 1} ท่าน)`}
                collapsible
                open={openSections.attendees}
                onToggle={() => toggleSection("attendees")}
              >
                {(formState.attendeesListProvided ?? true)
                  ? Array.from(
                      { length: formState.attendeesCount ?? 1 },
                      (_, i) => {
                        const att =
                          i === 0 && formState.coordinator_is_attending
                            ? {
                                firstName: formState.firstName,
                                lastName: formState.lastName,
                                email: formState.email,
                                phone: formState.phone,
                              }
                            : (formState.attendees?.[i] ?? {});
                        return (
                          <div
                            key={i}
                            className="mb-2 pb-2 border-b border-[var(--surface-border)] last:border-0 last:mb-0 last:pb-0"
                          >
                            <ReadRow
                              label={`ท่านที่ ${i + 1}`}
                              value={`${att.firstName ?? ""} ${att.lastName ?? ""}`.trim()}
                            />
                            <ReadRow label="อีเมล" value={att.email ?? ""} />
                            <ReadRow label="เบอร์โทร" value={att.phone ?? ""} />

                            {/* License — scope 'all': same value for every attendee */}
                            {licenseEnabled &&
                              (formState.license_scope ?? "all") === "all" &&
                              formState.license_choice && (
                                <>
                                  <ReadRow
                                    label="License"
                                    value={(() => {
                                      const chosen =
                                        course.license_options.choices.find(
                                          (c) =>
                                            c.value ===
                                            formState.license_choice,
                                        );
                                      return formState.license_choice === "own"
                                        ? "ใช้ License ของผู้เข้าอบรมเอง"
                                        : formState.license_choice === "9expert"
                                          ? "ให้ 9Expert จัดเตรียม License ให้"
                                          : (chosen?.label_th ??
                                            formState.license_choice);
                                    })()}
                                  />
                                  {formState.license_level && (
                                    <ReadRow
                                      label="ประเภท"
                                      value={formState.license_level}
                                    />
                                  )}
                                  {formState.license_detail && (
                                    <ReadRow
                                      label="รายละเอียด"
                                      value={formState.license_detail}
                                    />
                                  )}
                                </>
                              )}

                            {/* License — scope 'per_attendee': value from this attendee's slot */}
                            {licenseEnabled &&
                              formState.license_scope === "per_attendee" &&
                              (() => {
                                const perAtt =
                                  formState.license_per_attendee?.[i];
                                if (!perAtt?.choice) return null;
                                const baseLabel =
                                  perAtt.choice === "own"
                                    ? "ใช้ License ของผู้เข้าอบรมเอง"
                                    : perAtt.choice === "9expert"
                                      ? "ให้ 9Expert จัดเตรียม License ให้"
                                      : (course.license_options.choices.find(
                                          (c) => c.value === perAtt.choice,
                                        )?.label_th ?? perAtt.choice);
                                return (
                                  <>
                                    <ReadRow
                                      label="License"
                                      value={baseLabel}
                                    />
                                    {perAtt.level && (
                                      <ReadRow
                                        label="ประเภท"
                                        value={perAtt.level}
                                      />
                                    )}
                                    {perAtt.detail && (
                                      <ReadRow
                                        label="รายละเอียด"
                                        value={perAtt.detail}
                                      />
                                    )}
                                  </>
                                );
                              })()}
                          </div>
                        );
                      },
                    )
                  : (() => {
                      const _count = formState.attendeesCount ?? 1;
                      const _coordAttending =
                        formState.coordinator_is_attending ?? false;
                      const _licenseLabel =
                        licenseEnabled && formState.license_choice
                          ? formState.license_choice === "own"
                            ? "ใช้ License ของผู้เข้าอบรมเอง"
                            : formState.license_choice === "9expert"
                              ? "ให้ 9Expert จัดเตรียม License ให้"
                              : formState.license_choice
                          : null;

                      if (_coordAttending) {
                        return (
                          <div className="space-y-2">
                            {/* Coordinator row */}
                            <div
                              className={cn(
                                "pb-2",
                                _count > 1 &&
                                  "border-b border-[var(--surface-border)]",
                              )}
                            >
                              <ReadRow
                                label="ท่านที่ 1 (ผู้ประสานงาน)"
                                value={`${formState.firstName ?? ""} ${formState.lastName ?? ""}`.trim()}
                              />
                              <ReadRow
                                label="อีเมล"
                                value={formState.email ?? ""}
                              />
                              <ReadRow
                                label="เบอร์โทร"
                                value={formState.phone ?? ""}
                              />
                              {_licenseLabel && (
                                <ReadRow
                                  label="License"
                                  value={_licenseLabel}
                                />
                              )}
                              {formState.license_level && (
                                <ReadRow
                                  label="ประเภท"
                                  value={formState.license_level}
                                />
                              )}
                              {formState.license_detail && (
                                <ReadRow
                                  label="รายละเอียด"
                                  value={formState.license_detail}
                                />
                              )}
                            </div>
                            {/* Notice for remaining attendees when count > 1 */}
                            {_count > 1 && (
                              <p className="text-sm text-gray-500">
                                ผู้เข้าอบรมท่านที่ 2
                                {_count > 2 ? `–${_count}` : ""}{" "}
                                จะแจ้งรายชื่อภายหลัง —
                                ทีมงานจะติดต่อเพื่อเก็บข้อมูลเพิ่มเติม
                                {_licenseLabel && (
                                  <span className="block mt-0.5">
                                    License (ทุกท่าน): {_licenseLabel}
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        );
                      }

                      // Coordinator not attending — all attendees to be named later
                      return (
                        <div>
                          <p className="text-sm text-gray-500">
                            จะแจ้งรายชื่อผู้เข้าอบรมภายหลัง —
                            ทีมงานจะติดต่อเพื่อเก็บข้อมูลเพิ่มเติม
                          </p>
                          {_licenseLabel && (
                            <p className="mt-1 text-sm text-gray-500">
                              License:{" "}
                              <span className="font-medium text-9e-navy dark:text-white">
                                {_licenseLabel}
                              </span>
                              {formState.license_level && (
                                <span> · {formState.license_level}</span>
                              )}
                            </p>
                          )}
                        </div>
                      );
                    })()}
              </Section>

              {formState.notes && (
                <Section
                  title="หมายเหตุ"
                  collapsible
                  open={openSections.notes}
                  onToggle={() => toggleSection("notes")}
                >
                  <p className="text-sm text-9e-navy dark:text-white">
                    {formState.notes}
                  </p>
                </Section>
              )}

              {batch.preparation_html && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900/40 dark:bg-amber-900/10">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-base">📋</span>
                    <h3 className="text-base font-bold text-amber-900 dark:text-amber-300">
                      เตรียมความพร้อมก่อนวันอบรม
                    </h3>
                  </div>
                  <div
                    className="prose prose-sm max-w-none text-amber-900 dark:prose-invert dark:text-amber-200
                    prose-headings:text-amber-900 dark:prose-headings:text-amber-300
                    prose-strong:text-amber-900 dark:prose-strong:text-amber-200
                    prose-li:marker:text-amber-500"
                    dangerouslySetInnerHTML={{ __html: batch.preparation_html }}
                  />
                </section>
              )}

              {/* ── ข้อมูลออกเอกสาร (invoice zone) ── */}
              {showStep2InvoiceZone && (
                <div ref={invoiceZoneRef}>
                  <section className="mt-5 rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
                    <h3 className="mb-3 text-base font-bold text-9e-navy dark:text-white">
                      กรอกข้อมูลสำหรับออกเอกสาร
                    </h3>
                    {quoteNeedsInvoice && !formState.request_invoice && (
                      <div className="mb-4 rounded-9e-md border border-9e-brand/30 bg-9e-brand/5 p-3 text-sm text-9e-action">
                        กรุณากรอกข้อมูลสำหรับออกใบเสนอราคาด้านล่างนี้
                      </div>
                    )}
                    <InvoiceFields
                      register={register}
                      watch={watch}
                      setValue={setValue}
                      errors={errors}
                      docType={method === "instant" ? "receipt" : "quote"}
                    />
                  </section>
                </div>
              )}

              {/* ── Payment panel zone (moves here after confirm) ── */}
              <div ref={leftPanelRef}>
                {paymentStarted &&
                  channel === "promptpay" &&
                  qrCharge?.qrUrl && (
                    <div ref={paymentPanelRef}>
                      <QrPanelFull
                        charge={qrCharge}
                        pricing={pricing}
                        expired={qrExpired}
                        secondsLeft={qrSecondsLeft}
                        onRegenerate={() => createPromptPay()}
                      />
                    </div>
                  )}
                {paymentStarted && channel === "credit_card" && (
                  <CardPanelFull
                    card={card}
                    setCard={setCard}
                    pricing={pricing}
                    onCharge={chargeCardDirect}
                    onChangeMethod={() => {
                      setChannel(null);
                      setPaymentStarted(false);
                    }}
                    submitting={submitting}
                    processing={Boolean(cardPending)}
                    payError={payError}
                    cardValid={cardValid}
                    omiseReady={omiseReady}
                  />
                )}
              </div>
            </div>

            {/* RIGHT — payment options + sticky summary (summary hidden on mobile, shown in bottom bar) */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <div
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]",
                  paymentStarted && "hidden lg:block",
                )}
              >
                {/* สรุปยอด — hidden on mobile (shown in bottom bar instead) */}
                <div className="hidden lg:block">
                  <h3 className="mb-3 text-base font-bold text-9e-navy dark:text-white">
                    สรุปยอด
                  </h3>
                  <div className="space-y-2 text-sm">
                    <SummaryLine
                      label={`ราคาต่อที่นั่ง × ${pricing.seats}`}
                      value={`${formatTHB(pricing.subtotal)} บาท`}
                    />
                    <SummaryLine label="ส่วนลด" value={`${formatTHB(0)} บาท`} />
                    <SummaryLine
                      label="VAT 7%"
                      value={`${formatTHB(pricing.vatAmount)} บาท`}
                    />
                    <div className="mt-2 flex items-baseline justify-between border-t border-[var(--surface-border)] pt-2">
                      <span className="font-semibold text-9e-navy dark:text-white">
                        ยอดรวมสุทธิ
                      </span>
                      <span className="text-xl font-bold text-9e-action">
                        {formatTHB(pricing.total)} บาท
                      </span>
                    </div>
                  </div>
                </div>

                {!paymentStarted && (
                  <>
                    {/* เลือกวิธีดำเนินการ */}
                    <div className="my-2">
                      <h3 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">
                        เลือกวิธีดำเนินการ
                      </h3>
                      <div className="space-y-2">
                        <MethodRadio
                          selected={method === "instant"}
                          onClick={() => {
                            setMethod("instant");
                            setWantsDoc(null);
                            setQuoteNeedsInvoice(false);
                          }}
                          title="ชำระทันที"
                          subtitle="ชำระผ่าน PromptPay QR หรือบัตรเครดิต/เดบิต"
                        />
                        <MethodRadio
                          selected={method === "quote"}
                          onClick={() => {
                            setMethod("quote");
                            setChannel(null);
                            setWantsDoc(null);
                            setQuoteNeedsInvoice(true);
                          }}
                          title="ขอใบเสนอราคา"
                          subtitle="เหมาะสำหรับบริษัทที่ต้องใช้เอกสารก่อนชำระเงิน"
                        />
                      </div>
                    </div>

                    {method === "instant" && (
                      <>
                        {/* ต้องการเอกสารหลังชำระ? */}
                        <div>
                          <h3 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">
                            ต้องการเอกสารหลังชำระ?
                          </h3>
                          <div className="space-y-2">
                            <MethodRadio
                              selected={wantsDoc === false}
                              onClick={() => {
                                setWantsDoc(false);
                                // Hide + clear the invoice zone unless it was requested in Step 1.
                                if (!formState.request_invoice)
                                  reset({ invoice: EMPTY_INVOICE });
                              }}
                              title="ไม่ต้องการใบกำกับภาษี"
                              subtitle="ออกใบเสร็จรับเงินอย่างย่อให้อัตโนมัติ"
                            />
                            <MethodRadio
                              selected={wantsDoc === true}
                              onClick={() => {
                                setWantsDoc(true);
                                if (!invoiceFilled) {
                                  setOpenSections((s) => ({
                                    ...s,
                                    invoice: true,
                                  }));
                                  setTimeout(
                                    () =>
                                      invoiceZoneRef.current?.scrollIntoView({
                                        behavior: "smooth",
                                        block: "start",
                                      }),
                                    50,
                                  );
                                }
                              }}
                              title="ต้องการใบเสร็จ / ใบกำกับภาษี"
                              subtitle="กรอกข้อมูลในการออกเอกสาร"
                            />
                          </div>
                        </div>

                        {/* prompt to fill invoice data in left zone */}
                        {/* {wantsDoc === true && !formState.request_invoice && !invoiceFilled && (
                        <div className="rounded-9e-md border border-orange-400 bg-orange-50 p-3 text-sm text-orange-700">
                          กรุณากรอกข้อมูลสำหรับออกเอกสารในโซนด้านซ้าย
                        </div>
                      )} */}

                        {/* เลือกช่องทางชำระเงิน — only after document choice */}
                        {wantsDoc !== null && (
                          <>
                            <div>
                              <h3 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">
                                เลือกช่องทางชำระเงิน
                              </h3>
                              <div className="grid grid-cols-2 gap-2">
                                <ChannelCard
                                  selected={channel === "promptpay"}
                                  onClick={() => setChannel("promptpay")}
                                  Icon={QrCode}
                                  label="PromptPay QR"
                                />
                                {/* <ChannelCard
                                  selected={channel === "credit_card"}
                                  onClick={() => setChannel("credit_card")}
                                  Icon={CreditCard}
                                  label="บัตรเครดิต/เดบิต"
                                /> */}
                              </div>
                            </div>

                            {/* {channel === 'promptpay' && (
                            <p className="rounded-9e-md bg-9e-brand/5 p-3 text-xs text-gray-500 dark:text-gray-400">
                              กด &quot;ยืนยันการสมัครและชำระด้วย PromptPay&quot; เพื่อสร้าง QR สำหรับสแกนชำระเงิน
                            </p>
                          )}
                          {channel === 'credit_card' && (
                            <p className="rounded-9e-md bg-9e-brand/5 p-3 text-xs text-gray-500 dark:text-gray-400">
                              กด &quot;ยืนยัน&quot; เพื่อเปิดฟอร์มกรอกข้อมูลบัตรในโซนด้านซ้าย
                            </p>
                          )} */}

                            {/* เงื่อนไขการชำระเงิน */}
                            {channel && (
                              <div>
                                <h3 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">
                                  เงื่อนไขการชำระเงิน
                                </h3>
                                <label className="flex cursor-pointer items-start gap-3 text-sm text-9e-navy dark:text-white">
                                  <input
                                    type="checkbox"
                                    checked={allConsented}
                                    onChange={(e) =>
                                      setAllConsented(e.target.checked)
                                    }
                                    className="mt-0.5 h-4 w-4 shrink-0 accent-9e-brand"
                                  />
                                  <span className="leading-5">
                                    ข้าพเจ้าได้ตรวจสอบข้อมูลและยอมรับ{" "}
                                    <button
                                      type="button"
                                      onClick={() => setTermsModalOpen(true)}
                                      className="font-semibold text-9e-action underline underline-offset-2 hover:text-9e-brand"
                                    >
                                      เงื่อนไขการสมัครและการชำระเงิน
                                    </button>
                                  </span>
                                </label>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}

                    {/* Quote path — consent only */}
                    {method === "quote" && (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">
                          เงื่อนไข
                        </h3>
                        <label className="flex cursor-pointer items-start gap-3 text-sm text-9e-navy dark:text-white">
                          <input
                            type="checkbox"
                            checked={allConsented}
                            onChange={(e) => setAllConsented(e.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-9e-brand"
                          />
                          <span className="leading-5">
                            ข้าพเจ้าได้ตรวจสอบข้อมูลและยอมรับ{" "}
                            <button
                              type="button"
                              onClick={() => setTermsModalOpen(true)}
                              className="font-semibold text-9e-action underline underline-offset-2 hover:text-9e-brand"
                            >
                              เงื่อนไขการสมัครและการชำระเงิน
                            </button>
                          </span>
                        </label>
                      </div>
                    )}

                    {/* Errors */}
                    {(submitError || payError) && (
                      <div className="rounded-9e-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
                        {submitError || payError}
                      </div>
                    )}

                    {/* Confirm button — shown on all breakpoints for instant; quote uses bottom bar */}
                    {/* Instant path — show when channel selected */}
                    {method === "instant" && channel && (
                      <button
                        type="button"
                        onClick={handleStep2Confirm}
                        disabled={!canStep2Confirm || submitting}
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-9e-lime py-3 text-sm font-bold text-9e-navy transition-colors hover:bg-9e-lime/80 disabled:opacity-50"
                      >
                        {submitting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />{" "}
                            กำลังดำเนินการ…
                          </>
                        ) : (
                          <>
                            <Lock size={14} />
                            {channel === "credit_card"
                              ? "ยืนยันการสมัครและชำระด้วยบัตร"
                              : "ยืนยันการสมัครและชำระด้วย PromptPay"}
                          </>
                        )}
                      </button>
                    )}
                    {/* Quote path — desktop confirm button (mobile uses bottom bar) */}
                    {method === "quote" && (
                      <button
                        type="button"
                        onClick={handleStep2Confirm}
                        disabled={!canStep2Confirm || submitting}
                        className="hidden w-full items-center justify-center gap-2 rounded-full bg-9e-lime py-3 text-sm font-bold text-9e-navy transition-colors hover:bg-9e-lime/80 lg:flex"
                      >
                        {submitting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />{" "}
                            กำลังดำเนินการ…
                          </>
                        ) : (
                          "ยืนยันการขอใบเสนอราคา"
                        )}
                      </button>
                    )}
                  </>
                )}

                {/* Payment status widget (after a charge/panel has started) */}
                {paymentStarted && (
                  <div className="hidden rounded-2xl border border-[var(--surface-border)] bg-white p-4 shadow-sm dark:bg-[#111d2c] lg:block ">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-9e-navy dark:text-white">
                      {channel === "promptpay" ? (
                        <QrCode size={16} />
                      ) : (
                        <CreditCard size={16} />
                      )}
                      สถานะการชำระเงิน
                    </h3>
                    <div className="space-y-1.5 text-sm">
                      <p className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-9e-action" />
                        วิธี:{" "}
                        {channel === "promptpay"
                          ? "PromptPay QR"
                          : "บัตรเครดิต"}
                      </p>
                      <p className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        สถานะ: รอการชำระเงิน
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        paymentPanelRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                      className="mt-3 w-full rounded-full border border-[var(--surface-border)] py-2.5 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white"
                    >
                      เลื่อนไปดู Payment Panel
                    </button>
                  </div>
                )}

                {/* Back button — hidden on mobile (use bottom bar instead) */}
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setMethod(null);
                    setChannel(null);
                    setQrCharge(null);
                    setWantsDoc(null);
                    setPaymentStarted(false);
                    registeredRef.current = null;
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  disabled={submitting}
                  className="hidden w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-gray-500 hover:bg-9e-ice dark:hover:bg-white/5 lg:flex"
                >
                  <ArrowLeft size={14} /> ย้อนกลับไปแก้ไขข้อมูล
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2 Mobile bottom bar ── */}
        {step === 2 && !result && (
          <Step2MobileBar
            pricing={pricing}
            canStep2Confirm={canStep2Confirm}
            submitting={submitting}
            method={method}
            onConfirm={handleStep2Confirm}
            onBack={() => {
              setStep(1);
              setMethod(null);
              setChannel(null);
              setQrCharge(null);
              setWantsDoc(null);
              setPaymentStarted(false);
              registeredRef.current = null;
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        {/* ── STEP 3 — Success ── */}
        {step === 3 && (
          <div className="mx-auto max-w-md py-16 text-center">
            {/* Icon */}
            <CheckCircle2 size={56} className="mx-auto text-green-500" />

            {/* Title */}
            <h2 className="mt-4 text-2xl font-bold text-9e-navy dark:text-white">
              {result?.kind === "quote"
                ? "ส่งคำขอใบเสนอราคาแล้ว!"
                : "ชำระเงินสำเร็จ!"}
            </h2>

            {/* Amount — paid only */}
            {result?.amount && (
              <p className="mt-2 text-lg font-bold text-9e-action">
                {formatTHB(result.amount)} บาท
              </p>
            )}

            {/* Summary rows */}
            <div className="mt-6 rounded-2xl border border-[var(--surface-border)] bg-white p-5 text-left shadow-sm dark:bg-[#111d2c] space-y-3">
              {/* Payment method — paid only */}
              {result?.kind === "paid" && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    วิธีชำระเงิน
                  </span>
                  <span className="font-semibold text-9e-navy dark:text-white flex items-center gap-1.5">
                    {result.method === "promptpay" ? (
                      <>
                        {/* QR icon */}
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-9e-brand"
                        >
                          <rect x="3" y="3" width="7" height="7" />
                          <rect x="14" y="3" width="7" height="7" />
                          <rect x="3" y="14" width="7" height="7" />
                          <path d="M14 14h3v3" />
                          <path d="M17 17h3" />
                          <path d="M20 14v3" />
                        </svg>
                        QR PromptPay
                      </>
                    ) : (
                      <>
                        {/* Card icon */}
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-9e-brand"
                        >
                          <rect x="1" y="4" width="22" height="16" rx="2" />
                          <line x1="1" y1="10" x2="23" y2="10" />
                        </svg>
                        บัตรเครดิต / เดบิต
                      </>
                    )}
                  </span>
                </div>
              )}

              {/* Invoice */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {result?.kind === "quote"
                    ? "ใบเสนอราคา"
                    : "ใบเสร็จ / ใบกำกับภาษี"}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    result?.requestInvoice
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
                  )}
                >
                  {result?.requestInvoice ? "✓ ขอรับเอกสาร" : "— ไม่ขอรับ"}
                </span>
              </div>

              {/* Email confirmation */}
              <div className="flex items-start justify-between text-sm border-t border-[var(--surface-border)] pt-3">
                <span className="text-gray-500 dark:text-gray-400">
                  อีเมลยืนยัน
                </span>
                <span className="font-medium text-9e-navy dark:text-white text-right max-w-[55%] break-all">
                  {formState?.email}
                </span>
              </div>

              <p className="mt-4 border-t border-[var(--surface-border)] pt-4 text-sm leading-relaxed text-9e-navy dark:text-gray-500">
                <span className="font-semibold text-9e-navy dark:text-white">
                  หมายเหตุ:
                </span>{" "}
                ระบบได้จัดส่งรายละเอียดไปยังอีเมลของท่านแล้ว หากไม่พบใน Inbox
                กรุณาตรวจสอบใน Junk Mail หรือ Spam Mail
              </p>
            </div>

            {/* CTA */}
            <Link
              href="https://www.9experttraining.com/"
              className="mt-8 inline-block rounded-full bg-9e-action px-8 py-3 text-sm font-semibold text-white hover:bg-9e-brand transition-colors"
            >
              กลับหน้า Home
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

// ── Terms & conditions modal ──────────────────────────────────────────────────
function TermsModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="เงื่อนไขการสมัครและการชำระเงิน"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="relative z-[60] w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--surface-border)] bg-white p-6 shadow-xl dark:bg-[#111d2c]">
        <h2 className="text-base font-bold text-9e-navy dark:text-white mb-4">
          เงื่อนไขการสมัครและการชำระเงิน
        </h2>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <p>
            <strong className="text-9e-navy dark:text-white">
              1. การตรวจสอบข้อมูล
            </strong>
            <br />
            ผู้สมัครรับผิดชอบในการตรวจสอบความถูกต้องของข้อมูลการสมัครก่อนยืนยัน
          </p>
          <p>
            <strong className="text-9e-navy dark:text-white">
              2. นโยบายการคืนเงิน
            </strong>
            <br />
            บริษัทไม่มีนโยบายคืนเงินหลังจากชำระเงินแล้วในทุกกรณี
          </p>
          <p>
            <strong className="text-9e-navy dark:text-white">
              3. การเลื่อน / เปลี่ยนแปลงรอบอบรม
            </strong>
            <br />
            ผู้สมัครสามารถขอเลื่อนรอบอบรมได้ล่วงหน้าไม่น้อยกว่า 7 วันทำการ
            ทั้งนี้ขึ้นอยู่กับที่นั่งว่างของรอบที่ต้องการเปลี่ยน
          </p>
          <p>
            <strong className="text-9e-navy dark:text-white">
              4. เงื่อนไขการอบรม
            </strong>
            <br />
            ผู้สมัครยินยอมปฏิบัติตามกฎระเบียบและเงื่อนไขการอบรมของ 9Expert
            Training ตลอดระยะเวลาการอบรม
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-9e-action py-2.5 text-sm font-semibold text-white hover:bg-9e-brand"
        >
          รับทราบและปิด
        </button>
      </div>
    </div>
  );
}

// ── Shared atoms ──────────────────────────────────────────────────────────────
function Section({ title, children, collapsible, open, onToggle }) {
  if (collapsible) {
    return (
      <section className="mt-5 rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center justify-between text-left"
        >
          <h3 className="text-base font-bold text-9e-navy dark:text-white">
            {title}
          </h3>
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-9e-navy dark:text-white" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-9e-navy dark:text-white" />
          )}
        </button>
        {open && <div className="mt-3">{children}</div>}
      </section>
    );
  }
  return (
    <section className="mt-5 rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
      <h3 className="mb-3 text-base font-bold text-9e-navy dark:text-white">
        {title}
      </h3>
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
      <div className="text-sm text-9e-navy dark:text-white">{value || "—"}</div>
    </div>
  );
}
