import { sendMasterclassPaidReceipt, sendMasterclassQuoteConfirmation as _sendQuote } from '@/lib/email/template-senders/masterclass';

export async function sendMasterclassReceipt(doc) {
  return sendMasterclassPaidReceipt(doc);
}

export async function sendMasterclassQuoteConfirmation(doc, referenceNumber) {
  return _sendQuote(doc, referenceNumber);
}
