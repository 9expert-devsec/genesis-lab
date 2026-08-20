/**
 * The executable half of the admin audit contract.
 *
 * ── WHAT THIS MODULE IS ─────────────────────────────────────────────────────
 * The vocabulary of `(menu, entity)` pairs the audit trail is allowed to
 * contain, plus the three facts about each pair that something at RUNTIME
 * consumes:
 *
 *   · the pair set itself — a future guard checks `recordAdminAction` calls
 *     against it. `entity` is free-form in the schema (AdminAuditLog.js), by
 *     design, so nothing today stops a typo. A typo'd entity is not a loud
 *     failure: the row is written, looks fine in the central list, and is
 *     permanently invisible to the inline `RecordHistory` widget, which
 *     queries `{menu, entity, recordId}`. This set is what makes that
 *     checkable.
 *   · a Thai label for the entity — the reading surface renders it. Menu
 *     labels are NOT here: they already exist in ADMIN_PAGES and a second copy
 *     is how the pin/position mismatch happened. `entity` has no label source
 *     anywhere else, which is the only reason labels appear in this file.
 *   · the diff policy — the ceiling on what a row's `before`/`after` may hold.
 *     This is §5.2's PII carve-out made executable: `registrations|public` is
 *     capped at `status_only`, so a full diff of a customer's phone number is
 *     a contract violation a guard can catch rather than a review comment
 *     someone might make.
 *
 * plus one menu-level flag, `dualKeySpace` — see COURSES below.
 *
 * ── WHAT THIS MODULE DELIBERATELY DOES NOT HOLD, AND WHY ────────────────────
 * The `recordId` and `recordLabel` conventions — "Mongo `_id`", "upstream
 * `promotion_id`", "the slugified role key" — stay in docs/admin-audit-log-plan.md
 * §8.7 and do not come in here.
 *
 * They are instructions for a human performing the sweep. Nothing executes
 * them. A string in code that nothing executes cannot be kept true by
 * anything: it survives every refactor, it is quoted with confidence because
 * it lives in `src/`, and it is wrong the first time an action changes shape.
 * This repo has been bitten by authoritative-looking-and-wrong artifacts more
 * than once — §7 of that same doc justified a design decision with a UI that
 * did not exist. A doc that is wrong is a doc; a module that is wrong is a
 * dependency.
 *
 * So: the doc is the instructions, this module is the data. If you want to
 * know what `recordId` should hold for `promotions`, read §8.7. If you want to
 * know whether `promotions|page_link` is a legal pair, read this file.
 *
 * Also not here: the call-site inventory. Which actions exist, and whether
 * each one has been instrumented yet, is the coverage guard's job and it can
 * only run after the sweep.
 *
 * ── PURITY ──────────────────────────────────────────────────────────────────
 * No mongoose, no `auth`, no server-only anything. The reading surface needs
 * it on both sides of the network boundary and the tests need it with no
 * connection. `ALL_PAGE_KEYS` is imported rather than restated for the same
 * reason MENU_ENUM derives from it: one registry, not two.
 */

import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';

/**
 * The closed set of diff policies, least to most permissive.
 *
 * A policy is a CEILING on `before`/`after`, not a description of every row.
 * A pair capped at `status_only` may still emit an `act_only` row (a delete
 * records the act and the id, §5.2) — it may never emit a full field diff.
 *
 *   act_only     — `before`/`after` are null. The row is WHO/WHAT/WHEN only.
 *   count_only   — `before`/`after` are null; a count belongs in `meta`.
 *   status_only  — `before`/`after` carry a short status enum and nothing else.
 *   full         — `before`/`after` carry a field diff (still size-capped by
 *                  the writer's MAX_PAYLOAD_CHARS).
 *
 * `meta` is outside this scale entirely: it is already bounded by the writer
 * and holds structured extras that are not a field diff, so every policy
 * permits it.
 */
export const DIFF_POLICY_RANK = Object.freeze({
  act_only:    0,
  count_only:  1,
  status_only: 2,
  full:        3,
});

/**
 * Ordering-only pairs. Off the scale above on purpose: a reorder rewrites a
 * set of rows and records `after: { orderedIds }`, which is neither a field
 * diff nor a status. Reserved for pairs whose ONLY action is an ordering — a
 * reorder of records that also get edited (portfolio logos, say) belongs to
 * that record's own pair, so its history stays in one series.
 */
export const ORDERED_IDS_POLICY = 'ordered_ids';

