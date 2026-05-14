'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  FileText, Calendar, Phone, Building2, StickyNote,
  CheckCircle2, ArrowRight, Loader2, Monitor,
  HelpCircle, Plus, Minus,
} from 'lucide-react';
import { inhouseRegistrationSchema, inhouseRegistrationDefaults } from '@/lib/schemas/register-inhouse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ThaiAddressFields } from '@/components/registration/ThaiAddressFields';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────

const SKILL_LEVELS = [
  { value: 'beginner',     label: 'Beginner — เริ่มต้น' },
  { value: 'intermediate', label: 'Intermediate — ปานกลาง' },
  { value: 'advanced',     label: 'Advanced — ขั้นสูง' },
  { value: 'mixed',        label: 'Mixed — มีหลายระดับ' },
];

const CONTENT_MODES = [
  { value: 'standard', label: 'ใช้ Outline มาตรฐาน',  desc: 'อบรมตามหลักสูตรของ 9Expert',                   icon: FileText },
  { value: 'custom',   label: 'ปรับเนื้อหาบางส่วน',   desc: 'เพิ่ม/ลดหัวข้อให้ตรงกับงานจริง',               icon: StickyNote },
  { value: 'consult',  label: 'ให้ช่วยแนะนำ',          desc: 'ยังไม่แน่ใจว่าควรเลือก outline แบบใด',         icon: HelpCircle },
];

const SCHEDULE_MODES = [
  { value: 'month',     label: 'เลือกเดือน',      desc: 'ยังไม่ล็อกวันที่แน่นอน',           icon: Calendar },
  { value: 'dateRange', label: 'ระบุช่วงวันที่',   desc: 'มีช่วงวันที่สะดวกแล้ว',            icon: Calendar },
  { value: 'notSure',   label: 'ยังไม่แน่ใจ',      desc: 'ให้เจ้าหน้าที่ช่วยแนะนำ',          icon: HelpCircle },
];

const TRAINING_FORMATS = [
  { value: 'onsite',   label: 'Onsite',       desc: 'อบรมที่บริษัทหรือสถานที่ของลูกค้า',      icon: Building2 },
  { value: 'online',   label: 'Online',       desc: 'อบรมสดผ่าน Microsoft Teams',             icon: Monitor },
  { value: 'flexible', label: 'ยังไม่แน่ใจ', desc: 'ให้เจ้าหน้าที่ช่วยแนะนำรูปแบบ',          icon: HelpCircle },
];

const ONSITE_EQUIPMENT = ['Computer / Notebook', 'Projector / Display', 'Internet', 'Microphone / Speaker'];

const THAI_MONTHS = Array.from({ length: 12 }, (_, i) => {
  const now = new Date();
  const d   = new Date(now.getFullYear(), now.getMonth() + i, 1);
  return {
    value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    label: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
  };
});

// ── Main Component ─────────────────────────────────────────────────

