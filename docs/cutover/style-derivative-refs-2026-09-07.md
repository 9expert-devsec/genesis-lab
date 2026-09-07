# Stored references to Drupal image-style derivatives

_Measured 2026-09-07 against the shared cluster `genesis-cluster0.mrhpieh.mongodb.net`,
database `9exp_genesis`. Read-only: the scan issues `find` only — no update, upsert or
delete, and no transaction. Nothing was rewritten._

## Question

How many stored strings point at a `/styles/<style>/public/` derivative rather than the
original file, and for each one, **does the original actually exist**? The second half is
the point: a rewrite that swaps a derivative URL for an original that was never uploaded
trades one broken image for another, silently.

## Headline

| | |
|---|---|
| Collections scanned | 57 (every collection in the database) |
| Collections containing hits | 3 |
| Total derivative references | **1490** |
| Distinct original paths behind them | 778 |
| RESOLVABLE (original row exists, status `uploaded`) | **1484** (99.6%) |
| MISSING (no usable original) | **6** (0.4%) |
| Live HEAD probes returning 200 | 10 / 10 |

## 1. Where the references are

| Collection | Field path | Hits |
|---|---|---|
| `articles` | `coverUrl` | 471 |
| `admin_audit_logs` | `before.coverUrl` | 359 |
| `admin_audit_logs` | `after.coverUrl` | 354 |
| `articles` | `content` | 295 |
| `promotions` | `html_content` | 11 |

| Collection | Docs scanned | Hits |
|---|---|---|
| `admin_audit_logs` | 1914 | 713 |
| `articles` | 494 | 766 |
| `promotions` | 21 | 11 |

> **`admin_audit_logs` is 48% of the total (713 hits) and is a historical record.** Its
> `before.coverUrl` / `after.coverUrl` pairs are what a field *was* and *became* at the
> time of an edit. Rewriting them would falsify the audit trail rather than fix a broken
> image — no audit-log row is ever rendered to a visitor. The live surface is the
> 777 hits in `articles` and `promotions`.

## 2. Styles in use

Derivation applied to each hit: strip the query string (`?itok=...`), remove the
`styles/<style>/public/` segment run, then drop a trailing `.webp` **only** when the
sequence beneath it is itself an image extension (`.png.webp` -> `.png`). A size-only
derivative keeps its original format and is left alone.

| Style | Stream | Hits |
|---|---|---|
| `large_cover` | `public` | 1184 |
| `max_850` | `public` | 295 |
| `course_image` | `public` | 6 |
| `cover` | `public` | 5 |

Every hit sits under the `public` stream wrapper; no `private` or `temporary` derivative
was found, so none of them needs the low-confidence handling the rewrite library reserves
for those.

## 3. Does the original exist?

Checked against `legacy_file_migrations`, matching on `sourcePath` with `status: "uploaded"`.

| Class | Hits | Distinct originals |
|---|---|---|
| RESOLVABLE | 1484 | 772 |
| MISSING | 6 | 6 |

### The MISSING list - these need a decision, not a rewrite

All six carry a `legacy_file_migrations` row whose status is **`skipped-dead`**: the
migration already tried these and found nothing at the source. There is no original to
point at, so rewriting them would replace a broken derivative URL with a broken original
URL. Each is a single hit.

| Derived original path | Row status | Found in |
|---|---|---|
| `/sites/default/files/images/training-course/power-bi-power bi desktop (Custom).png` | `skipped-dead` | promotions :: html_content |
| `/sites/default/files/images/training-course/power-bi-pq-advanced power query (Custom).png` | `skipped-dead` | promotions :: html_content |
| `/sites/default/files/images/training-course/power-bi-dax-dax data analysis expression (Custom).png` | `skipped-dead` | promotions :: html_content |
| `/sites/default/files/images/training-course/power-bi-adv-visualization and ai (Custom).png` | `skipped-dead` | promotions :: html_content |
| `/sites/default/files/images/training-course/power-bi-xdm-data model (Custom).png` | `skipped-dead` | promotions :: html_content |
| `/sites/default/files/images/training-course/generative-ai-digital-marketing-for-business-transformation.png` | `skipped-dead` | promotions :: html_content |

