import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRichHtml, sanitizeBasicHtml } from '@/lib/sanitizeRichHtml';

/**
 * `sanitizeRichHtml` / `sanitizeBasicHtml` — the module docs/audit/
 * unsanitized-html-render-sites.md's approved allow-list produced.
 *
 * Every test here needs a control proving it CAN redden — see the header of
 * test/run.mjs for why that rule exists. Each security assertion below is
 * paired with a nearby "this specific thing survives" assertion so a
 * matcher that accidentally strips everything (or nothing) cannot pass both
 * halves of the same pair.
 *
 * The REAL-SAMPLE fixtures below were captured from the live database via
 * scripts/_probe-unsanitized-html-fields.mjs at audit time (docs/audit/
 * unsanitized-html-render-sites.md §1.2) — one representative value per
 * field that document measured, so this file is the thing that stops the
 * allow-list from silently eating live content, not merely a claim that it
 * doesn't.
 */

// ── §A — the three named hazards, each with its own survival control ───────

test('a <script> tag is removed entirely, tag and contents', () => {
  const out = sanitizeRichHtml('<p>before</p><script>alert(document.cookie)</script><p>after</p>');
  assert.doesNotMatch(out, /<script/i, 'the <script> tag survived');
  assert.doesNotMatch(out, /alert\(/i, "the script's own text survived — subtree-drop must remove content too");
  assert.match(out, /before/);
  assert.match(out, /after/);
});
test('CONTROL: an ordinary tag around the same text is not touched', () => {
  // Without this, "the script vanished" could mean the whole document was
  // being nuked, not that the sanitiser targeted <script> specifically.
  const out = sanitizeRichHtml('<p>before</p><p>after</p>');
  assert.equal(out, '<p>before</p><p>after</p>');
});

test('every on* attribute is stripped, on any tag', () => {
  const out = sanitizeRichHtml(
    '<p onclick="evil()">click</p><img src="https://a.com/x.png" onerror="evil()" onload="evil()">'
  );
  assert.doesNotMatch(out, /\son\w+\s*=/i, 'an on* attribute survived');
  assert.match(out, /click/, 'the element itself should survive — only the handler is the target');
  assert.match(out, /<img/, 'the img tag should survive — only the handler is the target');
});
test('CONTROL: a non-event attribute in the same position survives', () => {
  const out = sanitizeRichHtml('<img src="https://a.com/x.png" alt="a real caption">');
  assert.match(out, /alt="a real caption"/, 'an ordinary allowed attribute must not be collateral damage');
});

test('a javascript: URL is stripped from href and src alike', () => {
  const outHref = sanitizeRichHtml('<a href="javascript:alert(1)">click</a>');
  assert.doesNotMatch(outHref, /javascript:/i);
  assert.doesNotMatch(outHref, /href=/i, 'the whole href should be gone, not merely de-fanged');
  assert.match(outHref, /click/, 'the link text is not the hazard — it should survive');

  const outSrc = sanitizeRichHtml('<img src="javascript:alert(1)">');
  assert.doesNotMatch(outSrc, /javascript:/i);
});
test('CONTROL: an http(s) URL in the same position survives', () => {
  const out = sanitizeRichHtml('<a href="https://9experttraining.com">click</a>');
  assert.match(out, /href="https:\/\/9experttraining\.com"/);
});

test('a data: URL is stripped (not on the approved scheme list)', () => {
  const out = sanitizeRichHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
  assert.doesNotMatch(out, /data:/i);
});

test('a protocol-relative URL is stripped — the approved list names it explicitly', () => {
  const out = sanitizeRichHtml('<img src="//evil.example.com/x.png">');
  assert.doesNotMatch(out, /src=/i, 'a protocol-relative src should not survive under any scheme');
});
test('CONTROL: an absolute https src in the same position survives', () => {
  const out = sanitizeRichHtml('<img src="https://a.com/x.png">');
  assert.match(out, /src="https:\/\/a\.com\/x\.png"/);
});

// ── §B — a permitted tag with permitted attributes: byte-identical ─────────

test('a fully-permitted element survives byte-identical', () => {
  const input = '<p>plain text with <strong>bold</strong> and <a href="https://a.com" target="_blank" rel="noopener noreferrer">a link</a></p>';
  assert.equal(sanitizeRichHtml(input), input);
});

// ── §C — unwrap vs subtree-drop, asserted as TWO separate claims ───────────

test('an unknown/disallowed tag UNWRAPS — the tag goes, the text stays', () => {
  const out = sanitizeRichHtml('<header>keep this text</header>');
  assert.doesNotMatch(out, /<header/i);
  assert.match(out, /keep this text/, 'unwrap must keep the children, not delete them');
});
test('a hazardous tag SUBTREE-DROPS — the tag AND its text both go', () => {
  const out = sanitizeRichHtml('<script>drop this text too</script>');
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /drop this text too/, 'subtree-drop must remove the text, unlike unwrap');
});
test('CONTROL: the two rules really are different, not the same rule twice', () => {
  // If unwrap and subtree-drop behaved identically, the two tests above
  // would both pass on a matcher that only ever does one of them.
  const unwrapped = sanitizeRichHtml('<font color="red">x</font>');
  const dropped = sanitizeRichHtml('<style>x{color:red}</style>');
  assert.match(unwrapped, /x/, 'font (unwrap) should keep its text');
  assert.doesNotMatch(dropped, /x/, 'style (subtree-drop) should not');
});
// Tags that CAN carry children in HTML5 — a subtree-drop claim is only
// meaningful for these, since the text after them really is nested inside.
for (const tag of ['object', 'applet', 'form', 'button', 'select', 'textarea', 'noscript', 'svg', 'math', 'style']) {
  test(`subtree-drop list: <${tag}> drops its own text`, () => {
    const out = sanitizeRichHtml(`<${tag}>MARKER_TEXT</${tag}>after`);
    assert.doesNotMatch(out, /MARKER_TEXT/, `<${tag}> should be in the subtree-drop list`);
    assert.match(out, /after/);
  });
}
// Void elements (HTML5 cannot nest content inside them at all — a browser
// never parses `<meta>x</meta>` as meta containing "x"), so the meaningful
// claim for these is just "the tag itself does not survive", not "its text
// is dropped too" — there is no text to drop.
for (const tag of ['embed', 'input', 'link', 'meta', 'base']) {
  test(`subtree-drop list: <${tag}> (void element) does not survive`, () => {
    const out = sanitizeRichHtml(`<p>before</p><${tag}><p>after</p>`);
    assert.doesNotMatch(out, new RegExp(`<${tag}`, 'i'), `<${tag}> should be in the subtree-drop list`);
    assert.match(out, /before/);
    assert.match(out, /after/);
  });
}

