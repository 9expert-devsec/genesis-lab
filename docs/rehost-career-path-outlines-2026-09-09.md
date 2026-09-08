# Re-host: 10 career-path outlines into the legacy delivery namespace

**Date:** 2026-09-09 · **Round:** OUT-RDR · **Operator:** Pirasak S.

The ten career-path course outlines lived only on Cloudinary, at root
public_ids created by hand outside the migration. They now also exist inside
the legacy delivery namespace, so a redirect to them can stay **internal** —
off-site redirect destinations were ruled out when the Redirect Panel was
scoped.

This file is the receipt. Cloudinary keeps one version per public_id and
`overwrite` destroys the previous bytes, so without a written record there is
no answer to "when did this land, from what, and who did it".

## What was written

Ten **raw** assets, created by server-side copy: the upload API was given the
existing Cloudinary URL as its source, so Cloudinary fetched each file itself.
No bytes passed through an operator machine, and the originals were not
touched.

Target public_ids follow `legacyPathToPublicId(path, 'raw')` — the repo's only
implementation of that rule. No substitution rules fired (no `&`, no `#`, no
trailing whitespace).

| course | public_id (under `9exp-genesis/legacy/`) | bytes | version | etag |
| --- | --- | ---: | --- | --- |
| Prompt Engineer | `files/course-outline/career-prompt-engineer-course-outline-th.pdf` | 3,652,653 | 1788910500 | `3fcbdd1eab34` |
| Business Analytics | `files/course-outline/career-business-analytics-course-outline-th.pdf` | 2,469,348 | 1788910501 | `529fb73772d2` |
| Citizen Developer | `files/course-outline/career-citizen-developer-course-outline-th.pdf` | 3,773,237 | 1788910502 | `6aa623d0a547` |
| RPA Developer | `files/course-outline/career-rpa-developer-course-outline-th.pdf` | 4,848,684 | 1788910504 | `917c3039c944` |
| Accounting & Finance | `files/course-outline/career-accounting-and-finance-course-outline-th.pdf` | 3,627,797 | 1788910505 | `28ccb9208dbd` |
| Data Analyst | `files/course-outline/career-data-analyst-course-outline-th.pdf` | 3,955,643 | 1788910506 | `9a4610d25792` |
| Data Engineering & Business Intelligence | `files/course-outline/career-data-engineering-and-business-intelligence-course-outline-th.pdf` | 3,767,747 | 1788910508 | `75c231d68d2c` |
| Power Automate Specialist | `files/course-outline/career-power-automate-specialist-course-outline-th.pdf` | 3,616,706 | 1788910509 | `6c1c206521c0` |
| Web Developer | `files/course-outline/career-web-developer-course-outline-th.pdf` | 2,241,855 | 1788910511 | `6a1c1f1d6e20` |
| Visual Communication & Presentation | `files/course-outline/career-visual-communication-and-presentation-course-outline-th.pdf` | 5,873,668 | 1788910512 | `b0a4ec29c314` |

Every byte count equals its source exactly.

## What was NOT written

**No MongoDB write of any kind.** `dev` and production share one database, and
none was needed: `/files/course-outline/*` is served by a static external
rewrite in `next.config.mjs` straight to Cloudinary, with no function and no
database in the request path. `course_outline_files` is provenance bookkeeping
— its own model header says nothing that serves a file may read it — so these
ten files deliver correctly with no row.

The consequence, stated so it is not discovered later: those ten are the only
files under `/files/course-outline/` with no `course_outline_files` row (152
rows cover the other 152 files). Whether to add them is a separate decision,
deliberately deferred until the redirects are proven.

## Naming

`career-<slug>-course-outline-th.pdf`, following `outlineFileName()` in
`src/lib/courses/courseOutline.js`, which all 149 pre-existing outline files
obey. The round's mapping sheet had proposed `career-<slug>-outline-th.pdf`,
dropping the `course-` infix; the `career-` prefix already supplies the
distinguishability that was reaching for, so a second naming rule would have
bought nothing and cost the single derivable one.

All ten targets were verified unoccupied before upload — at the site URL and at
the Cloudinary raw delivery URL — and `overwrite: false` was set on every call,
so a clobber was not expressible rather than merely unlikely.

## Verification

All ten serve `200 application/pdf` at `https://www.9experttraining.com` with
byte-exact `content-length`.

**They did not do so immediately.** For several minutes after upload the site
flapped between 200 and 404 on these paths, `x-vercel-cache: MISS` throughout —
Cloudinary edge propagation for newly-created raw assets, visible here only
because `NO_STORE_DOCUMENT_EXTENSIONS` keeps PDFs out of the edge cache and
every request therefore goes through live. A single 200 was not accepted as
proof: each file was required to return **three consecutive byte-exact 200s**,
and the largest (5.87 MB) five, its trace decaying as expected
(`.XX....X.XXX.....`).

Anyone re-running this: expect the same flap, and do not read an early 404 as a
failed upload. Check the Cloudinary delivery URL directly before re-uploading —
a second upload of an already-present asset is how the previous bytes get
destroyed.

## Consequence outside this repo

The course team generated `9exp.link/...` short links against the ORIGINAL
Cloudinary URLs. Those are untouched and still work — this was a copy, not a
move — which means each career-path outline now exists as **two independent
Cloudinary assets**. Updating one leaves the other stale.

That is the same defect class this round exists to close, reintroduced at a
layer this repo cannot reach. Whoever owns those short links needs to either
re-point them at `/files/course-outline/career-…` or accept a documented
two-place update. Nothing in this codebase can enforce it.
