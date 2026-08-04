/**
 * The step-2 screens show ONE consent checkbox, but
 * `publicRegistrationSchema`'s superRefine rejects a card/promptpay charge
 * unless all four consent flags are true. Fan the single boolean out here so
 * the UI and the wire format can't drift apart.
 */
export function consentFanOut(accepted) {
  const v = Boolean(accepted);
  return {
    dataChecked: v,
    noRefund: v,
    changePolicy: v,
    termsAccepted: v,
  };
}
