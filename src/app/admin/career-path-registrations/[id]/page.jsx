import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requirePage } from '@/lib/rbac/guard';
import { getCareerPathRegistrationById } from '@/lib/actions/career-path-registrations';
import { RegistrationStatusSelect } from '../_components/RegistrationStatusSelect';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'รายละเอียดการลงทะเบียน' };

const TYPE_BADGE = {
  Classroom: 'bg-blue-100 text-blue-700 border-blue-200',
  Hybrid:    'bg-purple-100 text-purple-700 border-purple-200',
  Online:    'bg-green-100 text-green-700 border-green-200',
};

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
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
                  {c.round} · {c.startDate || '—'} – {c.endDate || '—'}
                </div>
              </div>
              <span
                className={
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
                  (TYPE_BADGE[c.type] ?? 'bg-gray-100 text-gray-700 border-gray-200')
                }
              >
                {c.type}
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
            {(reg.attendees ?? []).map((a, i) => (
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
            {reg.companyBranch && <Row label="สาขา" value={reg.companyBranch} />}
            <Row label="เลขผู้เสียภาษี" value={reg.companyTaxId} />
          </>
        )}
        <Row
          label="ที่อยู่"
          value={[reg.taxAddress, reg.subdistrict, reg.district, reg.province, reg.zipcode]
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
