import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseHost,
  normalisePath,
  normaliseDestination,
  isInternalDestination,
  isAdminPath,
  validateRule,
  matchRedirect,
  MAX_PATH_LENGTH,
} from '@/lib/redirects/redirectRules';

/**
 * T5 — THE REDIRECT DECISION, AS A PURE FUNCTION OF (host, path, rules).
 *
 * The existing masterclass gate in src/middleware.js is the counter-example
 * this file is written against: a predicate declared inline in the file that
 * uses it, unreachable by any import, which turned out to be host-blind,
 * env-blind and never called at all — and nothing noticed, because nothing
 * could look. A table that decides where visitors' browsers go does not get to
 * be in that position.
 */

const rule = (over = {}) => ({
  host: 'www.9experttraining.com',
  source: '/old-page',
  destination: '/new-page',
  permanent: true,
  isActive: true,
  ...over,
});

// ── the open-redirect guard ─────────────────────────────────────────────────

test('an absolute URL is not an internal destination', () => {
  assert.equal(isInternalDestination('https://evil.test/x'), false);
  assert.equal(isInternalDestination('http://evil.test'), false);
  assert.equal(isInternalDestination('ftp://evil.test'), false);
});

test('a PROTOCOL-RELATIVE url is refused — it starts with "/" and is not internal', () => {
  /**
   * The one people miss. `//evil.test/x` passes a naive `startsWith('/')`
   * check and the browser treats it as an absolute URL to another origin. An
   * open redirect on a training company's domain is a phishing kit with the
   * company's SEO behind it.
   */
  assert.equal('//evil.test/x'.startsWith('/'), true, 'CONTROL: it really does start with a slash');
  assert.equal(isInternalDestination('//evil.test/x'), false);
  assert.equal(isInternalDestination('/\\evil.test'), false, 'backslash form too');
});

test('the guard is applied to the RAW value, before normalisation could launder it', () => {
  // normalisePath collapses `//` to `/`. If the check ran after normalisation,
  // a protocol-relative URL would arrive looking like a valid internal path.
  assert.equal(normalisePath('//evil.test/x'), '/evil.test/x',
    'CONTROL: normalisation really does launder it');
  assert.equal(validateRule({ host: 'a.test', source: '/x', destination: '//evil.test/x' }).ok, false);
});

test('an ordinary internal path is accepted', () => {
  assert.equal(isInternalDestination('/new-page'), true);
  assert.equal(isInternalDestination('/a/b/c'), true);
  assert.equal(isInternalDestination('/new-page?x=1'), true);
});

// ── /admin is out of reach in both directions ───────────────────────────────

test('no rule may have /admin as its source or its destination', () => {
  assert.equal(validateRule({ host: 'a.test', source: '/admin/roles', destination: '/x' }).ok, false);
  assert.equal(validateRule({ host: 'a.test', source: '/x', destination: '/admin/roles' }).ok, false);
  assert.equal(validateRule({ host: 'a.test', source: '/admin', destination: '/x' }).ok, false);
});

test('isAdminPath is not fooled by case or a trailing slash', () => {
  assert.equal(isAdminPath('/ADMIN/roles'), true);
  assert.equal(isAdminPath('/admin/'), true);
  assert.equal(isAdminPath('/administrator'), false, 'a different path that merely starts the same');
});

// ── exact only, no patterns ─────────────────────────────────────────────────

test('a pattern in the source is REFUSED, not silently non-matching', () => {
  // Refused rather than accepted-and-inert: a rule that never fires would read
  // to an admin as the whole panel being broken.
  for (const source of ['/old/*', '/old/:slug', '/old/(x)', '/old/[id]']) {
    assert.equal(validateRule({ host: 'a.test', source, destination: '/new' }).ok, false, source);
  }
});

test('a rule pointing at itself is refused', () => {
  assert.equal(validateRule({ host: 'a.test', source: '/x', destination: '/x' }).ok, false);
  // …including when only normalisation makes them equal.
  assert.equal(validateRule({ host: 'a.test', source: '/x/', destination: '/x' }).ok, false);
});

test('a valid rule comes back normalised', () => {
  const res = validateRule({ host: '  WWW.Example.COM:443 ', source: '/Old-Page/', destination: '/New-Page/' });
  assert.equal(res.ok, true);
  assert.deepEqual(res.value, {
    host: 'www.example.com',
    source: '/old-page',
    destination: '/New-Page',
  });
});

test('errors are keyed by FIELD so the form can place each refusal', () => {
  const res = validateRule({ host: '', source: 'no-slash', destination: 'https://evil.test' });
  assert.equal(res.ok, false);
  assert.ok(res.errors.host);
  assert.ok(res.errors.source);
  assert.ok(res.errors.destination);
});

// ── normalisation ───────────────────────────────────────────────────────────

test('a path is normalised: slashes, query, fragment, case', () => {
  assert.equal(normalisePath('old-page'), '/old-page', 'a missing leading slash is added');
  assert.equal(normalisePath('/old-page/'), '/old-page', 'trailing slash dropped');
  assert.equal(normalisePath('/a//b'), '/a/b', 'duplicate slashes collapsed');
  assert.equal(normalisePath('/a?x=1'), '/a', 'query removed');
  assert.equal(normalisePath('/a#frag'), '/a', 'fragment removed');
  assert.equal(normalisePath('/Old-Page'), '/old-page', 'lower-cased');
  assert.equal(normalisePath('/'), '/', 'the root keeps its slash');
});