## 4. Live delivery, measured

Ten distinct RESOLVABLE originals, `HEAD https://genesis-lab.9expert.app<path>`. A 404
would have been believed on the first response; only transport errors and 429/5xx were
retried. None needed a retry.

| Status | Content-Length | Content-Type | Path |
|---|---|---|---|
| 200 | 40404 | image/webp | `/sites/default/files/articles/cover/excel-work-with-text-cover-for-article.png` |
| 200 | 38440 | image/webp | `/sites/default/files/articles/cover/cover-what-is-power-platform-en_0.png` |
| 200 | 38282 | image/webp | `/sites/default/files/articles/cover/virtual-class-room-ms-teams_0.png` |
| 200 | 41476 | image/webp | `/sites/default/files/articles/cover/what-is-power-automate-desktop.png` |
| 200 | 39332 | image/webp | `/sites/default/files/articles/cover/dax-function-concatenatex.png` |
| 200 | 31148 | image/webp | `/sites/default/files/articles/cover/cover-dax-function-or.png` |
| 200 | 24452 | image/webp | `/sites/default/files/articles/cover/cover-article-agentic-ai-talk-with-nine-ep-2.jpg` |
| 200 | 42742 | image/webp | `/sites/default/files/articles/cover/windows-11-1-new-windows-os_0.png` |
| 200 | 41384 | image/webp | `/sites/default/files/articles/cover/cover-c-multiple-inheritance-using-interfaces.png` |
| 200 | 101268 | image/webp | `/sites/default/files/articles/cover/youtube-merge-file-dashboard-cover.png` |

All ten resolve with real image bytes (24-101 KB), served as `image/webp` by the delivery
layer's format negotiation. The DB field and the origin agree.

## 5. Proposed rewrite - first 20 RESOLVABLE hits

Shown as stored. The host is left as-is here so the change is visible in one dimension
only: the `styles/.../public/` run and the appended `.webp` come off. Host rewriting is a
separate decision already handled by `scripts/lib/legacy-reference-rewrite.mjs`.

