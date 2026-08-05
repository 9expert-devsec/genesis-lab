"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Loader2,
  Lock,
  QrCode,
} from "lucide-react";
import { formatTHB } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import {
  ChannelCard,
  MethodRadio,
  SummaryLine,
} from "@/components/payment/PaymentAtoms";
import { cardIsValid } from "@/components/payment/card";
import { consentFanOut } from "@/components/payment/consent";
import { CardPanelFull } from "@/components/payment/CardPanelFull";
import { QrPanelFull } from "@/components/payment/QrPanelFull";
import { Step2MobileBar } from "@/components/payment/Step2MobileBar";
import { TermsModal } from "@/components/payment/TermsModal";
import { AttendeeListView, InvoiceView, ReadOnlyRow } from "./PreviewRows";

const CHARGE_URL = "/api/registration/public/charge";
const STATUS_URL = "/api/registration/public/status";
const POLL_MS = 3000;
const POLL_CAP_MS = 600000; // ~10 min, matches the QR lifetime
const QR_SECONDS = 600;

/**
 * Step 2 with online payment enabled: review on the left, a sticky
 * method/channel/consent card on the right, and the QR or card panel taking
 * over the left column once the user commits.
 *
 * The registration API is ONE-SHOT: a single POST to
 * /api/registration/public/charge carries the whole form body and creates the
 * registration AND the charge together. There is no separate register call and
 * therefore no dedup ref — every confirm press that reaches the network creates
 * a registration.
 */
