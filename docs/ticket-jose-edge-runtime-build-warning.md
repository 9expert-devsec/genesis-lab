# `next build` warns: jose uses CompressionStream, unavailable in the Edge Runtime

**Filed** 2026-09-06. **Not fixed, and no fix is proposed** — this ticket exists
so the next round recognises the warning instead of rediscovering it.

## What the build says

Every **clean** production build (one where `.next` has been removed) prints:

```
 ⚠ Compiled with warnings in 1979ms

./node_modules/jose/dist/webapi/lib/deflate.js
A Node.js API is used (CompressionStream at line: 10) which is not supported in
the Edge Runtime.
Learn more: https://nextjs.org/docs/api-reference/edge-runtime

Import trace for requested module:
./node_modules/jose/dist/webapi/lib/deflate.js
./node_modules/jose/dist/webapi/jwe/flattened/decrypt.js
./node_modules/jose/dist/webapi/index.js
./node_modules/@auth/core/jwt.js
./node_modules/@auth/core/lib/init.js
./node_modules/@auth/core/lib/index.js
./node_modules/@auth/core/index.js
./node_modules/next-auth/index.js
```

**The build passes.** Exit code 0, 49/49 static pages generated, every route
emitted. It is a warning, not an error.

## Why it is there

`src/middleware.js` runs `next-auth` in the Edge Runtime:

```js
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/config';
const { auth } = NextAuth(authConfig);
export default auth((req) => { … });
export const config = { matcher: ['/admin/:path*'] };
```

That is deliberate — the file's own header records the constraint it was written
under: *"Edge-safety: imports `authConfig` (no Mongoose / bcrypt)."* Keeping
Mongoose and bcrypt out of the Edge bundle was the concern; `jose` arrives
anyway, because `next-auth` imports `@auth/core`, which imports `jose` for JWE,
which reaches a `deflate` helper that calls `CompressionStream`.

`CompressionStream` is a Node/browser API the Edge Runtime does not provide.
Webpack sees the reference while bundling for Edge and says so.

## Why it appears intermittently

It is emitted while **compiling that dependency**, so a build reusing a warm
`.next` does not print it — the module is not recompiled. Two builds earlier in
the same session showed `✓ Compiled successfully` and contained zero
`Compiled with warnings` lines; the build after `rm -rf .next` showed this.

So: **not new, and not caused by the change that happened to be in the tree when
it first appeared.** The entire import trace is inside `node_modules`, and the
commit it surfaced under touched the registrations detail client, `detailShell`
and three test files — none near auth or middleware.

That reasoning was accepted rather than proved. Building the parent commit on a
cleared `.next` would settle it and was judged not worth the time; if certainty
is ever wanted, that is the experiment.

## The part nobody has established

**Whether the warned code path is reached at runtime is UNKNOWN.**

The warning is a static observation: webpack found a reference to
`CompressionStream` in a module included in the Edge bundle. It does not say the
line executes. `deflate` sits under JWE — encrypted JWTs — and whether this
application's session tokens take that path, on any request the `/admin/:path*`
matcher handles, has not been checked.

Both readings are open and neither has evidence here:

* if the path is never reached, this is permanent build noise;
* if it is reached, it would fail at request time in the Edge Runtime, and the
  failure would surface as auth misbehaving on admin routes rather than as
  anything resembling this message.

Nothing in this repository currently distinguishes the two. That is the actual
open question, and it is the reason this is a ticket rather than a note in a
commit message.

## Not proposed

No runtime pin, no dependency change, no middleware restructuring, no
`serverExternalPackages` entry, no suppression of the warning. Each would be a
decision about the auth path taken without knowing the answer to the question
above, which is the wrong order.
