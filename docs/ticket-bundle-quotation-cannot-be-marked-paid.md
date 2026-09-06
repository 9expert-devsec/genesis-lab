# A bundle quotation can never be marked ชำระแล้ว

**Filed** 2026-09-06, during the round that restored the request-level status
control. **Not built**, by instruction — and it is not a line of code, which is
most of the point.

## The state a bundle request can reach

A bundle request now moves รอดำเนินการ → ส่งใบเสนอราคาแล้ว, and either state
can go to ยกเลิก. It cannot go anywhere else. **ชำระแล้ว is unreachable**, and
that has always been true — the round that restored the status control did not
take it away.

## Why, in two facts that compose

**1. No admin can choose `paid`.** The public transition table is:

```
pending   → confirmed, cancelled
confirmed → cancelled
paid      → cancelled
cancelled → (terminal)
```

`paid` appears only as a FROM state. `allowedFromStates('paid')` is `[]`, which
is precisely what `isSystemSet` tests, so the screens classify it as
system-assigned and the list strip says so out loud:

> ชำระแล้ว ระบบกำหนดให้เอง เลือกเองไม่ได้

That is deliberate. `paid` means "Omise observed money arriving", and an admin
button that wrote it would be asserting a payment no charge exists for.

**2. A bundle never enters the Omise path.** From
`src/app/api/registration/bundle/route.js`:

> A quotation request, NOT a payment: Omise is not involved, `pricing` and
> `payment` stay unset, and `bundleRegistrationSchema` carries no
> `paymentMethod` or `omiseToken` at all, so there is no value a client could
> send that would put a bundle down a charge path.

`buildBundleLegs` sets neither field. So the ONE writer of `paid` — the webhook
at `src/app/api/webhooks/omise/route.js` — can never fire for a bundle leg.

Composed: the only writer cannot fire, and no other writer is permitted. The
request sits at ส่งใบเสนอราคาแล้ว permanently.

## What that costs, concretely

A customer pays against the quotation **by transfer**. The money arrives, the
courses run, and the system has nowhere to record that the request is settled.
Consequences that follow from that, not from any bug:

* the ชำระแล้ว card on /admin/registrations can never count a bundle request,
  so that number silently means "ordinary registrations that paid by card";
* an admin looking for outstanding work sees settled packages sitting in
  ส่งใบเสนอราคาแล้ว alongside genuinely outstanding ones, with nothing to tell
  them apart;
* ยกเลิก becomes the only state a finished package can be moved to, which is
  wrong in a way that would corrupt the record if anyone used it that way.

## Why this is a ruling and not a change

The obvious repair — add `confirmed → paid` to the table so an admin can set it
— **changes the ordinary registration path too**, because there is one table and
one vocabulary shared by both. Today an ordinary `paid` is a fact the system
observed. After that edit it becomes a fact an admin asserted, and no reader can
tell the two apart afterwards: not the receipt, not the dashboard, not
`pricing.seats`, not the reconciliation against Omise.

So the decision this ticket needs is not "should a bundle be markable paid" but
**what `paid` is allowed to mean**, and whether a package settled by transfer is
the same state as a card payment the system watched arrive, or a different one
that needs its own value. Both answers have consequences the round that makes
them will have to carry — a new status value touches the vocabulary, the cards,
the filters, the counts, the dashboard and the transition table; reusing `paid`
touches what every existing reader of it believes.

## Not proposed here

A hand-set `paid`, a new `settled` status, a payment-reference field, an
in-house-style off-platform flow, or a rule that bundles are excluded from the
ชำระแล้ว card. Each is plausible; none is chosen. The purpose of this ticket is
that the gap is written down as a gap, rather than being discovered by someone
wondering why a package they know was paid for is still showing as quoted.