test('a DESTINATION keeps its case — it is a live URL, not a legacy one', () => {
  assert.equal(normaliseDestination('/New-Page'), '/New-Page');
  assert.equal(normaliseDestination('/New-Page/'), '/New-Page');
  assert.equal(normaliseDestination('/p?x=1'), '/p?x=1', 'a query on the target survives');
});

test('a host is lower-cased and loses its port, but never its subdomain', () => {
  assert.equal(normaliseHost('MASTERCLASS.9experttraining.com:443'), 'masterclass.9experttraining.com');
  assert.equal(normaliseHost('www.9experttraining.com'), 'www.9experttraining.com');
  // Folding www away would defeat the entire reason rules are keyed on a host.
  assert.notEqual(
    normaliseHost('www.9experttraining.com'),
    normaliseHost('masterclass.9experttraining.com')
  );
});

test('an x-forwarded-host chain takes the FIRST hop', () => {
  assert.equal(normaliseHost('www.example.com, proxy.internal'), 'www.example.com');
});

test('paths are truncated at the cap rather than stored whole', () => {
  const long = `/${'a'.repeat(MAX_PATH_LENGTH * 2)}`;
  assert.equal(normalisePath(long).length, MAX_PATH_LENGTH);
});

// ── the match itself ────────────────────────────────────────────────────────

test('an exact host and path match redirects', () => {
  const hit = matchRedirect({
    host: 'www.9experttraining.com', path: '/old-page', rules: [rule()],
  });
  assert.deepEqual(hit, { destination: '/new-page', permanent: true });
});

test('THE HOST IS PART OF THE KEY — the same path on another host does not match', () => {
  /**
   * The measured reason the whole table is host-keyed:
   * masterclass.9experttraining.com serves /masterclass/<slug> and www will
   * serve the SAME path. A path-only match would redirect the host that is
   * supposed to answer.
   */
  const rules = [rule({ host: 'masterclass.9experttraining.com', source: '/masterclass/x', destination: '/elsewhere' })];
  assert.equal(matchRedirect({ host: 'masterclass.9experttraining.com', path: '/masterclass/x', rules })?.destination, '/elsewhere');
  assert.equal(matchRedirect({ host: 'www.9experttraining.com', path: '/masterclass/x', rules }), null);
});

test('matching is exact — a prefix or a child path does not match', () => {
  const rules = [rule({ source: '/old' })];
  assert.equal(matchRedirect({ host: rule().host, path: '/old', rules })?.destination, '/new-page');
  assert.equal(matchRedirect({ host: rule().host, path: '/old/child', rules }), null);
  assert.equal(matchRedirect({ host: rule().host, path: '/older', rules }), null);
});

test('normalisation is applied to BOTH sides of the comparison', () => {
  const rules = [rule({ source: '/Old-Page/' })];
  assert.ok(matchRedirect({ host: 'WWW.9experttraining.COM', path: '/old-page?utm=x', rules }));
});

test('an INACTIVE rule is skipped here, not by the caller', () => {
  // A caller that forgets the filter must not be able to honour a disabled rule.
  assert.equal(matchRedirect({ host: rule().host, path: '/old-page', rules: [rule({ isActive: false })] }), null);
});

test('permanent:false yields a temporary redirect', () => {
  const hit = matchRedirect({ host: rule().host, path: '/old-page', rules: [rule({ permanent: false })] });
  assert.equal(hit.permanent, false);
});

test('a STORED rule with an external destination is refused at match time', () => {
  /**
   * The validator runs at write time, but a row can also arrive from a direct
   * database edit or a restored backup. This is the last point before a
   * browser is sent somewhere, so it checks again.
   */
  for (const destination of ['https://evil.test', '//evil.test', '/admin/roles']) {
    assert.equal(
      matchRedirect({ host: rule().host, path: '/old-page', rules: [rule({ destination })] }),
      null,
      destination
    );
  }
});

test('a stored rule that points at itself is refused at match time too', () => {
  assert.equal(
    matchRedirect({ host: rule().host, path: '/old-page', rules: [rule({ destination: '/old-page' })] }),
    null
  );
});

test('no rules, no host or no path is null rather than a throw', () => {
  assert.equal(matchRedirect({ host: 'a.test', path: '/x', rules: [] }), null);
  assert.equal(matchRedirect({ host: '', path: '/x', rules: [rule()] }), null);
  assert.equal(matchRedirect({ host: 'a.test', path: '', rules: [rule()] }), null);
  assert.equal(matchRedirect({}), null);
  assert.equal(matchRedirect(), null);
});

test('the first matching rule wins, deterministically', () => {
  const rules = [rule({ destination: '/first' }), rule({ destination: '/second' })];
  assert.equal(matchRedirect({ host: rule().host, path: '/old-page', rules }).destination, '/first');
});
