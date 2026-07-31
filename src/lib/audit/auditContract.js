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

/** Every legal value of the `diff` field. */
export const DIFF_POLICIES = Object.freeze([
  ...Object.keys(DIFF_POLICY_RANK),
  ORDERED_IDS_POLICY,
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

  entry('schedules',   'schedule',   'รอบอบรม', 'full'),
  entry('instructors', 'instructor', 'วิทยากร', 'full'),

  entry('programs', 'program',       'โปรแกรม', 'full'),
  entry('programs', 'skill',         'Skill', 'full'),
  // Separate collections (ProgramOrder / SkillOrder) whose only content IS the
  // ordering — hence ordered_ids rather than a reorder of `program`.
  entry('programs', 'program_order', 'ลำดับโปรแกรม', ORDERED_IDS_POLICY),
  entry('programs', 'skill_order',   'ลำดับ Skill', ORDERED_IDS_POLICY),
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

  // ── ระบบ ────────────────────────────────────────────────────────
  // PII entities (§5.1/§5.2): status transitions only, never a field diff.
  entry('registrations', 'public',  'ใบสมัครอบรม (Public)', 'status_only'),
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
