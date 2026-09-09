# Payment Testing on Production

## Test Keys

Set these in Vercel Environment Variables (Production scope):

| Variable                       | Value                                                       |
| ------------------------------ | ----------------------------------------------------------- |
| `OMISE_SECRET_KEY`             | `skey_test_…`                                               |
| `NEXT_PUBLIC_OMISE_PUBLIC_KEY` | `pkey_test_…`                                               |
| `OMISE_PUBLIC_KEY`             | `pkey_test_…`                                               |
| `OMISE_WEBHOOK_SECRET`         | (set a value, must match Omise dashboard webhook config)    |
| `PAYMENT_TEST_MODE`            | `true` (set ONLY during active test sessions; remove after) |

## Omise Dashboard Webhook Setup

1. Go to https://dashboard.omise.co → Settings → Webhooks
2. ONE webhook endpoint:
   - `https://www.9experttraining.com/api/webhooks/omise?key=<OMISE_WEBHOOK_SECRET>`

   > Note: Replace `<OMISE_WEBHOOK_SECRET>` with the actual value set in Vercel env vars.
   > Do NOT paste the placeholder text literally.

   > **DO NOT re-add a second endpoint on `genesis-lab.9expert.app`.** This step
   > used to list one, from when that preview domain was where the app lived. It
   > is redundant: production above is endpoint #1 and receives every
   > `charge.complete` directly, so the preview endpoint bought nothing and sent
   > payment traffic to an origin that is off the site's consent and analytics
   > cookies. As of round ORIGIN-1 (2026-09-09) that domain is a redirect to
   > production. If one is still registered in the Omise dashboard from an
   > earlier setup, delete it there — this file cannot remove it for you.

3. Enable events: `charge.complete`
4. Note: Omise test-mode webhooks only fire for test-mode charges — same keys must be active on both ends.

## PromptPay QR Test Flow

- Test PromptPay charges stay in `pending` status — the QR will appear but
  Omise will NOT auto-complete the charge in test mode.
- Use the `/api/registration/public/dev-mark-paid` endpoint (with `PAYMENT_TEST_MODE=true`)
  to simulate the webhook completing the payment:

```sh
  curl -X POST https://www.9experttraining.com/api/registration/public/dev-mark-paid \
    -H "Content-Type: application/json" \
    -d '{"id": "<registrationId from charge response>"}'
```

## Credit Card Test

Use Omise's test card numbers: https://docs.opn.ooo/api/testing

## Security Reminder

Remove `PAYMENT_TEST_MODE=true` from Vercel Production env vars after testing.
The endpoint returns 403 when the var is absent or not exactly `"true"`.
