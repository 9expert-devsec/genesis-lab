import { test } from 'node:test';
import assert from 'node:assert/strict';

import { walkSources, readSource } from '../sourceScan.mjs';

/**
 * `currentYear` must reach every component whose subtree renders a CourseCard.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * `formatRoundDays(..., { showYear: 'auto' })` THROWS when `currentYear` is not
 * a number (lib/schedule/roundDateLabel.js:210), deliberately: Vercel runs UTC,
 * so on 31 December the server and the browser disagree about the year for
 * seven hours, and the module refuses to read the clock rather than render two
 * different labels. `CourseCard` therefore gives `currentYear` NO DEFAULT — the
 * omission is a hard 500, not a wrong label.
 *
 * `/[...slug]/page.jsx` mounted `<ProgramPageClient>` and `<SkillPageClient>`
 * without it. 35 published catalog pages — 27 program `-all-courses` slugs and
 * 8 skill ones — returned 500 behind the site error boundary. The same file
 * already called `siteCurrentYear()` correctly at two OTHER mounts, so this was
 * not an unknown pattern; it was two of four call sites in one file.
 *
 * ── WHY THIS IS A SOURCE GUARD AND NOT A RENDER TEST ───────────────────────
 * A render test covers the mounts someone thought to write a case for. The
 * failure mode here is a mount that DOES NOT EXIST YET — the next page that
 * renders a course grid. This walks every mount in src/ and derives the set of
 * components to check from the import graph, so a sixth wrapper and a
 * seventeenth mount are covered without anyone adding a case.
 *
 * It is also why the first attempt at this round nearly shipped a render test
 * that would have covered the program branch and blessed the skill branch,
 * which had been failing beside it unnoticed.
 *
 * WHAT IT CANNOT SEE: whether the value is CORRECT. `currentYear={0}` or
 * `currentYear={someUndefinedVar}` satisfies this scan and still throws. It
 * asserts the prop is threaded, not that the number is right — that is
 * test/pure/roundDateLabel's job, and the throw itself is the runtime backstop.
 */

// ── reading source with TRUE line numbers ───────────────────────────────────

/**
 * sourceScan's scrubber collapses a block comment to a single space, which is
 * right for token scanning and wrong here: this guard reports file:line, and a
 * mount below a docstring would be reported dozens of lines off.
 *
 * So comments are blanked LINE-PRESERVINGLY instead. This one is not
 * string-aware — a `//` inside a string literal is blanked too — which is
 * acceptable for locating `<Component` mounts and is cross-checked below
 * against the canonical scrubber, so the two disagreeing is a test failure
 * rather than a silent miss.
 */
