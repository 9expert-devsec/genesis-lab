import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * ROUND 36, commit 1 — the claims about /preview/[slug] that are about SHAPE.
 *
 * What the route RENDERS in each state is driven for real in the suite's single
 * fakeDb owner. Three things cannot be shown that way and are shown here:
 *
 *   · the ORDER of the gates against the reads they protect. A driven test
 *     proves an unauthenticated request got a gate; it cannot prove the content
 *     was never resolved on the way there, and "we returned early" and "we did
 *     the work then threw it away" look identical from outside.
 *   · READ-ONLY, which is a claim about what CANNOT happen. There is no input
 *     to feed a route to make it prove it never writes.
 *   · the real PreviewGate's state branches, since the driven tests see a stub
 *     (React 18 has no useActionState). Named here so the stub is covered
 *     rather than merely convenient.
 */

const ROUTE = 'src/app/(public)/preview/[slug]/page.jsx';
const GATE = 'src/app/(public)/preview/[slug]/_components/PreviewGate.jsx';
const READER = 'src/lib/pages/publishedVersion.js';
const ACTIONS = 'src/lib/actions/pageBuilder.js';

test('every gate returns BEFORE anything reads content or history', async (t) => {
  const { code } = readSource(ROUTE);

  await t.test('the ACCESS gates precede the version read and both compositions', () => {
    /**
     * Measured against the LOCKED return — the last of the three ACCESS gates,
     * and the one the cookie check owns.
     *
     * Not lastIndexOf('PreviewGate'): the first cut of this used that and went
     * red, correctly. The `unpublished` return is also a PreviewGate, and it
     * sits AFTER the version read BY DESIGN — it is the version read that
     * decides it. It is a content outcome, not an access refusal, and lumping
     * the two together made this guard measure the wrong boundary.
     */
    const lockedGate = code.indexOf('state="locked"');
    const versionRead = code.indexOf('getPublishedVersionMeta(');
    const published = code.indexOf('stripDraft(page)');
    const draft = code.indexOf('composeWorkingView(page)');

    assert.ok(lockedGate > -1, 'the cookie gate is gone — re-read this guard');
    for (const [name, at] of [['version read', versionRead], ['stripDraft', published], ['composeWorkingView', draft]]) {
      assert.ok(at > -1, `${name} is no longer in the route — re-read this guard`);
      assert.ok(lockedGate < at, `${name} happens before the cookie gate returns`);
    }
    // …and all three access gates precede it, in their original order.
    const disabled = code.indexOf('state="disabled"');
    const expired = code.indexOf('state="expired"');
    assert.ok(disabled > -1 && expired > -1 && disabled < expired && expired < lockedGate,
      'the three access gates are no longer in order ahead of the cookie check');
  });

  await t.test('the unpublished return is DOWNSTREAM of the version read, deliberately', () => {
    // Stated so the exclusion above cannot be read as an oversight: this one
    // must come after, because the read is what determines it.
    const unpublished = code.indexOf('state="unpublished"');
    const versionRead = code.indexOf('getPublishedVersionMeta(');
    assert.ok(versionRead > -1 && unpublished > versionRead,
      'the unpublished state is decided before the read that determines it');
  });

  await t.test('the three original terminal states are all still there, by name', () => {
    for (const state of ['disabled', 'expired', 'locked']) {
      assert.ok(code.includes(`state="${state}"`), `the ${state} terminal state is gone`);
    }
    assert.ok(code.includes('state="unpublished"'), 'the new terminal state is not wired');
  });

  await t.test('CONTROL: the ordering probe can come out the other way', () => {
    // The discrimination form. A route that composed before gating must fail
    // the same comparison, or the assertions above mean nothing.
    const bad = 'const view = composeWorkingView(page);\nif (!ok) return <PreviewGate state="locked" />;';
    assert.equal(bad.lastIndexOf('PreviewGate') < bad.indexOf('composeWorkingView(page)'), false,
      'the ordering probe accepts content composed before the gate');
  });

  await t.test('force-dynamic and noindex survive', () => {
    assert.match(code, /export const dynamic = 'force-dynamic'/);
    assert.match(code, /export const revalidate = 0/);
    assert.match(code, /robots: \{ index: false, follow: false, nocache: true \}/);
  });
});

