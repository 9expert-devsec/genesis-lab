# Commit convention

One feature per commit. Use conventional prefixes.

## Prefixes

| Prefix      | When to use                                              |
| ----------- | -------------------------------------------------------- |
| `feat:`     | New user-facing feature or significant capability        |
| `fix:`      | Bug fix                                                  |
| `refactor:` | Code change that neither fixes a bug nor adds a feature  |
| `chore:`    | Tooling, deps, config — no product change                |
| `docs:`     | Documentation only                                       |
| `style:`    | Formatting, whitespace (no functional change)            |
| `test:`     | Test-only changes                                        |
| `perf:`     | Performance improvement                                  |

## Format

```
<prefix>: <short imperative summary, <= 72 chars>

<optional body explaining WHY the change was made,
wrapped at 72 chars. Not a list of what changed —
`git diff` already shows that.>
```

## Examples

```
feat: add public course list page with skill filter

Wires /training-course to /api/ai/public-courses via the
public-courses adapter. Filter chips use URL state so links
are shareable and SEO-crawlable.
```

```
fix: handle upstream 'Active' status casing in promotions

Upstream returns capitalized status. Per Manifesto §4.3 we
do not normalize at the adapter — handle here in the promotion
list page.
```

```
chore: bump next to 15.0.3
```

## Rules

- **No "misc fixes" commits.** If you made 3 unrelated changes, make 3 commits.
- **No noisy commits** like "wip", "update", or "typo". Amend or squash.
- **Body explains WHY**, not WHAT. The diff shows what.
- **Never commit secrets.** If you do by accident, rotate immediately and rewrite history.
