/**
 * Skill short-code repair: RPA → AUT — DRY RUN BY DEFAULT.
 *
 * Writes NOTHING unless `--apply` is passed.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Upstream renamed one skill on 2026-08-04: `skill_name` RPA → Automation and
 * `skill_id` RPA → AUT. The `_id` did NOT change. Everything in this codebase
 * that references a skill by its OBJECTID kept working and nobody noticed;
 * everything that references it by its SHORT CODE broke, silently, because
 * every one of those call sites drops an id it cannot resolve rather than
 * reporting it.
 *
 * Two stale-code repairs, each independently selectable:
 *
 *   A  articles.skills   'RPA' → 'AUT'  (2 documents)
 *      Restores the Automation chip on those articles' cards and puts
 *      Automation back in the /articles filter dropdown. That dropdown is
 *      built from the codes ARTICLES CARRY (listUsedArticleSkillIds) resolved
 *      through the upstream skill list, and an unresolvable code is dropped —
 *      so today the option does not exist at all and `?skill=AUT` returns
 *      nothing.
 *
 *   B  skill_orders      programOrder: ghost 'RPA' row → live 'AUT' row
 *      The admin's per-skill program curation was written against the old
 *      code. The rename left it stranded on a row that now matches no skill,
 *      while the row that DOES match carries an empty array.
 *
 * ── THE SWEEP RUNS FIRST, AND CAN REFUSE ────────────────────────────────────
 * Before either repair, an exhaustive read-only scan looks for the literal
 * string 'RPA' in every field of every document of every collection. The three
 * locations above are the ones that were measured; the point of the sweep is
 * the FOURTH one nobody thought of. A skill code can be stranded anywhere a
 * skill is referenced by code — local_faqs refs, page-builder section
 * payloads, ProgramPageConfig, the landing cache — and repairing two of four
 * places is worse than repairing none, because it looks finished.
 *
 * If the sweep finds an exact 'RPA' outside the three known locations, the
 * script STOPS and writes nothing, in dry run and under --apply alike.
 *
 * Usage:
 *   npm run migrate:skill-code                        # dry run, writes nothing
 *   npm run migrate:skill-code -- --only=articles     # one repair at a time
 *   npm run migrate:skill-code -- --apply             # writes, then re-verifies
 *   npm run migrate:skill-code -- --apply --force     # override the B guard
 */

import mongoose from 'mongoose';

const OLD_CODE = 'RPA';
const NEW_CODE = 'AUT';

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').split('=')[1] ?? 'all';

const WANT_ARTICLES = ONLY === 'all' || ONLY === 'articles';
const WANT_PROGRAMORDER = ONLY === 'all' || ONLY === 'programorder';

/**
 * The only places an exact 'RPA' is EXPECTED, as `collection.fieldPath`.
 * Anything else the sweep turns up stops the run.
 *
 * `skill_page_configs.skillId` is on this list but is NOT repaired here: that
 * row is what `/rpa-all-courses` still resolves through, and deleting or
 * rewriting it is an admin decision about a URL with SEO history, not a data
 * repair. COMMIT 1's permanent redirect makes the URL correct either way.
 */
const KNOWN = new Set([
  'articles.skills[]',
  'skill_orders.skillId',
  'skill_page_configs.skillId',
]);

/**
 * Locations that hold the old code and MUST KEEP IT. Reported every run, never
 * repaired, and they do not stop the script.
 *
 * `webhook_logs.payload` is the verbatim body MSDB sent us. It is an audit
 * record of WHAT ARRIVED, and rewriting it would not fix anything — nothing
 * joins on it, the admin page only displays it — while destroying the only
 * evidence of when the rename actually happened. Measured 2026-08-04: 28 logs
 * carry `RPA`, all dated 2026-07-23/24, and 12 later logs already carry `AUT`;
 * the collection has a 30-day TTL, so every one of them expires on its own.
 *
 * This list is separate from KNOWN on purpose. KNOWN means "this script fixes
 * it"; this means "this script must not touch it". Collapsing the two would
 * make an unrepaired location indistinguishable from a repaired one.
 */
const IMMUTABLE = [/^webhook_logs\.payload\./];

