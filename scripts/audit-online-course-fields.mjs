/**
 * Read-only field audit for the online-course card.
 *
 * GET-only by construction. Never writes to MSDB, never writes to Mongo.
 * Reads the API key from the same env the app uses (AI_API_KEY) and never
 * prints it.
 *
 * Usage: node scripts/audit-online-course-fields.mjs
 * Output: stdout (markdown) + audit-online-course-fields.out.md in $AUDIT_OUT_DIR
 */

import fs from 'node:fs';
import path from 'node:path';

// ── env loading (repo has no dotenv dependency) ───────────────────────────
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnvFile(path.resolve('.env.local'));

const BASE = process.env.AI_API_BASE ?? 'https://9exp-sec.com/api/ai';
const KEY = process.env.AI_API_KEY;
if (!KEY) {
  console.error('AI_API_KEY is not set — cannot run the audit.');
  process.exit(1);
}

const OUT_DIR = process.env.AUDIT_OUT_DIR ?? '.';

// ── fetch (GET only) ──────────────────────────────────────────────────────
async function get(pathname) {
  const url = new URL(BASE + pathname);
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'x-api-key': KEY, accept: 'application/json' },
  });
  const text = await res.text();
  let json = null;
  let parseError = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    parseError = err.message;
  }
  return {
    path: pathname,
    status: res.status,
    statusText: res.statusText,
    bytes: text.length,
    parseError,
    json,
  };
}

// ── envelope inspection ───────────────────────────────────────────────────
// `unwrap()` in src/lib/api/client.js returns { items: [] } for ANYTHING it
// cannot parse, so "no data" and "no field" look identical downstream. This
// audit checks the envelope explicitly and refuses to report "absent" from an
// empty or unreadable payload.
function inspectEnvelope(resp) {
  const j = resp.json;
  const info = {
    httpOk: resp.status >= 200 && resp.status < 300,
    status: resp.status,
    parseError: resp.parseError,
    topLevelKeys:
      j && typeof j === 'object' && !Array.isArray(j) ? Object.keys(j) : null,
    isBareArray: Array.isArray(j),
    okFlag: j && typeof j === 'object' ? (j.ok ?? null) : null,
    summaryTotal: j?.summary?.total ?? null,
    totalFlag: j && typeof j === 'object' ? (j.total ?? null) : null,
    itemsIsArray: Array.isArray(j?.items),
    itemCount: Array.isArray(j?.items)
      ? j.items.length
      : Array.isArray(j)
        ? j.length
        : 0,
  };
  info.usable = info.httpOk && !resp.parseError && info.itemCount > 0;
  return info;
}

function itemsOf(resp) {
  const j = resp.json;
  if (Array.isArray(j?.items)) return j.items;
  if (Array.isArray(j)) return j;
  return [];
}

// ── population scanning ───────────────────────────────────────────────────
const isEmptyish = (v) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' &&
    !Array.isArray(v) &&
    v !== null &&
    Object.keys(v).length === 0);

