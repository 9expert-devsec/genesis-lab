import { requirePage } from '@/lib/rbac/guard';
import { ADMIN_PAGES } from '@/lib/rbac/pages';
import { AUDIT_CONTRACT_ENTRIES } from '@/lib/audit/auditContract';
import {
  readAuditLog,
  readAuditActions,
  readPairsWithRows,
  countVisibleRows,
} from '@/lib/audit/readAuditLog';
import { AuditLogClient } from './_components/AuditLogClient';

export const metadata = { title: 'ประวัติการดำเนินการ' };
// Never cached. Rows change constantly and a stale audit log is worse than a
// slow one — the whole point of the page is that it reflects what just happened.
export const dynamic = 'force-dynamic';

/**
 * Filters live in searchParams, not client state: the page stays a server
 * component, links are shareable, and back/forward works.
 *
 * NOTE what is NOT read from searchParams — the clamp. `buildAuditQuery`
 * recomputes it from the session on every request, so a hand-edited URL narrows
 * within what the user holds and can never widen it.
 */
export default async function Page({ searchParams }) {
  // requirePage returns the session it already read — the clamp is computed
  // from THAT, not from a second auth() call and never from searchParams.
  const session = await requirePage('audit_log');
  const user = session?.user ?? null;

  const sp = (await searchParams) ?? {};
  const filters = {
    menu:   sp.menu   ?? '',
    entity: sp.entity ?? '',
    action: sp.action ?? '',
    actor:  sp.actor  ?? '',
    from:   sp.from   ?? '',
    to:     sp.to     ?? '',
  };
  const cursor = sp.cursor ?? '';

  const [page, actions, pairsWithRows, totalVisible] = await Promise.all([
    readAuditLog({ user, filters, cursor }),
    readAuditActions({ user }),
    readPairsWithRows({ user }),
    countVisibleRows({ user }),
  ]);

  // Menu labels from ADMIN_PAGES, entity labels from the contract. Both already
  // Thai; a third set would be the pin/position mismatch all over again.
  const menuLabels = Object.fromEntries(
    ADMIN_PAGES.flatMap((g) => g.pages).map((p) => [p.key, p.label])
  );
  const entityLabels = Object.fromEntries(
    AUDIT_CONTRACT_ENTRIES.map((e) => [`${e.menu}|${e.entity}`, e.label])
  );

  // The coverage panel: every registered pair, marked with whether it has ever
  // produced a row. Clamped, so it reflects what THIS user can see.
  const rowCountByPair = Object.fromEntries(
    pairsWithRows.map((p) => [`${p.menu}|${p.entity}`, p.count])
  );
  const visibleMenus = page.clampedTo;
  const coverage = AUDIT_CONTRACT_ENTRIES
    .filter((e) => visibleMenus === null || visibleMenus.includes(e.menu))
    .map((e) => ({
      menu: e.menu,
      entity: e.entity,
      label: e.label,
      count: rowCountByPair[`${e.menu}|${e.entity}`] ?? 0,
    }));

  // Menus offered in the filter — only ones the user can actually reach.
  const menuOptions = ADMIN_PAGES
    .flatMap((g) => g.pages)
    .filter((p) => visibleMenus === null || visibleMenus.includes(p.key))
    .map((p) => ({ value: p.key, label: p.label }));

  // Entities offered — likewise scoped, and narrowed further when a menu is
  // already selected so the two dropdowns cannot disagree.
  const entityOptions = AUDIT_CONTRACT_ENTRIES
    .filter((e) => visibleMenus === null || visibleMenus.includes(e.menu))
    .filter((e) => !filters.menu || e.menu === filters.menu)
    .map((e) => ({ value: e.entity, label: e.label }))
    .filter((opt, i, all) => all.findIndex((o) => o.value === opt.value) === i);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">ประวัติการดำเนินการ</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          บันทึกทุกการแก้ไขของผู้ดูแลระบบ — {totalVisible} รายการที่คุณเข้าถึงได้
        </p>
      </div>

      <AuditLogClient
        rows={page.rows}
        nextCursor={page.nextCursor}
        cursor={cursor}
        isEmptyClamp={page.isEmptyClamp}
        totalVisible={totalVisible}
        filters={filters}
        menuOptions={menuOptions}
        entityOptions={entityOptions}
        actionOptions={actions}
        menuLabels={menuLabels}
        entityLabels={entityLabels}
        coverage={coverage}
      />
    </div>
  );
}
