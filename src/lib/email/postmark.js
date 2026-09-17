/**
 * Postmark REST API wrapper. Intentionally lightweight — the project
 * depends on the `postmark` npm SDK transitively but we don't import
 * it here to keep the send path obvious and side-effect-free.
 *
 * If POSTMARK_SERVER_TOKEN or POSTMARK_FROM_EMAIL is missing, logs a
 * warning and returns `{ skipped: true }` without throwing, so the
 * caller can proceed (e.g. still save the registration).
 */

/**
 * ── CC / BCC ARE THE CALLER'S, VERBATIM ─────────────────────────────────────
 * There is no env read here any more. `buildCc()` / `buildBcc()` used to merge
 * an app-wide pair, POSTMARK_{CC,BCC}_EMAILS, into EVERY send — and
 * called `buildCc(undefined)`, so a caller-supplied CC was discarded — which
 * copied the same people on every flow. That pair is retired. Each sender
 * decides its own copies through src/lib/email/recipients.js and hands the
 * result in as `cc` / `bcc`; this file sends exactly what it is given, and
 * omits the header when given nothing.
 */
const header = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

export async function sendEmail({ to, cc, bcc, subject, html, text }) {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM_EMAIL;

  if (!token || !from) {
    console.error(
      '[postmark] ❌ SKIPPED — missing env var.',
      'POSTMARK_SERVER_TOKEN:', token ? '✓ set' : '✗ MISSING',
      'POSTMARK_FROM_EMAIL:', from ? '✓ set' : '✗ MISSING',
      '| To:', to,
      '| Subject:', subject
    );
    return { skipped: true, reason: 'missing_env' };
  }

  try {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify({
        From: from,
        To: to,
        Cc: header(cc),
        Bcc: header(bcc),
        Subject: subject,
        HtmlBody: html,
        TextBody: text,
        MessageStream: 'outbound',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[postmark] Send failed', res.status, body.slice(0, 200));
      return { error: `Postmark returned ${res.status}` };
    }

    const data = await res.json();
    console.log('[postmark] ✅ Sent | MessageID:', data.MessageID, '| To:', to, '| Subject:', subject);
    return { messageId: data.MessageID };
  } catch (err) {
    console.error('[postmark] Network error', err);
    return { error: err.message };
  }
}

export async function sendTemplateEmail({ to, cc, bcc, templateAlias, templateModel }) {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from  = process.env.POSTMARK_FROM_EMAIL;

  if (!token || !from) {
    console.error('[postmark] ❌ sendTemplateEmail SKIPPED — missing env var.',
      'POSTMARK_SERVER_TOKEN:', token ? '✓ set' : '✗ MISSING',
      'POSTMARK_FROM_EMAIL:', from ? '✓ set' : '✗ MISSING',
      '| To:', to, '| TemplateAlias:', templateAlias);
    return { skipped: true, reason: 'missing_env' };
  }

  try {
    const res = await fetch('https://api.postmarkapp.com/email/withTemplate', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify({
        From: from,
        To: to,
        Cc: header(cc),
        Bcc: header(bcc),
        TemplateAlias: templateAlias,
        TemplateModel: templateModel,
        MessageStream: 'outbound',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[postmark] sendTemplateEmail failed', res.status, body.slice(0, 200));
      return { error: `Postmark returned ${res.status}` };
    }

    const data = await res.json();
    console.log('[postmark] ✅ Template sent | MessageID:', data.MessageID, '| To:', to, '| Alias:', templateAlias);
    return { messageId: data.MessageID };
  } catch (err) {
    console.error('[postmark] sendTemplateEmail network error', err);
    return { error: err.message };
  }
}
