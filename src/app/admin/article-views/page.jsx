import Link from 'next/link';
import { requirePage } from '@/lib/rbac/guard';
import { bangkokDate } from '@/lib/consentStats';
import { RANGE_PRESETS, MAX_RANGE_DAYS, parseDateRange, rangeLabel } from '@/lib/admin/dateRange';
import { listPrograms } from '@/lib/api/programs';
import { listSkills } from '@/lib/api/skills';
import { buildProgramNames, buildSkillNames } from '@/lib/articleTaxonomy';
import { formatThaiDate } from '@/lib/promotions/promotionDateLabel';
import {
  ARTICLE_VIEWS_PAGE_SIZE,
  ageLabel,
  articleViewsHref,
  buildDailySeries,
  computeKpis,
  firstCollectedIndex,
  isPreviousAvailable,
  lastContentDate,
  mergeArticleViews,
  paginate,
  parseDashboardQuery,
  previousPeriod,
  skillTotals,
  sortRows,
  staleArticles,
  staleExplanation,
} from '@/lib/articleViews/dashboard';
import {
  getCollectionStart,
  getDailyByArticle,
  getDailyTotals,
  getRangeTotal,
  getViewTotalsByArticle,
  listDashboardArticles,
  listUsedTaxonomyIds,
} from '@/lib/articleViews/queries';
import { LineChart } from '@/components/admin/charts/LineChart';
import { Sparkline } from '@/components/admin/charts/Sparkline';
import { thaiDay, thaiDayTick, thaiDayWithWeekday } from '@/lib/admin/thaiDay';
import { AutoSubmitSelect, FilterForm } from './_components/FilterForm';

