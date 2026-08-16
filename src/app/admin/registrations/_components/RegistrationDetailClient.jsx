'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Trash2, X, Plus, GraduationCap, User, Users, Receipt,
  CreditCard, StickyNote, Database, ClipboardList, History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTHB } from '@/lib/pricing';
import { formatBillingAddress } from '@/lib/address/formatBillingAddress';
import { formatInvoiceBranchLabel } from '@/lib/registration/branchLabel';
import { onlyDigits } from '@/lib/registration/digitsOnly';
import {
  updateRegistrationStatus,
  updateRegistration,
  deleteRegistration,
} from '@/lib/actions/registrations';
import { refNo } from '@/lib/refNo';
import { allowedTransitions, isSystemSet, statusBadge, statusLabel } from '@/lib/registrations/statuses';
import {
  BackLink, DetailHeader, TypeBadge, StatusBar, PrimaryAction, OverflowMenu, OverflowItem,
  SummaryStrip, TabList, TabPanel, SectionCard, SystemCard, DL, DLRow, QuotedNote, DetailError,
} from './detailShell';

// ── Constants ──────────────────────────────────────────────────────

/*
 * NO LOCAL STATUS_BADGE. The chip's colour is vocabulary-shaped — keyed by
 * status value, exactly like the label — so it lives beside the label in
 * lib/registrations/statuses and reaches this file as `statusBadge(v)`.
 *
 * It was one of FOUR copies (both list clients, both detail clients). A status
 * added to the module without a matching entry in one of those literals
 * rendered an unstyled chip, and only on the screen whose copy was missed.
 */

/*
 * The Thai label arrives through `statusLabel(v)` for the same reason as the
 * badge above — one lookup, one source. `confirmed` reads 'ส่งใบเสนอราคาแล้ว';
 * the stored value is unchanged.
 */

/**
 * ── THERE IS NO STATUS-ACTION MAP IN THIS FILE ANY MORE ─────────────────────
 *
 * It used to be a hand-written literal here:
 *
 *   { pending: ['confirmed','cancelled'], confirmed: ['paid','cancelled'],
 *     paid: ['cancelled'], cancelled: ['pending'] }
 *
 * and it was the ONLY place the rules existed. `updateRegistrationStatus`
 * checked that the target was a valid status and nothing else, so this literal
 * was load-bearing security in a client component — which in a Next app means
 * a convention, since every `'use server'` export is a POST endpoint anyone can
 * call directly.
 *
 * The buttons are now a projection of the same table the server enforces, so a
 * button offering a move the server would reject is not expressible. Two edges
 * disappeared with it and both were deliberate:
 *   · `confirmed → paid` — only Omise writes `paid` (see the module);
 *   · `cancelled → pending` — cancellation is terminal.
 *
 * ACTION_LABEL/ACTION_VARIANT are keyed by TARGET, not by from-state, and they
 * carry only the two targets an admin can still choose. They are presentation,
 * not rules: a target with no entry renders no button, so if a new edge is
 * added to the table and forgotten here, the button is silently missing rather
 * than wrongly offered. The fs tier pins the two lists against each other.
 *
 * ── ACTION_VARIANT NOW NAMES A SLOT, NOT A BUTTON STYLE ────────────────────
 * The status bar has two slots — a 100x38 primary and a 39x38 overflow — and
 * WHICH SLOT A TARGET LANDS IN IS DERIVED FROM THE TABLE, not from this map.
 * See `primaryTarget` below. The map survives because the two lists being pinned
 * against each other is what makes an unlabelled edge impossible, and because a
 * target still needs a tone in the menu.
 */
const ACTION_LABEL   = { confirmed: 'บันทึกส่งใบเสนอราคาแล้ว', cancelled: 'ยกเลิกการสมัคร' };
const ACTION_VARIANT = { confirmed: 'primary', cancelled: 'outline' };

/**
 * The SHORT form, for the 100x38 primary button.
 *
 * ── WHY A THIRD MAP RATHER THAN SHORTENING ACTION_LABEL ────────────────────
 * The measured button is 100px wide. 'บันทึกส่งใบเสนอราคาแล้ว' is fifteen
 * advancing glyphs and does not fit at any size this screen uses, so something
 * has to give — and the thing that must NOT give is what the label CLAIMS. The
 * round-1 relabel exists because this control does not send a quotation, it
 * RECORDS that one was sent; 'ส่งใบเสนอราคา' on the button would put the
 * imperative reading straight back.
 *
 * So the button keeps the verb (บันทึก) and drops the object, which the card
 * context supplies, and its `title` carries the full ACTION_LABEL for a hover.
 * The menu — which has room — uses ACTION_LABEL unchanged.
 *
 * The key set is pinned EQUAL to ACTION_LABEL's and ACTION_VARIANT's by the fs
 * tier. What a missing entry costs is stated exactly, because it is NOT the
 * empty-button defect and claiming otherwise would misdescribe the guard: the
 * `??` at the call site falls back to ACTION_LABEL, so a target dropped from
 * here renders a button with a label too long for it rather than one with no
 * label at all. That is the same choice the `.filter` on ACTION_LABEL makes —
 * degrade to something visible, never to something invisible — and it is why the
 * pinning is an fs assertion rather than a render one. Nothing on screen would
 * announce the drift.
 */
const ACTION_SHORT   = { confirmed: 'บันทึกส่งแล้ว', cancelled: 'ยกเลิก' };

