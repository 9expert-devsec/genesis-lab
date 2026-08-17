/**
 * Card input helpers — brand detection, display formatting and validation.
 *
 * Moved verbatim out of RegisterWizard / MasterclassRegisterClient, which
 * each carried an identical private copy. Pure functions only, so this
 * module stays importable from the server and from tests.
 */

export function detectCardBrand(num) {
  const n = (num || "").replace(/\D/g, "");
  if (/^3[47]/.test(n)) return "amex";
  if (/^35/.test(n)) return "jcb";
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(n))
    return "mastercard";
  return "unknown";
}

export function formatCardNumber(value, brand) {
  const max = brand === "amex" ? 15 : 16;
  const digits = (value || "").replace(/\D/g, "").slice(0, max);
  if (brand === "amex") {
    return digits.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(" "),
    );
  }
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export function formatExpiry(value) {
  const d = (value || "").replace(/\D/g, "").slice(0, 4);
  return d.length <= 2 ? d : d.slice(0, 2) + "/" + d.slice(2);
}

export function expiryValid(mmYY) {
  const m = (mmYY || "").match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const mm = Number(m[1]);
  const yy = 2000 + Number(m[2]);
  if (mm < 1 || mm > 12) return false;
  return new Date(yy, mm, 0, 23, 59, 59) >= new Date();
}

export function cvcMax(brand) {
  return brand === "amex" ? 4 : 3;
}

export function cardNumberValid(num, brand) {
  const n = (num || "").replace(/\D/g, "");
  return brand === "amex" ? n.length === 15 : n.length >= 16;
}

export const CARD_BRAND_LABEL = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  jcb: "JCB",
  unknown: "บัตร",
};

/** Whether every card field is filled in well enough to tokenise. */
export function cardIsValid(card) {
  const brand = detectCardBrand(card?.number);
  return (
    cardNumberValid(card?.number, brand) &&
    expiryValid(card?.expiry) &&
    (card?.cvc?.length ?? 0) === cvcMax(brand) &&
    (card?.name ?? "").trim().length > 0
  );
}
