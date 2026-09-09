/** ORIGIN-1 - READ-ONLY. What is actually IN the 77, and what are the 4 other origins? */
const BASE = process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai';
const KEY  = process.env.AI_API_KEY;
async function get(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { 'x-api-key': KEY, accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} on ${path}`);
  return res.json();
}
const items = (j) => j.items ?? j.data?.items ?? j.data ?? [];

const courses = items(await get('/public-course', { limit: 5000 }));
const code = (c) => String(c.course_id ?? c.courseId ?? '');
const suspicious = courses.filter((c) => /^zz|test/i.test(code(c)) || /test/i.test(String(c.course_name ?? '')));
console.log('=== upstream /public-course rows:', courses.length, '===');
console.log('rows whose code looks like a TEST row:', suspicious.length);
for (const c of suspicious) console.log(`  - ${code(c)}  |  ${c.course_name}  |  status=${c.status ?? '(unset)'}`);
console.log('\nstatus histogram across all rows:');
const hist = {};
for (const c of courses) hist[String(c.status ?? '(unset)')] = (hist[String(c.status ?? '(unset)')] ?? 0) + 1;
console.log(' ', hist);
console.log('\nfirst 5 codes:', courses.slice(0, 5).map(code).join(', '));

const sched = items(await get('/schedules', { from: '2000-01-01', limit: 5000 }));
const other = sched.filter((r) => r.signup_url && !r.signup_url.includes('genesis-lab.9expert.app') && !r.signup_url.includes('9experttraining.com'));
console.log('\n=== the 4 "other origin" signup_urls ===');
for (const r of other) console.log('  -', r.signup_url);