// ── §D — the iframe host allow-list ─────────────────────────────────────────

test('a youtube-nocookie.com iframe survives — measured: all 41 stored article iframes share this exact host', () => {
  // scripts/_probe-unsanitized-html-fields.mjs + a direct hostname walk (see
  // docs/audit/unsanitized-html-render-sites.md §1.2) found ONE hostname
  // across all 41 stored <iframe src> values in Article.content:
  // www.youtube-nocookie.com. This fixture is that exact shape, captured
  // from a real article body (slug: ประวัติศาสตร์-DATA-เรียนรู้อดีต-สู่โลกอนาคต).
  const real =
    '<div><iframe width="640" height="360" allowfullscreen="true" autoplay="false" ' +
    'disablekbcontrols="false" enableiframeapi="false" endtime="0" ivloadpolicy="0" ' +
    'loop="false" modestbranding="false" origin="" playlist="" ' +
    'src="https://www.youtube-nocookie.com/embed/euOPBynlh74?rel=1" rel="1" start="0"></iframe></div>';
  const out = sanitizeRichHtml(real);
  assert.match(out, /<iframe/, 'the youtube-nocookie iframe must survive — it must not strip a single one of the 41');
  assert.match(out, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/euOPBynlh74\?rel=1"/);
  // Only the approved attribute set survives — the YouTube-extension-only
  // playback params (autoplay, loop, modestbranding, …) are NOT on the
  // approved list and are expected to be stripped; the embed itself (src,
  // width, height) is what "survives" claims.
  assert.match(out, /width="640"/);
  assert.match(out, /height="360"/);
});
test('CONTROL: the SAME iframe on a non-YouTube host does not survive', () => {
  const out = sanitizeRichHtml('<p>before</p><iframe src="https://evil.example.com/embed"></iframe><p>after</p>');
  assert.doesNotMatch(out, /<iframe/i, 'a non-allow-listed iframe host must be dropped entirely');
  assert.match(out, /before/);
  assert.match(out, /after/);
});
test('CONTROL: a bare rejected iframe does not survive as an empty tag', () => {
  // sanitize-html's default for a host it rejects is to strip src and keep
  // an empty <iframe></iframe> — exclusiveFilter is what turns that into no
  // iframe at all; this pins that the filter is actually wired up.
  const out = sanitizeRichHtml('<iframe src="https://evil.example.com/embed"></iframe>');
  assert.doesNotMatch(out, /<iframe/i);
});

// ── §E — inline colour is deliberately permitted, not stripped ─────────────

test('inline colour survives — it is a dark-mode ticket, not a security one', () => {
  // Real LocalFaq.answer_html sample (docs/audit §1.3: 8 of 36 rows carry
  // inline colour).
  const real = '<p><span style="color: rgb(75, 85, 99);">เหมาะสำหรับ Data Analyst</span></p>';
  const out = sanitizeRichHtml(real);
  assert.match(out, /color:\s*rgb\(75,\s*85,\s*99\)/, 'the exact rgb() colour must survive unchanged');
  assert.match(out, /เหมาะสำหรับ Data Analyst/);
});
test('CONTROL: an unrecognised style property in the same attribute is dropped', () => {
  const out = sanitizeRichHtml('<p style="color:red;position:fixed;top:0">t</p>');
  assert.match(out, /color:\s*red/, 'the permitted property must survive');
  assert.doesNotMatch(out, /position/i, 'an unpermitted property must be dropped, not the whole style attribute');
});
test('a style expression() is rejected — it matches no permitted grammar', () => {
  const out = sanitizeRichHtml('<span style="color: expression(alert(1))">x</span>');
  assert.doesNotMatch(out, /expression/i);
  assert.match(out, />x<\/span>/, 'the element and its text must survive — only the bad declaration is dropped');
});

// ── §F — target="_blank" always gets rel enforced ───────────────────────────

test('target="_blank" always gets rel="noopener noreferrer"', () => {
  const out = sanitizeRichHtml('<a href="https://a.com" target="_blank">x</a>');
  assert.match(out, /rel="noopener noreferrer"/);
});
test('CONTROL: a link without target="_blank" gets no rel injected', () => {
  const out = sanitizeRichHtml('<a href="https://a.com">x</a>');
  assert.doesNotMatch(out, /rel=/);
});

// ── §G — the `basic` profile is strictly narrower ───────────────────────────

test('basic profile: img/table/div/iframe are stripped even though rich allows them', () => {
  const out = sanitizeBasicHtml(
    '<div class="x"><img src="https://a.com/x.png"><table><tr><td>t</td></tr></table><iframe src="https://www.youtube.com/embed/x"></iframe>text</div>'
  );
  assert.doesNotMatch(out, /<img/i);
  assert.doesNotMatch(out, /<table/i);
  assert.doesNotMatch(out, /<iframe/i);
  assert.doesNotMatch(out, /<div/i);
  assert.match(out, /text/, 'the div unwraps — its text must survive even though the tag itself is not in basic');
});
test('CONTROL: basic profile still allows its own tag list', () => {
  const input = '<p>a <strong>b</strong> <a href="https://a.com">c</a></p>';
  assert.equal(sanitizeBasicHtml(input), input);
});
test('basic profile still strips script/on*/javascript: — same hazards, narrower canvas', () => {
  const out = sanitizeBasicHtml('<script>x</script><p onclick="y()">p</p><a href="javascript:z()">a</a>');
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /onclick/i);
  assert.doesNotMatch(out, /javascript:/i);
});

