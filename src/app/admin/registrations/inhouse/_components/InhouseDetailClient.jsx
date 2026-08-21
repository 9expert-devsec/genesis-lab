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
  deleteInhouseRegistration,
} from '@/lib/actions/inhouse-registrations';
/**
 * THE SHARED FIELD WRITER. `updateRegistration(id, data, 'inhouse')` — the same
 * export the public screen calls, taking the source as its third argument.
 *
 * ── WHY THIS IMPORT DID NOT EXIST, AND WHAT THAT COST ──────────────────────
 * Round 2 gave `updateRegistration` a `source === 'inhouse'` branch with a
 * 26-name allowlist, and NO CLIENT WAS EVER POINTED AT IT. This screen's only
 * writes were the status action, the admin-notes action and delete, so 25 of
 * those 26 fields were rendered by the read view and editable by nothing. The
 * server was never the fault; the call site did not exist.
 *
 * `onlyDigits` comes with it for the same reason the public invoice form uses
 * it: this path runs NO zod (`runValidators: false`), so an unconstrained box
 * here is a way for an admin to store a tax id or branch code the customer-facing
 * form would have rejected.
 */
import { updateRegistration, addInternalNote } from '@/lib/actions/registrations';
import { onlyDigits } from '@/lib/registration/digitsOnly';
import { readNotes } from '@/lib/registrations/internalNotes';
import { formatBranchLabel } from '@/lib/registration/branchLabel';
import { refNo } from '@/lib/refNo';
import { detailHeading, inhouseHeadingIdentifier } from '@/lib/registrations/detailHeading';
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
  TabList, TabPanel, SectionCard, SystemCard, DL, DLRow, QuotedNote, DetailError,
  EditField, EditArea, EditSelect, InternalNotesBody, CopyAction,
} from '../../_components/detailShell';
import { personCopyText } from '@/lib/registrations/copyText';

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
/*
  ── IT CARRIES NO SIZE OF ITS OWN, AND THAT IS ROUND 11 ────────────────────
  It used to be `font-mono text-[11px]`. The 11px was a SECOND place a field
  value's size lived, and it survived round 11's rescale by ignoring it — an
  id at 11px in a card whose every other value is 16px. Dropping the class is
  not a size change written here, it is the removal of one: the `<dd>` sets the
  size once and the mono face is the only thing left that is this helper's.
*/
const mono = (value) => (value ? <span className="font-mono">{value}</span> : '');

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

/**
 * The three address skeletons the edit forms lazily create.
 *
 * `onsiteVenue` and `thaiAddress` are THE SAME SHAPE and are still two
 * constants, because they are two different things that happen to agree today:
 * the venue is where the training runs and the Thai address is where the
 * quotation is sent, and `formatThaiAddress` vs `formatBillingAddress` already
 * treat them as such (see the note on `onsiteVenueSummary`). One shared constant
 * would make a future divergence in either look like a bug in both.
 *
 * Written out in full rather than derived, so a key the action's allowlist
 * expects cannot go missing from the skeleton — the public invoice form's note
 * spells out what that costs: a lazily-created object missing a key produces a
 * save that succeeds and stores nothing.
 */
