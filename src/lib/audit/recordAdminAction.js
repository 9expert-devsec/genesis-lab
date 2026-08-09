/**
 * The one writer for the admin action history trail.
 *
 * Contract, in the order of importance:
 *   1. NEVER throws. A caller can `await recordAdminAction(...)` anywhere in an
 *      action body without a failed audit write ever surfacing as a failed
 *      mutation. A lost audit row is acceptable; a lost save is not.
 *   2. NEVER drops the event over a bad field. An unknown menu key is filed
 *      under UNKNOWN_MENU with the raw value preserved; an oversized payload is
 *      truncated with a marker; an unserialisable payload becomes a marker.
 *      Every one of those keeps the WHO/WHAT/WHEN.
 *   3. Bounded. `before`/`after`/`meta` are capped, because the callers that
 *      most want to hand over a whole document (reorder over 500 rows, a bulk
 *      sync) are exactly the ones that must not.
 *
 * DIVERGENCE FROM pageAudit.js, deliberate: that writer is FULLY silent
 * (`catch {}`). This one emits a console.warn on failure. The reasoning is
 * about what each trail is for. A page audit row sits next to a PageVersion
 * snapshot and losing one costs a convenience. This trail is the answer to
 * "who changed this" for the whole admin, and the first time anyone reads it is
 * the first time it matters — if it has quietly not been writing for a month,
 * nobody finds out until the moment they cannot afford it. A warn costs
 * nothing, never reaches the user, and is visible in the platform logs. The
 * caller still sees nothing: the return value is a boolean nobody has to check.
 *
 * Server-only (imports a mongoose model).
 */

import { after } from 'next/server';
import AdminAuditLog, { MENU_ENUM, UNKNOWN_MENU } from '@/models/AdminAuditLog';
import { pairContract, ORDERED_IDS_POLICY } from '@/lib/audit/auditContract';

/**
 * Ceiling for ONE payload field (`before`, `after`, `meta`), measured as the
 * length of its JSON. 2 KB holds a status pair, a {slug,title}, or an ordered
 * list of roughly 60 ObjectIds — the honest shapes. A whole article document
 * with its HTML body is an order of magnitude past it, which is the point.
 */
export const MAX_PAYLOAD_CHARS = 2000;

/** How much of an oversized payload is kept as evidence of what it was. */
export const TRUNCATED_PREVIEW_CHARS = 200;

const MENU_SET = new Set(MENU_ENUM);

/**
 * Resolve a supplied menu key to a storable one.
 *
 * @returns {{ menu: string, menuRaw: string, ok: boolean }}
 *   `ok: false` means the caller's key was not in the RBAC registry — the row
 *   is still written, under UNKNOWN_MENU, with `menuRaw` holding what was
 *   passed so the offending caller is findable by query.
 */
export function normalizeMenu(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  // UNKNOWN_MENU is in MENU_SET (it has to be, or the schema enum would reject
  // the fallback), so an explicit 'unknown' is accepted and carries no raw.
  if (raw && MENU_SET.has(raw)) return { menu: raw, menuRaw: '', ok: true };
  return { menu: UNKNOWN_MENU, menuRaw: raw, ok: false };
}

/**
 * Bound one payload field.
 *
 * Three outcomes, and none of them is "drop it":
 *   - within the ceiling      → returned unchanged (identity, not a re-parse,
 *                               so Dates and other Mixed-friendly values keep
 *                               whatever shape the caller gave them)
 *   - over the ceiling        → { __truncated: true, chars, preview }
 *   - not JSON-serialisable   → { __unserialisable: true, reason }
 *     (a circular ref, a BigInt, a Mongoose document with cycles)
 */
export function capPayload(value, max = MAX_PAYLOAD_CHARS) {
  if (value === null || value === undefined) return null;

  let json;
  try {
    json = JSON.stringify(value);
  } catch (err) {
    return { __unserialisable: true, reason: err?.message ?? 'not serialisable' };
  }
  // JSON.stringify returns undefined for a function or a bare `undefined`.
  if (json === undefined) {
    return { __unserialisable: true, reason: 'value has no JSON representation' };
  }
  if (json.length <= max) return value;

  return {
    __truncated: true,
    chars: json.length,
    preview: json.slice(0, TRUNCATED_PREVIEW_CHARS),
  };
}