test('the published view renders the LIVE document, not a snapshot', async (t) => {
  const { code } = readSource(ROUTE);

  await t.test('the view is handed stripDraft(page)', () => {
    assert.match(code, /<PageBuilderView page=\{stripDraft\(page\)\} \/>/,
      'the published branch no longer renders the live document');
  });

  await t.test('no snapshot is fetched by this route, at all', () => {
    // The whole point of A: a snapshot is a record of a past moment and can
    // disagree with the live identity after updatePageIdentity. It is also a
    // whole page document, which round 34 made a separate fetch-one to avoid
    // shipping casually.
    const { withImports } = readSource(ROUTE);
    assert.equal(withImports.includes('getPageVersionSnapshot'), false,
      'the preview route now fetches a snapshot');
    assert.equal(countCallSites(code, 'getPageVersions'), 0,
      'the preview route now lists version history');
  });

  await t.test('the number comes from the live counter, not from the row', () => {
    assert.match(code, /versionName\(\{ versionNumber: page\.publishedVersion \}\)/,
      'the version number is no longer read from the live document');
  });

  await t.test('the reader never projects the snapshot', () => {
    const { code: reader } = readSource(READER);
    assert.match(reader, /\.select\('versionNumber actor createdAt'\)/,
      'the published-version reader projection changed');
    assert.equal(/select\([^)]*snapshot/.test(reader), false,
      'the published-version reader now pulls whole page documents');
  });
});

test('the published-version reader is NOT a server action', async (t) => {
  await t.test("its module carries no 'use server'", () => {
    // lib/actions/pageBuilder.js does, so every export there is an endpoint
    // callable by id from any browser. This read runs for a PUBLIC visitor who
    // has passed a preview cookie; as an action it would either need
    // requireAdmin (which that visitor does not have) or be an ungated endpoint
    // handing anyone an editor's name for any page id they can guess.
    // `code`, not `raw`: the reader's own docstring QUOTES the directive to
    // explain why it is absent, and the first cut of this matched that prose.
    // Comment-scrubbed source is the only text where this question is decidable.
    const { code: reader } = readSource(READER);
    assert.equal(reader.includes("'use server'"), false,
      'the published-version reader became a server action');
    assert.equal(reader.includes('"use server"'), false);
  });

  await t.test('CONTROL: the action file DOES carry it, so the probe is live', () => {
    const { code: actionCode } = readSource(ACTIONS);
    assert.equal(actionCode.trimStart().startsWith("'use server'"), true,
      'the probe cannot tell an action module from a plain one');
  });

  await t.test('the route imports it directly rather than through the action layer', () => {
    const { withImports } = readSource(ROUTE);
    assert.match(withImports, /import \{ getPublishedVersionMeta \} from '@\/lib\/pages\/publishedVersion'/);
  });
});

/**
 * ── READ-ONLY, ENFORCED RATHER THAN ASSERTED ──────────────────────────────
 * "There are no edit controls" is the inert-control claim round 18 exists to
 * reject. What actually stops a write from this surface is that every mutating
 * builder action opens with `requireAdmin('pages')`, and a preview-cookie
 * visitor has no admin session — so a write attempted from here fails 401/403
 * server-side, whether or not any control exists to attempt it.
 *
 * Both halves are asserted: the route reaches no mutating action, AND every
 * mutating action is gated regardless of who reaches it.
 */
