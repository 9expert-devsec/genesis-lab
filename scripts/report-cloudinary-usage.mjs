/**
 * Cloudinary credit consumption — READ-ONLY.
 *
 * This script performs NO writes. Two Admin API GETs (`usage`, and `usage` for
 * a series of past dates) and a print. There is no `uploader.*`, no
 * `api.delete_*`, no `api.update`, no `api.create_*` anywhere in this file. It
 * does not touch MongoDB and imports nothing from `src/`.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The account sits at 8.43 of 25 credits before the legacy-file migration adds
 * anything, and the Free plan SUSPENDS rather than bills when the quota is
 * exhausted. So "will the migration break the site" is a real question, and it
 * has two completely different answers depending on WHERE those credits go:
 *
 *   · if the 33.7% is mostly STORAGE, the migration is the risk, and the
 *     decision is about how many files we carry across.
 *   · if it is mostly BANDWIDTH, the migration is nearly irrelevant and the
 *     risk is TRAFFIC — what happens when genesis becomes the main site. No
 *     amount of pruning the file list would move that number.
 *
 * Those lead to opposite plans, so the split is printed first and the verdict
 * is stated in one line rather than left to be inferred from a table.
 *
 * ── WHAT A CREDIT IS ────────────────────────────────────────────────────────
 * Cloudinary bills three different things into one currency. The conversion
 * rates are NOT hardcoded here — they are DERIVED from the account's own
 * reported usage and credit figures, so if Cloudinary changes them or the plan
 * changes, this script reports the new reality instead of a stale constant.
 * They are printed so the arithmetic can be checked by eye.
 *
 * ── THE HISTORY PROBE, AND WHY IT MATTERS ───────────────────────────────────
 * The headline `usage` call returns the CURRENT BILLING PERIOD to date. It does
 * not say when that period started, and the difference is everything: 8.43
 * credits in a full month is a comfortable 34%, while 8.43 credits five days
 * into a month projects to ~50 and the account is suspended before anyone
 * touches the migration.
 *
 * Passing `date` to the same endpoint returns that SINGLE DAY's usage, not a
 * running total. Sampling a spread of days therefore gives a daily bandwidth
 * rate, and comparing that rate against the period total says roughly how much
 * of a period the total covers. That is an inference, not a reading, and it is
 * labelled as one in the output.
 *
 * Usage:  node --env-file=.env.local scripts/report-cloudinary-usage.mjs
 *   or:   npm run report:cloudinary
 */

import { v2 as cloudinary } from 'cloudinary';

/** Days sampled backwards for the rate estimate. Read-only, one call each. */
const HISTORY_DAYS = 30;

/** Cloudinary keeps a limited history; a failed day is skipped, not fatal. */
const GB = 1_000_000_000;

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }

const pad = (s, n) => String(s ?? '').padEnd(n);
const padL = (s, n) => String(s ?? '').padStart(n);
const rule = (n) => '-'.repeat(n);
const gb = (bytes) => (bytes / GB).toFixed(3);
const pct = (n, of) => (of > 0 ? ((n / of) * 100).toFixed(1) : '0.0');

/** YYYY-MM-DD, `back` days before today, in UTC. */
function isoDay(back) {
  const d = new Date(Date.now() - back * 86_400_000);
  return d.toISOString().slice(0, 10);
}

