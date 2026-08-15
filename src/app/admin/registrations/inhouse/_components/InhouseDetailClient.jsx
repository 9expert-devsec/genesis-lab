'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Pencil, Trash2, Check, X, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  updateInhouseStatus,
  updateInhouseAdminNotes,
  deleteInhouseRegistration,
} from '@/lib/actions/inhouse-registrations';
import { formatBranchLabel } from '@/lib/registration/branchLabel';
import { Button } from '@/components/ui/button';
import { refNo } from '@/lib/refNo';
import { monthLongLabel } from '@/lib/schedule/monthWindow';
import { formatBillingAddress } from '@/lib/address/formatBillingAddress';
import { formatThaiAddress } from '@/lib/address/formatThaiAddress';
import {
  INHOUSE_STATUS_TRANSITIONS,
  allowedTransitions,
  effectiveStatus,
  statusLabel,
} from '@/lib/registrations/statuses';

// ── Constants ──────────────────────────────────────────────────────

const STATUS_BADGE = {
  pending:       'bg-amber-100 text-amber-700',
  quoted:        'bg-blue-100 text-blue-700',
  cancelled:     'bg-slate-100 text-slate-500',
  // RETIRED, and kept until the enum is narrowed. Real documents still hold
  // these for the window between this deploying and the migration's --apply,
  // and a badge with no entry falls back to grey — which would turn the whole
  // unmigrated backlog grey rather than showing what each record says.
  new:           'bg-violet-100 text-violet-700',
  contacted:     'bg-blue-100 text-blue-700',
  'closed-won':  'bg-emerald-100 text-emerald-700',
  'closed-lost': 'bg-slate-100 text-slate-500',
};

/**
 * ── THERE IS NO STATUS-ACTION MAP IN THIS FILE ANY MORE ─────────────────────
 *
 * It used to be a hand-written literal here:
 *
 *   { new: ['contacted','closed-lost'], contacted: ['quoted','closed-lost'],
 *     quoted: ['closed-won','closed-lost'], 'closed-won': ['contacted'],
 *     'closed-lost': ['new'] }
 *
 * and it was the ONLY place the in-house rules existed — `updateInhouseStatus`
 * checked that the target was a member of the status set and nothing else. In a
 * Next app every `'use server'` export is a POST endpoint, so that literal was
 * load-bearing security in a client component. This is the same defect round 1
 * removed from the public detail screen, in the file next door.
 *
 * Note what the old table permitted and the new one does not: `closed-lost →
 * new` un-cancelled a record. Cancellation is TERMINAL now, on both sides.
 *
 * ACTION_LABEL / ACTION_VARIANT are keyed by TARGET, not by from-state, and
 * carry only the two targets an admin can still choose. They are presentation,
 * not rules: a target with no entry renders NO BUTTON, so a new edge added to
 * the table and forgotten here is a missing affordance rather than an
 * unlabelled trap. The fs tier pins the two lists against each other.
 */
const ACTION_LABEL = {
  quoted:    'ส่งใบเสนอราคา',
  cancelled: 'ยกเลิกคำขอ',
};

const ACTION_VARIANT = {
  quoted:    'primary',
  cancelled: 'outline',
};

// 'consult' and 'flexible' are LEGACY VALUES — both cards were removed from the
// form, but this view reads historical enquiries that still carry them and a
// missing label would render the raw enum instead.
const CONTENT_MODE_LABEL = {
  standard: 'Outline มาตรฐาน',
  custom:   'ปรับเนื้อหา',
  consult:  'ให้แนะนำ',
};

const TRAINING_FORMAT_LABEL = {
  onsite:   'Onsite',
  online:   'Online',
  flexible: 'ยังไม่ระบุ (Flexible)',
};