export const metadata = {
  title: 'สถิติยอดวิวบทความ',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/admin/article-views';
const nf = (n) => Math.round(n).toLocaleString('en-US');
/**
 * The chart tooltip's "เทียบวันก่อน ±x%" line — omitted when the previous day
 * has no value or was 0 (no percentage of nothing).
 */
const dayOverDay = (value, prev) =>
  typeof value === 'number' && typeof prev === 'number' && prev > 0
    ? [{ label: 'เทียบวันก่อน', value: `${value >= prev ? '+' : '−'}${Math.abs(((value - prev) / prev) * 100).toFixed(1)}%` }]
    : [];

const card = 'rounded-xl border border-[var(--surface-border)] bg-white p-4 dark:bg-[#0D1B2A]';
const muted = 'text-9e-slate-dp-50 dark:text-[#94a3b8]';
const field =
  'rounded-9e-md border border-[var(--surface-border)] bg-white px-2 py-1.5 text-sm text-9e-navy dark:bg-[#0D1B2A] dark:text-white';
const segClass = (active) =>
  'px-3 py-1.5 text-xs font-medium ' +
  (active ? 'bg-9e-action text-white' : 'text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#111d2c]');

/**
 * /admin/article-views — anonymous daily article-view totals. READ-ONLY.
 *
 * ALL STATE IS IN THE URL: filters (q, skill, program, status), the date range
 * (lib/admin/dateRange, shared with consent-stats), sort, ?zero=1 and the page.
 * Links and a GET form write it; this server component reads it on every
 * request; nothing copies it into client state.
 *
 * Counting semantics (null before the collection start, 0 after, the left join
 * from the article side) live in lib/articleViews/dashboard.js.
 */
export default async function ArticleViewsPage({ searchParams }) {
  await requirePage('article_views');
  const sp = (await searchParams) ?? {};
  const range = parseDateRange(sp, bangkokDate());
  const query = parseDashboardQuery(sp);
  const { from, to } = range;
  const customOpen = range.mode === 'custom' || query.customOpen;

  const state = {
    ...query,
    customOpen: range.mode === 'custom' ? false : query.customOpen,
    range: range.mode === 'preset' ? range.days : undefined,
    from: range.mode === 'custom' ? from : undefined,
    to: range.mode === 'custom' ? to : undefined,
  };
  const href = (patch = {}) => articleViewsHref(state, { page: 1, ...patch });

  let data = null;
  try {
    const [collectionStart, baseArticles, used, programsRes, skillsRes] = await Promise.all([
      getCollectionStart(),
      listDashboardArticles(query),
      listUsedTaxonomyIds(),
      listPrograms().catch(() => ({ items: [] })),
      listSkills().catch(() => ({ items: [] })),
    ]);
    const skillNames = buildSkillNames(skillsRes.items);
    const programNames = buildProgramNames(programsRes.items);

    // Skill is applied here, not in the query: the per-skill bars use the set
    // filtered by everything EXCEPT skill.
    const inSkill = (a) => !query.skill || (a.skills ?? []).map(String).includes(query.skill);
    const baseIds = baseArticles.map((a) => String(a._id));
    const filteredIds = baseArticles.filter(inSkill).map((a) => String(a._id));

    const prev = previousPeriod(range);
    const previousAvailable = isPreviousAvailable(prev, collectionStart);
    const [totals, dayTotals, previousTotal] = await Promise.all([
      getViewTotalsByArticle(baseIds, from, to),
      getDailyTotals(filteredIds, from, to),
      previousAvailable ? getRangeTotal(filteredIds, prev.from, prev.to) : 0,
    ]);

    const baseRows = mergeArticleViews(baseArticles, totals);
    const rows = baseRows.filter(inSkill);
    const series = buildDailySeries({ from, to, collectionStart, dayTotals });
    const kpis = computeKpis({ rows, series, previousTotal, previousAvailable });

    const tableSource = query.zero ? rows.filter((r) => r.views === 0) : rows;
    const pageData = paginate(sortRows(tableSource, query.sort, query.dir), query.page, ARTICLE_VIEWS_PAGE_SIZE);
    const spark = await getDailyByArticle(pageData.pageRows.map((r) => r.id), from, to);

    const byName = (a, b) => a.name.localeCompare(b.name, 'th');
    const skillOptions = used.skills.map((id) => ({ id, name: skillNames[id] ?? id })).sort(byName);
    const programOptions = used.programs.map((id) => ({ id, name: programNames[id] ?? id })).sort(byName);

    data = {
      collectionStart,
      kpis,
      series,
      pageData,
      spark,
      skillNames,
      skillOptions,
      programOptions,
      skillBars: skillTotals(baseRows, skillNames),
      stale: staleArticles(rows).slice(0, 3),
    };
  } catch (err) {
    console.error('[admin/article-views]', err);
  }

  const now = new Date();
  const pageMax = data ? Math.max(1, ...data.pageData.pageRows.map((r) => r.views)) : 1;
  const skillMax = data ? Math.max(1, ...data.skillBars.map((s) => s.value)) : 1;

  const sortHeader = (key, label) => {
    const active = query.sort === key;
    const dir = active && query.dir === 'desc' ? 'asc' : 'desc';
    return (
      <th
        scope="col"
        aria-sort={active ? (query.dir === 'asc' ? 'ascending' : 'descending') : undefined}
        className="whitespace-nowrap px-3 py-2 font-semibold"
      >
        <Link href={href({ sort: key, dir })} className={`hover:text-9e-action ${active ? 'text-9e-navy dark:text-white' : ''}`}>
          {label} {active ? (query.dir === 'asc' ? '▲' : '▼') : ''}
        </Link>
      </th>
    );
  };

  return (
    // Full content width, like consent-stats: AdminContentWrapper pads p-6.
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-9e-navy dark:text-white">สถิติยอดวิวบทความ</h1>
        <p data-subtitle="" className={`mt-1 text-sm ${muted}`}>
          นับเฉพาะ www.9experttraining.com · เริ่มเก็บ {thaiDay(data?.collectionStart) ?? 'ยังไม่มีข้อมูล'} ·
          นับครั้งที่เปิดอ่านต่อ session ไม่ใช่จำนวนคนที่ไม่ซ้ำ · ไม่เก็บข้อมูลระบุตัวบุคคล
        </p>
      </div>

      {/* ── filter panel ───────────────────────────────────────────────── */}
      <FilterForm
        action={PATH}
        defaults={{ status: 'active', sort: 'views', dir: 'desc' }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--surface-border)] bg-white p-4 dark:bg-[#0D1B2A]"
      >
        <label className={`flex min-w-[200px] flex-1 flex-col gap-1 text-xs ${muted}`}>
          ค้นหา (ชื่อ / slug)
          <input key={`q:${query.q}`} type="search" name="q" defaultValue={query.q} placeholder="พิมพ์แล้วกด Enter" className={field} />
        </label>
        <label className={`flex flex-col gap-1 text-xs ${muted}`}>
          Skill
          <AutoSubmitSelect key={`s:${query.skill}`} name="skill" defaultValue={query.skill} className={field}>
            <option value="">ทุก Skill</option>
            {query.skill && !data?.skillOptions.some((o) => o.id === query.skill) && (
              <option value={query.skill}>{query.skill}</option>
            )}
            {(data?.skillOptions ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </AutoSubmitSelect>
        </label>
        <label className={`flex flex-col gap-1 text-xs ${muted}`}>
          Program
          <AutoSubmitSelect key={`p:${query.program}`} name="program" defaultValue={query.program} className={field}>
            <option value="">ทุก Program</option>
            {query.program && !data?.programOptions.some((o) => o.id === query.program) && (
              <option value={query.program}>{query.program}</option>
            )}
            {(data?.programOptions ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </AutoSubmitSelect>
        </label>
        <label className={`flex flex-col gap-1 text-xs ${muted}`}>
          สถานะ
          <AutoSubmitSelect key={`st:${query.status}`} name="status" defaultValue={query.status} className={field}>
            <option value="active">แสดงอยู่</option>
            <option value="all">ทั้งหมด</option>
            <option value="hidden">ซ่อน</option>
          </AutoSubmitSelect>
        </label>

        <div className="flex flex-col gap-1">
          <span className={`text-xs ${muted}`}>ช่วงเวลา</span>
          <nav aria-label="ช่วงเวลา" className="inline-flex overflow-hidden rounded-9e-md border border-[var(--surface-border)]">
            {RANGE_PRESETS.map((d) => {
              const active = !customOpen && range.days === d;
              return (
                <Link key={d} href={href({ range: d, from: undefined, to: undefined, customOpen: false })} aria-current={active ? 'page' : undefined} className={segClass(active)}>
                  {d} วัน
                </Link>
              );
            })}
            <Link href={href({ range: undefined, from: undefined, to: undefined, customOpen: true })} aria-current={customOpen ? 'page' : undefined} className={segClass(customOpen)}>
              กำหนดเอง
            </Link>
          </nav>
        </div>

        {customOpen ? (
          <>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ตั้งแต่
              <input key={`f:${from}`} type="date" name="from" required defaultValue={range.input.from || from} className={field} />
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ถึง
              <input key={`t:${to}`} type="date" name="to" required defaultValue={range.input.to || to} className={field} />
            </label>
          </>
        ) : (
          state.range && state.range !== 30 && <input type="hidden" name="range" value={state.range} />
        )}
        {query.sort !== 'views' && <input type="hidden" name="sort" value={query.sort} />}
        {query.dir !== 'desc' && <input type="hidden" name="dir" value={query.dir} />}
        {query.zero && <input type="hidden" name="zero" value="1" />}
        <button type="submit" className="rounded-9e-md bg-9e-action px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
          ใช้ตัวกรอง
        </button>
        <p className={`basis-full text-xs ${muted}`}>
          {rangeLabel(range)} ({thaiDay(from)} – {thaiDay(to)}) · กำหนดเองได้สูงสุด {MAX_RANGE_DAYS} วัน
        </p>
        {range.error && (
          <p role="alert" className="basis-full text-xs text-red-600 dark:text-red-400">{range.error}</p>
        )}
      </FilterForm>

      {!data ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          อ่านข้อมูลไม่สำเร็จ — ลองโหลดหน้าใหม่อีกครั้ง
        </p>
      ) : (
        <>
          {/* ── KPIs ─────────────────────────────────────────────────── */}
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className={card} data-kpi="total">
              <dt className={`text-xs ${muted}`}>ยอดเปิดอ่านรวม</dt>
              <dd className="mt-1 text-2xl font-bold text-9e-navy dark:text-white">{nf(data.kpis.total)}</dd>
              <dd className="mt-1 text-[11px]">
                {!data.kpis.previousAvailable ? (
                  <span className={muted}>ยังไม่มีข้อมูลช่วงก่อนหน้า</span>
                ) : data.kpis.deltaPct === null ? (
                  <span className={muted}>ช่วงก่อนหน้าไม่มียอดเปิดอ่าน</span>
                ) : (
                  <span
                    className={
                      'rounded-full px-2 py-0.5 font-semibold ' +
                      (data.kpis.deltaPct >= 0
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300')
                    }
                  >
                    {data.kpis.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(data.kpis.deltaPct).toFixed(1)}% จากช่วงก่อนหน้า
                  </span>
                )}
              </dd>
            </div>
            <div className={card} data-kpi="read">
              <dt className={`text-xs ${muted}`}>บทความที่มีคนอ่าน</dt>
              <dd className="mt-1 text-2xl font-bold text-9e-navy dark:text-white">
                {nf(data.kpis.withViews)} / {nf(data.kpis.articleCount)}
              </dd>
              <dd className={`mt-1 text-[11px] ${muted}`}>{nf(data.kpis.zeroCount)} บทความไม่มีคนอ่านในช่วงนี้</dd>
            </div>
            <div className={card} data-kpi="avg">
              <dt className={`text-xs ${muted}`}>เฉลี่ยต่อวัน</dt>
              <dd className="mt-1 text-2xl font-bold text-9e-navy dark:text-white">
                {data.kpis.avgPerDay === null ? '—' : data.kpis.avgPerDay.toLocaleString('en-US', { maximumFractionDigits: 1 })}
              </dd>
              <dd className={`mt-1 text-[11px] ${muted}`}>นับเฉพาะวันที่เริ่มเก็บแล้ว</dd>
            </div>
            <div className={card} data-kpi="peak">
              <dt className={`text-xs ${muted}`}>วันที่ยอดสูงสุด</dt>
              <dd className="mt-1 text-2xl font-bold text-9e-navy dark:text-white">
                {data.kpis.peak ? nf(data.kpis.peak.value) : '—'}
              </dd>
              <dd className={`mt-1 text-[11px] ${muted}`}>{data.kpis.peak ? thaiDay(data.kpis.peak.day) : 'ยังไม่มียอดในช่วงนี้'}</dd>
            </div>
          </dl>

          {/* ── daily chart ─────────────────────────────────────────── */}
          <LineChart
            title="ยอดเปิดอ่านรายวัน"
            series={data.series.map((p, i) => ({
              label: thaiDayWithWeekday(p.day),
              value: p.value,
              meta: dayOverDay(p.value, data.series[i - 1]?.value),
            }))}
            formatValue={(v) => nf(v)}
            formatTooltipValue={(v) => `${nf(v)} ครั้ง`}
            formatTick={(_, i) => thaiDayTick(data.series[i].day)}
            emptyText="ยังไม่เริ่มเก็บข้อมูลในช่วงนี้"
            notCollectedBefore={firstCollectedIndex(data.series)}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* ── ranking table ─────────────────────────────────────── */}
            <section className={`${card} min-w-0 p-0`} aria-labelledby="ranking-h">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--surface-border)] px-4 py-3">
                <h2 id="ranking-h" className="text-sm font-semibold text-9e-navy dark:text-white">อันดับบทความ</h2>
                {query.zero && (
                  <span className="text-xs text-9e-navy dark:text-white">
                    แสดงเฉพาะบทความที่ไม่มีคนอ่าน ·{' '}
                    <Link href={href({ zero: false })} className="text-9e-action hover:underline dark:text-9e-air">ล้าง</Link>
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className={`bg-9e-ice text-left text-xs dark:bg-[#111d2c] ${muted}`}>
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">#</th>
                      <th scope="col" className="px-3 py-2 font-semibold">บทความ</th>
                      {sortHeader('views', 'ยอดเปิดอ่าน')}
                      <th scope="col" className="px-3 py-2 font-semibold">แนวโน้ม</th>
                      {sortHeader('published', 'เผยแพร่')}
                      {sortHeader('updated', 'แก้เนื้อหาล่าสุด')}
                    </tr>
                  </thead>
                  <tbody>
                    {data.pageData.total === 0 ? (
                      <tr>
                        <td colSpan={6} className={`px-3 py-10 text-center ${muted}`}>
                          {query.zero ? 'ไม่มีบทความที่ไม่มีคนอ่านในช่วงนี้' : 'ไม่พบบทความที่ตรงกับตัวกรอง'}
                        </td>
                      </tr>
                    ) : (
                      data.pageData.pageRows.map((r, i) => {
                        const daily = data.spark.get(r.id);
                        const values = buildDailySeries({ from, to, collectionStart: data.collectionStart, dayTotals: daily ?? new Map() }).map((p) => p.value);
                        const skills = (r.skills ?? []).map((id) => data.skillNames[id]).filter(Boolean);
                        return (
                          <tr key={r.id} className="border-t border-[var(--surface-border)] align-top text-9e-navy dark:text-white">
                            <td className={`px-3 py-2 tabular-nums ${muted}`}>{data.pageData.a + i}</td>
                            <td className="max-w-[360px] px-3 py-2">
                              <Link href={`/admin/articles/${r.id}/edit`} className="font-medium hover:text-9e-action hover:underline">
                                {r.title}
                              </Link>
                              {!r.active && <span className={`ml-2 text-[11px] ${muted}`}>(ซ่อน)</span>}
                              {skills.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {skills.map((name) => (
                                    <span key={name} className="rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-action dark:bg-[#111d2c] dark:text-9e-air">
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="tabular-nums font-semibold">{nf(r.views)}</div>
                              <div className="mt-1 h-1 w-28 rounded-full bg-9e-ice dark:bg-[#111d2c]">
                                <div className="h-1 rounded-full bg-9e-action dark:bg-9e-air" style={{ width: `${(r.views / pageMax) * 100}%` }} />
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Sparkline values={values} label={`แนวโน้มยอดเปิดอ่าน ${r.title}`} />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs">{formatThaiDate(r.publishedAt) ?? '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs">{formatThaiDate(lastContentDate(r)) ?? '—'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className={`flex flex-wrap items-center justify-between gap-2 border-t border-[var(--surface-border)] px-4 py-3 text-xs ${muted}`}>
                <span data-range-footer="">
                  แสดง {nf(data.pageData.a)}–{nf(data.pageData.b)} จาก {nf(data.pageData.total)} บทความ
                </span>
                {data.pageData.pageCount > 1 && (
                  <nav aria-label="แบ่งหน้า" className="flex items-center gap-2">
                    {data.pageData.page > 1 ? (
                      <Link href={href({ page: data.pageData.page - 1 })} className="rounded-9e-md border border-[var(--surface-border)] px-2 py-1 text-9e-navy hover:border-9e-action dark:text-white">ก่อนหน้า</Link>
                    ) : null}
                    <span>หน้า {data.pageData.page} / {data.pageData.pageCount}</span>
                    {data.pageData.page < data.pageData.pageCount ? (
                      <Link href={href({ page: data.pageData.page + 1 })} className="rounded-9e-md border border-[var(--surface-border)] px-2 py-1 text-9e-navy hover:border-9e-action dark:text-white">ถัดไป</Link>
                    ) : null}
                  </nav>
                )}
              </div>
            </section>

            {/* ── side cards ───────────────────────────────────────── */}
            <div className="space-y-4">
              <section className={card} aria-labelledby="skill-h">
                <h2 id="skill-h" className="text-sm font-semibold text-9e-navy dark:text-white">ยอดตาม Skill</h2>
                {data.skillBars.length === 0 ? (
                  <p className={`mt-3 text-xs ${muted}`}>ไม่มีบทความตามตัวกรองนี้</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {data.skillBars.map((s) => {
                      const bar = (
                        <>
                          <span className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="truncate text-9e-navy dark:text-white">{s.name}</span>
                            <span className="tabular-nums font-semibold text-9e-navy dark:text-white">{nf(s.value)}</span>
                          </span>
                          <span className="mt-1 block h-1.5 rounded-full bg-9e-ice dark:bg-[#111d2c]">
                            <span
                              className={`block h-1.5 rounded-full ${s.id === null ? 'bg-9e-slate-dp-50' : 'bg-9e-action dark:bg-9e-air'}`}
                              style={{ width: `${(s.value / skillMax) * 100}%` }}
                            />
                          </span>
                        </>
                      );
                      return (
                        <li key={s.id ?? '__none'}>
                          {s.id === null ? (
                            <div className="block">{bar}</div>
                          ) : (
                            <Link
                              href={href({ skill: s.id })}
                              aria-current={query.skill === s.id ? 'true' : undefined}
                              className={`block rounded-md px-1 py-0.5 hover:bg-9e-ice dark:hover:bg-[#111d2c] ${query.skill === s.id ? 'bg-9e-ice dark:bg-[#111d2c]' : ''}`}
                            >
                              {bar}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className={`mt-3 text-[11px] ${muted}`}>
                  บทความหนึ่งติดได้หลาย skill ผลรวมของทุกแท่งจึงมากกว่ายอดรวมจริง
                </p>
              </section>

              <section className={card} aria-labelledby="zero-h">
                <h2 id="zero-h" className="text-sm font-semibold text-9e-navy dark:text-white">ไม่มีคนอ่านในช่วงนี้</h2>
                <p className="mt-2 text-2xl font-bold text-9e-navy dark:text-white">
                  {nf(data.kpis.zeroCount)} <span className={`text-sm font-normal ${muted}`}>บทความ</span>
                </p>
                <Link href={href({ zero: true })} className="mt-1 inline-block text-xs font-medium text-9e-action hover:underline dark:text-9e-air">
                  ดูรายการ →
                </Link>
              </section>

              <section className={card} aria-labelledby="stale-h">
                <h2 id="stale-h" className="text-sm font-semibold text-9e-navy dark:text-white">ยอดดีแต่เนื้อหาเก่า</h2>
                <p className={`mt-2 text-[11px] ${muted}`}>{staleExplanation()}</p>
                {data.stale.length === 0 ? (
                  <p className="mt-3 text-xs text-9e-navy dark:text-white">ไม่มีบทความที่เข้าเกณฑ์ในช่วงนี้</p>
                ) : (
                  <ol className="mt-3 space-y-2">
                    {data.stale.map((r) => (
                      <li key={r.id} className="text-xs">
                        <Link href={`/admin/articles/${r.id}/edit`} className="font-medium text-9e-navy hover:text-9e-action hover:underline dark:text-white">
                          {r.title}
                        </Link>
                        <div className={muted}>
                          {nf(r.views)} ครั้ง · เนื้อหาอายุ {ageLabel(r.contentDate, now)}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
