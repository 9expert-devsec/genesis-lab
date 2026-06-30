// Central analytics config — GA4 + Google Ads IDs/labels live in ONE place.
// These are public client-side IDs by nature (they ship in the browser), so
// they are safe to hardcode here. If a NEXT_PUBLIC_* convention is later adopted,
// read from process.env with these as fallback defaults.

export const GA4_ID = 'G-6043WVS74D';
export const ADS_ID = 'AW-1060453366';
export const DEFAULT_CURRENCY = 'THB';

// Google Ads conversion labels (send_to = `${ADS_ID}/${label}`)
// Used in Batch 2 — defined here now so everything is in one config.
export const ADS_CONVERSION_LABELS = {
  masterclassCard:        'oNk9COrdksUcEPb31PkD',
  masterclassQr:          'GWXVCJrPqMUcEPb31PkD',
  masterclassFormSubmit:  'ZWAOCIPWqMUcEPb31PkD',
  masterclassDownload:    'bBK8CKStp8UcEPb31PkD',
  masterclassLanding:     'ToxDCI7YqMUcEPb31PkD',
};

// Helper to build a send_to string
export const adsSendTo = (label) => `${ADS_ID}/${label}`;
