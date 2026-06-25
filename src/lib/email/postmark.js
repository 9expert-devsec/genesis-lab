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
 * Merge caller-supplied bcc with the global POSTMARK_BCC_EMAILS env var.
 * POSTMARK_BCC_EMAILS is comma-separated e.g. "a@example.com, b@example.com"
 * Returns a single comma-joined string, or undefined if nothing to BCC.
 */
function buildBcc(callerBcc) {
  const envRaw = process.env.POSTMARK_BCC_EMAILS ?? '';
  const envList = envRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const callerList = callerBcc
    ? callerBcc.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const merged = [...new Set([...envList, ...callerList])];
  return merged.length > 0 ? merged.join(', ') : undefined;
}

export async function sendEmail({ to, bcc, subject, html, text }) {
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
        Bcc: buildBcc(bcc),
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

export async function sendTemplateEmail({ to, bcc, templateAlias, templateModel }) {
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
        Bcc: buildBcc(bcc),
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