function blankComments(raw) {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

/** Every JSX mount of `<Name …>` in `text`, with its full attribute list. */
function mountsOf(text, name) {
  const out = [];
  const re = new RegExp(`<${name}(?=[\\s/>])`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    // Brace-aware: a `>` inside `{cond ? <a/> : <b/>}` does not end the tag.
    let i = m.index + m[0].length;
    let depth = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
      i += 1;
    }
    out.push({
      attrs: text.slice(m.index, i + 1),
      line: text.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

const FILES = walkSources('src').map((f) => ({ ...f, scan: blankComments(f.raw) }));
const BY_REL = new Map(FILES.map((f) => [f.rel, f]));

/** The component names a file exports (function or const arrow). */
function exportedComponents(code) {
  return [
    ...code.matchAll(/export\s+(?:async\s+)?function\s+([A-Z]\w*)/g),
    ...code.matchAll(/export\s+const\s+([A-Z]\w*)\s*=/g),
  ].map((m) => m[1]);
}

/**
 * Resolve an import specifier to a repo-relative file, mirroring the `@/` alias
 * and Next's extension resolution.
 */
function resolveSpecifier(fromRel, spec) {
  let base;
  if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith('.')) {
    const parts = fromRel.split('/').slice(0, -1);
    for (const seg of spec.split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    base = parts.join('/');
  } else return null; // a package, never one of ours
  for (const cand of [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`, `${base}/index.jsx`]) {
    if (BY_REL.has(cand)) return cand;
  }
  return null;
}

/**
 * Which file each imported NAME in this module actually comes from.
 *
 * Load-bearing, and the reason this guard is import-resolved rather than
 * name-matched: `CourseCarousel` is exported by BOTH
 * app/_components/home/CourseCarousel.jsx (renders CourseCard) and
 * components/chat/ChatCards.jsx (renders neither). A name-only scan pulls
 * ChatPanel, ChatLauncher and app/layout.jsx into the class and demands
 * `currentYear` on a chat bubble.
 */
function importMap(file) {
  const out = new Map();
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(file.withImports)) !== null) {
    const rel = resolveSpecifier(file.rel, m[2]);
    if (!rel) continue;
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim();
      if (name) out.set(name, rel);
    }
  }
  return out;
}
const IMPORTS = new Map(FILES.map((f) => [f.rel, importMap(f)]));

/** Mounts of `<name>` in `file` that genuinely refer to `ownerRel`'s export. */
function mountsOfMember(file, name, ownerRel) {
  const resolved = file.rel === ownerRel || IMPORTS.get(file.rel)?.get(name) === ownerRel;
  return resolved ? mountsOf(file.scan, name) : [];
}

// ── the class, DERIVED from the import graph ────────────────────────────────

const CARD = 'CourseCard';

/**
 * THE card, by file — not by name. `CourseCard` is exported by two unrelated
 * modules: this one, which renders a round strip through
 * `formatRoundDays(..., { showYear: 'auto' })`, and
 * components/course/CourseCard.jsx, which renders no dates at all. Rooting the
 * class on the bare name pulls pageBuilder's bundle_courses section in and
 * demands `currentYear` on a card that has no use for it.
 */
const CARD_OWNER = 'src/app/(public)/training-course/_components/CourseCard.jsx';

/**
 * A mount is exempt when it hands the carousel a DIFFERENT card component.
 * `CourseCarousel` takes `CardComponent`, defaulting to CourseCard;
 * OnlineCoursesSection passes OnlineCourseCard, which never reaches
 * formatRoundDays. The exemption is verified by its own test below rather than
 * trusted, and it is declared HERE because the class derivation reads it: a
 * file whose only mount is exempt renders no CourseCard and does not join.
 */
const exemptCardComponent = (attrs) => {
  const m = attrs.match(/CardComponent=\{(\w+)\}/);
  return m && m[1] !== CARD ? m[1] : null;
};

/**
 * Fixed point: start from the files that import CourseCard, then add any file
 * that both imports AND mounts a member, until nothing new joins.
 *
 * Transitive on purpose. CourseCardGroup imports CourseCard; CourseListClient
 * imports CourseCardGroup and not CourseCard, so a non-transitive set would
 * check the inner mount and miss the outer one — which is the same
 * one-level-of-indirection blindness that let this defect ship.
 */
function derivedClass() {
  const members = new Map(); // rel -> exported component names
  for (const f of FILES) {
    if (IMPORTS.get(f.rel)?.get(CARD) === CARD_OWNER) {
      members.set(f.rel, exportedComponents(f.code));
    }
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const f of FILES) {
      if (members.has(f.rel)) continue;
      const rendersOne = [...members].some(([ownerRel, names]) =>
        names.some((n) =>
          // Membership propagates only through a NON-EXEMPT mount. A file whose
          // only use of the carousel substitutes a different card renders no
          // CourseCard, so it is not in the class and its own mounts are not
          // constrained — OnlineCoursesSection is exactly this.
          mountsOfMember(f, n, ownerRel).some((mt) => !exemptCardComponent(mt.attrs))
        )
      );
      if (rendersOne) { members.set(f.rel, exportedComponents(f.code)); grew = true; }
    }
  }
  return members;
}

const CLASS = derivedClass();

/**
 * A member that calls `siteCurrentYear()` itself is a ROOT — it supplies the
 * value rather than receiving it, which is the documented pattern
 * (articlePublishTime.js:138: the SERVER page calls it once and passes the
 * number down). Roots are route files; nothing mounts them, so in practice this
 * exempts nobody's mounts. It is stated so the rule is complete rather than
 * accidentally true.
 */
const isRoot = (rel) => /siteCurrentYear\s*\(/.test(readSource(rel).code);

/** Every (file, member, mount) triple in the class, resolved by import. */
function everyMount() {
  const out = [];
  for (const f of FILES) {
    for (const [ownerRel, names] of CLASS) {
      for (const name of names) {
        for (const mount of mountsOfMember(f, name, ownerRel)) {
          out.push({ file: f, name, mount });
        }
      }
    }
  }
  return out;
}

// ── the assertions ──────────────────────────────────────────────────────────

test('the derived class is non-empty and contains the known wrappers', () => {
  // Non-vacuity. If the import probe stops matching, every assertion below
  // passes over an empty set and this file becomes decoration.
  const names = [...CLASS.values()].flat();
  for (const known of [
    'ProgramPageClient', 'SkillPageClient', 'CourseCardGroup',
    'RelatedCourses', 'CourseCarousel',
  ]) {
    assert.ok(names.includes(known), `${known} fell out of the derived class`);
  }
  assert.ok(CLASS.size >= 5, `derived only ${CLASS.size} member files`);
});

test('the two scanners agree, so no mount is being missed', () => {
  // blankComments is not string-aware; the canonical scrubber is. If they ever
  // disagree about how many mounts exist, this fails LOUDLY rather than
  // quietly scanning the wrong text.
  const names = [...CLASS.values()].flat();
  for (const f of FILES) {
    for (const name of names) {
      const mine = mountsOf(f.scan, name).length;
      const canonical = mountsOf(f.code, name).length;
      assert.equal(
        mine, canonical,
        `${f.rel}: comment-blanking found ${mine} <${name}> mounts, the canonical scrubber ${canonical}`
      );
    }
  }
});

test('the OTHER CourseCard is genuinely out of scope', () => {
  /**
   * Self-invalidating, like the CardComponent exemption. The class is rooted on
   * ONE CourseCard module; components/course/CourseCard.jsx is excluded solely
   * because it renders no dates. If it ever grows a round strip it needs
   * threading too, and this must fail rather than let the exclusion stand.
   */
  const other = BY_REL.get('src/components/course/CourseCard.jsx');
  assert.ok(other, 'the second CourseCard moved — re-point this guard');
  assert.ok(
    !/formatRoundDays/.test(other.code),
    'components/course/CourseCard now calls formatRoundDays — it belongs in the class'
  );
  assert.ok(BY_REL.has(CARD_OWNER), `${CARD_OWNER} moved — the class has no root`);
  assert.match(BY_REL.get(CARD_OWNER).code, /formatRoundDays/, 'the root card still renders dates');
});

test('mounts are resolved by IMPORT, not by bare name', () => {
  /**
   * The collision that made the first draft of this file demand `currentYear`
   * on a chat bubble: `CourseCarousel` is exported by BOTH
   * app/_components/home/CourseCarousel.jsx and components/chat/ChatCards.jsx.
   * Only the first renders a CourseCard.
   *
   * Pinned because the failure is silent in the safe direction too — if
   * resolution broke the other way, mounts would stop being seen and this file
   * would go quietly green.
   */
  const chat = BY_REL.get('src/components/chat/ChatCards.jsx');
  assert.ok(chat, 'the colliding module moved — re-point this guard');
  assert.ok(
    exportedComponents(chat.code).includes('CourseCarousel'),
    'the name collision is gone; if so, simplify this guard rather than leaving a dead check'
  );
  assert.ok(!CLASS.has(chat.rel), 'the chat carousel must NOT be in the class');

  const panel = BY_REL.get('src/components/chat/ChatPanel.jsx');
  assert.ok(panel && /<CourseCarousel/.test(panel.scan), 'ChatPanel still mounts its own carousel');
  assert.equal(
    everyMount().filter((m) => m.file.rel === panel.rel).length,
    0,
    'ChatPanel mounts a DIFFERENT CourseCarousel and must contribute no mounts'
  );
});

test('every component in the class accepts currentYear', () => {
  for (const [rel, names] of CLASS) {
    if (isRoot(rel)) continue; // supplies it, does not receive it
    if (!names.length) continue;
    assert.match(
      readSource(rel).code,
      /currentYear/,
      `${rel} renders a CourseCard subtree but never mentions currentYear`
    );
  }
});

test('EVERY mount of every class member supplies currentYear', () => {
  /**
   * The primary guard. Reported as a LIST rather than a first-failure assert so
   * that removing the prop from one mount names that mount — the two sites in
   * /[...slug]/page.jsx must redden independently, because "one site covers the
   * other" is exactly the trap this round walked into once already.
   */
  const all = everyMount();
  const unthreaded = [];

  for (const { file, name, mount } of all) {
    if (exemptCardComponent(mount.attrs)) continue;
    if (/(?:^|[\s{])currentYear[=\s}]/.test(mount.attrs)) continue;
    unthreaded.push(`${file.rel}:${mount.line} <${name}>`);
  }

  assert.ok(all.length >= 6, `only ${all.length} mounts scanned — the walk is not seeing the tree`);
  assert.deepEqual(
    unthreaded, [],
    'these mounts render a CourseCard subtree without currentYear, which throws '
    + 'at roundDateLabel.js:210 on any course with a schedule:\n  '
    + unthreaded.join('\n  ')
  );
});

test('the CardComponent exemption is still justified', () => {
  /**
   * Self-invalidating. The exemption rests on the substituted card never
   * reaching formatRoundDays; if OnlineCourseCard ever starts rendering a round
   * strip, this fails and the exemption has to be removed rather than silently
   * covering a real hole.
   */
  let checked = 0;

  for (const { file, mount } of everyMount()) {
    const substitute = exemptCardComponent(mount.attrs);
    if (!substitute) continue;
    checked += 1;
    const owner = FILES.find((g) => exportedComponents(g.code).includes(substitute));
    assert.ok(owner, `${file.rel}:${mount.line} substitutes ${substitute}, which no file exports`);
    assert.ok(
      !/formatRoundDays/.test(owner.code),
      `${owner.rel} exports ${substitute} and DOES call formatRoundDays — `
      + `the exemption at ${file.rel}:${mount.line} is no longer safe`
    );
  }
  assert.equal(checked, 1, `expected exactly one CardComponent substitution, found ${checked}`);
});

test('the throw this all protects is still in place', () => {
  // If the guard at roundDateLabel.js:210 were weakened to a silent fallback,
  // every assertion above would still pass while the site rendered wrong years.
  const { code } = readSource('src/lib/schedule/roundDateLabel.js');
  assert.match(code, /showYear === 'auto' && !Number\.isFinite\(currentYear\)/);
  assert.match(code, /throw new TypeError\(/);
});
