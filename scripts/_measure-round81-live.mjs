/**
 * ROUND 81 §I/§K — full rounds on the RUNNING site, over HTTP.
 *
 * The component-boundary table (_measure-round81-five-states.mjs) proves what
 * each of the five states renders. This is the other half: what the public site
 * actually serves today, on the surface that already receives sold-out rounds
 * and on the page-builder page that could.
 *
 *   /schedule   passes PUBLIC_SCHEDULE_STATUSES, so `full` rounds ARRIVE. It is
 *               the only surface where the refusal is observable in production
 *               markup, and it is one of the four that already share the
 *               builder this round's section now calls — so a regression here
 *               would be a regression in the code the section was joined to.
 *   the builder page  `resolveSectionData` passes NO status, so no full round
 *               can reach a `course_schedule` today. Reported so the claim "no
 *               stored page changes today" is measured rather than restated.
 *
 * ── THE FLIGHT PAYLOAD IS STRIPPED, AND THAT IS NOT COSMETIC ───────────────
 * Next serialises the whole tree again into `self.__next_f.push(...)` scripts.
 * Every label appears twice, and the second copy is JSON with escaped quotes, so
 * a row matcher run over the raw response counts strings that are not markup and
 * cannot be clicked. Only the DOM ahead of the first flight script is examined.
 *
 * ── THE CONTROL IS THE LINKED COUNT ────────────────────────────────────────
 * "no full round is a link" and "the matcher found no rows" are the same zero.
 * The linked-row count is printed beside it and must be non-zero, or the run
 * says nothing.
 *
 * Nothing is written into public/. Run with the dev server up:
 *   node scripts/_measure-round81-live.mjs
 */
const BASE = process.env.BASE || 'http://localhost:3000';
const FULL = 'เต็ม';

async function look(pathname) {
  let res, html;
  try { res = await fetch(BASE + pathname); html = await res.text(); }
  catch (e) { console.log(`\n${pathname}  FETCH FAILED: ${e.message}`); return; }

  const dom = html.split('<script>self.__next_f.push')[0];
  console.log(`\n${pathname}  HTTP ${res.status}  ${html.length} bytes (${dom.length} before the flight payload)`);
  if (res.status !== 200) { console.log('  not served — nothing to measure'); return; }

  // Anything that is either a round LINK or an explicitly inert round block.
  const rows = dom.match(/<(a|span)\s[^>]*?(?:href="[^"]*&amp;class=[^"]*"|aria-disabled="true")[\s\S]*?<\/\1>/g) ?? [];
  const linked = rows.filter((r) => r.startsWith('<a '));
  const linkedFull = linked.filter((r) => r.includes(`>${FULL}<`));

  console.log(`  round rows matched      : ${rows.length}`);
  console.log(`  CONTROL linked rows     : ${linked.length}  (a zero here voids the line below)`);
  console.log(`  เต็ม rows that ARE links : ${linkedFull.length}  <- the defect; must be 0`);
  for (const r of linkedFull) console.log(`    ! ${r.slice(0, 160)}`);

  // The page-builder section specifically. Keyed on the CalendarDays ornament,
  // NOT on `--pb-accent-fill`: nine other components paint with that variable,
  // and checklist draws its tick with it inside an <li>. An accent-keyed
  // selector reported this page's two CHECKLIST items as schedule rows — a
  // false positive that would have read as "the section renders, unlinked".
  const pb = dom.match(/<li[^>]*>(?:(?!<\/li>)[\s\S])*?lucide-calendar-days[\s\S]*?<\/li>/g) ?? [];
  console.log(`  course_schedule rows on this page: ${pb.length}`);
  for (const li of pb) {
    const a = li.match(/<a\s+href="([^"]*)"/);
    const chip = li.match(/<span class="shrink-0 rounded-full[^"]*"[^>]*>([^<]*)</);
    console.log(`    anchored=${Boolean(a)} href=${a ? a[1] : 'null'} chip="${chip ? chip[1] : 'none'}"`);
  }
}

for (const p of (process.env.PATHS || '/schedule,/promotions/early-bird-claude-code').split(',')) {
  await look(p);
}
