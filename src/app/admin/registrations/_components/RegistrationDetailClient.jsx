'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Trash2, X, Plus, Pencil, Copy, GraduationCap, User, Users, Receipt,
  CreditCard, StickyNote, Database, ClipboardList, History, Lock,
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
  addInternalNote,
  updateRegistrationRound,
} from '@/lib/actions/registrations';
import { storedRoundOption, isHybridRound, formatClassDates } from '@/lib/registrations/roundSelection';
import { normalizeScheduleStatus } from '@/lib/scheduleStatus';
import { refNo } from '@/lib/refNo';
import { detailHeading, publicHeadingIdentifier } from '@/lib/registrations/detailHeading';
import { allowedTransitions, isSystemSet, statusBadge, statusLabel } from '@/lib/registrations/statuses';
import {
  attendeeInfoState, missingAttendeeFields, rosterState,
} from '@/lib/registrations/attendeeInfo';
import {
  BackLink, DetailHeader, TypeBadge, StatusBar, PrimaryAction, OverflowMenu, OverflowItem,
  EqualSummaryRow, TabList, TabPanel, SectionCard, SystemCard,
  DL, DLRow, QuotedNote, DetailError, EditField, selectCls, InternalNotesBody,
} from './detailShell';
import { readNotes } from '@/lib/registrations/internalNotes';

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
 * The สถานะข้อมูล chip's colours, keyed by the per-attendee completeness state.
 *
 * ── THIS IS NOT THE STATUS VOCABULARY AND MUST NEVER JOIN IT ───────────────
 * Its keys are `complete` / `partial` / `empty`, which describe ONE ATTENDEE'S
 * FIELDS. `lib/registrations/statuses` describes what stage a REGISTRATION is
 * at. They share no value and answer no common question, so an entry for one in
 * the other would be a category error — the same ruling `SCHEDULE_BADGE` on the
 * public list table already carries, and a test pins both.
 *
 * The fallback is a real colour rather than '': a chip with no background is
 * invisible against the row, so an unrecognised state would read as an EMPTY
 * CELL rather than as a state nobody has styled. Grey says "unknown", blank says
 * "nothing here", and only one of those is true.
 */
const INFO_BADGE = {
  complete: 'bg-emerald-100 text-emerald-700',
  partial:  'bg-amber-100 text-amber-700',
  empty:    'bg-slate-100 text-slate-500',
};

const INFO_LABEL = {
  complete: 'ข้อมูลครบ',
  partial:  'ข้อมูลไม่ครบ',
  empty:    'ยังไม่กรอก',
};

const INFO_NEUTRAL_BADGE = 'bg-slate-100 text-slate-600';

/** The Thai names of the four attendee fields, for the incomplete row's hint. */
const FIELD_LABEL = {
  firstName: 'ชื่อ',
  lastName:  'นามสกุล',
  email:     'อีเมล',
  phone:     'เบอร์โทร',
};

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
/**
 * @param {Array<object>} [props.rounds] the course's upcoming rounds, resolved
 *        SERVER-SIDE by page.jsx — see its docstring for why not here, and for
 *        why past rounds are not among them.
 */
