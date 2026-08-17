import { test } from 'node:test';
import assert from 'node:assert/strict';

import { walkSources, readSource } from '../sourceScan.mjs';

/**
 * `skillSlugs` must reach every component whose subtree renders a skill capsule.
 *
 * ── THE DEFECT CLASS ───────────────────────────────────────────────────────
 * This is the `currentYear` omission of 2026-08-13 in a second costume, and the
 * sibling guard test/fs/currentYearThreading is its model. There, two of four
 * mounts in ONE file were missed and 35 catalog pages 500'd. Here the failure is
 * quieter by design and therefore worse to find: a route that forgets the prop
 * renders capsules that simply are not links. No throw, no log, no visual tell —
 * the card looks exactly like it did before capsules were linkable at all.
 *
 * So the guard cannot be "does it render" and cannot be a render test over the
 * mounts someone remembered. It walks src/, derives the class from the IMPORT
 * GRAPH, and demands the prop at every mount it finds — including the mount
 * nobody has written yet.
 *
 * ── WHY BY IMPORT AND NOT BY NAME ──────────────────────────────────────────
 * `CourseCard` is exported by TWO modules and `CourseCarousel` by two more.
 * Name-matching produced a wrong call-site list twice in this repo. Every
 * membership decision below resolves the name through the importing file's own
 * import map; a file that mounts a same-named component from elsewhere
 * contributes nothing, and that is pinned rather than assumed.
 *
 * ── WHAT THIS CANNOT SEE ───────────────────────────────────────────────────
 * THAT THE PROP IS THREADED. Nothing more.
 *
 *   · not that the map is NON-EMPTY. `skillSlugs={{}}` satisfies every
 *     assertion here and links nothing. That is a legitimate degraded state
 *     (getPageLinkability fails closed to `{}`), so it cannot be an error.
 *   · not that the map is CORRECT. `skillSlugs={someTypo}` passes.
 *   · not that the value reaches the capsule. A component could accept the prop
 *     and drop it; only test/render and the live probe see that.
 *   · not that a capsule LINKS. The <span> → <Link> substitution is B3's
 *     subject, and this guard deliberately survives its absence — it is about
 *     the wiring, which must be in place before and after.
 *
 * The runtime backstop for the rest is lib/logUnresolvedCapsule, which warns on
 * the server when a capsule cannot resolve. Between them: this file catches the
 * route that never passes the map, the warn catches the map that cannot answer.
 */

// ── reading source with TRUE line numbers ───────────────────────────────────

/**
 * Line-preserving comment blanking, for the same reason currentYearThreading
 * does it: this guard reports file:line, and the canonical scrubber collapses a
 * block comment to one space, which would report a mount below a docstring
 * dozens of lines off. Cross-checked against the canonical scrubber below, so
 * the two disagreeing is a failure rather than a silent miss.
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

/** Resolve an import specifier to a repo-relative file (`@/` alias + Next exts). */
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

/** Which file each imported NAME in this module actually comes from. */
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

/**
 * THE capsule renderers, by FILE — not by name.
 *
 * TWO roots, where currentYearThreading has one, and the difference is the
 * whole reason that guard's `CardComponent` exemption has no counterpart here.
 * There, OnlineCourseCard was exempt because it never reaches formatRoundDays.
 * Here it is a ROOT: it draws the same capsule row from the same
 * `course.skills[].skill_name`, so the carousel that substitutes it carries the
 * prop for the same reason the default one does. An exemption would be a hole.
 *
 * Each root's capsule-ness is asserted below rather than trusted.
 */
const CARD_OWNERS = [
  'src/app/(public)/training-course/_components/CourseCard.jsx',
  'src/app/_components/home/OnlineCourseCard.jsx',
];

/** The two markers that make a file a capsule renderer, together. */
const RENDERS_CAPSULE = (code) => /skillTags/.test(code) && /skill_name/.test(code);

