'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Loader2 } from 'lucide-react';

import {
  bundleRegistrationSchema,
  bundleRegistrationDefaults,
} from '@/lib/schemas/register-bundle';
import { CoordinatorFields } from '@/components/registration/CoordinatorFields';
import { AttendeesList } from '@/components/registration/AttendeesList';
import { InvoiceFields } from '@/components/registration/InvoiceFields';
import {
  AttendeeListView,
  InvoiceView,
  ReadOnlyRow,
  Section,
} from '@/components/registration/PreviewRows';
import { RegistrationStepper } from '@/components/registration/RegistrationStepper';
import { StepComplete } from '@/components/registration/RegisterWizard';
import { consentFanOut } from '@/components/payment/consent';
import {
  BUNDLE_CLOSED_MESSAGE,
  BUNDLE_UNAVAILABLE_MESSAGE,
} from '@/lib/pageBuilder/bundleRegistration';
import { isSilentRefusal } from '@/lib/registration/bundleRequest';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BundleTermsModal } from '@/components/registration/BundleTermsModal';
import { BUNDLE_TERMS_TITLE } from '@/lib/registration/bundleTerms';

/**
 * Keyed to THIS form and version. The pair is stored inside the payload and
 * checked on rehydrate — see `matchesPair` — so a draft left over from a
 * different bundle cannot be poured into this one's fields.
 */
const STORAGE_KEY = 'registration-bundle-v1';
const FORMDATA_KEY = 'registration-bundle-formdata-v1';
const RESULT_KEY = 'registration-bundle-result-v1';

/**
 * THE BUNDLE QUOTATION WIZARD.
 *
 * ══ IT IS THREE ROUTES NOW, AND THIS REPLACES THE NOTE THAT SAID OTHERWISE ═
 *
 * `BundleRegisterForm` used to say, at length, that this flow was deliberately
 * ONE page with a confirm state — "one entry point and one submission, so it is
 * one page … fewer moving parts, and nothing to rehydrate because nothing
 * navigates". That reasoning was sound for the form it described and it is now
 * FALSE, so it is replaced rather than amended: a stale rationale is worse than
 * none, because the next reader trusts it.
 *
 * WHAT CHANGED THE PREMISE. The round asked for the three-step shell the
 * ordinary public registration has — กรอกข้อมูล / ตรวจสอบ / สำเร็จ — with a
 * real review step between filling the form and sending it. A stepper whose
 * steps are not URLs is a stepper in appearance only: the back button is not
 * decoration on a form someone fills in from a phone, and "ตรวจสอบ" that cannot
 * be arrived at, left, and returned to is a label rather than a step.
 *
 * WHAT THAT COSTS, STATED RATHER THAN DISCOVERED. Each step is its own route,
 * so the server re-resolves the bundle on every step — three times across a
 * completed flow instead of once. That is accepted deliberately: the resolve is
 * two awaited calls (`getPublishedPageBuilderPageById`, then
 * `resolveSectionData`), it is the same work the landing page already did, and
 * the alternative — trusting the client to carry the package across steps — is
 * exactly what the route's own header refuses to do, on the grounds that the
 * pair in the URL is a lookup key and nothing else. A round that rolls off
 * between step 1 and step 3 SHOULD change what the customer is shown.
 *
 * ══ THE MACHINERY IS THE WIZARD'S, NOT NEW ═════════════════════════════════
 *
 * Three pieces, all of them the shapes RegisterWizard and InhouseWizard already
 * use, and deliberately nothing beyond them:
 *
 *   1. sessionStorage rehydration — each step is a route, so navigating
 *      remounts this component and clears React state. The draft, the confirmed
 *      payload and the result live in storage.
 *   2. a remount guard — landing on step 2 with no payload, or step 3 with no
 *      result, silently returns to step 1 with the query string intact.
 *   3. `?page=&section=` preserved across every step, by building step hrefs
 *      from `searchParams` rather than from a remembered pair.
 *
 * ══ WHAT IS STILL ABSENT ═══════════════════════════════════════════════════
 *
 * NO ROUND PICKER, no ยืนยันรอบอบรม reveal, no `AttendanceModeSelector`, and
 * none of the wizard's `?class=` notices. A bundle's rounds are chosen by the
 * author and there is no single round for the customer to pick. One person
 * attends every course in the package, so there is no per-course attendee UI —
 * and the summary block says "N หลักสูตร", counting COURSES, for that reason.
 *
 * NO PAYMENT. `bundleRegistrationSchema` carries no `paymentMethod` and no
 * `omiseToken`, so there is nothing to render and nothing a client could send.
 * That is also why the stepper is not told `takesPayment`: step 2 says plainly
 * `ตรวจสอบ`, never `ตรวจสอบและดำเนินการ`, because there is no payment to
 * proceed to and promising one is a promise this screen cannot keep.
 *
 * ══ THE CONSENT IS ON STEP 2, WHERE THE REVIEW IS ══════════════════════════
 *
 * It moved off the form and onto the review screen, which is where both of the
 * public wizard's step-2 surfaces put it: a customer confirms after checking,
 * not before. Still one checkbox on screen and four flags on the wire through
 * `consentFanOut`, so a bundle's audit record is the same shape as every other
 * registration's. It keeps the QUOTATION wording and does not adopt
 * ReviewAndPayStep's, which points at payment terms a quotation does not have.
 *
 * @param {object} o
 * @param {ReactNode} [o.summary] the server-rendered BundleSummary. Passed in
 *   rather than built here so the block stays a server component: its `lines`
 *   are formatted by `formatRoundDays` from a clock read this client must not
 *   make. Shown on steps 1 and 2 — on 3 the request is already sent.
 */