async function main() {
  for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
    if (!process.env[k]) die(`${k} not set — pass --env-file=.env.local`);
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  let u;
  try {
    u = await cloudinary.api.usage();
  } catch (err) {
    die(`Admin API usage call failed: ${err?.message ?? err}`);
  }

  const limit = u.credits?.limit ?? 0;
  const used = u.credits?.usage ?? 0;
  const remaining = limit - used;

  const rows = [
    { key: 'bandwidth', label: 'bandwidth (delivery)', raw: u.bandwidth?.usage ?? 0, credits: u.bandwidth?.credits_usage ?? 0, unit: 'GB', display: gb(u.bandwidth?.usage ?? 0) },
    { key: 'transformations', label: 'transformations', raw: u.transformations?.usage ?? 0, credits: u.transformations?.credits_usage ?? 0, unit: 'ops', display: String(u.transformations?.usage ?? 0) },
    { key: 'storage', label: 'storage (at rest)', raw: u.storage?.usage ?? 0, credits: u.storage?.credits_usage ?? 0, unit: 'GB', display: gb(u.storage?.usage ?? 0) },
  ];
  const sorted = [...rows].sort((a, b) => b.credits - a.credits);
  const totalCredits = rows.reduce((n, r) => n + r.credits, 0);

  console.log('');
  console.log('══ Cloudinary credit consumption — READ-ONLY, NOTHING WAS MODIFIED ══════');
  console.log('');
  console.log(`   cloud        : ${process.env.CLOUDINARY_CLOUD_NAME}`);
  console.log(`   plan         : ${u.plan}${/free/i.test(u.plan ?? '') ? '  — SUSPENDS at the quota, it does not bill overage' : ''}`);
  console.log(`   last updated : ${u.last_updated ?? '(unknown)'}   requested for: ${u.date_requested ?? '(unknown)'}`);
  console.log('');

  // ── A. the split ─────────────────────────────────────────────────────────
  console.log('── A. WHAT THE CREDITS ARE ACTUALLY SPENT ON ───────────────────────────');
  console.log('');
  console.log(`  ${pad('component', 24)} ${padL('usage', 14)} ${padL('credits', 9)} ${padL('% of spend', 11)} ${padL('% of plan', 10)}`);
  console.log(`  ${rule(24)} ${rule(14)} ${rule(9)} ${rule(11)} ${rule(10)}`);
  for (const r of sorted) {
    console.log(`  ${pad(r.label, 24)} ${padL(`${r.display} ${r.unit}`, 14)} ${padL(r.credits.toFixed(2), 9)} ${padL(`${pct(r.credits, totalCredits)}%`, 11)} ${padL(`${pct(r.credits, limit)}%`, 10)}`);
  }
  console.log(`  ${rule(24)} ${rule(14)} ${rule(9)} ${rule(11)} ${rule(10)}`);
  console.log(`  ${pad('TOTAL', 24)} ${padL('', 14)} ${padL(used.toFixed(2), 9)} ${padL('', 11)} ${padL(`${pct(used, limit)}%`, 10)}`);
  console.log('');
  console.log(`  plan limit ${limit} credits   ·   used ${used.toFixed(2)}   ·   REMAINING ${remaining.toFixed(2)}`);
  console.log('');

  // The one line the whole script exists to produce.
  const top = sorted[0];
  const share = Number(pct(top.credits, totalCredits));
  console.log(`  ▶ ${top.label.toUpperCase()} DOMINATES — ${top.credits.toFixed(2)} of ${used.toFixed(2)} credits (${share}% of spend).`);
  if (top.key === 'bandwidth') {
    console.log('');
    console.log('    That makes this a TRAFFIC decision, not a storage decision. The credit');
    console.log('    line that will exhaust this plan scales with how many people load pages,');
    console.log('    NOT with how many files the migration carries across. Cutting the file');
    console.log('    list would move the storage row, which is the smallest of the three.');
  } else if (top.key === 'storage') {
    console.log('');
    console.log('    That makes this a STORAGE decision: what the migration carries across is');
    console.log('    the number that matters, and pruning the file list moves it directly.');
  } else {
    console.log('');
    console.log('    Transformations dominate — that is delivery-time image processing, driven');
    console.log('    by how many distinct variants get requested, not by library size.');
  }
  console.log('');

  // ── B. derived rates ─────────────────────────────────────────────────────
  console.log('── B. WHAT ONE CREDIT BUYS (derived from this account, not hardcoded) ──');
  console.log('');
  for (const r of rows) {
    if (r.credits <= 0) { console.log(`  ${pad(r.label, 24)} no usage recorded — rate cannot be derived`); continue; }
    const perCredit = r.raw / r.credits;
    const display = r.unit === 'GB' ? `${(perCredit / GB).toFixed(2)} GB` : `${Math.round(perCredit)} ops`;
    console.log(`  ${pad(r.label, 24)} 1 credit ≈ ${display}`);
  }
  console.log('');
  console.log('  These are computed as usage ÷ credits_usage from the figures in section A,');
  console.log('  so they describe THIS account today rather than a documented list price.');
  console.log('');

  // ── C. objects and limits ────────────────────────────────────────────────
  console.log('── C. OBJECTS AND PER-ASSET LIMITS ─────────────────────────────────────');
  console.log('');
  console.log(`  objects (total)     : ${u.objects?.usage ?? '(not reported)'}`);
  console.log(`  resources           : ${u.resources ?? '(not reported)'}`);
  console.log(`  derived resources   : ${u.derived_resources ?? '(not reported)'}`);
  console.log(`  requests            : ${u.requests ?? '(not reported)'}`);
  console.log('');
  const ml = u.media_limits ?? {};
  console.log('  per-asset size ceilings — an upload above these is REFUSED outright:');
  console.log(`  ${pad('resource type', 22)} ${padL('max size', 14)}`);
  console.log(`  ${rule(22)} ${rule(14)}`);
  for (const [k, label] of [['image_max_size_bytes', 'image'], ['raw_max_size_bytes', 'raw'], ['video_max_size_bytes', 'video']]) {
    if (ml[k] === undefined) continue;
    console.log(`  ${pad(label, 22)} ${padL(`${(ml[k] / 1048576).toFixed(0)} MB`, 14)}`);
  }
  if (ml.image_max_px) console.log(`  ${pad('image max pixels', 22)} ${padL(ml.image_max_px.toLocaleString(), 14)}`);
  console.log('');
  console.log('  PDFs count as `image` unless uploaded with resource_type: raw. Both ceilings');
  console.log(`  are ${((ml.raw_max_size_bytes ?? 0) / 1048576).toFixed(0)} MB here, so neither route stores a larger file.`);
  console.log('');

  // ── D. daily history ─────────────────────────────────────────────────────
  console.log(`── D. DAILY RATE — ${HISTORY_DAYS} days sampled ─────────────────────────────────`);
  console.log('');
  console.log('  The headline figure above is the CURRENT BILLING PERIOD TO DATE, and the API');
  console.log('  does not say when that period began. Passing `date` returns that ONE DAY, so');
  console.log('  sampling gives a rate that can be compared against the period total.');
  console.log('');

  const days = [];
  for (let i = 1; i <= HISTORY_DAYS; i += 1) {
    const date = isoDay(i);
    try {
      const d = await cloudinary.api.usage({ date });
      days.push({
        date,
        bandwidth: d.bandwidth?.usage ?? 0,
        storage: d.storage?.usage ?? 0,
        transformations: d.transformations?.usage ?? 0,
        objects: d.objects?.usage ?? 0,
      });
    } catch {
      // Outside the retained window, or rate-limited. Skipped, not fatal.
    }
  }

  if (!days.length) {
    console.log('  No daily history available — the rate cannot be estimated, and therefore');
    console.log('  neither can how much of a billing period the headline figure covers.');
  } else {
    const bwTotal = days.reduce((n, d) => n + d.bandwidth, 0);
    const bwPerDay = bwTotal / days.length;
    const txPerDay = days.reduce((n, d) => n + d.transformations, 0) / days.length;

    console.log(`  ${pad('date', 14)} ${padL('bandwidth', 12)} ${padL('storage', 11)} ${padL('transf.', 9)} ${padL('objects', 9)}`);
    console.log(`  ${rule(14)} ${rule(12)} ${rule(11)} ${rule(9)} ${rule(9)}`);
    for (const d of days.slice(0, 12)) {
      console.log(`  ${pad(d.date, 14)} ${padL(`${gb(d.bandwidth)} GB`, 12)} ${padL(`${(d.storage / 1e6).toFixed(0)} MB`, 11)} ${padL(d.transformations, 9)} ${padL(d.objects, 9)}`);
    }
    if (days.length > 12) console.log(`  … ${days.length - 12} more day(s) sampled and included in the averages below.`);
    console.log('');
    console.log(`  mean bandwidth      : ${gb(bwPerDay)} GB/day  →  ${gb(bwPerDay * 30)} GB per 30 days`);
    console.log(`  mean transformations: ${txPerDay.toFixed(0)} /day`);
    console.log('');

    const bwCredits = rows.find((r) => r.key === 'bandwidth')?.raw ?? 0;
    const impliedDays = bwPerDay > 0 ? bwCredits / bwPerDay : null;
    if (impliedDays) {
      console.log(`  INFERENCE, not a reading: the period's ${gb(bwCredits)} GB of bandwidth at`);
      console.log(`  ${gb(bwPerDay)} GB/day implies the period covers roughly ${impliedDays.toFixed(0)} day(s).`);
      if (impliedDays >= 25) {
        console.log('  That is close to a full month, so the headline percentage is a MONTHLY');
        console.log('  figure and is not about to jump when the rest of the month elapses.');
      } else {
        console.log(`  ⚠ That is well short of a month. If the cycle is monthly, ${used.toFixed(2)} credits so`);
        console.log(`    far projects to roughly ${(used * (30 / impliedDays)).toFixed(0)} by the reset — against a ${limit} limit.`);
        console.log('    CHECK THE CYCLE START IN THE DASHBOARD before trusting the headroom below.');
      }
      console.log('');
    }

    // ── E. headroom ────────────────────────────────────────────────────────
    console.log('── E. HEADROOM ─────────────────────────────────────────────────────────');
    console.log('');
    const bwPerCredit = bwCredits > 0 ? bwCredits / (u.bandwidth?.credits_usage || 1) : GB;
    const extraGb = (remaining * bwPerCredit) / GB;
    const multiple = (u.bandwidth?.credits_usage ?? 0) > 0 ? remaining / u.bandwidth.credits_usage : null;

    console.log(`  credits remaining this period : ${remaining.toFixed(2)} of ${limit}`);
    console.log(`  if spent entirely on delivery : ~${extraGb.toFixed(1)} GB of additional bandwidth`);
    if (multiple) {
      console.log('');
      console.log(`  ▶ Traffic could grow about ${(1 + multiple).toFixed(1)}× from today before the plan`);
      console.log('    suspends — ASSUMING storage and transformations stay where they are.');
      console.log('    Migrating files raises storage a little and raises bandwidth by however');
      console.log('    much those files are actually requested, which is a traffic question.');
    }
    console.log('');
  }

  console.log('══ end of report. Nothing was uploaded, modified or deleted. ════════════');
  console.log('');
}

main().catch((err) => { console.error(err); process.exit(1); });