test('the published view is read-only, and something enforces it', async (t) => {
  const { withImports: route } = readSource(ROUTE);
  const { raw: actions } = readSource(ACTIONS);

  /** Exported async functions of the action module, as { name, body }. */
  const exportedFns = () => {
    const out = [];
    const re = /export async function (\w+)\(/g;
    let m;
    while ((m = re.exec(actions)) !== null) {
      const start = m.index;
      const next = actions.indexOf('\nexport async function ', start + 1);
      out.push({ name: m[1], body: actions.slice(start, next === -1 ? actions.length : next) });
    }
    return out;
  };

  const WRITES = /\.(findByIdAndUpdate|findOneAndUpdate|findByIdAndDelete|deleteMany|updateOne|create)\(/;

  await t.test('the route imports no mutating builder action', () => {
    for (const name of [
      'saveDraftContent', 'publishPageStatus', 'discardDraftContent', 'updatePageIdentity',
      'createPageBuilderPage', 'deletePageBuilderPage', 'duplicatePageBuilderPage',
    ]) {
      assert.equal(route.includes(name), false, `the preview route imports ${name}`);
    }
  });

  /**
   * ONE justified exception, named rather than allowed by a loose rule.
   *
   * verifyPreviewPassword is the ANONYMOUS password endpoint — the thing a
   * preview visitor calls before they have any session at all — so requiring an
   * admin would make the preview link unusable. It writes, and it must: a
   * lockout counter that needed a session could not rate-limit the unauthorised
   * caller it exists to stop.
   *
   * The first cut of this test had a blanket rule and went red naming it. The
   * blanket rule was wrong, not the code — so the exception is listed AND
   * constrained below, which is stronger than the rule that missed it.
   */
  const UNGATED_BY_DESIGN = ['verifyPreviewPassword'];

  await t.test('every mutating action opens with requireAdmin, but one', () => {
    const fns = exportedFns();
    assert.ok(fns.length > 10, 'the function extractor found almost nothing — it is broken');
    const mutators = fns.filter((f) => WRITES.test(f.body));
    assert.ok(mutators.length > 5, `only ${mutators.length} mutating actions found — the write matcher is broken`);
    const ungated = mutators
      .filter((f) => !f.body.includes("requireAdmin('pages')"))
      .map((f) => f.name)
      .sort();
    assert.deepEqual(ungated, UNGATED_BY_DESIGN,
      'a builder action writes without requiring an admin session — the preview view is no longer read-only by construction');
  });

  await t.test('…and that one can only touch the lockout counters', () => {
    // What keeps the exception an exception. If it ever writes anything other
    // than the two rate-limit fields, an unauthenticated caller has a path into
    // page state and this names it.
    const fn = exportedFns().find((f) => f.name === 'verifyPreviewPassword');
    assert.ok(fn, 'the named exception no longer exists — delete it from the list');
    const written = [...fn.body.matchAll(/'(preview\.\w+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(
      [...new Set(written)], ['preview.failedAttempts', 'preview.lockedUntil'],
      'the anonymous password endpoint writes a field beyond the lockout counters'
    );
    // CONTROL for the matcher itself: it must see a dotted preview path, and
    // must NOT see a bare `'preview'` projection, or the set above is an
    // accident of the pattern rather than a fact about the function.
    assert.deepEqual(
      [...`x = { 'preview.lockedUntil': 1 }; y.select('preview');`.matchAll(/'(preview\.\w+)'/g)]
        .map((m) => m[1]),
      ['preview.lockedUntil'],
      'the write-field matcher does not distinguish a written path from a projection'
    );
  });

  await t.test('CONTROL: an ungated mutator IS named by that check', () => {
    // The discrimination form, over the shape the defect would actually take.
    const parallel = [
      'export async function sneakyWrite(id, patch) {',
      '  await dbConnect();',
      '  return PageBuilder.findByIdAndUpdate(id, { $set: patch });',
      '}',
    ].join('\n');
    assert.equal(WRITES.test(parallel), true, 'the write matcher does not see a plain write');
    assert.equal(parallel.includes("requireAdmin('pages')"), false,
      'the gate check cannot tell an ungated function from a gated one');
  });

  await t.test('the route renders no client component of its own beyond the gate', () => {
    // A control that could POST would have to be a client component. The only
    // one this route reaches is PreviewGate, which is the password form.
    assert.equal(route.includes("'use client'"), false, 'the preview route became a client component');
    const clientImports = [...route.matchAll(/from '(\.\/[^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(clientImports, ['./_components/PreviewGate'],
      'the route reaches a local component other than the gate');
  });
});

test('the real PreviewGate handles every state the route can hand it', async (t) => {
  // The driven tests see a stub (React 18 has no useActionState), so this is
  // what keeps the stub honest: the states the route emits and the states the
  // component branches on must be the same set.
  const { code: gate } = readSource(GATE);
  const { code: route } = readSource(ROUTE);

  await t.test('every state the route emits has a branch in the component', () => {
    const emitted = [...route.matchAll(/state="(\w+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual([...new Set(emitted)], ['disabled', 'expired', 'locked', 'unpublished'],
      'the set of states the route emits changed');
    for (const state of emitted) {
      if (state === 'locked') continue;   // the default fall-through: the form
      assert.ok(gate.includes(`state === '${state}'`), `PreviewGate has no branch for ${state}`);
    }
  });

  await t.test('the unpublished dead end says the page was never published', () => {
    assert.ok(gate.includes('หน้านี้ยังไม่เคยเผยแพร่'), 'the unpublished dead-end title changed');
    // …and does NOT reuse the link-expiry language, which would send an author
    // to an administrator for a problem only they can fix.
    const at = gate.indexOf("state === 'unpublished'");
    const body = gate.slice(at, at + 400);
    assert.equal(body.includes('โปรดติดต่อผู้ดูแล'), false,
      'the unpublished dead end tells the author to contact an administrator');
  });
});