/**
 * ── THE REGISTRATION ROUND, PLUS THE STATUS. OFF THE SCALE, LIKE ordered_ids ─
 *
 * The registration pairs are capped at `status_only` because those collections
 * hold names, emails, phones and tax ids, and the audit trail is append-only and
 * presently forever. That cap is not being relaxed.
 *
 * But `updateRegistrationRound` records a BEFORE/AFTER of the four coupled round
 * fields, and that is a deliberate, argued exception: a round id, a date label
 * and the two enums `classroom|hybrid|online` and `classroom|teams` say nothing
 * about a person, while moving someone between rounds is the change on this
 * screen most worth tracing and most likely to be disputed.
 *
 * ── WHY A NEW POLICY AND NOT `full` ───────────────────────────────────────
 * A policy is a property of the (menu, entity) PAIR, not of one action, so
 * raising `registrations|public` to `full` would permit a field diff on
 * `updateRegistration` too — the action that edits the customer's name, email
 * and phone. That is precisely the thing the cap exists to prevent, and it would
 * have been relaxed as a side effect of an unrelated feature.
 *
 * So this policy is an ALLOWLIST OF FIELD NAMES. It permits `status` (so the
 * existing transition diff is unaffected) and the four round fields, and it
 * DROPS EVERYTHING ELSE — including anything a future action hands over by
 * mistake. The reduction is still fail-closed.
 */
export const ROUND_AND_STATUS_POLICY = 'round_and_status';

/**
 * The exact keys `round_and_status` lets through. Written here, beside the
 * policy, rather than imported from lib/registrations — the audit layer must not
 * depend on a product module for its own safety rule, or a refactor over there
 * silently widens what the trail may carry.
 *
 * ══ `attendeesCount` IS THE SECOND EXCEPTION, AND IT IS NOT AN INCONSISTENCY ══
 *
 * Round 8. Read this before "tidying" it out, exactly as the round fields' own
 * note asks — the whole hazard here is that a reader sees two carve-outs in a
 * PII allowlist, reads them as drift, and removes them together.
 *
 * The two tests this list applies are the same two the round fields passed:
 *
 *   1. IS IT PERSONAL DATA? No. A seat count is a small integer between 1 and
 *      50. It names nobody, and unlike a name, an email or a tax id it cannot be
 *      the subject of a deletion request — which is the property that made the
 *      cap necessary, since this trail is append-only and presently forever.
 *
 *   2. IS THE CHANGE WORTH TRACING? On a PAID registration it is among the most
 *      worth tracing events on the screen. The count drove the amount charged —
 *      `pricing.seats` is a frozen snapshot taken from it at charge time — so
 *      changing it afterwards makes the registration's own headcount disagree
 *      with the money that was taken for it. That disagreement is deliberate and
 *      permitted (see `updateAttendeesCountPaid`), which is exactly why it must
 *      leave a trace naming BOTH numbers. Without the diff the row would say
 *      "somebody changed the seat count" and the one fact anybody would ask for
 *      — from what, to what — would be gone.
 *
 * ── WHY THE POLICY IS STILL CALLED `round_and_status` ──────────────────────
 * Because the NAME is not the mechanism and renaming it mid-round would edit a
 * safety constant, its guard in fs/roundCouplingGate, and two pure tests, for a
 * cosmetic gain. THE ALLOWLIST IS THE MECHANISM and it is exact. The name is
 * stale and is recorded as such rather than quietly left to mislead; renaming it
 * is a clean follow-up, not a thing to do while adding an entry to it.
 *
 * The reduction stays fail-closed either way: a key not named here is dropped,
 * including one a future action hands over by mistake.
 */
export const ROUND_AND_STATUS_KEYS = Object.freeze([
  'status', 'classId', 'classDate', 'scheduleType', 'attendanceMode',
  'attendeesCount',
]);

/** Every legal value of the `diff` field. */
export const DIFF_POLICIES = Object.freeze([
  ...Object.keys(DIFF_POLICY_RANK),
  ORDERED_IDS_POLICY,
  ROUND_AND_STATUS_POLICY,
]);