const isImmutable = (key) => IMMUTABLE.some((re) => re.test(key));

function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

const pad = (s, n) => String(s).padEnd(n);
const short = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

/**
 * Every path in a document whose value is EXACTLY the old code.
 *
 * Exact equality, not `includes`: a substring scan matches every article body
 * that mentions RPA in prose and every slug like `rpa-developer-career-path`,
 * which is hundreds of hits none of which are a stranded code. Those are
 * reported separately, as a count, so their absence from the blocking list is
 * a decision rather than an oversight.
 *
 * Array elements collapse to `field[]` so a hit is reported per field, not per
 * index — otherwise one document with the code in three array slots reads as
 * three separate problems.
 */
function findExact(value, trail = '') {
  const hits = [];
  if (Array.isArray(value)) {
    for (const v of value) hits.push(...findExact(v, `${trail}[]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      hits.push(...findExact(v, trail ? `${trail}.${k}` : k));
    }
  } else if (typeof value === 'string' && value === OLD_CODE) {
    hits.push(trail);
  }
  return [...new Set(hits)];
}

/** Does the document mention the code in any other way (prose, slug, …)? */
function mentionsLoosely(doc) {
  return /rpa/i.test(JSON.stringify(doc));
}

// ── the sweep ──────────────────────────────────────────────────────

async function sweep(db) {
  const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();
  const exact = new Map();   // "collection.path" → [ _id, … ]
  let looseDocs = 0;
  let scanned = 0;

  for (const name of collections) {
    const docs = await db.collection(name).find({}).toArray();
    for (const doc of docs) {
      scanned += 1;
      for (const path of findExact(doc)) {
        const key = `${name}.${path}`;
        if (!exact.has(key)) exact.set(key, []);
        exact.get(key).push(String(doc._id));
      }
      if (mentionsLoosely(doc)) looseDocs += 1;
    }
  }

  return { collections, exact, looseDocs, scanned };
}

function reportSweep({ collections, exact, looseDocs, scanned }) {
  console.log('── 0 · SWEEP · every field holding the exact string "RPA" ──────────────');
  console.log(`   collections scanned : ${collections.length}`);
  console.log(`   documents scanned   : ${scanned}`);
  console.log('');

  if (exact.size === 0) {
    console.log('   nothing holds the exact code — both repairs are already done,');
    console.log('   or were never needed.');
  } else {
    console.log(`   ${pad('collection.field', 44)} ${pad('docs', 6)} status`);
    console.log(`   ${'-'.repeat(44)} ${'-'.repeat(6)} ${'-'.repeat(24)}`);
    for (const [key, ids] of [...exact].sort()) {
      const status = KNOWN.has(key)
        ? 'repaired here'
        : isImmutable(key)
          ? 'IMMUTABLE · left alone'
          : '⚠ UNEXPECTED';
      console.log(`   ${pad(short(key, 43), 44)} ${pad(ids.length, 6)} ${status}`);
    }
  }
  console.log('');
  console.log(`   ${looseDocs} document(s) mention "rpa" in some other form (prose, slugs like`);
  console.log('   rpa-developer-career-path, URLs). Those are NOT stranded codes and are');
  console.log('   deliberately excluded — this script repairs identifiers, not content.');
  console.log('');

  const immutableHits = [...exact.keys()].filter(isImmutable).sort();
  if (immutableHits.length > 0) {
    console.log('   The IMMUTABLE rows above are audit records of what upstream sent. They');
    console.log('   are reported every run so their absence from the repair is a decision');
    console.log('   you can see, not an omission. See the IMMUTABLE list in this file.');
    console.log('');
  }

  return [...exact.keys()].filter((k) => !KNOWN.has(k) && !isImmutable(k)).sort();
}

// ── repair A · articles.skills ─────────────────────────────────────

async function planArticles(db) {
  const docs = await db
    .collection('articles')
    .find({ skills: OLD_CODE })
    .project({ slug: 1, title: 1, skills: 1, active: 1 })
    .toArray();

  return docs.map((d) => {
    const before = Array.isArray(d.skills) ? d.skills : [];
    // Replace in place, then dedupe: a document already carrying BOTH codes
    // would otherwise end up with 'AUT' twice, and `skills` is a multikey
    // index used by the ?skill= filter.
    const after = [...new Set(before.map((c) => (c === OLD_CODE ? NEW_CODE : c)))];
    return { _id: d._id, slug: d.slug, title: d.title, active: d.active, before, after };
  });
}

function reportArticles(plan) {
  console.log('── A · articles.skills · RPA → AUT ─────────────────────────────────────');
  console.log('   Effect: these articles get their Automation chip back, and Automation');
  console.log('   reappears in the /articles filter dropdown. Nothing else about them');
  console.log('   changes — not their order, not their publish state.');
  console.log('');
  if (plan.length === 0) {
    console.log('   nothing to change — no article carries the old code.');
    console.log('');
    return;
  }
  for (const p of plan) {
    console.log(`   ${short(p.slug ?? '(no slug)', 68)}`);
    console.log(`     ${short(p.title ?? '', 68)}`);
    console.log(`     active : ${p.active === true}`);
    console.log(`     before : [${p.before.join(', ')}]`);
    console.log(`     after  : [${p.after.join(', ')}]`);
    console.log('');
  }
  console.log(`   would write ${plan.length} document(s).`);
  console.log('');
}

// ── repair B · skill_orders.programOrder ───────────────────────────

async function planProgramOrder(db) {
  const col = db.collection('skill_orders');
  const ghost = await col.findOne({ skillId: OLD_CODE });
  const live = await col.findOne({ skillId: NEW_CODE });

  const ghostOrder = Array.isArray(ghost?.programOrder) ? ghost.programOrder : [];
  const liveOrder = Array.isArray(live?.programOrder) ? live.programOrder : [];

  let refusal = null;
  if (!ghost) refusal = `no skill_orders row with skillId "${OLD_CODE}" — nothing to copy from`;
  else if (!live) refusal = `no skill_orders row with skillId "${NEW_CODE}" — run the admin skill sync first`;
  else if (ghostOrder.length === 0) refusal = 'the ghost row carries an empty programOrder — nothing to copy';
  else if (liveOrder.length > 0 && !FORCE) {
    refusal =
      `the ${NEW_CODE} row already carries ${liveOrder.length} program(s) — someone has ` +
      're-curated it since the measurement. Re-run with --force to overwrite it.';
  }

  return { ghost, live, ghostOrder, liveOrder, refusal };
}

function reportProgramOrder(plan) {
  console.log('── B · skill_orders.programOrder · ghost RPA row → live AUT row ────────');
  console.log('   Effect: the per-skill program order the admin curated before the');
  console.log('   rename applies to Automation again.');
  console.log('');
  console.log(`   ghost row (${OLD_CODE}) : ${plan.ghost ? `${plan.ghostOrder.length} program(s) — [${plan.ghostOrder.join(', ')}]` : 'ABSENT'}`);
  console.log(`   live row  (${NEW_CODE}) : ${plan.live ? `${plan.liveOrder.length} program(s) — [${plan.liveOrder.join(', ')}]` : 'ABSENT'}`);
  console.log('');
  console.log('   COPY, NOT MOVE — and deliberately: the ghost row is left byte-identical,');
  console.log('   so this is reversible by hand. Re-running is prevented by the guard');
  console.log('   above (a non-empty target refuses without --force), not by destroying');
  console.log('   the only copy of the data. The ghost row is NOT deleted: that is a');
  console.log('   separate decision, and once the mega menu ignores unmatched codes the');
  console.log('   row is inert.');
  console.log('');
  if (plan.refusal) {
    console.log(`   ⚠ REFUSING: ${plan.refusal}`);
  } else {
    console.log('   would write 1 document.');
  }
  console.log('');
}

// ── main ───────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) die('MONGODB_URI not set — pass it via --env-file=.env.local');
  if (!['all', 'articles', 'programorder'].includes(ONLY)) {
    die(`--only=${ONLY} is not one of: articles, programorder`);
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  console.log('');
  console.log('══ skill code migration · RPA → AUT ════════════════════════════════════');
  console.log(`   MODE       : ${APPLY ? '--apply  (WILL WRITE)' : 'dry run  (writes nothing)'}`);
  console.log(`   REPAIRS    : ${ONLY === 'all' ? 'A + B' : ONLY}`);
  console.log(`   DATABASE   : ${db.databaseName}`);
  console.log('');

  // ── the sweep gate ───────────────────────────────────────────────
  const unexpected = reportSweep(await sweep(db));
  if (unexpected.length > 0) {
    console.error('✖ STOPPING. The sweep found the old code in places this script does not');
    console.error('  know how to repair:');
    for (const k of unexpected) console.error(`     ${k}`);
    console.error('');
    console.error('  Repairing only the known locations would leave those stranded while');
    console.error('  looking finished. Decide what they are first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const articlePlan = WANT_ARTICLES ? await planArticles(db) : null;
  const orderPlan = WANT_PROGRAMORDER ? await planProgramOrder(db) : null;

  if (articlePlan) reportArticles(articlePlan);
  if (orderPlan) reportProgramOrder(orderPlan);

  // ── write, or don't ──────────────────────────────────────────────
  if (!APPLY) {
    console.log('════════════════════════════════════════════════════════════════════════');
    console.log('   NOTHING WAS WRITTEN. This was a dry run.');
    console.log('');
    console.log('   To apply, run it yourself:');
    console.log('     npm run migrate:skill-code -- --apply');
    console.log('════════════════════════════════════════════════════════════════════════');
    console.log('');
    await mongoose.disconnect();
    return;
  }

  const failures = [];

  if (articlePlan?.length) {
    const res = await db.collection('articles').bulkWrite(
      articlePlan.map((p) => ({
        updateOne: { filter: { _id: p._id }, update: { $set: { skills: p.after } } },
      }))
    );
    console.log(`   A · wrote ${res?.modifiedCount ?? articlePlan.length} article(s).`);
  }

  if (orderPlan && !orderPlan.refusal) {
    await db.collection('skill_orders').updateOne(
      { skillId: NEW_CODE },
      { $set: { programOrder: orderPlan.ghostOrder } }
    );
    console.log('   B · wrote 1 skill_orders row.');
  } else if (orderPlan?.refusal) {
    console.log(`   B · skipped — ${orderPlan.refusal}`);
  }
  console.log('');

  // ── re-read and verify what actually landed ──────────────────────
  if (WANT_ARTICLES) {
    const stillOld = await db.collection('articles').countDocuments({ skills: OLD_CODE });
    if (stillOld > 0) failures.push(`${stillOld} article(s) still carry "${OLD_CODE}"`);

    for (const p of articlePlan ?? []) {
      const doc = await db.collection('articles').findOne({ _id: p._id }, { projection: { skills: 1, slug: 1 } });
      const got = doc?.skills ?? [];
      if (JSON.stringify(got) !== JSON.stringify(p.after)) {
        failures.push(`${p.slug}: expected [${p.after.join(', ')}], read back [${got.join(', ')}]`);
      }
      if (new Set(got).size !== got.length) failures.push(`${p.slug}: skills contains duplicates`);
    }
  }

  if (WANT_PROGRAMORDER && orderPlan && !orderPlan.refusal) {
    const live = await db.collection('skill_orders').findOne({ skillId: NEW_CODE });
    const got = live?.programOrder ?? [];
    if (JSON.stringify(got) !== JSON.stringify(orderPlan.ghostOrder)) {
      failures.push(
        `${NEW_CODE}.programOrder: expected [${orderPlan.ghostOrder.join(', ')}], read back [${got.join(', ')}]`
      );
    }
    const ghost = await db.collection('skill_orders').findOne({ skillId: OLD_CODE });
    if (!ghost) failures.push('the ghost row was deleted — this script must not delete it');
  }

  if (failures.length > 0) {
    console.error('✖ POST-WRITE VERIFICATION FAILED:');
    for (const f of failures) console.error(`   - ${f}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('   ✔ verified by re-reading: no document carries the old code in a repaired');
  console.log('     field, every changed array matches its plan exactly and holds no');
  console.log('     duplicates, and the ghost row is still present.');
  console.log('');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