/**
 * Reduce one payload field to what the pair's diff policy permits.
 *
 * ── WHY THIS IS IN THE WRITER AND NOT AT THE CALL SITES ─────────────────────
 * §5.2 of the plan doc rules that the four PII entities record metadata and a
 * status enum, never a field diff. Until now that rule was 38 hand-written
 * `xFields()` helpers and a promise: every one correct today, every one one
 * careless edit away from copying a customer's name, email and phone into an
 * append-only collection whose entire premise is that rows are never modified.
 * A subject-access or deletion request would then have to redact rows in a
 * collection designed to make that impossible.
 *
 * One place that cannot be forgotten beats 38 that can.
 *
 * ── REDUCE, NEVER REJECT ────────────────────────────────────────────────────
 * Rule 2 of this writer's contract is that it never drops an event over a bad
 * field. Stripping an over-broad payload keeps the WHO/WHAT/WHEN, which is the
 * part that answers the question people actually ask. Refusing the row would
 * lose the event to protect a field.
 *
 * @param {*} value       the caller's `before` or `after`
 * @param {string} policy one of the contract's diff policies
 */
export function reducePayload(value, policy) {
  if (value === null || value === undefined) return null;

  switch (policy) {
    case 'full':
      return value;

    // A short status enum, nothing else. `updateRegistrationStatus` may say
    // pending → cancelled; it may not say who the customer is.
    case 'status_only':
      return typeof value === 'object' && !Array.isArray(value) && 'status' in value
        ? { status: value.status }
        : null;

    // The ordering, nothing else — a reorder rewrites a set of rows and the set
    // is the event.
    case ORDERED_IDS_POLICY:
      return typeof value === 'object' && value !== null && 'orderedIds' in value
        ? { orderedIds: value.orderedIds }
        : null;

    // The count belongs in `meta`, which is outside this scale entirely.
    case 'count_only':
    case 'act_only':
    default:
      return null;
  }
}

/**
 * Build the row without touching the database. Exported so the shape is
 * testable without a Mongo connection, and so a caller can inspect what would
 * be written.
 *
 * The diff policy is applied BEFORE the size cap, so a payload that is both
 * over-broad and oversized is reduced first and then capped — an oversized
 * `status_only` payload becomes `{status}` rather than a truncation marker
 * carrying 200 characters of whatever the caller handed over.
 *
 * @param {object} [entry]
 * @param {object} [deps] test seam ONLY — production passes nothing.
 */
export function buildAuditRow(entry = {}, deps = {}) {
  const { contractFor = pairContract, warn = (...args) => console.warn(...args) } = deps;

  const { menu, menuRaw } = normalizeMenu(entry.menu);
  const actor = entry.actor ?? {};
  const entity = String(entry.entity ?? '');

  // FAIL CLOSED. An unregistered pair reduces to act_only, so a typo'd entity
  // cannot smuggle a payload past the policy it was supposed to have. It also
  // gives that typo a visible symptom — `entity` is free-form in the schema, so
  // today it has none at all: the row is written, looks right in the central
  // list, and is permanently invisible to the inline history widget.
  const contract = contractFor(menu, entity);
  const policy = contract?.diff ?? 'act_only';
  if (!contract) {
    warn(
      `[audit] no contract for ${menu}|${entity} — payload reduced to act_only.`,
      `action=${String(entry.action ?? 'update')} record=${entry.recordId ?? ''}`
    );
  }

  return {
    menu,
    menuRaw,
    entity,
    recordId:    entry.recordId == null ? '' : String(entry.recordId),
    recordLabel: String(entry.recordLabel ?? ''),
    // 'update' is the honest default: an action that reached this writer did
    // change something, and mislabelling it beats losing it.
    action:      String(entry.action ?? 'update'),
    before:      capPayload(reducePayload(entry.before, policy)),
    after:       capPayload(reducePayload(entry.after, policy)),
    // `meta` is NOT reduced. It is outside the diff scale by design: it holds
    // structured extras that are not a field diff (a sync's {synced, errors},
    // an attendee count), it is already bounded by capPayload, and count_only
    // depends on it surviving.
    meta:        capPayload(entry.meta),
    actor: {
      id:   actor.id == null ? '' : String(actor.id),
      name: String(actor.name ?? ''),
    },
  };
}

