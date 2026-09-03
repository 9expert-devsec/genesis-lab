'use server';

/**
 * Redirect Panel — server actions for the rule table and the 404 worklist.
 *
 * Every decision about what a rule may be lives in lib/redirects/redirectRules,
 * which is pure and tested without a database. This file connects, reads,
 * writes and audits.
 *
 * ── EVERY MUTATION IS AUDITED ─────────────────────────────────────────────
 * A redirect appearing with no record of who added it is not acceptable: this
 * table decides where visitors' browsers go, and "who pointed /courses at
 * somewhere else, and when" has to have an answer. The pair is registered in
 * auditContract as (redirects, redirect_rule) with a `full` diff, so the
 * payload survives rather than failing closed to act_only.
 */

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { dbConnect } from '@/lib/db/connect';
import RedirectRule from '@/models/RedirectRule';
import NotFoundHit from '@/models/NotFoundHit';
import { validateRule, normaliseHost, normalisePath } from '@/lib/redirects/redirectRules';

const ADMIN_PATH = '/admin/redirects';

/** How many rows either table shows per page. */
const PAGE_SIZE = 50;

function serialise(doc) {
  if (!doc) return null;
  return JSON.parse(JSON.stringify(doc));
}

/**
 * The fields the audit trail records for a rule.
 *
 * Small by construction — a rule IS a handful of short scalars, so unlike the
 * course payload there is nothing here that needs summarising to stay under the
 * writer's 2 KB per-field cap. `note` is capped anyway: it is free text and an
 * admin can paste anything into it.
 */
function ruleFields(doc) {
  if (!doc) return null;
  return {
    host: doc.host ?? '',
    source: doc.source ?? '',
    destination: doc.destination ?? '',
    permanent: doc.permanent !== false,
    isActive: doc.isActive !== false,
    note: String(doc.note ?? '').slice(0, 200),
  };
}

/** A rule reads as itself in the trail: "www.example.com/old-path". */
function ruleLabel(doc) {
  return `${doc?.host ?? ''}${doc?.source ?? ''}`;
}

// ── the rule table ──────────────────────────────────────────────────────────

/**
 * List rules, filtered.
 *
 * `q` matches source OR destination as a plain substring — escaped, because the
 * value comes from a URL and an unescaped `.` or `*` in a Mongo regex is a
 * pattern the admin did not ask for and, on a large collection, a scan.
 */