export function BundleWizard({
  pageId,
  sectionId,
  bundleName = '',
  courseCount = 0,
  step = 1,
  basePath = '/registration/bundle',
  summary = null,
  /**
   * Where step 1's footer link goes, or NULL meaning render no link.
   *
   * Resolved on the server by `publicPageHref` from the page document this
   * route already fetched — no extra read — and null whenever that document's
   * own public URL would not resolve, which is reachable: a page can be
   * `status: 'published'` and still past its publish window, in which case the
   * quotation form renders and the promotion page it came from 404s. A link
   * that 404s is worse than no link, so the footer draws none.
   */
  backHref = null,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentStep, setCurrentStep] = useState(step);
  const [formData, setFormData] = useState(null);
  const [restoredFromStorage, setRestoredFromStorage] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  /**
   * A REFUSAL THAT ARRIVED AT SUBMIT TIME, which is a real and ordinary state:
   * the page resolved the bundle when it rendered, and a round can roll off, an
   * author can close the bundle, or the page can be unpublished while the form
   * sits open in a tab. The server re-resolves on the way in and says so, and
   * this is where that answer is shown.
   *
   * Kept apart from `error` because the two mean different things: `error` is
   * "the request failed, try again", and this is "the thing you were asking for
   * is not available any more", which retrying cannot fix.
   */
  const [refused, setRefused] = useState(null);
  const [consented, setConsented] = useState(false);

  /**
   * A stored payload belongs to THIS bundle or it is discarded. The wizard
   * checks `courseId`; a bundle's identity is the PAIR, and half of it matching
   * is not a match — two sections on one page are two different packages.
   */
  const matchesPair = useCallback(
    (saved) => saved?.pageId === pageId && saved?.sectionId === sectionId,
    [pageId, sectionId],
  );

  const stepHref = useCallback(
    (n) => {
      // From `searchParams`, never from the props: the pair reaches every step
      // through the URL, and rebuilding it from remembered values is how a
      // step-2 link ends up naming a different package than step 1.
      const params = new URLSearchParams(searchParams.toString());
      const q = params.toString();
      return `${basePath}/step-${n}${q ? `?${q}` : ''}`;
    },
    [basePath, searchParams],
  );

  useEffect(() => {
    setCurrentStep(step);
  }, [step]);

  useEffect(() => {
    let draft = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (matchesPair(parsed)) draft = parsed;
        else sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore corrupted storage
    }
    setRestoredFromStorage(draft);

    try {
      const rawForm = sessionStorage.getItem(FORMDATA_KEY);
      if (rawForm) {
        const parsed = JSON.parse(rawForm);
        if (matchesPair(parsed)) setFormData(parsed);
        else sessionStorage.removeItem(FORMDATA_KEY);
      }
    } catch {
      // ignore corrupted storage
    }

    if (step === 3) {
      try {
        const rawRes = sessionStorage.getItem(RESULT_KEY);
        if (rawRes) {
          const saved = JSON.parse(rawRes);
          if (saved?.result && matchesPair(saved)) {
            setResult(saved.result);
            if (saved.formData) setFormData(saved.formData);
          }
        }
      } catch {
        // ignore corrupted storage
      }
    } else if (step === 1) {
      // Fresh start on step 1 — drop any stale success result, so a customer
      // who begins a second request does not carry the first one's reference
      // number to the end of it.
      try {
        sessionStorage.removeItem(RESULT_KEY);
      } catch {}
    }

    setHydrated(true);
  }, [step, matchesPair]);

  // THE REMOUNT GUARD. A refresh or a deep link to a later step without the
  // data that step needs goes back to step 1 — keeping the query params, so the
  // bundle is still the one they came for.
  useEffect(() => {
    if (!hydrated) return;
    if (currentStep === 2 && !formData) router.replace(stepHref(1));
    else if (currentStep === 3 && !result) router.replace(stepHref(1));
  }, [hydrated, currentStep, formData, result, router, stepHref]);

  const handleFormSubmit = (values) => {
    // The pair goes from the PROPS, not from the form state: they are the
    // page's own answer and nothing on screen may edit them.
    const data = { ...values, pageId, sectionId };
    setFormData(data);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
    try {
      sessionStorage.setItem(FORMDATA_KEY, JSON.stringify(data));
    } catch {}
    setCurrentStep(2);
    router.push(stepHref(2));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep(1);
    router.push(stepHref(1));
  };

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    setRefused(null);
    try {
      const res = await fetch('/api/registration/bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          pageId,
          sectionId,
          consent: consentFanOut(consented),
        }),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {}
        try {
          sessionStorage.removeItem(FORMDATA_KEY);
        } catch {}
        try {
          sessionStorage.setItem(
            RESULT_KEY,
            JSON.stringify({ result: json, formData, pageId, sectionId }),
          );
        } catch {}
        setResult(json);
        setCurrentStep(3);
        router.push(stepHref(3));
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (json?.error === 'bundle_refused') {
        setRefused(json.reason ?? 'unresolved_items');
        return;
      }
      setError(json?.message ?? 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  if (refused) {
    /**
     * The SAME two sentences the page renders, from the same module. A silent
     * reason cannot reach here — the form only exists because the page resolved
     * the bundle — but if one ever did, it must not render as a blank panel, so
     * it falls to the unavailable wording rather than to nothing.
     */
    const closed = refused === 'closed';
    return (
      <section
        data-testid="bundle-refused-late"
        data-reason={refused}
        className="rounded-9e-lg border border-dashed border-[var(--surface-border)] px-6 py-10 text-center"
      >
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          {closed && !isSilentRefusal(refused) ? BUNDLE_CLOSED_MESSAGE : BUNDLE_UNAVAILABLE_MESSAGE}
        </h2>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          แพ็กเกจนี้เปลี่ยนสถานะระหว่างที่คุณกรอกแบบฟอร์ม จึงยังไม่ได้บันทึกคำขอของคุณ
        </p>
        <Link
          href="/contact-us"
          className="mt-5 inline-block text-sm font-semibold text-9e-action underline underline-offset-2"
        >
          ติดต่อทีมขาย
        </Link>
      </section>
    );
  }

  return (
    <div>
      {/*
        No `takesPayment` — a quotation never proceeds to a charge, so step 2
        reads ตรวจสอบ. The prop is left at its default rather than passed as
        `false` so there is one fewer place to change it to the wrong thing.
      */}
      <RegistrationStepper currentStep={currentStep} />

      {/*
        ══ THE TWO-COLUMN SHELL, AND IT IS THE SAME ONE ON BOTH STEPS ═══════
        Taken from the masterclass registration, which is the only other
        Genesis flow that puts a summary card beside a form: the grid, the
        330px track, `lg:items-start`, and the sticky/hidden pair below are
        that page's, not a second arrangement invented here.

        STEPS 1 AND 2 SHARE IT DELIBERATELY. They are adjacent screens in one
        wizard showing the SAME card, and a customer who moves from one to the
        other and finds the package has jumped from the right rail into the
        flow reads that as a bug rather than as a design. The masterclass makes
        the same call — both of its steps are two-column with a sticky right
        rail. There is no reason for them to differ that survives being said
        out loud, so they do not.

        Step 3 has no card: the request is sent, and re-showing what was
        requested beside a confirmation invites a second reading of a decision
        already made.

        WHAT WAS NOT COPIED: the masterclass's `pb-24 lg:pb-0`. That reserves
        room for its FIXED MOBILE BOTTOM BAR. This wizard has no such bar, so
        copying the padding would reserve 96px of empty space under every
        mobile screen for a thing that is not there.
      */}
      {currentStep !== 3 && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_330px] lg:items-start">
          <div>
            {/*
              THE CARD ON NARROW WIDTHS: above the form, not below it. Below
              `lg` the grid collapses to one column and source order decides,
              so this copy is rendered first — and it should be. This is a
              QUOTATION: what the customer is asking for, and what it costs, is
              the thing they came to check, and burying it under a long form
              means the first screenful is a name field with no context. It is
              also where the masterclass puts its own card at this breakpoint.
            */}
            <div className="mb-6 lg:hidden">{summary}</div>

            {currentStep === 1 && hydrated && (
              <BundleStepForm
                pageId={pageId}
                sectionId={sectionId}
                initialValues={formData ?? restoredFromStorage}
                onSubmit={handleFormSubmit}
                backHref={backHref}
              />
            )}

            {currentStep === 2 && formData && (
              <BundleStepReview
                data={formData}
                onBack={handleBack}
                onConfirm={handleConfirm}
                submitting={submitting}
                error={error}
                consented={consented}
                onConsentChange={setConsented}
              />
            )}
          </div>

          {/*
            The desktop rail. `lg:self-start` is what lets `lg:sticky` work at
            all inside a grid — a stretched item has nothing to stick within.
          */}
          <div className="hidden lg:block lg:sticky lg:top-24 lg:self-start">{summary}</div>
        </div>
      )}

      {currentStep === 3 && result && (
        <StepComplete
          result={result}
          email={formData?.coordinator?.email}
          title="ได้รับคำขอใบเสนอราคาแล้ว"
          // The one thing the customer needs. A quotation is answered by a
          // human days later, and the reference number is their only handle on
          // it — see the note on StepComplete's props for why this is opt-in
          // rather than un-commented for everybody.
          showReference
          closing={
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              ทีมขายจะติดต่อกลับพร้อมใบเสนอราคาสำหรับ
              {bundleName ? ` “${bundleName}” ` : ' แพ็กเกจนี้ '}
              ({courseCount} หลักสูตร)
            </p>
          }
        />
      )}
    </div>
  );
}

