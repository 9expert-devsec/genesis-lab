import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requirePage } from '@/lib/rbac/guard';
import { getCareerPathRegistrationById } from '@/lib/actions/career-path-registrations';
import { RegistrationStatusSelect } from '../_components/RegistrationStatusSelect';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { formatInvoiceBranchLabel } from '@/lib/registration/branchLabel';
import { typedAttendeeRows } from '@/lib/registration/careerPathRoster';
import { isTransfer } from '@/lib/career-paths/prerequisiteOrder';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'รายละเอียดการลงทะเบียน' };

const TYPE_BADGE = {
  Classroom: 'bg-blue-100 text-blue-700 border-blue-200',
  Hybrid:    'bg-purple-100 text-purple-700 border-purple-200',
  Online:    'bg-green-100 text-green-700 border-green-200',
};
const TRANSFER_BADGE = 'bg-9e-action/10 text-9e-action border-9e-action/30';
const FALLBACK_BADGE = 'bg-gray-100 text-gray-700 border-gray-200';

/**
 * A course row's training-type label. ONE place, because stored `type` has
 * never had one casing: the pick step writes `classroom` / `online` lower-case,
 * the learner's hybrid choice as `Hybrid (Classroom)` / `Hybrid (MS Teams)`,
 * and a transfer as `transfer` — so printing it raw showed "classroom" next to
 * "Hybrid (MS Teams)". Rows already stored read correctly with no migration.
 */
function courseTypeLabel(type) {
  const raw = String(type ?? '').trim();
  const lower = raw.toLowerCase();
  if (lower === 'transfer') return 'Transfer';
  if (lower === 'classroom') return 'Classroom';
  if (lower === 'online') return 'Online';
  if (lower === 'hybrid') return 'Hybrid';
  const hybrid = /^hybrid \((classroom|ms teams)\)$/.exec(lower);
  if (hybrid) return `Hybrid (${hybrid[1] === 'classroom' ? 'Classroom' : 'MS Teams'})`;
  return raw || '—';
}

function courseTypeBadge(type) {
  const label = courseTypeLabel(type);
  if (label === 'Transfer') return TRANSFER_BADGE;
  return TYPE_BADGE[label.split(' ')[0]] ?? FALLBACK_BADGE;
}

/**
 * A course row's round, from the stored day list — never a raw ISO string.
 * `formatRoundDays` reads upstream's datetimes and bare days alike, so rows
 * stored before or after the server started rewriting them print the same
 * way; `round` is the fallback for a row with no day list.
 */
function courseRoundLabel(c) {
  return c?.dates?.length
    ? formatRoundDays(c.dates, { showMonth: true, showYear: true })
    : c?.round || '—';
}

/**
 * The สาขา label, from whichever of the three shapes this document carries.
 *
 * This row used to read `reg.companyBranch` directly, and that path has been the
 * empty string on every career-path registration ever filed — the form collected
 * a branch and zod stripped it before submit. So the row simply never appeared.
 * Now the structured pair is stored, and the label comes from the one module
 * that knows the country split (สำนักงานใหญ่ / สาขาที่ NNNNN are Thai Revenue-
 * Department concepts and mean nothing on a Singapore invoice).
 *
 * `companyBranch` is still passed as the legacy free text, so a document that
 * somehow carries one still says what it says.
 */
function branchLabelOf(reg) {
  return formatInvoiceBranchLabel({
    country:    reg.invoiceCountry,
    branchType: reg.branchType,
    branchCode: reg.branchCode,
    branchFree: reg.branchFree,
    branch:     reg.companyBranch,
  });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  // Asia/Bangkok, explicitly: this is a SERVER component, so without a zone it
  // printed UTC (07:52) while the list — a client component — showed the
  // viewer's Bangkok time (14:52) for the same row.
  return d.toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  });
}