/*
 * NO `PREFERRED_CONTACT_LABEL` / `PREFERRED_TIME_LABEL` — the ช่องทางติดต่อ
 * ที่สะดวก row they fed is GONE. Do not restore it.
 *
 * The form stopped asking. `preferredContact` and `preferredContactTime` are
 * still on the Mongoose schema with zod DEFAULTS ('email' / 'business'), so the
 * row printed "Email · เวลาทำการ (09:00-17:00)" on every current enquiry — a
 * stated preference nobody ever stated, presented to a salesperson about to
 * pick up the phone.
 *
 * AND IT CANNOT BE GATED. "Show it only when it is not the default" is
 * unknowable: a default written because the field was absent and a deliberate
 * choice of that same value are byte-identical in the stored document. There is
 * no flag distinguishing them and no timestamp that helps. The only honest
 * options were "always wrong on new enquiries" or "gone", and the row carried
 * no information on any document written since the form changed.
 *
 * If the form ever asks again, the row comes back WITH the field — not before.
 */

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} น.`;
}



/**
 * NO `scheduleMode` BRANCH — the selector is gone and `preferredMonth` is the
 * only thing a current enquiry carries.
 *
 * The date-range fallback stays for one reason and it is not the removed
 * branch: this view is the ONLY place a pre-change enquiry can still be read,
 * and those documents really do hold a range and no month. Reading the fields
 * rather than the mode is what lets the dead selector go without blinding the
 * sales team to their own back catalogue.
 */
function scheduleSummary(doc) {
  // `preferredMonth` is stored as the form <select>'s `YYYY-MM` VALUE, not as
  // the Thai label shown next to it — so this row read `เดือน: 2026-09` to the
  // sales team. `monthLongLabel` returns an unparseable key unchanged, so a
  // legacy document holding some other spelling still renders what it holds.
  if (doc.preferredMonth) return `เดือน: ${monthLongLabel(doc.preferredMonth)}`;
  const legacyRange = [doc.preferredDateFrom, doc.preferredDateTo].filter(Boolean).join(' ถึง ');
  return legacyRange || '—';
}

/**
 * The venue, from the structured `onsiteVenue` — falling back to the three
 * legacy string paths, which is the whole reason they were kept rather than
 * re-typed. An enquiry submitted before the change has strings and no
 * subdocument; one submitted after has the subdocument and no strings.
 */
function onsiteVenueSummary(doc) {
  const v = doc.onsiteVenue;
  if (v && (v.addressLine || v.province)) {
    // The VENUE goes through the prefix primitive directly, never through
    // "billing" — see the note on training_venue in
    // src/lib/email/models/inhouseRegistrationModel.js.
    return formatThaiAddress(v);
  }
  // The THREE LEGACY STRING PATHS are left as a plain join on purpose: they are
  // free text (`onsiteAddress`, `onsiteDistrict`, `onsiteProvince`), not the
  // structured subdocument, so there is no subDistrict to label and nothing to
  // tell a district from a province. Prefixing free text would invent
  // precision the stored value never had.
  return [doc.onsiteAddress, doc.onsiteDistrict, doc.onsiteProvince].filter(Boolean).join(', ');
}

/**
 * The quotation address, through the shared formatter — same adapter as
 * src/app/api/registration/inhouse/route.js, so this screen shows the sales
 * team the same string the customer was mailed.
 *
 * ONE BEHAVIOUR CHANGE BEYOND THE PREFIXES, and it is a fix. The old code
 * required `quotationCountry === 'TH'` before it would render `thaiAddress`,
 * so a document with an address but no country — which the current schema
 * cannot produce (`z.enum(['TH','OTHER']).default('TH')`) but a legacy row
 * can — displayed a BLANK address. The formatter's `country ?? 'TH'` default
 * renders it instead. Blank was never the right answer for a row that has an
 * address sitting in it.
 */
function quotationAddress(doc) {
  return formatBillingAddress({
    country: doc.quotationCountry,
    thaiAddress: doc.thaiAddress,
    internationalAddress: doc.internationalAddress,
  });
}

// ── Main Component ─────────────────────────────────────────────────

export function InhouseDetailClient({ doc, courses = [] }) {
  const router = useRouter();

  const [status,      setStatus]      = useState(doc.status);
  const [adminNotes,  setAdminNotes]  = useState(doc.adminNotes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [busy,        setBusy]        = useState(null);
  const [error,       setError]       = useState(null);
  const [, startTransition] = useTransition();

  /**
   * THE BUTTONS ARE A PROJECTION OF THE SHARED TABLE.
   *
   * `effectiveStatus` first, because a document the migration has not reached
   * yet holds a RETIRED value which has no row in the three-value table.
   * `allowedTransitions('new')` is [], so without this every unmigrated
   * enquiry would render a toolbar with nothing in it — at the time of writing,
   * six of the eight documents in the collection.
   *
   * The BADGE below deliberately does NOT go through `effectiveStatus`: it
   * renders `statusLabel(status)`, the value the record actually holds. What
   * the record says and what an admin may do to it are different questions.
   *
   * The `.filter` on ACTION_LABEL means an unlabelled edge degrades to no
   * button rather than to a button with no text — see the note on the maps.
   */
  const liveStatus    = effectiveStatus(status, 'inhouse');
  const statusActions = allowedTransitions(liveStatus, INHOUSE_STATUS_TRANSITIONS)
    .filter((next) => ACTION_LABEL[next]);

  /**
   * A CANCELLED REQUEST IS READ-ONLY, AND THE SCREEN SAYS SO.
   *
   * `updateInhouseAdminNotes` refuses the write regardless of what renders here
   * — the lock is in the query filter, not in this flag. What this flag does is
   * stop the screen OFFERING an edit that would be refused: a แก้ไข button that
   * opens a textarea, accepts typing and then fails on save is a worse
   * experience than no button at all.
   *
   * `statusActions` is already empty for `cancelled` (the table has no outgoing
   * edges), so the status buttons need no separate flag. DELETE IS DELIBERATELY
   * STILL AVAILABLE; see the ruling in lib/actions/inhouse-registrations.js.
   */
  const readOnly = liveStatus === 'cancelled';

  const handleStatusAction = (next) => {
    /**
     * CANCELLATION IS IRREVERSIBLE AND THE DIALOG HAS TO SAY SO. The table has
     * no edge out of `cancelled`, so an admin who confirms this by reflex —
     * expecting to be able to undo it, as the old `closed-lost → new` edge
     * allowed — has no way back except delete.
     */
    const message = next === 'cancelled'
      ? `ยกเลิกคำขอนี้?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้ (ยังลบได้)`
      : `เปลี่ยนสถานะเป็น "${statusLabel(next)}"?`;
    if (!window.confirm(message)) return;
    setBusy(next); setError(null);
    startTransition(async () => {
      const res = await updateInhouseStatus(doc._id, next);
      if (res.ok) setStatus(next);
      else setError(res.error || 'เกิดข้อผิดพลาด');
      setBusy(null);
    });
  };

  const handleSaveNotes = () => {
    setBusy('save-notes'); setError(null);
    startTransition(async () => {
      const res = await updateInhouseAdminNotes(doc._id, adminNotes);
      if (res.ok) setEditingNotes(false);
      else setError(res.error || 'บันทึกไม่สำเร็จ');
      setBusy(null);
    });
  };

  const handleCancelNotes = () => {
    setAdminNotes(doc.adminNotes ?? '');
    setEditingNotes(false);
  };

  const handleDelete = () => {
    if (!window.confirm(`ลบ Request ${refNo(doc._id)} ถาวร?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    setBusy('delete'); setError(null);
    startTransition(async () => {
      const res = await deleteInhouseRegistration(doc._id);
      if (res.ok) router.push('/admin/registrations?source=inhouse');
      else { setError(res.error || 'ลบไม่สำเร็จ'); setBusy(null); }
    });
  };

  const address = quotationAddress(doc);
  const venue = onsiteVenueSummary(doc);
  const countryLabel = doc.quotationCountry === 'OTHER' ? 'ต่างประเทศ' : 'ไทย';

  /**
   * TWO COMPANY NAMES, ONE ROW — until they disagree.
   *
   * `companyName` is a legacy-compat MIRROR: the API route writes it from
   * `quotationCompany` in one line, so on every document written since the form
   * was consolidated the two are the SAME STRING, and printing both was the
   * page telling a reader twice.
   *
   * On the legacy documents they DIVERGE, because the old form had two separate
   * inputs and people filled them in differently — which is the whole reason
   * they were consolidated. That divergence is real data about an old record,
   * and this screen is the only place it can still be seen, so it is surfaced
   * rather than resolved: pick one silently and a salesperson calling the
   * contact company would never learn the quotation names a different entity.
   */
  const contactCompany   = (doc.companyName ?? '').trim();
  const quotationCompany = (doc.quotationCompany ?? '').trim();
  const companyDiverges  = Boolean(contactCompany && quotationCompany && contactCompany !== quotationCompany);
  const displayCompany   = companyDiverges ? contactCompany : (quotationCompany || contactCompany);
  // A foreign quotation has no Thai branch concept at all, so the row is
  // suppressed rather than defaulted to สำนักงานใหญ่.
  const branchLabel = doc.quotationCountry === 'OTHER'
    ? ''
    : formatBranchLabel({ branchType: doc.branchType, branchCode: doc.branchCode, legacyBranch: doc.branch });

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => router.back()}
            className="mb-3 flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-9e-action">
            <ArrowLeft className="h-4 w-4" />กลับรายการ
          </button>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            In-house Request <span className="font-mono text-9e-action">{refNo(doc._id)}</span>
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">ส่งคำขอเมื่อ {fmtDate(doc.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <span className={cn('inline-block rounded-full px-3 py-1 text-sm font-semibold', STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-600')}>
            {statusLabel(status)}
          </span>
          {statusActions.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {statusActions.map((next) => (
                <Button key={next} variant={ACTION_VARIANT[next]} size="sm" onClick={() => handleStatusAction(next)} disabled={busy !== null}>
                  {busy === next && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {ACTION_LABEL[next]}
                </Button>
              ))}
            </div>
          )}
          {/* Without this line the missing แก้ไข button reads as a bug. It says
              the rule, and says delete is still available, because that is the
              next question anyone asks when a screen goes read-only. The same
              copy as the public client, one word apart: this is a คำขอ, not a
              ใบสมัคร. */}
          {readOnly && (
            <p className="max-w-[16rem] text-right text-xs text-[var(--text-muted)]">
              คำขอนี้ถูกยกเลิกแล้ว จึงแก้ไขข้อมูลไม่ได้ (ยังลบได้)
            </p>
          )}
          <button type="button" onClick={handleDelete} disabled={busy !== null}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-9e-accent transition-colors disabled:opacity-40">
            {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            ลบ Request นี้
          </button>
          {error && <p className="text-xs text-9e-accent">{error}</p>}
        </div>
      </div>

      {/* ── Contact / Company ── */}
      <Card title="ผู้ประสานงาน & บริษัท">
        <Row
          label={companyDiverges ? 'บริษัท / องค์กร (ที่ติดต่อ)' : 'บริษัท / องค์กร'}
          value={displayCompany}
          action={displayCompany
            ? <CopyButton value={displayCompany} label={companyDiverges ? 'ชื่อบริษัทที่ติดต่อ' : 'ชื่อบริษัท'} />
            : null}
        />
        <Row label="ชื่อ-นามสกุล" value={`${doc.contactFirstName ?? ''} ${doc.contactLastName ?? ''}`.trim()} />
        <Row label="ตำแหน่ง / แผนก" value={[doc.contactRole, doc.contactDepartment].filter(Boolean).join(' · ')} />
        <Row label="อีเมล" value={doc.contactEmail
          ? <a href={`mailto:${doc.contactEmail}`} className="text-9e-action hover:underline">{doc.contactEmail}</a>
          : ''} />
        <Row label="เบอร์โทร" value={doc.contactPhone
          ? <a href={`tel:${doc.contactPhone}`} className="text-9e-action hover:underline">{doc.contactPhone}</a>
          : ''} />
        <Row label="LINE ID" value={doc.contactLine} />
      </Card>

      {/* ── Training Requirement ── */}
      <Card title="Training Requirement">
        {/*
          NAME over CODE, the same two-line shape the in-house LIST column uses.
          Resolved server-side and handed in as `courses`; a miss keeps the code
          as the primary line rather than blanking — see the page's docstring.

          The empty hint stays: an enquiry naming NO course is a data fault a
          salesperson has to see, not a row to hide.
        */}
        <Row label="หลักสูตรที่สนใจ" wide emptyHint="ไม่ได้ระบุหลักสูตร"
          value={courses.length > 0 ? <CourseList courses={courses} /> : ''} />
        <Row label="จำนวนผู้เข้าอบรม" value={`${doc.participantsCount} ท่าน`} />
        <Row label="เนื้อหา" value={CONTENT_MODE_LABEL[doc.contentMode] ?? doc.contentMode} />
        <Row label="รายละเอียดเนื้อหา" wide value={doc.contentDetails} />
      </Card>

      {/* ── Schedule & Format ── */}
      <Card title="ตารางเวลา & รูปแบบการอบรม">
        <Row label="ช่วงเวลา" value={scheduleSummary(doc)} />
        <Row label="หมายเหตุเวลา" value={doc.scheduleNote} />
        <Row label="รูปแบบ" value={TRAINING_FORMAT_LABEL[doc.trainingFormat] ?? doc.trainingFormat} />
        {doc.trainingFormat === 'online' && (
          <>
            <Row label="พื้นที่ผู้เข้าอบรม" value={doc.onlineRegion} />
            <Row label="ข้อจำกัดด้านเวลา" value={doc.onlineTimezone} />
          </>
        )}
        {/*
          THE VENUE KEEPS ITS EMPTY STATE, deliberately, against the general
          "absent means absent" rule: an ONSITE enquiry with no venue is not a
          blank field, it is the next phone call. Hiding the row would hide the
          job.
        */}
        {doc.trainingFormat === 'onsite' && (
          <Row label="สถานที่จัดอบรม" wide value={venue} emptyHint="ยังไม่ได้ระบุ — ต้องสอบถามลูกค้า"
            action={venue ? <CopyButton value={venue} label="สถานที่จัดอบรม" /> : null} />
        )}
      </Card>

      {/* ── Quotation ── */}
      <Card title="ข้อมูลใบเสนอราคา">
        <Row label="ประเทศ" value={countryLabel} />
        {/* Only when it disagrees with the contact company — see companyDiverges. */}
        {companyDiverges && (
          <Row label="ชื่อบริษัท (ใบเสนอราคา)" value={quotationCompany}
            action={<CopyButton value={quotationCompany} label="ชื่อบริษัทสำหรับใบเสนอราคา" />} />
        )}
        <Row label="เลขผู้เสียภาษี" value={doc.taxId}
          action={doc.taxId ? <CopyButton value={doc.taxId} label="เลขผู้เสียภาษี" /> : null} />
        {/* Derived at read time. `branch` is legacy read-only and is the
            fallback for pre-split enquiries — see branchLabel.js. */}
        <Row label="สาขา" value={branchLabel} />
        <Row label="ที่อยู่" wide value={address}
          action={address ? <CopyButton value={address} label="ที่อยู่สำหรับใบเสนอราคา" /> : null} />
      </Card>

      {/* ── Message ── */}
      {doc.message && (
        <Card title="หมายเหตุจากลูกค้า" plain>
          <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{doc.message}</p>
        </Card>
      )}

      {/* ── Admin notes (editable) ── */}
      <CardEditable
        title="บันทึกภายในของทีมขาย"
        readOnly={readOnly}
        isEditing={editingNotes}
        isSaving={busy === 'save-notes'}
        onEdit={() => setEditingNotes(true)}
        onSave={handleSaveNotes}
        onCancel={handleCancelNotes}
      >
        {editingNotes ? (
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="บันทึกการติดต่อ ข้อเสนอ การเจรจา ฯลฯ"
            className="w-full resize-y rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand"
          />
        ) : (
          <p className={cn('whitespace-pre-wrap text-sm', adminNotes ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] italic')}>
            {adminNotes || 'ยังไม่มีบันทึกจากทีมขาย'}
          </p>
        )}
      </CardEditable>

      {/* ── Meta ── */}
      <Card title="ข้อมูลระบบ">
        <Row label="Request ID"   value={<span className="font-mono text-xs">{doc._id}</span>} />
        <Row label="แหล่งที่มา"    value={doc.source ?? 'inhouse'} />
        <Row label="IP Address"   value={doc.ipAddress} />
        <Row label="อัปเดตล่าสุด"  value={fmtDate(doc.updatedAt)} />
      </Card>
    </div>
  );
}

