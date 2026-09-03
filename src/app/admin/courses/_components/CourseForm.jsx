'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Eye, ExternalLink, X } from 'lucide-react';
import { createCourse, updateCourse } from '@/lib/actions/courses';
import {
  saveCourseExtension,
  checkAliasAvailable,
} from '@/lib/actions/course-extensions';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo (see test/fs/libImportsResolved for the two defects that
// earned it).
import { captureCoursePreImage, commitCourseVersion } from '@/lib/actions/course-versions';
import { PRE_IMAGE } from '@/lib/courses/courseSnapshot';
import { CourseSeoRail } from './CourseSeoRail';
import { CourseSearchSelect } from './CourseSearchSelect';
import { CourseGalleryEditor } from './CourseGalleryEditor';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { CourseVersionHistory } from './CourseVersionHistory';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { BulletTextarea } from '@/components/admin/BulletTextarea';
import { TrainingTopicsEditor } from '@/components/admin/TrainingTopicsEditor';
import { CourseBodyEditor } from '@/components/admin/CourseBodyEditor';
import { seedTopicEditorRows } from '@/lib/courses/topicEditorSeed';
import { CourseOutlineUpload } from '@/components/admin/CourseOutlineUpload';
import { outlineWouldGoStale } from '@/lib/courses/courseOutline';
import { courseSaveOutcome } from '@/lib/courses/courseSaveOutcome';
import { courseEditorSignature, isCourseEditorDirty } from '@/lib/courses/courseFormDirty';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { TAB, DEFAULT_TAB, panelClass } from '@/lib/courses/courseEditorTabs';
import { withListQuery } from '@/lib/courses/adminListQuery';
/**
 * THE PUBLIC PAGE'S OWN SECTION NAMES. The form does not invent labels for
 * content the public page already names — see COURSE_SECTION_LABELS. Pulls
 * lucide icons and nothing else, so it is safe in this client bundle.
 */
import { COURSE_SECTION_LABELS } from '@/lib/courseSectionNav';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

/**
 * Genesis course editor — MSDB field parity.
 *
 * Layout follows the upstream MSDB admin form so admins moving between
 * the two have a familiar mental model. The form collects FormData
 * via `new FormData(form)` on submit, so every input below — including
 * the hidden inputs rendered by ImageUploadField, BulletTextarea, and
 * TrainingTopicsEditor — is picked up automatically. The server-side
 * `shapePayload()` in `src/lib/actions/courses.js` is the source of
 * truth for field names; keep the `name=` attributes here in sync.
 */
/**
 * The topics seed lives in @/lib/courses/trainingTopics, NOT here.
 *
 * The mapping is where the { topic, subtopics } defect actually was, so it has
 * to be reachable by a test — and a test that imported this component would
 * also import @/lib/actions/courses, which is 'use server'. Keeping the pure
 * mapping out of the component is what lets the round-trip test start at the
 * MSDB row rather than one step downstream of the bug.
 *
 * The tripwire is passed in rather than baked in: this module owns the fact
 * that the console is the right place to shout, the pure module owns the
 * detection.
 */
const warnLegacyTopicShape = ({ rows, course }) => {
  console.warn(
    `[CourseForm] training_topics arrived in the RETIRED { topic, subtopics } shape `
    + `for course ${course} at row(s) ${rows.join(', ')}. Upstream stores `
    + `{ title, bullets }; this should be unreachable. The rows are mapped across so `
    + `the admin is not blocked, but the source of the old shape needs finding.`
  );
};

const COURSE_LEVELS = [
  { value: '1', label: '1 · Beginner' },
  { value: '2', label: '2 · Intermediate' },
  { value: '3', label: '3 · Advanced' },
  { value: '4', label: '4 · Expert' },
];

export function CourseForm({
  initial = null,
  skills = [],
  programs = [],
  allCourses = [],
  mode = 'create',
  /**
   * The course's CourseExtension doc, or null when it has none yet.
   *
   * EDIT MODE ONLY — the create page passes nothing, because a course has no
   * extension until it exists and its course_id, the key the row is stored
   * under, is still being typed. Both modes render the SAME shell either way;
   * on create the rail simply starts empty and its values are written after
   * MSDB accepts the course.
   */
  extension = null,
  /**
   * The /admin/courses filter state (`q`, `program`, `type`) as a query string,
   * forwarded by the edit page from its own URL. Both ← controls carry it so
   * the admin lands back on the list they were actually looking at. '' when the
   * list was unfiltered or the editor was opened directly.
   */
  listQuery = '',
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  /**
   * BOTH MODES RENDER THE SHELL. `isShell` used to mean "this is the edit
   * page"; it now means nothing distinct, because create and edit share one
   * layout, one rail and one unsaved-changes guard.
   *
   * It survives as a named constant rather than being deleted inline so the
   * places where create and edit genuinely DIFFER stay visible: the write path
   * (create must not touch the extension until MSDB has accepted the course),
   * the header affordances that need a course to exist (Preview, the
   * promos/FAQ link), and the post-success navigation.
   */
  const isCreate = mode === 'create';

  // ── CourseExtension state (the genesis-side store) ────────────────
  // Controlled state, NOT form inputs: shapePayload must never see these.
  const [urlAlias, setUrlAlias] = useState(
    (extension?.urlAlias ?? '').replace(/^\//, '')
  );
  const [metaTitle, setMetaTitle] = useState(extension?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(extension?.metaDescription ?? '');
  const [ogImage, setOgImage] = useState(extension?.ogImage ?? '');
  const [tags, setTags] = useState((extension?.tags ?? []).join(', '));
  const [gallery, setGallery] = useState(
    Array.isArray(extension?.gallery) ? extension.gallery : []
  );
  const [isPublished, setIsPublished] = useState(extension?.isPublished !== false);

  /**
   * NOT EDITED HERE, AND THAT IS EXACTLY WHY IT IS IN STATE.
   *
   * `saveCourseExtension` writes a WHOLE document — its `update` object names
   * every field, and `omisePaymentEnabled` defaults to `false` when the caller
   * omits it (course-extensions.js:128). So saving this rail without carrying
   * the flag through would silently switch off the card / PromptPay flow on the
   * public registration wizard for that course, with nothing on screen to say
   * so. It is read here, held unchanged, and written back.
   *
   * The toggle itself stays on /admin/courses/[courseId] under การชำระเงิน.
   */
  const [omisePaymentEnabled] = useState(extension?.omisePaymentEnabled === true);

  /**
   * The course rich body — controlled state, same reason trainingTopicsRich is:
   * lifted out of a Tiptap editor with no `name` attribute, so it never enters
   * FormData and must be carried, seeded and compared explicitly.
   */
  const [descriptionRich, setDescriptionRich] = useState(extension?.descriptionRich ?? '');

  /**
   * Section 6's four rich bodies — the exact same pattern as `descriptionRich`
   * just above, one state pair per field: lifted out of a `CourseBodyEditor`
   * with no `name` attribute, so each never enters FormData and must be
   * carried, seeded and compared explicitly. Independent of each other and of
   * their own plain-textarea sibling — see Section 6's own comment for why
   * both controls coexist.
   */
  const [objectivesRich, setObjectivesRich] =
    useState(extension?.objectivesRich ?? '');
  const [targetAudienceRich, setTargetAudienceRich] =
    useState(extension?.targetAudienceRich ?? '');
  const [prerequisitesRich, setPrerequisitesRich] =
    useState(extension?.prerequisitesRich ?? '');
  const [systemRequirementsRich, setSystemRequirementsRich] =
    useState(extension?.systemRequirementsRich ?? '');

  // Which half of the last save failed, so the message can name it in Thai.
  const [saveReport, setSaveReport] = useState(null);
  /**
   * Set once a CREATE has actually produced a course upstream but the
   * extension write did not land. From then on the form is editing a course
   * that EXISTS: the primary button retries only the extension, never a second
   * create. `{ id, code }` — id for the edit link, code for the retry key.
   */
  const [createdCourse, setCreatedCourse] = useState(null);
  // A refusal that belongs on one field rather than in the page banner.
  const [fieldError, setFieldError] = useState(null);
  // Separate from `fieldError`, which is bound to the course_id input. An alias
  // refusal belongs on the alias box in the right rail — putting it on
  // course_id would point the admin at the one field that is not the problem.
  const [aliasError, setAliasError] = useState(null);
  /**
   * WAS `showGallery`, A BOOLEAN. A boolean says everything it needs to while
   * there are exactly two panels; it cannot express a third. The enum lives in
   * lib/courses/courseEditorTabs so the form and its tests read the names from
   * one place rather than passing string literals past each other — a typo'd
   * literal is a tab that silently never activates, because every comparison
   * against it is merely false and nothing errors.
   *
   * WHAT DID NOT CHANGE, and is the whole point of the conversion: a non-active
   * panel is HIDDEN, NEVER UNMOUNTED. The save and the dirty check both read the
   * live DOM through `new FormData(form)`, so unmounting the body would blank
   * the course on save and blind the unsaved-changes guard — silently, in both
   * cases. See the note on the panels below and in courseEditorTabs.
   */
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);

  // ── Unsaved-changes guard ─────────────────────────────────────────
  const formRef = useRef(null);
  const baselineRef = useRef(null);   // the seeded signature, or null before capture
  const touchedRef = useRef(false);   // has the admin actually typed/clicked a field?
  const leavingRef = useRef(false);   // a leave the guard itself authorised
  const [pendingHref, setPendingHref] = useState(null);
  const [dirty, setDirty] = useState(false);
  // Stamp of the last fully-successful save. Shown in the header, and dropped
  // the moment the form is edited again so it can never describe stale state.
  const [savedAt, setSavedAt] = useState(null);
  // Set only when a "บันทึกแล้วดูหน้าจริง" submit reaches courseSaveOutcome's
  // allOk — i.e. BOTH MSDB and the extension landed. Gates the "เปิดหน้าจริง"
  // reveal below the header; see the R1 note in handleSubmit for why this is a
  // second click rather than an immediate window.open().
  const [previewReady, setPreviewReady] = useState(false);

  // ── Section 1 ─────────────────────────────────────────────────────
  const [courseId, setCourseId] = useState(initial?.course_id ?? '');

  /**
   * WARN — do not block — when an edit renames a course that already has an
   * outline PDF.
   *
   * The stored path embeds the course_id, so the saved row keeps pointing at a
   * file named for the OLD id. Nothing breaks immediately: the file is still
   * there and still resolves. Blocking the rename would be a larger
   * intervention than the problem, and silently re-deriving the path would
   * point the row at a file nobody uploaded — so this says exactly what will go
   * stale, names both values, and leaves the decision with the admin.
   */
  useEffect(() => {
    const stale = outlineWouldGoStale({
      previousCourseId: initial?.course_id,
      nextCourseId: courseId,
      outlines: { th: initial?.course_outline_th, en: initial?.course_outline_en },
    });
    if (stale) {
      console.warn(
        `[CourseForm] course_id is changing from "${stale.from}" to "${stale.to}" while an `
        + `outline PDF exists (${stale.langs.join(', ').toUpperCase()}). The stored path still `
        + `names the OLD id, so it will keep resolving to the old file until the PDF is `
        + `re-uploaded under the new id.`
      );
    }
  }, [courseId, initial]);

  // ── Section 4: program + skills ───────────────────────────────────
  const initialSkillIds = (() => {
    if (!initial?.skills) return [];
    return initial.skills.map((s) => s?._id ?? s).filter(Boolean).map(String);
  })();
  const [selectedSkillIds, setSelectedSkillIds] = useState(initialSkillIds);

  function toggleSkill(id) {
    setSelectedSkillIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  // ── Section 5: related courses ────────────────────────────────────
  // The upstream payload returns populated course objects. Strip them
  // back to course_id strings so the chips + the resolver share the
  // same key (resolver lives in src/lib/api/resolveIds.js).
  const initialRelatedCodes = (() => {
    if (!Array.isArray(initial?.related_courses)) return [];
    return initial.related_courses
      .map((c) => (typeof c === 'string' ? c : c?.course_id))
      .filter(Boolean)
      .map(String);
  })();
  const [relatedCodes, setRelatedCodes] = useState(initialRelatedCodes);
  const [relatedQuery, setRelatedQuery] = useState('');

  const relatedOptions = useMemo(() => {
    const q = relatedQuery.trim().toLowerCase();
    return allCourses
      .filter((c) => {
        if (!c?.course_id) return false;
        if (relatedCodes.includes(c.course_id)) return false; // hide picked
        if (initial && c.course_id === initial.course_id) return false; // can't reference self
        if (!q) return true;
        return (
          c.course_id.toLowerCase().includes(q) ||
          (c.course_name || '').toLowerCase().includes(q) ||
          (c.course_name_th || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [allCourses, relatedQuery, relatedCodes, initial]);

  function pickRelated(code) {
    if (relatedCodes.length >= 5) return;
    if (relatedCodes.includes(code)) return;
    setRelatedCodes((cur) => [...cur, code]);
    setRelatedQuery('');
  }
  function dropRelated(code) {
    setRelatedCodes((cur) => cur.filter((c) => c !== code));
  }

  // Lookup helper for chip labels.
  const codeToName = useMemo(() => {
    const m = new Map();
    for (const c of allCourses) {
      if (c?.course_id) {
        m.set(c.course_id, c.course_name_th || c.course_name || c.course_id);
      }
    }
    return m;
  }, [allCourses]);

  // ── previous_course (single) ──────────────────────────────────────
  const initialPreviousCode =
    initial?.previous_course?.course_id ??
    (typeof initial?.previous_course === 'string'
      ? initial.previous_course
      : '') ??
    '';
  const [previousCourse, setPreviousCourse] = useState(initialPreviousCode);

  /**
   * ── SECTION 7's SEED, FROM THE SAME FUNCTION THE PUBLIC PAGE ASKS ────────
   * `seedTopicEditorRows` calls `resolveTopicRich`, which is the function
   * `courseOutlineView` calls to decide what a VISITOR sees. One decision,
   * two surfaces. If the seed made its own the admin would edit formatting
   * nobody can see, or overwrite formatting the form never loaded.
   *
   * `warning` is non-empty ONLY in the stale case, where the rich copy has
   * been discarded and seeding fell back to the plain MSDB text.
   */
  const topicSeed = useMemo(
    () => seedTopicEditorRows({
      course: initial,
      extension,
      onLegacyShape: warnLegacyTopicShape,
    }),
    [initial, extension]
  );

  /**
   * The rich half of section 7, lifted out of the editor.
   *
   * `[]` until the child reports — which it does in a mount effect, so it is
   * settled before the unsaved-changes baseline is taken a frame later. It is
   * ordinary React state and is therefore NOT in FormData, so it is compared
   * explicitly in `courseEditorSignature` the way the gallery is; without
   * that, a formatting-only edit (bolding a word, nesting a bullet) changes
   * nothing the plain projection can see and the guard would let the admin
   * walk away from it.
   */
  const [trainingTopicsRich, setTrainingTopicsRich] = useState([]);

  // ── Unsaved-changes guard: snapshot, dirty, interception ──────────

  /** Everything the editor can change, as one comparable string. */
  const snapshot = useCallback(
    () =>
      courseEditorSignature({
        formEntries: formRef.current ? [...new FormData(formRef.current)] : [],
        extension: {
          urlAlias, metaTitle, metaDescription, ogImage, tags, isPublished, gallery,
          trainingTopicsRich, descriptionRich,
          objectivesRich, targetAudienceRich, prerequisitesRich, systemRequirementsRich,
        },
      }),
    [urlAlias, metaTitle, metaDescription, ogImage, tags, isPublished, gallery,
      trainingTopicsRich, descriptionRich,
      objectivesRich, targetAudienceRich, prerequisitesRich, systemRequirementsRich]
  );

  /**
   * Baseline AFTER a frame, not in this effect directly.
   *
   * React runs CHILD effects before the parent's, and TrainingTopicsEditor
   * seeds its hidden input via `setRows` in its own mount effect. Snapshotting
   * here would capture the pre-seed value, the re-render would change it, and
   * every page load would look edited — the exact false positive that teaches
   * admins to click straight through this dialog.
   */
  useEffect(() => {
    const id = requestAnimationFrame(() => { baselineRef.current = snapshot(); });
    return () => cancelAnimationFrame(id);
    // Once, on mount: re-running would re-baseline and erase the admin's edits
    // from the comparison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Wrap a rail/gallery setter so a real user edit registers as one. */
  const markTouched = useCallback(
    (fn) => (value) => { touchedRef.current = true; fn(value); },
    []
  );

  // Rail + gallery are React state, so a change re-renders and lands here.
  useEffect(() => {
    setDirty(touchedRef.current && isCourseEditorDirty(baselineRef.current, snapshot()));
  }, [snapshot]);

  // The course body is UNCONTROLLED — typing fires no React render, so the
  // DOM's own input/change events are the only signal that it happened.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return undefined;
    const onEdit = () => {
      touchedRef.current = true;
      setDirty(isCourseEditorDirty(baselineRef.current, snapshot()));
    };
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);
    return () => {
      form.removeEventListener('input', onEdit);
      form.removeEventListener('change', onEdit);
    };
  }, [snapshot]);

  /**
   * INTERCEPTING IN-APP NAVIGATION. The App Router has no `useBlocker`, so the
   * only place left to stand is the click itself: a CAPTURE-phase listener on
   * `document` runs before next/link's own handler, so cancelling there stops
   * the navigation before the router ever hears about it.
   *
   * Listening on `document` rather than wrapping each <Link> is what makes the
   * ADMIN SIDEBAR work too — those links live in the layout, outside this
   * component, and could not be wrapped without editing a shared surface.
   *
   * Not intercepted, and stated rather than hidden: BACK/FORWARD. `popstate`
   * fires after the history entry has already moved and the App Router gives no
   * way to veto it; `beforeunload` does not fire for client-side history moves.
   * Cancelling it would mean pushing a decoy entry, which breaks the back
   * button for everyone to protect one case.
   */
  useEffect(() => {
    if (!dirty) return undefined;

    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);

    const onClick = (e) => {
      if (leavingRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // open-in-new-tab
      const anchor = e.target?.closest?.('a[href]');
      if (!anchor) return;
      // ดูหน้าจริง and the post-save เปิดหน้าจริง reveal are both target="_blank":
      // a new tab is not an exit, and prompting for one here would be the false
      // positive that discredits the whole guard. Both still warn about
      // SAVED-ONLY content on their own — ดูหน้าจริง via its own onClick
      // confirm() when dirty, เปิดหน้าจริง by only existing once a save
      // actually landed — this generic same-tab-navigation guard was never the
      // mechanism for that and still is not.
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      const raw = anchor.getAttribute('href');
      if (!raw || raw.startsWith('#')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;  // beforeunload covers it
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search);
    };
    document.addEventListener('click', onClick, true);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  function leaveWithoutSaving() {
    const href = pendingHref;
    leavingRef.current = true;
    setPendingHref(null);
    setDirty(false);
    if (href) router.push(href);
  }

  /**
   * The rail + gallery write, for a given code. ONE definition, so the create
   * path, the create RETRY and the edit save cannot disagree about which
   * fields travel.
   *
   * `omisePaymentEnabled` is sent EXPLICITLY even on create, where there is no
   * previous row to carry forward. `saveCourseExtension` writes a whole
   * document and defaults an omitted flag to false, so relying on that default
   * would mean the field's value depends on which caller happened to omit it —
   * the same class of accident that switched the flag off on edit.
   *
   * ── `upstreamId` IS THE SECOND ARGUMENT, AND EVERY CALLER HAS ONE ─────────
   * The MSDB `_id` of the course this row belongs to. It is what a later
   * rename guard can use to tell a renamed course from a deleted-and-recreated
   * one, and this form is the only place the two halves are ever in hand at the
   * same moment: create has the id `createCourse` just returned, the create
   * RETRY has the one it held onto, and edit is ROUTED by it.
   *
   * Passing it here rather than resolving it inside the action is the point.
   * The action would have to look the course up BY CODE to find the id — which
   * is the very lookup the anchor exists to stop depending on, and it would
   * happily anchor a renamed row to whatever now holds its old code. The
   * caller's id was not derived from the code at all.
   *
   * It is only ever SET INTO AN EMPTY FIELD — `saveCourseExtension` refuses to
   * overwrite a differing anchor and logs it instead.
   */
  const saveExtensionFor = useCallback(
    (code, upstreamId) =>
      saveCourseExtension(code, {
        urlAlias,
        metaTitle,
        metaDescription,
        ogImage,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        gallery: gallery.map((item, i) => ({ ...item, order: i })),
        isPublished,
        omisePaymentEnabled,
        /**
         * ── THE KEY IS ALWAYS NAMED, AND THAT IS THE POINT ───────────────
         * `buildExtensionUpdate` selects on KEY PRESENCE: an absent key means
         * leave-alone. Every OTHER caller of this action omits the field and
         * must keep leaving it alone; this one owns it, so it names it on
         * every save — including when the value is `[]`, which is how a
         * course whose formatting the admin REMOVED gets its obsolete rich
         * copy cleared rather than kept forever as a stale one.
         */
        trainingTopicsRich,
        // Same reasoning as trainingTopicsRich just above: this form owns the
        // field, so it is named on every save, including '' — how a course
        // whose rich body the admin cleared actually clears it, rather than
        // leaving a stale copy the presence gate would otherwise protect
        // forever.
        descriptionRich,
        // Section 6's four rich bodies — identical reasoning to descriptionRich
        // just above, one key per field. This form owns all four, so every one
        // is named on every save, including '', independently of the other
        // three and of its own plain-textarea sibling.
        objectivesRich,
        targetAudienceRich,
        prerequisitesRich,
        systemRequirementsRich,
        upstreamId: String(upstreamId ?? ''),
      }).catch((err) => ({ ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' })),
    [urlAlias, metaTitle, metaDescription, ogImage, tags, gallery, isPublished,
      omisePaymentEnabled, trainingTopicsRich, descriptionRich,
      objectivesRich, targetAudienceRich, prerequisitesRich, systemRequirementsRich]
  );

  /**
   * Both halves landed on CREATE — go to the new course's editor.
   *
   * The target is built from the `_id` MSDB RETURNED, never from the typed
   * code: `/admin/courses/<CODE>/edit` is a 404 that reads as a missing course
   * (that route takes an ObjectId). If no id came back we fall back to the
   * list rather than guess a URL — losing the redirect is recoverable, landing
   * on a 404 after a successful create is not.
   *
   * `leavingRef` MUST be set: the unsaved-changes guard now covers this page,
   * and without it the guard would intercept its own redirect.
   */
  const finishCreate = useCallback(
    (newId) => {
      baselineRef.current = snapshot();
      leavingRef.current = true;
      setDirty(false);
      router.push(
        newId
          ? withListQuery(`/admin/courses/${encodeURIComponent(newId)}/edit`, listQuery)
          : withListQuery('/admin/courses', listQuery)
      );
      router.refresh();
    },
    [router, listQuery, snapshot]
  );

  // ── submit ────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const fd = new FormData(e.currentTarget);

    if (isCreate) {
      /**
       * ── CREATE: ORDERED, NOT BOTH-ALWAYS ──────────────────────────────
       * The edit page attempts both writes regardless, because its two stores
       * are independent and a half-landed save loses nothing. CREATE IS NOT
       * THAT. The extension row is keyed by the course_id CODE, so writing it
       * after a failed create leaves an ORPHAN keyed to a course that does not
       * exist — and the next course created with that code silently inherits
       * its alias, gallery and SEO. So: MSDB first, extension ONLY if the
       * course was actually created.
       *
       * The duplicate guard runs server-side inside createCourse, before any
       * write, and covers both stores — see lib/courses/courseIdAvailability.
       */
      setSaveReport(null);
      setFieldError(null);
      setAliasError(null);
      startTransition(async () => {
        // RETRY PATH: the course already exists from an earlier submit, and
        // only the extension half is outstanding. Never create twice.
        if (createdCourse) {
          // The id MSDB assigned on the first submit, held since — the retry
          // must anchor to the course that was actually created, never to
          // whatever the code resolves to now.
          const retryRes = await saveExtensionFor(createdCourse.code, createdCourse.id);
          // The retry is the second half of a create landing. Same joint point,
          // same reasoning as the edit path — and ABSENT rather than SKIPPED
          // because this course had no earlier state to be missing.
          await commitCourseVersion({
            courseId: createdCourse.code,
            upstreamId: createdCourse.id,
            preImage: { state: PRE_IMAGE.ABSENT },
          }).catch(() => null);
          if (retryRes?.ok === true) {
            finishCreate(createdCourse.id);
            return;
          }
          setSaveReport({
            courseOk: true, extOk: false,
            courseError: null, extError: retryRes?.error ?? null,
          });
          return;
        }

        /**
         * ── ALIAS CHECK, BEFORE THE COURSE EXISTS ─────────────────────────
         * This used to run inside saveCourseExtension, i.e. AFTER createCourse
         * had already written to MSDB — so a clashing alias left a real course
         * upstream with no extension row, and the admin found out only once it
         * was too late to not create it. The duplicate-CODE guard has always
         * refused before writing anything; an alias clash is the same kind of
         * refusal and had no business behaving differently. Consistency is the
         * reason, not the saved round trip.
         *
         * A THROW IS NOT "FREE". Same ruling as the code guard: refusing to
         * answer is not answering no, so a failed lookup stops the create
         * rather than waving it through to be caught by the index later.
         */
        const aliasClash = await checkAliasAvailable(urlAlias, courseId).catch(
          (err) => ({
            field: 'urlAlias',
            error:
              'ตรวจสอบ URL Alias ซ้ำไม่สำเร็จ จึงยังไม่ได้สร้างหลักสูตร — '
              + `กรุณาลองใหม่อีกครั้ง (${err?.message ?? 'lookup failed'})`,
          })
        );
        if (aliasClash) {
          // NOTHING WAS WRITTEN — not MSDB, not the extension. The create
          // button stays armed because there is nothing to not-repeat.
          setAliasError(aliasClash.error);
          return;
        }

        const courseRes = await createCourse(fd).catch((err) => ({
          ok: false, error: err?.message ?? 'สร้างหลักสูตรไม่สำเร็จ',
        }));

        if (courseRes?.ok !== true) {
          // NOTHING WAS WRITTEN. Stay put, keep the create button enabled, and
          // put a duplicate-code refusal on the field it belongs to.
          if (courseRes?.field === 'course_id') setFieldError(courseRes.error);
          else setError(courseRes?.error ?? 'สร้างหลักสูตรไม่สำเร็จ');
          return;
        }

        const newId = courseRes.id ?? courseRes.item?._id ?? null;
        const code = String(courseId ?? '').trim();

        // `newId` is what MSDB just returned for THIS create — the anchor is
        // written from the same response the redirect is built from.
        const extRes = await saveExtensionFor(code, newId);

        /**
         * The course EXISTS from here on, whether or not the rail landed, so
         * the version is written before the outcome is read — the same joint
         * point the edit path uses.
         *
         * ABSENT, never UNAVAILABLE: there was no course a moment ago, so the
         * baseline is legitimately empty rather than unreadable. Flagging it as
         * missing would report a defect on every course anyone adds.
         */
        await commitCourseVersion({
          courseId: code,
          upstreamId: newId,
          preImage: { state: PRE_IMAGE.ABSENT },
        }).catch(() => null);

        if (extRes?.ok === true) {
          finishCreate(newId);
          return;
        }

        /**
         * PARTIAL CREATE. The course EXISTS now; only the rail did not land.
         * Do not navigate, do not re-baseline, and do not leave a create button
         * armed — a second submit would create a duplicate course. The form
         * switches to "already created": every typed value stays, and the
         * primary button retries the extension write alone.
         */
        setCreatedCourse({ id: newId, code });
        setSaveReport({
          courseOk: true, extOk: false,
          courseError: null, extError: extRes?.error ?? null,
        });
      });
      return;
    }

    /**
     * ── ONE BUTTON, TWO STORES ────────────────────────────────────────────
     * The course body goes to MSDB over HTTP; the rail and the gallery go to
     * the local `course_extensions` collection. They are independent writes and
     * either can fail on its own.
     *
     * ORDER: MSDB first, then the extension. MSDB is the external call — a
     * 10 s-timeout fetch to another service — and is by far the likelier to
     * fail, so it is resolved before the fast local upsert rather than leaving
     * the admin watching a spinner for a result already decided.
     *
     * BOTH ARE ALWAYS ATTEMPTED, even when the first fails. The two stores
     * share no field, so a half-landed save is not an inconsistency — it is
     * one of two unrelated saves not landing. Skipping the second would throw
     * away a perfectly good Meta Title edit because an unrelated upstream was
     * down, and the admin would have no way to tell that is what happened.
     *
     * NAVIGATION IS THE JOINT CONDITION. We leave the page only when both
     * succeeded; anything else keeps the form mounted with every value the
     * admin typed still in it, so the retry costs them nothing. Reporting
     * "success" on a partial save is the one outcome that must be impossible.
     */
    /**
     * ── R1: "บันทึกแล้วดูหน้าจริง" reuses THIS handler, not a second one ────
     * Both submit buttons below are `type="submit"` inside the same <form>, so
     * either one runs handleSubmit unchanged — no forked save path to drift
     * from the plain "บันทึก" button. `submitter` (native, off the SubmitEvent)
     * is read HERE, synchronously, inside the real click's call stack — never
     * after an `await` — because that is what a browser gesture is scoped to.
     * It is only ever used to decide whether to REVEAL a plain `<a>` after
     * success; nothing here calls window.open() itself.
     */
    const wantsPreviewAfterSave = e.nativeEvent?.submitter?.dataset?.intent === 'save-and-preview';
    setSaveReport(null);
    setAliasError(null);
    setPreviewReady(false);
    startTransition(async () => {
      /**
       * ── THE BASELINE, READ BEFORE EITHER WRITE ────────────────────────────
       * The state a version history compares the first save against exists only
       * until `updateCourse` runs: the course is upstream and written over HTTP,
       * so there is no `new: false` to recover it afterwards.
       *
       * It costs a round trip ONCE PER COURSE — the action checks for existing
       * history first and returns without reading MSDB when there is any.
       *
       * `.catch` rather than a guard: a version history must never be able to
       * stop a save, and an absent baseline reads as SKIPPED, which is exactly
       * what it is.
       */
      const preImage = await captureCoursePreImage({
        courseId,
        upstreamId: initial?._id,
      }).catch(() => ({ state: PRE_IMAGE.SKIPPED }));

      const courseRes = await updateCourse(initial?._id, fd).catch((err) => ({
        ok: false,
        error: err?.message ?? 'บันทึกไม่สำเร็จ',
      }));

      // Same one definition the create path uses — see saveExtensionFor.
      // `initial._id` is the ObjectId THIS ROUTE WAS OPENED WITH, so the edit
      // save anchors a row that has none without ever consulting the code.
      const extRes = await saveExtensionFor(courseId, initial?._id);

      /**
       * ── THE VERSION, WRITTEN WHERE BOTH HAVE COMPLETED ────────────────────
       * Not inside either action: one press is two independent writes, and a
       * snapshot taken inside the first would describe a state that never
       * existed on screen.
       *
       * UNCONDITIONAL, and deliberately not gated on the outcome. The action
       * re-reads both stores rather than trusting either result, so it records
       * what actually landed — including a PARTIAL save, which is a real change
       * and deserves a version. If neither write landed, the state is unchanged
       * and the no-op rule drops the row on its own; no special case is needed
       * and none can produce a phantom version.
       *
       * Awaited only so the promise cannot outlive the transition; the action
       * schedules its own work with after() and returns immediately, so nothing
       * on screen waits for it. Swallowed for the same reason as everything
       * else on this path.
       */
      await commitCourseVersion({
        courseId,
        upstreamId: initial?._id,
        preImage,
      }).catch(() => null);

      // The joint condition lives in lib/courses/courseSaveOutcome, so the
      // "never claim success on a half-landed save" rule is one testable
      // function rather than a boolean expression in a click handler.
      const outcome = courseSaveOutcome({ courseResult: courseRes, extResult: extRes });

      if (outcome.allOk) {
        /* STAYS PUT. The admin keeps editing the course they just saved.
         *
         * NO router.refresh(), deliberately. It could not update anything on
         * screen even if it ran: the course body is UNCONTROLLED, so React
         * re-rendering with new props leaves the DOM values exactly as they
         * are, and the rail/gallery are `useState`-seeded, so new props do not
         * re-seed them either. Both only take fresh values on a REMOUNT.
         *
         * So a refresh's guaranteed effects are one MSDB round-trip and one
         * risk: if anything ever does remount this subtree, every field resets
         * to whatever upstream returns — and if that read has not caught up
         * with the write, the admin watches their own save revert. Nothing to
         * gain, a silent wrong-value to lose. `revalidatePath` inside
         * updateCourse already invalidates the cache for the NEXT navigation,
         * which is where fresh data actually matters.
         *
         * `leavingRef` is NOT set: it exists to let the guard authorise its own
         * navigation, and setting it here would disable the click interceptor
         * for the rest of the page's life.
         */
        baselineRef.current = snapshot();
        setDirty(false);
        setSavedAt(Date.now());
        // Success is the JOINT condition (outcome.allOk === both stores
        // landed) — reached this line. A PARTIAL save falls through to the
        // branch below instead and never sets this.
        if (wantsPreviewAfterSave) setPreviewReady(true);
        return;
      }

      /**
       * ── BOTH, AND EACH ANSWERS A DIFFERENT QUESTION ────────────────────
       * On EDIT the two stores are independent and both writes are attempted,
       * so an alias refusal is not "nothing happened": `updateCourse` ran first
       * and its half may genuinely have SAVED. The report is the truthful
       * account of that — which half landed and which did not — and dropping it
       * in favour of a field error would tell the admin their save failed when
       * half of it did not.
       *
       * But the report alone does not say WHERE to fix it. It renders as a
       * block about the extension half; the admin still has to work out that
       * the URL Alias box in the rail is the thing to change. So the field
       * error goes on too, exactly as it does on create.
       *
       * This is deliberately ADDITIVE. The create arm shows only the field
       * error because on create nothing was written at all, so there is no
       * partial state to report.
       */
      if (extRes?.field === 'urlAlias') setAliasError(extRes.error);

      // A PARTIAL save is still dirty. `dirty` is left exactly as it was: the
      // admin has work that did not land, and the one thing worse than
      // prompting them is letting them walk away believing it saved.
      setSaveReport(outcome);
    });
  }

  // Pre-cooked defaults that map upstream populated objects.
  const programId = initial?.program?._id ?? initial?.program ?? '';

  /**
   * The course body — every MSDB field except `website_urls`.
   *
   * Held as a fragment rather than inlined so BOTH layouts render the SAME
   * sections from ONE source. A second copy for the shell is how the two would
   * drift, and a field present in one layout and missing from the other is
   * invisible in review: `shapePayload` reads whatever FormData contains, so a
   * dropped input is a silently unsaved field, not an error.
   */
  const bodySections = (
    <>
      {/* ───────────────────────────────────────────────────────────
          Section 1 — ข้อมูลหลัก
      ─────────────────────────────────────────────────────────── */}
      <Section title="1. ข้อมูลหลัก">
        <Field label="ชื่อหลักสูตร *">
          <input
            required
            type="text"
            name="course_name"
            defaultValue={initial?.course_name ?? ''}
            className={inputCls}
          />
        </Field>

        <Field
          label={`รหัสหลักสูตร ${mode === 'create' ? '*' : ''}`}
          hint={
            mode === 'edit'
              ? 'แก้ไขไม่ได้หลังจากสร้างแล้ว — ใช้เป็น URL slug + key อ้างอิงอื่นๆ'
              : 'ตัวพิมพ์ใหญ่ + ขีดกลาง เช่น "POWER-BI-PQ"'
          }
        >
          <input
            required={mode === 'create'}
            readOnly={mode === 'edit'}
            type="text"
            name="course_id"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value.toUpperCase())}
            placeholder="POWER-BI-PQ"
            className={
              inputCls +
              ' font-mono text-xs' +
              (mode === 'edit' ? ' cursor-not-allowed opacity-70' : '')
            }
            aria-invalid={fieldError ? 'true' : undefined}
          />
        {fieldError && (
            <p role="alert" className="mt-1 text-xs font-medium text-red-600">
              {fieldError}
            </p>
          )}
          {/* WHERE THE QUESTION IS ASKED, ANSWERED. The field says the code
              cannot be edited and, until now, stopped there — leaving "then how
              do I change it" to be answered by asking the tech lead. This links
              to the DRY RUN, which writes nothing and offers no rename control;
              a rename is a two-phase migration and deliberately does not belong
              on this form. */}
          {mode === 'edit' && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              ต้องเปลี่ยนรหัส?{' '}
              {/* CARRIES THE CODE, so the admin who was just looking at this
                  course does not have to find it again on the next screen. The
                  code and not the _id: the picker there is keyed on course_id
                  and the preview action takes a code. */}
              <Link
                href={`/admin/courses/rename?course=${encodeURIComponent(courseId)}`}
                className="font-semibold text-9e-action hover:underline"
              >
                ตรวจสอบผลกระทบก่อน
              </Link>
            </p>
          )}
          </Field>

        <Field
          label="คำอธิบายสั้น"
          hint="สูงสุด 800 ตัวอักษร — ใช้สำหรับ card / SEO และเป็นเนื้อหาบนหน้าคอร์ส"
        >
          {/*
            800, RAISED FROM 200, AND THE OLD NUMBER WAS THE ODD ONE OUT.

            The cap was genesis-side only: MSDB stores this field with no such
            limit, and measured 2026-08-31 across all 80 courses the stored
            values run 131 to 686 characters with a median of 336 — SEVENTY of
            the 80 already exceed 200. So the input was refusing copy that the
            data it edits is full of, and `maxLength` truncates a paste
            SILENTLY (the defect lib/articles/excerptStatus records): an admin
            pasting a 400-character teaser back into this box lost half of it
            with no message.

            800 is above the measured maximum with room, rather than unbounded —
            the field still feeds a card and an SEO snippet, so it should not
            become a body field by accident.

            NOT CHANGED, deliberately: the two DISPLAY clamps downstream. The
            meta description takes slice(0, 160) ([...slug]/page.jsx) and the
            JSON-LD description takes slice(0, 300) (buildCourseJsonLd). Those
            are about what those surfaces can show, not about what may be
            stored, and they already clamp the 70 courses that exceed 200
            today. A cap on input and a clamp on display are different
            concerns.

            There is no zod schema and no server-side validator for this field —
            checked, not assumed — so this attribute was the only limit and
            there is no second place to move.
          */}
          <textarea
            rows={2}
            maxLength={800}
            name="course_teaser"
            defaultValue={initial?.course_teaser ?? ''}
            className={inputCls}
          />
        </Field>

        {/*
          THE COURSE RICH BODY. Renders on the public page IN PLACE OF the
          plain teaser paragraph above when it is non-empty — not a second
          block, and not additive to "คำอธิบายสั้น". Controlled React state
          (markTouched'd like the gallery/topics), not a form input: the
          editor has no `name` attribute and never enters FormData.
        */}
        <Field
          label="คำอธิบายหลักสูตร"
          hint="แสดงแทนคำอธิบายสั้นด้านบนบนหน้าคอร์ส เมื่อมีการพิมพ์เนื้อหาที่นี่ — เว้นว่างไว้เพื่อใช้คำอธิบายสั้นตามเดิม"
          plain
        >
          {/*
            KEYED ON THE COURSE, NOT RE-SEEDED BY PROP COMPARISON. This
            editor owns a live document a value-vs-value check cannot safely
            reconcile against (see CourseBodyEditor.jsx's own header for the
            data-loss bug that shape caused). A genuine external change — a
            different course's rich body loading — is handled by React
            fully remounting the editor, the same guarantee every other
            rail field already assumes by seeding once from `extension` on
            mount.
          */}
          <CourseBodyEditor
            key={initial?.course_id ?? 'create'}
            value={descriptionRich}
            onChange={markTouched(setDescriptionRich)}
          />
        </Field>
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 2 — สื่อ เวลา ราคา & ลำดับ
      ─────────────────────────────────────────────────────────── */}
      <Section title="2. สื่อ เวลา ราคา และลำดับ">
        <ImageUploadField
          name="course_cover_url"
          currentUrl={initial?.course_cover_url ?? ''}
          folder="courses/covers"
          label="รูปปกหลักสูตร"
          hint="แนะนำ 800×450px (16:9) · JPG/WebP · ไม่เกิน 5MB"
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="จำนวนวันอบรม">
            <input
              type="number"
              min="0"
              step="0.5"
              name="course_trainingdays"
              defaultValue={initial?.course_trainingdays ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label="จำนวนชั่วโมง">
            <input
              type="number"
              min="0"
              step="1"
              name="course_traininghours"
              defaultValue={initial?.course_traininghours ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label="ระดับ">
            <select
              name="course_levels"
              defaultValue={String(initial?.course_levels ?? '1')}
              className={inputCls}
            >
              {COURSE_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </Field>

          <Field label="ราคา">
            <input
              type="number"
              min="0"
              step="1"
              name="course_price"
              defaultValue={initial?.course_price ?? ''}
              className={inputCls}
            />
          </Field>
          <Field
            label="ราคาสุทธิ"
            hint="ราคาหลังหักส่วนลด — เว้นว่างถ้าเท่ากับ course_price"
          >
            <input
              type="number"
              min="0"
              step="1"
              name="course_netprice"
              defaultValue={initial?.course_netprice ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label="ลำดับแสดงผล">
            <input
              type="number"
              step="1"
              name="sort_order"
              defaultValue={initial?.sort_order ?? 0}
              className={inputCls}
            />
          </Field>
        </div>

        <Field
          label="หลักสูตรก่อนหน้า"
          hint="เลือกหลักสูตรที่เป็นพื้นฐานก่อน — ใช้ใน roadmap"
        >
          {/* Was a 77-option <select>. The picker keeps a hidden named input in
              the DOM so `new FormData(form)` still sees this field, and
              dispatches a real bubbling `change` so the unsaved-changes guard
              still fires — see CourseSearchSelect's header for both. */}
          <CourseSearchSelect
            name="previous_course"
            label="หลักสูตรก่อนหน้า"
            value={previousCourse}
            onChange={setPreviousCourse}
            options={allCourses}
            excludeCode={initial?.course_id}
            inputClassName={inputCls}
          />
        </Field>
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 3 — รูปแบบคอร์ส (checkboxes)
      ─────────────────────────────────────────────────────────── */}
      <Section title="3. รูปแบบคอร์ส">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <CheckboxField
            name="course_type_public"
            label="Public (เผยแพร่บนเว็บ)"
            defaultChecked={initial ? initial.course_type_public !== false : true}
          />
          <CheckboxField
            name="course_type_inhouse"
            label="In-house (รับจัดในองค์กร)"
            defaultChecked={Boolean(initial?.course_type_inhouse)}
          />
          <CheckboxField
            name="course_workshop_status"
            label="Workshop"
            defaultChecked={Boolean(initial?.course_workshop_status)}
          />
          <CheckboxField
            name="course_certificate_status"
            label="มอบใบรับรอง (Certificate)"
            defaultChecked={Boolean(initial?.course_certificate_status)}
          />
          <CheckboxField
            name="course_promote_status"
            label="โปรโมตเป็นพิเศษ"
            defaultChecked={Boolean(initial?.course_promote_status)}
          />
        </div>
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 4 — โปรแกรม & สกิล
      ─────────────────────────────────────────────────────────── */}
      <Section title="4. โปรแกรม และ Skills">
        {/* REQUIRED, and enforced here because it cannot be enforced upstream:
            MSDB's `program` path is a plain optional ObjectId. A course with no
            program disappears from the mega menu, the /schedule grouping and
            all-courses simultaneously, and the payload deliberately omits an
            empty value (see shapePayload) so a cleared dropdown would silently
            keep the old program instead of reporting anything. `required` turns
            that silent no-op into the browser refusing to submit. */}
        <Field label="โปรแกรม" hint="จำเป็นต้องเลือก">
          <select
            name="program"
            defaultValue={programId}
            required
            className={inputCls}
          >
            <option value="">— เลือกโปรแกรม —</option>
            {programs.map((p) => (
              <option key={p._id ?? p.program_id} value={p._id ?? p.program_id}>
                {p.name ?? p.program_name ?? p.label ?? p._id}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Skills" hint="กดเลือกหลายค่าได้">
          <div className="flex flex-wrap gap-1.5">
            {skills.length === 0 && (
              <span className="text-xs text-9e-slate-dp-50">
                โหลด skills ไม่ได้
              </span>
            )}
            {skills.map((s) => {
              const id = String(s._id ?? s.skill_id ?? '');
              if (!id) return null;
              const active = selectedSkillIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSkill(id)}
                  className={
                    'rounded-full px-3 py-1 text-xs transition-colors ' +
                    (active
                      ? 'bg-9e-action text-white'
                      : 'border border-[var(--surface-border)] bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
                  }
                >
                  {s.name ?? s.skill_name ?? id}
                </button>
              );
            })}
          </div>
          {selectedSkillIds.map((id) => (
            <input key={id} type="hidden" name="skills" value={id} />
          ))}
        </Field>
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 5 — Related courses (max 5)
      ─────────────────────────────────────────────────────────── */}
      <Section
        title={`5. ${COURSE_SECTION_LABELS.related}`}
        hint="พิมพ์เพื่อค้นหา แล้วคลิกเพื่อเพิ่ม (สูงสุด 5 หลักสูตร)"
      >
        {relatedCodes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {relatedCodes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full bg-9e-action px-3 py-0.5 text-xs text-white"
              >
                <span className="font-mono">{code}</span>
                <span className="opacity-80">·</span>
                <span>{codeToName.get(code) || code}</span>
                <button
                  type="button"
                  onClick={() => dropRelated(code)}
                  aria-label="ลบ"
                  className="ml-1 rounded-full hover:bg-white/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {relatedCodes.length < 5 && (
          <div className="relative">
            <input
              type="text"
              value={relatedQuery}
              onChange={(e) => setRelatedQuery(e.target.value)}
              placeholder="พิมพ์เพื่อค้นหา course_id หรือชื่อ"
              className={inputCls}
            />
            {relatedQuery && relatedOptions.length > 0 && (
              <ul className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-auto rounded-9e-md border border-[var(--surface-border)] bg-white shadow-lg dark:bg-[#0D1B2A]">
                {relatedOptions.map((c) => (
                  <li key={c.course_id}>
                    <button
                      type="button"
                      onClick={() => pickRelated(c.course_id)}
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-9e-ice dark:hover:bg-[#111d2c]"
                    >
                      <span className="font-mono text-9e-action">
                        {c.course_id}
                      </span>{' '}
                      <span className="text-9e-navy dark:text-white">
                        {c.course_name_th || c.course_name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {relatedCodes.map((code) => (
          <input key={code} type="hidden" name="related_courses" value={code} />
        ))}
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 6 — รายละเอียดคอร์ส
      ─────────────────────────────────────────────────────────── */}
      <Section title="6. รายละเอียดคอร์ส">
        {/*
          EACH FIELD BELOW IS NOW TWO CONTROLS, NOT ONE — THE PLAIN LIST STAYS
          FIRST-CLASS, THE RICH EDITOR SITS ALONGSIDE IT.

          The textarea keeps editing the real MSDB string[] field exactly as
          before — same `name`, same `linesOf` split on submit, no migration,
          no backfill. `marker` and the preview box it drew are GONE (see
          BulletTextarea.jsx's own `showCount` note): a WYSIWYG editor sitting
          right below a hand-drawn preview of the SAME content was two views
          of one thing, and the real preview is the public page.

          The `CourseBodyEditor` beside it is a second, genesis-owned field —
          `objectivesRich` / `targetAudienceRich` / `prerequisitesRich` /
          `systemRequirementsRich` on CourseExtension, the exact
          `descriptionRich` pattern (seed once, controlled state, named on
          every save so clearing it actually clears the stored value). When it
          holds real content the public page renders it INSTEAD OF the plain
          list; when empty, the plain list is what renders — see
          CourseObjectives.jsx (and its three siblings) for the swap. The two
          controls are independent: leaving one field's rich body empty does
          not affect the other three, and does not touch this field's own
          plain list.

          `plain` on every one of these four `Field`s is NOT optional — see
          the `Field` component's own header and test/fs/
          fieldLabelForwardGuard.test.mjs. `CourseBodyEditor`'s toolbar
          renders real `<button>`s ahead of its contenteditable region; an
          implicit `<label>` here would forward a plain click on editor TEXT
          to the first one (Undo) exactly the way it did for the section-1
          rich body before that was fixed.
        */}
        <BulletTextarea
          name="course_objectives"
          label={COURSE_SECTION_LABELS.objective}
          hint="แต่ละบรรทัดคือหนึ่งวัตถุประสงค์ — หน้าเว็บจะใส่ลำดับให้เอง ไม่ต้องพิมพ์เลข"
          defaultValue={initial?.course_objectives}
          showCount={false}
        />
        <Field
          label={`${COURSE_SECTION_LABELS.objective} (รูปแบบ Rich text)`}
          hint="แสดงแทนรายการด้านบนบนหน้าเว็บ เมื่อมีการพิมพ์เนื้อหาที่นี่ — เว้นว่างไว้เพื่อใช้รายการตามเดิม"
          plain
        >
          <CourseBodyEditor
            key={initial?.course_id ?? 'create'}
            value={objectivesRich}
            onChange={markTouched(setObjectivesRich)}
          />
        </Field>

        <BulletTextarea
          name="course_target_audience"
          label={COURSE_SECTION_LABELS.target}
          hint="แสดงเป็นรายการติ๊กถูกบนหน้าเว็บ — ไม่ต้องพิมพ์เครื่องหมายนำหน้า"
          defaultValue={initial?.course_target_audience}
          showCount={false}
        />
        <Field
          label={`${COURSE_SECTION_LABELS.target} (รูปแบบ Rich text)`}
          hint="แสดงแทนรายการด้านบนบนหน้าเว็บ เมื่อมีการพิมพ์เนื้อหาที่นี่ — เว้นว่างไว้เพื่อใช้รายการตามเดิม"
          plain
        >
          <CourseBodyEditor
            key={initial?.course_id ?? 'create'}
            value={targetAudienceRich}
            onChange={markTouched(setTargetAudienceRich)}
          />
        </Field>

        <BulletTextarea
          name="course_prerequisites"
          label={COURSE_SECTION_LABELS.prerequisite}
          hint="แสดงเป็นรายการติ๊กถูกบนหน้าเว็บ — ไม่ต้องพิมพ์เครื่องหมายนำหน้า"
          defaultValue={initial?.course_prerequisites}
          showCount={false}
        />
        <Field
          label={`${COURSE_SECTION_LABELS.prerequisite} (รูปแบบ Rich text)`}
          hint="แสดงแทนรายการด้านบนบนหน้าเว็บ เมื่อมีการพิมพ์เนื้อหาที่นี่ — เว้นว่างไว้เพื่อใช้รายการตามเดิม"
          plain
        >
          <CourseBodyEditor
            key={initial?.course_id ?? 'create'}
            value={prerequisitesRich}
            onChange={markTouched(setPrerequisitesRich)}
          />
        </Field>

        <BulletTextarea
          name="course_system_requirements"
          label={COURSE_SECTION_LABELS.requirement}
          hint="แสดงเป็นรายการติ๊กถูกบนหน้าเว็บ — ไม่ต้องพิมพ์เครื่องหมายนำหน้า"
          defaultValue={initial?.course_system_requirements}
          showCount={false}
        />
        <Field
          label={`${COURSE_SECTION_LABELS.requirement} (รูปแบบ Rich text)`}
          hint="แสดงแทนรายการด้านบนบนหน้าเว็บ เมื่อมีการพิมพ์เนื้อหาที่นี่ — เว้นว่างไว้เพื่อใช้รายการตามเดิม"
          plain
        >
          <CourseBodyEditor
            key={initial?.course_id ?? 'create'}
            value={systemRequirementsRich}
            onChange={markTouched(setSystemRequirementsRich)}
          />
        </Field>
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 7 — Training Topics
      ─────────────────────────────────────────────────────────── */}
      <Section
        title={`7. ${COURSE_SECTION_LABELS.outline}`}
        hint="แต่ละหัวข้อหลักมีหัวข้อย่อยได้หลายอัน — จัดรูปแบบและซ้อนได้สูงสุด 3 ระดับ · ชื่อหัวข้อหลักเป็นข้อความธรรมดา (MSDB เป็นเจ้าของ)"
      >
        <TrainingTopicsEditor
          name="training_topics"
          initialTopics={topicSeed.rows}
          staleWarning={topicSeed.warning}
          onRowsChange={setTrainingTopicsRich}
        />
      </Section>

      {/* ───────────────────────────────────────────────────────────
          Section 7b — Course outline PDFs (TH / EN)
      ─────────────────────────────────────────────────────────── */}
      <Section
        title="7b. ไฟล์หลักสูตร (Course Outline PDF)"
        hint="อัปโหลดแยกภาษา ไทย/อังกฤษ — ชื่อไฟล์สร้างจาก course_id อัตโนมัติ, อัปโหลดซ้ำจะแทนที่ไฟล์เดิมที่ URL เดิม"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <CourseOutlineUpload
            lang="th"
            courseId={courseId}
            label="ภาษาไทย (TH)"
            initialPath={initial?.course_outline_th?.download_url ?? ''}
          />
          <CourseOutlineUpload
            lang="en"
            courseId={courseId}
            label="ภาษาอังกฤษ (EN)"
            initialPath={initial?.course_outline_en?.download_url ?? ''}
          />
        </div>
      </Section>

      {/* SECTION 8 IS GONE ENTIRELY. It held five URL arrays; four were retired
          in 2bdb6e1 and `website_urls` — the last one — is retired here.

          THE DATA IS NOT DELETED. shapePayload no longer emits any of the five,
          so MSDB's unfiltered `findByIdAndUpdate` never sees those keys and
          leaves the stored arrays exactly as they are. Removing an input while
          LEAVING its payload line would have been the wipe: `linesOf` returns
          `[]` for a missing key, and 74 of 77 courses carry a website_urls URL.

          What is lost is editing it from genesis admin; MSDB's own admin still
          can. Both public readers keep working off the stored values —
          ArticleDetailClient.jsx:712 (related-course card hrefs) and
          career-paths.js:286 (curriculum publicUrl).

          NOT the course outline: course_outline_th / course_outline_en are a
          different field with their own uploader in section 7, unaffected. */}
    </>
  );

  // ── THE SHELL — both modes ────────────────────────────────────────
  /**
   * Preview opens the REAL public URL. `?preview=1` is appended when the course
   * is hidden, because that URL now 404s for everyone — including this admin,
   * who by default sees the same site a visitor does. Previewing is something
   * you ask for, on one URL, rather than a state you are permanently in.
   *
   * The parameter is not a credential and grants nothing on its own; the server
   * gate is the admin session (see resolveHiddenCourseForAdmin in the catch-all
   * route). It is appended off the FORM's `isPublished` — the admin's intent,
   * possibly unsaved — which is safe in both directions: the parameter is inert
   * on a published course, and the preview arm serves a published one too. So
   * neither an unsaved toggle nor a stale one produces a broken link.
   */
  const previewPath = urlAlias.trim()
    ? `/${urlAlias.trim().replace(/^\//, '')}`
    : `/${String(courseId ?? '').toLowerCase()}-training-course`;
  const previewHref = isPublished ? previewPath : `${previewPath}?preview=1`;

  return (
    /* h-[100dvh] + an inner scroll, NOT `position: sticky`. The header stays
       reachable because the PAGE never scrolls — the columns do — which is the
       shape the article editor already uses. A sticky header inside a scrolling
       document still scrolls away on a short viewport, and the publish control
       being reachable without scrolling is the point of this layout. */
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex h-[100dvh] flex-col bg-9e-ice/30 dark:bg-[#0D1B2A]/40"
    >
      <UnsavedChangesDialog
        open={pendingHref !== null}
        onLeave={leaveWithoutSaving}
        onStay={() => setPendingHref(null)}
      />
      <header className="flex-shrink-0 border-b border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <Link
            href={withListQuery('/admin/courses', listQuery)}
            className="inline-flex items-center gap-1 text-sm text-9e-action hover:underline"
          >
            <ChevronLeft className="h-4 w-4" /> รายการหลักสูตร
          </Link>

          <div className="mx-auto min-w-0 flex-1 px-4">
            <p className="truncate text-center text-sm font-semibold text-9e-navy dark:text-white">
              {initial?.course_name || (isCreate ? 'สร้างหลักสูตรใหม่' : 'แก้ไขหลักสูตร')}
            </p>
          </div>

          <span
            className={
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
              (isPublished
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-gray-200 bg-gray-50 text-gray-600')
            }
          >
            {isPublished ? 'เผยแพร่' : 'ซ่อน'}
          </span>

          {/* SUCCESS, IN THE HEADER — the save button is here, so the answer to
              pressing it must be here too. A banner at the bottom of a scrolling
              column is a success message the admin never sees.

              Gated on `!dirty` rather than cleared on a timer: the moment the
              form is edited again this is no longer true, and a "บันทึกสำเร็จ"
              sitting above unsaved edits is worse than no message at all. */}
          {savedAt !== null && !dirty && (
            <span
              role="status"
              className="text-sm font-medium text-green-600 dark:text-green-400"
            >
              ✓ บันทึกสำเร็จ
            </span>
          )}

          {/* Both of the next two need a course that EXISTS UPSTREAM, so they
              are hidden while creating: the promos/FAQ page is keyed by a code
              that has not been saved yet, and ดูหน้าจริง would open the public
              URL of a course that is not there. Rendering either would be a
              link that 404s by construction. They appear on the edit page the
              create flow redirects to. */}
          {!isCreate && (
          <>
          {/* The four editors that stayed on /admin/courses/[courseId]. The
              list's SEO/Gallery button is gone, so this is now their only way
              in — without it they would be unreachable, not merely moved. */}
          <Link
            // Keyed by the course_id CODE, unlike this page's own _id route —
            // and carrying the filter one hop further so that page's ← back to
            // this editor lands on the right list too.
            href={withListQuery(`/admin/courses/${encodeURIComponent(courseId)}`, listQuery)}
            className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
          >
            โปรโมชัน / Early Bird / FAQ / ชำระเงิน
          </Link>

          {/* R1: NOT "Preview" — this opens the PUBLIC page, which reads MSDB
              fresh and therefore shows only whatever the last successful save
              wrote, never edits still sitting in this form's uncontrolled
              inputs. Renamed so the label stops promising something it cannot
              do; title/tooltip repeats it for anyone who does not read the
              button text. When the form is dirty this would silently open the
              PRE-edit page with no indication anything is stale, so it warns
              first instead — see "บันทึกแล้วดูหน้าจริง" below for the save-first
              path. */}
          <a
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            title="แสดงเฉพาะเนื้อหาที่บันทึกล่าสุด ไม่รวมการแก้ไขที่ยังไม่ได้บันทึก"
            onClick={(e) => {
              if (
                dirty
                && !window.confirm(
                  'หน้านี้แสดงเฉพาะเนื้อหาที่บันทึกล่าสุด ไม่รวมการแก้ไขที่ยังไม่ได้บันทึก '
                  + 'ต้องการเปิดดูหน้าเดิม (ก่อนแก้ไขล่าสุด) หรือไม่?'
                )
              ) {
                e.preventDefault();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
          >
            <Eye className="h-4 w-4" /> ดูหน้าจริง
          </a>

          {/* R2: revealed ONLY after a "บันทึกแล้วดูหน้าจริง" submit reaches
              courseSaveOutcome's allOk — never on a partial save, and never
              via a scripted window.open() (see the R1 note in handleSubmit).
              Gated on `!dirty` too, the same way "✓ บันทึกสำเร็จ" above is: the
              moment the admin edits again this page would be stale exactly
              like ดูหน้าจริง, and re-deriving that from `previewReady` alone
              would leave it claiming freshness it no longer has. */}
          {previewReady && !dirty && (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-9e-md border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 dark:border-green-700 dark:bg-green-950/40 dark:text-green-300 dark:hover:bg-green-950/70"
            >
              <ExternalLink className="h-4 w-4" /> เปิดหน้าจริง
            </a>
          )}
          </>
          )}

          {/* THE PUBLISH CONTROL — in the header, never behind a scroll. */}
          <div className="flex items-center gap-2 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5">
            <span className="text-xs text-gray-500 dark:text-[#94a3b8]">เผยแพร่</span>
            <button
              type="button"
              role="switch"
              aria-checked={isPublished}
              aria-label="เผยแพร่บนเว็บสาธารณะ"
              onClick={() => setIsPublished((v) => !v)}
              className={
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ' +
                (isPublished ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600')
              }
            >
              <span
                className={
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ' +
                  (isPublished ? 'translate-x-4' : 'translate-x-1')
                }
              />
            </button>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="rounded-9e-md bg-9e-action px-4 py-1.5 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
          >
            {pending
              ? 'กำลังบันทึก…'
              : createdCourse
                ? 'ลองบันทึก SEO / แกลเลอรีอีกครั้ง'
                : isCreate
                  ? 'สร้างหลักสูตร'
                  : 'บันทึก'}
          </button>

          {/* R1: "save then view" — needs a course that EXISTS UPSTREAM
              already, same reason ดูหน้าจริง itself is hidden while creating.
              `data-intent` is how handleSubmit tells this submit apart from
              the plain "บันทึก" one — see its `wantsPreviewAfterSave` read. */}
          {!isCreate && (
            <button
              type="submit"
              data-intent="save-and-preview"
              disabled={pending}
              className="rounded-9e-md border border-9e-action px-4 py-1.5 text-sm font-bold text-9e-action hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
            >
              {pending ? 'กำลังบันทึก…' : 'บันทึกแล้วดูหน้าจริง'}
            </button>
          )}
        </div>
      </header>

      {/* PARTIAL-FAILURE REPORT — names the half that failed, in Thai. Rendered
          only when at least one half failed; a both-succeeded save navigates
          away and never reaches here, so "success" cannot be shown for a
          half-landed write. */}
      {saveReport && (
        <div
          role="alert"
          className="flex-shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900"
        >
          <p className="font-bold">
            {saveReport.courseOk || saveReport.extOk
              ? 'บันทึกสำเร็จเพียงบางส่วน — ข้อมูลที่กรอกไว้ยังอยู่ กรุณากดบันทึกอีกครั้ง'
              : 'บันทึกไม่สำเร็จทั้งสองส่วน — ข้อมูลที่กรอกไว้ยังอยู่ กรุณากดบันทึกอีกครั้ง'}
          </p>
          <p>
            {saveReport.courseOk
              ? '✓ ข้อมูลหลักสูตร (MSDB): บันทึกแล้ว'
              : `✗ ข้อมูลหลักสูตร (MSDB): ไม่สำเร็จ${saveReport.courseError ? ` — ${saveReport.courseError}` : ''}`}
          </p>
          <p>
            {saveReport.extOk
              ? '✓ SEO / URL / Gallery: บันทึกแล้ว'
              : `✗ SEO / URL / Gallery: ไม่สำเร็จ${saveReport.extError ? ` — ${saveReport.extError}` : ''}`}
          </p>
          {createdCourse && (
            <p className="mt-1">
              หลักสูตรถูกสร้างแล้ว (รหัส {createdCourse.code}) — กดปุ่มด้านบนเพื่อลองบันทึก
              SEO/แกลเลอรีอีกครั้ง หรือ{' '}
              <Link
                href={withListQuery(
                  createdCourse.id
                    ? `/admin/courses/${encodeURIComponent(createdCourse.id)}/edit`
                    : '/admin/courses',
                  listQuery
                )}
                className="font-bold underline"
              >
                เปิดหน้าแก้ไขหลักสูตรนี้
              </Link>
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="flex-shrink-0 border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* LEFT COLUMN — scrolls. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* The ONLY tabbed region. */}
          <div className="mb-5 flex gap-2 border-b border-[var(--surface-border)]">
            <button
              type="button"
              onClick={() => setActiveTab(TAB.CONTENT)}
              className={
                'border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
                (activeTab === TAB.CONTENT
                  ? 'border-9e-action text-9e-action'
                  : 'border-transparent text-[var(--text-secondary)]')
              }
            >
              เนื้อหาหลักสูตร
            </button>
            <button
              type="button"
              onClick={() => setActiveTab(TAB.GALLERY)}
              className={
                'border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
                (activeTab === TAB.GALLERY
                  ? 'border-9e-action text-9e-action'
                  : 'border-transparent text-[var(--text-secondary)]')
              }
            >
              Gallery ({gallery.length})
            </button>
            {/* EDIT ONLY. A course being created has no history yet and no code
                to key one by, so the tab would open on a guaranteed empty state
                whose explanation ("history starts at deploy") would be the
                wrong one. */}
            {!isCreate && (
              <button
                type="button"
                onClick={() => setActiveTab(TAB.HISTORY)}
                className={
                  'border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
                  (activeTab === TAB.HISTORY
                    ? 'border-9e-action text-9e-action'
                    : 'border-transparent text-[var(--text-secondary)]')
                }
              >
                ประวัติการแก้ไข
              </button>
            )}
          </div>

          {/* HIDDEN, NOT UNMOUNTED, AND NOW ACROSS THREE PANELS RATHER THAN TWO.
              `FormData(form)` reads the DOM, so conditionally rendering this
              away would drop every course field from the payload while another
              tab happened to be open — shapePayload would then send empty
              strings and zeroes for the whole course body. `hidden` keeps the
              inputs submitted.

              The dirty check reads the SAME DOM (courseEditorSignature is built
              from `[...new FormData(formRef.current)]`), so an unmounted body
              would also blind the unsaved-changes guard. Both failure modes are
              silent — nothing throws and the screen looks correct.

              `panelClass` is used rather than an inline ternary so there is no
              branch here that can produce an absent element at all. */}
          <div className={panelClass(TAB.CONTENT, activeTab, 'space-y-6')}>{bodySections}</div>

          {/* The gallery is extension state, not form inputs, so unmounting it
              is harmless — but it is symmetric with the above for clarity. */}
          <div className={panelClass(TAB.GALLERY, activeTab)}>
            <CourseGalleryEditor gallery={gallery} onChange={markTouched(setGallery)} />
          </div>

          {/* Same rule as its two siblings: MOUNTED, hidden by CSS. It reads
              nothing from the form and writes nothing anywhere, so mounting it
              is free — and keeping the three panels symmetric is what stops the
              next edit here from reintroducing a conditional render.

              `active` rather than a mount effect is what makes it lazy: the
              panel exists from the first paint, so being mounted says nothing
              about whether the admin opened the tab. The fetch fires on the
              first transition into it and never on page load. */}
          <div className={panelClass(TAB.HISTORY, activeTab)}>
            {!isCreate && (
              <CourseVersionHistory
                courseId={courseId}
                active={activeTab === TAB.HISTORY}
              />
            )}
          </div>
        </div>

        {/* RIGHT RAIL — sticky by construction: the page does not scroll. */}
        <aside className="w-80 flex-shrink-0 space-y-5 overflow-y-auto border-l border-[var(--surface-border)] bg-white p-4 dark:bg-[#111d2c]">
          <CourseSeoRail
            courseId={courseId}
            courseName={initial?.course_name ?? ''}
            urlAlias={urlAlias}
            onUrlAlias={markTouched(setUrlAlias)}
            aliasError={aliasError}
            metaTitle={metaTitle}
            onMetaTitle={markTouched(setMetaTitle)}
            metaDescription={metaDescription}
            onMetaDescription={markTouched(setMetaDescription)}
            ogImage={ogImage}
            onOgImage={markTouched(setOgImage)}
            tags={tags}
            onTags={markTouched(setTags)}
            isPublished={isPublished}
            onIsPublished={markTouched(setIsPublished)}
          />
        </aside>
      </div>
    </form>
  );
}

// ── shared bits ─────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:border-9e-action focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';

function Section({ title, hint, children }) {
  return (
    <section className="space-y-4 rounded-9e-lg border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]">
      <div>
        <h2 className="text-base font-bold text-9e-navy dark:text-white">{title}</h2>
        {hint && (
          <p className="mt-0.5 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * `plain` renders a `<div>` instead of an implicit `<label>`.
 *
 * THE DEFAULT `<label>` IS ONLY SAFE AROUND A SINGLE FORM CONTROL. An
 * implicit label (no `for`) forwards a click ANYWHERE inside it — including
 * on a click target that is not itself interactive — to the label's
 * "labeled control": per the HTML label-activation algorithm, the FIRST
 * labelable descendant in tree order (button, input, select, textarea,
 * etc). That is exactly what made the course rich-body editor "revert on
 * click": CourseBodyEditor's toolbar renders real `<button>`s (Undo first)
 * ahead of its contenteditable region, and a contenteditable `<div>` is not
 * itself labelable — so a plain click on editor TEXT was forwarded to the
 * Undo button, which ran `editor.chain().focus().undo().run()`. Confirmed
 * in a real headless-Chrome click (`test/browser/labelForwardRepro.mjs`,
 * reproducing this exact toolbar-button + contenteditable shape): the click
 * landed focus and a synthetic activation on the first button, not on the
 * editor. ProseMirror's undo then selects the reverted range, which is the
 * "line highlighted after a plain click" the report described.
 *
 * A `Field` wrapping a single `<input>`/`<textarea>`/`<select>` has no such
 * hazard — those ARE the first (and only) labelable descendant, so a click
 * anywhere in the label already lands on them; that behaviour (click the
 * label text, focus the field) stays the default. `plain` opts a Field out
 * only where its children own further interactive controls of their own.
 */
function Field({ label, hint, children, plain = false }) {
  const Tag = plain ? 'div' : 'label';
  return (
    <Tag className="block">
      <span className="block text-sm font-medium text-9e-navy dark:text-white">
        {label}
      </span>
      {hint && (
        <span className="mt-0.5 block text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {hint}
        </span>
      )}
      <div className="mt-1">{children}</div>
    </Tag>
  );
}

function CheckboxField({ name, label, defaultChecked }) {
  return (
    <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}
