'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Trash2, Check, X, Copy, Building2, GraduationCap, CalendarClock,
  Receipt, MessageSquare, StickyNote, Database, ClipboardList, History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  updateInhouseStatus,
  updateInhouseAdminNotes,
  deleteInhouseRegistration,
} from '@/lib/actions/inhouse-registrations';
import { formatBranchLabel } from '@/lib/registration/branchLabel';
import { refNo } from '@/lib/refNo';
import { monthLongLabel } from '@/lib/schedule/monthWindow';
import { formatBillingAddress } from '@/lib/address/formatBillingAddress';
import { formatThaiAddress } from '@/lib/address/formatThaiAddress';
import {
  INHOUSE_STATUS_TRANSITIONS,
  allowedTransitions,
  effectiveStatus,
  isSystemSet,
  statusBadge,
  statusLabel,
} from '@/lib/registrations/statuses';
import {
  BackLink, DetailHeader, TypeBadge, StatusBar, PrimaryAction, OverflowMenu, OverflowItem,
  SummaryStrip, TabList, TabPanel, SectionCard, SystemCard, DL, DLRow, QuotedNote, DetailError,
} from '../../_components/detailShell';

// ── Constants ──────────────────────────────────────────────────────

/*
 * NO LOCAL STATUS_BADGE. Colour is keyed by status value, which makes it
 * vocabulary-shaped, so it lives beside the label in lib/registrations/statuses
 * and arrives as `statusBadge(v)`.
 *
 * THE RETIRED COLOURS ARE GONE WITH IT, on the schedule this file's own comment
 * set: they were kept "until the enum is narrowed", for the window in which real
 * documents still held `new` / `contacted` / `closed-won` / `closed-lost`. The
 * enum was narrowed to the three live values and the migration has since run, so
 * that window is closed and no document can carry a retired status.
 */

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
 *
 * ── ACTION_VARIANT NOW NAMES A TONE, NOT A SLOT ────────────────────────────
 * WHICH SLOT a target lands in — the 100x38 primary button or the "•••" menu —
 * is DERIVED FROM THE TABLE, not from this map. See `primaryTarget` below.
 */
const ACTION_LABEL = {
  quoted:    'ส่งใบเสนอราคา',
  cancelled: 'ยกเลิกคำขอ',
};

const ACTION_VARIANT = {
  quoted:    'primary',
  cancelled: 'outline',
};

/**
 * The SHORT form, for the 100x38 primary button — see the public client's note
 * at length. The button is 100px and a Thai action label does not fit; the menu
 * has room and uses ACTION_LABEL unchanged, and the button's `title` carries the
 * full wording.
 *
 * The key set is pinned EQUAL to ACTION_LABEL's and ACTION_VARIANT's by the fs
 * tier: a target present in one map and missing from another renders a button
 * with no text, which no text assertion in this suite can see.
 */
const ACTION_SHORT = {
  quoted:    'ส่งใบเสนอฯ',
  cancelled: 'ยกเลิก',
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

/**
 * A monospace identifier — or NOTHING, so `DLRow` can drop the row.
 *
 * The same helper as the public client, and it exists for a MEASURED reason:
 * wrapping a value in a `<span>` at the call site makes it a React ELEMENT,
 * which is always truthy, so `DLRow`'s absent-means-absent rule never fires and
 * an optional field renders its label over an EMPTY SPAN. The empty-element
 * guard on the restyled screens found it. The emptiness decision happens BEFORE
 * the wrapper, in one place.
 */
const mono = (value) => (value ? <span className="font-mono text-[11px]">{value}</span> : '');

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
  return legacyRange || '';
}