/**
 * Append one row. Awaitable, never rejects.
 *
 * @param {object} entry
 * @param {string} entry.menu        RBAC page key — the same string passed to requireAdmin()
 * @param {string} entry.action      'create' | 'update' | 'delete' | 'toggle' | 'reorder' | 'sync' | …
 * @param {string} [entry.entity]    which kind of record, when a menu holds more than one
 * @param {string} [entry.recordId]  the id a human recognises (may be a code, a key, or a literal)
 * @param {string} [entry.recordLabel] a human-readable name, snapshotted
 * @param {*} [entry.before]         small; capped
 * @param {*} [entry.after]          small; capped
 * @param {*} [entry.meta]           small; capped
 * @param {{id?:string,name?:string}} [entry.actor]  from the session requireAdmin() returned
 *
 * @param {object} [deps] test seam ONLY — production passes nothing.
 * @returns {Promise<boolean>} whether the row was written. Nobody has to check.
 */
export async function recordAdminAction(entry = {}, deps = {}) {
  const {
    AdminAuditLog: Model = AdminAuditLog,
    warn = (...args) => console.warn(...args),
  } = deps;

  let row;
  try {
    row = buildAuditRow(entry, { warn });
  } catch (err) {
    // buildAuditRow is defensive throughout, so reaching here means something
    // pathological (a getter that throws on String()). Still must not escape.
    warn('[audit] could not build row:', err?.message ?? err);
    return false;
  }

  if (!row.menuRaw && row.menu === UNKNOWN_MENU && !entry.menu) {
    warn('[audit] row written with no menu key:', row.action, row.recordId);
  } else if (row.menuRaw) {
    warn(
      `[audit] unknown menu key "${row.menuRaw}" — filed under ${UNKNOWN_MENU}.`,
      `action=${row.action} record=${row.recordId}`
    );
  }

  try {
    await Model.create(row);
    return true;
  } catch (err) {
    warn('[audit] write failed:', err?.message ?? err);
    return false;
  }
}

/**
 * Schedule an audit row to be written AFTER the response is sent.
 *
 * THE ONE CALL SITES SHOULD USE. Synchronous, returns nothing, never awaited:
 *
 *   recordAdminActionAfter({ menu: 'roles', action: 'delete', … });
 *
 * It exists because the correct call was three lines of ceremony —
 * `try { after(() => recordAdminAction({…})); } catch {}` — and three lines of
 * ceremony copied to ~156 sites is 156 chances to drop the `try`, drop the
 * `after`, or accidentally `await` and make the admin wait on an audit write.
 *
 * ── WHY after() IS WRAPPED ──────────────────────────────────────────────────
 * `after()` throws when called outside a request scope (Server Component,
 * Server Action, Route Handler, Middleware). Rule 1 of this writer's contract
 * is that a lost audit row must never cost a save, and an unguarded `after()`
 * would break exactly that rule in exactly the case where the guard looks
 * unnecessary.
 *
 * ── WHY THE CATCH DOES NOT FALL BACK TO A FLOATING PROMISE ──────────────────
 * The obvious "fix" in that branch is `recordAdminAction(entry)` without an
 * await — keep the row, lose the ordering. Deliberately NOT done.
 *
 * The only way to reach the branch is an action invoked outside a request
 * context: a script, a seed, a test. In that situation a lost audit row is the
 * CORRECT outcome, because nothing a human did in the admin happened — there is
 * no admin action to have a trail of. And an unawaited promise in a serverless
 * runtime is a real hazard: the invocation can be frozen or torn down before it
 * settles, producing a half-written row, an unhandled rejection in a process
 * nobody is watching, or a connection held open past the response. That is a
 * genuine cost for a row nobody wants.
 *
 * So: warn and stop.
 *
 * ── WHY IT WARNS RATHER THAN GOING SILENT ───────────────────────────────────
 * Same reason `recordAdminAction` diverges from pageAudit.js's `catch {}`. This
 * trail answers "who changed this" for the whole admin, and the first time
 * anyone reads it is the first time it matters. If it has quietly not been
 * scheduling for a month, nobody finds out until the moment they cannot afford
 * to. A warn costs nothing, never reaches the user, and is greppable in the
 * platform logs.
 *
 * @param {object} entry same shape as recordAdminAction
 * @param {object} [deps] test seam ONLY — production passes nothing.
 * @returns {void} nothing to check, nothing to await.
 */
export function recordAdminActionAfter(entry = {}, deps = {}) {
  const {
    after: schedule = after,
    record = recordAdminAction,
    warn = (...args) => console.warn(...args),
  } = deps;

  try {
    schedule(() => record(entry));
  } catch (err) {
    // No fallback write — see the docstring. The row is dropped on purpose.
    warn('[audit] could not schedule the write:', err?.message ?? err);
  }
}