export async function listRedirectRules({ q = '', host = '', page = 1 } = {}) {
  await requireAdmin('redirects');
  await dbConnect();

  const filter = {};
  if (host) filter.host = normaliseHost(host);
  if (q) {
    const escaped = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escaped) {
      filter.$or = [
        { source: { $regex: escaped, $options: 'i' } },
        { destination: { $regex: escaped, $options: 'i' } },
      ];
    }
  }

  const current = Math.max(1, Number(page) || 1);
  const [rows, total, hosts] = await Promise.all([
    RedirectRule.find(filter)
      .sort({ updatedAt: -1 })
      .skip((current - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    RedirectRule.countDocuments(filter),
    RedirectRule.distinct('host'),
  ]);

  return {
    rows: serialise(rows),
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    hosts: (hosts ?? []).filter(Boolean).sort(),
  };
}

/**
 * Create or update one rule.
 *
 * Validation is the PURE `validateRule` — the same function the tests drive
 * directly — so the open-redirect guard, the /admin refusal and the
 * no-patterns rule cannot differ between what is tested and what runs.
 */
export async function saveRedirectRule(input = {}) {
  const session = await requireAdmin('redirects');
  await dbConnect();

  const check = validateRule(input);
  if (!check.ok) return { ok: false, errors: check.errors };

  const { host, source, destination } = check.value;
  const patch = {
    host,
    source,
    destination,
    permanent: input.permanent !== false,
    isActive: input.isActive !== false,
    note: String(input.note ?? '').trim().slice(0, 500),
    updatedBy: String(session.user?.name || session.user?.id || ''),
  };

  const id = String(input.id ?? '').trim();

  try {
    let before = null;
    let doc;

    if (id) {
      before = await RedirectRule.findById(id).lean();
      if (!before) return { ok: false, errors: { form: 'ไม่พบกฎที่ต้องการแก้ไข' } };
      doc = await RedirectRule.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean();
    } else {
      doc = (await RedirectRule.create({
        ...patch,
        createdBy: patch.updatedBy,
      })).toObject();
    }

    revalidatePath(ADMIN_PATH);

    recordAdminActionAfter({
      menu: 'redirects',
      action: id ? 'update' : 'create',
      entity: 'redirect_rule',
      recordId: String(doc?._id ?? ''),
      recordLabel: ruleLabel(doc),
      before: ruleFields(before),
      after: ruleFields(doc),
      actor: { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, rule: serialise(doc) };
  } catch (err) {
    // The unique index on (host, source) is the authority on "one rule per
    // URL"; the application cannot close that race and does not pretend to.
    if (err?.code === 11000) {
      return { ok: false, errors: { source: 'มีกฎสำหรับโฮสต์และพาธนี้อยู่แล้ว' } };
    }
    return { ok: false, errors: { form: err?.message ?? 'บันทึกไม่สำเร็จ' } };
  }
}

export async function deleteRedirectRule(id) {
  const session = await requireAdmin('redirects');
  await dbConnect();

  const removed = await RedirectRule.findByIdAndDelete(String(id ?? '')).lean();
  if (!removed) return { ok: false, error: 'ไม่พบกฎที่ต้องการลบ' };

  revalidatePath(ADMIN_PATH);

  recordAdminActionAfter({
    menu: 'redirects',
    action: 'delete',
    entity: 'redirect_rule',
    recordId: String(removed._id ?? ''),
    recordLabel: ruleLabel(removed),
    // `before` is the whole of the record here: after a delete there is nothing
    // left to reconstruct it from, which is the same reasoning deleteCourse
    // gives for reading its label before the write.
    before: ruleFields(removed),
    actor: { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}

// ── the 404 worklist ────────────────────────────────────────────────────────

/**
 * The paths that 404ed, most-requested first.
 *
 * READ ONLY, and it is a WORKLIST rather than analytics — see the model note.
 * A determined caller can inflate any counter, so the ordering is a hint about
 * where to look, never a measurement of people.
 */
export async function listNotFoundHits({ q = '', page = 1, includeResolved = false } = {}) {
  await requireAdmin('redirects');
  await dbConnect();

  const filter = {};
  if (!includeResolved) filter.resolvedAt = null;
  if (q) {
    const escaped = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escaped) filter.path = { $regex: escaped, $options: 'i' };
  }

  const current = Math.max(1, Number(page) || 1);
  const [rows, total] = await Promise.all([
    NotFoundHit.find(filter)
      .sort({ count: -1, lastSeen: -1 })
      .skip((current - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    NotFoundHit.countDocuments(filter),
  ]);

  return {
    rows: serialise(rows),
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * Turn a 404 row into a rule — THE REASON THE LOG IS WORTH BUILDING.
 *
 * The admin supplies only the destination; the host and source come from the
 * recorded row, so the rule cannot be keyed on a path nobody actually
 * requested. Marking the row resolved is what stops the worklist re-offering
 * something already dealt with.
 */
export async function createRuleFromHit({ hitId, destination } = {}) {
  const session = await requireAdmin('redirects');
  await dbConnect();

  const hit = await NotFoundHit.findById(String(hitId ?? '')).lean();
  if (!hit) return { ok: false, errors: { form: 'ไม่พบรายการ 404 นี้' } };

  const result = await saveRedirectRule({
    host: hit.host,
    source: hit.path,
    destination,
    permanent: true,
    isActive: true,
    note: `สร้างจากบันทึก 404 (${hit.count} ครั้ง)`,
  });
  if (!result.ok) return result;

  await NotFoundHit.updateOne({ _id: hit._id }, { $set: { resolvedAt: new Date() } });
  revalidatePath(ADMIN_PATH);

  // NOT a second audit row: saveRedirectRule already recorded the create, and
  // marking the worklist row resolved is bookkeeping about that same act.
  void session;
  return result;
}

/** Put a resolved row back on the worklist. */
export async function reopenNotFoundHit(id) {
  await requireAdmin('redirects');
  await dbConnect();
  await NotFoundHit.updateOne({ _id: String(id ?? '') }, { $set: { resolvedAt: null } });
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

/**
 * Does this path currently resolve to something the app serves?
 *
 * ── THE "IS THIS SHADOWING A REAL PAGE" ANSWER, AND ITS HONEST LIMIT ──────
 * A rule cannot shadow a live page — the table is only consulted after routing
 * has already failed. So this is NOT a safety check; the safety is structural.
 * It exists so the admin is not confused when a rule they wrote appears to do
 * nothing: if the path already serves a page, the rule is dead weight and the
 * panel says so.
 *
 * Deliberately a HEAD request to the site's own origin rather than a route
 * table introspection: there is no reliable way to enumerate what the App
 * Router will serve, and a stale hardcoded list would be worse than no answer.
 */
export async function checkPathIsLive(path) {
  await requireAdmin('redirects');

  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  const clean = normalisePath(path);
  if (!base || !clean) return { ok: false, known: false };

  try {
    const res = await fetch(new URL(clean, base), {
      method: 'HEAD',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return { ok: true, known: true, live: res.status >= 200 && res.status < 400, status: res.status };
  } catch {
    // No answer is not the same as "not live", and saying otherwise would tell
    // an admin their rule is fine when nobody checked.
    return { ok: false, known: false };
  }
}
