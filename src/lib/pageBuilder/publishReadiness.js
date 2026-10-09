/**
 * Is a page READY to go public? ONE definition, run by the publish dialog
 * (to gate the button and say why) and the server actions (the real guard).
 *
 * Distinct from visibility.js: that answers "given the status/dates, would a
 * visitor see it" — a scheduled-for-tomorrow page is valid but not-yet-visible.
 * THIS answers "is the page finished enough to publish at all". A page can pass
 * one and fail the other.
 *
 * Only the public-facing statuses are gated. draft/closed/archived are always
 * allowed — draft is the safe place to park anything, and closing/archiving an
 * already-imperfect page must never be blocked.
 *
 * The placeholders are the literal new-page seed (see the import site in
 * app/admin/pages/builder/new/page.jsx). They live here so the block and the
 * seed cannot drift: change the seed, and the readiness check follows. Blocking
 * on the exact placeholder is the cheap version of "has this been meaningfully
 * edited" — an author who truly wants the title "หน้าใหม่" can add a trailing
 * space or publish then rename; the heavier edited-flag machinery buys nothing
 * this doesn't.
 *
 * ── IT READS SECTION *CONTENT* NOW, NOT ONLY PAGE-LEVEL FIELDS ────────────
 * Stated up front because the next person adding a per-section publish rule
 * needs to find this door OPEN rather than build a second one beside it.
 *
 * For its first three rounds this checked `title`, `slug` and the section
 * COUNT — three page-level facts, no walk. It now also walks the section tree
 * and reads the `content` of individual sections. The first such rule is
 * `promotion_bundle`'s: a bundle whose ราคาสุทธิ is above its ราคาปกติ cannot
 * go public.
 *
 * WHY HERE AND NOT IN THE SCHEMA. A zod `.refine()` on the section content
 * would be the obvious home and is the wrong one: that content is validated by
 * `draftContentSchema` on EVERY autosave, so a refusal there stops the WHOLE
 * PAGE saving while an author is mid-edit — a bundle whose second price has not
 * been typed yet would freeze the document. This function returns `[]` for
 * draft/closed/archived, so a half-typed page saves freely and only the
 * PUBLISH is refused. That is the distinction that makes this the right door.
 *
 * WHAT IT COSTS. The walk is total (it descends container slots, so a bundle
 * nested in a `two_column` is reached) and it is O(nodes) with no I/O — pure
 * property reads on an object already in memory. Measured against the real
 * corpus on 2026-09-05: six pages, the largest carrying **27 section nodes**
 * (17 top-level). At that size the walk is not a cost worth naming; it runs
 * once per publish, on a request that is already doing a database write and a
 * version snapshot.
 *
 * THE RULE FOR ADDING ONE. Put the predicate in a pure module that the EDITOR
 * also imports, never inline here — `isInvertedPrice` lives in
 * `bundlePricing.js` for exactly that reason. A blocker whose rule is written
 * only in this file will disagree with whatever the panel warns, and the author
 * meets that disagreement as "เผยแพร่ refuses and nothing on screen says why".
 */

import { slotsOf } from './containerSlots';
// The ONE definition of the inverted-price rule. Imported rather than
// restated so this refusal and the editor's warning cannot disagree — see
// the note on adding a per-section rule above.
import { isInvertedPrice } from './bundlePricing';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. `offeredRoundsOf` normalises an item that may still be
// stored on the legacy one-round shape; the other two are the pickUntil ruling
// — the runtime clamps a too-late date anyway, and these let the author be
// told rather than left to discover it.
import { offeredRoundsOf } from './chosenRounds';
import { pickUntilTooLate, latestAllowedPickUntil } from './bundleRoundChoice';

export const PLACEHOLDER_SLUG = 'untitled';
export const PLACEHOLDER_TITLE = 'หน้าใหม่';

const PUBLIC_STATES = ['published', 'scheduled'];