const PAYMENT_METHOD_LABEL = { credit_card: 'บัตรเครดิต/เดบิต', promptpay: 'QR PromptPay', quote: 'ขอใบเสนอราคา' };
const OMISE_STATUS_LABEL   = { pending: 'รอชำระ', successful: 'สำเร็จ', failed: 'ล้มเหลว', expired: 'หมดอายุ' };

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear()+543} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} น.`;
}

/** The schedule arrangement as one phrase. Never empty: a falsy type is Classroom. */
function scheduleLabel(scheduleType, attendanceMode) {
  if (scheduleType === 'hybrid') return attendanceMode === 'teams' ? 'Hybrid · Teams' : 'Hybrid · Class';
  if (scheduleType === 'online') return 'Online';
  if (!scheduleType || scheduleType === 'classroom') return 'Classroom';
  return scheduleType;
}

const EMPTY_ATTENDEE = { firstName: '', lastName: '', email: '', phone: '' };

/**
 * A monospace identifier — or NOTHING, so `DLRow` can drop the row.
 *
 * ── MEASURED, NOT ANTICIPATED ──────────────────────────────────────────────
 * The obvious spelling is `value={<span className="font-mono">{doc.classId}</span>}`
 * and it defeats `DLRow`'s absent-means-absent rule completely: the value is a
 * React ELEMENT, which is always truthy, so a document with no `classId`
 * rendered the row, the label, and an EMPTY SPAN inside it. The empty-element
 * guard on the restyled screens is what found it.
 *
 * So the emptiness decision happens BEFORE the wrapper, in one place, and a
 * caller cannot re-introduce it by styling a field that turns out to be optional.
 */
const mono = (value) => (value ? <span className="font-mono text-[11px]">{value}</span> : '');

/**
 * THE TABS. Local state, and that is not the URL-filter rule being broken.
 *
 * ── READ THIS BEFORE "FIXING" IT INTO searchParams ────────────────────────
 * The standing rule on this screen is FILTERS ARE DERIVED FROM PROPS — never
 * copied out of the URL into `useState`, because two copies of one value drift
 * and the screen ends up showing a list that disagrees with its own controls.
 *
 * The tab is not that. It is not derived from the URL AT ALL: nothing puts it
 * there, nothing reads it back, and no server query depends on it. It is view
 * state in the same sense as "is this accordion open", and local state is
 * exactly the right home for it.
 *
 * If deep-linking to a tab is ever wanted — a support link that opens straight
 * on ผู้เข้าอบรม — it becomes a URL concern THEN, deliberately, and the rule
 * applies to it from that moment: derived from a prop, never mirrored.
 */
const TABS = [
  { key: 'registration', label: 'ข้อมูลการสมัคร',      icon: ClipboardList },
  { key: 'attendees',    label: 'ผู้เข้าอบรม',          icon: Users },
  { key: 'history',      label: 'ประวัติการดำเนินการ', icon: History },
];

// ── Main Component ─────────────────────────────────────────────────

/**
 * @param {object} props.doc
 * @param {import('react').ReactNode} [props.history] the RecordHistory panel,
 *        RENDERED BY page.jsx AND HANDED IN. It is a SERVER component and cannot
 *        be mounted from a client tab panel, so the page renders it and this
 *        component only places it. Switching to the ประวัติ tab therefore costs
 *        no round trip: the markup already exists.
 */
export function RegistrationDetailClient({ doc, history = null }) {
  const router = useRouter();

  // ── Editable state (mirrors doc on load) ────────────────────
  const [status,       setStatus]       = useState(doc.status);
  const [course,       setCourse]       = useState({
    classDate:      doc.classDate      ?? '',
    scheduleType:   doc.scheduleType   ?? 'classroom',
    attendanceMode: doc.attendanceMode ?? 'classroom',
  });
  const [coordinator,  setCoordinator]  = useState({ ...doc.coordinator });
  const [attendeesListProvided, setAttendeesListProvided] = useState(doc.attendeesListProvided ?? true);
  const [attendeesCount, setAttendeesCount] = useState(doc.attendeesCount ?? 1);
  const [attendees,    setAttendees]    = useState(doc.attendees?.length ? [...doc.attendees] : []);
  const [notes,        setNotes]        = useState(doc.notes ?? '');
  const [invoice,      setInvoice]      = useState(
    doc.invoice
      ? { ...doc.invoice,
          thaiAddress:          doc.invoice.thaiAddress          ? { ...doc.invoice.thaiAddress }          : null,
          internationalAddress: doc.invoice.internationalAddress ? { ...doc.invoice.internationalAddress } : null,
        }
      : null
  );
  const [requestInvoice, setRequestInvoice] = useState(doc.requestInvoice ?? false);

  // ── UI state ─────────────────────────────────────────────────
  const [editSection,  setEditSection]  = useState(null); // 'course'|'coordinator'|'attendees'|'notes'|'invoice'|null
  const [tab,          setTab]          = useState(TABS[0].key);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [error,        setError]        = useState(null);
  const [busy,         setBusy]         = useState(null);
  const [, startTransition] = useTransition();

  // ── Helpers ───────────────────────────────────────────────────
  const save = (payload, busyKey) => {
    setBusy(busyKey); setError(null);
    startTransition(async () => {
      const res = await updateRegistration(doc._id, payload);
      if (res.ok) { setEditSection(null); }
      else { setError(res.error || 'บันทึกไม่สำเร็จ'); }
      setBusy(null);
    });
  };

  const cancelEdit = (section) => {
    setEditSection(null);
    if (section === 'course')      setCourse({ classDate: doc.classDate ?? '', scheduleType: doc.scheduleType ?? 'classroom', attendanceMode: doc.attendanceMode ?? 'classroom' });
    if (section === 'coordinator') setCoordinator({ ...doc.coordinator });
    if (section === 'attendees')   { setAttendees(doc.attendees?.length ? [...doc.attendees] : []); setAttendeesListProvided(doc.attendeesListProvided ?? true); setAttendeesCount(doc.attendeesCount ?? 1); }
    if (section === 'notes')       setNotes(doc.notes ?? '');
    if (section === 'invoice') {
      setRequestInvoice(doc.requestInvoice ?? false);
      setInvoice(doc.invoice
        ? { ...doc.invoice,
            thaiAddress:          doc.invoice.thaiAddress          ? { ...doc.invoice.thaiAddress }          : null,
            internationalAddress: doc.invoice.internationalAddress ? { ...doc.invoice.internationalAddress } : null,
          }
        : null);
    }
  };

  // ── Status action ─────────────────────────────────────────────
  const handleStatusAction = (next) => {
    // The cancel target gets its own wording because it is the only
    // IRREVERSIBLE one. A generic "change the status to X?" reads the same for
    // a move that can be walked back and one that cannot, and the second is
    // now every cancellation — including from `paid`, which this dialog also
    // covers. The record additionally becomes read-only, which is not
    // guessable from the word ยกเลิก alone, so it is stated.
    const message = next === 'cancelled'
      ? 'ยกเลิกใบสมัครนี้?\n\nการยกเลิกไม่สามารถย้อนกลับได้ และหลังจากนี้จะแก้ไขข้อมูลใบสมัครไม่ได้อีก'
      : `เปลี่ยนสถานะเป็น "${statusLabel(next)}"?`;
    if (!window.confirm(message)) return;
    setMenuOpen(false);
    setBusy(next); setError(null);
    startTransition(async () => {
      const res = await updateRegistrationStatus(doc._id, next);
      res.ok ? setStatus(next) : setError(res.error || 'เกิดข้อผิดพลาด');
      setBusy(null);
    });
  };

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = () => {
    if (!window.confirm(`ลบใบสมัคร ${refNo(doc._id)} ถาวร?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    setMenuOpen(false);
    setBusy('delete'); setError(null);
    startTransition(async () => {
      const res = await deleteRegistration(doc._id);
      if (res.ok) router.push('/admin/registrations');
      else { setError(res.error || 'ลบไม่สำเร็จ'); setBusy(null); }
    });
  };

  // ── Invoice save ──────────────────────────────────────────────
  const handleSaveInvoice = () => {
    const payload = requestInvoice && invoice ? { invoice } : { invoice: null };
    save(payload, 'save-invoice');
  };

  // ── Attendee helpers ──────────────────────────────────────────
  const addAttendee = () => setAttendees((prev) => [...prev, { ...EMPTY_ATTENDEE }]);
  const removeAttendee = (i) => setAttendees((prev) => prev.filter((_, idx) => idx !== i));
  const updateAttendee = (i, field, val) =>
    setAttendees((prev) => prev.map((a, idx) => idx === i ? { ...a, [field]: val } : a));

  /**
   * The permitted moves, MINUS any the presentation maps cannot draw.
   *
   * The filter is not defensive padding — it was measured. Without it, a target
   * the table permits but ACTION_LABEL does not name renders a Button whose
   * children are `undefined`: a real, clickable, COMPLETELY EMPTY button that
   * fires a status change nobody can read. Discovered by re-introducing the old
   * hand-written map as a deliberate break — the fs guard caught the map, and
   * the render tier stayed green because a button with no text is invisible to
   * a text scan.
   *
   * So an unlabelled edge degrades to NO BUTTON, which is a missing affordance
   * rather than an unlabelled trap, and fs/registrationActionsDerived asserts
   * that every edge in the table has a label so the degradation never actually
   * happens in the product.
   */
  const statusActions = allowedTransitions(status).filter((next) => ACTION_LABEL[next]);

  /**
   * WHICH ACTION IS THE PRIMARY BUTTON AND WHICH GO IN THE "•••" MENU.
   *
   * ── DERIVED FROM THE TABLE, NOT FROM A LIST OF NAMES ───────────────────────
   * A target is demoted to the overflow menu exactly when it is TERMINAL — when
   * the transition table gives it no outgoing edges of its own. Read against the
   * public table that resolves to `cancelled` and to nothing else, which is the
   * intended reading: the menu is where the moves you cannot walk back live, and
   * the 100px button is the ordinary next step.
   *
   * Writing `next === 'cancelled'` would have been shorter and is the shape four
   * commits of rounds 1 and 2 spent removing — a hand-written status value in a
   * client, which a test now forbids outright. Asking the table means a future
   * terminal status is demoted without this file being edited, and a status that
   * GAINS an outgoing edge promotes itself.
   *
   * A state with no ordinary next step renders NO primary button rather than a
   * disabled or empty one: `confirmed` and `paid` both offer only cancellation,
   * so their status bar is the "•••" alone. That is honest — an empty 100x38 box
   * would be the screen reserving space for a control that does not exist.
   *
   * Everything not in the primary slot is in the menu, so no permitted move can
   * fall between the two.
   */
  const isTerminalTarget = (target) => allowedTransitions(target).length === 0;
  const primaryTarget    = statusActions.find((next) => !isTerminalTarget(next)) ?? null;
  const menuTargets      = statusActions.filter((next) => next !== primaryTarget);

  /**
   * A CANCELLED RECORD IS READ-ONLY, AND THE SCREEN SAYS SO.
   *
   * `updateRegistration` refuses the write regardless of what renders here —
   * the lock is in the query filter, not in this flag. What this flag does is
   * stop the screen OFFERING an edit that would be refused, which is a
   * different job: a แก้ไข button that opens a form, accepts typing and then
   * fails on save is a worse experience than no button at all.
   *
   * `statusActions` is already empty for `cancelled` (the table has no outgoing
   * edges), so the status buttons need no separate flag — they simply have
   * nothing to render. DELETE IS DELIBERATELY STILL AVAILABLE; see the ruling
   * in lib/actions/registrations.js. It lives in the "•••" menu, which is
   * therefore never empty on ANY state.
   */
  const readOnly = status === 'cancelled';

  /**
   * ONE GATE FOR EVERY EDITABLE CARD.
   *
   * ── STRICTLY STRONGER THAN THE PROP-COUNT IT REPLACES ──────────────────────
   * Round 1 passed `readOnly={readOnly}` to each card and the fs tier counted
   * the cards against the gated ones. That catches a card someone forgot to
   * gate — but only by arithmetic, and a file with the right count and the wrong
   * card passes it.
   *
   * There is now exactly ONE place a card can be given an `onEdit` at all, and
   * it is gated. A card that omits the spread has no edit affordance rather than
   * an ungated one, so the failure mode inverts: the mistake is a MISSING button,
   * which is visible, instead of a button that appears on a locked record, which
   * is invisible until someone opens a cancelled registration.
   *
   * `undefined` rather than a no-op handler, because the shell renders the
   * button only when it is given something to do — no disabled state, which
   * invites the click and then explains nothing.
   */
  const editProps = (section) => ({
    editLabel: 'แก้ไข',
    onEdit:    readOnly ? undefined : () => setEditSection(section),
    editing:   editSection === section,
    saving:    busy === `save-${section}`,
    onCancel:  () => cancelEdit(section),
  });

  /**
   * The status bar's one-line description — DERIVED, never a map keyed by
   * status.
   *
   * A `{ pending: '…', confirmed: '…' }` literal here would be a hand-written
   * status list in a detail client, which is the exact shape this round's tests
   * forbid, and it would go stale the day a status is added. The three branches
   * are questions asked OF THE VOCABULARY:
   *
   *   · read-only — the round-1 copy, verbatim, including the "(ยังลบได้)"
   *     clause. That clause is not decoration: it exists to stop a future reader
   *     closing the delete "hole", and it is the first thing anyone asks when a
   *     screen goes read-only. It has moved from a corner of the old header into
   *     the status bar, where it is the description of the state it describes.
   *   · system-set — `isSystemSet` reads the transition table: a status nothing
   *     may move INTO that is not the state records begin in. That is `paid`,
   *     because only Omise writes it.
   *   · otherwise — the ordinary next step, named through `statusLabel`.
   */
  const statusDescription = readOnly
    ? 'ใบสมัครนี้ถูกยกเลิกแล้ว จึงแก้ไขข้อมูลไม่ได้ (ยังลบได้)'
    : isSystemSet(status)
      ? 'สถานะนี้ระบบบันทึกจากการชำระเงินจริง ผู้ดูแลกำหนดเองไม่ได้'
      : primaryTarget
        ? `ขั้นตอนถัดไป: ${statusLabel(primaryTarget)}`
        : 'ไม่มีขั้นตอนถัดไปในระบบ — ดำเนินการนอกระบบ';

  /**
   * THE ROSTER SUB-LINE, AND WHY IT IS ALLOWED HERE AND NOT ON THE LIST.
   *
   * The list screen's ผู้เข้าอบรม cell renders a bare number, and the design's
   * ครบ / ยังไม่ครบ chip was RULED OUT there — deriving it needs
   * `attendeesListProvided` and the `attendees` ARRAY, and adding those to a
   * list projection would pull a personal-data array over the wire for twenty
   * rows to render a three-way chip.
   *
   * HERE nothing is widened. `getRegistrationById` is `findById(id).lean()` with
   * no projection at all, so this page already holds the whole document,
   * attendees included — verified against the action rather than assumed. The
   * derivation is therefore free, and the strip is where "is the roster
   * complete" is actually the question.
   *
   * A row is counted as filled when it carries a name or an email. An attendee
   * object created by the editor and left blank is not a name on a roster.
   */
  const namedAttendees = attendees.filter((a) => (a.firstName || a.lastName || a.email));
  const rosterSub = !attendeesListProvided
    ? 'ยังไม่แจ้งรายชื่อ'
    : namedAttendees.length >= attendeesCount
      ? `รายชื่อครบ ${namedAttendees.length}/${attendeesCount}`
      : `ยังไม่ครบ ${namedAttendees.length}/${attendeesCount}`;

  /**
   * The three dark-strip cells.
   *
   * ยอดสุทธิ is the one with an empty branch and it is real: a registration
   * taken through the quotation path carries no `pricing`, so the value falls
   * back to a dash and the SUB-LINE IS DROPPED ENTIRELY rather than rendered
   * blank. `sub: ''` is what the shell reads as "no line".
   */
  const pricing = doc.pricing;
  const stripCells = [
    {
      key:   'round',
      label: 'รอบอบรม',
      value: course.classDate || '—',
      sub:   scheduleLabel(course.scheduleType, course.attendanceMode),
    },
    {
      key:   'attendees',
      label: 'ผู้เข้าอบรม',
      value: `${attendeesCount} ท่าน`,
      sub:   rosterSub,
    },
    {
      key:   'total',
      label: 'ยอดสุทธิ',
      value: pricing ? `${formatTHB(pricing.total)} บาท` : '—',
      sub:   pricing ? `${pricing.seats} ที่นั่ง · รวม VAT 7%` : '',
    },
  ];

  /**
   * The tabs, with the count badge on ผู้เข้าอบรม — and WITHOUT ประวัติ when
   * there is no history to put in it.
   *
   * ── A NULL SLOT MEANS NO TAB, NOT AN EMPTY PANEL ───────────────────────────
   * `RecordHistory` renders NOTHING when the viewer may not read the audit trail
   * — deliberately, because a panel saying "you may not see this" confirms the
   * record HAS history, which is the thing being withheld. Under a tab that
   * would become a tab which opens onto blank space, which says the same thing
   * one click later and additionally reads as a broken page.
   *
   * So the tab follows the slot. A viewer without access simply has two tabs,
   * which asserts nothing about whether the record was ever edited.
   */
  const tabs = TABS
    .filter((t) => t.key !== 'history' || history)
    .map((t) => (t.key === 'attendees' ? { ...t, count: attendeesCount } : t));
  const idFor = (key, kind) => `reg-${kind}-${key}`;

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <BackLink label="กลับรายการ" onClick={() => router.back()} />

      <DetailHeader
        badge={<TypeBadge label="Public" className="bg-sky-100 text-sky-700" />}
        timestamp={`สมัครเมื่อ ${fmtDate(doc.createdAt)}`}
        title={<>ใบสมัคร <span className="font-mono text-9e-action">{refNo(doc._id)}</span></>}
        subtitle={doc.courseName}
      />

      {/*
        THE DOT TAKES THE VOCABULARY'S COLOUR AND NOTHING NEW.
        `statusBadge(status)` is `bg-amber-100 text-amber-700`; the shell appends
        `bg-current`, so twMerge resolves the two backgrounds (both stock classes,
        so it genuinely does resolve them) and the 11px disc paints in the
        badge's TEXT colour. No second colour map exists anywhere.
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
            {/* DELETE IS NOT GATED ON `readOnly`, and that is the ruling rather
                than an oversight — see lib/actions/registrations.js. It is also
                what keeps this menu from ever being empty: a cancelled record
                has no status actions left and still has exactly one item. */}
            <OverflowItem
              icon={Trash2}
              onClick={handleDelete}
              disabled={busy !== null}
              busy={busy === 'delete'}
              tone="text-9e-accent"
            >
              ลบใบสมัครนี้
            </OverflowItem>
          </OverflowMenu>
        )}
      />

      <SummaryStrip cells={stripCells} />

      <DetailError message={error} />

      <TabList tabs={tabs} active={tab} onSelect={setTab} idFor={idFor} />

      {/* ── ข้อมูลการสมัคร ── */}
      <TabPanel id={idFor('registration', 'panel')} labelledBy={idFor('registration', 'tab')} hidden={tab !== 'registration'}>
        <div className="space-y-[16px]">

          <SectionCard
            icon={GraduationCap}
            title="ข้อมูลคอร์ส"
            {...editProps('course')}
            onSave={() => save({ classDate: course.classDate, scheduleType: course.scheduleType, attendanceMode: course.attendanceMode }, 'save-course')}
          >
            {editSection === 'course' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <EditField label="วันที่อบรม" value={course.classDate}
                  onChange={(v) => setCourse((c) => ({ ...c, classDate: v }))} className="sm:col-span-2" />
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">ประเภทรอบ</label>
                  <select value={course.scheduleType}
                    onChange={(e) => setCourse((c) => ({ ...c, scheduleType: e.target.value }))}
                    className={selectCls()}>
                    <option value="classroom">Classroom</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="online">Online</option>
                  </select>
                </div>
                {course.scheduleType === 'hybrid' && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">รูปแบบการอบรม</label>
                    <select value={course.attendanceMode}
                      onChange={(e) => setCourse((c) => ({ ...c, attendanceMode: e.target.value }))}
                      className={selectCls()}>
                      <option value="classroom">Classroom</option>
                      <option value="teams">Online via Microsoft Teams</option>
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <DL>
                <DLRow label="หลักสูตร"  value={doc.courseName} wide />
                <DLRow label="รหัสคอร์ส" value={doc.courseCode || doc.courseId} />
                <DLRow label="รอบอบรม"   value={course.classDate} emptyHint="ยังไม่ได้ระบุรอบ" />
                {/*
                  รูปแบบการอบรม IS UNCONDITIONAL NOW, and that is a change of
                  shape rather than of data. It used to render only for `hybrid`,
                  which meant the commonest arrangement — a classroom round — had
                  no row saying so, and a reader could not tell "classroom" from
                  "nobody filled this in". `scheduleLabel` has no empty branch.
                */}
                <DLRow label="รูปแบบการอบรม" value={scheduleLabel(course.scheduleType, course.attendanceMode)} />
              </DL>
            )}
          </SectionCard>

          <SectionCard
            icon={User}
            title="ผู้ประสานงาน"
            {...editProps('coordinator')}
            onSave={() => save({ coordinator }, 'save-coordinator')}
          >
            {editSection === 'coordinator' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <EditField label="ชื่อ" required value={coordinator.firstName ?? ''} onChange={(v) => setCoordinator((c) => ({ ...c, firstName: v }))} />
                <EditField label="นามสกุล" required value={coordinator.lastName ?? ''} onChange={(v) => setCoordinator((c) => ({ ...c, lastName: v }))} />
                <EditField label="อีเมล" type="email" required value={coordinator.email ?? ''} onChange={(v) => setCoordinator((c) => ({ ...c, email: v }))} />
                <EditField label="เบอร์โทร" type="tel" value={coordinator.phone ?? ''} onChange={(v) => setCoordinator((c) => ({ ...c, phone: v }))} />
              </div>
            ) : (
              <DL>
                <DLRow label="ชื่อ-นามสกุล" value={`${coordinator.firstName ?? ''} ${coordinator.lastName ?? ''}`.trim()} />
                <DLRow label="อีเมล"         value={coordinator.email} />
                <DLRow label="เบอร์โทร"      value={coordinator.phone} />
                <DLRow label="เข้าอบรมด้วย"  value={doc.coordinator?.isAttending ? 'ใช่' : 'ไม่'} />
              </DL>
            )}
          </SectionCard>

          {/*
            การเงินและเอกสาร — the design's name for this card, over the invoice
            fields it has always held.

            ── เลขที่ใบเสนอราคา IS NOT BUILT ──────────────────────────────────
            The design shows a QT-2026-0814 row here. RULED OUT: no such field
            exists on RegisterPublic and none is being added. Quotation numbers
            are produced outside the system today, so a row here would either be
            blank on every record or would invent one.

            ── AND THE OMISE RECORD IS THE CARD NEXT DOOR, NOT THIS ONE ───────
            A แก้ไข button pinned to a card header claims the whole card is
            editable. `payment` is written by the charge route and the Omise
            webhook and by nothing else, so folding it in here would be the
            screen offering to edit a charge. Two cards; one of them has no edit
            affordance at all, which is the honest way to say so.
          */}
          <SectionCard
            icon={Receipt}
            title="การเงินและเอกสาร"
            {...editProps('invoice')}
            onSave={handleSaveInvoice}
          >
            {editSection === 'invoice' ? (
              <InvoiceEditForm
                requestInvoice={requestInvoice}
                setRequestInvoice={setRequestInvoice}
                invoice={invoice}
                setInvoice={setInvoice}
              />
            ) : (
              <InvoiceReadView requestInvoice={requestInvoice} invoice={invoice} />
            )}
          </SectionCard>

          {doc.payment && (
            <PaymentInfoCard payment={doc.payment} pricing={doc.pricing} consent={doc.consent} />
          )}

          <SectionCard
            icon={StickyNote}
            title="หมายเหตุ"
            {...editProps('notes')}
            onSave={() => save({ notes }, 'save-notes')}
          >
            {editSection === 'notes' ? (
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={4}
                placeholder="หมายเหตุเพิ่มเติม..."
                className="w-full resize-y rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand" />
            ) : notes ? (
              <QuotedNote>{notes}</QuotedNote>
            ) : (
              // NOT an empty quoted block. An accent rule beside nothing asserts
              // there is a quotation there.
              <p className="text-[13px] italic leading-[22px] text-[var(--text-muted)]">ไม่มีหมายเหตุ</p>
            )}
          </SectionCard>

          <SystemCard icon={Database} title="ข้อมูลระบบ">
            <DLRow label="Registration ID" value={mono(doc._id)} />
            <DLRow label="Class ID"        value={mono(doc.classId)} />
            <DLRow label="แหล่งที่มา"       value={doc.source ?? 'web'} />
            <DLRow label="IP Address"      value={doc.ipAddress} />
            <DLRow label="อัปเดตล่าสุด"     value={fmtDate(doc.updatedAt)} />
          </SystemCard>
        </div>
      </TabPanel>

      {/* ── ผู้เข้าอบรม ── */}
      <TabPanel id={idFor('attendees', 'panel')} labelledBy={idFor('attendees', 'tab')} hidden={tab !== 'attendees'}>
        <SectionCard
          icon={Users}
          title={`รายชื่อผู้เข้าอบรม (${attendeesCount} ท่าน)`}
          {...editProps('attendees')}
          onSave={() => save({ attendeesListProvided, attendeesCount, attendees }, 'save-attendees')}
        >
          {editSection === 'attendees' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">จำนวนผู้เข้าอบรม</label>
                  <input type="number" min={1} max={50} value={attendeesCount}
                    onChange={(e) => setAttendeesCount(parseInt(e.target.value, 10) || 1)}
                    className="h-9 w-24 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 text-sm focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand" />
                </div>
                <label className="flex cursor-pointer items-center gap-2 pt-5">
                  <input type="checkbox" checked={!attendeesListProvided}
                    onChange={(e) => setAttendeesListProvided(!e.target.checked)}
                    className="h-4 w-4 rounded accent-9e-brand" />
                  <span className="text-sm text-[var(--text-primary)]">ยังไม่ประสงค์แจ้งรายชื่อ</span>
                </label>
              </div>

              {attendeesListProvided && (
                <div className="space-y-3">
                  {attendees.map((a, i) => (
                    <div key={i} className="rounded-9e-md border border-[var(--surface-border)] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">ท่านที่ {i + 1}</span>
                        <button type="button" onClick={() => removeAttendee(i)}
                          className="flex items-center gap-1 text-xs text-[var(--text-muted)] transition-colors hover:text-9e-accent">
                          <X aria-hidden="true" className="h-3.5 w-3.5" />ลบ
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <EditField label="ชื่อ" required value={a.firstName} onChange={(v) => updateAttendee(i, 'firstName', v)} />
                        <EditField label="นามสกุล" required value={a.lastName} onChange={(v) => updateAttendee(i, 'lastName', v)} />
                        <EditField label="อีเมล" type="email" required value={a.email} onChange={(v) => updateAttendee(i, 'email', v)} />
                        <EditField label="เบอร์โทร" type="tel" required value={a.phone} onChange={(v) => updateAttendee(i, 'phone', v)} />
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addAttendee}
                    className="flex w-full items-center justify-center gap-1.5 rounded-9e-md border border-dashed border-[var(--surface-border)] py-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-9e-brand hover:text-9e-brand">
                    <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                    เพิ่มผู้เข้าอบรม
                  </button>
                </div>
              )}
            </div>
          ) : !attendeesListProvided ? (
            <p className="text-[13px] leading-[22px] text-[var(--text-secondary)]">ยังไม่ได้ระบุรายชื่อ — จะแจ้งภายหลัง</p>
          ) : attendees.length > 0 ? (
            <AttendeeTable attendees={attendees} coordinatorAttending={doc.coordinator?.isAttending} />
          ) : (
            <p className="text-[13px] leading-[22px] text-[var(--text-muted)]">ไม่มีข้อมูลผู้เข้าอบรม</p>
          )}
        </SectionCard>
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

// ── Attendee table ─────────────────────────────────────────────────

/**
 * The roster, as a real table.
 *
 * ── THE COLUMN SET IS DERIVED AND THE BODY CELLS ARE NOT ───────────────────
 * Exactly the shape both list tables have: `<thead>` is `COLUMNS.map(...)` while
 * the body's four `<td>`s are written out by hand. So a column added here grows
 * the header and leaves every row one cell short, and the guard the list tables
 * carry — every body row has as many cells as the header — applies unchanged
 * rather than being ported on a guess. It is the same defect in the same shape,
 * which is why the same assertion is the right one.
 *
 * No `<colgroup>`: the list tables are `table-fixed` with measured proportions
 * because their columns were specified; this one has four columns of ordinary
 * content and lets the browser size them. That IS a difference from the list
 * tables and it is why the `<col>`-count and ratio assertions are NOT ported —
 * there is nothing for them to read.
 */
const ATTENDEE_COLUMNS = [
  { key: 'n',     label: 'ท่านที่' },
  { key: 'name',  label: 'ชื่อ-นามสกุล' },
  { key: 'email', label: 'อีเมล' },
  { key: 'phone', label: 'เบอร์โทร' },
];

function AttendeeTable({ attendees, coordinatorAttending }) {
  return (
    <table className="w-full">
      <thead className="border-b border-[var(--surface-border)]">
        <tr>
          {ATTENDEE_COLUMNS.map((c) => (
            <th key={c.key} scope="col"
              className="h-[34px] px-[8px] text-left text-[11px] font-medium leading-[16px] text-[var(--text-secondary)] first:pl-0 last:pr-0">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {attendees.map((a, i) => {
          const name = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim();
          const isCoord = i === 0 && coordinatorAttending;
          return (
            <tr key={i} className="border-b border-[var(--surface-border)] last:border-b-0">
              <td className="h-[40px] px-[8px] pl-0 text-[13px] tabular-nums leading-[20px] text-[var(--text-muted)]">
                {i + 1}
              </td>
              <td className="h-[40px] px-[8px] text-[13px] font-semibold leading-[20px] text-[var(--text-primary)]">
                {name || '—'}
                {/* The coordinator marker is a SUFFIX inside the same cell, not a
                    line of its own: a second element would be empty on every row
                    but one, which is the shape the empty-element guard exists for. */}
                {isCoord ? <span className="ml-[6px] text-[11px] font-normal text-[var(--text-muted)]">(ผู้ประสานงาน)</span> : null}
              </td>
              <td className="h-[40px] px-[8px] text-[12px] leading-[20px] text-[var(--text-secondary)]">
                {a.email || '—'}
              </td>
              <td className="h-[40px] px-[8px] pr-0 text-[12px] leading-[20px] text-[var(--text-secondary)]">
                {a.phone || '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Shared atoms ───────────────────────────────────────────────────

function selectCls() {
  return cn(
    'h-9 w-full rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
    'border-[var(--surface-border)]',
    'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
  );
}

function EditField({ label, value, onChange, type = 'text', required, className }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
        {label}{required && <span className="ml-0.5 text-9e-accent">*</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand" />
    </div>
  );
}

// ── Invoice edit form ─────────────────────────────────────────────

const EMPTY_THAI_ADDR = { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' };
const EMPTY_INTL_ADDR = { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' };

// EXPORTED for the render tier only — the edit form is gated behind
// `editSection === 'invoice'`, which a click sets and renderToStaticMarkup
// cannot reach. Same reason InhouseForm exports InhouseStepForm.
export function InvoiceEditForm({ requestInvoice, setRequestInvoice, invoice, setInvoice }) {
  const isThai = invoice?.country === 'TH' || !invoice?.country;

  const set = (field, val) => setInvoice((prev) => ({ ...prev, [field]: val }));

  const handleCountryChange = (next) => {
    setInvoice((prev) => ({
      ...prev,
      country: next,
      thaiAddress:          next === 'TH'    ? (prev.thaiAddress ?? EMPTY_THAI_ADDR) : null,
      internationalAddress: next === 'OTHER' ? (prev.internationalAddress ?? EMPTY_INTL_ADDR) : null,
    }));
  };

  const setThaiAddr   = (field, val) => setInvoice((prev) => ({ ...prev, thaiAddress:          { ...(prev.thaiAddress          ?? EMPTY_THAI_ADDR), [field]: val } }));
  const setIntlAddr   = (field, val) => setInvoice((prev) => ({ ...prev, internationalAddress: { ...(prev.internationalAddress ?? EMPTY_INTL_ADDR), [field]: val } }));

  return (
    <div className="space-y-4">
      {/* Toggle invoice on/off */}
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={requestInvoice}
          onChange={(e) => {
            setRequestInvoice(e.target.checked);
            if (e.target.checked && !invoice) {
              // branchType/branchCode, NOT `branch` — seeding the legacy key
              // here would put the skeleton out of step with the control below
              // and with the action's allowlist, and the save would look fine
              // and store nothing.
              setInvoice({ type: 'individual', country: 'TH', firstName: '', lastName: '', companyName: '', branchType: 'head_office', branchCode: '', branchFree: '', taxId: '', thaiAddress: { ...EMPTY_THAI_ADDR }, internationalAddress: null });
            }
          }}
          className="h-4 w-4 rounded accent-9e-brand"
        />
        <span className="text-sm font-medium text-[var(--text-primary)]">ต้องการใบเสนอราคา / ใบกำกับภาษี</span>
      </label>

      {requestInvoice && invoice && (
        <div className="space-y-4 rounded-9e-md border border-[var(--surface-border)] p-4">

          {/* Type + Country */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">ประเภทลูกค้า</label>
              <select value={invoice.type ?? 'individual'} onChange={(e) => set('type', e.target.value)} className={selectCls()}>
                <option value="individual">บุคคลทั่วไป / Individual</option>
                <option value="corporate">บริษัท / องค์กร / Company</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">ประเทศ / Country</label>
              <select value={invoice.country ?? 'TH'} onChange={(e) => handleCountryChange(e.target.value)} className={selectCls()}>
                <option value="TH">Thailand</option>
                <option value="OTHER">Other country</option>
              </select>
            </div>
          </div>

          {/* Identity */}
          {invoice.type === 'individual' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <EditField label="ชื่อ" required value={invoice.firstName ?? ''} onChange={(v) => set('firstName', v)} />
              <EditField label="นามสกุล" required value={invoice.lastName ?? ''} onChange={(v) => set('lastName', v)} />
            </div>
          ) : (
            <div className="grid gap-3">
              <EditField label={isThai ? 'ชื่อบริษัท' : 'Company name'} required value={invoice.companyName ?? ''} onChange={(v) => set('companyName', v)} />
              {/* THE SAME CONTROL AS THE PUBLIC FORM, deliberately. This path
                  does not run the zod schema, so a free-text box here is a way
                  for an admin to write a branch value the customer-facing form
                  would have rejected — and then the two representations differ
                  with nothing to say which is right. Digits-only + a dropdown
                  makes the invalid state unrepresentable instead of merely
                  discouraged. */}
              {isThai ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                      สาขา<span className="ml-0.5 text-red-500">*</span>
                    </label>
                    <select
                      value={invoice.branchType ?? 'head_office'}
                      onChange={(e) => {
                        const next = e.target.value;
                        // Clear the code on the way back to head office: its
                        // input is hidden in that state, so a leftover value
                        // would be unreachable AND still saved.
                        setInvoice((prev) => ({
                          ...prev,
                          branchType: next,
                          branchCode: next === 'branch' ? (prev.branchCode ?? '') : '',
                        }));
                      }}
                      className={selectCls()}
                    >
                      <option value="head_office">สำนักงานใหญ่</option>
                      <option value="branch">สาขาย่อย</option>
                    </select>
                  </div>
                  {invoice.branchType === 'branch' && (
                    <EditField
                      label="เลขที่สาขา"
                      required
                      value={invoice.branchCode ?? ''}
                      onChange={(v) => set('branchCode', onlyDigits(v, 5))}
                    />
                  )}
                </div>
              ) : (
                <EditField label="Branch / Division (optional)" value={invoice.branchFree ?? ''} onChange={(v) => set('branchFree', v)} />
              )}
            </div>
          )}

          {/* Tax ID */}
          <EditField
            label={isThai ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID / VAT ID (optional)'}
            value={invoice.taxId ?? ''}
            onChange={(v) => set('taxId', isThai ? onlyDigits(v, 13) : v)}
            required={isThai}
          />

          {/* Address */}
          {isThai ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">ที่อยู่ (ไทย)</p>
              <EditField label="ที่อยู่" required value={invoice.thaiAddress?.addressLine ?? ''} onChange={(v) => setThaiAddr('addressLine', v)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <EditField label="รหัสไปรษณีย์" required value={invoice.thaiAddress?.postalCode ?? ''} onChange={(v) => setThaiAddr('postalCode', v)} />
                <EditField label="แขวง / ตำบล" required value={invoice.thaiAddress?.subDistrict ?? ''} onChange={(v) => setThaiAddr('subDistrict', v)} />
                <EditField label="เขต / อำเภอ" required value={invoice.thaiAddress?.district ?? ''} onChange={(v) => setThaiAddr('district', v)} />
                <EditField label="จังหวัด" required value={invoice.thaiAddress?.province ?? ''} onChange={(v) => setThaiAddr('province', v)} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">Address</p>
              <EditField label="Address line 1" required value={invoice.internationalAddress?.line1 ?? ''} onChange={(v) => setIntlAddr('line1', v)} />
              <EditField label="Address line 2 (optional)" value={invoice.internationalAddress?.line2 ?? ''} onChange={(v) => setIntlAddr('line2', v)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <EditField label="City" required value={invoice.internationalAddress?.city ?? ''} onChange={(v) => setIntlAddr('city', v)} />
                <EditField label="State / Region (optional)" value={invoice.internationalAddress?.state ?? ''} onChange={(v) => setIntlAddr('state', v)} />
                <EditField label="Postal code (optional)" value={invoice.internationalAddress?.postalCode ?? ''} onChange={(v) => setIntlAddr('postalCode', v)} />
                <EditField label="Country" required value={invoice.internationalAddress?.country ?? ''} onChange={(v) => setIntlAddr('country', v)} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Invoice read view ─────────────────────────────────────────────

function InvoiceReadView({ requestInvoice, invoice }) {
  if (!requestInvoice || !invoice) {
    return <p className="text-[13px] italic leading-[22px] text-[var(--text-muted)]">ไม่ได้ขอใบเสนอราคา</p>;
  }
  return (
    <DL>
      <DLRow
        label="ประเภทลูกค้า"
        value={`${invoice.type === 'corporate' ? 'นิติบุคคล / บริษัท' : 'บุคคลทั่วไป'} · ${invoice.country === 'OTHER' ? 'ต่างประเทศ' : 'ไทย'}`}
      />
      {invoice.type === 'individual' ? (
        <DLRow label="ชื่อ-นามสกุล" value={`${invoice.firstName ?? ''} ${invoice.lastName ?? ''}`.trim()} />
      ) : (
        <>
          <DLRow label="ชื่อบริษัท" value={invoice.companyName} />
          {/* Derived at read time — the label is never stored. Covers the
              structured pair, the foreign free-text field, and the legacy
              `branch` string on pre-split documents. */}
          <DLRow label="สาขา" value={formatInvoiceBranchLabel(invoice)} />
        </>
      )}
      <DLRow label="เลขประจำตัวผู้เสียภาษี" value={invoice.taxId} />
      {invoice.country === 'TH' && invoice.thaiAddress && (
        // The whole invoice, not invoice.thaiAddress — the formatter reads
        // invoice.country to choose its branch, so passing the sub-object alone
        // would silently take the Thai path for a foreign address.
        <DLRow label="ที่อยู่" wide value={formatBillingAddress(invoice)} />
      )}
      {invoice.country === 'OTHER' && invoice.internationalAddress && (
        <DLRow label="ที่อยู่" wide
          value={[invoice.internationalAddress.line1, invoice.internationalAddress.line2, invoice.internationalAddress.city, invoice.internationalAddress.state, invoice.internationalAddress.postalCode, invoice.internationalAddress.country].filter(Boolean).join(', ')}
        />
      )}
    </DL>
  );
}

// ── Payment info (read-only) ──────────────────────────────────────

/**
 * The Omise record, exactly as stored.
 *
 * ── NO WARNING CARD AND NO FALLBACK FOR THE paid/omiseStatus CONTRADICTION ──
 * Records exist whose `status` is `paid` while `payment.omiseStatus` still reads
 * `pending` and `payment.paidAt` is absent. That is real and it is outstanding.
 * It is NOT reconciled here: no banner claiming a problem, and equally no
 * fallback quietly showing "สำเร็จ" because the status says `paid`. The card
 * renders what the record holds and the disagreement stays visible, which is the
 * only rendering that does not decide the question on the reader's behalf.
 *
 * There is no แก้ไข on this card at all. `payment` is written by
 * api/registration/public/charge and by the Omise webhook; an edit affordance
 * would be the screen offering to edit a charge.
 */
function PaymentInfoCard({ payment, pricing, consent }) {
  const chargeUrl = payment.omiseChargeId
    ? `https://dashboard.omise.co/charges/${payment.omiseChargeId}`
    : null;
  return (
    <SectionCard icon={CreditCard} title="การชำระเงิน (Omise)">
      <DL>
        <DLRow label="วิธีชำระเงิน" value={PAYMENT_METHOD_LABEL[payment.method] ?? payment.method} />
        <DLRow label="สถานะการชำระ" value={OMISE_STATUS_LABEL[payment.omiseStatus] ?? payment.omiseStatus} />
        {pricing && (
          <>
            <DLRow label="ราคาต่อท่าน" value={`${formatTHB(pricing.pricePerSeat)} บาท`} />
            <DLRow label={`ราคา × ${pricing.seats} ท่าน`} value={`${formatTHB(pricing.subtotal)} บาท`} />
            <DLRow label="VAT 7%" value={`${formatTHB(pricing.vatAmount)} บาท`} />
            <DLRow label="ยอดสุทธิ" value={<span className="font-bold text-9e-action">{formatTHB(pricing.total)} บาท</span>} />
          </>
        )}
        <DLRow label="วันที่ชำระ" value={payment.paidAt ? fmtDate(payment.paidAt) : ''} />
        <DLRow
          label="Omise Charge ID"
          value={payment.omiseChargeId ? (
            <a href={chargeUrl} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[11px] text-9e-action hover:underline">
              {payment.omiseChargeId}
            </a>
          ) : ''}
        />
        <DLRow label="สาเหตุที่ล้มเหลว" wide
          value={[payment.failureCode, payment.failureMessage].filter(Boolean).join(' · ')} />
      </DL>

      {consent && (
        <div className="mt-[16px] rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">การยอมรับเงื่อนไข (Audit)</p>
          <ConsentLine ok={consent.dataChecked}   label="ตรวจสอบข้อมูลแล้ว" />
          <ConsentLine ok={consent.noRefund}      label="รับทราบไม่คืนเงิน" />
          <ConsentLine ok={consent.changePolicy}  label="เงื่อนไขเปลี่ยน/เลื่อน/ยกเลิก" />
          <ConsentLine ok={consent.termsAccepted} label="ยินยอมเงื่อนไขอบรม" />
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            เวลา: {consent.acceptedAt ? fmtDate(consent.acceptedAt) : '—'} · IP: {consent.ipAddress || '—'}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function ConsentLine({ ok, label }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
      <span className={ok ? 'text-emerald-600' : 'text-[var(--text-muted)]'}>{ok ? '✓' : '—'}</span>
      <span>{label}</span>
    </div>
  );
}
