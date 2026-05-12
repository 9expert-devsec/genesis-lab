/**
 * Postmark REST API wrapper. Intentionally lightweight — the project
 * depends on the `postmark` npm SDK transitively but we don't import
 * it here to keep the send path obvious and side-effect-free.
 *
 * If POSTMARK_SERVER_TOKEN or POSTMARK_FROM_EMAIL is missing, logs a
 * warning and returns `{ skipped: true }` without throwing, so the
 * caller can proceed (e.g. still save the registration).
 */

export async function sendEmail({ to, bcc, subject, html, text }) {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM_EMAIL;

  if (!token || !from) {
    console.warn(
      '[postmark] Missing POSTMARK_SERVER_TOKEN or POSTMARK_FROM_EMAIL; skipping send'
    );
    return { skipped: true };
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
        Bcc: bcc || process.env.POSTMARK_ADMIN_EMAIL || undefined,
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
    return { messageId: data.MessageID };
  } catch (err) {
    console.error('[postmark] Network error', err);
    return { error: err.message };
  }
}