/** The same window, without the `เดือน:` prefix — the strip cell has a label. */
function scheduleStripValue(doc) {
  if (doc.preferredMonth) return monthLongLabel(doc.preferredMonth);
  return [doc.preferredDateFrom, doc.preferredDateTo].filter(Boolean).join(' ถึง ') || '—';
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

/**
 * THE TABS. Local state — see the identical note in RegistrationDetailClient.
 *
 * The tab is not derived from the URL at all, so copying it into state is not
 * the filters-from-props rule being broken; there is nothing to copy FROM. Do
 * not "fix" it into searchParams. If deep-linking to a tab is ever wanted it
 * becomes a URL concern then, deliberately, and the rule applies from that
 * moment.
 *
 * TWO tabs, not three: an in-house enquiry has no attendee roster. There is no
 * empty ผู้เข้าอบรม tab standing in for one, because a tab that opens on
 * "ไม่มีข้อมูล" is a control that says nothing.
 */
const TABS = [
  { key: 'request', label: 'ข้อมูลการสมัคร',      icon: ClipboardList },
  { key: 'history', label: 'ประวัติการดำเนินการ', icon: History },
];

// ── Main Component ─────────────────────────────────────────────────

/**
 * @param {object} props.doc
 * @param {Array<{code: string, name: string|null}>} [props.courses] resolved
 *        server-side by page.jsx — see its docstring for why not here.
 * @param {import('react').ReactNode} [props.history] the RecordHistory panel,
 *        RENDERED BY page.jsx AND HANDED IN. It is a SERVER component and cannot
 *        be mounted from a client tab panel, so the page renders it and this
 *        component only places it. Switching tabs costs no round trip.
 */
export function InhouseDetailClient({ doc, courses = [], history = null }) {
  const router = useRouter();

  const [status,      setStatus]      = useState(doc.status);
  const [adminNotes,  setAdminNotes]  = useState(doc.adminNotes ?? '');
  const [editSection, setEditSection] = useState(null); // 'notes' | null
  const [tab,         setTab]         = useState(TABS[0].key);
  const [menuOpen,    setMenuOpen]    = useState(false);
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
   * WHICH ACTION IS THE PRIMARY BUTTON AND WHICH GO IN THE "•••" MENU.
   *
   * Derived exactly as on the public side: a target is demoted to the menu when
   * it is TERMINAL — when the transition table gives it no outgoing edges of its
   * own. Against the in-house table that resolves to `cancelled` and to nothing
   * else. Writing `next === 'cancelled'` would put a hand-written status value
   * back into a client, which is the shape rounds 1 and 2 spent four commits
   * removing and a test now forbids.
   *
   * A `quoted` request therefore has NO primary button — its only move is the
   * cancellation, which lives in the menu. An empty 100x38 box reserving the
   * space would be the screen advertising a control that does not exist.
   */
  const isTerminalTarget = (target) =>
    allowedTransitions(target, INHOUSE_STATUS_TRANSITIONS).length === 0;
  const primaryTarget = statusActions.find((next) => !isTerminalTarget(next)) ?? null;
  const menuTargets   = statusActions.filter((next) => next !== primaryTarget);

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
   * STILL AVAILABLE; see the ruling in lib/actions/inhouse-registrations.js. It
   * lives in the "•••" menu, which is therefore never empty on ANY state.
   */
  const readOnly = liveStatus === 'cancelled';

  /**
   * ONE GATE FOR EVERY EDITABLE CARD — the same helper as the public client,
   * and stronger than the per-card `readOnly` prop it replaces.
   *
   * There is exactly ONE place a card can be given an `onEdit`, and it is
   * gated. A card that omits the spread has NO edit affordance rather than an
   * ungated one, so a mistake shows up as a missing button instead of as a
   * button that appears on a locked record — which is invisible until someone
   * opens a cancelled request.
   */
  const editProps = (section) => ({
    editLabel: 'แก้ไข',
    onEdit:    readOnly ? undefined : () => setEditSection(section),
    editing:   editSection === section,
    saving:    busy === `save-${section}`,
    onCancel:  () => cancelEdit(section),
  });

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
    setMenuOpen(false);
    setBusy(next); setError(null);
    startTransition(async () => {
      const res = await updateInhouseStatus(doc._id, next);
      if (res.ok) setStatus(next);
      else setError(res.error || 'เกิดข้อผิดพลาด');
      setBusy(null);
    });
  };

  const handleDelete = () => {
    if (!window.confirm(`ลบ Request ${refNo(doc._id)} ถาวร?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    setMenuOpen(false);
    setBusy('delete'); setError(null);
    startTransition(async () => {
      const res = await deleteInhouseRegistration(doc._id);
      if (res.ok) router.push('/admin/registrations?source=inhouse');
      else { setError(res.error || 'ลบไม่สำเร็จ'); setBusy(null); }
    });
  };

  const handleSaveNotes = () => {
    setBusy('save-notes'); setError(null);
    startTransition(async () => {
      const res = await updateInhouseAdminNotes(doc._id, adminNotes);
      if (res.ok) setEditSection(null);
      else setError(res.error || 'บันทึกไม่สำเร็จ');
      setBusy(null);
    });
  };

  const cancelEdit = () => {
    setAdminNotes(doc.adminNotes ?? '');
    setEditSection(null);
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

  const contactName = `${doc.contactFirstName ?? ''} ${doc.contactLastName ?? ''}`.trim();

  /**
   * The status bar's one-line description — DERIVED, never a map keyed by
   * status. See the identical note on the public client: a literal here would be
   * a hand-written status list in a detail client, which is exactly what this
   * round's tests forbid.
   *
   * `isSystemSet` resolves to NOTHING for in-house and that is correct rather
   * than a gap — `paid` is not in the in-house vocabulary at all, so there is no
   * state its admins are locked out of. The branch is kept anyway so the two
   * screens ask the vocabulary the same three questions; a branch that is
   * currently unreachable BY THE DATA is not the same as one that is wrong.
   */
  const statusDescription = readOnly
    ? 'คำขอนี้ถูกยกเลิกแล้ว จึงแก้ไขข้อมูลไม่ได้ (ยังลบได้)'
    : isSystemSet(liveStatus, 'inhouse')
      ? 'สถานะนี้ระบบเป็นผู้กำหนด ผู้ดูแลกำหนดเองไม่ได้'
      : primaryTarget
        ? `ขั้นตอนถัดไป: ${statusLabel(primaryTarget)}`
        : 'ไม่มีขั้นตอนถัดไปในระบบ — ปิดงานนอกระบบ';

  /**
   * The four dark-strip cells.
   *
   * ── "ประมาณ 15 คน" IS NOT BUILT, AND THAT IS A DECISION RATHER THAN AN
   *    OVERSIGHT ────────────────────────────────────────────────────────────
   * The design's รูปแบบการอบรม cell hedges the headcount. A summary strip MAY
   * hedge where a data table may not — it is summarising, and the width argument
   * that ruled the word out of the list's 5% จำนวน column does not apply here.
   *
   * It is still not built, for the reason that survives the change of surface:
   * `participantsCount` IS A STORED NUMBER AND NOTHING FLAGS IT AS AN ESTIMATE.
   * The Mongoose schema gives it a minimum of 15 and no `isEstimate`, no
   * `min`/`max` pair, nothing. "ประมาณ" would be the screen asserting an
   * imprecision the record does not record — the same rule the list table keeps
   * for its format chip and its status chip: no branch may assert something the
   * document does not hold.
   *
   * So the sub-line reads "15 ท่าน", phrased exactly as the list's จำนวน column
   * phrases it, which is also what the instruction asked for: one admin, one way
   * of saying a headcount.
   */
  const firstCourse = courses[0];
  const stripCells = [
    {
      key:   'courses',
      label: 'หลักสูตรที่สนใจ',
      value: firstCourse ? (firstCourse.name || firstCourse.code) : '—',
      sub:   courses.length > 1 ? `และอีก ${courses.length - 1} หลักสูตร` : (firstCourse?.name ? firstCourse.code : ''),
    },
    {
      key:   'format',
      label: 'รูปแบบการอบรม',
      value: TRAINING_FORMAT_LABEL[doc.trainingFormat] ?? doc.trainingFormat ?? '—',
      sub:   doc.participantsCount == null ? '' : `${doc.participantsCount} ท่าน`,
    },
    {
      key:   'window',
      label: 'ช่วงเวลาที่ต้องการ',
      value: scheduleStripValue(doc),
      sub:   doc.scheduleNote ?? '',
    },
    {
      key:   'contact',
      label: 'ผู้ติดต่อ',
      value: contactName || '—',
      sub:   doc.contactPhone || doc.contactEmail || '',
    },
  ];

  /**
   * A NULL SLOT MEANS NO TAB, NOT AN EMPTY PANEL — see the public client's note
   * at length. `RecordHistory` renders nothing when the viewer may not read the
   * audit trail, and a tab that opens onto blank space would confirm the record
   * has history, which is the thing being withheld.
   */
  const tabs = TABS.filter((t) => t.key !== 'history' || history);
  const idFor = (key, kind) => `inh-${kind}-${key}`;

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <BackLink label="กลับรายการ" onClick={() => router.back()} />

      <DetailHeader
        badge={<TypeBadge label="In-house" className="bg-violet-100 text-violet-700" />}
        timestamp={`ส่งคำขอเมื่อ ${fmtDate(doc.createdAt)}`}
        title={<>In-house Request <span className="font-mono text-9e-action">{refNo(doc._id)}</span></>}
        subtitle={displayCompany}
      />

      {/*
        THE DOT TAKES THE VOCABULARY'S COLOUR AND NOTHING NEW — see the public
        client's note. `statusBadge(status)`, not `statusBadge(liveStatus)`: the
        badge shows what the record HOLDS, and the dot beside it must not
        disagree with the name it sits next to.
      */}
      <StatusBar
        dotClassName={statusBadge(status)}
        label="สถานะปัจจุบัน"
        name={statusLabel(status)}
        description={statusDescription}
        primary={primaryTarget ? (
          <PrimaryAction
            title={ACTION_LABEL[primaryTarget]}
            onClick={() => handleStatusAction(primaryTarget)}
            disabled={busy !== null}
            busy={busy === primaryTarget}
          >
            {ACTION_SHORT[primaryTarget] ?? ACTION_LABEL[primaryTarget]}
          </PrimaryAction>
        ) : null}
        overflow={(
          <OverflowMenu
            open={menuOpen}
            onToggle={() => setMenuOpen((o) => !o)}
            triggerLabel="การดำเนินการอื่น"
            closeLabel="ปิดเมนูการดำเนินการ"
          >
            {menuTargets.map((next) => (
              <OverflowItem
                key={next}
                icon={X}
                onClick={() => handleStatusAction(next)}
                disabled={busy !== null}
                busy={busy === next}
                tone={ACTION_VARIANT[next] === 'outline' ? 'text-9e-accent' : undefined}
              >
                {ACTION_LABEL[next]}
              </OverflowItem>
            ))}
            {/* DELETE IS NOT GATED ON `readOnly` — the ruling in
                lib/actions/inhouse-registrations.js. It is also what keeps this
                menu from ever being empty: a cancelled request has no status
                actions left and still has exactly one item. */}
            <OverflowItem
              icon={Trash2}
              onClick={handleDelete}
              disabled={busy !== null}
              busy={busy === 'delete'}
              tone="text-9e-accent"
            >
              ลบ Request นี้
            </OverflowItem>
          </OverflowMenu>
        )}
      />

      <SummaryStrip cells={stripCells} />

      <DetailError message={error} />

      <TabList tabs={tabs} active={tab} onSelect={setTab} idFor={idFor} />

      {/* ── ข้อมูลการสมัคร ── */}
      <TabPanel id={idFor('request', 'panel')} labelledBy={idFor('request', 'tab')} hidden={tab !== 'request'}>
        <div className="space-y-[16px]">

          <SectionCard icon={Building2} title="ผู้ประสานงาน & บริษัท">
            <DL>
              <DLRow
                label={companyDiverges ? 'บริษัท / องค์กร (ที่ติดต่อ)' : 'บริษัท / องค์กร'}
                value={displayCompany}
                action={displayCompany
                  ? <CopyButton value={displayCompany} label={companyDiverges ? 'ชื่อบริษัทที่ติดต่อ' : 'ชื่อบริษัท'} />
                  : null}
              />
              <DLRow label="ชื่อ-นามสกุล" value={contactName} />
              <DLRow label="ตำแหน่ง / แผนก" value={[doc.contactRole, doc.contactDepartment].filter(Boolean).join(' · ')} />
              <DLRow label="อีเมล" value={doc.contactEmail
                ? <a href={`mailto:${doc.contactEmail}`} className="text-9e-action hover:underline">{doc.contactEmail}</a>
                : ''} />
              <DLRow label="เบอร์โทร" value={doc.contactPhone
                ? <a href={`tel:${doc.contactPhone}`} className="text-9e-action hover:underline">{doc.contactPhone}</a>
                : ''} />
              <DLRow label="LINE ID" value={doc.contactLine} />
            </DL>
          </SectionCard>

          <SectionCard icon={GraduationCap} title="Training Requirement">
            <DL>
              {/*
                NAME over CODE, the same two-line shape the in-house LIST column
                uses. Resolved server-side and handed in as `courses`; a miss
                keeps the code as the primary line rather than blanking — see the
                page's docstring.

                The empty hint stays: an enquiry naming NO course is a data fault
                a salesperson has to see, not a row to hide.
              */}
              <DLRow label="หลักสูตรที่สนใจ" wide emptyHint="ไม่ได้ระบุหลักสูตร"
                value={courses.length > 0 ? <CourseList courses={courses} /> : ''} />
              <DLRow label="จำนวนผู้เข้าอบรม" value={doc.participantsCount == null ? '' : `${doc.participantsCount} ท่าน`} />
              <DLRow label="เนื้อหา" value={CONTENT_MODE_LABEL[doc.contentMode] ?? doc.contentMode} />
              <DLRow label="รายละเอียดเนื้อหา" wide value={doc.contentDetails} />
            </DL>
          </SectionCard>

          <SectionCard icon={CalendarClock} title="ตารางเวลา & รูปแบบการอบรม">
            <DL>
              <DLRow label="ช่วงเวลา" value={scheduleSummary(doc)} />
              <DLRow label="หมายเหตุเวลา" value={doc.scheduleNote} />
              <DLRow label="รูปแบบ" value={TRAINING_FORMAT_LABEL[doc.trainingFormat] ?? doc.trainingFormat} />
              {doc.trainingFormat === 'online' && (
                <>
                  <DLRow label="พื้นที่ผู้เข้าอบรม" value={doc.onlineRegion} />
                  <DLRow label="ข้อจำกัดด้านเวลา" value={doc.onlineTimezone} />
                </>
              )}
              {/*
                THE VENUE KEEPS ITS EMPTY STATE, deliberately, against the
                general "absent means absent" rule: an ONSITE enquiry with no
                venue is not a blank field, it is the next phone call. Hiding the
                row would hide the job.
              */}
              {doc.trainingFormat === 'onsite' && (
                <DLRow label="สถานที่จัดอบรม" wide value={venue} emptyHint="ยังไม่ได้ระบุ — ต้องสอบถามลูกค้า"
                  action={venue ? <CopyButton value={venue} label="สถานที่จัดอบรม" /> : null} />
              )}
            </DL>
          </SectionCard>

          <SectionCard icon={Receipt} title="ข้อมูลใบเสนอราคา">
            <DL>
              <DLRow label="ประเทศ" value={countryLabel} />
              {/* Only when it disagrees with the contact company — see companyDiverges. */}
              {companyDiverges && (
                <DLRow label="ชื่อบริษัท (ใบเสนอราคา)" value={quotationCompany}
                  action={<CopyButton value={quotationCompany} label="ชื่อบริษัทสำหรับใบเสนอราคา" />} />
              )}
              <DLRow label="เลขผู้เสียภาษี" value={doc.taxId}
                action={doc.taxId ? <CopyButton value={doc.taxId} label="เลขผู้เสียภาษี" /> : null} />
              {/* Derived at read time. `branch` is legacy read-only and is the
                  fallback for pre-split enquiries — see branchLabel.js. */}
              <DLRow label="สาขา" value={branchLabel} />
              <DLRow label="ที่อยู่" wide value={address}
                action={address ? <CopyButton value={address} label="ที่อยู่สำหรับใบเสนอราคา" /> : null} />
            </DL>
          </SectionCard>

          {doc.message && (
            <SectionCard icon={MessageSquare} title="หมายเหตุจากลูกค้า">
              <QuotedNote>{doc.message}</QuotedNote>
            </SectionCard>
          )}

          <SectionCard
            icon={StickyNote}
            title="บันทึกภายในของทีมขาย"
            {...editProps('notes')}
            onSave={handleSaveNotes}
          >
            {editSection === 'notes' ? (
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                maxLength={2000}
                rows={5}
                placeholder="บันทึกการติดต่อ ข้อเสนอ การเจรจา ฯลฯ"
                className="w-full resize-y rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand"
              />
            ) : adminNotes ? (
              <QuotedNote>{adminNotes}</QuotedNote>
            ) : (
              // NOT an empty quoted block — an accent rule beside nothing
              // asserts there is a quotation there.
              <p className="text-[13px] italic leading-[22px] text-[var(--text-muted)]">ยังไม่มีบันทึกจากทีมขาย</p>
            )}
          </SectionCard>

          <SystemCard icon={Database} title="ข้อมูลระบบ">
            <DLRow label="Request ID"   value={mono(doc._id)} />
            <DLRow label="แหล่งที่มา"    value={doc.source ?? 'inhouse'} />
            <DLRow label="IP Address"   value={doc.ipAddress} />
            <DLRow label="อัปเดตล่าสุด"  value={fmtDate(doc.updatedAt)} />
          </SystemCard>
        </div>
      </TabPanel>

      {/* ── ประวัติการดำเนินการ ── */}
      {history ? (
        <TabPanel id={idFor('history', 'panel')} labelledBy={idFor('history', 'tab')} hidden={tab !== 'history'}>
          {history}
        </TabPanel>
      ) : null}
    </div>
  );
}

// ── Shared atoms ───────────────────────────────────────────────────

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
          <span className="block text-[13px] text-[var(--text-primary)]">{name || code}</span>
          {name && <span className="block font-mono text-[11px] text-[var(--text-muted)]">{code}</span>}
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
        'inline-flex shrink-0 items-center gap-1 rounded-9e-sm border px-2 py-1 text-[11px] font-medium transition-colors',
        state === 'ok'   && 'border-9e-brand/40 text-9e-action',
        state === 'fail' && 'border-9e-accent/40 text-9e-accent',
        state === 'idle' && 'border-[var(--surface-border)] text-[var(--text-muted)] hover:text-9e-action'
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span aria-live="polite">
        {state === 'ok' ? 'คัดลอกแล้ว' : state === 'fail' ? 'คัดลอกไม่สำเร็จ' : 'คัดลอก'}
      </span>
    </button>
  );
}
