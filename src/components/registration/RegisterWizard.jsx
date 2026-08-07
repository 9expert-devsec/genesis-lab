"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  Monitor,
} from "lucide-react";
import { SuccessPulseIcon } from "@/components/ui/SuccessPulseIcon";
import {
  publicRegistrationSchema,
  publicRegistrationDefaults,
} from "@/lib/schemas/register-public";
import { computePricing, formatTHB } from "@/lib/pricing";
import { ScheduleCarousel } from "@/components/registration/ScheduleCarousel";
import { CoordinatorFields } from "@/components/registration/CoordinatorFields";
import { AttendeesList } from "@/components/registration/AttendeesList";
import { InvoiceFields } from "@/components/registration/InvoiceFields";
import { ReviewAndPayStep } from "@/components/registration/ReviewAndPayStep";
import {
  AttendeeListView,
  InvoiceView,
  ReadOnlyRow,
} from "@/components/registration/PreviewRows";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "registration-public-v3";
const RESULT_KEY = "registration-public-result-v3";
const FORMDATA_KEY = "registration-public-formdata-v1";

const THAI_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function formatClassDates(dates) {
  if (!dates?.length) return "";
  const sorted = [...dates].sort();
  const start = new Date(sorted[0]);
  const end = new Date(sorted[sorted.length - 1]);
  const year = start.getFullYear() + 543;
  if (sorted.length === 1) {
    return `${start.getDate()} ${THAI_MONTHS[start.getMonth()]} ${year}`;
  }
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}-${end.getDate()} ${THAI_MONTHS[start.getMonth()]} ${year}`;
  }
  return `${start.getDate()} ${THAI_MONTHS[start.getMonth()]} - ${end.getDate()} ${THAI_MONTHS[end.getMonth()]} ${year}`;
}

export function RegisterWizard({
  course,
  schedules,
  initialClassId,
  earlyBirdScheduleId = null,
  step = 1,
  basePath = "/registration/public",
  // Where "← กลับไปดูหลักสูตร" returns to. Resolved by RegisterPageContent,
  // which holds the course object. Defaults to the catalog so a caller that
  // omits it degrades to the old behaviour rather than rendering href={undefined}.
  courseDetailHref = "/training-course",
  omisePaymentEnabled = false,
  coursePrice = null,
  priceByScheduleId = {},
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentStep, setCurrentStep] = useState(step);
  const [formData, setFormData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);
  const [restoredFromStorage, setRestoredFromStorage] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // Build a step URL that preserves the course/class query params so the
  // path stays shareable and survives a refresh.
  const stepHref = useCallback(
    (n) => {
      const params = new URLSearchParams(searchParams.toString());
      const q = params.toString();
      return `${basePath}/step-${n}${q ? `?${q}` : ""}`;
    },
    [basePath, searchParams],
  );

  // Display-only pricing for the selected round. The server recomputes
  // authoritatively on charge — this is purely for the summary screen.
  const pricing = useMemo(() => {
    if (!formData) return null;
    const raw = priceByScheduleId[formData.classId] ?? coursePrice ?? null;
    const perSeat = raw == null ? null : Number(raw);
    if (perSeat == null || !Number.isFinite(perSeat) || perSeat <= 0)
      return null;
    try {
      return computePricing(perSeat, formData.attendeesCount ?? 1);
    } catch {
      return null;
    }
  }, [formData, priceByScheduleId, coursePrice]);

  // Keep the rendered step in sync with the URL-derived prop. Each step is
  // its own route, so this normally just confirms the value on mount.
  useEffect(() => {
    setCurrentStep(step);
  }, [step]);

  // On mount, rehydrate from sessionStorage. Because each step is its own
  // route, navigating between steps remounts this component and clears
  // in-memory state — the draft (and the success result) live in storage.
  useEffect(() => {
    // Clear any stale drafts from previous schema versions
    try {
      sessionStorage.removeItem("registration-public-v1");
    } catch {}
    try {
      sessionStorage.removeItem("registration-public-v2");
    } catch {}

    let draft = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.courseId === course.course_id) {
          draft = parsed;
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // ignore corrupted storage
    }
    setRestoredFromStorage(draft);

    // Rehydrate the confirmed Step-1 payload. "แก้ไข" (back) and a refresh
    // both remount this component, wiping React state — restoring formData
    // from its own key is what keeps every field the user entered intact on
    // step 2 and on the way back to step 1.
    try {
      const rawForm = sessionStorage.getItem(FORMDATA_KEY);
      if (rawForm) {
        const parsed = JSON.parse(rawForm);
        if (parsed?.courseId === course.course_id) {
          setFormData(parsed);
        } else {
          sessionStorage.removeItem(FORMDATA_KEY);
        }
      }
    } catch {
      // ignore corrupted storage
    }

    if (step === 3) {
      // Thank-you screen needs the API result + the email it was sent to.
      try {
        const rawRes = sessionStorage.getItem(RESULT_KEY);
        if (rawRes) {
          const saved = JSON.parse(rawRes);
          if (saved?.result) {
            setResult(saved.result);
            if (saved.formData) setFormData(saved.formData);
          }
        }
      } catch {
        // ignore corrupted storage
      }
    } else if (step === 1) {
      // Fresh start on step 1 — drop any stale success result. The unified
      // step-2 page is stateless across remounts on purpose (a refresh
      // returns a fresh page and never auto-creates a charge).
      try {
        sessionStorage.removeItem(RESULT_KEY);
      } catch {}
    }

    setHydrated(true);
  }, [course.course_id, step]);

  // If the user refreshes or deep-links a later step without the data that
  // step needs (formData lost on remount, no draft in storage), silently
  // send them back to step 1 — keeping the query params.
  useEffect(() => {
    if (!hydrated) return;
    if (currentStep === 2 && !formData) {
      router.replace(stepHref(1));
    } else if (currentStep === 3 && !result) {
      router.replace(stepHref(1));
    }
  }, [hydrated, currentStep, formData, result, router, stepHref]);

  const handleFormSubmit = (data) => {
    setFormData(data);
    // Persist the validated payload so the remounted step-2 route — and a
    // later "แก้ไข" back to step 1 — can restore every field the user entered.
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
    try {
      sessionStorage.setItem(FORMDATA_KEY, JSON.stringify(data));
    } catch {}
    setCurrentStep(2);
    router.push(stepHref(2));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setSubmitError(null);
    setCurrentStep(1);
    router.push(stepHref(1));
  };

  /**
   * Quote submission. `consent` is the fanned-out object ReviewAndPayStep
   * passes up when its checkbox is ticked; StepPreview (toggle OFF) shows no
   * checkbox and calls this with nothing, so its request body is unchanged.
   */
  const handleConfirm = async (consent) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/registration/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(consent ? { ...formData, consent } : formData),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(
          body?.message ||
            (body?.error === "validation"
              ? "ข้อมูลไม่ถูกต้อง กรุณากลับไปตรวจสอบ"
              : "ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
        );
        setSubmitting(false);
        return;
      }
      // Draft + confirmed payload are consumed; persist the result so the
      // step-3 route can render it.
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
      try {
        sessionStorage.removeItem(FORMDATA_KEY);
      } catch {}
      const quoteResult = { ...body, kind: "quote" };
      try {
        sessionStorage.setItem(
          RESULT_KEY,
          JSON.stringify({ result: quoteResult, formData }),
        );
      } catch {}
      setResult(quoteResult);
      setCurrentStep(3);
      router.push(stepHref(3));
      // Keep the loading overlay up through the navigation — the fresh
      // step-3 mount resets `submitting`, so we don't clear it here.
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setSubmitError("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่");
      setSubmitting(false);
    }
  };

  // Shared success path for card + PromptPay — persist a 'paid' result
  // and advance to the step-3 receipt screen.
  const handlePaid = useCallback(
    (paid) => {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
      try {
        sessionStorage.removeItem(FORMDATA_KEY);
      } catch {}
      const paidResult = { kind: "paid", ...paid };
      try {
        sessionStorage.setItem(
          RESULT_KEY,
          JSON.stringify({ result: paidResult, formData }),
        );
      } catch {}
      setResult(paidResult);
      setCurrentStep(3);
      router.push(stepHref(3));
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [formData, router, stepHref],
  );

  return (
    <div>
      <Stepper
        currentStep={currentStep}
        omisePaymentEnabled={omisePaymentEnabled}
      />

      {currentStep === 1 && hydrated && (
        <StepForm
          course={course}
          schedules={schedules}
          initialClassId={initialClassId}
          initialValues={formData ?? restoredFromStorage}
          onSubmit={handleFormSubmit}
          earlyBirdScheduleId={earlyBirdScheduleId}
          courseDetailHref={courseDetailHref}
        />
      )}

      {/* Toggle OFF — unchanged quote preview. */}
      {currentStep === 2 && formData && !omisePaymentEnabled && (
        <StepPreview
          data={formData}
          onBack={handleBack}
          onConfirm={handleConfirm}
          submitting={submitting}
          error={submitError}
        />
      )}

      {/* Toggle ON — single review + payment page. */}
      {currentStep === 2 && formData && omisePaymentEnabled && (
        <ReviewAndPayStep
          data={formData}
          pricing={pricing}
          onBack={handleBack}
          onQuoteConfirm={handleConfirm}
          onPaid={handlePaid}
          submitting={submitting}
          error={submitError}
        />
      )}

      {currentStep === 3 && result && (
        <StepComplete result={result} email={formData?.coordinator?.email} />
      )}
    </div>
  );
}

function Stepper({ currentStep, omisePaymentEnabled = false }) {
  const steps = [
    { n: 1, label: "กรอกข้อมูล" },
    { n: 2, label: omisePaymentEnabled ? "ตรวจสอบและดำเนินการ" : "ตรวจสอบ" },
    { n: 3, label: "สำเร็จ" },
  ];
  return (
    <ol className="mb-8 flex items-center justify-center text-sm">
      {steps.map((s, i) => (
        <li key={s.n} className="flex items-center ">
          <div className="flex flex-col items-center gap-2 md:flex-row">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                currentStep === s.n
                  ? "border-9e-brand bg-9e-brand text-9e-ice"
                  : currentStep > s.n
                    ? "border-9e-brand bg-9e-brand/10 text-9e-action"
                    : "border-[var(--surface-border)] text-[var(--text-muted)]",
              )}
            >
              {currentStep > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
            </span>
            <span
              className={cn(
                "font-medium",
                currentStep >= s.n
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-muted)]",
              )}
            >
              {s.label}
            </span>
          </div>

          {i < steps.length - 1 && (
            <span className="mx-2 h-px w-8 bg-[var(--surface-border)]" />
          )}
        </li>
      ))}
    </ol>
  );
}

// ── Step 1: Form ─────────────────────────────────────────────────

export function StepForm({
  course,
  schedules,
  initialClassId,
  initialValues,
  onSubmit,
  earlyBirdScheduleId = null,
  courseDetailHref = "/training-course",
}) {
  const restoredClassId = initialValues?.classId;
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL FIRST, draft second. `initialClassId` is the ?class= param — the round
  // the user just clicked — so it must win over whatever round the stored draft
  // remembers. The other way round, picking a new round on a course you already
  // started snapped the form back to the old one.
  //
  // The draft fallback is NOT dead code: the hero CTA on the course detail page
  // links to /registration/public?course=<id> with NO &class= (CourseHero.jsx),
  // so a returning user with a draft arrives here with initialClassId null and
  // the draft is the only record of the round they had chosen. Round-specific
  // entry points (ScheduleSection, EarlyBirdBanner, the schedule/search pages)
  // all append &class=, and those are exactly the ones that must override.
  //
  // Only the round follows the URL — every typed field still comes from the
  // draft via `initialValues`, so changing rounds never clears the form.
  const [selectedScheduleId, setSelectedScheduleId] = useState(
    initialClassId || restoredClassId || "",
  );

  // Sync URL when the user picks a different round so the link is shareable
  // and survives a refresh. `replace` (not `push`) keeps the back button
  // clean; `scroll: false` prevents the page from jumping to the top.
  const handleSelectSchedule = useCallback(
    (id) => {
      setSelectedScheduleId(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set("class", id);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );
  // Open the form immediately when the user has already committed to a round;
  // otherwise make them confirm one first.
  //
  //   initialValues  — a sessionStorage draft: they filled this in before, so
  //                    the form was already revealed once. Re-open it.
  //   initialClassId — the ?class= URL param. EVERY round-specific entry point
  //                    appends it (the detail-page "ลงทะเบียนรอบที่เลือก" button,
  //                    the /schedule rows, the catalog + search cards, the
  //                    early-bird banner, the page-builder schedule section), so
  //                    its presence means the user picked a round on the way in
  //                    and re-confirming it here is a dead click.
  //
  // The one entry point that omits it is CourseHero's "ขอใบเสนอราคา Public",
  // which links to /registration/public?course=<id> with no round at all — that
  // is the path the confirm step still exists for. handleReveal and the button
  // below stay for it; nothing here auto-selects a round.
  //
  // Both signals are checked for MEMBERSHIP in `schedules`, not mere presence.
  // A round can vanish between visits — unpublished, finished, or simply outside
  // the registration page's own limit-20 fetch window while still linked from
  // the detail page. Revealing on a round that does not resolve opens the whole
  // form with nothing selected and no explanation, and the user only learns at
  // submit that they never picked one. Failing closed puts them back on the
  // carousel, which is the screen that can actually fix it.
  //
  // NOTE, deliberately: this REPLACES a bare `Boolean(initialValues)`, so it
  // also narrows pre-existing behaviour — a draft whose round has vanished no
  // longer opens the form either. That is intended, not a regression to
  // "restore". The draft itself is untouched: every typed field still restores
  // the moment the user picks a live round.
  //
  // Inline rather than via `scheduleById` — that useMemo is declared below.
  const roundExists = (id) =>
    Boolean(id) && (schedules ?? []).some((s) => s._id === id);
  const [formRevealed, setFormRevealed] = useState(
    roundExists(initialClassId) || roundExists(initialValues?.classId),
  );
  const coordinatorRef = useRef(null);
  // Tracks the very first run of the schedule-sync effect so we don't
  // overwrite a restored attendanceMode (e.g. after clicking "แก้ไข" back
  // from step 2 on a hybrid schedule) before the user ever sees it.
  const isFirstScheduleSync = useRef(true);

  const scheduleById = useMemo(() => {
    const map = new Map();
    (schedules ?? []).forEach((s) => map.set(s._id, s));
    return map;
  }, [schedules]);

  const activeSchedule = scheduleById.get(selectedScheduleId) ?? null;
  const activeDateLabel = activeSchedule
    ? formatClassDates(activeSchedule.dates)
    : "";

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(publicRegistrationSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      ...publicRegistrationDefaults,
      courseId: course.course_id,
      courseCode: course.course_id,
      courseName: course.course_name,
      classId: selectedScheduleId || "",
      classDate: activeDateLabel,
      scheduleType: activeSchedule?.type || undefined,
      attendanceMode:
        activeSchedule?.type !== "hybrid" ? "classroom" : undefined,
      attendeesListProvided: false,
      requestInvoice: true,
      ...(initialValues ?? {}),
    },
  });

  const watched = watch();

  // Sync hidden class fields when the user picks a different schedule
  useEffect(() => {
    const sch = scheduleById.get(selectedScheduleId);
    setValue("classId", sch?._id || "");
    setValue("classDate", sch ? formatClassDates(sch.dates) : "");
    // Track schedule type so the server + schema know if hybrid validation applies.
    setValue("scheduleType", sch?.type || undefined);
    // On the very first run (initial mount), keep any restored attendanceMode
    // intact — only reset it when the schedule actually changes afterwards.
    if (isFirstScheduleSync.current) {
      isFirstScheduleSync.current = false;
      return;
    }
    // Non-hybrid schedules default silently to classroom; hybrid requires a choice.
    if (sch?.type !== "hybrid") {
      setValue("attendanceMode", "classroom");
    } else {
      setValue("attendanceMode", undefined);
    }
  }, [selectedScheduleId, scheduleById, setValue]);

  // When the form is first revealed, scroll the user straight to the
  // first field they need to interact with: the attendance-mode picker
  // on hybrid schedules, or the coordinator section otherwise.
  useEffect(() => {
    if (!formRevealed) return;
    const timer = setTimeout(() => {
      const target =
        activeSchedule?.type === "hybrid"
          ? document.querySelector('[data-section="attendance-mode"]')
          : coordinatorRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(timer);
  }, [formRevealed, activeSchedule?.type]);

  // Always initialise the invoice skeleton on mount — invoice section is always visible.
  useEffect(() => {
    if (!watch("invoice")) {
      setValue("invoice", {
        type: "individual",
        country: "TH",
        firstName: "",
        lastName: "",
        companyName: "",
        // branchType/branchCode/branchFree, NOT `branch` — that path is legacy
        // read-only. Seeding the old key here would put the skeleton out of
        // step with BranchFields and with the admin action's allowlist, and
        // nothing would report the mismatch.
        branchType: "head_office",
        branchCode: "",
        branchFree: "",
        taxId: "",
        thaiAddress: {
          addressLine: "",
          subDistrict: "",
          district: "",
          province: "",
          postalCode: "",
        },
        internationalAddress: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist draft to sessionStorage on every change.
  // Guard: skip the very first render (when watched still equals defaultValues)
  // so we don't overwrite a restored draft with an empty skeleton.
  const isFirstDraftWrite = useRef(true);
  useEffect(() => {
    if (isFirstDraftWrite.current) {
      isFirstDraftWrite.current = false;
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(watched));
    } catch {
      // storage full / disabled — ignore
    }
  }, [watched]);

  const handleReveal = () => {
    if (!selectedScheduleId) return;
    setFormRevealed(true);
  };

  return (
    <form
      className="space-y-8"
      onSubmit={handleSubmit(onSubmit, () => {
        // Scroll to the first invalid field so the user can see what needs fixing
        setTimeout(() => {
          const firstError = document.querySelector(
            '[aria-invalid="true"], [data-error="true"]',
          );
          if (firstError) {
            firstError.scrollIntoView({ behavior: "smooth", block: "center" });
            firstError.focus?.();
          }
        }, 50);
      })}
      noValidate
    >
      <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
        <h2 className="mb-1 text-base font-bold text-[var(--text-primary)]">
          เลือกรอบการอบรม
        </h2>
        {/* <p className="mb-4 text-xs text-[var(--text-secondary)]">
          {course.course_name}
        </p> */}

        <ScheduleCarousel
          schedules={schedules}
          selectedId={selectedScheduleId}
          onSelect={handleSelectSchedule}
          earlyBirdScheduleId={earlyBirdScheduleId}
        />

        {activeSchedule && (
          <div className="mt-4 flex items-center justify-between rounded-9e-md bg-9e-brand/5 p-3 text-sm">
            <div>
              <div className="font-semibold text-[var(--text-primary)]">
                {activeDateLabel}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                {activeSchedule.type === "hybrid"
                  ? "Hybrid (Classroom + MS Teams)"
                  : "Classroom"}
              </div>
            </div>
            {!formRevealed && (
              <Button
                type="button"
                variant="cta"
                size="sm"
                onClick={handleReveal}
              >
                ยืนยันรอบอบรม
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {errors.classId && (
          <p className="mt-2 text-xs text-red-500">{errors.classId.message}</p>
        )}
      </section>

      {formRevealed && (
        <>
          {activeSchedule?.type === "hybrid" && (
            <AttendanceModeSelector
              value={watch("attendanceMode")}
              onChange={(mode) =>
                setValue("attendanceMode", mode, { shouldValidate: true })
              }
              error={errors.attendanceMode?.message}
            />
          )}

          <div ref={coordinatorRef}>
            <CoordinatorFields register={register} errors={errors} />
          </div>

          <AttendeesList
            control={control}
            register={register}
            watch={watch}
            setValue={setValue}
            errors={errors}
          />

          <InvoiceFields
            register={register}
            watch={watch}
            setValue={setValue}
            errors={errors}
          />

          <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
            <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">
              หมายเหตุเพิ่มเติม
            </h2>
            <Label className="sr-only" htmlFor="notes">
              หมายเหตุ
            </Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="เช่น อาหาร/แพ้อาหาร คำถามเกี่ยวกับหลักสูตร ฯลฯ (ไม่เกิน 500 ตัวอักษร)"
              maxLength={500}
              {...register("notes")}
            />
            {errors.notes?.message && (
              <p className="mt-1 text-xs text-red-500">
                {errors.notes.message}
              </p>
            )}
          </section>

          {Object.keys(errors).length > 0 &&
            (() => {
              const msgs = [...collectMessages(errors)];
              return msgs.length > 0 ? (
                <div className="rounded-9e-md border border-red-300 bg-red-50 p-4 text-sm text-red-600 space-y-1">
                  <p className="font-semibold">กรุณาตรวจสอบข้อมูลต่อไปนี้:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {msgs.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}

          <div className="flex items-center justify-between gap-4 pt-2">
            <Link
              href={courseDetailHref}
              className="text-sm font-medium text-[var(--text-secondary)] hover:text-9e-action"
            >
              ← กลับไปดูหลักสูตร
            </Link>
            <Button type="submit" variant="cta">
              ถัดไป
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

// ── Attendance Mode Selector (Hybrid only) ────────────────────────

function AttendanceModeSelector({ value, onChange, error }) {
  const modes = [
    {
      id: "classroom",
      title: "Classroom",
      description:
        "เรียนสดที่สถาบัน 9Expert Training เหมาะกับผู้ที่ต้องการบรรยากาศห้องเรียน",
      Icon: MapPin,
    },
    {
      id: "teams",
      title: "Online via Microsoft Teams",
      description:
        "เรียนสดออนไลน์ผ่าน Microsoft Teams เหมาะกับผู้เรียนต่างจังหวัดหรือต่างประเทศ",
      Icon: Monitor,
    },
  ];

  return (
    <section
      data-section="attendance-mode"
      data-error={!!error || undefined}
      className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6"
    >
      <h2 className="mb-1 text-base font-bold text-[var(--text-primary)]">
        เลือกรูปแบบการอบรม
      </h2>
      <p className="mb-4 text-xs text-[var(--text-secondary)]">
        รอบนี้เป็น Hybrid — สามารถเลือกเรียนที่สถาบันหรือออนไลน์ได้
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {modes.map(({ id, title, description, Icon: ModeIcon }) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={active}
              className={cn(
                "flex min-h-[92px] w-full gap-3 rounded-9e-lg border p-4 text-left transition-all",
                active
                  ? "border-9e-brand bg-9e-brand/5 shadow-9e-sm ring-4 ring-9e-brand/10"
                  : "border-[var(--surface-border)] bg-[var(--surface)] hover:border-9e-brand/40 hover:bg-9e-brand/5",
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-9e-md transition-colors",
                  active
                    ? "bg-9e-brand text-9e-ice"
                    : "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
                )}
              >
                <ModeIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
                  {title}
                  {active && <CheckCircle2 className="h-4 w-4 text-9e-brand" />}
                </span>
                <span className="mt-1 block text-sm leading-5 text-[var(--text-secondary)]">
                  {description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </section>
  );
}

// ── Step 2: Preview ──────────────────────────────────────────────

export function StepPreview({ data, onBack, onConfirm, submitting, error }) {
  const coord = data.coordinator ?? {};
  const [showConfirm, setShowConfirm] = useState(false);
  return (
    <>
      <div className="space-y-8">
        <Section title="ข้อมูลคอร์ส">
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
        </Section>

        <Section title="ข้อมูลผู้ประสานงาน">
          <ReadOnlyRow
            label="ชื่อ-นามสกุล"
            value={`${coord.firstName ?? ""} ${coord.lastName ?? ""}`.trim()}
          />
          <ReadOnlyRow label="อีเมล" value={coord.email} />
          <ReadOnlyRow label="เบอร์โทร" value={coord.phone} />
          {coord.lineId && <ReadOnlyRow label="LINE ID" value={coord.lineId} />}
          <ReadOnlyRow
            label="ผู้ประสานงานเข้าอบรม"
            value={coord.isAttending ? "ใช่" : "ไม่"}
          />
        </Section>

        <Section title={`ข้อมูลผู้เข้าอบรม (${data.attendeesCount} ท่าน)`}>
          <AttendeeListView data={data} />
        </Section>

        {data.invoice && (
          <Section title="ใบเสนอราคา / ใบกำกับภาษี">
            <InvoiceView invoice={data.invoice} />
          </Section>
        )}

        {data.notes && (
          <Section title="หมายเหตุ">
            <p className="whitespace-pre-wrap text-base text-[var(--text-primary)]">
              {data.notes}
            </p>
          </Section>
        )}

        {error && (
          <div className="rounded-9e-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={submitting}
          >
            แก้ไข
          </Button>
          <Button
            type="button"
            variant="cta"
            onClick={() => setShowConfirm(true)}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังส่ง...
              </>
            ) : (
              "ยืนยันการสมัคร"
            )}
          </Button>
        </div>
      </div>

      {/* Phase A — confirm dialog before submitting */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-9e-lg">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              ยืนยันการส่งข้อมูล
            </h3>
            <p className="mt-2 text-base text-[var(--text-secondary)]">
              คุณต้องการส่งข้อมูลนี้ใช่หรือไม่?
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirm(false)}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                variant="cta"
                onClick={() => {
                  setShowConfirm(false);
                  onConfirm();
                }}
              >
                ยืนยัน
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Phase B — fullscreen loading overlay while submitting */}
      {submitting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md dark:bg-[var(--surface)]/80">
          <Loader2 className="h-12 w-12 animate-spin text-9e-brand" />
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            กำลังส่งข้อมูล...
          </p>
        </div>
      )}
    </>
  );
}

// ── Step 3: Thank-you ────────────────────────────────────────────

export function StepComplete({ result, email }) {
  const referenceNumber = result?.referenceNumber;

  // ── Paid variant (card / PromptPay) ──────────────────────────────
  if (result?.kind === "paid") {
    const methodLabel =
      result.method === "promptpay" ? "QR PromptPay" : "บัตรเครดิต/เดบิต";
    return (
      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-10 text-center shadow-9e-md">
        <SuccessPulseIcon className="mx-auto" />
        <h2 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">
          ชำระเงินสำเร็จ
        </h2>
        {/* <p className="mt-3 text-sm text-[var(--text-secondary)]">
          เลขอ้างอิง:{" "}
          <span className="font-mono text-base font-bold text-9e-action">
            {referenceNumber}
          </span>
        </p> */}
        {result.amount != null && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            ยอดชำระ:{" "}
            <span className="text-base font-bold text-[var(--text-primary)]">
              {formatTHB(result.amount)} บาท
            </span>
          </p>
        )}
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          ช่องทางชำระเงิน:{" "}
          <span className="font-semibold text-[var(--text-primary)]">
            {methodLabel}
          </span>
        </p>
        {email && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            เราได้ส่งใบเสร็จและอีเมลยืนยันไปที่{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {email}
            </span>{" "}
            แล้ว
          </p>
        )}
        <div className="mt-8">
          <Button asChild variant="outline">
            <Link href="/training-course">ดูคอร์สอื่นเพิ่มเติม</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ── Quote variant (unchanged) ────────────────────────────────────
  return (
    <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-10 text-center shadow-9e-md">
      <SuccessPulseIcon className="mx-auto" />
      <h2 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">
        ขอบคุณสำหรับการลงทะเบียน
      </h2>
      {/* <p className="mt-3 text-sm text-[var(--text-secondary)]">
        เลขอ้างอิง:{" "}
        <span className="font-mono text-base font-bold text-9e-action">
          {referenceNumber}
        </span>
      </p> */}
      {email && (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          ทาง 9Expert ได้ส่งอีเมลยืนยันไปที่{" "}
          <span className="font-semibold text-[var(--text-primary)]">
            {email}
          </span>{" "}
          เรียบร้อย
        </p>
      )}
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        ทั้งนี้ ทางบริษัทจะดำเนินการจัดส่งใบเสนอราคาเป็นเอกสาร PDF ให้ท่านทางอีเมลภายใน 3 วันทำการ <br />
หากไม่พบกรุณาตรวจสอบใน Junk Mail, Spam Mail อีกครั้ง
      </p>
      <div className="mt-8">
        <Button asChild variant="outline">
          <Link href="/training-course">ดูคอร์สอื่นเพิ่มเติม</Link>
        </Button>
      </div>
    </div>
  );
}

// ── Shared atoms ────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * Walks the react-hook-form errors tree and collects only the user-facing
 * `.message` strings, deduplicated. Field paths (e.g.
 * `invoice.thaiAddress.addressLine`) are intentionally dropped so the summary
 * box shows friendly Thai messages instead of developer-facing paths.
 */
function collectMessages(errors, messages = new Set()) {
  for (const val of Object.values(errors)) {
    if (!val) continue;
    if (typeof val.message === "string" && val.message) {
      messages.add(val.message);
    } else if (typeof val === "object") {
      collectMessages(val, messages);
    }
  }
  return messages;
}

