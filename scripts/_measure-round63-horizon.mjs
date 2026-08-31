/**
 * ROUND 63 (part 4) — how fast a CHOSEN round stops existing.
 *
 * excludeStartedRounds drops a round the moment its FIRST training day arrives,
 * so the distance to that day is the shelf life of any stored selection. This is
 * the number section C of docs/course-schedule-selection.md answers to: the
 * dominant orphan cause is the calendar, not an upstream deletion.
 *
 * READ-ONLY. Writes nothing.
 * Run: node --env-file=.env.local scripts/_measure-round63-horizon.mjs
 */
import { register } from 'node:module';
register(new URL('../test/loader.mjs', import.meta.url));
const { PUBLIC_SCHEDULE_STATUSES, getAllSchedules } = await import('@/lib/api/schedules');
const { items = [] } = await getAllSchedules({ status: PUBLIC_SCHEDULE_STATUSES });
const today = new Date();
const days = items.map((r) => Math.round((new Date(r.dates[0]) - today) / 86400000)).sort((a,b)=>a-b);
console.log(`HORIZON to a round's FIRST day (days from ${today.toISOString().slice(0,10)}):`);
console.log(`  min=${days[0]} p25=${days[Math.floor(days.length*0.25)]} median=${days[Math.floor(days.length/2)]} p75=${days[Math.floor(days.length*0.75)]} max=${days[days.length-1]}`);
for (const w of [30, 60, 90, 180]) console.log(`  rounds starting within ${w} days: ${days.filter((d)=>d<=w).length}/${days.length}`);