export default async function RegistrationDetailPage({ params }) {
  await requirePage('career_path_registrations');

  const { id } = await params;
  const reg = await getCareerPathRegistrationById(id);
  if (!reg) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <Link
        href="/admin/career-path-registrations"
        className="inline-flex items-center gap-1 text-sm text-9e-action hover:underline"
      >
        <ChevronLeft className="h-4 w-4" /> กลับไปยังรายการ
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
            {reg.contactFirstName} {reg.contactLastName}
          </h1>
          <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
            {reg.careerName} · ส่งเมื่อ {fmtDate(reg.createdAt)}
          </p>
        </div>
        <div className="min-w-[220px]">
          <p className="mb-1 text-xs font-bold text-9e-navy dark:text-white">สถานะ</p>
          <RegistrationStatusSelect id={String(reg._id)} initialStatus={reg.status} />
        </div>
      </header>

      <Section title="คอร์สที่เลือก">
        <ul className="divide-y divide-[var(--surface-border)]">
          {(reg.selectedCourses ?? []).map((c, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <div className="font-semibold text-9e-navy dark:text-white">
                  {c.courseName}
                </div>
                <div className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  {/* Transfer Module: the round ATTENDED, not one to come.
                      The round label already names its days, so the old
                      "· start – end" tail (raw ISO strings) is gone. */}
                  {isTransfer(c) ? `เคยอบรม ${courseRoundLabel(c)}` : courseRoundLabel(c)}
                </div>
              </div>
              <span className="inline-flex flex-wrap items-center gap-1">
                <span
                  className={
                    'rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
                    courseTypeBadge(c.type)
                  }
                >
                  {courseTypeLabel(c.type)}
                </span>
                {/* A transfer round the learner typed — not matched to a real round. */}
                {isTransfer(c) && c.transferManual === true && (
                  <span className={'rounded-full border px-2 py-0.5 text-[11px] font-medium ' + FALLBACK_BADGE}>
                    ระบุเอง
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="ข้อมูลผู้ประสานงาน">
        <Row label="ชื่อ-นามสกุล" value={`${reg.contactFirstName} ${reg.contactLastName}`} />
        <Row label="Email"        value={reg.contactEmail} />
        <Row label="เบอร์ติดต่อ"  value={reg.contactPhone} />
        <Row label="ผู้ประสานงานเข้าอบรม" value={reg.isCoordinator ? 'ใช่' : 'ไม่ใช่'} />
        <Row label="จำนวนผู้สมัคร"        value={`${reg.attendeeCount ?? 1} ท่าน`} />
      </Section>

      <Section title="ข้อมูลผู้เข้าอบรม">
        {reg.skipAttendee ? (
          <p className="text-sm text-9e-slate-dp-50">ยังไม่ประสงค์แจ้งรายชื่อ</p>
        ) : (
          <ol className="space-y-2">
            {reg.isCoordinator && (
              <li className="rounded-9e-md bg-9e-ice/40 p-3 text-sm dark:bg-[#0D1B2A]/40">
                <div className="font-semibold">
                  ท่านที่ 1 · {reg.contactFirstName} {reg.contactLastName}
                </div>
                <div className="text-xs text-9e-slate-dp-50">
                  {reg.contactEmail} · {reg.contactPhone}
                </div>
              </li>
            )}
            {typedAttendeeRows(reg).map((a, i) => (
              <li
                key={i}
                className="rounded-9e-md border border-[var(--surface-border)] p-3 text-sm"
              >
                <div className="font-semibold">
                  ท่านที่ {reg.isCoordinator ? i + 2 : i + 1} · {a.firstName} {a.lastName}
                </div>
                <div className="text-xs text-9e-slate-dp-50">
                  {[a.email, a.phone].filter(Boolean).join(' · ') || '—'}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="ใบกำกับภาษี / ใบเสนอราคา">
        <Row
          label="ประเภท"
          value={reg.taxType === 'company' ? 'นิติบุคคล / บริษัท' : 'บุคคลธรรมดา'}
        />
        {reg.taxType === 'personal' ? (
          <>
            <Row label="ชื่อ-นามสกุล" value={`${reg.taxFirstName ?? ''} ${reg.taxLastName ?? ''}`.trim()} />
            {reg.personalTaxId && <Row label="เลขประจำตัวประชาชน" value={reg.personalTaxId} />}
          </>
        ) : (
          <>
            <Row label="ชื่อบริษัท" value={reg.companyName} />
            {branchLabelOf(reg) && <Row label="สาขา" value={branchLabelOf(reg)} />}
            <Row label="เลขผู้เสียภาษี" value={reg.companyTaxId} />
          </>
        )}
        <Row
          label="ที่อยู่"
          value={[
            reg.taxAddress,
            reg.subdistrict,
            reg.district,
            reg.province,
            reg.zipcode,
            // Last, and only ever set on an 'OTHER' registration — an
            // international invoice address is unpostable without it, and the
            // flat columns had nowhere to put it until now.
            reg.countryName,
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </Section>

      {reg.note && (
        <Section title="หมายเหตุ">
          <p className="whitespace-pre-wrap text-sm text-9e-navy dark:text-white">
            {reg.note}
          </p>
        </Section>
      )}

      <RecordHistory menu="career_path_registrations" entity="registration" recordId={String(reg._id)} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
      <h2 className="mb-3 text-base font-bold text-9e-navy dark:text-white">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-1 py-1 sm:flex-row sm:items-baseline sm:gap-4">
      <div className="text-xs font-medium uppercase tracking-wide text-9e-slate-dp-50 sm:w-40 sm:flex-none">
        {label}
      </div>
      <div className="text-sm text-9e-navy dark:text-white">{value || '—'}</div>
    </div>
  );
}