// ── §H — REAL STORED SAMPLES, one per field measured in §1.2 ───────────────
// Each fixture was captured from the live database (scripts/_probe-
// unsanitized-html-fields.mjs) at audit time. The assertion is "survives
// intact" for a clean sample and "loses exactly the hazardous part, keeps
// the rest" for the two fields §1.2 found something dangerous in. This is
// the test that stops the sanitiser from silently eating live content.

test('REAL SAMPLE — Article.content (a plain paragraph) survives untouched', () => {
  const real = '<p>ตามพระราชบัญญัติส่งเสริมการพัฒนาฝีมือแรงงาน พ.ศ. 2545</p>';
  assert.equal(sanitizeRichHtml(real), real);
});

test('REAL SAMPLE — LocalFaq.answer_html with inline colour survives, text and colour intact', () => {
  const real = '<p><span style="color: rgb(75, 85, 99);">หลักสูตรนี้เหมาะสำหรับ Data Analyst, Business Analyst</span></p>';
  const out = sanitizeRichHtml(real);
  assert.match(out, /หลักสูตรนี้เหมาะสำหรับ Data Analyst, Business Analyst/);
  assert.match(out, /color:\s*rgb\(75,\s*85,\s*99\)/);
});

test('REAL SAMPLE — Faq.answer_html (upstream, plain prose) survives untouched', () => {
  const real = 'ราคาหลักสูตร เวลาอบรม มาสามารถดูได้ที่เว็ปไซต์ www.9ExpertTraining.com ซึ่งราคาดังกล่าว ยังไม่รวมภาษีมูลค่าเพิ่ม 7%';
  assert.equal(sanitizeRichHtml(real), real);
});

