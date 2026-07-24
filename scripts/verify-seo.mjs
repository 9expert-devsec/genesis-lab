#!/usr/bin/env node
/**
 * SEO canonical/indexing smoke test for the masterclass deployment.
 *
 * Why this exists: the whole indexing bug was a canonical URL pointing at a
 * host where the page doesn't exist. That class of failure is invisible in the
 * UI and only shows up weeks later as "not indexed" in Search Console. This
 * script fetches each live masterclass course page and asserts the tags a
 * crawler actually reads all agree with the URL it was served from.
 *
 * Usage:
 *   node scripts/verify-seo.mjs <baseUrl> [url ...]
 *
 *   <baseUrl>   e.g. https://masterclass.9experttraining.com
 *   [url ...]   optional explicit course URLs to check. When omitted, the
 *               script reads <baseUrl>/sitemap.xml and checks every
 *               /masterclass/ URL it lists.
 *
 * Exit code is non-zero if any page fails any check (CI-friendly).
 *
 * Checks per URL:
 *   - <link rel="canonical"> host === the requested host
 *   - canonical path === the requested path
 *   - og:title is not the generic site-wide default
 *   - og:url === canonical
 *   - JSON-LD @id/url host === the requested host
 */

// Generic site-wide titles that must NOT appear on a real course page — if one
// does, generateMetadata didn't resolve the course. (Titles, not domains — safe
// to keep as literals here.)
const GENERIC_TITLES = [
  '9Expert Training — Knowledge Provider',
  '9Expert Training',
  'Masterclass — 9Expert Training',
];

function fail(msg) {
  console.error(`\nError: ${msg}`);
  process.exit(2);
}

/** All attribute-order-independent matches of a tag, returning captured attrs. */
function findTags(html, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return html.match(re) ?? [];
}

function attr(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)
    || new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag);
  return m ? m[1].trim() : null;
}

function getCanonical(html) {
  for (const tag of findTags(html, 'link')) {
    if ((attr(tag, 'rel') || '').toLowerCase() === 'canonical') return attr(tag, 'href');
  }
  return null;
}

function getMeta(html, property) {
  for (const tag of findTags(html, 'meta')) {
    if ((attr(tag, 'property') || '').toLowerCase() === property.toLowerCase()) {
      return attr(tag, 'content');
    }
  }
  return null;
}

/** Collect every @id / url string found anywhere in the JSON-LD blocks. */
function getJsonLdUrls(html) {
  const urls = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if ((k === '@id' || k === 'url') && typeof v === 'string') urls.push(v);
          else walk(v);
        }
      }
    };
    walk(data);
  }
  return urls;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function pathOf(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return null;
  }
}

async function fetchSitemapUrls(baseUrl) {
  const sitemapUrl = `${baseUrl.replace(/\/+$/, '')}/sitemap.xml`;
  const res = await fetch(sitemapUrl);
  if (!res.ok) fail(`could not fetch ${sitemapUrl} (HTTP ${res.status})`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((m) => m[1].trim());
  const masterclass = locs.filter((u) => new URL(u).pathname.startsWith('/masterclass/'));
  if (!masterclass.length) fail(`no /masterclass/ URLs found in ${sitemapUrl}`);
  return masterclass;
}

async function checkUrl(requestedUrl) {
  const reqHost = hostOf(requestedUrl);
  const reqPath = pathOf(requestedUrl);
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  let html;
  try {
    const res = await fetch(requestedUrl, { headers: { 'user-agent': 'verify-seo/1.0' } });
    if (!res.ok) {
      add('http 200', false, `HTTP ${res.status}`);
      return { url: requestedUrl, checks, ok: false };
    }
    html = await res.text();
  } catch (e) {
    add('fetch', false, e.message);
    return { url: requestedUrl, checks, ok: false };
  }

  const canonical = getCanonical(html);
  add('canonical present', Boolean(canonical), canonical || 'missing');
  add('canonical host', hostOf(canonical) === reqHost, `${hostOf(canonical)} vs ${reqHost}`);
  add('canonical path', pathOf(canonical) === reqPath, `${pathOf(canonical)} vs ${reqPath}`);

  const ogTitle = getMeta(html, 'og:title');
  add(
    'og:title specific',
    Boolean(ogTitle) && !GENERIC_TITLES.includes(ogTitle.trim()),
    ogTitle || 'missing'
  );

  const ogUrl = getMeta(html, 'og:url');
  add('og:url = canonical', Boolean(ogUrl) && ogUrl === canonical, `${ogUrl} vs ${canonical}`);

  const ldUrls = getJsonLdUrls(html);
  const ldHosts = [...new Set(ldUrls.map(hostOf).filter(Boolean))];
  // Only the page's own @id/url nodes must match the host. Cross-site refs like
  // the Organization's provider.url legitimately point elsewhere, so we require
  // that the requested host appears AND that no page-identifying node is on a
  // foreign host — approximated by requiring at least one matching host and the
  // canonical-path node to be present on the right host.
  const ldSelf = ldUrls.filter((u) => pathOf(u) === reqPath || pathOf(u)?.startsWith(reqPath));
  const ldSelfHostsOk = ldSelf.length > 0 && ldSelf.every((u) => hostOf(u) === reqHost);
  add(
    'JSON-LD @id/url host',
    ldSelfHostsOk,
    ldSelf.length ? `${[...new Set(ldSelf.map(hostOf))].join(',')} vs ${reqHost}` : `no self URLs (hosts: ${ldHosts.join(',') || 'none'})`
  );

  const ok = checks.every((c) => c.ok);
  return { url: requestedUrl, checks, ok };
}

async function main() {
  const [, , baseUrl, ...explicit] = process.argv;
  if (!baseUrl) fail('missing <baseUrl>. Usage: node scripts/verify-seo.mjs <baseUrl> [url ...]');

  const urls = explicit.length ? explicit : await fetchSitemapUrls(baseUrl);
  console.log(`Checking ${urls.length} URL(s) against host ${hostOf(baseUrl)}\n`);

  const results = [];
  for (const url of urls) {
    results.push(await checkUrl(url));
  }

  // ── Table ──────────────────────────────────────────────────────────────────
  const checkNames = [
    'canonical host',
    'canonical path',
    'og:title specific',
    'og:url = canonical',
    'JSON-LD @id/url host',
  ];
  const pad = (s, n) => String(s).padEnd(n);
  const urlColW = Math.min(60, Math.max(...results.map((r) => pathOf(r.url).length), 10));

  console.log(pad('PATH', urlColW), checkNames.map((n) => pad(n, 22)).join(''));
  for (const r of results) {
    const cells = checkNames.map((name) => {
      const c = r.checks.find((x) => x.name === name);
      return pad(c ? (c.ok ? 'PASS' : 'FAIL') : '—', 22);
    });
    console.log(pad(pathOf(r.url), urlColW), cells.join(''));
  }

  // ── Failure detail ──────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log('\nFailures:');
    for (const r of failed) {
      console.log(`\n  ${r.url}`);
      for (const c of r.checks.filter((x) => !x.ok)) {
        console.log(`    ✗ ${c.name}: ${c.detail}`);
      }
    }
  }

  console.log(
    `\n${results.length - failed.length}/${results.length} passed.` +
      (failed.length ? ` ${failed.length} FAILED.` : ' All good.')
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => fail(e.stack || e.message));