function truncate(v, n = 90) {
  let s;
  if (v === null) s = 'null';
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  s = s.replace(/\s+/g, ' ');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * Union scan across ALL items — never the first item only. An absent key on
 * item 1 must not hide a field that other rows carry.
 */
function scanKeys(items, { prefix = '' } = {}) {
  const stats = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    for (const [k, v] of Object.entries(item)) {
      const key = prefix + k;
      if (!stats.has(key)) {
        stats.set(key, { key, present: 0, populated: 0, types: new Set(), samples: [] });
      }
      const s = stats.get(key);
      s.present += 1;
      s.types.add(Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
      if (!isEmptyish(v)) {
        s.populated += 1;
        if (s.samples.length < 2) s.samples.push(truncate(v));
      }
    }
  }
  return [...stats.values()]
    .map((s) => ({ ...s, types: [...s.types].sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** One level of nested expansion for object- and object-array-valued keys. */
function nestedScans(items) {
  const containers = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    for (const [k, v] of Object.entries(item)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!containers.has(k)) containers.set(k, []);
        containers.get(k).push(v);
      } else if (Array.isArray(v) && v.some((e) => e && typeof e === 'object')) {
        if (!containers.has(k)) containers.set(k, []);
        containers.get(k).push(...v.filter((e) => e && typeof e === 'object'));
      }
    }
  }
  const out = {};
  for (const [k, children] of containers) {
    out[k] = { containerRows: children.length, keys: scanKeys(children) };
  }
  return out;
}

// ── report helpers ────────────────────────────────────────────────────────
const lines = [];
const say = (s = '') => {
  lines.push(s);
  console.log(s);
};
const cell = (s) => String(s).replace(/\|/g, '\\|');

function printKeyTable(title, n, rows) {
  say('');
  say(`### ${title}  (N = ${n})`);
  say('');
  say('| key | present | populated | types | samples |');
  say('|---|---|---|---|---|');
  for (const r of rows) {
    say(
      `| \`${r.key}\` | ${r.present}/${n} | ${r.populated}/${n} | ${r.types.join(',')} | ${
        r.samples.map(cell).join(' / ') || '—'
      } |`
    );
  }
}

// ── key-name regex search (on KEY NAMES, case-insensitive) ────────────────
const NAME_PATTERNS = [
  { label: 'instructor-ish', re: /instr|teacher|lectur|speaker|trainer/i },
  { label: 'certificate-ish', re: /cert/i },
  {
    label: 'type/format-ish',
    re: /elearn|e_learn|learning|course_type|format|mode|online|type/i,
  },
];

function nameSearch(allScans) {
  const hits = [];
  for (const { source, n, rows } of allScans) {
    for (const r of rows) {
      for (const p of NAME_PATTERNS) {
        if (p.re.test(r.key)) {
          hits.push({
            pattern: p.label,
            source,
            key: r.key,
            populated: `${r.populated}/${n}`,
            samples: r.samples,
          });
        }
      }
    }
  }
  return hits;
}

// ── main ──────────────────────────────────────────────────────────────────
const [online, publicC, instructors] = await Promise.all([
  get('/online-course'),
  get('/public-course'),
  get('/instructors'),
]);

say('# MSDB read-only field audit — online-course card');
say('');
say('## Envelope check (STOP conditions)');
say('');
say(
  '| endpoint | HTTP | parse | top-level keys | ok | total | items[] | count | usable |'
);
say('|---|---|---|---|---|---|---|---|---|');
for (const [name, resp] of [
  ['/online-course', online],
  ['/public-course', publicC],
  ['/instructors', instructors],
]) {
  const e = inspectEnvelope(resp);
  say(
    `| \`${name}\` | ${e.status} ${resp.statusText} | ${
      e.parseError ? 'FAIL: ' + e.parseError : 'ok'
    } | ${
      e.topLevelKeys ? e.topLevelKeys.join(', ') : e.isBareArray ? '(bare array)' : '—'
    } | ${e.okFlag} | ${e.summaryTotal ?? e.totalFlag ?? '—'} | ${e.itemsIsArray} | ${
      e.itemCount
    } | ${e.usable ? 'YES' : '**NO**'} |`
  );
}

const onlineEnv = inspectEnvelope(online);
if (!onlineEnv.usable) {
  say('');
  say(
    '**STOP — /online-course payload is empty or unreadable. No "absent" verdict is valid.**'
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'audit-online-course-fields.out.md'),
    lines.join('\n') + '\n'
  );
  process.exit(2);
}

const onlineItems = itemsOf(online);
const publicItems = itemsOf(publicC);
const instrItems = itemsOf(instructors);

const onlineScan = scanKeys(onlineItems);
const publicScan = scanKeys(publicItems);
const instrScan = scanKeys(instrItems);

// ── CONTROLS ──────────────────────────────────────────────────────────────
const ctrlPositive = onlineScan.find((r) => r.key === 'o_course_name');
const ctrlNegative = onlineScan.find((r) => r.key === 'zzz_not_a_field');
say('');
say('## CONTROLS');
say('');
say(
  `- positive control \`o_course_name\`: ${
    ctrlPositive
      ? `present ${ctrlPositive.present}/${onlineItems.length}, populated ${ctrlPositive.populated}/${onlineItems.length} → ${
          ctrlPositive.populated > 0 ? 'PASS' : 'FAIL'
        }`
      : 'NOT FOUND → **FAIL — scanner is broken, every absent verdict below is meaningless**'
  }`
);
say(
  `- negative control \`zzz_not_a_field\`: ${ctrlNegative ? 'FOUND → **FAIL**' : 'absent → PASS'}`
);
say(
  `- item counts: online=${onlineItems.length}, public=${publicItems.length}, instructors=${instrItems.length}`
);

// ── 1. /online-course ─────────────────────────────────────────────────────
say('');
say('## 1. `GET /online-course`');
printKeyTable('Top-level key union', onlineItems.length, onlineScan);
const onlineNested = nestedScans(onlineItems);
for (const [k, v] of Object.entries(onlineNested)) {
  printKeyTable(`Nested \`${k}.*\` (one level)`, v.containerRows, v.keys);
}

// ── 2. /public-course ─────────────────────────────────────────────────────
say('');
say('## 2. `GET /public-course`');
printKeyTable('Top-level key union', publicItems.length, publicScan);
const publicNested = nestedScans(publicItems);
for (const [k, v] of Object.entries(publicNested)) {
  printKeyTable(`Nested \`${k}.*\` (one level)`, v.containerRows, v.keys);
}

// key-set DIFF (o_ prefix normalised so o_course_name ≡ course_name)
const onlineKeys = new Set(onlineScan.map((r) => r.key));
const publicKeys = new Set(publicScan.map((r) => r.key));
const stripPrefix = (k) => k.replace(/^o_/, '');
const onlineStripped = new Set([...onlineKeys].map(stripPrefix));
const publicStripped = new Set([...publicKeys].map(stripPrefix));

say('');
say('### Key-set DIFF — in `/public-course` but NOT in `/online-course` (o_ prefix normalised)');
say('');
say('| key | populated (public) | samples |');
say('|---|---|---|');
for (const r of publicScan) {
  if (!onlineStripped.has(stripPrefix(r.key))) {
    say(
      `| \`${r.key}\` | ${r.populated}/${publicItems.length} | ${
        r.samples.map(cell).join(' / ') || '—'
      } |`
    );
  }
}
say('');
say('### Key-set DIFF — in `/online-course` but NOT in `/public-course`');
say('');
say('| key | populated (online) | samples |');
say('|---|---|---|');
for (const r of onlineScan) {
  if (!publicStripped.has(stripPrefix(r.key))) {
    say(
      `| \`${r.key}\` | ${r.populated}/${onlineItems.length} | ${
        r.samples.map(cell).join(' / ') || '—'
      } |`
    );
  }
}

// ── 3. /instructors + join analysis ───────────────────────────────────────
say('');
say('## 3. `GET /instructors`');
printKeyTable('Top-level key union', instrItems.length, instrScan);
const instrNested = nestedScans(instrItems);
for (const [k, v] of Object.entries(instrNested)) {
  printKeyTable(`Nested \`${k}.*\` (one level)`, v.containerRows, v.keys);
}

/**
 * Every scalar value an instructor row exposes, indexed by key — top level
 * PLUS one nested level. The nested level matters: `programs[]` holds objects,
 * and a course→instructor link could plausibly run through `program_id`. An
 * index that stopped at the top level would report "no join" without ever
 * having looked at the only field that could carry one.
 */
function scalarIndex(items) {
  const byKey = new Map();
  const push = (kk, vv) => {
    if (vv === null || typeof vv === 'object') return;
    const s = String(vv).trim();
    if (!s) return;
    if (!byKey.has(kk)) byKey.set(kk, new Set());
    byKey.get(kk).add(s);
  };
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    for (const [k, v] of Object.entries(it)) {
      if (Array.isArray(v)) {
        for (const e of v) {
          if (e && typeof e === 'object') {
            for (const [k2, v2] of Object.entries(e)) push(`${k}[].${k2}`, v2);
          } else push(`${k}[]`, e);
        }
      } else if (v && typeof v === 'object') {
        for (const [k2, v2] of Object.entries(v)) push(`${k}.${k2}`, v2);
      } else push(k, v);
    }
  }
  return byKey;
}
const instrIndex = scalarIndex(instrItems);