// ── Shared atoms ───────────────────────────────────────────────────

/**
 * A card of label/value rows — TWO COLUMNS from `md` up.
 *
 * The screen was six stacked cards of single-column rows against a 176px label
 * gutter, so a short value like "20 ท่าน" left most of a 4xl container empty
 * and the page read as mostly whitespace. Pairing short rows halves the height
 * and puts related fields side by side; anything long (an address, a course
 * list, free text) opts out with `wide` and spans both.
 *
 * `<dl>` rather than a div, because the rows are dt/dd pairs and always were —
 * they were just sitting in a div, which is invalid. The grid lives on the dl
 * so each Row is a grid ITEM and `wide` can be a plain col-span.
 *
 * `plain` is for the one card whose body is prose, not rows: dt/dd have no
 * meaning there and a paragraph cannot be a child of <dl>.
 */
function Card({ title, children, plain = false }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">{title}</h2>
      {plain
        ? <div className="space-y-3">{children}</div>
        : <dl className="grid gap-x-8 gap-y-3.5 md:grid-cols-2">{children}</dl>}
    </section>
  );
}

/**
 * `coursesInterested` resolved to names, with the code kept underneath.
 *
 * Name as the primary line and the code in mono beneath it — the same
 * treatment the in-house LIST cell uses, so the two screens agree. The code
 * stays visible because sales staff search by it and it is the thing they
 * paste; replacing it with the name would have traded one unusable value for
 * another.
 *
 * A MISS PROMOTES THE CODE rather than blanking: `name` is null when the
 * lookup failed or upstream was down, and a blank course on a quote request is
 * worse than an ugly one.
 */