/**
 * Fixed point: start from the files importing either root, then add any file
 * that both imports AND mounts a member, until nothing new joins.
 *
 * Transitive on purpose. CourseCardGroup imports CourseCard; CourseListClient
 * imports CourseCardGroup and not CourseCard, so a non-transitive set would
 * check the inner mount and miss the outer one — the same one-level blindness
 * that let the currentYear defect ship.
 */
function derivedClass() {
  const members = new Map(); // rel -> exported component names

  /**
   * THE ROOTS ARE MEMBERS OF THEIR OWN CLASS, and this line is the difference
   * between this guard and its sibling.
   *
   * currentYearThreading seeds only from files that IMPORT the card, so the
   * innermost mounts — the `<CourseCard …/>` inside CourseCardGroup,
   * SkillPageClient, ProgramPageClient, RelatedCourses — are never checked. A
   * wrapper that accepts the prop and then forgets to hand it to the card
   * satisfies every other assertion: it mentions the name, and nothing mounts
   * IT without the prop. That is one dropped hop from a silent regression and
   * it is exactly the failure this round is about, so the cards are seeded here.
   */
  for (const owner of CARD_OWNERS) {
    const f = BY_REL.get(owner);
    if (f) members.set(owner, exportedComponents(f.code));
  }

  for (const f of FILES) {
    const imports = IMPORTS.get(f.rel);
    if (CARD_OWNERS.some((owner) => [...(imports?.values() ?? [])].includes(owner))) {
      members.set(f.rel, exportedComponents(f.code));
    }
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const f of FILES) {
      if (members.has(f.rel)) continue;
      const rendersOne = [...members].some(([ownerRel, names]) =>
        names.some((n) => mountsOfMember(f, n, ownerRel).length > 0)
      );
      if (rendersOne) { members.set(f.rel, exportedComponents(f.code)); grew = true; }
    }
  }
  return members;
}

const CLASS = derivedClass();

/**
 * A member that RESOLVES the map itself is a root — it supplies the value
 * rather than receiving it, which is the documented pattern: the SERVER page
 * reads it once and passes the map down, and no client component fetches it.
 * Both sanctioned sources count.
 */
