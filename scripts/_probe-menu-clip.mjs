/**
 * WHAT ACTUALLY CLIPS EACH FLOATING SHEET — the diagnostic, not a guard.
 *
 *   node --import ./test/loader.mjs scripts/_probe-menu-clip.mjs
 *
 * This is the instrument the row-menu diagnosis was made with, kept because the
 * conclusion it reached is counter-intuitive and the next reader will want to
 * re-run it rather than take it on trust. It prints, for every `role="menu"` on
 * the detail screen and the ตัวกรอง panel on the list screen, the FULL ancestor
 * chain with the boxes that clip marked.
 *
 * WHAT IT SHOWED, and it is the opposite of the obvious reading:
 *
 *   · the attendee row menu has NO clipping ancestor inside the client at all.
 *     SectionCard does not clip. The `overflow-hidden` a reader is thinking of
 *     is on StatCard in RegistrationsClient — the LIST screen's summary cards,
 *     round 3, so the accent bar's corners follow the card's radius — and that
 *     card is not an ancestor of any menu. What clipped the menu is the ADMIN
 *     SHELL: `<main class="h-screen overflow-y-auto">` in src/app/admin/
 *     layout.jsx, the only scrollport on the screen, inside a
 *     `h-screen overflow-hidden` row that means the document never scrolls.
 *
 *   · the ตัวกรอง panel DOES have one, and it is ListPanel's card.
 *
 * The guard that keeps both facts true is test/render/menuEscapesClip. This file
 * is the human-readable version and is not run by the suite.
 *
 * ── THE VOID LIST IS LOAD-BEARING ──────────────────────────────────────────
 * The first version had `path`, `rect` and the other SVG leaves in it. React
 * emits those with explicit close tags, so every `</path>` popped somebody
 * else's element, the chains came back three deep, and the probe reported "no
 * clipping ancestor" — the right answer from a broken instrument. The
 * balance audit at the end is what catches that.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';
import { RegistrationsClient } from '@/app/admin/registrations/_components/RegistrationsClient';
import { resolveDateWindow } from '@/lib/registrations/listFilter';

const A = { firstName: 'สมชาย', lastName: 'ใจดี', email: 'a@b.c', phone: '0812345678' };

const DETAIL = renderToStaticMarkup(createElement(RegistrationDetailClient, {
  doc: {
    _id: 'aaaaaaaaaaaaaaaaaaaa0001', status: 'pending', courseName: 'Power BI', classId: 'c',
    classDate: '12 ส.ค. 2569', scheduleType: 'classroom', attendanceMode: 'classroom',
    coordinator: { ...A, isAttending: true },
    attendeesListProvided: true, attendeesCount: 2, attendees: [A, A],
    requestInvoice: false, invoice: null, notes: '',
    createdAt: '2026-08-01T03:00:00.000Z', updatedAt: '2026-08-02T03:00:00.000Z',
  },
  history: null,
}));

const LIST = renderToStaticMarkup(createElement(RegistrationsClient, {
  initialData: { items: [], page: 1, pageCount: 1, total: 0, pageSize: 20 },
  status: 'all', q: '', source: 'public', range: 'all',
  counts: { total: 39 }, sourceTotals: { public: 39, inhouse: 9 }, lastEdited: {},
  from: '', to: '', course: '',
  dateWindow: resolveDateWindow({ range: 'all' }),
  courseOptions: [{ code: 'A', label: 'A' }],
}));

/** HTML void elements ONLY — see the note above. */
const VOID = new Set([
  'br', 'img', 'input', 'hr', 'meta', 'link', 'col',
  'source', 'area', 'base', 'embed', 'track', 'wbr', 'param',
]);

function* tagsOf(html) {
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) return;
    if (html.startsWith('<!', lt)) { i = html.indexOf('>', lt) + 1; continue; }
    let j = lt + 1;
    let quote = null;
    while (j < html.length) {
      const c = html[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
      j += 1;
    }
    yield html.slice(lt, j + 1);
    i = j + 1;
  }
}

const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? '';

function walk(label, html, match) {
  const stack = [];
  let unmatched = 0;
  let hits = 0;
  for (const raw of tagsOf(html)) {
    if (raw[1] === '/') {
      if (stack.length === 0) unmatched += 1; else stack.pop();
      continue;
    }
    const tag = /^<([a-zA-Z0-9]+)/.exec(raw)?.[1];
    if (!tag) continue;
    if (VOID.has(tag.toLowerCase()) || raw.endsWith('/>')) continue;
    const node = { tag, cls: attr(raw, 'class'), raw };
    if (match(node, stack)) {
      hits += 1;
      console.log(`\n═══ ${label} #${hits} — ancestors, outermost first ═══`);
      for (const [i, n] of stack.entries()) {
        const clips = /overflow-(hidden|auto|scroll|clip)|overflow-[xy]-/.test(n.cls);
        const traps = /\b(scale|rotate|skew|translate|blur|backdrop-blur|contain)-/.test(n.cls);
        const mark = clips ? ' CLIPS ' : traps ? ' TRAPS ' : '       ';
        console.log(`${String(i).padStart(2)}${mark}<${n.tag}> ${n.cls.slice(0, 120)}`);
      }
      console.log(`   ->    <${node.tag} role="${attr(node.raw, 'role')}"> ${node.cls.slice(0, 120)}`);
    }
    stack.push(node);
  }
  console.log(`\n[${label}] hits ${hits}, unmatched closes ${unmatched}, left open ${stack.length}`);
  if (unmatched || stack.length) {
    console.log('   ^^ THE WALK IS UNBALANCED. Every chain above is short and every '
      + '"no clipping ancestor" reading from it is worthless. Check VOID.');
  }
}

walk('detail role="menu"', DETAIL, (n) => attr(n.raw, 'role') === 'menu');
walk('list ตัวกรอง panel', LIST, (n, stack) => n.tag === 'div' && stack.at(-1)?.tag === 'details');

console.log('\nNOTE: neither render contains the admin shell — src/app/admin/layout.jsx is an');
console.log('async server component. Its chain is  div.flex.h-screen.overflow-hidden >');
console.log('main.h-screen.flex-1.overflow-y-auto > div.p-6 >  whatever is printed above at 0.');
console.log('THAT <main> is what clipped the row menu.');