/**
 * Blockers preventing `page` from taking `status`. Empty array = ready.
 * Each blocker names the field and what to do — the UI shows the message, the
 * server rejects with the first one.
 *
 * @param page   the page as it will be saved (working tree or post-Zod data)
 * @param status the status being moved TO
 * @returns {{ field: string, message: string }[]}
 */
export function publishBlockers(page, status) {
  if (!PUBLIC_STATES.includes(status)) return []; // draft/closed/archived always allowed

  const blockers = [];
  const title = String(page?.title ?? '').trim();
  const slug = String(page?.slug ?? '').trim();
  const sectionCount = Array.isArray(page?.sections) ? page.sections.length : 0;

  if (!title) {
    blockers.push({ field: 'title', message: 'ต้องตั้งชื่อหน้าก่อนเผยแพร่' });
  } else if (title === PLACEHOLDER_TITLE) {
    blockers.push({ field: 'title', message: `ยังใช้ชื่อเริ่มต้น “${PLACEHOLDER_TITLE}” อยู่ — ตั้งชื่อจริงก่อนเผยแพร่` });
  }

  if (!slug) {
    blockers.push({ field: 'slug', message: 'ต้องตั้ง URL (slug) ก่อนเผยแพร่' });
  } else if (slug === PLACEHOLDER_SLUG) {
    blockers.push({ field: 'slug', message: `ยังใช้ URL เริ่มต้น “${PLACEHOLDER_SLUG}” อยู่ — ตั้ง URL จริงก่อนเผยแพร่` });
  }

  // ANY section, not just enabled ones: a page whose only section is hidden has
  // nothing to show, which is the same failure as an empty page.
  if (sectionCount === 0) {
    blockers.push({ field: 'sections', message: 'หน้านี้ยังไม่มี section — เพิ่มอย่างน้อยหนึ่ง section ก่อนเผยแพร่' });
  }

  blockers.push(...bundlePriceBlockers(page?.sections));

  return blockers;
}

/**
 * Every bundle on the page whose ราคาสุทธิ is above its ราคาปกติ.
 *
 * ── ONE BLOCKER PER BAD BUNDLE, NAMED ────────────────────────────────────
 * Not one summary blocker for the page. A promotion page carries SEVERAL
 * bundles, and "a bundle has bad prices" on a page with four of them tells the
 * author to go and check all four. The message carries the bundle's own name,
 * or its position when it has none yet.
 *
 * ── DISABLED SECTIONS ARE INCLUDED, DELIBERATELY ─────────────────────────
 * The same call the section-count check above makes ("ANY section, not just
 * enabled ones"). A hidden bundle is one an author will re-enable later,
 * probably without re-reading its prices, and a rule that skipped it would let
 * the bad pair through on the edit that made it visible — at which point
 * nothing would say why the page had suddenly become publishable-with-a-defect.
 *
 * ── IT WALKS, BECAUSE A BUNDLE CAN BE NESTED ─────────────────────────────
 * A `promotion_bundle` inside a `two_column` is an ordinary way to lay a
 * promotion page out, and a check that only read the top level would pass it.
 * The slots are `containerSlots`' — imported, not restated.
 */