test('REAL SAMPLE — MasterclassCourse.description_html survives untouched', () => {
  const real = '<p>ยกระดับทักษะการวิเคราะห์ข้อมูลด้วย Claude AI เครื่องมือ AI ที่ได้รับความนิยมในองค์กรชั้นนำทั่วโลก</p>';
  assert.equal(sanitizeRichHtml(real), real);
});

test('REAL SAMPLE — MasterclassCourse.system_requirements_html (ordered list) survives untouched', () => {
  const real = '<ol><li><p>ระบบปฏิบัติการ Windows 11 / 10</p></li><li><p>Internet</p></li></ol>';
  assert.equal(sanitizeRichHtml(real), real);
});

test('REAL SAMPLE — MasterclassBatch.preparation_html survives untouched', () => {
  const real = '<p><strong>กรุณาเตรียมอุปกรณ์และระบบให้พร้อมก่อนเข้าร่วม Workshop</strong></p><ol><li><p>Notebook หรือ Laptop ส่วนตัว</p></li></ol>';
  assert.equal(sanitizeRichHtml(real), real);
});

test('REAL SAMPLE — Banner.slide_text (plain prose, no tags) survives untouched', () => {
  const real = 'ในงาน World Economic Forum ปีนี้ ประเด็นเรื่อง Artificial Intelligence (AI) เป็นหัวใจหลักที่ผู้นำจากหลากหลายภาคส่วนนำมาหารือกัน';
  assert.equal(sanitizeBasicHtml(real), real);
});

test('REAL SAMPLE — license_options info_popup.html_content (basic profile) keeps text, drops the <h3> it has no room for', () => {
  // Real content carries an <h3> heading — the `basic` profile's approved
  // tag list has no headings, by design (it is the same profile as
  // Banner.slide_text). The heading unwraps: "ข้อกำหนด" survives as text,
  // the <h3> does not. This is a genuine, intended content shape change —
  // not a bug — and is called out in the round's report for that reason.
  const real = '<p>ผู้เข้าอบรมต้องเตรียม Account ของตนเองดังนี้</p><h3>ข้อกำหนด</h3><ol><li><p>มี Claude Account</p></li></ol>';
  const out = sanitizeBasicHtml(real);
  assert.doesNotMatch(out, /<h3/i, 'basic profile has no heading tags — this must unwrap, not survive');
  assert.match(out, /ข้อกำหนด/, 'the heading TEXT must still survive — unwrap, not delete');
  assert.match(out, /ผู้เข้าอบรมต้องเตรียม Account ของตนเองดังนี้/);
});

test('REAL SAMPLE — Promotion.html_content: script and on* handlers removed, marketing copy kept', () => {
  // A trimmed real fragment carrying the actual shape §1.2 measured across
  // 3 of 21 promotions: a working onmouseout handler alongside ordinary
  // visible copy in the same element.
  const real =
    '<div><h1>ฝึกอบรมพนักงานกับ 9Expert Training</h1>' +
    '<a href="https://a.com" onmouseout="this.style.color=\'white\';this.style.textDecoration=\'none\';">รายละเอียด</a>' +
    '<script>trackEvent()</script></div>';
  const out = sanitizeRichHtml(real);
  assert.doesNotMatch(out, /onmouseout/i);
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /trackEvent/i);
  assert.match(out, /ฝึกอบรมพนักงานกับ 9Expert Training/);
  assert.match(out, /รายละเอียด/);
});