/**
 * ── THE PAIR SET, AS AN ARRAY ───────────────────────────────────────────────
 *
 * An ARRAY of entries, not a nested object, and the lookup map below is derived
 * from it. That ordering is the point.
 *
 * A nested object literal makes a duplicate `(menu, entity)` pair
 * UNREPRESENTABLE: JS drops the earlier definition at parse time, so the
 * mistake silently deletes a contract entry and no runtime check can ever see
 * it — `new Set(keys).size === keys.length` is true by construction. The only
 * way to catch it would be an fs-tier scan of this file's own source text,
 * which is a guard about text rather than about data.
 *
 * As an array, a duplicate pair EXISTS. It is data, a pure test can count it,
 * and its control is appending a duplicate and watching the test redden. The
 * house rule is to make the wrong state impossible or, at minimum, visible; a
 * comment saying "this cannot be checked" is neither.
 *
 * Entries are grouped by menu for reading only — nothing depends on the order.
 */
const entry = (menu, entity, label, diff) => Object.freeze({ menu, entity, label, diff });

export const AUDIT_CONTRACT_ENTRIES = Object.freeze([
  // ── จัดการหลักสูตร ──────────────────────────────────────────────
  entry('featured_courses',            'featured_course',            'หลักสูตรแนะนำ', 'full'),
  entry('featured_online_courses',     'featured_online_course',     'คอร์สออนไลน์แนะนำ', 'full'),
  entry('nav_featured_online_courses', 'nav_featured_online_course', 'คอร์สออนไลน์ (Navbar)', 'full'),

  entry('courses', 'course',     'หลักสูตร', 'full'),
  entry('courses', 'extension',  'ข้อมูลเสริมหลักสูตร', 'full'),
  entry('courses', 'early_bird', 'ราคา Early Bird', 'full'),
  entry('courses', 'promo_link', 'ลิงก์โปรโมชั่นหลักสูตร', 'full'),
  // `menu` is the RESOLVED page key (pageKeyForType), so a FAQ edited under a
  // course is filed under `courses`. Without this pair a real row is rejected.
  entry('courses', 'local_faq',  'FAQ (เฉพาะหลักสูตร)', 'full'),
  /**
   * The order of COURSES INSIDE ONE PROGRAMME, dragged on /admin/courses.
   *
   * On the `courses` menu because that is the screen and therefore the
   * requireAdmin key — but note it keys on a programId, which is a THIRD key
   * space on a menu already documented as dual. See DUAL_KEY_SPACE_MENUS.
   */
  entry('courses', 'course_order', 'ลำดับหลักสูตรในโปรแกรม', ORDERED_IDS_POLICY),
  /**
   * A course-code rename. `full` because the payload IS the small thing —
   * `{ code }` before and after — while the twelve per-store counts belong in
   * `meta`, which is outside the diff scale entirely.
   *
   * recordId is the NEW code, so the row is findable from the course that
   * exists now; the old one lives in `meta.from`. That is the third key space
   * on this menu (see DUAL_KEY_SPACE_MENUS) and it is the RIGHT one: a reader
   * holding today's catalogue has the new code, not the retired one.
   */
  entry('courses', 'course_code', 'รหัสหลักสูตร', 'full'),

  entry('schedules',   'schedule',   'รอบอบรม', 'full'),
  entry('instructors', 'instructor', 'วิทยากร', 'full'),

  entry('programs', 'program',       'โปรแกรม', 'full'),
  entry('programs', 'skill',         'Skill', 'full'),
  // Separate collections (ProgramOrder / SkillOrder) whose only content IS the
  // ordering — hence ordered_ids rather than a reorder of `program`.
  entry('programs', 'program_order', 'ลำดับโปรแกรม', ORDERED_IDS_POLICY),
  entry('programs', 'skill_order',   'ลำดับ Skill', ORDERED_IDS_POLICY),
  // The order of PROGRAMMES INSIDE ONE SKILL — SkillOrder.programOrder. A
  // different question from `skill_order` (the order OF the skills), so a
  // different pair: sharing one would merge two series onto one record id.
  entry('programs', 'skill_program_order', 'ลำดับโปรแกรมใน Skill', ORDERED_IDS_POLICY),
  entry('programs', 'program_sync',  'ซิงก์โปรแกรมจาก API', 'count_only'),
  entry('programs', 'skill_sync',    'ซิงก์ Skill จาก API', 'count_only'),

  entry('career_paths', 'career_path',      'Career Path', 'full'),
  entry('career_paths', 'career_path_sync', 'ซิงก์ Career Path', 'count_only'),
  entry('career_paths', 'local_faq',        'FAQ (เฉพาะหลักสูตร)', 'full'),

  entry('masterclass', 'course',    'คอร์ส Masterclass', 'full'),
  entry('masterclass', 'batch',     'รุ่นอบรม', 'full'),
  entry('masterclass', 'local_faq', 'FAQ (เฉพาะหลักสูตร)', 'full'),

  // PII entity (§5.1). Status transitions only; attendee edits record a count
  // in `meta`, never the rows.
  entry('mc_registrations', 'registration', 'ผู้ลงทะเบียน Masterclass', 'status_only'),

  entry('tnhs_courses', 'tnhs_course', 'หลักสูตร TNHS', 'full'),

  entry('page_configs', 'program_config', 'ตั้งค่าหน้าโปรแกรม', 'full'),
  entry('page_configs', 'skill_config',   'ตั้งค่าหน้า Skill', 'full'),

  // ── จัดการคอนเทนต์ ──────────────────────────────────────────────
  entry('banners', 'banner', 'แบนเนอร์', 'full'),

  entry('promotions', 'promotion',      'โปรโมชั่น', 'full'),
  // setPromotionPageLink also emits a `pages|builder` row for the page that
  // RECEIVES the link — the verb lives in `action` (promotion.link /
  // promotion.unlink), not in a new entity: a page that gained a promotion
  // link is still a page, and a second entity would fragment "everything that
  // happened to this page". Pages UNLINKED by the same call are a count in
  // `meta`, not a row each (§8.7 ruling (h)).
  entry('promotions', 'page_link',      'ลิงก์หน้าเพจโปรโมชั่น', 'full'),
  entry('promotions', 'promotion_sync', 'ซิงก์โปรโมชั่น', 'count_only'),

  entry('promotions_banner', 'promotion_banner', 'แบนเนอร์โปรโมชั่น', 'full'),
  entry('notifications',     'notification',     'การแจ้งเตือน', 'full'),

  entry('about', 'instructor', 'วิทยากร (หน้าเกี่ยวกับเรา)', 'full'),
  entry('about', 'config',     'ตั้งค่าหน้าเกี่ยวกับเรา', 'full'),

  entry('contact', 'video', 'วิดีโอหน้าติดต่อเรา', 'full'),
  entry('contact', 'map',   'แผนที่การเดินทาง', 'full'),

  entry('portfolio', 'client_logo',      'โลโก้ลูกค้า', 'full'),
  entry('portfolio', 'atmosphere_photo', 'ภาพบรรยากาศ', 'full'),

  entry('nearby_places',    'nearby_place',    'โรงแรม/ร้านอาหารใกล้เคียง', 'full'),
  entry('featured_reviews', 'featured_review', 'รีวิวแนะนำ', 'full'),
  entry('articles',         'article',         'บทความ', 'full'),

  entry('pages', 'builder', 'หน้าเพจ (Page Builder)', 'full'),
  // No row has ever been written for this one — customPages.js has five
  // mutating actions and has never called an audit writer (§8.1).
  entry('pages', 'custom',  'หน้าเพจ (HTML ขั้นสูง)', 'full'),
  entry('pages', 'section', 'เซกชันในหน้าเพจ', 'full'),
  // SPLIT, deliberately. `preview` covers enable / regenerate-password /
  // revoke, and act_only makes "never log the preview password" STRUCTURAL
  // rather than a rule in prose that nothing enforces — regeneratePreviewPassword
  // is the single most dangerous pair in this table to leave at `full`. The
  // expiry date is not a secret, so it gets its own pair rather than raising
  // the ceiling on the one that handles passwords.
  entry('pages', 'preview',        'ลิงก์พรีวิว', 'act_only'),
  entry('pages', 'preview_expiry', 'วันหมดอายุลิงก์พรีวิว', 'full'),

  entry('faqs', 'faq',      'FAQ', 'full'),
  entry('faqs', 'faq_sync', 'ซิงก์ FAQ', 'count_only'),

  // Program / skill FAQs, which pageKeyForType resolves to `local_faqs`
  // because they have no dedicated RBAC page of their own.
  entry('local_faqs', 'local_faq', 'FAQ (เฉพาะหลักสูตร)', 'full'),

  entry('schedule_pdf', 'pdf', 'ไฟล์ตารางอบรม PDF', 'full'),

  // /admin/media. DELETE is the only mutation this menu records, and act_only
  // is not a carve-out — it is the whole row. `recordId` holds the public_id,
  // which IS the URL that stopped resolving, so the one fact a reader wants is
  // already in the identity of the row. A `before` here could only be a
  // Cloudinary resource description (dimensions, etag, a version number) that
  // nobody asked for and that says nothing about what was lost.
  entry('media', 'file', 'ไฟล์ในคลังไฟล์', 'act_only'),

  // ── ระบบ ────────────────────────────────────────────────────────
  /**
   * The cache console. The menu key is `landing_cache` and NOT `cache`, even
   * though the page now lives at /admin/cache and covers six cache surfaces:
   * `Role.pages` stores these strings in Mongo, so minting a new key would
   * revoke the screen from every role that holds the old one. The key outlived
   * its name deliberately (see rbac/pages.js).
   *
   * THIS MENU WAS `MENUS_WITHOUT_MUTATIONS` UNTIL NOW, and the docstring below
   * still says so for `dashboard`. It was read-only and correctly had no entry;
   * round 3 of the cache-console work gives it destructive actions, so it joins
   * the contract — exactly the shape §8.7's `security` note describes for sweep
   * round 6. Without these pairs `buildAuditRow` fails closed: the policy drops
   * to act_only and every before/after is discarded with a console.warn, so the
   * pre-image a destructive action is required to capture would be thrown away
   * by the writer that was asked to keep it.
   *
   * `full` and not `count_only`, which is what the five `*_sync` pairs use. A
   * sync's outcome genuinely IS a count, so count_only loses nothing there. A
   * reset has a real before→after worth diffing — "27 programs → 5" is the
   * claim an admin needs — and count_only nulls both sides
   * (recordAdminAction.js:140). There is no PII in a cache summary, so nothing
   * argues for a lower ceiling.
   *
   * Two entities because two different KINDS of record change, per §8.7's rule
   * that `entity` distinguishes kinds and the verb lives in `action`: a
   * single-document snapshot and a mirror collection have different shapes,
   * different failure modes and different reset semantics.
   */
  entry('landing_cache', 'snapshot', 'สแนปช็อตแคช', 'full'),
  entry('landing_cache', 'mirror',   'คอลเลกชันมิเรอร์', 'full'),
  /**
   * Round 7. The manual nav-menu resync, now that /admin/cache has a button
   * for it. Same menu key for the same reason as the two above — `landing_cache`
   * is the RBAC page key for this whole screen (rbac/pages.js:97) and minting
   * a nav-specific one would revoke the console from every role holding the
   * old key. No new menu key was invented.
   *
   * A THIRD ENTITY and not a reuse of `snapshot`. `snapshot` could have carried
   * it — nav_menu_cache is also a single document, and recordId ('navmenu_v1'
   * vs 'homepage_v1') would tell the two records apart. It is separate anyway,
   * for two reasons that outweigh the saved line. First, `snapshot` is `full`,
   * a ceiling chosen for RESETS because "27 programs → 5" is the claim an admin
   * needs; a sync's outcome genuinely IS a count, which is what the five
   * existing `*_sync` pairs use and why they exist as their own entities rather
   * than as an action on the record they sync. Second, filing both under one
   * entity mixes "someone overrode the downgrade guard on the landing snapshot"
   * with "the nav resync ran" in a single history stream, and those two are read
   * for different reasons by someone in different trouble.
   *
   * NOTE for whoever adds the next one: this is the FIRST sync in the codebase
   * that actually writes a row. The other five `*_sync` pairs are registered
   * and unwritten — recordAdminAction has no call site under src/app/api/ and
   * syncCareerPathsAction/syncFaqsAction/syncPromotionsAction record nothing.
   * The landing sync button beside this one is equally silent. That asymmetry
   * is real and is not fixed here; it is noted so the gap is not mistaken for
   * a deliberate exemption.
   */
  entry('landing_cache', 'nav_menu_sync', 'ซิงก์เมกะเมนูหลักสูตร', 'count_only'),

  // PII entities (§5.1/§5.2): status transitions only, never a field diff.
  /**
   * `round_and_status`, NOT `full`, and NOT `status_only` any more.
   *
   * The cap on personal data is unchanged — this policy is an allowlist of five
   * field names (the status enum plus the four coupled round fields) and drops
   * everything else, so `updateRegistration`'s wholesale edit still records the
   * act alone. See the policy's own note for why raising this pair to `full`
   * would have been the wrong way to get the round diff.
   */
  entry('registrations', 'public',  'ใบสมัครอบรม (Public)', ROUND_AND_STATUS_POLICY),
  entry('registrations', 'inhouse', 'คำขออบรม In-house', 'status_only'),
  entry('career_path_registrations', 'registration', 'ใบสมัคร Career Path', 'status_only'),

  // NOT a PII entity — job POSTINGS written by admins; applications arrive by
  // email and never enter this system (§5.1).
  entry('recruits', 'recruit', 'ประกาศรับสมัครงาน', 'full'),

  // A replay re-runs a handler that writes several collections. The row says a
  // replay happened; describing the downstream effects would be a guess (§2).
  entry('webhook_logs', 'webhook_log', 'Webhook Log', 'act_only'),

  // Self-service rename / password rotation. The ACT only — never the password
  // value, and the name change is not worth a diff here.
  entry('profile',  'admin', 'โปรไฟล์ของตนเอง', 'act_only'),
  entry('accounts', 'admin', 'บัญชีผู้ดูแล', 'full'),

  // The highest-value rows in the log: a role edit silently changes what every
  // holder of that role can reach.
  entry('roles', 'role', 'บทบาทและสิทธิ์', 'full'),
]);

