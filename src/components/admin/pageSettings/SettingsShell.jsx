'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
/**
 * The menu glyphs, as a SECOND lucide statement rather than an edit of the one
 * above — the standing rule in the page-builder editor directory this code was
 * extracted from, and the one test/render/panelPolish's importedLucideNames
 * scanner exists because of. It travels with the code.
 */
import { FileText, Search, CodeXml, Lock, History } from 'lucide-react';
// Round 38's glyph, ADDED beside the statements above rather than folded into
// any — the same standing rule.
import { ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * THE ONE PAGE-SETTINGS DIALOG SHELL, shared by both page editors.
 *
 * ── WHY THIS FILE EXISTS, AND WHY IT IS A MOVE RATHER THAN A SECOND DIALOG ──
 * The Advanced HTML editor (`/admin/pages`, the Tiptap `CustomPageForm`) had no
 * page-settings surface at all — its settings lived in a right-hand sidebar with
 * its own `Section`/`Label`/`inputCls` primitives, which looked nothing like the
 * Page Builder's dialog. The requirement was not "a similar dialog"; it was the
 * SAME dialog.
 *
 * A look-alike would have satisfied a screenshot and then drifted: two frames,
 * two navs, two footer bands, diverging one commit at a time with nothing able
 * to report it. So the presentation half of PageSettingsDialog moved HERE
 * unchanged — classNames included, verbatim — and both callers import it. If the
 * two dialogs ever look different, it is because a caller passed different
 * props; it cannot be because two files drifted.
 *
 * ── WHAT IS DELIBERATELY *NOT* HERE ────────────────────────────────────────
 * Everything page-builder-bound stays in PageSettingsDialog.jsx: `useEditor()`,
 * `PATCH_PAGE`, the five-second autosave, VersionHistory, ActivityTrail,
 * getPreviewState/PreviewBody, PAGE_TYPES/PAGE_THEMES, the promotion trio. None
 * of it has a CustomPage equivalent, and dragging any of it in would make this
 * file unimportable from an /admin/pages route.
 *
 * ── THE TWO PROPS THAT ARE NEW ─────────────────────────────────────────────
 * `sections` on SettingsNav, so a second caller can pass its own menu; and the
 * footer band takes its sentence as children, because the builder's
 * autosave promise is true for the builder and false for CustomPageForm, which
 * saves only when บันทึกอัปเดต is pressed. Same band, different sentence.
 * Nothing else about the shape changed.
 */

/**
 * The menu, as data. One declaration, read by the nav and by each body's switch,
 * so a section cannot exist in one and not the other.
 *
 * `preview` is the odd one: every other section stages an edit for autosave,
 * and that one writes to the server the moment a button is pressed. It is in
 * the same menu because that is where an author looks for it, and it announces
 * the difference itself — see PreviewSection.
 */
/**
 * ── THE GLYPHS ARE THE DESIGN'S, DRAWN FROM THE LIBRARY THE REPO ALREADY HAS ─
 * lucide-react is already the source of `iconOf()` (rounds 9-14), so the menu
 * meets an author with the same drawing hand as the section picker and the
 * structure rows. The Figma exports its own SVGs; those URLs expire in seven
 * days and every one of the five has an unmistakable lucide equivalent, so
 * nothing is downloaded. The one that is a JUDGEMENT rather than a match is
 * named where it is chosen — see the icon map note in the round report.
 */
export const PAGE_SETTINGS_SECTIONS = [
  { id: 'general', label: 'ข้อมูลหน้า',        Icon: FileText },
  { id: 'seo',     label: 'SEO',               Icon: Search },
  { id: 'jsonld',  label: 'JSON-LD',           Icon: CodeXml },
  { id: 'preview', label: 'ลิงก์พรีวิว',        Icon: Lock },
  { id: 'history', label: 'ประวัติการเผยแพร่', Icon: History },
  /**
   * ── THE SIXTH, ROUND 38 ───────────────────────────────────────────────────
   * A separate item rather than a second group under ประวัติการเผยแพร่. That
   * one lists VERSIONS — things that were published and can be restored; this
   * lists ACTIONS, most of which produced no version and none of which can be
   * acted on. One title cannot be right for both, and putting them together
   * would invite the join between a publish row and a version row that the
   * stored shape cannot support (see ActivityTrail).
   *
   * `ประวัติการดำเนินการ` is not a new vocabulary: it is the phrase this admin
   * already uses for an audit trail — the registrations detail screen, the
   * course detail screen and /admin/audit-log all carry it. Meeting the author
   * with the word they have already learned is worth more than a novel one.
   *
   * ITS OWN GLYPH. `History` belongs to the section above; two items drawn with
   * one icon would read as two halves of the same thing, which is exactly the
   * conflation the separate item exists to avoid.
   */
  { id: 'activity', label: 'ประวัติการดำเนินการ', Icon: ScrollText },
];

/**
 * The left-hand menu, as a component that takes its state rather than owning it.
 *
 * ── WHY IT IS SPLIT OUT, AND IT IS THE SAME REASON AS EVERY OTHER SPLIT HERE ─
 * Round 28 gives one menu item a STATUS DOT, and a status dot is exactly the
 * kind of thing that gets hardcoded on and then looks right forever. Taking
 * `previewStatus` as a prop is what lets the render tier drive it to each of
 * its real values and assert the dot follows — including the value where the
 * dot must NOT be there. A menu that read the status itself could only ever be
 * tested in the state a static render happens to produce.
 *
 * ── THE DOT IS THE ONE DESIGN ORNAMENT HERE THAT HAS A SOURCE ─────────────
 * The Figma puts two decorations in this menu: an "Auto" pill on JSON-LD and a
 * green dot on Preview Link. They are not the same kind of thing.
 *
 * NOTHING emits JSON-LD for a builder page (round 27, and the builder's section
 * still says so in words), so the pill would be a claim with no source — it is
 * deliberately not built. The preview link's state IS real, read fresh from the
 * server by `getPreviewState`, and `previewSchema` carries the status the dot
 * shows. So one of the two is built and the other is not, and which is which is
 * decided by whether anything can answer the question the ornament asks.
 *
 * `null` — the status is not known yet, or was never fetched — renders NO dot,
 * for the same reason a top-level section renders no parent line: an unknown
 * shown as "off" is a claim, and shown as "on" is a worse one.
 *
 * ── `sections` IS A PROP, AND DEFAULTS TO THE ONE MENU ─────────────────────
 * The second caller (the Advanced HTML dialog) passes the SAME array — it
 * imports PAGE_SETTINGS_SECTIONS rather than retyping six Thai labels, so the
 * two menus cannot drift apart. The prop exists so a caller CAN differ where it
 * has a reason to, not so that it must.
 */
export function SettingsNav({ section, onSelect, previewStatus, sections = PAGE_SETTINGS_SECTIONS }) {
  return (
    <nav
      aria-label="ส่วนของการตั้งค่า"
      className={cn(
        'shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-hover)]',
        'px-2.5 py-3 sm:w-[190px] sm:border-b-0 sm:border-r'
      )}
    >
      <ul className="flex gap-1 overflow-x-auto sm:flex-col sm:gap-1 sm:overflow-visible">
        {sections.map((s) => {
          const active = section === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(s.id)}
                className={cn(
                  'flex h-10 w-full items-center gap-1.5 whitespace-nowrap rounded-9e-sm px-2.5 text-left text-xs',
                  active
                    ? 'bg-9e-action-scale-900 font-bold text-9e-action dark:bg-9e-action/20 dark:text-9e-air'
                    : 'text-9e-slate-dp-50 hover:bg-[var(--surface-hover)] dark:hover:bg-[var(--surface-hover)]'
                )}
              >
                <s.Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {s.id === 'preview' && previewStatus === 'active' && (
                  <span
                    data-testid="nav-preview-dot"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-9e-green-50"
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * ── WHY THERE IS NO SAVE BUTTON, STATED WHERE THE BUTTON WOULD BE ──────────
 * The mockups put ยกเลิก / บันทึกการตั้งค่า at the dialog's foot. Both labels
 * would be false FOR THE BUILDER. Every field there dispatches into the editor's
 * working tree, and the editor autosaves it on a five-second debounce — so by
 * the time either button could be pressed the change is usually already on the
 * server. "Save" would duplicate a save that happened, and "Cancel" would cancel
 * nothing.
 *
 * That is the same second-authority shape the width control had until round 25:
 * two layers each believing they own one concept. So the footer answers the
 * question the author actually has — is this safe yet — instead of offering a
 * second way to make it so.
 *
 * ── ROUND 28: IT BECOMES THE DESIGN'S FOOTER BAND ─────────────────────────
 * The Figma draws a 66px band across the dialog's foot, holding the two
 * buttons. The band is geometry and the band is kept; what stands in it is
 * still the save state, for the reason above. So the design's shape arrives
 * without the design's second save authority — which is the only part of it
 * that was ever the objection.
 *
 * ── THE BAND IS GEOMETRY; THE SENTENCE IS THE CALLER'S ────────────────────
 * The reasoning above is TRUE FOR THE BUILDER and FALSE for the Advanced HTML
 * editor, which has no autosave and persists only when บันทึกอัปเดต is pressed.
 * Promising that author an automatic save would be the exact class of
 * claim-with-no-source this dialog's JSON-LD section exists to refuse. So the
 * band takes its sentence as children: one geometry, and each caller states the
 * truth about its own save path.
 */
export function SettingsFooterBand({ children }) {
  return (
    <p data-testid="settings-save-state"
      className={cn(
        'flex min-h-[66px] shrink-0 items-center border-t border-[var(--surface-border)]',
        'bg-[var(--surface-muted)] px-5 text-xs text-9e-slate-dp-50'
      )}>
      {children}
    </p>
  );
}

/**
 * The Radix frame and the 93px header band.
 *
 * ── NOTHING IN HERE IS REACHABLE FROM THE RENDER TIER, AND THAT IS WHY THE
 *    BODIES ARE SEPARATE ───────────────────────────────────────────────────
 * A Radix `Dialog.Portal` renders ZERO BYTES under renderToStaticMarkup —
 * measured, not assumed. So every caller keeps its BODY in an independently
 * exported component taking plain props, and only the untestable chrome lives
 * here. That is the same split, for the same reason, as `SettingsPanel`'s
 * exported tab bodies (round 15) and `SectionPickerBody` (rounds 9/13).
 */
export function SettingsShell({ open, onClose, children }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex w-[min(57.5rem,calc(100vw-2rem))] flex-col',
            '-translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] shadow-9e-lg',
            'h-[42.5rem] max-h-[calc(100dvh-4rem)]'
          )}
        >
          <div className="flex min-h-[93px] shrink-0 items-start justify-between border-b border-[var(--surface-border)] px-5 pb-4 pt-5">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-9e-slate-dp-50">PAGE SETTINGS</p>
              <Dialog.Title className="mt-0.5 text-xl leading-7 text-9e-navy dark:text-white">ตั้งค่าหน้า</Dialog.Title>
              <p className="mt-1 text-xs text-9e-slate-dp-50">
                จัดการข้อมูลหน้า SEO, Structured Data และ Preview Access
              </p>
            </div>
            <Dialog.Close
              aria-label="ปิด"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-9e-sm text-9e-slate-dp-50 hover:bg-[var(--surface-hover)]"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          {/*
            ── THE EXAMPLES HERE MUST BE TRUE OF BOTH CALLERS ─────────────────
            This read "ชื่อ, URL, ธีม และ SEO" while it lived in the builder's
            dialog, where all four are real fields. Shared, it is now also read
            out to someone on the Advanced HTML editor, and `CustomPage` has no
            theme field at all — that dialog deliberately builds no ธีม control
            for exactly that reason.

            `เช่น` does not license it. An example list is a claim that its
            members exist, not a hedge that some might not, and this is the one
            surface whose readers cannot glance at the dialog and see that the
            control is absent. Same correction as the preview link's "ยังเปิด
            ไม่ได้" sentence and the stale byte constants: a screen-reader-only
            string gets the same standard as a visible one, or the standard is
            just "whatever someone would notice".

            So the list is trimmed to the three that are true on both sides
            rather than made configurable — a per-caller description prop would
            be a third way for the two dialogs to drift, to fix a problem that
            deleting one word solves.
          */}
          <Dialog.Description className="sr-only">แก้ไขข้อมูลระดับหน้า เช่น ชื่อ, URL และ SEO</Dialog.Description>

          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