const isRoot = (rel) => {
  const { code } = readSource(rel);
  return /getPageLinkability\s*\(/.test(code) || /getNavMenuData\s*\(/.test(code);
};

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

test('both capsule roots exist and still render a capsule', () => {
  // Self-invalidating. The class is rooted on these two files by path; if
  // either stops drawing the capsule row, the rooting is wrong and this must
  // say so rather than quietly guarding nothing.
  for (const owner of CARD_OWNERS) {
    const f = BY_REL.get(owner);
    assert.ok(f, `${owner} moved — the class has no root`);
    assert.ok(
      RENDERS_CAPSULE(f.code),
      `${owner} no longer renders a skill capsule — re-point this guard`
    );
  }
});

test('the derived class is non-empty and contains the known wrappers', () => {
  // Non-vacuity. If the import probe stops matching, every assertion below
  // passes over an empty set and this file becomes decoration.
  const names = [...CLASS.values()].flat();
  for (const known of [
    'ProgramPageClient', 'SkillPageClient', 'CourseCardGroup', 'CourseListClient',
    'RelatedCourses', 'CourseCarousel', 'NewCoursesSection', 'OnlineCoursesSection',
    // The cards themselves — seeded as roots, so their own mounts are checked.
    'CourseCard', 'OnlineCourseCard',
  ]) {
    assert.ok(names.includes(known), `${known} fell out of the derived class`);
  }
  assert.ok(CLASS.size >= 10, `derived only ${CLASS.size} member files`);
});

test('the two scanners agree, so no mount is being missed', () => {
  // blankComments is not string-aware; the canonical scrubber is. If they ever
  // disagree about how many mounts exist, fail LOUDLY rather than scan the
  // wrong text quietly.
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

test('EVERY mount of every class member supplies skillSlugs', () => {
  /**
   * THE PRIMARY GUARD. Reported as a LIST rather than a first-failure assert,
   * so removing the prop from one route names THAT route and leaves the others
   * silent — "one site covers the other" is the trap the sibling guard walked
   * into once already, and the separation is exercised by the round's controls.
   */
  const all = everyMount();
  const unthreaded = [];

  for (const { file, name, mount } of all) {
    if (/(?:^|[\s{])skillSlugs[=\s}]/.test(mount.attrs)) continue;
    unthreaded.push(`${file.rel}:${mount.line} <${name}>`);
  }

  // 15 today: 9 wrapper mounts + 4 `<CourseCard>` mounts inside the wrappers +
  // the 2 home-section mounts. The 16th checked hop is the `<CardComponent>`
  // indirection, which has its own test above because no name scan sees it.
  assert.ok(all.length >= 15, `only ${all.length} mounts scanned — the walk is not seeing the tree`);
  assert.deepEqual(
    unthreaded, [],
    'these mounts render a skill-capsule subtree without skillSlugs, so their '
    + 'capsules silently render unlinked:\n  '
    + unthreaded.join('\n  ')
  );
});

test('the INDIRECT mount — CourseCarousel via CardComponent — forwards skillSlugs', () => {
  /**
   * The one mount no name scan can see. CourseCarousel renders
   * `<CardComponent …/>`, a PROP holding the card — CourseCard by default,
   * OnlineCourseCard when OnlineCoursesSection substitutes it. `<CardComponent`
   * matches neither root's name, so the primary guard above steps straight over
   * it, and both home-page carousels depend on it.
   *
   * Asserted on the mount's own attribute list rather than on the file merely
   * mentioning the prop: CourseCarousel ACCEPTS skillSlugs, so a file-level
   * match would be satisfied by the parameter alone while the forward was
   * missing — the precise hop this test exists for.
   */
  const rel = 'src/app/_components/home/CourseCarousel.jsx';
  const f = BY_REL.get(rel);
  assert.ok(f, `${rel} moved — re-point this guard`);

  const indirect = mountsOf(f.scan, 'CardComponent');
  assert.equal(indirect.length, 1, `expected exactly one <CardComponent> mount, found ${indirect.length}`);
  assert.match(
    indirect[0].attrs,
    /(?:^|[\s{])skillSlugs[=\s}]/,
    `${rel}:${indirect[0].line} renders the card without forwarding skillSlugs`
  );

  // Self-invalidating: if the indirection is ever removed in favour of a named
  // mount, the primary guard covers it and this test should be deleted rather
  // than left passing over a `CardComponent` that no longer exists.
  assert.match(f.code, /CardComponent\s*=\s*CourseCard/, 'the CardComponent indirection is gone');
});

test('every component in the class accepts skillSlugs', () => {
  // The mirror of the mount check: a wrapper handed the prop that does not
  // declare it drops the chain one level lower, where no mount assertion looks.
  for (const [rel, names] of CLASS) {
    if (isRoot(rel)) continue; // supplies it, does not receive it
    if (!names.length) continue;
    assert.match(
      readSource(rel).code,
      /skillSlugs/,
      `${rel} renders a capsule subtree but never mentions skillSlugs`
    );
  }
});

test('the map is resolved on the SERVER, never fetched by a class member', () => {
  /**
   * The pattern this round is required to follow: the server page supplies the
   * value; no client component fetches it and none reads it from context. A
   * `'use client'` file calling the resolver would be a Mongo read in a browser
   * bundle — it would not even build — but the cheaper failure is a class
   * member quietly adding its own server fetch and drifting from its siblings.
   */
  for (const [rel] of CLASS) {
    const { raw, code } = readSource(rel);
    if (!/^\s*['"]use client['"]/m.test(raw)) continue;
    assert.ok(
      !/getPageLinkability\s*\(|getNavMenuData\s*\(/.test(code),
      `${rel} is a client component and must RECEIVE skillSlugs, not fetch it`
    );
    assert.ok(
      !/useContext\s*\(/.test(code) || !/skillSlugs/.test(code),
      `${rel} reads skillSlugs from context; it must arrive as a prop`
    );
  }
});

test('mounts are resolved by IMPORT, not by bare name', () => {
  /**
   * The collision that has produced a wrong call-site list twice:
   * `CourseCarousel` is exported by BOTH app/_components/home/CourseCarousel.jsx
   * and components/chat/ChatCards.jsx. Only the first renders a capsule.
   *
   * Pinned because the failure is silent in the SAFE direction too — if
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

test('the decoy cards are excluded because they render NO capsule', () => {
  /**
   * SELF-INVALIDATING, not an allowlist. Three files export or define a
   * `CourseCard` that draws no skill capsule. Each is out of the class solely
   * because of that, so each must fail this the moment it grows one — at which
   * point it needs threading and the exclusion must be deleted, not extended.
   */
  const decoys = [
    'src/components/course/CourseCard.jsx',       // pageBuilder + the -all-courses fallback
    'src/components/chat/ChatCards.jsx',          // the chat bubble's own card
    'src/app/(public)/schedule/_components/ScheduleClient.jsx', // a module-local CourseCard
  ];
  let checked = 0;
  for (const rel of decoys) {
    const f = BY_REL.get(rel);
    assert.ok(f, `${rel} moved — re-point this guard`);
    assert.ok(
      /CourseCard/.test(f.code),
      `${rel} no longer defines or imports a CourseCard; drop it from the decoy list`
    );
    assert.ok(
      !RENDERS_CAPSULE(f.code),
      `${rel} now renders a skill capsule — it must JOIN the class, not sit in this list`
    );
    assert.ok(!CLASS.has(rel), `${rel} is in the class but listed as a decoy`);
    checked += 1;
  }
  assert.equal(checked, decoys.length);
});

test('the class members that ARE roots resolve the map themselves', () => {
  /**
   * The other half of `isRoot`: it exempts a file from the "accepts skillSlugs"
   * check, so an over-broad match there would silently excuse a real omission.
   * Every root must be a server route file, and the five that exist today are
   * named so a sixth appearing is a visible diff rather than a silent exemption.
   */
  const roots = [...CLASS.keys()].filter(isRoot).sort();
  assert.deepEqual(roots, [
    'src/app/(public)/[...slug]/page.jsx',
    'src/app/(public)/program/[slug]/page.jsx',
    'src/app/(public)/skill/[slug]/page.jsx',
    'src/app/(public)/training-course/page.jsx',
    'src/app/page.jsx',
  ], 'the set of files resolving the slug map themselves changed');

  for (const rel of roots) {
    assert.ok(
      !/^\s*['"]use client['"]/m.test(readSource(rel).raw),
      `${rel} resolves the slug map but is a client component`
    );
  }
});

test('the home page REUSES its existing nav fetch rather than adding a second', () => {
  /**
   * page.jsx already called getNavMenuData() for the Program/Skill selector.
   * Adding getPageLinkability() beside it would be a second Mongo round trip
   * per render for a map it already holds — the specific waste this round was
   * told to avoid, and invisible in any output.
   */
  const { code } = readSource('src/app/page.jsx');
  assert.match(code, /getNavMenuData\s*\(/, 'the existing nav fetch is gone');
  assert.ok(
    !/getPageLinkability/.test(code),
    'page.jsx added a SECOND slug-map fetch; it already has skillSlugs from getNavMenuData'
  );
});

test('the resolver the capsules depend on still refuses to guess', () => {
  // If skillCapsuleHref were weakened to fall back to /skill/<slug>, every
  // assertion above would still pass while the capsules linked at 404s.
  const { code } = readSource('src/lib/skillCapsuleHref.js');
  assert.match(code, /return null;/);
  assert.ok(
    !/`\/skill\//.test(code),
    'skillCapsuleHref now builds a /skill/ URL — Round A measured that as a 404'
  );
});