/**
 * Menus whose `recordId` spans more than one key space.
 *
 * `courses` and nothing else. The course record itself is an MSDB `_id`; its
 * extension, early-bird and promo-link rows key on the `course_id` CODE (see
 * src/models/CourseExtension.js — "matches `course_id` from the upstream
 * API"). ACCEPTED rather than normalised: resolving `course_id` to an `_id` on
 * every write would buy tidiness at the price of a read on every mutation,
 * forever.
 *
 * The cost is paid once, at read time, by a screen that already holds both:
 *
 *   { menu: 'courses', recordId: { $in: [msdbId, courseId] } }
 *
 * The existing `{recordId:1, createdAt:-1}` index serves that `$in` — no new
 * index, and §8.6's rejection of a fifth one stands.
 */
export const DUAL_KEY_SPACE_MENUS = Object.freeze(['courses']);

/**
 * Actor ids reserved for non-human writers.
 *
 * The instructor sync runs on a cron and the webhook replay path runs on an
 * inbound event; both mutate data no admin touched. "The instructor list
 * changed at 3am and nobody touched it" is a real question, and "the cron did
 * it" is the answer worth having — so those rows are WRITTEN rather than
 * skipped, with an actor that cannot be mistaken for a person.
 *
 * Reserved means no admin account may ever be issued one of these ids.
 */
