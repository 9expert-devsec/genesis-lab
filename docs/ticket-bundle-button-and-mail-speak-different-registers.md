# The bundle button says สมัคร; the confirmation says ใบเสนอราคา

**Status:** open — a product decision, not a defect.
**Filed:** 2026-09-07, from the promotion_bundle restyle round.
**Nothing here is built.** This records a wording split that is currently
deliberate, so that whoever settles it can see both halves at once.

## What each surface says

| surface | wording | file |
|---|---|---|
| the button on the promotion page | **สมัคร Bundle นี้** | `src/components/pageBuilder/sections/promotion_bundle.jsx` |
| the confirmation email's opening line | **เราได้รับคำขอใบเสนอราคาสำหรับ "…"** | `src/lib/email/templates/registration-bundle-user.js` |
| the email subject (fallback path) | **ได้รับคำขอใบเสนอราคา …** | same file |
| the page's closed-state message | `BUNDLE_CLOSED_MESSAGE` | `src/lib/pageBuilder/bundleRegistration.js` |

A visitor presses a button that says *register* and receives mail that says
*we have received your request for a quotation*.

## Why it is like this

The button was `ขอใบเสนอราคาแพ็กเกจนี้` and was changed to `สมัคร Bundle นี้` in
commit `d5d205ee`, deliberately and on request. The mail was explicitly out of
that round's scope and was not touched. So this is one decision half-made, not
a drift between two things that were once in step.

## What is actually true of the flow

The mail is the accurate one. `POST /api/registration/bundle` writes
`RegisterPublic` legs with **no `pricing` and no `payment`**, and
`bundleRegistrationSchema` carries no `paymentMethod` or `omiseToken` at all —
there is no value a client could send that would put a bundle down a charge
path. The sales team follows up with a quotation. Nothing about pressing that
button registers anyone for anything yet.

So the button is the surface making the larger claim.

## The decision, stated as a choice

1. **The product speaks in สมัคร.** The button is right and the mail follows —
   its opening line, its subject, and probably the success screen's wording.
   Argues that "request a quotation" is internal vocabulary and a customer
   thinks they are signing up for courses.
2. **The product speaks in ใบเสนอราคา.** The mail is right and the button goes
   back. Argues that the button should not promise an enrolment the flow does
   not perform, and that a B2B customer asking for a package price expects a
   quotation.
3. **Leave the split.** Defensible if the button is understood as "start here"
   and the mail as "here is what actually happened" — but it should then be a
   recorded choice rather than an artefact of scope.

## Where the work would land, for each

- Option 1 touches `registration-bundle-user.js` (both bodies — they are built
  from one row array and one subject string), the Postmark template once its
  alias exists, and `StepComplete`'s bundle branch.
- Option 2 touches one line in `promotion_bundle.jsx` and the test that pins it
  (`test/render/promotionBundle.test.mjs`, "the register button reads …").
- Option 3 touches nothing and closes this file.

## Related

- `POSTMARK_TEMPLATE_ALIAS_REG_BUNDLE` is unset locally, so the mail customers
  receive today is the hard-coded fallback in `registration-bundle-user.js`.
  Production is unknown from here. Whichever option is taken, the Postmark
  template — when someone creates it — has to carry the same wording, or this
  reappears the day the alias is set.