const EMPTY_VENUE     = { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' };
const EMPTY_THAI_ADDR = { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' };
const EMPTY_INTL_ADDR = { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' };

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

/**
 * ── THE EDITABLE GROUPS, AS FUNCTIONS OF THE DOCUMENT ──────────────────────
 *
 * One per editable card. Each returns the exact object its card submits, seeded
 * from `doc`, and they are the ONLY definition of what this screen can write.
 *
 * ── WHY THEY ARE MODULE-LEVEL AND EXPORTED ────────────────────────────────
 * Two jobs that were previously done by two hand-kept copies of the same list:
 *
 *   · `useState` seeds from them and `cancelEdit` re-seeds from them, so
 *     "cancel restores what the server holds" is the same code as "this is what
 *     the card started with" rather than a second list that has to agree;
 *   · test/fs/inhouseFieldEditable calls them with a probe document and compares
 *     `Object.keys` against the allowlist PARSED OUT OF updateRegistration's
 *     source. That comparison is only worth running because neither side is
 *     re-typed in the test — a field added to a card here, or removed from the
 *     allowlist there, moves one side and not the other and the test says so.
 *
 * A field that this form submits and the allowlist does not name is dropped in
 * SILENCE: `updateRegistration` returns `{ok:true}`, the card closes, the value
 * is unchanged after a refresh, and nothing anywhere reports it. That is the
 * failure this pair of exports exists to make impossible to ship.
 *
 * The DEFAULTS in each are the schema's, not invented: `participantsCount` 15
 * and `contentMode` 'standard' come from publicRegistrationDefaults' in-house
 * twin, `quotationCountry` 'TH' and `branchType` 'head_office' from the zod
 * enums' own `.default(...)`. `trainingFormat` deliberately has NONE — it has no
 * schema default either, and inventing one here is how the select would write a
 * format nobody chose.
 */
export const editableContact = (doc) => ({
  contactFirstName:  doc.contactFirstName  ?? '',
  contactLastName:   doc.contactLastName   ?? '',
  contactRole:       doc.contactRole       ?? '',
  contactDepartment: doc.contactDepartment ?? '',
  contactEmail:      doc.contactEmail      ?? '',
  contactPhone:      doc.contactPhone      ?? '',
  contactLine:       doc.contactLine       ?? '',
});

export const editableRequirement = (doc) => ({
  participantsCount: doc.participantsCount ?? 15,
  contentMode:       doc.contentMode       ?? 'standard',
  contentDetails:    doc.contentDetails    ?? '',
});

export const editableSchedule = (doc) => ({
  preferredMonth: doc.preferredMonth ?? '',
  scheduleNote:   doc.scheduleNote   ?? '',
  trainingFormat: doc.trainingFormat ?? '',
  onlineRegion:   doc.onlineRegion   ?? '',
  onlineTimezone: doc.onlineTimezone ?? '',
  onsiteVenue:    doc.onsiteVenue ? { ...doc.onsiteVenue } : { ...EMPTY_VENUE },
});

export const editableQuotation = (doc) => ({
  quotationCountry: doc.quotationCountry ?? 'TH',
  quotationCompany: doc.quotationCompany ?? '',
  taxId:            doc.taxId            ?? '',
  branchType:       doc.branchType       ?? 'head_office',
  branchCode:       doc.branchCode       ?? '',
  thaiAddress:          doc.thaiAddress          ? { ...doc.thaiAddress }          : null,
  internationalAddress: doc.internationalAddress ? { ...doc.internationalAddress } : null,
});

/**
 * Every group, keyed by the section name the card passes to `editProps`.
 *
 * `message` is a single-field card and is here anyway, so the set this screen
 * can write through `updateRegistration` is ONE object rather than four objects
 * plus a thing a reader has to remember.
 *
 * ── `notes` IS DELIBERATELY ABSENT, AND ITS ABSENCE IS LOAD-BEARING ───────
 * `adminNotes` was in this map when it was a single editable String. It is now
 * an APPEND-ONLY ARRAY written exclusively by `addInternalNote` with `$push`,
 * and it has been removed from `updateRegistration`'s allowlist as well. Both
 * halves matter: a group here would submit the whole array through a `$set` and
 * silently overwrite every existing note — the exact failure the append-only
 * design exists to prevent, arriving through the edit form instead of a menu.
 *
 * test/fs/inhouseFieldEditable compares this map against the allowlist in both
 * directions, so re-adding it here without re-adding it there fails loudly
 * rather than dropping the write in silence.
 */
export const INHOUSE_EDITABLE_GROUPS = {
  contact:     editableContact,
  requirement: editableRequirement,
  schedule:    editableSchedule,
  quotation:   editableQuotation,
  message:     (doc) => ({ message: doc.message ?? '' }),
};

/**
 * The schedule card's payload — the state, minus the fields that state can
 * legally hold and the DOCUMENT must not.
 *
 * ── ONE OMISSION, AND IT IS NOT TIDINESS ────────────────────────────────────
 * `trainingFormat: ''` is a real state of the control (the "— ยังไม่ระบุ —"
 * option, which exists because a legacy document can hold `flexible` and the
 * field has no schema default). It is NOT a value the document may take:
 * `updateRegistration` copies whatever it is handed with `runValidators: false`,
 * so an empty string would be written straight over a stored `onsite` and the
 * รูปแบบ row would go blank on a request that had a format a moment ago.
 *
 * Dropping the KEY is what makes the allowlist's `data[f] !== undefined` test
 * leave the stored value alone. Sending `undefined` would work identically; the
 * key is omitted instead so this function's output can be compared against the
 * allowlist by a test without a special case for "present but undefined".
 *
 * Kept module-level and pure so that test can call it directly rather than
 * reaching through a render.
 */
export function schedulePayload(schedule) {
  const { trainingFormat, ...rest } = schedule;
  return trainingFormat ? { ...rest, trainingFormat } : rest;
}

/*
 * `scheduleStripValue` IS DELETED WITH THE STRIP. It was the same window as
 * `scheduleSummary` above, without the `เดือน:` prefix, because the strip cell
 * carried a label of its own and the card row does not. Its only caller was the
 * strip, so it goes with it rather than surviving as a second formatter of one
 * value with nothing reading it.
 */

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

  /**
   * INTERNAL NOTES — the SAME mechanism the public screen runs, and the same
   * state shape: the list plus a draft, with no editable copy of any entry.
   *
   * `readNotes` is what makes this deploy independent of the migration: it
   * tolerates the legacy `adminNotes` STRING as well as the array. Measured,
   * read-only — the field is absent on all 8 in-house documents, so the String
   * branch will not fire in production; it exists so a rollback strands nothing.
   */
  const [internalNotes, setInternalNotes] = useState(
    () => readNotes(doc.adminNotes, { legacyCreatedAt: doc.updatedAt ?? null }),
  );
  const [noteDraft,     setNoteDraft]     = useState('');

  /**
   * ── THE FOUR EDITABLE GROUPS, MIRRORING THE FOUR CARDS ────────────────────
   *
   * Each holds ONLY names the allowlist in `updateRegistration` accepts. That is
   * not a coincidence to be maintained by care — test/fs/inhouseFieldEditable
   * asserts the two sets against each other in BOTH directions, because a field
   * this form submits that the allowlist does not name is dropped in silence:
   * the action returns `ok`, the card closes, and the old value is still there
   * after a refresh. Nothing on screen says otherwise.
   *
   * ── THE ONE NAME THAT LOOKS MISSING AND IS DELIBERATE ─────────────────────
   * `companyName` is NOT here, and the บริษัท control below writes
   * `quotationCompany` instead. `companyName` is a legacy-compat MIRROR written
   * by one line in the API route; the allowlist omits it on purpose. Binding the
   * control to the DISPLAYED value would have bound it to `companyName` on
   * exactly the legacy documents where the two diverge — and those are the only
   * documents where it matters — so the edit would have been dropped precisely
   * where it was needed. See `companyDiverges` below.
   */
  const [contact,     setContact]     = useState(() => editableContact(doc));
  const [requirement, setRequirement] = useState(() => editableRequirement(doc));
  const [schedule,    setSchedule]    = useState(() => editableSchedule(doc));
  const [quotation,   setQuotation]   = useState(() => editableQuotation(doc));
  const [message,     setMessage]     = useState(doc.message ?? '');

  // 'contact' | 'requirement' | 'schedule' | 'quotation' | 'message' | 'notes' | null
  const [editSection, setEditSection] = useState(null);
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

  /**
   * ADD ONE NOTE — `addInternalNote`, the SHARED action, with the in-house
   * source. It replaces `updateInhouseAdminNotes`, which was a `$set` of one
   * String and is deleted; see the note where it used to live.
   *
   * Identical to the public screen's handler apart from the source argument,
   * which is what "one notes mechanism, not two" means in practice.
   */
  const handleAddNote = () => {
    const body = noteDraft.trim();
    if (!body) return;
    setBusy('add-note'); setError(null);
    startTransition(async () => {
      const res = await addInternalNote(doc._id, body, 'inhouse');
      if (res.ok) {
        // THE SERVER'S OWN ENTRY, through the SAME reader the initial load uses
        // — not a local echo. See the public client's `handleAddNote` for the
        // full reasoning: the echo's empty author was never replaced, because a
        // `useState` initialiser does not re-run when `doc` is revalidated.
        setInternalNotes((prev) => [...prev, ...readNotes([res.note ?? { body }])]);
        setNoteDraft('');
      } else {
        setError(res.error || 'บันทึกไม่สำเร็จ');
      }
      setBusy(null);
    });
  };

  /**
   * THE FIELD SAVE — the same helper the public client has, with the source
   * argument that makes `updateRegistration` take its in-house branch.
   *
   * `'inhouse'` is written HERE and nowhere else in the file. It is the one
   * place this screen has to name its own collection, and passing it per call
   * site would be six chances to pass 'public' by accident — which would not
   * throw, would not warn, and would send these fields through the PUBLIC
   * allowlist, where almost none of them are named. Every one would be dropped
   * and the save would report success.
   */
  const save = (payload, busyKey) => {
    setBusy(busyKey); setError(null);
    startTransition(async () => {
      const res = await updateRegistration(doc._id, payload, 'inhouse');
      if (res.ok) setEditSection(null);
      else setError(res.error || 'บันทึกไม่สำเร็จ');
      setBusy(null);
    });
  };

  /**
   * ── CANCEL RESTORES FROM `doc`, PER SECTION ────────────────────────────────
   *
   * It takes the section now. It previously took nothing and reset `adminNotes`
   * unconditionally, which was correct while notes were the only editable thing
   * and becomes wrong the moment a second card can open: cancelling the
   * quotation card would have silently reverted an unsaved note in a card the
   * reader was not looking at.
   *
   * Every branch reads `doc`, never the live state, so cancel means "back to
   * what the server holds" rather than "back to whatever it was when this card
   * opened". The two differ after a successful save of a neighbouring card, and
   * only the first is what the word means.
   */
  const cancelEdit = (section) => {
    setEditSection(null);
    // NO `notes` BRANCH. Internal notes are append-only — there is no draft of
    // an existing entry to restore, and the composer's own draft is deliberately
    // NOT cleared by a cancel on some other card.
    if (section === 'message')     setMessage(doc.message ?? '');
    if (section === 'contact')     setContact(editableContact(doc));
    if (section === 'requirement') setRequirement(editableRequirement(doc));
    if (section === 'schedule')    setSchedule(editableSchedule(doc));
    if (section === 'quotation')   setQuotation(editableQuotation(doc));
  };

  /**
   * One venue field, without clobbering the rest of the subdocument.
   *
   * The skeleton is created lazily HERE rather than on mount, so a request that
   * has never had a venue does not gain an all-empty `onsiteVenue` object simply
   * by the admin opening the card and closing it again.
   */
  const setVenueField = (field, val) =>
    setSchedule((s) => ({ ...s, onsiteVenue: { ...(s.onsiteVenue ?? EMPTY_VENUE), [field]: val } }));

  const setAddrField = (key, empty) => (field, val) =>
    setQuotation((q) => ({ ...q, [key]: { ...(q[key] ?? empty), [field]: val } }));
  const setThaiAddr = setAddrField('thaiAddress', EMPTY_THAI_ADDR);
  const setIntlAddr = setAddrField('internationalAddress', EMPTY_INTL_ADDR);

  // ALL THREE READ THE LIVE STATE, not `doc` — see the note on `contactName`.
  // `{ ...doc, ...schedule }` keeps the LEGACY fallback paths reachable: the
  // formatters read `preferredDateFrom` / `onsiteAddress` / `branch`, none of
  // which is editable and all of which only exist on `doc`.
  const address = quotationAddress({ ...doc, ...quotation });
  const venue = onsiteVenueSummary({ ...doc, ...schedule });
  const countryLabel = quotation.quotationCountry === 'OTHER' ? 'ต่างประเทศ' : 'ไทย';

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
  // `contactCompany` reads `doc` and NOT state, because `companyName` is not
  // editable — it is the legacy mirror the allowlist deliberately omits. The
  // quotation name reads STATE, so an edit to it can flip `companyDiverges`
  // live: correcting a legacy quotation company to match the contact company
  // makes the two rows collapse into one, which is the point of the divergence
  // check rather than a side effect of it.
  const contactCompany   = (doc.companyName ?? '').trim();
  const quotationCompany = (quotation.quotationCompany ?? '').trim();
  const companyDiverges  = Boolean(contactCompany && quotationCompany && contactCompany !== quotationCompany);
  const displayCompany   = companyDiverges ? contactCompany : (quotationCompany || contactCompany);
  /**
   * THE PARTY THE QUOTATION IS ADDRESSED TO — the quotation card's subject.
   *
   * `displayCompany` above is the CONTACT card's answer and prefers the contact
   * company when the two diverge. This one is its opposite number and always
   * prefers the QUOTATION company; the two are deliberately different functions
   * of the same pair, because the two cards are answering different questions.
   *
   * The fallback fires only on a pre-split enquiry that never had
   * `quotationCompany` written, where the contact company is what a quotation
   * would have been addressed to. `DLRow` drops the row entirely if both are
   * empty, and `CopyAction` drops the control with it.
   */
  const quotationCompanyDisplay = quotationCompany || contactCompany;

  const isThaiQuotation = quotation.quotationCountry !== 'OTHER';

  /**
   * Switching country swaps WHICH address subdocument exists, and nulls the
   * other.
   *
   * The same shape as the public invoice form's handler, and the null matters
   * as much as the skeleton: leaving a stale `thaiAddress` on a quotation that
   * has become foreign means `formatBillingAddress` has two addresses to choose
   * between, and the one it shows is decided by its own precedence rather than
   * by anything the admin did.
   */
  const handleCountryChange = (next) => setQuotation((q) => ({
    ...q,
    quotationCountry: next,
    thaiAddress:          next === 'TH'    ? (q.thaiAddress          ?? { ...EMPTY_THAI_ADDR }) : null,
    internationalAddress: next === 'OTHER' ? (q.internationalAddress ?? { ...EMPTY_INTL_ADDR }) : null,
    // A foreign quotation carries no Thai branch. Clearing the code here keeps
    // it from surviving invisibly behind a hidden control, exactly as the
    // branchType handler does.
    branchCode: next === 'OTHER' ? '' : q.branchCode,
  }));

  // A foreign quotation has no Thai branch concept at all, so the row is
  // suppressed rather than defaulted to สำนักงานใหญ่.
  const branchLabel = !isThaiQuotation
    ? ''
    : formatBranchLabel({ branchType: quotation.branchType, branchCode: quotation.branchCode, legacyBranch: doc.branch });

  // READ FROM STATE, not from `doc`. Both this and the rows below it are what a
  // successful save leaves on screen: the action revalidates the path, but the
  // client keeps rendering until that lands, and a name that reverts for a beat
  // after a save reads as the save having failed.
  const contactName = `${contact.contactFirstName ?? ''} ${contact.contactLastName ?? ''}`.trim();

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

  /*
   * ── THE FOUR DARK-STRIP CELLS ARE GONE ────────────────────────────────────
   *
   * Every one of them was a second rendering of a row that is still on the page,
   * checked before the delete rather than assumed:
   *   · หลักสูตรที่สนใจ → the Training Requirement card's own row, which shows
   *     ALL the courses rather than the first plus "และอีก N"
   *   · รูปแบบการอบรม + the headcount → that card's จำนวนผู้เข้าอบรม row and the
   *     schedule card's รูปแบบ row
   *   · ช่วงเวลาที่ต้องการ + หมายเหตุเวลา → the schedule card's two rows
   *   · ผู้ติดต่อ + phone/email → the contact card's three rows
   *
   * ── "ประมาณ 15 คน" IS STILL NOT BUILT, AND THE REASON OUTLIVES THE STRIP ──
   * The design hedges the headcount. `participantsCount` IS A STORED NUMBER AND
   * NOTHING FLAGS IT AS AN ESTIMATE — the Mongoose schema gives it a minimum of
   * 15 and no `isEstimate`, no `min`/`max` pair. "ประมาณ" would be the screen
   * asserting an imprecision the record does not record, which is the same rule
   * the list table keeps for its format and status chips.
   *
   * That argument was previously written as "a summary strip MAY hedge where a
   * data table may not, and it still does not". THE FIRST HALF IS NOW MOOT —
   * there is no summary strip — and the second half is what was load-bearing all
   * along. The surviving row is the Training Requirement card's, which reads
   * `15 ท่าน`, phrased exactly as the list's จำนวน column phrases it.
   */
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

      {/*
        THE HEADING NAMES THE COMPANY — see lib/registrations/detailHeading for
        why the company rather than the contact, and for the empty rule: a
        request with no company recorded renders the label ALONE, never a
        trailing colon.

        THE SUBTITLE IS THE CONTACT NOW. It was the company, which has moved UP
        into the heading; leaving it here as well would have printed the same
        string twice, one line apart. The contact is the natural occupant — it is
        the other half of "who is this request from" — and it degrades the same
        way every optional line on this screen does: `DetailHeader` drops the
        whole 25px block when there is nothing for it, rather than rendering an
        empty paragraph.
      */}
      <DetailHeader
        badge={<TypeBadge label="In-house" className="bg-violet-100 text-violet-700" />}
        timestamp={`ส่งคำขอเมื่อ ${fmtDate(doc.createdAt)}`}
        title={detailHeading(inhouseHeadingIdentifier(doc))}
        subtitle={contactName}
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

      <DetailError message={error} />

      <TabList tabs={tabs} active={tab} onSelect={setTab} idFor={idFor} />

      {/* ── ข้อมูลการสมัคร ── */}
      <TabPanel id={idFor('request', 'panel')} labelledBy={idFor('request', 'tab')} hidden={tab !== 'request'}>
        <div className="space-y-[16px]">

          <SectionCard
            icon={Building2}
            title="ผู้ประสานงาน & บริษัท"
            {...editProps('contact')}
            onSave={() => save(contact, 'save-contact')}
          >
            {editSection === 'contact' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {/*
                  NO บริษัท CONTROL HERE — it is in the quotation card, bound to
                  `quotationCompany`, and that placement is the whole point.

                  This card DISPLAYS `displayCompany`, which resolves to
                  `companyName` on a legacy document where the two diverge.
                  `companyName` is not in the allowlist (it is a derived mirror),
                  so a box here bound to what this card shows would be dropped
                  silently on exactly the documents where the divergence is real
                  — the only ones where editing it means anything.
                */}
                <EditField label="ชื่อ" required value={contact.contactFirstName}
                  onChange={(v) => setContact((c) => ({ ...c, contactFirstName: v }))} />
                <EditField label="นามสกุล" required value={contact.contactLastName}
                  onChange={(v) => setContact((c) => ({ ...c, contactLastName: v }))} />
                <EditField label="ตำแหน่ง" value={contact.contactRole}
                  onChange={(v) => setContact((c) => ({ ...c, contactRole: v }))} />
                <EditField label="แผนก" value={contact.contactDepartment}
                  onChange={(v) => setContact((c) => ({ ...c, contactDepartment: v }))} />
                <EditField label="อีเมล" type="email" required value={contact.contactEmail}
                  onChange={(v) => setContact((c) => ({ ...c, contactEmail: v }))} />
                <EditField label="เบอร์โทร" type="tel" value={contact.contactPhone}
                  onChange={(v) => setContact((c) => ({ ...c, contactPhone: v }))} />
                <EditField label="LINE ID" value={contact.contactLine}
                  onChange={(v) => setContact((c) => ({ ...c, contactLine: v }))} />
              </div>
            ) : (
              <DL>
                {/*
                  `CopyAction` OWNS THE EMPTY TEST NOW. Every one of these used
                  to be `action={x ? <CopyButton …/> : null}` — the same guard
                  written out per row, which is precisely how `DLRow`'s dashes
                  accumulated before the check moved into the component. One
                  copy of the rule; a caller cannot forget it.
                */}
                <DLRow
                  label={companyDiverges ? 'บริษัท / องค์กร (ที่ติดต่อ)' : 'บริษัท / องค์กร'}
                  value={displayCompany}
                  action={<CopyAction text={displayCompany} label={companyDiverges ? 'ชื่อบริษัทที่ติดต่อ' : 'ชื่อบริษัท'} />}
                />
                {/* THE PERSON'S NAME — round 8. `personCopyText` rather than
                    `contactName`, so the three name shapes on these two screens
                    copy identically. */}
                <DLRow label="ชื่อ-นามสกุล" value={contactName}
                  action={<CopyAction text={personCopyText({ firstName: contact.contactFirstName, lastName: contact.contactLastName })} label="ชื่อผู้ติดต่อ" />} />
                <DLRow label="ตำแหน่ง / แผนก" value={[contact.contactRole, contact.contactDepartment].filter(Boolean).join(' · ')} />
                {/*
                  ══ PLAIN TEXT AND A COPY CONTROL — NOT mailto: / tel: ════════

                  Both rows were anchors. Round 13 removes every one of them on
                  both detail screens, and the copy control is what replaces the
                  affordance rather than merely what is left behind.

                  ── WHAT A LINK ACTUALLY DID HERE ────────────────────────────
                  `mailto:` hands off to whatever the operating system has
                  registered, which on an office machine is frequently nothing,
                  or Outlook when the admin works in a webmail tab. `tel:` on a
                  desktop is worse — it either does nothing or opens an
                  application nobody asked for. What a salesperson does with
                  these values is PASTE THEM somewhere else, which is the thing
                  the row could not do and now can.

                  ── AND THE VALUE STOPS BEING A NODE ────────────────────────
                  It is a plain string now, so `DLRow`'s absent-means-absent rule
                  applies to it DIRECTLY rather than through `isEmptyValue`
                  recursing into an element. Round 5's wrapped-but-empty defeat
                  came from exactly that indirection.

                  ── A DARK-MODE FAILURE GOES WITH IT ────────────────────────
                  Round 12 measured `text-9e-action` on `--surface` at 2.92:1 in
                  dark against a 4.5 bar, with no `dark:` counterpart. These two
                  anchors were two of the five pairs on that list. They are not
                  fixed here — they are GONE, which removes them from it.
                */}
                <DLRow label="อีเมล" value={contact.contactEmail}
                  action={<CopyAction text={contact.contactEmail} label="อีเมลผู้ติดต่อ" />} />
                <DLRow label="เบอร์โทร" value={contact.contactPhone}
                  action={<CopyAction text={contact.contactPhone} label="เบอร์โทรผู้ติดต่อ" />} />
                <DLRow label="LINE ID" value={contact.contactLine} />
              </DL>
            )}
          </SectionCard>

          <SectionCard
            icon={GraduationCap}
            title="Training Requirement"
            {...editProps('requirement')}
            onSave={() => save(requirement, 'save-requirement')}
          >
            {editSection === 'requirement' ? (
              <div className="space-y-3">
                {/*
                  หลักสูตรที่สนใจ IS NOT EDITABLE HERE, and `coursesInterested`
                  is deliberately absent from `requirement` above.

                  It is an ARRAY OF UPSTREAM COURSE CODES, and the only honest
                  control for it is a picker backed by the same course list
                  page.jsx resolves names from. A free-text box would let an
                  admin type a code that resolves to nothing, and the read view
                  would then show the raw code with no name — indistinguishable
                  from the upstream-is-down case the `name || code` fallback
                  already covers, so the screen could not tell the reader which
                  had happened. The field stays in the allowlist and stays
                  writable by anything that can send a valid array; this form
                  simply does not offer one. Reported as open.
                */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditField
                    label="จำนวนผู้เข้าอบรม (ท่าน)"
                    type="number"
                    value={String(requirement.participantsCount ?? '')}
                    onChange={(v) => setRequirement((r) => ({
                      ...r,
                      // The stored field is a NUMBER and the input yields a
                      // string. `updateRegistration`'s in-house branch copies
                      // the value through untouched with `runValidators:false`,
                      // so a string here would be written as a string and every
                      // later `participantsCount == null ? … : …` test would
                      // still pass while the type quietly changed under it.
                      participantsCount: v === '' ? '' : Number(v),
                    }))}
                  />
                  <EditSelect
                    label="เนื้อหา"
                    value={requirement.contentMode}
                    onChange={(v) => setRequirement((r) => ({ ...r, contentMode: v }))}
                  >
                    {/*
                      TWO OPTIONS, matching the zod enum — `consult` is a LEGACY
                      value the read view still labels but the form must not
                      offer, exactly as CONTENT_MODE_LABEL's own note says. An
                      option here would let an admin write a value the customer
                      form can no longer produce.
                    */}
                    <option value="standard">Outline มาตรฐาน</option>
                    <option value="custom">ปรับเนื้อหา</option>
                  </EditSelect>
                </div>
                <EditArea
                  label="รายละเอียดเนื้อหา"
                  value={requirement.contentDetails}
                  onChange={(v) => setRequirement((r) => ({ ...r, contentDetails: v }))}
                  rows={4}
                />
              </div>
            ) : (
              <DL>
                {/*
                  NAME over CODE, the same two-line shape the in-house LIST column
                  uses. Resolved server-side and handed in as `courses`; a miss
                  keeps the code as the primary line rather than blanking — see the
                  page's docstring.

                  The empty hint stays: an enquiry naming NO course is a data fault
                  a salesperson has to see, not a row to hide.
                */}
                <DLRow label="หลักสูตรที่สนใจ" emptyHint="ไม่ได้ระบุหลักสูตร"
                  value={courses.length > 0 ? <CourseList courses={courses} /> : ''} />
                <DLRow label="จำนวนผู้เข้าอบรม" value={requirement.participantsCount === '' || requirement.participantsCount == null ? '' : `${requirement.participantsCount} ท่าน`} />
                <DLRow label="เนื้อหา" value={CONTENT_MODE_LABEL[requirement.contentMode] ?? requirement.contentMode} />
                <DLRow label="รายละเอียดเนื้อหา" value={requirement.contentDetails} />
              </DL>
            )}
          </SectionCard>

          <SectionCard
            icon={CalendarClock}
            title="ตารางเวลา & รูปแบบการอบรม"
            {...editProps('schedule')}
            onSave={() => save(schedulePayload(schedule), 'save-schedule')}
          >
            {editSection === 'schedule' ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {/*
                    `type="month"` yields exactly the `YYYY-MM` the field stores
                    — the same VALUE the customer form's <select> produced, not
                    the Thai label beside it. `monthLongLabel` renders it back.
                    A free-text box here is how the row came to read
                    "เดือน: 2026-09" in the first place, one layer up.
                  */}
                  <EditField label="เดือนที่ต้องการ" type="month" value={schedule.preferredMonth}
                    onChange={(v) => setSchedule((s) => ({ ...s, preferredMonth: v }))} />
                  <EditSelect label="รูปแบบ" required value={schedule.trainingFormat}
                    onChange={(v) => setSchedule((s) => ({ ...s, trainingFormat: v }))}>
                    {/*
                      An EMPTY option, because `trainingFormat` has NO schema
                      default and a legacy document can hold `flexible`, which
                      the zod enum no longer accepts. Without a blank the select
                      would silently show 'onsite' for a document holding
                      neither, and saving the card would write a format nobody
                      chose. The empty value is filtered out of the payload —
                      see `schedulePayload`.
                    */}
                    <option value="">— ยังไม่ระบุ —</option>
                    <option value="onsite">Onsite</option>
                    <option value="online">Online</option>
                  </EditSelect>
                </div>
                <EditField label="หมายเหตุเวลา" value={schedule.scheduleNote}
                  onChange={(v) => setSchedule((s) => ({ ...s, scheduleNote: v }))} />

                {schedule.trainingFormat === 'online' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <EditField label="พื้นที่ผู้เข้าอบรม" value={schedule.onlineRegion}
                      onChange={(v) => setSchedule((s) => ({ ...s, onlineRegion: v }))} />
                    <EditField label="ข้อจำกัดด้านเวลา" value={schedule.onlineTimezone}
                      onChange={(v) => setSchedule((s) => ({ ...s, onlineTimezone: v }))} />
                  </div>
                )}

                {schedule.trainingFormat === 'onsite' && (
                  <div className="space-y-3 rounded-9e-md border border-[var(--surface-border)] p-4">
                    <p className="text-xs font-semibold text-[var(--text-secondary)]">สถานที่จัดอบรม</p>
                    <EditField label="ที่อยู่" value={schedule.onsiteVenue?.addressLine ?? ''}
                      onChange={(v) => setVenueField('addressLine', v)} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <EditField label="รหัสไปรษณีย์" value={schedule.onsiteVenue?.postalCode ?? ''}
                        onChange={(v) => setVenueField('postalCode', v)} />
                      <EditField label="แขวง / ตำบล" value={schedule.onsiteVenue?.subDistrict ?? ''}
                        onChange={(v) => setVenueField('subDistrict', v)} />
                      <EditField label="เขต / อำเภอ" value={schedule.onsiteVenue?.district ?? ''}
                        onChange={(v) => setVenueField('district', v)} />
                      <EditField label="จังหวัด" value={schedule.onsiteVenue?.province ?? ''}
                        onChange={(v) => setVenueField('province', v)} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <DL>
                <DLRow label="ช่วงเวลา" value={scheduleSummary({ ...doc, ...schedule })} />
                <DLRow label="หมายเหตุเวลา" value={schedule.scheduleNote} />
                <DLRow label="รูปแบบ" value={TRAINING_FORMAT_LABEL[schedule.trainingFormat] ?? schedule.trainingFormat} />
                {schedule.trainingFormat === 'online' && (
                  <>
                    <DLRow label="พื้นที่ผู้เข้าอบรม" value={schedule.onlineRegion} />
                    <DLRow label="ข้อจำกัดด้านเวลา" value={schedule.onlineTimezone} />
                  </>
                )}
                {/*
                  THE VENUE KEEPS ITS EMPTY STATE, deliberately, against the
                  general "absent means absent" rule: an ONSITE enquiry with no
                  venue is not a blank field, it is the next phone call. Hiding the
                  row would hide the job.
                */}
                {schedule.trainingFormat === 'onsite' && (
                  <DLRow label="สถานที่จัดอบรม" value={venue} emptyHint="ยังไม่ได้ระบุ — ต้องสอบถามลูกค้า"
                    action={<CopyAction text={venue} label="สถานที่จัดอบรม" />} />
                )}
              </DL>
            )}
          </SectionCard>

          {/*
            ── ROUND 11: THE SAME NAME AS THE PUBLIC CARD, DELIBERATELY ───────
            Both cards hold the party a quotation is addressed to — country,
            company, tax id, branch, address — and nothing else. Two names for one
            thing told a reader moving between the screens that they were looking
            at different cards.

            The public one was การเงินและเอกสาร, which named a DEPARTMENT; this one
            was ข้อมูลใบเสนอราคา, which reads as "the quotation's data" and invites
            the เลขที่ใบเสนอราคา row that is ruled out on both screens.
            ข้อมูลสำหรับออกใบเสนอราคา names what it is: what you need IN ORDER TO
            ISSUE one.
          */}
          <SectionCard
            icon={Receipt}
            title="ข้อมูลสำหรับออกใบเสนอราคา"
            {...editProps('quotation')}
            onSave={() => save(quotation, 'save-quotation')}
          >
            {editSection === 'quotation' ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditSelect label="ประเทศ" value={quotation.quotationCountry} onChange={handleCountryChange}>
                    <option value="TH">ไทย / Thailand</option>
                    <option value="OTHER">ต่างประเทศ / Other</option>
                  </EditSelect>
                  {/*
                    THE COMPANY LIVES HERE, not on the contact card — it is
                    `quotationCompany`, which is the name that goes on the
                    quotation and the one the allowlist actually accepts.
                  */}
                  <EditField label="ชื่อบริษัท (ใบเสนอราคา)" value={quotation.quotationCompany}
                    onChange={(v) => setQuotation((q) => ({ ...q, quotationCompany: v }))} />
                </div>

                <EditField
                  label={isThaiQuotation ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID / VAT ID'}
                  value={quotation.taxId}
                  // DIGITS-ONLY ON THE THAI PATH, exactly as the public invoice
                  // form does it and for the same measured reason: this path runs
                  // no zod, so an unconstrained box is a way to store a tax id
                  // the customer form would have rejected.
                  onChange={(v) => setQuotation((q) => ({ ...q, taxId: isThaiQuotation ? onlyDigits(v, 13) : v }))}
                />

                {/* A FOREIGN quotation has no Thai branch concept — the read
                    view already suppresses the row, and the controls follow it
                    rather than offering a สาขาย่อย on a company in Singapore. */}
                {isThaiQuotation && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <EditSelect
                      label="สาขา"
                      value={quotation.branchType}
                      onChange={(next) => setQuotation((q) => ({
                        ...q,
                        branchType: next,
                        // Clear the code on the way back to head office: its
                        // input is hidden in that state, so a leftover value
                        // would be unreachable AND still saved.
                        branchCode: next === 'branch' ? (q.branchCode ?? '') : '',
                      }))}
                    >
                      <option value="head_office">สำนักงานใหญ่</option>
                      <option value="branch">สาขาย่อย</option>
                    </EditSelect>
                    {quotation.branchType === 'branch' && (
                      <EditField label="เลขที่สาขา" required value={quotation.branchCode}
                        onChange={(v) => setQuotation((q) => ({ ...q, branchCode: onlyDigits(v, 5) }))} />
                    )}
                  </div>
                )}

                {isThaiQuotation ? (
                  <div className="space-y-3 rounded-9e-md border border-[var(--surface-border)] p-4">
                    <p className="text-xs font-semibold text-[var(--text-secondary)]">ที่อยู่ (ไทย)</p>
                    <EditField label="ที่อยู่" value={quotation.thaiAddress?.addressLine ?? ''}
                      onChange={(v) => setThaiAddr('addressLine', v)} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <EditField label="รหัสไปรษณีย์" value={quotation.thaiAddress?.postalCode ?? ''}
                        onChange={(v) => setThaiAddr('postalCode', v)} />
                      <EditField label="แขวง / ตำบล" value={quotation.thaiAddress?.subDistrict ?? ''}
                        onChange={(v) => setThaiAddr('subDistrict', v)} />
                      <EditField label="เขต / อำเภอ" value={quotation.thaiAddress?.district ?? ''}
                        onChange={(v) => setThaiAddr('district', v)} />
                      <EditField label="จังหวัด" value={quotation.thaiAddress?.province ?? ''}
                        onChange={(v) => setThaiAddr('province', v)} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-9e-md border border-[var(--surface-border)] p-4">
                    <p className="text-xs font-semibold text-[var(--text-secondary)]">Address</p>
                    <EditField label="Address line 1" value={quotation.internationalAddress?.line1 ?? ''}
                      onChange={(v) => setIntlAddr('line1', v)} />
                    <EditField label="Address line 2" value={quotation.internationalAddress?.line2 ?? ''}
                      onChange={(v) => setIntlAddr('line2', v)} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <EditField label="City" value={quotation.internationalAddress?.city ?? ''}
                        onChange={(v) => setIntlAddr('city', v)} />
                      <EditField label="State / Province" value={quotation.internationalAddress?.state ?? ''}
                        onChange={(v) => setIntlAddr('state', v)} />
                      <EditField label="Postal code" value={quotation.internationalAddress?.postalCode ?? ''}
                        onChange={(v) => setIntlAddr('postalCode', v)} />
                      <EditField label="Country" value={quotation.internationalAddress?.country ?? ''}
                        onChange={(v) => setIntlAddr('country', v)} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <DL>
                {/*
                  ── ประเทศ IS FIRST BECAUSE IT IS THE CLASSIFICATION ──────────
                  It decides which address shape and which branch vocabulary the
                  rows below it use, which is the same job ประเภทลูกค้า does as
                  the PUBLIC card's first row. The two cards were given one name
                  and one tax-id spelling in round 11; this keeps their first row
                  playing the same part.
                */}
                <DLRow label="ประเทศ" value={countryLabel} />
                {/*
                  ══ THE COMPANY IS UNCONDITIONAL NOW — ROUND 13 ═══════════════

                  IT WAS GATED ON `companyDiverges`, so the card named the party
                  the quotation is addressed to ONLY on legacy documents where
                  the two company fields disagree. On every document written
                  since the form was split — which is the normal case, and the
                  case where the two names are simply the same — THE QUOTATION
                  CARD SHOWED NO COMPANY AT ALL. A quotation card that does not
                  say who the quotation is for is missing its subject.

                  The guard was not wrong about divergence, it was answering a
                  different question: "is this worth a SECOND row" is not "should
                  this card have a company". The contact card upstairs shows
                  `displayCompany`; this one shows the QUOTATION company, always.

                  ── IT SITS SECOND, ABOVE THE TAX ID, THE BRANCH AND THE ADDRESS
                  Because those three are attributes OF this company — a tax id
                  belongs to an entity, a branch is a branch of one, an address
                  is where it is. A card whose subject appears below its own
                  attributes reads as a list of facts about nothing. Nothing else
                  moved; the row that was conditional simply became the row that
                  is always there.

                  ── THE FIELD IS `quotationCompany`, AND IT IS A REAL, SEPARATE
                  COLUMN. `RegisterInhouse` carries BOTH: `companyName`, which
                  the model's own docstring calls "NOT A FORM FIELD ANY MORE — a
                  legacy-compat MIRROR of quotationCompany", and
                  `quotationCompany`, which the edit form writes. They CAN
                  differ, on documents written before the split, and this card
                  must never show the contact one.

                  The fallback to `contactCompany` fires only when
                  `quotationCompany` was never written at all — a pre-split
                  enquiry — where the contact company IS what a quotation would
                  have been addressed to. It is a read-time fallback, not a
                  write: nothing here changes what is stored.
                */}
                <DLRow label="ชื่อบริษัท (ใบเสนอราคา)" value={quotationCompanyDisplay}
                  action={<CopyAction text={quotationCompanyDisplay} label="ชื่อบริษัทสำหรับใบเสนอราคา" />} />
                {/* เลขประจำตัวผู้เสียภาษี, not เลขผู้เสียภาษี — the public card's
                    spelling, which is also the legal one. Round 11 aligned the
                    two screens' vocabulary along with the card name; the same
                    field spelled two ways is the shape `ชื่อ-นามสกุล` was already
                    held to on the attendee table's header. THREE OTHER SURFACES
                    still say เลขผู้เสียภาษี and are deliberately untouched: the
                    public in-house ENQUIRY form, the career-path screens, and the
                    two customer emails. Each is a different audience and the
                    emails are copy a customer has already received. */}
                <DLRow label="เลขประจำตัวผู้เสียภาษี" value={quotation.taxId}
                  action={<CopyAction text={quotation.taxId} label="เลขประจำตัวผู้เสียภาษี" />} />
                {/* Derived at read time. `branch` is legacy read-only and is the
                    fallback for pre-split enquiries — see branchLabel.js. */}
                <DLRow label="สาขา" value={branchLabel}
                  action={<CopyAction text={branchLabel} label="สาขาสำหรับใบเสนอราคา" />} />
                <DLRow label="ที่อยู่" value={address}
                  action={<CopyAction text={address} label="ที่อยู่สำหรับใบเสนอราคา" />} />
              </DL>
            )}
          </SectionCard>

          {/*
            ── THIS CARD IS UNCONDITIONAL NOW, AND THAT IS A VACUITY FIX ───────
            It was `{doc.message && <SectionCard …>}`, which is exactly the
            pattern that keeps turning up: the guard reads as "only show the note
            when there is one" and its real effect was that a request with NO
            customer note had no card — so `message` was in the allowlist, on the
            screen's own list of editable fields, and unreachable by any control
            on any document that did not already have a value.

            The empty state is now the caller's muted sentence, matching the
            public screen's หมายเหตุ card exactly. `QuotedNote` is still never
            rendered empty — an accent rule beside nothing asserts a quotation.
          */}
          <SectionCard
            icon={MessageSquare}
            title="หมายเหตุจากลูกค้า"
            {...editProps('message')}
            onSave={() => save({ message }, 'save-message')}
          >
            {editSection === 'message' ? (
              <EditArea label="หมายเหตุจากลูกค้า" value={message} onChange={setMessage} rows={4} maxLength={2000} />
            ) : message ? (
              <QuotedNote>{message}</QuotedNote>
            ) : (
              <p className="text-[13px] italic leading-[22px] text-[var(--text-muted)]">ไม่มีหมายเหตุจากลูกค้า</p>
            )}
          </SectionCard>

          {/*
            ── INTERNAL NOTES — APPEND-ONLY, AND NOT หมายเหตุจากลูกค้า ────────
            The card above holds `doc.message`: the CUSTOMER'S own words. This
            holds `doc.adminNotes`, which they must never see. Two fields, two
            cards — see lib/registrations/internalNotes.

            NO `editProps`. There is no แก้ไข because there is nothing to edit;
            the composer is gated on the SAME `readOnly` flag every other card's
            onEdit is, so a cancelled request shows its notes and offers no way
            to add another.
          */}
          <SectionCard icon={StickyNote} title="บันทึกภายในของทีมขาย">
            <InternalNotesBody
              notes={internalNotes}
              draft={noteDraft}
              onDraftChange={setNoteDraft}
              onAdd={readOnly ? undefined : handleAddNote}
              adding={busy === 'add-note'}
              formatDate={fmtDate}
              emptyLabel="ยังไม่มีบันทึกจากทีมขาย"
            />
          </SectionCard>

          <SystemCard icon={Database} title="ข้อมูลระบบ">
            {/*
              เลขอ้างอิง — MOVED HERE FROM THE HEADING. Same ruling as the public
              screen: round 3 removed the เลขอ้างอิง column from both list tables
              because the detail heading carried it, and the heading no longer
              does. Outside this row the number survives only in the
              delete-confirm dialog, which quotes it and is left alone.

              First in the card, above the raw id: this is the value a human
              quotes, the 24-character `_id` is the one they paste into a query.
            */}
            <DLRow label="เลขอ้างอิง"    value={mono(refNo(doc._id))} />
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
          {/* The NAME is the value and takes the row's size from the `<dd>`. The
              CODE below it is deliberately left at 11px: it is the annotation,
              and it is the same 11px the in-house LIST cell uses — the agreement
              this component's docstring claims. Round 11 does not touch the list
              screens, so following the value here would have broken it. */}
          <span className="block text-[var(--text-primary)]">{name || code}</span>
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
/*
 * ── `CopyButton` MOVED TO detailShell IN ROUND 8 ───────────────────────────
 * The public screen needed it too, and copying it would have put a second
 * `navigator.clipboard` implementation in the tree — one screen quietly telling
 * a salesperson the address is on their clipboard when it is not. The docstring
 * that used to be here, including the can-fail reasoning, went with it.
 */
