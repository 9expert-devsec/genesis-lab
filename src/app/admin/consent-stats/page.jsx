import Link from 'next/link';
import { requirePage } from '@/lib/rbac/guard';
import { dbConnect } from '@/lib/db/connect';
import ConsentDailyStat from '@/models/ConsentDailyStat';
import { acceptanceRate, bangkokDate, normaliseStatsHost, sumCounters } from '@/lib/consentStats';

export const metadata = {
  title: 'สถิติความยินยอมคุกกี้',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_HOST = 'www.9experttraining.com';
const DAYS = 30;

/**
 * /admin/consent-stats — the acceptance rate after the CB-C banner redesign.
 * READ-ONLY. Counters only; nothing here identifies a visitor.
 *
 *   acceptance rate = (accept_all + custom with analytics) / all decisions
 *
 * Defaults to www, because dev / preview / production share one database and
 * the other hosts' rows are developers' test clicks. Other hosts are listed as
 * links (?host=), read from the URL on every request — never copied into state.
 */
export default async function ConsentStatsPage({ searchParams }) {
  await requirePage('consent_stats');
  const sp = (await searchParams) ?? {};
  const host = normaliseStatsHost(sp.host) || DEFAULT_HOST;

  const today = bangkokDate();
  const from = bangkokDate(Date.now() - (DAYS - 1) * 24 * 60 * 60 * 1000);

  let rows = [];
  let hosts = [];
  let failed = false;
  try {
    await dbConnect();
    [rows, hosts] = await Promise.all([
      ConsentDailyStat.find({ host, date: { $gte: from, $lte: today } }).sort({ date: -1 }).lean(),
      ConsentDailyStat.distinct('host'),
    ]);
  } catch {
    failed = true;
  }

  const totals = sumCounters(rows);
  const rate = acceptanceRate(totals);
  const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
  const all = totals.accept_all + totals.reject_all + totals.custom;

  return (
    // Full content width, like the dashboard: AdminContentWrapper already pads
    // every admin page with p-6, so the root adds only its vertical rhythm.
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-9e-navy dark:text-white">สถิติความยินยอมคุกกี้</h1>
        <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {DAYS} วันล่าสุด ({from} – {today}, เวลาไทย) · host <span className="font-mono">{host}</span> · นับเฉพาะจำนวนครั้ง ไม่เก็บข้อมูลระบุตัวบุคคล
        </p>
        {hosts.length > 1 && (
          <nav aria-label="เลือก host" className="mt-2 flex flex-wrap gap-2 text-xs">
            {[...hosts].sort().map((h) => (
              <Link
                key={h}
                href={h === DEFAULT_HOST ? '/admin/consent-stats' : `/admin/consent-stats?host=${encodeURIComponent(h)}`}
                aria-current={h === host ? 'page' : undefined}
                className={
                  'rounded-full border px-3 py-1 font-mono ' +
                  (h === host
                    ? 'border-9e-action bg-9e-action text-white'
                    : 'border-[var(--surface-border)] text-9e-navy hover:border-9e-action dark:text-white')
                }
              >
                {h}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {failed ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          อ่านข้อมูลไม่สำเร็จ — ลองโหลดหน้าใหม่อีกครั้ง
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['อัตราการยอมรับ', rate === null ? '—' : `${(rate * 100).toFixed(1)}%`, '(ยอมรับทั้งหมด + เลือกเองที่เปิดวิเคราะห์) ÷ ทุกการตัดสินใจ'],
              ['การตัดสินใจทั้งหมด', all.toLocaleString('en-US'), `ผ่านหน้าตั้งค่า ${pct(totals.via_layer2, all)}`],
              ['ยอมรับทั้งหมด', totals.accept_all.toLocaleString('en-US'), pct(totals.accept_all, all)],
              ['ปฏิเสธทั้งหมด', totals.reject_all.toLocaleString('en-US'), pct(totals.reject_all, all)],
              ['เลือกเอง', totals.custom.toLocaleString('en-US'), pct(totals.custom, all)],
              ['เลือกเอง · เปิดวิเคราะห์', totals.custom_analytics.toLocaleString('en-US'), pct(totals.custom_analytics, totals.custom)],
              ['เลือกเอง · เปิดการตลาด', totals.custom_marketing.toLocaleString('en-US'), pct(totals.custom_marketing, totals.custom)],
              ['เปิดคุกกี้การตลาด (รวม)', totals.marketing_granted.toLocaleString('en-US'), pct(totals.marketing_granted, all)],
            ].map(([label, value, sub]) => (
              <div key={label} className="rounded-xl border border-[var(--surface-border)] bg-white p-4 dark:bg-[#0D1B2A]">
                <dt className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">{label}</dt>
                <dd className="mt-1 text-2xl font-bold text-9e-navy dark:text-white">{value}</dd>
                <dd className="mt-0.5 text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">{sub}</dd>
              </div>
            ))}
          </dl>

          <div className="overflow-x-auto rounded-xl border border-[var(--surface-border)]">
            <table className="w-full text-sm">
              <caption className="sr-only">การตัดสินใจรายวัน</caption>
              <thead className="bg-9e-ice text-left text-xs text-9e-slate-dp-50 dark:bg-[#0D1B2A] dark:text-[#94a3b8]">
                <tr>
                  {['วันที่', 'ทั้งหมด', 'ยอมรับทั้งหมด', 'ปฏิเสธทั้งหมด', 'เลือกเอง', 'เลือกเอง·วิเคราะห์', 'เลือกเอง·การตลาด', 'ผ่านหน้าตั้งค่า', 'อัตราการยอมรับ'].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-9e-slate-dp-50">ยังไม่มีข้อมูลในช่วงนี้</td></tr>
                ) : rows.map((r) => {
                  const d = sumCounters([r]);
                  const dr = acceptanceRate(d);
                  return (
                    <tr key={r.date} className="border-t border-[var(--surface-border)] text-9e-navy dark:text-white">
                      <th scope="row" className="px-3 py-2 text-left font-mono font-normal">{r.date}</th>
                      <td className="px-3 py-2">{d.accept_all + d.reject_all + d.custom}</td>
                      <td className="px-3 py-2">{d.accept_all}</td>
                      <td className="px-3 py-2">{d.reject_all}</td>
                      <td className="px-3 py-2">{d.custom}</td>
                      <td className="px-3 py-2">{d.custom_analytics}</td>
                      <td className="px-3 py-2">{d.custom_marketing}</td>
                      <td className="px-3 py-2">{d.via_layer2}</td>
                      <td className="px-3 py-2">{dr === null ? '—' : `${(dr * 100).toFixed(1)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