// ── Step 1: the form ───────────────────────────────────────────────

/**
 * EXPORTED for the render tier only, which cannot reach it through the wizard:
 * step 1 is gated behind a `hydrated` flag set in an effect, and
 * renderToStaticMarkup never runs effects. Same reason RegisterWizard exports
 * StepForm and InhouseForm exports InhouseStepForm.
 *
 * ══ IT ASKS WHAT THE ORDINARY PUBLIC FORM ASKS ═════════════════════════════
 *
 * `CoordinatorFields`, `AttendeesList` and `InvoiceFields` are the SAME
 * components the public wizard renders, imported rather than copied, and
 * `bundleRegistrationSchema` reuses that form's zod parts. A bundle customer
 * and a course customer are asked the same questions and held to the same
 * rules, which is the only way the accumulated rulings inside those schemas
 * (the attendee/coordinator asymmetry, the English-only branch, the branch-code
 * handling) reach this form at all.
 */
export function BundleStepForm({ pageId, sectionId, initialValues, onSubmit, backHref = null }) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm({
    resolver: zodResolver(bundleRegistrationSchema),
    defaultValues: { ...bundleRegistrationDefaults, ...(initialValues ?? {}), pageId, sectionId },
    mode: 'onSubmit',
  });

  return (
    <form className="space-y-8" onSubmit={handleSubmit(onSubmit)} noValidate>
      <CoordinatorFields register={register} errors={errors} isSubmitted={isSubmitted} />

      <AttendeesList
        control={control}
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
        isSubmitted={isSubmitted}
      />

      <InvoiceFields register={register} watch={watch} setValue={setValue} errors={errors} />

      <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
        <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">หมายเหตุเพิ่มเติม</h2>
        <Label className="sr-only" htmlFor="bundle-notes">หมายเหตุ</Label>
        <Textarea
          id="bundle-notes"
          rows={3}
          placeholder="เช่น ต้องการใบเสนอราคาในนามบริษัท หรือวันที่ที่ต้องการให้ออกเอกสาร (ไม่เกิน 500 ตัวอักษร)"
          maxLength={500}
          {...register('notes')}
        />
        {errors.notes?.message && (
          <p className="mt-1 text-xs text-red-500">{errors.notes.message}</p>
        )}
      </section>

      {/*
        THE STEP FOOTER, in the public wizard's own shape: one row,
        `justify-between`, the way back on the LEFT as a quiet text link and the
        primary action on the RIGHT as a cta Button. Same container classes
        (`flex items-center gap-4 pt-2`) and the same link styling, so a
        customer moving between the two flows meets one convention.

        `justify-end` WHEN THERE IS NO LINK, rather than leaving the button to
        be pulled left by `justify-between` with a single child. The absent-link
        case is real — see `publicPageHref` — so its layout is chosen rather
        than inherited.

        The button says ตรวจสอบข้อมูล and not the wizard's ถัดไป. That is the
        one deliberate divergence: naming the step it leads to is this repo's
        settled house style for a primary action (see the registrations round
        that made exactly this change), and here it also distinguishes "go and
        check" from "send", which are two different buttons two screens apart.
      */}
      <div
        className={cn(
          'flex items-center gap-4 pt-2',
          backHref ? 'justify-between' : 'justify-end',
        )}
        data-testid="bundle-step-nav"
      >
        {backHref && (
          <Link
            href={backHref}
            className="text-sm font-medium text-[var(--text-secondary)] hover:text-9e-action"
          >
            ← กลับไปดูโปรโมชัน
          </Link>
        )}
        <Button type="submit" variant="cta">
          ตรวจสอบข้อมูล
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

// ── Step 2: the review ─────────────────────────────────────────────

/**
 * WHAT IS BEING REQUESTED, AND WHAT WAS TYPED — in that order.
 *
 * The courses, their rounds and the price are ABOVE this component, rendered by
 * the same `BundleSummary` the landing screen showed, because a review that
 * only echoes the form fields back is not a review of the request: it never
 * shows what is being bought. The sections below are the answers the customer
 * gave, read back through the same `ReadOnlyRow`, `AttendeeListView` and
 * `InvoiceView` the public wizard's step-2 screens use.
 *
 * ผู้ประสานงานเข้าอบรม is deliberately absent, matching `StepPreview`: the field
 * is still collected, still submitted and still drives the attendee-count maths
 * and the coordinator-as-attendee-#1 copy. It is this READ VIEW that omits it,
 * as the admin detail screen does.
 */
export function BundleStepReview({
  data,
  onBack,
  onConfirm,
  submitting,
  error,
  consented,
  onConsentChange,
}) {
  const coord = data.coordinator ?? {};

  /**
   * Purely presentational state — is the terms panel open — so it lives HERE
   * rather than in the wizard. Nothing above this component needs to know, and
   * nothing survives a step change: closing the panel is not a decision, and
   * `consented` (which IS one) stays where it was, owned by the wizard and
   * carried into the POST.
   */
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <div className="space-y-8">
      <Section title="ข้อมูลผู้ประสานงาน">
        <ReadOnlyRow
          label="ชื่อ-นามสกุล"
          value={`${coord.firstName ?? ''} ${coord.lastName ?? ''}`.trim()}
        />
        <ReadOnlyRow label="อีเมล" value={coord.email} />
        <ReadOnlyRow label="เบอร์โทร" value={coord.phone} />
        {coord.lineId && <ReadOnlyRow label="LINE ID" value={coord.lineId} />}
      </Section>

      <Section title={`ข้อมูลผู้เข้าอบรม (${data.attendeesCount} ท่าน)`}>
        <AttendeeListView data={data} />
      </Section>

      {data.invoice && (
        <Section title="ข้อมูลสำหรับออกใบเสนอราคา">
          <InvoiceView invoice={data.invoice} />
        </Section>
      )}

      {data.notes && (
        <Section title="หมายเหตุ">
          <p className="whitespace-pre-wrap text-base text-[var(--text-primary)]">{data.notes}</p>
        </Section>
      )}

      <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
        {/*
          ── THE TERMS TRIGGER SITS INSIDE THE <label>, AND THAT IS MEASURED ──
          The worry was that a <button> nested in a <label> would be activated by
          the LABEL as well as by itself, so that reading the terms would tick
          the consent box — agreement recorded from a customer who was still
          reading. That would be a defect, not a styling detail.

          IT DOES NOT HAPPEN. Measured on this page with a REAL mouse press
          through CDP, both probes scrolled into view first:

            <button> appended inside this label → checkbox NOT toggled
            <span>   appended inside this label → checkbox toggled

          The <span> is the positive control: it proves the probe can observe a
          toggle at all, so the button's `false` is a finding and not a dead
          instrument. This is the HTML label-activation algorithm behaving as
          specified — a label does not forward activation to its labelled control
          when the event target is INTERACTIVE CONTENT (button, a[href], input).

          So the arrangement is the public wizard's own, in ReviewAndPayStep:
          one <label> around checkbox and sentence, the trigger inline within the
          sentence. That keeps clicking the text toggling consent — a real
          affordance — and lets the line wrap as one sentence, which it cannot do
          if the link is a separate flex item.

          If a future browser changes this, the fix is the DOM shape (move the
          trigger out), never a stopPropagation over the top of it.
        */}
        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            data-testid="bundle-consent"
            checked={consented}
            onChange={(e) => onConsentChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="leading-5">
            ข้าพเจ้าได้ตรวจสอบข้อมูลและยอมรับ{' '}
            <button
              type="button"
              data-testid="bundle-terms-open"
              onClick={() => setTermsOpen(true)}
              className="font-semibold text-9e-action underline underline-offset-2 hover:text-9e-brand"
            >
              {BUNDLE_TERMS_TITLE}
            </button>
          </span>
        </label>
      </section>

      <BundleTermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />

      {error && (
        <div
          data-testid="bundle-error"
          className="rounded-9e-md border border-red-300 bg-red-50 p-4 text-sm text-red-600"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          แก้ไข
        </Button>
        <Button
          type="button"
          variant="cta"
          onClick={onConfirm}
          disabled={submitting || !consented}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          ยืนยันการขอใบเสนอราคา
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
