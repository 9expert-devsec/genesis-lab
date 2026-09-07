# A source scan cannot tell live code from dead code — and one half of that IS fixable

**Status:** open. Half of this is a limit to be stated and lived with; the other half is a
cheap, measured improvement to `test/fs/actionsParse.test.mjs`. They are filed together
because separating them is how the fixable half gets mistaken for the impossible one.

## What happened

Three tests in `test/fs/registrationsFoldWiring.test.mjs` asserted that the dashboard
folds registrations by request. They **passed** — against
`src/lib/actions/dashboard.js` as it stood from `65034517` to `41c174c4`, a file that
**could not compile**, in which the folding code was dead: computed into locals that the
function's only `return` never read.

Measured, by checking out the broken file and running that test alone:

```
against the BROKEN 256-line file (dead code present):
  ✔ the dashboard imports the SAME key and the SAME precedence
  ✔ the dashboard no longer counts public registrations one status at a time
  ✔ CONTROL: the dashboard slice is the trend aggregation and nothing else
```

They pass because they are source scans:

```js
const DASHBOARD = readSource('src/lib/actions/dashboard.js');
assert.match(DASHBOARD.code, /requestStatusExpr\('\$statuses'\)/);
assert.match(trend, /_id: REQUEST_KEY_EXPR/);
```

Every matched string was present. In dead code. In a module that took the build down.

**A guard that reads the wrong answer from a broken module is worse than no guard**,
because someone acts on it. Somebody did: the round shipped believing the dashboard folded
by request.

## Half one — the live/dead distinction. NOT achievable in this tier.

State it plainly: **a source scan can never distinguish live code from dead code.** This is
not a weakness of these particular regexes and it is not fixable by a better one.

`assert.match(source, /X/)` asks "does the token X appear in this text". "Is X reachable
from an exported entry point, and does its result flow to a return value" is a different
question in a different category — it requires a parse to an AST, a scope-resolved
binding graph, and a reachability walk from the module's exports. Nothing in
`test/fs` has any of that, and building it would be writing a static analyser inside a
test suite.

**Do not paper this with a cleverer regex.** Every candidate — asserting the token appears
*after* the guard, asserting it appears within N lines of the `return`, asserting the
`return` mentions a variable the block assigns — is a proximity heuristic that the same
concatenation would have satisfied, because the concatenation *put the dead block directly
above the live return*.

What a source scan can honestly claim is narrower than what these three claim today:
*"the text that would implement this rule is present in this file."* When the file
compiles and has one code path, that is a good proxy. When it does not, the proxy is
silently wrong, and the test cannot tell which world it is in.

The instrument that answers the real question is a **behavioural** test: run
`buildDashboardMetrics` against counting doubles and assert the returned payload counts a
three-leg bundle as 1. `buildMetrics.js` already exists to make exactly that possible —
its header says so, at length, and `test/pure/dashboardScopes.test.mjs` already drives it
that way to assert a read count. **That is where the fold assertion belongs**, and moving
it there is part of the port tracked in
`ticket-the-dashboard-counts-legs-not-requests.md`.

## Half two — "cannot pass on an uncompilable file". ACHIEVABLE, cheaply, and measured.

The second property is separable and much weaker than reachability: *this file is valid
JavaScript*. `actionsParse.test.mjs` already tries to guarantee it and **fails to**,
because its parser cannot see the defect:

```
SUCRASE on the broken dashboard.js:                          PARSED OK
SUCRASE on `function f(from='',to=''){ const {from,to}=g() }`: PARSED OK
SUCRASE on `export const a = UNDEFINED_THING`:                PARSED OK
```

Sucrase is syntax-directed with no scope analysis. Redeclaration is a **scope** error, so
it is invisible — which is why `actionsParse`, the guard written precisely so that a
syntax error in an action module is never invisible, was green on this file.

A real V8 parse catches it, **without executing the module** — so the blocker
`actionsParse`'s own header names (*"they pull in mongoose models and next/server, so no
pure or render test touches them"*) does not apply:

```js
new vm.SourceTextModule(readFileSync(file, 'utf8'))   // parses; does not evaluate
```

Measured, with controls, under `node --experimental-vm-modules`:

```
  PARSED OK   FIXED dashboard.js               (must pass)  ✓
  THREW       BROKEN dashboard.js              (must throw) ✓  Identifier 'to' has already been declared
  THREW       star-slash inside a block comment (must throw) ✓  ← actionsParse's original motivating defect
  PARSED OK   `export const a = UNDEFINED_THING` (runtime, not parse — correctly invisible)
  ALL 49 action modules: 49 parse, 0 fail                    ← no false positives on today's tree
```

`node --check` on a `.mjs` copy produces the identical `SyntaxError` and needs no flag,
but needs a temp file since these sources are `.js`.

### Shape of the change, when someone takes it

Replace the `sucrase.transform` call in `test/fs/actionsParse.test.mjs` with a
parse-only V8 module construction, over the same two derived lists (actions and route
handlers), keeping the existing anchor and control tests. The existing
`CONTROL: the parse check rejects source that is genuinely broken` must gain a
redeclaration case alongside its star-slash and unbalanced-paren cases — otherwise the
upgrade ships with no proof it caught anything new. The `--experimental-vm-modules` flag
would need adding to the `test` script, or the check written against a temp `.mjs` with
`node --check` to avoid the flag.

### What it still would not catch, and must say so in its header

The seven free identifiers in the broken file — `DEFAULT_RANGE`, `dashboardScopes`,
`hasNoDashboardScope`, `dateRange`, `PUBLIC_STATUS_LABEL`, `buildDashboardMetrics`,
`custom`. Those are **runtime** `ReferenceError`s: a parser is correct to accept them,
because they are only errors when the function is called. Catching those needs the module
imported *and* its export invoked, which for a `'use server'` module in this tier is a
much larger question.

So even the upgraded guard leaves a gap, and the gap is the same one already recorded in
`test/fs/useServerExportsAsync.test.mjs`:

> A green suite does not mean the app builds. A round that skips `npm run build` should
> say plainly that build status is UNVERIFIED rather than letting a pass count imply
> otherwise.

That has now been the proximate cause twice — the `'use server'` non-async export, and
this. The suite has no bundler and cannot grow one. `npm run build` is not an optional
final polish on a round; it is the only instrument in the project that answers the
question it answers.