export function ReviewAndPayStep({
  data,
  pricing,
  onBack,
  onQuoteConfirm,
  onPaid,
  submitting,
  error,
}) {
  const [method, setMethod] = useState(null); // 'instant' | 'quote'
  const [channel, setChannel] = useState(null); // 'promptpay' | 'credit_card'
  const [consented, setConsented] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);

  const [card, setCard] = useState({
    number: "",
    name: "",
    expiry: "",
    cvc: "",
  });
  const [omiseReady, setOmiseReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState(null);

  const [paymentStarted, setPaymentStarted] = useState(false);
  const [qrCharge, setQrCharge] = useState(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(QR_SECONDS);
  const [pendingTarget, setPendingTarget] = useState(null);

  const [openSections, setOpenSections] = useState({
    course: true,
    coordinator: false,
    attendees: false,
    invoice: false,
    notes: false,
  });
  const toggleSection = useCallback((key) => {
    setOpenSections((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  // Anchor for scrolling to the left-column payment panel once it appears.
  const paymentPanelRef = useRef(null);
  const scrollToPanel = useCallback(() => {
    paymentPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const cardValid = cardIsValid(card);
  const coord = data.coordinator ?? {};

  // One checkbox on screen, four flags on the wire — see consentFanOut.
  const consentPayload = consentFanOut(consented);

  // ── Omise.js — loaded lazily when the card channel is selected ───────────
  useEffect(() => {
    if (channel !== "credit_card") return;
    const pk = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;
    function configure() {
      try {
        if (window.Omise && pk) {
          window.Omise.setPublicKey(pk);
          setOmiseReady(true);
        }
      } catch {
        // leave omiseReady false — the charge button stays disabled
      }
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

  // ── Settlement polling (PromptPay + async card) ──────────────────────────
  useEffect(() => {
    if (!pendingTarget?.id) return;
    const start = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - start > POLL_CAP_MS) {
        clearInterval(timer);
        setQrExpired(true);
        setBusy(false);
        return;
      }
      try {
        const res = await fetch(
          `${STATUS_URL}?id=${encodeURIComponent(pendingTarget.id)}`,
          { cache: "no-store" },
        );
        const body = await res.json().catch(() => ({}));
        if (body?.status === "paid") {
          clearInterval(timer);
          onPaid({
            referenceNumber: pendingTarget.referenceNumber,
            amount: pendingTarget.amount,
            method: pendingTarget.method,
          });
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pendingTarget, onPaid]);

  // ── QR countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!qrCharge?.qrUrl || qrExpired) return;
    const t = setInterval(() => {
      setQrSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setQrExpired(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [qrCharge, qrExpired]);

  /** One-shot POST — creates the registration and the charge together. */
  async function postCharge(extra) {
    const res = await fetch(CHARGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, ...extra, consent: consentPayload }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && body.ok, body };
  }

  /**
   * Create a PromptPay charge. This POST always creates a NEW registration —
   * the endpoint is one-shot and has no dedup key — so when the user regenerates
   * an expired QR, `supersedes` carries the id of the registration being
   * replaced. Purely an audit annotation: the server writes it down and nothing
   * reads it back. The first charge of a session passes nothing.
   */
  async function createQr(supersedes = null) {
    setPayError(null);
    setBusy(true);
    try {
      const { ok, body } = await postCharge({
        paymentMethod: "promptpay",
        ...(supersedes ? { supersedesRegistrationId: supersedes } : {}),
      });
      if (!ok) {
        setBusy(false);
        setPayError(body?.message || "สร้าง QR ไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      setQrCharge(body);
      setQrSecondsLeft(QR_SECONDS);
      setQrExpired(false);
      setPendingTarget({
        id: body.registrationId,
        referenceNumber: body.referenceNumber,
        amount: body.amount,
        method: "promptpay",
      });
      setPaymentStarted(true);
      setBusy(false);
      // Defer until the left-column panel has rendered.
      setTimeout(scrollToPanel, 50);
    } catch {
      setBusy(false);
      setPayError("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่");
    }
  }

  /** Tokenise with Omise.js, then charge. Driven by CardPanelFull's button. */
  function payCard() {
    setPayError(null);
    if (!window.Omise || !omiseReady) {
      setPayError("ระบบชำระเงินยังไม่พร้อม กรุณารอสักครู่แล้วลองใหม่");
      return;
    }
    const [em, ey] = card.expiry.split("/");
    setBusy(true);
    window.Omise.createToken(
      "card",
      {
        name: card.name,
        number: card.number.replace(/\s+/g, ""),
        expiration_month: Number(em),
        expiration_year: 2000 + Number(ey),
        security_code: card.cvc,
      },
      async (statusCode, response) => {
        if (statusCode !== 200) {
          setBusy(false);
          setPayError(response?.message || "ข้อมูลบัตรไม่ถูกต้อง กรุณาตรวจสอบ");
          return;
        }
        try {
          const { ok, body } = await postCharge({
            paymentMethod: "credit_card",
            omiseToken: response.id,
          });
          if (!ok) {
            setBusy(false);
            setPayError(body?.message || "การชำระเงินไม่สำเร็จ กรุณาลองใหม่");
            return;
          }
          if (body.paid) {
            onPaid({
              referenceNumber: body.referenceNumber,
              amount: body.amount,
              method: "credit_card",
            });
            return;
          }
          if (body.authorizeUrl) {
            // 3DS / bank authorization — hand off to Omise. The user returns
            // to /registration/payment/complete, which polls until settled.
            window.location.href = body.authorizeUrl;
            return;
          }
          // Async capture with no redirect — fall back to status polling.
          setPendingTarget({
            id: body.registrationId,
            referenceNumber: body.referenceNumber,
            amount: body.amount,
            method: "credit_card",
          });
        } catch {
          setBusy(false);
          setPayError("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่");
        }
      },
    );
  }

  function handleConfirm() {
    // The quote path posts through the wizard's own submit, so the consent the
    // customer just ticked travels up with it — same fanned-out shape the
    // charge path sends, so the two never record acceptance differently.
    if (method === "quote") return onQuoteConfirm(consentPayload);
    if (method !== "instant" || !channel) return;
    if (channel === "promptpay") return createQr();
    // Card: reveal the card panel on the left; the charge happens there.
    setPaymentStarted(true);
    setTimeout(scrollToPanel, 50);
  }

  const canConfirm =
    method === "quote"
      ? consented
      : method === "instant"
        ? Boolean(channel) && consented && Boolean(pricing)
        : false;

  const workingNow = busy || submitting;

  const consentCheckbox = (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-9e-navy dark:text-white">
      <input
        type="checkbox"
        checked={consented}
        onChange={(e) => setConsented(e.target.checked)}
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
  );

  return (
    <>
      <TermsModal
        open={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
      />

      <div className="grid grid-cols-1 gap-6 pb-24 lg:grid-cols-[1fr_minmax(340px,400px)] lg:items-start lg:pb-0">
        {/* LEFT — review + payment panel */}
        <div className="space-y-5">
          <h2 className="text-lg font-bold text-9e-navy dark:text-white">
            ตรวจสอบข้อมูล
          </h2>

          <Section
            title="ข้อมูลคอร์ส"
            collapsible
            open={openSections.course}
            onToggle={() => toggleSection("course")}
          >
            <div className="space-y-3">
              <ReadOnlyRow label="หลักสูตร" value={data.courseName} />
              <ReadOnlyRow
                label="รหัสคอร์ส"
                value={data.courseCode || data.courseId}
              />
              <ReadOnlyRow label="รอบอบรม" value={data.classDate || "—"} />
              {data.scheduleType === "hybrid" && (
                <ReadOnlyRow
                  label="รูปแบบการอบรม"
                  value={
                    data.attendanceMode === "teams"
                      ? "Online via Microsoft Teams"
                      : "Classroom"
                  }
                />
              )}
            </div>
          </Section>

          <Section
            title="ข้อมูลผู้ประสานงาน"
            collapsible
            open={openSections.coordinator}
            onToggle={() => toggleSection("coordinator")}
          >
            <div className="space-y-3">
              <ReadOnlyRow
                label="ชื่อ-นามสกุล"
                value={`${coord.firstName ?? ""} ${coord.lastName ?? ""}`.trim()}
              />
              <ReadOnlyRow label="อีเมล" value={coord.email} />
              <ReadOnlyRow label="เบอร์โทร" value={coord.phone} />
              {coord.lineId && (
                <ReadOnlyRow label="LINE ID" value={coord.lineId} />
              )}
              <ReadOnlyRow
                label="ผู้ประสานงานเข้าอบรม"
                value={coord.isAttending ? "ใช่" : "ไม่"}
              />
            </div>
          </Section>

          <Section
            title={`ข้อมูลผู้เข้าอบรม (${data.attendeesCount} ท่าน)`}
            collapsible
            open={openSections.attendees}
            onToggle={() => toggleSection("attendees")}
          >
            <AttendeeListView data={data} />
          </Section>

          {data.invoice && (
            <Section
              title="ใบเสนอราคา / ใบกำกับภาษี"
              collapsible
              open={openSections.invoice}
              onToggle={() => toggleSection("invoice")}
            >
              <div className="space-y-3">
                <InvoiceView invoice={data.invoice} />
              </div>
            </Section>
          )}

          {data.notes && (
            <Section
              title="หมายเหตุ"
              collapsible
              open={openSections.notes}
              onToggle={() => toggleSection("notes")}
            >
              <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                {data.notes}
              </p>
            </Section>
          )}

          {/* Payment panel zone — takes over once the user commits. */}
          <div ref={paymentPanelRef}>
            {paymentStarted && channel === "promptpay" && qrCharge?.qrUrl && (
              <QrPanelFull
                charge={qrCharge}
                pricing={pricing}
                expired={qrExpired}
                secondsLeft={qrSecondsLeft}
                // Wrapped, not passed bare: QrPanelFull wires this straight to
                // onClick, so `createQr` would receive a MouseEvent as its
                // `supersedes` argument.
                onRegenerate={() => createQr(pendingTarget?.id ?? null)}
              />
            )}
            {paymentStarted && channel === "credit_card" && (
              <CardPanelFull
                card={card}
                setCard={setCard}
                pricing={pricing}
                onCharge={payCard}
                onChangeMethod={() => {
                  setChannel(null);
                  setPaymentStarted(false);
                }}
                submitting={workingNow}
                processing={Boolean(pendingTarget)}
                payError={payError}
                cardValid={cardValid}
                omiseReady={omiseReady}
              />
            )}
          </div>
        </div>

        {/* RIGHT — sticky method / channel / consent card */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div
            className={cn(
              "flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]",
              paymentStarted && "hidden lg:block",
            )}
          >
            {/* สรุปยอด — hidden on mobile (the bottom bar carries it there) */}
            {pricing && (
              <div className="hidden lg:block">
                <h3 className="mb-3 text-base font-bold text-9e-navy dark:text-white">
                  สรุปยอด
                </h3>
                <div className="space-y-2 text-sm">
                  <SummaryLine
                    label={`ราคาต่อท่าน × ${pricing.seats}`}
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
            )}

            {/* No price for this round — shown on every breakpoint, since the
                mobile bottom bar has no amount to fall back on. */}
            {!pricing && (
              <p className="text-sm text-red-500">
                ไม่สามารถคำนวณราคาได้ กรุณาเลือกขอใบเสนอราคา หรือ ติดต่อทีมงาน
              </p>
            )}

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
                      disabled={!pricing}
                      onClick={() => setMethod("instant")}
                      title="ชำระทันที"
                      subtitle="ชำระผ่าน PromptPay QR หรือบัตรเครดิต/เดบิต"
                    />
                    <MethodRadio
                      selected={method === "quote"}
                      onClick={() => {
                        setMethod("quote");
                        setChannel(null);
                      }}
                      title="ขอใบเสนอราคา"
                      subtitle="เหมาะสำหรับบริษัทที่ต้องใช้เอกสารก่อนชำระเงิน"
                    />
                  </div>
                  {!pricing && (
                    <p className="mt-2 text-xs text-amber-700">
                      * ราคายังไม่พร้อม สามารถเลือกขอใบเสนอราคาได้
                    </p>
                  )}
                </div>

                {method === "instant" && (
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
                        <ChannelCard
                          selected={channel === "credit_card"}
                          onClick={() => setChannel("credit_card")}
                          Icon={CreditCard}
                          label="บัตรเครดิต/เดบิต"
                        />
                      </div>
                    </div>

                    {channel && (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">
                          เงื่อนไขการชำระเงิน
                        </h3>
                        {consentCheckbox}
                      </div>
                    )}
                  </>
                )}

                {method === "quote" && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-9e-navy dark:text-white">
                      เงื่อนไข
                    </h3>
                    {consentCheckbox}
                  </div>
                )}

                {/* Errors */}
                {(payError || (error && method === "quote")) && (
                  <div className="rounded-9e-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
                    {payError || error}
                  </div>
                )}

                {/* Instant confirm — shown once a channel is picked */}
                {method === "instant" && channel && (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!canConfirm || workingNow}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-9e-lime py-3 text-sm font-bold text-9e-navy transition-colors hover:bg-9e-lime/80 disabled:opacity-50"
                  >
                    {workingNow ? (
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

                {/* Quote confirm — desktop only; mobile uses the bottom bar */}
                {method === "quote" && (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!canConfirm || workingNow}
                    className="hidden w-full items-center justify-center gap-2 rounded-full bg-9e-lime py-3 text-sm font-bold text-9e-navy transition-colors hover:bg-9e-lime/80 disabled:opacity-50 lg:flex"
                  >
                    {workingNow ? (
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

            {/* Payment status — after a panel/charge has started */}
            {paymentStarted && (
              <div className="hidden rounded-2xl border border-[var(--surface-border)] bg-white p-4 shadow-sm dark:bg-[#111d2c] lg:block">
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
                    วิธี: {channel === "promptpay" ? "PromptPay QR" : "บัตรเครดิต"}
                  </p>
                  <p className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    สถานะ: รอการชำระเงิน
                  </p>
                </div>
                <button
                  type="button"
                  onClick={scrollToPanel}
                  className="mt-3 w-full rounded-full border border-[var(--surface-border)] py-2.5 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white"
                >
                  เลื่อนไปดู Payment Panel
                </button>

                {process.env.NEXT_PUBLIC_PAYMENT_TEST_MODE === "true" &&
                  pendingTarget?.id && (
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch("/api/registration/public/dev-mark-paid", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: pendingTarget.id }),
                        });
                        // the 3s poll sees status:'paid' → onPaid → step 3
                      }}
                      className="mx-auto mt-2 block rounded-9e-md border border-dashed border-amber-500/60 px-3 py-1.5 text-xs text-amber-600"
                    >
                      [DEV] จำลองว่าชำระเงินแล้ว
                    </button>
                  )}
              </div>
            )}

            {/* Back — hidden on mobile (the bottom bar carries it there) */}
            <button
              type="button"
              onClick={onBack}
              disabled={workingNow}
              className="hidden w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-gray-500 hover:bg-9e-ice dark:hover:bg-white/5 lg:flex"
            >
              <ArrowLeft size={14} /> ย้อนกลับไปแก้ไขข้อมูล
            </button>
          </div>
        </div>
      </div>

      <Step2MobileBar
        pricing={pricing}
        canStep2Confirm={canConfirm}
        submitting={workingNow}
        method={method}
        onConfirm={handleConfirm}
        onBack={onBack}
        perSeatLabel="ราคาต่อท่าน"
      />
    </>
  );
}

/** Collapsible review section — the masterclass step-2 card shape. */
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