| # | Collection - field | Before | After |
|---|---|---|---|
| 1 | `admin_audit_logs` - `before.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/excel-work-with-text-cover-for-article.png.webp?itok=4Jk4lOaS` | `https://www.9experttraining.com/sites/default/files/articles/cover/excel-work-with-text-cover-for-article.png` |
| 2 | `admin_audit_logs` - `after.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/excel-work-with-text-cover-for-article.png.webp?itok=4Jk4lOaS` | `https://www.9experttraining.com/sites/default/files/articles/cover/excel-work-with-text-cover-for-article.png` |
| 3 | `admin_audit_logs` - `before.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/cover-what-is-power-platform-en_0.png.webp?itok=1C1F_tM9` | `https://www.9experttraining.com/sites/default/files/articles/cover/cover-what-is-power-platform-en_0.png` |
| 4 | `admin_audit_logs` - `after.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/cover-what-is-power-platform-en_0.png.webp?itok=1C1F_tM9` | `https://www.9experttraining.com/sites/default/files/articles/cover/cover-what-is-power-platform-en_0.png` |
| 5 | `admin_audit_logs` - `before.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/virtual-class-room-ms-teams_0.png.webp?itok=uEOu0YL1` | `https://www.9experttraining.com/sites/default/files/articles/cover/virtual-class-room-ms-teams_0.png` |
| 6 | `admin_audit_logs` - `after.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/virtual-class-room-ms-teams_0.png.webp?itok=uEOu0YL1` | `https://www.9experttraining.com/sites/default/files/articles/cover/virtual-class-room-ms-teams_0.png` |
| 7 | `admin_audit_logs` - `before.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/what-is-power-automate-desktop.png.webp?itok=_7kWsLxc` | `https://www.9experttraining.com/sites/default/files/articles/cover/what-is-power-automate-desktop.png` |
| 8 | `admin_audit_logs` - `after.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/what-is-power-automate-desktop.png.webp?itok=_7kWsLxc` | `https://www.9experttraining.com/sites/default/files/articles/cover/what-is-power-automate-desktop.png` |
| 9 | `admin_audit_logs` - `before.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/dax-function-concatenatex.png.webp?itok=DwadLTVg` | `https://www.9experttraining.com/sites/default/files/articles/cover/dax-function-concatenatex.png` |
| 10 | `admin_audit_logs` - `after.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/dax-function-concatenatex.png.webp?itok=DwadLTVg` | `https://www.9experttraining.com/sites/default/files/articles/cover/dax-function-concatenatex.png` |
| 11 | `admin_audit_logs` - `before.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/cover-dax-function-or.png.webp?itok=jUeL8Jz2` | `https://www.9experttraining.com/sites/default/files/articles/cover/cover-dax-function-or.png` |
| 12 | `admin_audit_logs` - `after.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/cover-dax-function-or.png.webp?itok=jUeL8Jz2` | `https://www.9experttraining.com/sites/default/files/articles/cover/cover-dax-function-or.png` |
| 13 | `admin_audit_logs` - `before.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/cover-article-agentic-ai-talk-with-nine-ep-2.jpg.webp?itok=kNSuwAnj` | `https://www.9experttraining.com/sites/default/files/articles/cover/cover-article-agentic-ai-talk-with-nine-ep-2.jpg` |
| 14 | `admin_audit_logs` - `after.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/cover-article-agentic-ai-talk-with-nine-ep-2.jpg.webp?itok=kNSuwAnj` | `https://www.9experttraining.com/sites/default/files/articles/cover/cover-article-agentic-ai-talk-with-nine-ep-2.jpg` |
| 15 | `admin_audit_logs` - `before.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/windows-11-1-new-windows-os_0.png.webp?itok=tF_Szogl` | `https://www.9experttraining.com/sites/default/files/articles/cover/windows-11-1-new-windows-os_0.png` |
| 16 | `admin_audit_logs` - `after.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/windows-11-1-new-windows-os_0.png.webp?itok=tF_Szogl` | `https://www.9experttraining.com/sites/default/files/articles/cover/windows-11-1-new-windows-os_0.png` |
| 17 | `admin_audit_logs` - `before.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/cover-c-multiple-inheritance-using-interfaces.png.webp?itok=nZ_dheAe` | `https://www.9experttraining.com/sites/default/files/articles/cover/cover-c-multiple-inheritance-using-interfaces.png` |
| 18 | `admin_audit_logs` - `after.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/cover-c-multiple-inheritance-using-interfaces.png.webp?itok=nZ_dheAe` | `https://www.9experttraining.com/sites/default/files/articles/cover/cover-c-multiple-inheritance-using-interfaces.png` |
| 19 | `admin_audit_logs` - `before.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/youtube-merge-file-dashboard-cover.png.webp?itok=MvmKSW48` | `https://www.9experttraining.com/sites/default/files/articles/cover/youtube-merge-file-dashboard-cover.png` |
| 20 | `admin_audit_logs` - `after.coverUrl` | `https://www.9experttraining.com/sites/default/files/styles/large_cover/public/articles/cover/youtube-merge-file-dashboard-cover.png.webp?itok=MvmKSW48` | `https://www.9experttraining.com/sites/default/files/articles/cover/youtube-merge-file-dashboard-cover.png` |

## Method notes - two corrections that changed the answer

**`sourcePath` is stored decoded.** Matching the percent-encoded derived path directly
reported 181 MISSING hits across 113 distinct originals. 106 of those 113 were an encoding
artifact, not a missing file - the lookup key has to be `decodeURIComponent`d first. The
first number was wrong by a factor of 30.

**Parentheses are legitimate filename characters here.** Terminating URL extraction at
`(` truncated paths such as `...power bi desktop (Custom).png`, inventing one phantom
MISSING. Only whitespace, quotes, angle brackets and backslash terminate a URL in this
corpus.

Both were caught by checking a suspicious result against the stored document rather than
accepting the aggregate.

## What this does not tell you

- Only the 10 sampled originals were probed live. The other 762 RESOLVABLE originals rest
  on the `legacy_file_migrations` row alone, which records what a migration run believed at
  the time, not what the origin serves today.
- The scan finds `/styles/` in string values. A reference assembled at render time from
  parts, or stored base64-encoded, would not appear.