/** Every scalar value an online-course row exposes, top level + one nested. */
function courseScalarValues(items) {
  const out = [];
  const push = (k, v) => {
    if (v === null || typeof v === 'object') return;
    const s = String(v).trim();
    if (s) out.push({ key: k, value: s });
  };
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    for (const [k, v] of Object.entries(it)) {
      if (Array.isArray(v)) {
        for (const e of v) {
          if (e && typeof e === 'object') {
            for (const [k2, v2] of Object.entries(e)) push(`${k}[].${k2}`, v2);
          } else push(`${k}[]`, e);
        }
      } else if (v && typeof v === 'object') {
        for (const [k2, v2] of Object.entries(v)) push(`${k}.${k2}`, v2);
      } else push(k, v);
    }
  }
  return out;
}
const courseValues = courseScalarValues(onlineItems);

say('');
say('### Join test — does any online-course value match any instructor value?');
say('');
say('Cross product of EVERY scalar value on an online-course row (top level +');
say('one nested level) against EVERY scalar value on an instructor row, exact');
say('string match, case-insensitive.');
say('');
say('| online-course key | instructor key | matches | example |');
say('|---|---|---|---|');
const joinHits = [];
const courseByKey = new Map();
for (const { key, value } of courseValues) {
  if (!courseByKey.has(key)) courseByKey.set(key, new Set());
  courseByKey.get(key).add(value);
}
for (const [ck, cvals] of courseByKey) {
  for (const [ik, ivals] of instrIndex) {
    const lower = new Set([...ivals].map((s) => s.toLowerCase()));
    const matched = [...cvals].filter((v) => lower.has(v.toLowerCase()));
    if (matched.length > 0) {
      joinHits.push({ ck, ik, n: matched.length, ex: matched[0] });
      say(`| \`${ck}\` | \`${ik}\` | ${matched.length} | ${cell(truncate(matched[0], 40))} |`);
    }
  }
}
if (joinHits.length === 0) {
  say('| — | — | **0** | no online-course value matches any instructor value |');
}
say('');
say(
  `Scanned ${courseByKey.size} distinct online-course value-keys against ${instrIndex.size} instructor value-keys.`
);