export const SYSTEM_ACTOR_IDS = Object.freeze(['system:cron', 'system:webhook']);

/**
 * The nested lookup map, DERIVED from the array above.
 *
 * Shape unchanged for callers:
 *   { [menu]: { dualKeySpace?, entities: { [entity]: { label, diff } } } }
 *
 * This reduce is exactly where a duplicate pair would be swallowed, which is
 * why the ARRAY, not this map, is what the tests check.
 */
export const AUDIT_CONTRACT = Object.freeze(
  AUDIT_CONTRACT_ENTRIES.reduce((acc, { menu, entity, label, diff }) => {
    const bucket = acc[menu] ?? (acc[menu] = { entities: {} });
    if (DUAL_KEY_SPACE_MENUS.includes(menu)) bucket.dualKeySpace = true;
    bucket.entities[entity] = { label, diff };
    return acc;
  }, {})
);

/** Every menu key the contract covers, in first-appearance order. */
export const CONTRACT_MENUS = Object.freeze(Object.keys(AUDIT_CONTRACT));

/**
 * Registry keys with no contract entry — DERIVED, not listed.
 *
 * Today: `dashboard` and `landing_cache`, which are read-only, and `security`,
 * which is NOT read-only — 2FA setup/verify/disable are route handlers, and
 * the action-layer hook cannot see them (§5.3). `security` joins the contract
 * at sweep round 6, at which point it leaves this list by itself.
 *
 * Derived so that a page key added to ADMIN_PAGES shows up here until someone
 * decides whether it mutates, rather than being silently absent from both
 * lists. That is also why `ALL_PAGE_KEYS` is imported rather than restated:
 * one registry, checked against, never copied.
 */
export const MENUS_WITHOUT_MUTATIONS = Object.freeze(
  ALL_PAGE_KEYS.filter((key) => !(key in AUDIT_CONTRACT))
);

/** Is `(menu, entity)` a pair the trail is allowed to contain? */
export function isValidPair(menu, entity) {
  return Boolean(AUDIT_CONTRACT[menu]?.entities?.[entity]);
}

/** The contract entry for a pair, or null. */
export function pairContract(menu, entity) {
  return AUDIT_CONTRACT[menu]?.entities?.[entity] ?? null;
}

/** Does this menu record `recordId` in more than one key space? */
export function isDualKeySpace(menu) {
  return AUDIT_CONTRACT[menu]?.dualKeySpace === true;
}