export function RegistrationDetailClient({ doc, rounds = [], history = null }) {
  const router = useRouter();

  // ── Editable state (mirrors doc on load) ────────────────────
  const [status,       setStatus]       = useState(doc.status);
  /**
   * The round, as the screen currently believes it to be.
   *
   * READ-ONLY DISPLAY STATE. Nothing in this file writes it field by field any
   * more — `handleSaveRound` replaces the whole object with what the SERVER
   * derived and returned, which is the only shape in which the four cannot
   * drift apart on the client either.
   */
  const [course, setCourse] = useState({
    classId:        doc.classId        ?? '',
    classDate:      doc.classDate      ?? '',
    scheduleType:   doc.scheduleType   ?? 'classroom',
    attendanceMode: doc.attendanceMode ?? 'classroom',
  });

  /**
   * THE DRAFT IS AN ID AND A MODE. That is the whole payload.
   *
   * There is no `classDate` and no `scheduleType` in here, and that absence is
   * the client half of the guarantee: a control that cannot hold a label cannot
   * submit one that disagrees with the id.
   */
  const [roundDraft, setRoundDraft] = useState({
    classId: doc.classId ?? '',
    attendanceMode: doc.attendanceMode ?? '',
  });
  const [coordinator,  setCoordinator]  = useState({ ...doc.coordinator });
  const [attendeesListProvided, setAttendeesListProvided] = useState(doc.attendeesListProvided ?? true);
  const [attendeesCount, setAttendeesCount] = useState(doc.attendeesCount ?? 1);
  const [attendees,    setAttendees]    = useState(doc.attendees?.length ? [...doc.attendees] : []);
  // `notes` IS THE CUSTOMER'S. It is editable through updateRegistration and is
  // shown back to them. Do not confuse it with `internalNotes` below — see the
  // naming note in lib/registrations/internalNotes.
  const [notes,        setNotes]        = useState(doc.notes ?? '');

  /**
   * INTERNAL NOTES — APPEND-ONLY, so the state is the LIST plus a DRAFT and
   * there is no editable copy of any existing entry.
   *
   * That is not a simplification, it is the enforcement made visible: there is
   * no `setInternalNotes(i, …)` because there is nothing that could call it.
   * The list only ever grows, and it grows by appending what the server
   * accepted rather than by trusting the draft — see `handleAddNote`.
   */
  const [internalNotes, setInternalNotes] = useState(() => readNotes(doc.adminNotes));
  const [noteDraft,     setNoteDraft]     = useState('');
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
  // Which attendee row's "•••" is open, by index. One at a time, like the
  // status bar's menu — two open sheets on one screen is a state nobody wants.
  const [openAttendeeRow, setOpenAttendeeRow] = useState(null);
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
    // The round card restores the DRAFT, not `course` — `course` only ever
    // holds what the server confirmed, so there is nothing there to revert.
    if (section === 'course')      setRoundDraft({ classId: course.classId ?? '', attendanceMode: course.attendanceMode ?? '' });
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

  /**
   * ADD ONE NOTE. The only mutation of `internalNotes` in this file.
   *
   * ── THE OPTIMISTIC ENTRY IS BUILT FROM THE DRAFT AND IS NOT THE RECORD ────
   * The server stamps `authorId`, `authorName` and `createdAt` from the session
   * — the client cannot and must not supply them. What is appended here is a
   * local echo so the note appears immediately; the authoritative values arrive
   * on the next load via `revalidatePath`. `authorName: ''` renders the em dash
   * for that instant rather than a name the client guessed.
   *
   * The draft is cleared ONLY on success. A failed add that emptied the box
   * would lose what the admin typed, and there is no way to get it back.
   */
  const handleAddNote = () => {
    const body = noteDraft.trim();
    if (!body) return;
    setBusy('add-note'); setError(null);
    startTransition(async () => {
      const res = await addInternalNote(doc._id, body);
      if (res.ok) {
        setInternalNotes((prev) => [...prev, { body, authorId: '', authorName: '', createdAt: null }]);
        setNoteDraft('');
      } else {
        setError(res.error || 'บันทึกไม่สำเร็จ');
      }
      setBusy(null);
    });
  };

  /**
   * MOVE THE REGISTRATION TO A DIFFERENT ROUND.
   *
   * ── THE PAYLOAD IS AN ID, AND THE REPLY IS THE TRUTH ──────────────────────
   * `updateRegistrationRound` returns the four fields IT derived, and they are
   * written to `course` wholesale. The client never computes a label: doing so
   * would be a second implementation of the coupling, on the side that cannot
   * see the round, and the two would disagree the first time upstream changed a
   * date.
   *
   * `attendanceMode` is sent ONLY when it has been chosen. Sending `''` for a
   * non-hybrid round would be a client asserting a mode it was never asked for;
   * the server ignores it for non-hybrid rounds anyway, and omitting it keeps
   * the payload honest about what the admin actually decided.
   */
  const handleSaveRound = () => {
    setBusy('save-course'); setError(null);
    startTransition(async () => {
      const res = await updateRegistrationRound(doc._id, {
        classId: roundDraft.classId,
        ...(roundDraft.attendanceMode ? { attendanceMode: roundDraft.attendanceMode } : {}),
      });
      if (res.ok && res.fields) {
        setCourse(res.fields);
        setRoundDraft({ classId: res.fields.classId, attendanceMode: res.fields.attendanceMode });
        setEditSection(null);
      } else {
        setError(res.error || 'บันทึกไม่สำเร็จ');
      }
      setBusy(null);
    });
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
  /**
   * `available` is a SECOND reason the affordance can be absent, and it goes
   * through the same producer rather than beside it.
   *
   * The round card needs it: with no rounds to offer, opening an editor whose
   * only control is an empty dropdown is a button that leads nowhere. A first
   * draft expressed that as a ternary at the call site —
   * `rounds.length ? editProps('course') : { editLabel: 'แก้ไข' }` — and
   * fs/registrationActionsDerived caught it: that spreads an object which is NOT
   * from `editProps`, which is precisely the shape the single-producer rule
   * exists to forbid. The guard was right and the code was wrong.
   *
   * So the reason lives INSIDE the gate. There is still exactly one place a card
   * can be given an `onEdit`, and it now answers two questions instead of one.
   */
  const editProps = (section, available = true) => ({
    editLabel: 'แก้ไข',
    onEdit:    (readOnly || !available) ? undefined : () => setEditSection(section),
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
   * THE ROSTER STATE, AND WHY IT IS DERIVED HERE AND NOT ON THE LIST.
   *
   * The list screen's ผู้เข้าอบรม cell renders a bare number, and the design's
   * ครบ / ยังไม่ครบ chip was RULED OUT there — deriving it needs
   * `attendeesListProvided` and the `attendees` ARRAY, and adding those to a
   * list projection would pull a personal-data array over the wire for twenty
   * rows to render a three-way chip.
   *
   * HERE nothing is widened. `getRegistrationById` is `findById(id).lean()` with
   * no projection at all, so this page already holds the whole document,
   * attendees included — verified against the action rather than assumed.
   *
   * ── THE DERIVATION MOVED OUT IN ROUND 5, AND THAT WAS FORCED ─────────────
   * Round 4 computed it inline; a second copy for the attendee tab would be two
   * derivations of one number on one page, which is how a screen comes to answer
   * one question two ways. `rosterState` in lib/registrations/attendeeInfo is now
   * the only place it is computed.
   *
   * ── `rosterSub` WENT WITH THE STRIP, AND IT WAS ITS ONLY READER ──────────
   * It phrased this state as `รายชื่อครบ 2/2` for the 16.5px dark sub-line and
   * NOTHING ELSE CONSUMED IT — the tab badge renders `attendeesCount`, and the
   * attendee card's second row has its own `rosterSentence`. So the variable is
   * deleted rather than kept "in case": the two surviving surfaces both read
   * `roster` directly, and a third phrasing with no reader is a thing to
   * maintain and no way to notice it has gone wrong.
   *
   * `roster` itself stays — `attendeeSummaryCells` and `rosterSentence` below
   * are both built from it.
   */
  const roster = rosterState({ attendeesListProvided, attendeesCount, attendees });

  /*
   * THE THREE DARK-STRIP CELLS ARE GONE — see the note in detailShell where the
   * component was. รอบอบรม and the arrangement are rows of the ข้อมูลคอร์ส card;
   * the attendee count is the ผู้เข้าอบรม tab's summary row and its tab badge;
   * ยอดสุทธิ is PaymentInfoCard's, where it is correctly ABSENT on the quotation
   * path instead of rendering a dash.
   */

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
  /**
   * The attendee card's edit gate, taken ONCE.
   *
   * Both the card's แก้ไข and the + เพิ่มผู้เข้าอบรม button read this same
   * object, so there is still exactly ONE producer of an edit affordance in the
   * file. Calling `editProps('attendees')` a second time for the + button would
   * have been a second call site of the gate — harmless today and exactly the
   * shape that lets a future control be added beside it WITHOUT the gate, which
   * is the defect the single-producer rule exists to make unrepresentable.
   */
  const attendeeEdit = editProps('attendees');

  /**
   * THE ROUND CARD'S EDIT GATE, taken once — same single-producer rule as the
   * attendee card's.
   *
   * ── AND IT CLOSES WHEN THERE ARE NO ROUNDS TO OFFER ───────────────────────
   * `rounds` is empty when upstream is down, when the course was withdrawn, or
   * when a course simply has no upcoming rounds. Opening an editor whose only
   * control is an empty dropdown is a button that leads nowhere, so the
   * affordance follows the data — the same "absent means no button" rule the
   * cancellation lock uses, applied to a second reason.
   *
   * The read view says why; see the empty hint below.
   */
  const roundEdit = editProps('course', rounds.length > 0);

  /**
   * The stored round WHEN IT IS NO LONGER IN THE LIST — see requirement 5.
   *
   * Not an edge case. The schedule endpoint filters `>= today` unconditionally,
   * so EVERY registration for a round that has already run lands here.
   */
  const storedRound = storedRoundOption(course, rounds);

  /**
   * The three cells of the attendee tab's summary row.
   *
   * ความครบถ้วน reads the SAME `rosterState` the dark strip reads, worded for a
   * 359px cell instead of a 16.5px sub-line. `ยังไม่แจ้ง` rather than a count for
   * the opted-out case, because there is no denominator to be complete against —
   * `buildAttendees` writes an empty array in that state.
   */
  const attendeeSummaryCells = [
    { key: 'declared', label: 'จำนวนที่สมัคร',   value: `${roster.count} ท่าน` },
    { key: 'named',    label: 'แจ้งรายชื่อแล้ว', value: `${roster.named} ท่าน` },
    {
      key:   'complete',
      label: 'ความครบถ้วน',
      value: roster.state === 'not-provided'
        ? 'ยังไม่แจ้ง'
        : `${roster.state === 'complete' ? 'ครบ' : 'ยังไม่ครบ'} ${roster.named}/${roster.count}`,
    },
  ];

  /** The same three states as a sentence, for the card's 49.6px second row. */
  const rosterSentence = roster.state === 'not-provided'
    ? 'ผู้ประสานงานยังไม่ประสงค์แจ้งรายชื่อ — จะแจ้งภายหลัง'
    : roster.state === 'complete'
      ? `แจ้งรายชื่อครบตามจำนวนที่สมัครแล้ว (${roster.named}/${roster.count} ท่าน)`
      : `ยังขาดอีก ${roster.count - roster.named} ท่าน จากที่สมัครไว้ ${roster.count} ท่าน`;

  const tabs = TABS
    .filter((t) => t.key !== 'history' || history)
    .map((t) => (t.key === 'attendees' ? { ...t, count: attendeesCount } : t));
  const idFor = (key, kind) => `reg-${kind}-${key}`;

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <BackLink label="กลับรายการ" onClick={() => router.back()} />

      {/*
        THE HEADING NAMES THE COORDINATOR, AND THE REFERENCE NUMBER IS GONE FROM
        IT — it is a row of the ข้อมูลระบบ card at the foot of the page. See
        lib/registrations/detailHeading for the empty-identifier rule; a
        registration whose coordinator has no name renders the label ALONE, never
        a trailing colon.
      */}
      <DetailHeader
        badge={<TypeBadge label="Public" className="bg-sky-100 text-sky-700" />}
        timestamp={`สมัครเมื่อ ${fmtDate(doc.createdAt)}`}
        title={detailHeading(publicHeadingIdentifier(doc))}
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

      <DetailError message={error} />

      <TabList tabs={tabs} active={tab} onSelect={setTab} idFor={idFor} />

      {/* ── ข้อมูลการสมัคร ── */}
      <TabPanel id={idFor('registration', 'panel')} labelledBy={idFor('registration', 'tab')} hidden={tab !== 'registration'}>
        <div className="space-y-[16px]">

          {/*
            ── THE FREE-TEXT ROUND EDITOR IS GONE. DO NOT BRING IT BACK. ──────
            It was three controls writing `classDate`, `scheduleType` and
            `attendanceMode` INDEPENDENTLY, with `classId` involved in none of
            them — so an admin could set the date label to anything while the id
            went on pointing at the old round, and no screen showed the
            disagreement.

            What replaces it sends an ID and lets the server derive the rest.
            See lib/registrations/roundSelection and `updateRegistrationRound`.
          */}
          <SectionCard
            icon={GraduationCap}
            title="ข้อมูลคอร์ส"
            {...roundEdit}
            onSave={handleSaveRound}
          >
            {editSection === 'course' ? (
              <RoundEditForm
                rounds={rounds}
                storedOption={storedRound}
                classId={roundDraft.classId}
                attendanceMode={roundDraft.attendanceMode}
                onChange={setRoundDraft}
              />
            ) : (
              <DL>
                <DLRow label="หลักสูตร"  value={doc.courseName} />
                <DLRow label="รหัสคอร์ส" value={doc.courseCode || doc.courseId} />
                <DLRow
                  label="รอบอบรม"
                  value={course.classDate}
                  emptyHint="ยังไม่ได้ระบุรอบ"
                  /*
                    THE READ VIEW SAYS WHY THE BUTTON IS MISSING. A card with no
                    แก้ไข and no explanation reads as a broken page — the same
                    reasoning as the status bar's read-only copy. Two distinct
                    reasons, and they are not interchangeable:
                      · no rounds at all  → nothing to move to
                      · the stored round is gone → it can be SHOWN but not
                        re-chosen, which is a different sentence
                  */
                  action={rounds.length === 0 ? (
                    <span className="shrink-0 text-[11px] italic leading-[16px] text-[var(--text-muted)]">
                      ไม่มีรอบให้เลือกในขณะนี้
                    </span>
                  ) : storedRound ? (
                    <span className="shrink-0 text-[11px] italic leading-[16px] text-[var(--text-muted)]">
                      รอบนี้ไม่เปิดรับแล้ว
                    </span>
                  ) : null}
                />
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
                {/*
                  ── เข้าอบรมด้วย IS REMOVED FROM THE READ VIEW ONLY ─────────
                  DISPLAY ONLY. `coordinator.isAttending` stays on the schema, is
                  still written by the public wizard's checkbox, and is still
                  READ in five places that matter — `buildAttendees` gives the
                  coordinator the first seat when it is true, the attendee table
                  below marks their row, and three email models carry it. None of
                  that changes.

                  IT WAS NOT EDITABLE HERE AND DOES NOT BECOME EDITABLE.
                  `updateRegistration`'s coordinator branch names exactly
                  firstName / lastName / email / phone; `isAttending` is not in
                  the allowlist and no control ever offered it. So the instruction
                  "stays editable if it is editable today" resolves to: it was
                  not, and it still is not.

                  ── A VACUITY CHANGE, AND IT IS THIS CARD'S ────────────────
                  This row's value was `isAttending ? 'ใช่' : 'ไม่'` — TRUTHY IN
                  BOTH BRANCHES. It was the one row of this card that `DLRow`
                  could never drop, so the card was guaranteed to render at least
                  one row whatever the document held. Any assertion of the shape
                  "the coordinator card renders something" was satisfied by this
                  row and by the data never. With it gone all three remaining
                  rows are genuinely optional, and such an assertion now measures
                  the record. Nothing in the suite currently makes that claim —
                  checked — so nothing went from meaningful to vacuous here; the
                  change is in the safe direction.
                */}
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

          {/*
            ── INTERNAL NOTES — APPEND-ONLY, AND NOT THE CARD ABOVE ──────────
            The หมายเหตุ card above holds `doc.notes`: THE CUSTOMER'S OWN NOTE,
            written by the public form and quoted back to them in the
            confirmation email. This card holds `doc.adminNotes`, which the
            customer must never see. Two fields, two cards, two names — see the
            naming note in lib/registrations/internalNotes.

            NO `editProps` HERE. The card has no แก้ไข because there is nothing
            to edit; what it has is a composer, gated on the SAME `readOnly`
            flag every other card's onEdit is, so a cancelled record renders its
            existing notes and no way to add another.
          */}
          <SectionCard icon={Lock} title="บันทึกภายใน">
            <InternalNotesBody
              notes={internalNotes}
              draft={noteDraft}
              onDraftChange={setNoteDraft}
              onAdd={readOnly ? undefined : handleAddNote}
              adding={busy === 'add-note'}
              formatDate={fmtDate}
              emptyLabel="ยังไม่มีบันทึกภายใน"
            />
          </SectionCard>

          <SystemCard icon={Database} title="ข้อมูลระบบ">
            {/*
              เลขอ้างอิง — MOVED HERE FROM THE HEADING, and it is now the ONLY
              place in the UI this value appears outside the delete-confirm
              dialog. Round 3 deleted the เลขอ้างอิง column from both list tables
              on the express grounds that the detail heading carried it; the
              heading no longer does, so this row is what keeps that decision
              from having quietly removed the number from the product.

              It is FIRST in the card, above the raw id, because it is the value
              a human quotes down the phone — the 24-character `_id` below it is
              for pasting into a query.
            */}
            <DLRow label="เลขอ้างอิง"      value={mono(refNo(doc._id))} />
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
        {/*
          The 75.85px summary row, three EQUAL cells. The third reads the SAME
          `rosterState` the dark strip reads, worded for the room it has — see
          the note on `roster` above for why the derivation had to leave this
          file.
        */}
        <div className="pb-[16px]">
          <EqualSummaryRow cells={attendeeSummaryCells} />
        </div>

        <SectionCard
          icon={Users}
          title="รายชื่อผู้เข้าอบรม"
          {...attendeeEdit}
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
          ) : (
            <>
              {/*
                THE 49.6px SECOND ROW: the completeness in words on the left, the
                + เพิ่มผู้เข้าอบรม button (92.6x32.6) pinned right.

                THE BUTTON IS AN EDIT AFFORDANCE and is gated on exactly the same
                thing every แก้ไข is — `editProps('attendees').onEdit`, which is
                `undefined` on a cancelled record. It is not a second gate: it
                reads the ONE producer, so a cancelled record cannot grow an edit
                path through a control that merely looks like a different kind.
              */}
              <div className="flex h-[49.6px] items-center justify-between gap-[12px]">
                <p className="min-w-0 truncate text-[12px] leading-[17px] text-[var(--text-secondary)]">
                  {rosterSentence}
                </p>
                {attendeeEdit.onEdit ? (
                  <button
                    type="button"
                    onClick={() => { attendeeEdit.onEdit(); addAttendee(); }}
                    className="inline-flex h-[32.6px] w-[92.6px] shrink-0 items-center justify-center gap-[4px] rounded-9e-md border border-9e-brand/40 text-[11px] font-semibold text-9e-action transition-colors hover:bg-9e-brand/5"
                  >
                    <Plus aria-hidden="true" className="h-[12px] w-[12px] shrink-0" />
                    เพิ่มผู้เข้าอบรม
                  </button>
                ) : null}
              </div>

              {!attendeesListProvided ? (
                <p className="text-[13px] leading-[22px] text-[var(--text-secondary)]">ยังไม่ได้ระบุรายชื่อ — จะแจ้งภายหลัง</p>
              ) : attendees.length > 0 ? (
                <AttendeeTable
                  attendees={attendees}
                  coordinatorAttending={doc.coordinator?.isAttending}
                  onEditRow={attendeeEdit.onEdit}
                  openRow={openAttendeeRow}
                  onToggleRow={(i) => setOpenAttendeeRow((cur) => (cur === i ? null : i))}
                />
              ) : (
                <p className="text-[13px] leading-[22px] text-[var(--text-muted)]">ไม่มีข้อมูลผู้เข้าอบรม</p>
              )}
            </>
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
/**
 * The measured column set. `share` is the frame's percentage; `px` is a column
 * whose width is fixed and has no share at all.
 *
 * ── THE ARITHMETIC IS tableParts' ARITHMETIC WITH TWO FIXED COLUMNS ────────
 * The list tables normalise their shares against a fixed CHROME — see
 * `columnWidths` in _components/tableParts.jsx for the derivation and for how
 * the reading was confirmed against the design. The idea is identical here and
 * the shape is not: this table has TWO fixed columns (the row number and the
 * menu) where those have one trailing chevron, so `columnWidths` is not called
 * — widening its contract for a single caller would make the list tables' guard
 * reason about a case they do not have.
 *
 * The three content shares total 88.0%, and the remaining 12% is the two fixed
 * columns plus the 11px of padding at each end. Normalising against whatever the
 * fixed part actually is means the columns fill exactly 100% and the RATIOS
 * between them are exactly as specified — which is the requirement, because the
 * admin sidebar collapses and an absolute px content width would not survive it.
 */
const ATTENDEE_COLUMNS = [
  { key: 'n',       label: '#',              px: 30 },
  // HYPHEN, not the frame's en dash. Every other "ชื่อ-นามสกุล" on these two
  // screens — the coordinator row, the invoice row, the in-house contact row —
  // uses a hyphen, and one table header spelling the same label a second way is
  // the screen being inconsistent with itself over a character nobody asked for.
  { key: 'name',    label: 'ชื่อ-นามสกุล',   share: 30.8 },
  { key: 'contact', label: 'ข้อมูลติดต่อ',    share: 35.2 },
  { key: 'info',    label: 'สถานะข้อมูล',    share: 22.0 },
  { key: 'menu',    label: '',               px: 32 },
];

const ATTENDEE_EDGE = 11;

const ATTENDEE_WIDTHS = (() => {
  const fixed = ATTENDEE_COLUMNS.reduce((sum, c) => sum + (c.px ?? 0), 0) + ATTENDEE_EDGE * 2;
  const total = ATTENDEE_COLUMNS.reduce((sum, c) => sum + (c.share ?? 0), 0);
  return ATTENDEE_COLUMNS.map((c) => (
    c.px != null ? `${c.px}px` : `calc((100% - ${fixed}px) * ${(c.share / total).toFixed(6)})`
  ));
})();

/**
 * The roster, as a real table.
 *
 * ── THE COLUMN SET IS DERIVED AND THE BODY CELLS ARE NOT ───────────────────
 * Exactly the shape both list tables have: `<colgroup>` and `<thead>` are
 * `ATTENDEE_COLUMNS.map(...)` while the body's five `<td>`s are written out by
 * hand. So a column added here grows the header and the colgroup and leaves
 * every row one cell short, and the guard the list tables carry — every body row
 * has as many cells as the header — applies unchanged rather than being ported
 * on a guess. It is the same defect in the same shape.
 *
 * The round-4 version had no `<colgroup>` and said so; the measured column set
 * gave it one, so the `<col>`-count assertion becomes available here and is
 * added. The list tables' RATIO assertion is still NOT ported: those pin six and
 * seven specified shares against a design total, and three shares against 88%
 * is a different claim that the width test below makes directly.
 */
function AttendeeTable({ attendees, coordinatorAttending, onEditRow, openRow, onToggleRow }) {
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        {ATTENDEE_COLUMNS.map((c, i) => <col key={c.key} style={{ width: ATTENDEE_WIDTHS[i] }} />)}
      </colgroup>

      <thead className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
        <tr>
          {ATTENDEE_COLUMNS.map((c, i) => (
            <th
              key={c.key}
              scope="col"
              className="h-[34px] text-left align-middle text-[11px] font-medium leading-[16px] text-[var(--text-secondary)]"
              style={{
                paddingLeft:  i === 0 ? `${ATTENDEE_EDGE}px` : undefined,
                paddingRight: i === ATTENDEE_COLUMNS.length - 1 ? `${ATTENDEE_EDGE}px` : '10px',
              }}
            >
              {/*
                The menu column has no label. `<th>` with screen-reader text
                rather than a `<td>`, so the header row is a complete row of
                header cells — an unlabelled column header is announced as
                nothing at all. Same treatment as the list tables' chevron.
              */}
              {c.label || <span className="sr-only">การดำเนินการ</span>}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {attendees.map((a, i) => {
          const name = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim();
          const isCoord = i === 0 && coordinatorAttending;
          const info = attendeeInfoState(a);
          const pad = (idx) => ({
            paddingLeft:  idx === 0 ? `${ATTENDEE_EDGE}px` : undefined,
            paddingRight: idx === ATTENDEE_COLUMNS.length - 1 ? `${ATTENDEE_EDGE}px` : '10px',
          });

          return (
            <tr key={i} className="h-[48.3px] border-b border-[var(--surface-border)] last:border-b-0">
              <td className="align-middle text-[12px] tabular-nums leading-[17px] text-[var(--text-muted)]" style={pad(0)}>
                {i + 1}
              </td>

              <td className="align-middle" style={pad(1)}>
                <p className="truncate text-[14px] font-bold leading-[17.25px] text-[var(--text-primary)]">
                  {name || '—'}
                  {/* The coordinator marker is a SUFFIX inside the same line, not
                      an element of its own: a second element would be empty on
                      every row but one, which is the shape the empty-element
                      guard exists for. */}
                  {isCoord ? <span className="ml-[6px] text-[11px] font-normal text-[var(--text-muted)]">(ผู้ประสานงาน)</span> : null}
                </p>
              </td>

              {/*
                ข้อมูลติดต่อ — the email as a mailto link over the phone.

                EVERY LINE IS CONDITIONAL and the whole cell falls back to a
                dash. A row with an email and no phone must render ONE line, not
                one line and an empty one — the same rule `CoordinatorCell` on
                the list tables is held to, and the same reason.
              */}
              <td className="align-middle" style={pad(2)}>
                {a.email || a.phone ? (
                  <>
                    {a.email ? (
                      <a href={`mailto:${a.email}`}
                        className="block truncate text-[13px] leading-[17.25px] text-9e-action hover:underline">
                        {a.email}
                      </a>
                    ) : null}
                    {a.phone ? (
                      <span className="block truncate text-[12px] leading-[17px] text-[var(--text-muted)]">
                        {a.phone}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-[13px] leading-[17.25px] text-[var(--text-muted)]">—</span>
                )}
              </td>

              <td className="align-middle" style={pad(3)}>
                <AttendeeInfoChip attendee={a} state={info} />
              </td>

              <td className="align-middle" style={pad(4)}>
                <AttendeeRowMenu
                  index={i}
                  attendee={a}
                  onEditRow={onEditRow}
                  open={openRow === i}
                  onToggle={() => onToggleRow(i)}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The สถานะข้อมูล chip — 21.5px tall, 8px of left padding.
 *
 * ── THE THREE BRANCHES ARE THE DATA'S, NOT THE FRAME'S ────────────────────
 * The frame draws one state, `✓ ข้อมูลครบ`. `attendeeInfoState` enumerates what
 * the record can actually hold — complete, partial, empty — and every one is
 * reachable because the admin save runs with `runValidators: false` and the
 * editor's `+` appends four empty strings. See the module for the measurement.
 *
 * The PARTIAL branch names WHICH fields are missing, in the title attribute
 * rather than in the chip: the chip is 21.5px in a 22% column and a list of
 * field names does not fit, while "ข้อมูลไม่ครบ" with no way to learn what is
 * missing is a chip that reports a problem and hides it. The dashes in the cell
 * next door say it too, for the two fields that cell shows.
 */
function AttendeeInfoChip({ attendee, state }) {
  const missing = state === 'partial' ? missingAttendeeFields(attendee) : [];
  return (
    <span
      title={missing.length ? `ยังขาด: ${missing.map((f) => FIELD_LABEL[f] ?? f).join(', ')}` : undefined}
      className={cn(
        'inline-flex h-[21.5px] w-fit items-center whitespace-nowrap rounded-full pl-[8px] pr-[8px] text-[11px] font-semibold',
        INFO_BADGE[state] ?? INFO_NEUTRAL_BADGE,
      )}
    >
      {INFO_LABEL[state] ?? state}
    </span>
  );
}

/**
 * The per-row "•••".
 *
 * ── WHAT IS IN IT, AND WHY THE TRIGGER FOLLOWS THE ITEM COUNT ─────────────
 *
 *   · แก้ไขรายชื่อ — opens the card's editor. There is no per-attendee server
 *     action: the array is written wholesale by `updateRegistration`, so a row
 *     menu cannot offer a per-row write that the card does not already do. It
 *     reads `onEditRow`, which is the card's ONE edit gate, so on a cancelled
 *     record this item does not exist.
 *
 *   · คัดลอกอีเมล — only when the row HAS an email. Copying is not an edit, so
 *     it survives the read-only lock.
 *
 *   · There is deliberately NO ลบรายชื่อนี้. The editor already gives every row
 *     a remove control, and a second delete path in the read view would need its
 *     own confirmation model for the same write — two ways to do one thing, with
 *     only one of them explained.
 *
 * ── THE TRIGGER RENDERS ONLY WHEN THERE IS SOMETHING IN THE SHEET ─────────
 * Not "the menu is never empty" enforced by hoping every branch keeps one item —
 * the trigger is a function OF the item list, so an empty menu is
 * unrepresentable rather than merely avoided. That matters here more than
 * anywhere: a cancelled record with an attendee row that has no email has NO
 * items, and every earlier version of this reasoning ended with a "•••" that
 * opened onto nothing.
 *
 * An empty-content menu has been found by a control in rounds 1, 2 and 4 — three
 * times, never by review — which is why this is structural.
 */
function AttendeeRowMenu({ index, attendee, onEditRow, open, onToggle }) {
  const items = [
    onEditRow ? { key: 'edit', icon: Pencil, label: 'แก้ไขรายชื่อ', onClick: onEditRow } : null,
    attendee.email
      ? { key: 'copy', icon: Copy, label: 'คัดลอกอีเมล', onClick: () => copyText(attendee.email) }
      : null,
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <OverflowMenu
      compact
      open={open}
      onToggle={onToggle}
      triggerLabel={`การดำเนินการสำหรับผู้เข้าอบรมท่านที่ ${index + 1}`}
      closeLabel="ปิดเมนู"
    >
      {items.map((item) => (
        <OverflowItem key={item.key} icon={item.icon} onClick={item.onClick}>
          {item.label}
        </OverflowItem>
      ))}
    </OverflowMenu>
  );
}

/**
 * Copy one value, silently.
 *
 * The in-house screen's `CopyButton` shows a visible success/failure state and
 * argues at length for why an optimistic one would be a lie. THIS one cannot:
 * it lives inside a menu that closes on click, so there is no element left to
 * flash. What it does instead is not pretend — no success toast, no state change
 * — so nothing on screen asserts a copy that may not have happened, and the
 * value stays on screen and selectable, which is the same fallback.
 */
function copyText(value) {
  try {
    navigator.clipboard?.writeText?.(value);
  } catch { /* the value is on screen and selectable */ }
}

// ── Shared atoms ───────────────────────────────────────────────────

// `selectCls` and `EditField` MOVED to detailShell.jsx when the in-house screen
// gained edit forms — see the note there. They are imported at the top of this
// file; a second copy here is exactly the drift that move removed.

// ── Round edit form ───────────────────────────────────────────────

/**
 * A round's status, as a suffix the option label carries.
 *
 * `normalizeScheduleStatus` is the SAME classifier the public carousel uses, so
 * a round the admin sees badged เต็ม is the one the wizard refuses to book. A
 * second status vocabulary here is the defect the schedule-status unification
 * removed from five surfaces.
 *
 * FULL ROUNDS ARE OFFERED AND MARKED, not hidden: the admin case is CORRECTION
 * rather than booking — moving someone onto a sold-out round is a legitimate
 * thing to do when they were already promised a seat — but the admin must be
 * told, because it is not a thing to do by accident.
 */
function roundStatusSuffix(round) {
  const status = normalizeScheduleStatus(round?.status);
  if (status === 'full') return ' — เต็ม';
  if (status === 'nearly_full') return ' — ใกล้เต็ม';
  return '';
}

/**
 * EXPORTED for the render tier only — the form is behind `editSection`, which a
 * click sets and `renderToStaticMarkup` cannot reach. Same reason as
 * `InvoiceEditForm`.
 */
export function RoundEditForm({ rounds, storedOption, classId, attendanceMode, onChange }) {
  const selected = rounds.find((r) => String(r._id) === String(classId)) ?? null;
  const hybrid = isHybridRound(selected);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
          รอบอบรม<span className="ml-0.5 text-9e-accent">*</span>
        </label>
        <select
          value={classId}
          onChange={(e) => {
            /**
             * ── CHANGING THE ROUND ALWAYS CLEARS THE MODE ───────────────────
             * Unconditionally, whichever type the new round is, and the two
             * reasons are different:
             *
             *   · a HYBRID round must not inherit the previous round's answer —
             *     the admin has to look, because the server refuses an
             *     unanswered hybrid rather than guessing;
             *   · a NON-HYBRID round needs no answer at all, and the client must
             *     not supply `classroom` itself. That is the SERVER's
             *     derivation. Sending it would be the client asserting one of
             *     the four coupled fields, which is exactly what the payload
             *     shape exists to prevent.
             *
             * So there is no branch here. A first draft wrote
             * `isHybridRound(next) ? '' : ''` — a ternary whose arms were
             * identical, which is the tell that the condition was never doing
             * any work.
             */
            onChange({ classId: e.target.value, attendanceMode: '' });
          }}
          className={selectCls()}
        >
          {/*
            ── THE STORED ROUND THAT IS NO LONGER OFFERED ────────────────────
            Rendered as the selected option and DISABLED. Never silently
            cleared: a select that opened with nothing chosen would invite an
            admin to pick a new round for a record that already has one, moving
            an attendee off a course they have already attended.

            DISABLED because there is no honest way to offer it — the schedule
            endpoint filters `>= today` unconditionally, so re-selecting it
            would send an id the server cannot verify and would be refused. A
            control that can be operated but never succeeds is worse than one
            that visibly cannot.
          */}
          {storedOption ? (
            <option value={storedOption.value} disabled>
              {storedOption.label} — ไม่เปิดรับแล้ว
            </option>
          ) : null}
          {rounds.map((r) => (
            <option key={r._id} value={r._id}>
              {formatClassDates(r.dates)}{roundStatusSuffix(r)}
            </option>
          ))}
        </select>
      </div>

      {/*
        THE MODE PICKER APPEARS ONLY FOR A HYBRID ROUND, and it starts with NO
        selection — the server rejects a hybrid round with no mode rather than
        defaulting one, and a pre-selected radio would be the screen answering
        on the admin's behalf.
      */}
      {hybrid ? (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            รูปแบบการอบรม<span className="ml-0.5 text-9e-accent">*</span>
          </label>
          <select
            value={attendanceMode}
            onChange={(e) => onChange({ classId, attendanceMode: e.target.value })}
            className={selectCls()}
          >
            <option value="">— เลือกรูปแบบ —</option>
            <option value="classroom">Classroom</option>
            <option value="teams">Online via Microsoft Teams</option>
          </select>
          {!attendanceMode ? (
            <p className="pt-[6px] text-[11px] leading-[16px] text-9e-accent">
              รอบนี้เป็นแบบ Hybrid ต้องเลือกรูปแบบการเข้าอบรม
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        WHAT THE SERVER WILL WRITE, said before the click rather than after.
        Moving someone between rounds changes the day they are expected — the
        one edit on this screen where a mis-click has a person turning up on the
        wrong date — so the consequence is stated where the decision is made.
      */}
      <p className="text-[11px] leading-[16px] text-[var(--text-muted)]">
        ระบบจะบันทึกวันที่และรูปแบบของรอบที่เลือกให้อัตโนมัติ
      </p>
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
        <DLRow label="ที่อยู่" value={formatBillingAddress(invoice)} />
      )}
      {invoice.country === 'OTHER' && invoice.internationalAddress && (
        <DLRow label="ที่อยู่"
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
        <DLRow label="สาเหตุที่ล้มเหลว"
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
