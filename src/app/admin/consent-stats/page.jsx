import Link from 'next/link';
import { requirePage } from '@/lib/rbac/guard';
import { dbConnect } from '@/lib/db/connect';
import ConsentDailyStat from '@/models/ConsentDailyStat';
import { acceptanceRate, bangkokDate, normaliseStatsHost, sumCounters } from '@/lib/consentStats';
import {
  MAX_RANGE_DAYS,
  RANGE_PRESETS,
  bucketConsentDays,
  consentStatsHref,
  parseConsentStatsRange,
  rangeLabel,
} from '@/lib/consentStatsRange';
import { LineChart } from '@/components/admin/charts/LineChart';

export const metadata = {
  title: 'สถิติความยินยอมคุกกี้',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_HOST = 'www.9experttraining.com';

const pillClass = (active) =>
  'rounded-full border px-3 py-1 ' +
  (active
    ? 'border-9e-action bg-9e-action text-white'
    : 'border-[var(--surface-border)] text-9e-navy hover:border-9e-action dark:text-white');

const fmtRate = (r) => (r === null ? '—' : `${(r * 100).toFixed(1)}%`);

/**
 * /admin/consent-stats — the acceptance rate after the CB-C banner redesign.
 * READ-ONLY. Counters only; nothing here identifies a visitor.
 *
 *   acceptance rate = (accept_all + custom with analytics) / all decisions
 *
 * Defaults to www, because dev / preview / production share one database and
 * the other hosts' rows are developers' test clicks.
 *
 * ALL FILTER STATE IS IN THE URL — host, range (?range= or ?from=&to=) and
 * grouping (?group=week) — read from `searchParams` on every request and never
 * copied into state. Every control is a link or a GET form that writes the URL,
 * so Back steps through the filters. Parsing lives in lib/consentStatsRange.
 */
export default async function ConsentStatsPage({ searchParams }) {
  await requirePage('consent_stats');
  const sp = (await searchParams) ?? {};
  const host = normaliseStatsHost(sp.host) || DEFAULT_HOST;
  const range = parseConsentStatsRange(sp, bangkokDate());
  const { from, to, group } = range;
  // The current state, for links that change one dimension and keep the rest.
  const state = {
    host,
    defaultHost: DEFAULT_HOST,
    range: range.mode === 'preset' ? range.days : undefined,
    from: range.mode === 'custom' ? from : undefined,
    to: range.mode === 'custom' ? to : undefined,
    group,
  };
  const href = (patch) => consentStatsHref({ ...state, ...patch });

  let rows = [];
  let hosts = [];
  let failed = false;
  try {
    await dbConnect();
    [rows, hosts] = await Promise.all([
      ConsentDailyStat.find({ host, date: { $gte: from, $lte: to } }).sort({ date: -1 }).lean(),
      ConsentDailyStat.distinct('host'),
    ]);
  } catch {
    failed = true;
  }

  // Oldest first, every period in the range — empty ones included, so the
  // chart can show them as gaps. The table lists only periods with data,
  // newest first, as it always has.
  const periods = bucketConsentDays(rows, { from, to, group }).map((p) => {
    const t = sumCounters(p.docs);
    return { ...p, totals: t, rate: p.hasData ? acceptanceRate(t) : null };
  });
  const tableRows = periods.filter((p) => p.hasData).reverse();

  const totals = sumCounters(rows);
  const rate = acceptanceRate(totals);
  const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
  const all = totals.accept_all + totals.reject_all + totals.custom;
  const unit = group === 'week' ? 'สัปดาห์' : 'วัน';
  const perPeriod = periods.length ? Math.round((all / periods.length) * 10) / 10 : 0;

  return (
    // Full content width, like the dashboard: AdminContentWrapper already pads
    // every admin page with p-6, so the root adds only its vertical rhythm.
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-9e-navy dark:text-white">สถิติความยินยอมคุกกี้</h1>
        <p data-subtitle="" className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {rangeLabel(range)} ({from} – {to}, เวลาไทย) · ราย{unit} · host <span className="font-mono">{host}</span> · นับเฉพาะจำนวนครั้ง ไม่เก็บข้อมูลระบุตัวบุคคล
        </p>
        {hosts.length > 1 && (
          <nav aria-label="เลือก host" className="mt-2 flex flex-wrap gap-2 text-xs">
            {[...hosts].sort().map((h) => (
              <Link
                key={h}
                href={href({ host: h })}
                aria-current={h === host ? 'page' : undefined}
                className={`${pillClass(h === host)} font-mono`}
              >
                {h}
              </Link>
            ))}
          </nav>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <nav aria-label="ช่วงเวลา" className="flex flex-wrap gap-2">
            {RANGE_PRESETS.map((d) => {
              const active = range.mode === 'preset' && range.days === d;
              return (
                <Link
                  key={d}
                  href={href({ range: d, from: undefined, to: undefined })}
                  aria-current={active ? 'page' : undefined}
                  className={pillClass(active)}
                >
                  {d} วัน
                </Link>
              );
            })}
          </nav>
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-[var(--surface-border)]" />
          <nav aria-label="จัดกลุ่ม" className="flex flex-wrap gap-2">
            {[['day', 'รายวัน'], ['week', 'รายสัปดาห์']].map(([g, label]) => (
              <Link
                key={g}
                href={href({ group: g })}
                aria-current={g === group ? 'page' : undefined}
                className={pillClass(g === group)}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* A plain GET form: submitting writes ?from=&to= to the URL. Hidden
            fields carry the other dimensions so a custom range keeps them. */}
        <form method="get" action="/admin/consent-stats" className="mt-3 flex flex-wrap items-end gap-2 text-xs">
          {host !== DEFAULT_HOST && <input type="hidden" name="host" value={host} />}
          {group === 'week' && <input type="hidden" name="group" value="week" />}
          <label className="flex flex-col gap-1 text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ตั้งแต่
            <input
              type="date"
              name="from"
              required
              defaultValue={range.input.from || from}
              className="rounded-9e-md border border-[var(--surface-border)] bg-white px-2 py-1 text-sm text-9e-navy dark:bg-[#0D1B2A] dark:text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ถึง
            <input
              type="date"
              name="to"
              required
              defaultValue={range.input.to || to}
              className="rounded-9e-md border border-[var(--surface-border)] bg-white px-2 py-1 text-sm text-9e-navy dark:bg-[#0D1B2A] dark:text-white"
            />
          </label>
          <button
            type="submit"
            className={`${pillClass(range.mode === 'custom')} py-1.5`}
          >
            ใช้ช่วงที่กำหนดเอง
          </button>
          <span className="pb-1.5 text-9e-slate-dp-50 dark:text-[#94a3b8]">สูงสุด {MAX_RANGE_DAYS} วัน</span>
        </form>
        {range.error && (
          <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
            {range.error}
          </p>
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
              ['อัตราการยอมรับ', fmtRate(rate), '(ยอมรับทั้งหมด + เลือกเองที่เปิดวิเคราะห์) ÷ ทุกการตัดสินใจ'],
              ['การตัดสินใจทั้งหมด', all.toLocaleString('en-US'), `เฉลี่ย ${perPeriod.toLocaleString('en-US')} ต่อ${unit} · ผ่านหน้าตั้งค่า ${pct(totals.via_layer2, all)}`],
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

          <LineChart
            title={`อัตราการยอมรับ ราย${unit} (%)`}
            series={periods.map((p) => ({
              label: p.label,
              value: p.rate === null ? null : Math.round(p.rate * 1000) / 10,
            }))}
            yMax={100}
            formatValue={(v) => `${v}%`}
            formatTick={(label) => label.slice(5, 10)}
          />

          <div className="overflow-x-auto rounded-xl border border-[var(--surface-border)]">
            <table className="w-full text-sm">
              <caption className="sr-only">การตัดสินใจราย{unit}</caption>
              <thead className="bg-9e-ice text-left text-xs text-9e-slate-dp-50 dark:bg-[#0D1B2A] dark:text-[#94a3b8]">
                <tr>
                  {[group === 'week' ? 'สัปดาห์' : 'วันที่', 'ทั้งหมด', 'ยอมรับทั้งหมด', 'ปฏิเสธทั้งหมด', 'เลือกเอง', 'เลือกเอง·วิเคราะห์', 'เลือกเอง·การตลาด', 'ผ่านหน้าตั้งค่า', 'อัตราการยอมรับ'].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-9e-slate-dp-50">ยังไม่มีข้อมูลในช่วงนี้</td></tr>
                ) : tableRows.map(({ key, label, totals: d, rate: dr }) => (
                  <tr key={key} className="border-t border-[var(--surface-border)] text-9e-navy dark:text-white">
                    <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-mono font-normal">{label}</th>
                    <td className="px-3 py-2">{d.accept_all + d.reject_all + d.custom}</td>
                    <td className="px-3 py-2">{d.accept_all}</td>
                    <td className="px-3 py-2">{d.reject_all}</td>
                    <td className="px-3 py-2">{d.custom}</td>
                    <td className="px-3 py-2">{d.custom_analytics}</td>
                    <td className="px-3 py-2">{d.custom_marketing}</td>
                    <td className="px-3 py-2">{d.via_layer2}</td>
                    <td className="px-3 py-2">{fmtRate(dr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