// ── 4. key-name regex search ──────────────────────────────────────────────
const allScans = [
  { source: '/online-course', n: onlineItems.length, rows: onlineScan },
  ...Object.entries(onlineNested).map(([k, v]) => ({
    source: `/online-course -> ${k}.*`,
    n: v.containerRows,
    rows: v.keys,
  })),
  { source: '/public-course', n: publicItems.length, rows: publicScan },
  ...Object.entries(publicNested).map(([k, v]) => ({
    source: `/public-course -> ${k}.*`,
    n: v.containerRows,
    rows: v.keys,
  })),
  { source: '/instructors', n: instrItems.length, rows: instrScan },
  ...Object.entries(instrNested).map(([k, v]) => ({
    source: `/instructors -> ${k}.*`,
    n: v.containerRows,
    rows: v.keys,
  })),
];

say('');
say('## 4. Key-NAME search (case-insensitive) across all three payloads');
say('');
say('| pattern | source | key | populated | samples |');
say('|---|---|---|---|---|');
const hits = nameSearch(allScans);
for (const h of hits) {
  say(
    `| ${h.pattern} | \`${h.source}\` | \`${h.key}\` | ${h.populated} | ${
      h.samples.map(cell).join(' / ') || '—'
    } |`
  );
}
for (const p of NAME_PATTERNS) {
  if (!hits.some((h) => h.pattern === p.label)) {
    say(`| ${p.label} | — | — | **0 hits anywhere** | — |`);
  }
}

// ── 5. constant vs per-course ─────────────────────────────────────────────
say('');
say('## 5. Constant-vs-per-course — distinct value counts on `/online-course`');
say('');
say('| key | distinct non-empty values | verdict |');
say('|---|---|---|');
for (const r of onlineScan) {
  const vals = new Set();
  for (const it of onlineItems) {
    const v = it?.[r.key];
    if (!isEmptyish(v)) vals.add(typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const verdict =
    vals.size === 0 ? 'never populated' : vals.size === 1 ? 'CONSTANT' : 'per-course';
  say(`| \`${r.key}\` | ${vals.size} | ${verdict} |`);
}

// ── 6. row-level detail for the keys the card cares about ─────────────────
// A key can be "populated 22/22" and still be useless — `false` is populated.
// This prints the actual distribution for the boolean/tag fields.
say('');
say('## 6. Value distribution for the tag-shaped fields');
say('');
for (const k of [
  'o_course_certificate_status',
  'o_certificate_status',
  'o_course_workshop_status',
  'o_course_levels',
]) {
  const dist = new Map();
  for (const it of onlineItems) {
    const v = Object.prototype.hasOwnProperty.call(it, k) ? it[k] : '(key absent)';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    dist.set(s, (dist.get(s) ?? 0) + 1);
  }
  say(
    `- \`${k}\`: ${[...dist.entries()].map(([v, n]) => `${v} × ${n}`).join(', ')}`
  );
}
// Which rows carry the non-universal (schema-drift) keys?
say('');
say('Rows carrying a key that most rows do NOT have:');
const universalKeys = new Set(
  onlineScan.filter((r) => r.present === onlineItems.length).map((r) => r.key)
);
for (const it of onlineItems) {
  const odd = Object.keys(it).filter((k) => !universalKeys.has(k));
  if (odd.length) {
    say(`- \`${it.o_course_id}\` — ${odd.map((k) => `\`${k}\`=${truncate(it[k], 30)}`).join(', ')}`);
  }
}

// ── artefacts ─────────────────────────────────────────────────────────────
fs.writeFileSync(
  path.join(OUT_DIR, 'audit-online-course-fields.out.md'),
  lines.join('\n') + '\n'
);
fs.writeFileSync(
  path.join(OUT_DIR, 'audit-raw-online.json'),
  JSON.stringify(onlineItems, null, 2)
);
console.error(
  `\n[written] ${path.join(OUT_DIR, 'audit-online-course-fields.out.md')}`
);