export function InhouseForm({ courses = [], preselectedCourse = null }) {
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState(null);
  const [submitted,    setSubmitted]    = useState(false);
  const [refNo,        setRefNo]        = useState('');

  // Group courses by program for optgroup
  const coursesByProgram = courses.reduce((acc, c) => {
    const prog = c.program || 'อื่นๆ';
    if (!acc[prog]) acc[prog] = [];
    acc[prog].push(c);
    return acc;
  }, {});

  // Find preselected course id (case-insensitive)
  const preselectedId = preselectedCourse
    ? (courses.find((c) => c.id.toUpperCase() === preselectedCourse.toUpperCase())?.id ?? '')
    : '';

  const {
    register, handleSubmit, watch, setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(inhouseRegistrationSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: {
      ...inhouseRegistrationDefaults,
      // courseInterested is a single-select UI field (not in schema directly)
      coursesInterested: preselectedId ? [preselectedId] : [],
    },
  });

  // Local single-select state for course dropdown
  const [courseInterested, setCourseInterested] = useState(preselectedId);

  const contentMode       = watch('contentMode');
  const scheduleMode      = watch('scheduleMode');
  const trainingFormat    = watch('trainingFormat');
  const quotationCountry  = watch('quotationCountry');
  const participantsCount = watch('participantsCount') ?? 15;
  const isTH              = quotationCountry === 'TH';
  const isOnsite          = trainingFormat === 'onsite';
  const isOnline          = trainingFormat === 'online';

  const toggleEquipment = (item) => {
    const cur = watch('onsiteEquipment') ?? [];
    setValue('onsiteEquipment', cur.includes(item) ? cur.filter((e) => e !== item) : [...cur, item]);
  };

  const handleCountryChange = (val) => {
    setValue('quotationCountry', val);
    setValue('thaiAddress',          val === 'TH'    ? { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' } : null);
    setValue('internationalAddress', val === 'OTHER' ? { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' } : null);
  };

  const onSubmit = async (data) => {
    // Map single courseInterested → coursesInterested array for API
    const payload = { ...data, coursesInterested: courseInterested ? [courseInterested] : [] };
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res  = await fetch('/api/registration/inhouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setSubmitError(body?.message || 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่'); return; }
      setRefNo(body.referenceNumber);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSubmitError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Thank you ──────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-10 text-center shadow-9e-md">
        <CheckCircle2 className="mx-auto h-16 w-16 text-9e-brand" strokeWidth={1.5} />
        <h2 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">ส่งคำขอเรียบร้อยแล้ว</h2>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          เลขอ้างอิง:{' '}
          <span className="font-mono text-base font-bold text-9e-action">{refNo}</span>
        </p>
        <p className="mt-4 max-w-md mx-auto text-sm text-[var(--text-secondary)]">
          ทีมขายจะติดต่อกลับภายใน 1-2 วันทำการพร้อมใบเสนอราคาและรายละเอียดการจัดอบรม
        </p>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────
  return (
    <form
      className="mx-auto max-w-[760px] space-y-6"
      onSubmit={handleSubmit(onSubmit, () => {
        setTimeout(() => {
          const first = document.querySelector('[aria-invalid="true"]');
          if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.focus?.(); }
        }, 50);
      })}
      noValidate
    >
      {/* Page header */}
      <div className="pb-2">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          ขอใบเสนอราคาอบรมแบบ In-house
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          ส่งข้อมูล Requirement เบื้องต้น ทีมขายจะติดต่อกลับพร้อมใบเสนอราคาภายใน 1-2 วันทำการ
        </p>
      </div>

      {/* ── Section 1: Course & Requirement ── */}
      <FormSection icon={<FileText className="h-5 w-5" />} title="หลักสูตร & Training Requirement">

        {/* Course dropdown */}
        <FieldGroup label="หลักสูตรที่สนใจ" required error={!courseInterested && errors.coursesInterested ? 'กรุณาเลือกหลักสูตร' : undefined}>
          <select
            value={courseInterested}
            onChange={(e) => setCourseInterested(e.target.value)}
            className={cn(selectCls(), !courseInterested && errors.coursesInterested ? 'border-9e-accent' : '')}
          >
            <option value="">— เลือกหลักสูตร —</option>
            {Object.entries(coursesByProgram)
              .sort(([a], [b]) => a.localeCompare(b, 'th'))
              .map(([program, list]) => (
                <optgroup key={program} label={program}>
                  {list
                    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </optgroup>
              ))}
          </select>
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            หากต้องการหลักสูตร custom หรือหลายหลักสูตร กรุณาระบุในหมายเหตุด้านล่าง
          </p>
        </FieldGroup>

        {/* Participant count + skill level */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-2 block">
              จำนวนผู้เข้าอบรม (โดยประมาณ) <span className="text-9e-accent">*</span>
            </Label>
            <div className="flex items-center overflow-hidden rounded-9e-md border border-[var(--surface-border)] w-fit">
              <button type="button"
                onClick={() => setValue('participantsCount', Math.max(1, participantsCount - 1))}
                className="flex h-10 w-10 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] transition-colors">
                <Minus className="h-4 w-4" />
              </button>
              <div className="flex h-10 min-w-[52px] items-center justify-center border-x border-[var(--surface-border)] px-3 text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {participantsCount}
              </div>
              <button type="button"
                onClick={() => setValue('participantsCount', Math.min(999, participantsCount + 1))}
                className="flex h-10 w-10 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] transition-colors">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">In-house เริ่มต้น 15 ท่านต่อรุ่น</p>
          </div>

          <FieldGroup label="ระดับพื้นฐานของผู้เข้าอบรม" error={errors.skillLevel?.message}>
            <select {...register('skillLevel')} className={selectCls()}>
              {SKILL_LEVELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldGroup>
        </div>

        {/* Objective */}
        <FieldGroup label="วัตถุประสงค์ในการอบรม" required error={errors.objective?.message}>
          <Textarea
            {...register('objective')}
            rows={3}
            placeholder="เช่น ต้องการให้ทีมใช้ Power BI ทำ Dashboard ภายในองค์กร หรือยกระดับการใช้ Excel ร่วมกับ AI"
            aria-invalid={!!errors.objective}
          />
        </FieldGroup>

        {/* Content mode */}
        <div>
          <Label className="mb-2 block">รูปแบบเนื้อหาที่ต้องการ</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {CONTENT_MODES.map(({ value, label, desc, icon: Icon }) => {
              const active = contentMode === value;
              return (
                <button key={value} type="button" onClick={() => setValue('contentMode', value)}
                  className={cn('flex flex-col gap-2 rounded-9e-lg border p-4 text-left transition-all',
                    active ? 'border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/20' : 'border-[var(--surface-border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]')}>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-9e-md',
                    active ? 'bg-9e-brand text-9e-ice' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">{label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {contentMode !== 'standard' && (
          <FieldGroup label="รายละเอียดเนื้อหาที่ต้องการเพิ่มเติม" error={errors.contentDetails?.message}>
            <Textarea {...register('contentDetails')} rows={3}
              placeholder="เช่น ต้องการใช้ไฟล์งานจริง, workshop เฉพาะทีม, ปรับหัวข้อบางส่วน" />
          </FieldGroup>
        )}
      </FormSection>

      {/* ── Section 2: Schedule & Format ── */}
      <FormSection icon={<Calendar className="h-5 w-5" />} title="ตารางเวลา & รูปแบบการอบรม">

        {/* Schedule mode */}
        <div>
          <Label className="mb-2 block">ช่วงเวลาที่สะดวก</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {SCHEDULE_MODES.map(({ value, label, desc, icon: Icon }) => {
              const active = scheduleMode === value;
              return (
                <button key={value} type="button" onClick={() => setValue('scheduleMode', value)}
                  className={cn('flex flex-col gap-2 rounded-9e-lg border p-4 text-left transition-all',
                    active ? 'border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/20' : 'border-[var(--surface-border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]')}>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-9e-md',
                    active ? 'bg-9e-brand text-9e-ice' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">{label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {scheduleMode === 'month' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="เดือนที่สนใจ" required error={errors.preferredMonth?.message}>
              <select {...register('preferredMonth')} className={selectCls()} aria-invalid={!!errors.preferredMonth}>
                <option value="">— เลือกเดือน —</option>
                {THAI_MONTHS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FieldGroup>
            <FieldGroup label="หมายเหตุเรื่องวันอบรม" error={errors.scheduleNote?.message}>
              <Input {...register('scheduleNote')} placeholder="เช่น ขอเป็นวันศุกร์ หรือ 2 วันติดกัน" />
            </FieldGroup>
          </div>
        )}

        {scheduleMode === 'dateRange' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <FieldGroup label="วันที่เริ่มต้น" required error={errors.preferredDateFrom?.message}>
              <Input {...register('preferredDateFrom')} placeholder="เช่น 15/07/2026" aria-invalid={!!errors.preferredDateFrom} />
            </FieldGroup>
            <FieldGroup label="วันที่สิ้นสุด" error={errors.preferredDateTo?.message}>
              <Input {...register('preferredDateTo')} placeholder="เช่น 16/07/2026" />
            </FieldGroup>
            <FieldGroup label="หมายเหตุ">
              <Input {...register('scheduleNote')} placeholder="เช่น 2 วันติดกัน" />
            </FieldGroup>
          </div>
        )}

        {scheduleMode === 'notSure' && (
          <div className="rounded-9e-md border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
            สามารถส่งคำขอโดยยังไม่ระบุวันได้ เจ้าหน้าที่จะติดต่อกลับเพื่อช่วยประเมินช่วงเวลา
          </div>
        )}

        {/* Training format */}
        <div>
          <Label className="mb-2 block">รูปแบบการอบรม</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {TRAINING_FORMATS.map(({ value, label, desc, icon: Icon }) => {
              const active = trainingFormat === value;
              return (
                <button key={value} type="button" onClick={() => setValue('trainingFormat', value)}
                  className={cn('flex flex-col gap-2 rounded-9e-lg border p-4 text-left transition-all',
                    active ? 'border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/20' : 'border-[var(--surface-border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]')}>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-9e-md',
                    active ? 'bg-9e-brand text-9e-ice' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">{label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {isOnsite && (
          <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4 space-y-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">รายละเอียดสถานที่จัดอบรม</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldGroup label="ที่อยู่สถานที่" required error={errors.onsiteAddress?.message} className="sm:col-span-2">
                <Input {...register('onsiteAddress')} placeholder="อาคาร / ชั้น / ห้อง / ถนน" aria-invalid={!!errors.onsiteAddress} />
              </FieldGroup>
              <FieldGroup label="จังหวัด" error={errors.onsiteProvince?.message}>
                <Input {...register('onsiteProvince')} placeholder="เช่น กรุงเทพมหานคร" />
              </FieldGroup>
              <FieldGroup label="เขต / อำเภอ" error={errors.onsiteDistrict?.message}>
                <Input {...register('onsiteDistrict')} placeholder="เช่น พญาไท" />
              </FieldGroup>
            </div>
            <div>
              <Label className="mb-2 block text-xs">อุปกรณ์ที่มีให้</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {ONSITE_EQUIPMENT.map((item) => {
                  const active = (watch('onsiteEquipment') ?? []).includes(item);
                  return (
                    <label key={item} className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-9e-md border px-3 py-2 text-sm transition-colors',
                      active ? 'border-9e-brand bg-9e-brand/5 text-[var(--text-primary)]' : 'border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-secondary)]'
                    )}>
                      <input type="checkbox" checked={active} onChange={() => toggleEquipment(item)} className="h-4 w-4 rounded accent-9e-brand" />
                      {item}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {isOnline && (
          <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldGroup label="ผู้เข้าอบรมอยู่พื้นที่ใดเป็นหลัก" error={errors.onlineRegion?.message}>
                <Input {...register('onlineRegion')} placeholder="เช่น กรุงเทพฯ, ต่างจังหวัด, ต่างประเทศ" />
              </FieldGroup>
              <FieldGroup label="ข้อจำกัดด้านเวลา / Time zone" error={errors.onlineTimezone?.message}>
                <Input {...register('onlineTimezone')} placeholder="เช่น สะดวก 09:00-16:00 เวลาไทย" />
              </FieldGroup>
            </div>
          </div>
        )}
      </FormSection>

      {/* ── Section 3: Contact Person ── */}
      <FormSection icon={<Phone className="h-5 w-5" />} title="ผู้ประสานงาน">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="ชื่อ" required error={errors.contactFirstName?.message}>
            <Input {...register('contactFirstName')} placeholder="กรุณากรอกชื่อ" aria-invalid={!!errors.contactFirstName} />
          </FieldGroup>
          <FieldGroup label="นามสกุล" required error={errors.contactLastName?.message}>
            <Input {...register('contactLastName')} placeholder="กรุณากรอกนามสกุล" aria-invalid={!!errors.contactLastName} />
          </FieldGroup>
          <FieldGroup label="ตำแหน่ง" error={errors.contactRole?.message}>
            <Input {...register('contactRole')} placeholder="เช่น HR Manager" />
          </FieldGroup>
          <FieldGroup label="แผนก" error={errors.contactDepartment?.message}>
            <Input {...register('contactDepartment')} placeholder="เช่น Human Resources" />
          </FieldGroup>
          <FieldGroup label="บริษัท / องค์กร" required error={errors.companyName?.message} className="sm:col-span-2">
            <Input {...register('companyName')} placeholder="เช่น บริษัท ตัวอย่าง จำกัด" aria-invalid={!!errors.companyName} />
          </FieldGroup>
          <FieldGroup label="อีเมล" required error={errors.contactEmail?.message}>
            <Input type="email" {...register('contactEmail')} placeholder="name@company.com" aria-invalid={!!errors.contactEmail} />
          </FieldGroup>
          <FieldGroup label="เบอร์โทรศัพท์" required error={errors.contactPhone?.message}>
            <Input type="tel" {...register('contactPhone')} placeholder="เช่น 0812345678" aria-invalid={!!errors.contactPhone} />
          </FieldGroup>
        </div>
      </FormSection>

      {/* ── Section 4: Quotation (Corporate only) ── */}
      <FormSection icon={<Building2 className="h-5 w-5" />} title="ข้อมูลสำหรับออกใบเสนอราคา">
        <p className="text-xs text-[var(--text-muted)]">
          ข้อมูลนี้ใช้สำหรับออกใบเสนอราคา — ไม่บังคับ ทีมขายจะติดต่อขอเพิ่มเติมหากจำเป็น
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="ประเทศ / Country" required>
            <select
              value={quotationCountry}
              onChange={(e) => handleCountryChange(e.target.value)}
              className={selectCls()}
            >
              <option value="TH">Thailand</option>
              <option value="OTHER">Other country</option>
            </select>
          </FieldGroup>
          <FieldGroup label={isTH ? 'ชื่อบริษัทสำหรับออกใบเสนอราคา' : 'Company name for quotation'} error={errors.quotationCompany?.message}>
            <Input {...register('quotationCompany')} placeholder={isTH ? 'บริษัท ตัวอย่าง จำกัด' : 'Company Inc.'} />
          </FieldGroup>
        </div>

        {isTH ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="เลขประจำตัวผู้เสียภาษี 13 หลัก" error={errors.taxId?.message}>
              <Input {...register('taxId')} placeholder="13 หลัก" inputMode="numeric" maxLength={13} />
            </FieldGroup>
            <FieldGroup label="สาขา" error={errors.branch?.message}>
              <Input {...register('branch')} placeholder="สำนักงานใหญ่ / สาขาเลขที่" />
            </FieldGroup>
            <div className="sm:col-span-2">
              <ThaiAddressFields
                value={watch('thaiAddress') ?? { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' }}
                onChange={(next) => setValue('thaiAddress', next, { shouldValidate: true })}
                errors={errors}
                prefix="thaiAddress"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Tax ID / VAT ID (optional)" error={errors.taxId?.message}>
              <Input {...register('taxId')} placeholder="Optional for international" />
            </FieldGroup>
            <FieldGroup label="Country" required error={errors.internationalAddress?.country?.message}>
              <Input {...register('internationalAddress.country')} placeholder="e.g. Singapore" />
            </FieldGroup>
            <FieldGroup label="Address line 1" required error={errors.internationalAddress?.line1?.message} className="sm:col-span-2">
              <Input {...register('internationalAddress.line1')} placeholder="Street address" />
            </FieldGroup>
            <FieldGroup label="Address line 2 (optional)" error={errors.internationalAddress?.line2?.message} className="sm:col-span-2">
              <Input {...register('internationalAddress.line2')} placeholder="Apt, suite, building" />
            </FieldGroup>
            <FieldGroup label="City" required error={errors.internationalAddress?.city?.message}>
              <Input {...register('internationalAddress.city')} placeholder="City" />
            </FieldGroup>
            <FieldGroup label="State / Province (optional)" error={errors.internationalAddress?.state?.message}>
              <Input {...register('internationalAddress.state')} placeholder="State or region" />
            </FieldGroup>
            <FieldGroup label="Postal code (optional)" error={errors.internationalAddress?.postalCode?.message}>
              <Input {...register('internationalAddress.postalCode')} placeholder="Postal code" />
            </FieldGroup>
          </div>
        )}
      </FormSection>

      {/* ── Section 5: Notes ── */}
      <FormSection icon={<StickyNote className="h-5 w-5" />} title="หมายเหตุเพิ่มเติม">
        <Textarea
          {...register('message')}
          rows={4}
          placeholder="ระบุข้อมูลเพิ่มเติม เช่น หลักสูตร custom ที่ต้องการซึ่งไม่อยู่ใน dropdown ด้านบน, PO number, เงื่อนไขพิเศษ"
        />
      </FormSection>

      {/* Error + Submit */}
      {Object.keys(errors).length > 0 && (
        <div className="rounded-9e-md border border-9e-accent/40 bg-9e-accent/5 p-4 text-sm text-9e-accent">
          กรุณาตรวจสอบและแก้ไขข้อมูลที่ไม่ถูกต้องก่อนส่งคำขอ
        </div>
      )}
      {submitError && (
        <div className="rounded-9e-md border border-9e-accent/40 bg-9e-accent/5 p-4 text-sm text-9e-accent">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-2">
        <p className="text-xs text-[var(--text-muted)]">
          ทีมขายจะติดต่อกลับภายใน 1-2 วันทำการ
        </p>
        <Button type="submit" variant="cta" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอใบเสนอราคา'}
        </Button>
      </div>
    </form>
  );
}

// ── Shared atoms ───────────────────────────────────────────────────

function FormSection({ icon, title, children }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6 space-y-5">
      <div className="flex items-center gap-3 border-b border-[var(--surface-border)] pb-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-9e-md bg-9e-brand/10 text-9e-action">
          {icon}
        </span>
        <h2 className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FieldGroup({ label, error, required, children, className }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">
        {label}
        {required && <span className="ml-0.5 text-9e-accent">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-9e-accent">{error}</p>}
    </div>
  );
}

function selectCls() {
  return cn(
    'h-10 w-full rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
    'border-[var(--surface-border)]',
    'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
  );
}