function bundlePriceBlockers(sections) {
  const out = [];
  let index = 0;

  const walk = (arr) => {
    for (const s of Array.isArray(arr) ? arr : []) {
      if (!s || typeof s !== 'object') continue;
      if (s.type === 'promotion_bundle') {
        index += 1;
        const c = s.content ?? {};
        const name = String(c.name ?? '').trim();
        const which = name ? ` “${name}”` : `ลำดับที่ ${index}`;
        if (isInvertedPrice(c.listPrice, c.netPrice)) {
          out.push({
            field: 'sections',
            message:
              `แพ็กเกจ${which} มีราคาสุทธิสูงกว่าราคาปกติ — แก้ราคาก่อนเผยแพร่`,
          });
        }

        /**
         * ── AN ITEM WITH NO OFFERED ROUND, AND A pickUntil THAT CANNOT HOLD ─
         *
         * Both are blockers rather than warnings, and the difference from the
         * sequential-chain check (which is a WARNING, in the editor) is the
         * reason: these two are facts about the stored document and will still
         * be true tomorrow, whereas whether a chain exists depends on live
         * status and can fix itself without anyone touching the page.
         *
         * An item with no round is not cosmetic. `resolveBundleRequest`
         * refuses the whole package for it, so publishing one ships a
         * promotion that silently takes no registrations — the shape
         * docs/ticket-bundle-unavailable-invisible.md is about.
         *
         * `pickUntilTooLate` is the publish half of the ruling that the
         * author's date may only ever close a round EARLIER. The runtime
         * clamps it anyway (`effectivePickDeadline` takes the earliest of the
         * two), so this cannot change what a visitor sees — it exists so the
         * author is told their date is doing nothing rather than discovering
         * it by watching the card close on a day they did not choose.
         *
         * `offeredRoundsOf` rather than `c.items[n].rounds`: this runs over the
         * stored document, where a legacy item still carries `roundId`.
         */
        const items = Array.isArray(c.items) ? c.items : [];

        /**
         * ── ONE COURSE = ONE ITEM ─────────────────────────────────────────
         * A course now carries its own list of offered rounds, so naming it
         * twice is never the way to offer two rounds of it — and under
         * `sequential` it is incoherent: the item order is the learning order,
         * so two items for one course would say it must be taken after itself.
         * It also makes the package price ambiguous (two items, one course,
         * one seat sold).
         *
         * A BLOCKER rather than a warning, by the same line the other two
         * draw: this is a fact about the stored document and will still be
         * true tomorrow.
         *
         * MEASURED before adding it, across all 36 stored bundles in all three
         * places sections live: ZERO repeat a courseId. So this cannot
         * retroactively block a page anyone has, and there was nothing to
         * merge — which is why the editor simply refuses the pick rather than
         * offering a migration.
         */
        const seen = new Map();
        for (const it of items) {
          const code = String(it?.courseId ?? '').trim();
          if (!code) continue;
          seen.set(code, (seen.get(code) ?? 0) + 1);
        }
        for (const [code, n] of seen) {
          if (n < 2) continue;
          out.push({
            field: 'sections',
            message:
              `แพ็กเกจ${which} — หลักสูตร “${code}” อยู่ในแพ็กเกจ ${n} ครั้ง ` +
              'ให้เหลือการ์ดเดียวแล้วเพิ่มรอบในการ์ดนั้น',
          });
        }

        items.forEach((it, i) => {
          const offered = offeredRoundsOf(it);
          const code = String(it?.courseId ?? '').trim();
          const row = code ? `“${code}”` : `ลำดับที่ ${i + 1}`;
          if (offered.length === 0) {
            out.push({
              field: 'sections',
              message:
                `แพ็กเกจ${which} — คอร์ส${row} ยังไม่ได้เลือกรอบ ` +
                'แพ็กเกจที่มีคอร์สไม่ครบรอบจะไม่รับลงทะเบียน',
            });
            return;
          }
          for (const round of offered) {
            if (!pickUntilTooLate(round)) continue;
            out.push({
              field: 'sections',
              message:
                `แพ็กเกจ${which} — คอร์ส${row} ตั้งวันสุดท้ายที่เลือกรอบได้ ` +
                `(${round.pickUntil}) หลังวันเริ่มรอบ ระบบจะปิดให้เลือกก่อนรอบเริ่มอยู่แล้ว — ` +
                `แก้เป็น ${latestAllowedPickUntil(round) ?? 'วันก่อนรอบเริ่ม'} หรือเว้นว่าง`,
            });
          }
        });
      }
      const slots = slotsOf(s.type);
      if (slots) for (const slot of slots) walk(s.content?.[slot]);
    }
  };

  walk(sections);
  return out;
}