function CourseList({ courses }) {
  return (
    <ul className="space-y-1.5">
      {courses.map(({ code, name }) => (
        <li key={code}>
          <span className="block text-sm text-[var(--text-primary)]">{name || code}</span>
          {name && <span className="block font-mono text-xs text-[var(--text-muted)]">{code}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Copy one value to the clipboard, with a state a human can actually read.
 *
 * ── THE VALUE IS PASSED IN, NEVER SCRAPED ───────────────────────────────────
 * `value` is the same string the row renders. Reading it back out of the DOM
 * with `textContent` would pick up the label and whatever whitespace the layout
 * introduces, so the clipboard would quietly stop matching what the reader saw
 * — and nothing on screen would reveal it. Both addresses already come from the
 * shared Thai formatter as ONE string, so there is nothing to re-join here
 * either; a second assembly is a second thing to drift, which is exactly what
 * the address round removed.
 *
 * ── IT CAN FAIL, AND THE FAILURE IS VISIBLE ─────────────────────────────────
 * `navigator.clipboard.writeText` returns a promise and rejects on a denied
 * permission; the API is absent entirely outside a secure context. Firing the
 * success state optimistically would tell a salesperson the address is on their
 * clipboard when it is not, and they would paste the previous one into a
 * quotation. So the success state waits for the promise, and a rejection shows
 * a distinct failed state — the value stays on screen and selectable, which is
 * the fallback.
 *
 * The label names WHICH address; there are two on this page and "copy" alone
 * is ambiguous to a screen reader. The live region announces the outcome,
 * because the icon swap alone is invisible to one.
 */
function CopyButton({ value, label }) {
  const [state, setState] = useState('idle'); // 'idle' | 'ok' | 'fail'
  const timer = useRef(null);

  // The flash is on a timer, and a click that unmounts the row mid-flash would
  // otherwise set state on a dead component.
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (next) => {
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1800);
  };

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      flash('ok');
    } catch {
      flash('fail');
    }
  };

  const Icon = state === 'ok' ? Check : state === 'fail' ? X : Copy;

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`คัดลอก${label}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-9e-sm border px-2 py-1 text-xs font-medium transition-colors',
        state === 'ok'   && 'border-9e-brand/40 text-9e-action',
        state === 'fail' && 'border-9e-accent/40 text-9e-accent',
        state === 'idle' && 'border-[var(--surface-border)] text-[var(--text-muted)] hover:text-9e-action'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span aria-live="polite">
        {state === 'ok' ? 'คัดลอกแล้ว' : state === 'fail' ? 'คัดลอกไม่สำเร็จ' : 'คัดลอก'}
      </span>
    </button>
  );
}

/**
 * `readOnly` renders NO edit affordance at all — not a disabled one.
 *
 * A greyed-out แก้ไข button still invites the click and still has to explain
 * itself on every hover. On a cancelled request the honest surface is a card
 * with no control, plus the one line in the header saying why. Same shape as
 * the public client's CardEditable.
 *
 * The prop DEFAULTS TO FALSE so a card that is never passed it stays editable
 * — which is why the fs tier counts CardEditable uses against gated ones rather
 * than trusting this default.
 */
function CardEditable({ title, children, isEditing, isSaving, onEdit, onSave, onCancel, readOnly = false }) {
  return (
    <section className={cn('rounded-9e-lg border bg-[var(--surface)] p-6 transition-colors', isEditing ? 'border-9e-brand/40' : 'border-[var(--surface-border)]')}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
        {!isEditing ? (
          readOnly ? null : (
          <button type="button" onClick={onEdit}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-9e-action transition-colors">
            <Pencil className="h-3.5 w-3.5" />แก้ไข
          </button>
          )
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} disabled={isSaving}
              className="flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-40">
              <X className="h-3.5 w-3.5" />ยกเลิก
            </button>
            <button type="button" onClick={onSave} disabled={isSaving}
              className="flex items-center gap-1 rounded-9e-md bg-9e-navy px-3 py-1.5 text-xs font-semibold text-9e-ice hover:opacity-90 disabled:opacity-40">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              บันทึก
            </button>
          </div>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * One label/value pair.
 *
 * ── AN ABSENT VALUE MEANS AN ABSENT ROW ─────────────────────────────────────
 * This used to render `value || '—'`, so every optional field the customer
 * skipped printed an em dash. On a typical enquiry that was most of the page:
 * a column of dashes reading as "we hold nothing about this company", when the
 * truth was "these questions were not asked". The row now returns NULL.
 *
 * The check lives here rather than at each call site on purpose — as a `&&`
 * guard per row it was applied to some fields and forgotten on others, which is
 * how the dashes accumulated. A caller cannot emit one by accident now.
 *
 * `emptyHint` is the deliberate exception, for the case where a MISSING value
 * is itself the information: an onsite enquiry with no venue, an enquiry naming
 * no course. Those are work for a salesperson, not blanks to hide, and they
 * render as an explicit muted sentence rather than a dash that says nothing.
 *
 * ── LABEL TYPOGRAPHY ────────────────────────────────────────────────────────
 * `uppercase` is gone: it is a no-op on Thai, which has no letter case, so it
 * only ever affected the handful of Latin labels ("Request ID", "IP Address")
 * and made them the odd ones out. `tracking-wide` is gone too — extra letter
 * spacing on Thai pushes the marks away from their base characters and reads as
 * a rendering fault. The gutter narrows with them: 176px was sized for spaced
 * uppercase Latin and these labels are short.
 */
function Row({ label, value, wide = false, emptyHint = '', action = null }) {
  const isEmpty = value === null || value === undefined || value === '' || value === false;
  if (isEmpty && !emptyHint) return null;

  return (
    <div className={cn('flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3', wide && 'md:col-span-2')}>
      <dt className="w-full text-xs font-medium text-[var(--text-muted)] sm:w-32 sm:flex-none">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-start justify-between gap-3 text-sm text-[var(--text-primary)]">
        {isEmpty
          ? <span className="italic text-[var(--text-muted)]">{emptyHint}</span>
          : <span className="min-w-0">{value}</span>}
        {action}
      </dd>
    </div>
  );
}